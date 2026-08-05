import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Tenant } from '../types';

// ── Types ───────────────────────────────────────────────────────────────────
interface ParsedRow {
  rawName: string;
  userId: string | null;
  userName: string | null;
  date: string;
  startTime: string;
  endTime: string;
}
interface ImportResult {
  ok: number;
  duplicateInFile: number;
  alreadyInDb: number;
  skipped: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseWeekGridSemicolon(
  text: string,
  matchUser: (name: string) => { id: string; first_name: string; last_name?: string } | null,
): ParsedRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headerMatch = lines[0].match(/^DATA:\s*(\d{2})\/(\d{2})\/(\d{4}|\d{2})\s*(.*)/i);
  if (!headerMatch) return [];
  const day = parseInt(headerMatch[1], 10);
  const month = parseInt(headerMatch[2], 10) - 1;
  let year = parseInt(headerMatch[3], 10);
  if (year < 100) year += 2000;
  const weekStart = new Date(year, month, day);
  const dateByIndex: Record<number, string> = {};
  const rest = headerMatch[4] ?? '';
  const dayHeaders = rest.match(/[A-Z]+\s+\d+/g) ?? [];
  dayHeaders.forEach((dh, idx) => {
    const dayNum = parseInt(dh.replace(/[A-Z]+\s*/, ''), 10);
    if (!isNaN(dayNum)) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + idx);
      dateByIndex[dayNum] = toYmd(d);
    }
  });
  const rows: ParsedRow[] = [];
  let currentName = '';
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line) continue;
    const parts = line.split(';').map((s) => s.trim());
    if (parts.length < 2) continue;
    const first = parts[0].toUpperCase();
    if (/^[A-ZÀ-Ž\s]{2,}$/.test(parts[0].replace(/\s+/g, '')) && !first.startsWith('TOT')) {
      currentName = parts[0];
    }
    if (!currentName) continue;
    const user = matchUser(currentName);
    for (let ci = 0; ci < parts.length; ci++) {
      const cell = parts[ci].trim();
      if (!cell) continue;
      const timeMatch = cell.match(/^(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})$/);
      if (timeMatch) {
        const ymd = dateByIndex[ci];
        if (ymd) {
          rows.push({
            rawName: currentName,
            userId: user?.id ?? null,
            userName: user ? `${user.first_name} ${user.last_name ?? ''}`.trim() : null,
            date: ymd,
            startTime: timeMatch[1].replace('.', ':'),
            endTime: timeMatch[2].replace('.', ':'),
          });
        }
      }
    }
  }
  return rows;
}

function parseSingleLineCsv(
  text: string,
  matchUser: (name: string) => { id: string; first_name: string; last_name?: string } | null,
): ParsedRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const rows: ParsedRow[] = [];
  for (const line of lines) {
    const parts = line.split(',').map((s) => s.trim());
    if (parts.length < 4) continue;
    const rawName = parts[0];
    const rawDate = parts[1];
    const rawStart = parts[2];
    const rawEnd = parts[3];
    const dateParts = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4}|\d{2})$/);
    if (!dateParts) continue;
    let y = parseInt(dateParts[3], 10);
    if (y < 100) y += 2000;
    const ymd = `${y}-${String(dateParts[1]).padStart(2, '0')}-${String(dateParts[2]).padStart(2, '0')}`;
    const user = matchUser(rawName);
    rows.push({
      rawName,
      userId: user?.id ?? null,
      userName: user ? `${user.first_name} ${user.last_name ?? ''}`.trim() : null,
      date: ymd,
      startTime: rawStart,
      endTime: rawEnd,
    });
  }
  return rows;
}

// ── Component ───────────────────────────────────────────────────────────────
export default function ImportStorico({ tenants, onClose }: { tenants: Tenant[]; onClose: () => void }) {
  const [selectedTenantId, setSelectedTenantId] = useState(tenants[0]?.id ?? '');
  const [tenantUsers, setTenantUsers] = useState<{ id: string; first_name: string; last_name?: string }[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const matched = rows.filter((r) => r.userId);
  const unmatched = rows.filter((r) => !r.userId);
  const uniqueUnmatched = [...new Set(unmatched.map((r) => r.rawName))];
  const canImport = matched.length > 0;

  // Load users for selected tenant
  useEffect(() => {
    if (!selectedTenantId) { setTenantUsers([]); return; }
    (async () => {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .eq('tenant_id', selectedTenantId);
      if (error) { console.error(error); setTenantUsers([]); return; }
      setTenantUsers(data ?? []);
    })();
  }, [selectedTenantId]);

  const matchUser = (name: string) => {
    const upper = name.toUpperCase().trim();
    return tenantUsers.find((u) => {
      const full = `${u.first_name} ${u.last_name ?? ''}`.toUpperCase().trim();
      return full === upper || u.first_name.toUpperCase() === upper;
    }) ?? null;
  };

  const downloadTemplate = () => {
    const csv = `Nome,Data,Inizio,Fine\nGUSTAVO,29/01/2026,10:00,16:00`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_importo_turni.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const _parseTime = (raw: string): string | null => {
    const m = raw.match(/^(\d{1,2})[:.](\d{2})$/);
    if (!m) return null;
    return `${String(parseInt(m[1], 10)).padStart(2, '0')}:${m[2]}`;
  };

  const handleFile = (file: File) => {
    setParseError('');
    setImportResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? '';
      if (!text.trim()) { setParseError('File vuoto.'); return; }
      // Try format A (semicolon grid)
      let parsed = parseWeekGridSemicolon(text, matchUser);
      if (parsed.length === 0) {
        // Try format B (single-line CSV)
        parsed = parseSingleLineCsv(text, matchUser);
      }
      if (parsed.length === 0) {
        setParseError('Nessun turno riconosciuto. Verifica il formato.');
        return;
      }
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!canImport || !selectedTenantId) return;
    setImporting(true);
    try {
      const toInsert = rows
        .filter((r) => r.userId)
        .map((r) => ({
          tenant_id: selectedTenantId,
          user_id: r.userId!,
          date: r.date,
          start_time: r.startTime,
          end_time: r.endTime,
        }));
      // Deduplicate in-file
      const seen = new Set<string>();
      const unique: typeof toInsert = [];
      let duplicateInFile = 0;
      for (const row of toInsert) {
        const key = `${row.user_id}|${row.date}|${row.start_time}|${row.end_time}`;
        if (seen.has(key)) { duplicateInFile++; continue; }
        seen.add(key);
        unique.push(row);
      }
      // Check existing in DB
      if (!supabase) return;
      const { data: existing } = await supabase
        .from('shifts')
        .select('user_id, date, start_time, end_time')
        .eq('tenant_id', selectedTenantId);
      const existingSet = new Set(
        (existing ?? []).map((s) => `${s.user_id}|${s.date}|${s.start_time}|${s.end_time}`),
      );
      const final: typeof toInsert = [];
      let alreadyInDb = 0;
      for (const row of unique) {
        const key = `${row.user_id}|${row.date}|${row.start_time}|${row.end_time}`;
        if (existingSet.has(key)) { alreadyInDb++; continue; }
        final.push(row);
      }
      if (final.length === 0) {
        setImportResult({ ok: 0, duplicateInFile, alreadyInDb, skipped: uniqueUnmatched });
        setImporting(false);
        return;
      }
      const { error } = await supabase!.from('shifts').insert(final);
      if (error) throw error;
      setImportResult({ ok: final.length, duplicateInFile, alreadyInDb, skipped: uniqueUnmatched });
    } catch (err) {
      console.error(err);
      setParseError('Errore durante l\'importazione.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white/90">Importa turni storici</h3>
<button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <select
          id="sa-import-tenant"
          value={selectedTenantId}
          onChange={(e) => { setSelectedTenantId(e.target.value); setRows([]); setImportResult(null); }}
          className="rounded-xl border border-neutral-500 bg-white/5 px-3 py-2 text-xs text-white/80"
        >
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        <button onClick={() => fileRef.current?.click()}
          className="rounded-xl border border-neutral-500 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10">
          {fileName ? fileName.slice(0, 22) + (fileName.length > 22 ? '…' : '') : 'Carica CSV'}
        </button>
        <button onClick={downloadTemplate}
className="rounded-xl border border-neutral-500 bg-white/5 px-3 py-2 text-xs text-white/50 hover:text-white/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
          Template
        </button>
      </div>

      <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-1.5 text-[11px] text-white/60">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">Formato A — griglia settimanale (Ore dipendenti)</p>
        <p className="text-[11px]">
          Separatore <strong>;</strong>, prima riga con <code>DATA:</code> e giorni… Poi una riga per dipendente.
        </p>
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 pt-1">Formato B — una riga per turno</p>
        <code className="text-[11px] text-white/55 leading-relaxed whitespace-pre block">{`Nome,Data,Inizio,Fine\nGUSTAVO,29/01/2026,10:00,16:00`}</code>
        <p className="text-[11px] text-white/40">Virgola · Data GG/MM/AAAA · Ora HH:MM</p>
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
            {unmatched.length > 0 && <span className="px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-[11px] font-bold text-red-600">✗ Non riconosciuti: {uniqueUnmatched.join(', ')}</span>}
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
            {rows.length > 15 && <p className="text-xs text-white/50 mt-2">Mostrate le prime 15 righe. Usa la ricerca per filtrare.</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={handleImport} disabled={!canImport || importing}
className={`rounded-xl px-4 py-2 text-xs font-bold ${canImport && !importing ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-white/5 text-white/30 cursor-not-allowed'} transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]`}>
              {importing ? 'Importando…' : `Importa ${matched.length} turni`}
            </button>
            <button onClick={() => { setRows([]); setFileName(''); setImportResult(null); }}
              className="rounded-xl border border-neutral-500 px-3 py-2 text-xs text-white/50 hover:text-white/80">
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
