import { useState, useEffect, useRef } from 'react';
import { X, ChevronRight, Check, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Tenant } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedRow {
  rawName: string;
  userId: string | null;
  userName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  type: 'lunch' | 'dinner';
}

interface ImportBatch {
  adminNote: string;
  fileName: string;
  count: number;
  minDate: string;
  maxDate: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Es. `04-01-26` o `16-02-2026` nel nome file → { y, m, d } (DD-MM-YY o DD-MM-YYYY). */
function parseSundayDateFromFileName(fileName: string): { y: number; m: number; d: number } | null {
  // Prova prima formato a 4 cifre (DD-MM-YYYY), poi a 2 cifre (DD-MM-YY)
  const m4 = fileName.match(/(\d{2})-(\d{2})-(\d{4})/);
  const m2 = !m4 ? fileName.match(/(\d{2})-(\d{2})-(\d{2})(?!\d)/) : null;
  const m = m4 ?? m2;
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const yy = m4 ? parseInt(m[3], 10) : 2000 + parseInt(m[3], 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return { y: yy, m: mm, d: dd };
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * Griglia settimanale con `;` (export da planning / "Ore dipendenti"):
 * riga 1: DATA: ;MONDAY 29;;TUESDAY 30;; … ;SUNDAY 04;
 * righe successive: nome in prima colonna (o vuota = stesso dipendente), poi coppie Inizio/Fine per ogni giorno.
 * La data della domenica si ricava dal nome file (es. `04-01-26`) oppure dalla cella SUNDAY DD + anno corrente.
 */
function parseWeekGridSemicolon(
  text: string,
  fileName: string,
  matchUser: (name: string) => { id: string; first_name: string; last_name?: string } | null,
  parseTimeFn: (raw: string) => string | null
): { rows: ParsedRow[]; error: string | null } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return { rows: [], error: 'File vuoto o non valido.' };

  const headerLine = lines[0];
  const headerCells = headerLine.split(';').map((c) => c.trim());

  // Rileva il passo per giorno: se l'header ha ORE/BREAK/N.B./TOT dopo ogni coppia
  // di colonne start/end → stride 6, altrimenti formato semplice → stride 2.
  const STRIDE = headerCells.some((c) => /^(ORE|BREAK|N\.B\.|TOT\.?)$/i.test(c)) ? 6 : 2;

  const dayLabels: string[] = [];
  for (let i = 1; i < headerCells.length; i += STRIDE) {
    const cell = headerCells[i];
    if (cell && !/^(ORE|BREAK|N\.B\.|TOT\.?)$/i.test(cell)) dayLabels.push(cell);
  }
  if (dayLabels.length < 7) {
    return { rows: [], error: 'Intestazione settimanale incompleta: servono 7 giorni (Lun–Dom) nella prima riga.' };
  }

  const fnDate = parseSundayDateFromFileName(fileName);
  let monday: Date;
  if (fnDate) {
    const anyDay = new Date(fnDate.y, fnDate.m - 1, fnDate.d);
    if (Number.isNaN(anyDay.getTime())) return { rows: [], error: 'Data nel nome file non valida (usa DD-MM-YY o DD-MM-YYYY, es. 04-01-26 o 16-02-2026).' };
    // Calcola il lunedì della settimana (dow 0=Dom → -6, 1=Lun → 0, …)
    const dow = anyDay.getDay();
    const daysFromMon = dow === 0 ? 6 : dow - 1;
    monday = new Date(anyDay);
    monday.setDate(anyDay.getDate() - daysFromMon);
  } else {
    // Fallback: ricava anno dal primo label di giorno contenente il numero
    const sunCell = dayLabels[6] ?? '';
    const dm = sunCell.match(/(\d{1,2})\s*$/);
    const dNum = dm ? parseInt(dm[1], 10) : NaN;
    const monCell = dayLabels[0] ?? '';
    const dm0 = monCell.match(/(\d{1,2})\s*$/);
    const dNum0 = dm0 ? parseInt(dm0[1], 10) : NaN;
    if (!Number.isFinite(dNum) && !Number.isFinite(dNum0)) {
      return { rows: [], error: 'Aggiungi la data nel nome file (es. 16-02-2026.csv) oppure una cella MONDAY/SUNDAY GG.' };
    }
    const y = new Date().getFullYear();
    if (Number.isFinite(dNum0)) {
      monday = new Date(y, new Date().getMonth(), dNum0);
    } else {
      const sun = new Date(y, new Date().getMonth(), dNum);
      const daysFromMon = sun.getDay() === 0 ? 6 : sun.getDay() - 1;
      monday = new Date(sun);
      monday.setDate(sun.getDate() - daysFromMon);
    }
    if (Number.isNaN(monday.getTime())) return { rows: [], error: 'Impossibile ricavare la settimana.' };
  }
  const dates: string[] = [];
  for (let d = 0; d < 7; d++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + d);
    dates.push(toYmd(dt));
  }

  const isTime = (s: string) => /^\d{1,2}:\d{2}$/.test(s.trim());
  const looksLikeName = (s: string) =>
    s.length > 0 && !isTime(s) && /^[A-Za-zÀ-ÿ'.\-\s]+$/i.test(s.trim());

  const parsed: ParsedRow[] = [];
  let currentEmployee = '';

  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split(';').map((c) => c.trim());
    while (cols.length < 1 + STRIDE * 7) cols.push('');

    if (looksLikeName(cols[0])) {
      currentEmployee = cols[0].toUpperCase().trim();
    }
    if (!currentEmployee) continue;

    for (let d = 0; d < 7; d++) {
      const rawStart = cols[1 + STRIDE * d];
      const rawEnd = cols[2 + STRIDE * d];
      if (!rawStart || !rawEnd) continue;
      if (!isTime(rawStart) || !isTime(rawEnd)) continue;
      const startTime = parseTimeFn(rawStart);
      const endTime = parseTimeFn(rawEnd);
      if (!startTime || !endTime) continue;
      const matched = matchUser(currentEmployee);
      parsed.push({
        rawName: currentEmployee,
        userId: matched?.id ?? null,
        userName: matched ? `${matched.first_name} ${matched.last_name ?? ''}`.trim() : null,
        date: dates[d]!,
        startTime,
        endTime,
        type: startTime < '15:00' ? 'lunch' : 'dinner',
      });
    }
  }

  if (parsed.length === 0) {
    return { rows: [], error: 'Nessun turno letto: controlla orari HH:MM e nomi dipendenti.' };
  }
  return { rows: parsed, error: null };
}

// ---------------------------------------------------------------------------
// ImportStorico
// ---------------------------------------------------------------------------

export default function ImportStorico({ tenants, onClose }: { tenants: Tenant[]; onClose: () => void }) {
  const [selectedTenantId, setSelectedTenantId] = useState(tenants[0]?.id ?? '');
  const [tenantUsers, setTenantUsers] = useState<{ id: string; first_name: string; last_name?: string }[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    ok: number;
    skipped: string[];
    duplicateInFile?: number;
    alreadyInDb?: number;
  } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [importHistory, setImportHistory] = useState<ImportBatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadHistory = async (tenantId: string) => {
    if (!supabase || !tenantId) return;
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('admin_note,date')
        .eq('tenant_id', tenantId)
        
        .not('admin_note', 'is', null)
        .order('date', { ascending: false });
      // Se la colonna admin_note non esiste ancora (400), mostriamo lista vuota silenziosamente
      if (error) { setImportHistory([]); return; }
      if (!data) return;
      const map = new Map<string, { count: number; minDate: string; maxDate: string }>();
      for (const row of data as { admin_note: string; date: string }[]) {
        const key = row.admin_note;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, { count: 1, minDate: row.date, maxDate: row.date });
        } else {
          existing.count++;
          if (row.date < existing.minDate) existing.minDate = row.date;
          if (row.date > existing.maxDate) existing.maxDate = row.date;
        }
      }
      const batches: ImportBatch[] = [];
      map.forEach((v, k) => {
        const label = k.startsWith('import:') ? k.slice(7) : k;
        batches.push({ adminNote: k, fileName: label, count: v.count, minDate: v.minDate, maxDate: v.maxDate });
      });
      batches.sort((a, b) => b.maxDate.localeCompare(a.maxDate));
      setImportHistory(batches);
    } catch {
      setImportHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteImportBatch = async (adminNote: string) => {
    if (!supabase || !selectedTenantId) return;
    setDeletingBatch(adminNote);
    try {
      const { error } = await supabase
        .from('shifts')
        .delete()
        .eq('tenant_id', selectedTenantId)
        
        .eq('admin_note', adminNote);
      if (error) throw error;
      setImportHistory((prev) => prev.filter((b) => b.adminNote !== adminNote));
      setConfirmDelete(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore eliminazione');
    } finally {
      setDeletingBatch(null);
    }
  };

  useEffect(() => {
    if (!supabase || !selectedTenantId) return;
    void (async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('id,first_name,last_name')
          .eq('tenant_id', selectedTenantId)
          .eq('status', 'active');
        setTenantUsers((data ?? []) as { id: string; first_name: string; last_name?: string }[]);
      } catch (err) {
        console.error('[SuperAdminPanel] users fetch error', err);
      }
    })();
    void loadHistory(selectedTenantId);
  }, [selectedTenantId]);

  const matchUser = (name: string) => {
    const n = name.trim().toLowerCase();
    return tenantUsers.find((u) => {
      const full = `${u.first_name} ${u.last_name ?? ''}`.trim().toLowerCase();
      return full === n || u.first_name.toLowerCase() === n;
    }) ?? null;
  };

  const downloadTemplate = () => {
    const csv = 'Nome,Data,Inizio,Fine\nGUSTAVO,29/01/2026,10:00,16:00\nGUSTAVO,29/01/2026,16:30,23:00\nALEXIS,30/01/2026,10:00,16:00\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'template_turni_storici.csv';
    a.click();
  };

  const parseDate = (raw: string): string | null => {
    const p = raw.trim().split(/[/\-.]/);
    if (p.length !== 3) return null;
    if (p[2].length === 4) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
    if (p[0].length === 4) return `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`;
    return null;
  };

  const parseTime = (raw: string): string | null => {
    const t = raw.trim();
    return /^\d{1,2}:\d{2}$/.test(t) ? t.padStart(5, '0') : null;
  };

  const handleFile = (file: File) => {
    setParseError(null); setRows([]); setImportResult(null); setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? '';
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) { setParseError('File vuoto o non valido.'); return; }

      const firstLine = lines[0] ?? '';
      const isWeekGrid =
        /DATA:|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY/i.test(firstLine) ||
        (firstLine.includes(';') && firstLine.split(';').length >= 12);

      if (isWeekGrid) {
        const grid = parseWeekGridSemicolon(text, file.name, matchUser, parseTime);
        if (grid.error) {
          setParseError(grid.error);
          setRows([]);
          return;
        }
        setRows(grid.rows);
        return;
      }

      const dataLines = lines[0].toLowerCase().includes('nome') ? lines.slice(1) : lines;
      const parsed: ParsedRow[] = [];
      const errors: string[] = [];
      dataLines.forEach((line, i) => {
        const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 4) return;
        const [rawName, rawDate, rawStart, rawEnd] = cols;
        if (!rawName || !rawDate || !rawStart || !rawEnd) return;
        const date = parseDate(rawDate);
        const startTime = parseTime(rawStart);
        const endTime = parseTime(rawEnd);
        if (!date) { errors.push(`Riga ${i + 2}: data non valida "${rawDate}"`); return; }
        if (!startTime || !endTime) { errors.push(`Riga ${i + 2}: ora non valida`); return; }
        const matched = matchUser(rawName);
        parsed.push({ rawName, userId: matched?.id ?? null, userName: matched ? `${matched.first_name} ${matched.last_name ?? ''}`.trim() : null, date, startTime, endTime, type: startTime < '15:00' ? 'lunch' : 'dinner' });
      });
      if (errors.length) setParseError(errors.slice(0, 3).join(' | '));
      setRows(parsed);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const slotKey = (r: ParsedRow) => `${r.userId}|${r.date}|${r.startTime}|${r.endTime}|${r.type}`;

  const handleImport = async () => {
    if (!supabase || !selectedTenantId) return;
    const valid = rows.filter((r) => r.userId);
    const skippedNames = [...new Set(rows.filter((r) => !r.userId).map((r) => r.rawName))];
    const uniqueParsed = [...new Map(valid.map((r) => [slotKey(r), r])).values()];
    const duplicateInFile = valid.length - uniqueParsed.length;

    if (uniqueParsed.length === 0) {
      setParseError('Nessun turno con dipendente riconosciuto.');
      return;
    }

    setImporting(true);
    try {
      const sortedDates = [...new Set(uniqueParsed.map((r) => r.date))].sort();
      const minDate = sortedDates[0]!;
      const maxDate = sortedDates[sortedDates.length - 1]!;
      const userIds = [...new Set(uniqueParsed.map((r) => r.userId!))];
      const normalizeTime = (t: string | null | undefined) => (t ?? '').trim().slice(0, 5);
      const existingKeys = new Set<string>();
      const uidChunk = 80;
      for (let u = 0; u < userIds.length; u += uidChunk) {
        const chunk = userIds.slice(u, u + uidChunk);
        const { data: existing, error: exErr } = await supabase
          .from('shifts')
          .select('user_id,date,start_time,end_time,type')
          .eq('tenant_id', selectedTenantId)
          .gte('date', minDate)
          .lte('date', maxDate)
          .in('user_id', chunk);
        if (exErr) throw exErr;
        for (const e of existing ?? []) {
          const st = normalizeTime(e.start_time);
          const en = normalizeTime(e.end_time) || st;
          existingKeys.add(`${e.user_id}|${e.date}|${st}|${en}|${e.type}`);
        }
      }

      const toInsert = uniqueParsed.filter((r) => !existingKeys.has(slotKey(r)));
      const alreadyInDb = uniqueParsed.length - toInsert.length;

      if (toInsert.length === 0) {
        setImportResult({ ok: 0, skipped: skippedNames, duplicateInFile, alreadyInDb });
        setRows([]);
        setFileName('');
        return;
      }

      const _approvedAt = new Date().toISOString();
      const importNote = `import:${fileName}`;
      const basePayload = toInsert.map((r) => ({
        tenant_id: selectedTenantId,
        user_id: r.userId!,
        date: r.date,
        start_time: r.startTime,
        end_time: r.endTime,
        type: r.type,
        approval_status: 'approved' as const,
        // approved_* fields removed

        admin_note: importNote,
      }));
      let adminNoteSupported = true;
      for (let i = 0; i < basePayload.length; i += 200) {
        const chunk = basePayload.slice(i, i + 200);
        const payload = adminNoteSupported
          ? chunk
          : chunk.map(({ admin_note: _an, ...rest }) => rest);
        const { error } = await supabase.from('shifts').insert(payload);
        if (error) {
          // Se la colonna admin_note non esiste ancora, riprova senza
          if (adminNoteSupported && (error.code === '42703' || error.message?.includes('admin_note'))) {
            adminNoteSupported = false;
            const { error: e2 } = await supabase
              .from('shifts')
              .insert(chunk.map(({ admin_note: _an, ...rest }) => rest));
            if (e2) throw e2;
          } else {
            throw error;
          }
        }
      }
      setImportResult({ ok: toInsert.length, skipped: skippedNames, duplicateInFile, alreadyInDb });
      setRows([]);
      setFileName('');
      void loadHistory(selectedTenantId);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Errore import');
    } finally {
      setImporting(false);
    }
  };

  const matched = rows.filter((r) => r.userId);
  const unmatched = [...new Set(rows.filter((r) => !r.userId).map((r) => r.rawName))];

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-50 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-amber-700">Importa turni storici</h2>
          <p className="text-[11px] text-amber-600/70 mt-0.5">
            CSV con turni passati. I nomi non riconosciuti vengono ignorati. Stesso slot (sede, data, orari, tipo) non viene duplicato se è già in tabella.
          </p>
        </div>
<button type="button" onClick={onClose} className="text-white/40 hover:text-white/80 transition p-1 active:text-white/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]" aria-label="Chiudi">
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>

      <div className="space-y-1">
        <label htmlFor="sa-import-tenant" className="text-[11px] font-semibold text-white/55 uppercase tracking-wider">Sede di destinazione</label>
        <select id="sa-import-tenant" value={selectedTenantId} onChange={(e) => { setSelectedTenantId(e.target.value); setRows([]); setImportResult(null); }}
          className="w-full rounded-xl border border-neutral-500 bg-white/8 px-3 py-2.5 text-base text-white/90 focus:outline-none focus:ring-2 focus:ring-amber-400/40">
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={downloadTemplate}
className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-500 bg-white/8 py-2.5 text-xs font-semibold text-white/55 hover:bg-white/10 hover:text-white/90 transition active:text-white/90 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
          <ChevronRight className="w-3.5 h-3.5 -rotate-90" />
          Scarica template CSV
        </button>
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-100 py-2.5 text-xs font-bold text-amber-700 hover:bg-amber-200 transition active:bg-amber-200/80">
          <ChevronRight className="w-3.5 h-3.5 rotate-90" />
          {fileName ? fileName.slice(0, 22) + (fileName.length > 22 ? '…' : '') : 'Carica CSV'}
        </button>
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      </div>

      <div className="rounded-xl bg-white/5 border border-neutral-500 p-3 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">Formato A — griglia settimanale (Ore dipendenti)</p>
        <p className="text-[11px] text-white/55 leading-snug">
          Separatore <strong>;</strong>, prima riga con <code className="text-[11px]">DATA:</code> e giorni <code className="text-[11px]">MONDAY 29;;TUESDAY 30;;</code> … Poi una riga per dipendente (nome in maiuscolo) e righe successive senza nome per altri turni nella stessa settimana.
          Includi nel <strong>nome file</strong> qualsiasi data della settimana in <strong>DD-MM-YY</strong> o <strong>DD-MM-YYYY</strong> (es. <code className="text-[11px]">04-01-26</code> o <code className="text-[11px]">16-02-2026</code>).
        </p>
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 pt-1">Formato B — una riga per turno</p>
        <code className="text-[11px] text-white/55 leading-relaxed whitespace-pre block">{`Nome,Data,Inizio,Fine\nGUSTAVO,29/01/2026,10:00,16:00`}</code>
        <p className="text-[11px] text-white/40">Virgola &nbsp;·&nbsp; Data GG/MM/AAAA &nbsp;·&nbsp; Ora HH:MM</p>
      </div>

      {parseError && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">{parseError}</div>}

      {importResult && (
        <div className={`rounded-xl border px-3 py-3 space-y-1 ${importResult.ok > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          {importResult.ok > 0 ? (
            <p className="text-sm font-bold text-emerald-700">✓ {importResult.ok} turni importati con successo!</p>
          ) : (
            <p className="text-sm font-bold text-amber-800">Nessun turno nuovo: erano già tutti presenti nel database.</p>
          )}
          {(importResult.duplicateInFile ?? 0) > 0 && (
            <p className="text-[11px] text-white/70">Righe duplicate nel file (stesso slot): {importResult.duplicateInFile}</p>
          )}
          {(importResult.alreadyInDb ?? 0) > 0 && (
            <p className="text-[11px] text-white/70">Già in tabella (stessa settimana / stesso slot): {importResult.alreadyInDb}</p>
          )}
          {importResult.skipped.length > 0 && <p className="text-[11px] text-amber-600">Ignorati (non trovati): {importResult.skipped.join(', ')}</p>}
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700">✓ {matched.length} turni pronti</span>
            {unmatched.length > 0 && <span className="px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-[11px] font-bold text-red-600">✗ Non riconosciuti: {unmatched.join(', ')}</span>}
          </div>
          <div className="rounded-xl border border-neutral-500 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead><tr className="bg-white/5 text-white/55">
                  <th className="px-3 py-2 text-left">Nome CSV</th>
                  <th className="px-3 py-2 text-left">Trovato</th>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Inizio</th>
                  <th className="px-3 py-2 text-left">Fine</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 15).map((r, i) => (
                    <tr key={i} className={r.userId ? 'text-white/80' : 'text-red-500'}>
                      <td className="px-3 py-1.5 font-mono">{r.rawName}</td>
                      <td className="px-3 py-1.5">{r.userName ?? <span className="text-red-500">non trovato</span>}</td>
                      <td className="px-3 py-1.5 font-mono">{r.date}</td>
                      <td className="px-3 py-1.5 font-mono">{r.startTime}</td>
                      <td className="px-3 py-1.5 font-mono">{r.endTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 15 && <p className="text-center text-[11px] text-white/40 py-2 border-t border-white/12">… e altri {rows.length - 15} turni</p>}
          </div>
        </div>
      )}

      {/* Pulsante importazione sempre visibile in fondo */}
      <div className="rounded-xl border border-amber-400/40 bg-white/8 p-4 space-y-3 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800/80">Importazione nel database</p>
        {rows.length === 0 && (
          <p className="text-xs text-white/70">
            Carica un CSV con il pulsante sopra: comparirà l’anteprima e potrai confermare l’import.
          </p>
        )}
        {rows.length > 0 && matched.length === 0 && (
          <p className="text-xs text-red-700">
            Nessun dipendente riconosciuto: la colonna <strong>Nome</strong> deve coincidere con il <strong>nome</strong> o <strong>nome e cognome</strong> (come in app) di un utente <strong>attivo</strong> della sede selezionata. Correggi il CSV e ricarica.
          </p>
        )}
        {rows.length > 0 && matched.length > 0 && (
          <p className="text-xs text-emerald-800">
            Pronti <strong>{matched.length}</strong> turni da scrivere in tabella <code className="text-[11px] bg-white/10 px-1 rounded">shifts</code>
            {unmatched.length > 0 && (
              <span className="text-amber-700"> · {rows.length - matched.length} righe saltate (nome non trovato)</span>
            )}
          </p>
        )}
        <button
          type="button"
          onClick={handleImport}
          disabled={importing || matched.length === 0}
className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 py-3.5 text-sm font-bold text-white transition disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-amber-500 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
        >
          <Check className="w-4 h-4 shrink-0" />
          {importing
            ? 'Importazione in corso…'
            : matched.length > 0
              ? `Importa ${matched.length} turni nel database`
              : 'Importa nel database'}
        </button>
      </div>

      {/* ── Storico importazioni ── */}
      <div className="rounded-xl border border-neutral-500 bg-white/8 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-white/5 border-b border-neutral-500">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/55">Storico importazioni</p>
          <button
            onClick={() => void loadHistory(selectedTenantId)}
            disabled={historyLoading}
            className="text-[11px] text-white/40 hover:text-white/80 transition font-semibold active:text-white/80"
          >
            {historyLoading ? 'Caricamento…' : '↺ Aggiorna'}
          </button>
        </div>

        {!historyLoading && importHistory.length === 0 && (
          <p className="text-[11px] text-white/40 px-4 py-3">Nessun file importato con tracciamento.</p>
        )}
        {historyLoading && (
          <p className="text-[11px] text-white/40 px-4 py-3">Caricamento…</p>
        )}

        {importHistory.length > 0 && (
          <div className="divide-y divide-slate-100">
            {importHistory.map((batch) => (
              <div key={batch.adminNote} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-white/80 truncate" title={batch.fileName}>
                    {batch.fileName}
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {batch.minDate === batch.maxDate
                      ? batch.minDate
                      : `${batch.minDate} → ${batch.maxDate}`}
                    {' · '}
                    <span className="font-semibold text-white/55">{batch.count} turni</span>
                  </p>
                </div>

                {confirmDelete === batch.adminNote ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-red-600 font-semibold">Eliminare {batch.count} turni?</span>
                    <button
                      onClick={() => void deleteImportBatch(batch.adminNote)}
                      disabled={deletingBatch === batch.adminNote}
                      className="rounded-lg bg-red-500 hover:bg-red-600 px-2 py-1 text-[11px] font-bold text-white transition disabled:opacity-50 active:bg-red-600/80"
                    >
                      {deletingBatch === batch.adminNote ? '…' : 'Sì, elimina'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="rounded-lg border border-neutral-500 px-2 py-1 text-[11px] font-semibold text-white/70 hover:bg-white/5 transition active:bg-white/5/80"
                    >
                      Annulla
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(batch.adminNote)}
                    className="shrink-0 flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-500 hover:bg-red-50 hover:border-red-300 transition active:bg-red-50/80"
                  >
                    <Trash2 className="w-3 h-3" />
                    Elimina
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
