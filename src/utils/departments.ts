const KEY = 'osteria_departments';
/** Etichetta/colore personalizzati per sala | kitchen | bar (il `value` resta invariato). */
const BUILTIN_OVERRIDES_KEY = 'osteria_department_builtin_overrides';

type BuiltinOverride = { label?: string; color?: string; hidden?: boolean };

function getBuiltinOverrides(): Record<string, BuiltinOverride> {
  try {
    const raw = localStorage.getItem(BUILTIN_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, BuiltinOverride>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveBuiltinOverrides(overrides: Record<string, BuiltinOverride>) {
  try {
    localStorage.setItem(BUILTIN_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore */
  }
}

/** Categorie predefinite: regole pausa e filtri che selezionano una di queste si applicano anche ai reparti personalizzati collegati. */
export type PermissionCategory = 'sala_bar' | 'sala' | 'kitchen' | 'bar';

export interface Department {
  value: string;
  label: string;
  color?: string;
  /** Solo reparti personalizzati: unifica con Sala / Cucina / Bar per regole pausa (e stessa logica dove usato). */
  permissionCategory?: PermissionCategory;
}

// Reparti built-in: stessi colori “pieni” della palette (bar = verde brand)
export const BUILTIN_DEPARTMENTS: Department[] = [
  { value: 'sala_bar', label: 'Sala e Bar', color: 'var(--brand)' },
  { value: 'sala',    label: 'Sala',   color: '#1976D2' },
  { value: 'bar',     label: 'Bar',    color: 'var(--brand)' },
  { value: 'kitchen', label: 'Cucina', color: '#F44336' },
];

const DEFAULT_CUSTOM_COLOR = 'var(--brand)'; // accent blue

function mergeBuiltinsWithOverrides(): Department[] {
  const ov = getBuiltinOverrides();
  return BUILTIN_DEPARTMENTS
    .filter((d) => !ov[d.value]?.hidden)
    .map((d) => ({ ...d, ...(ov[d.value] || {}) }));
}

/** Restituisce i valori dei built-in attualmente nascosti. */
export function getHiddenBuiltinValues(): string[] {
  const ov = getBuiltinOverrides();
  return BUILTIN_DEPARTMENTS.map((d) => d.value).filter((v) => ov[v]?.hidden);
}

/** Ripristina un built-in nascosto. */
export function restoreBuiltinDepartment(value: string): Department[] {
  const ov = getBuiltinOverrides();
  if (!ov[value]?.hidden) return getDepartments();
  const next = { ...ov, [value]: { ...ov[value], hidden: false } };
  saveBuiltinOverrides(next);
  return getDepartments();
}

/** Snapshot per Storage `app-config/departments.json` — allinea colori/etichette/reparti custom su tutti i dispositivi. */
export type DepartmentsCloudV1 = {
  schemaVersion: 1;
  builtinOverrides: Record<string, BuiltinOverride>;
  custom: Array<{
    value: string;
    label: string;
    color: string;
    permissionCategory?: PermissionCategory;
  }>;
};

export function parseDepartmentsCloudPayload(raw: unknown): DepartmentsCloudV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== 1) return null;
  const builtinRaw = o.builtinOverrides;
  const builtinOverrides: Record<string, BuiltinOverride> =
    builtinRaw && typeof builtinRaw === 'object' && !Array.isArray(builtinRaw)
      ? (builtinRaw as Record<string, BuiltinOverride>)
      : {};
  const customIn = o.custom;
  const custom: DepartmentsCloudV1['custom'] = [];
  if (Array.isArray(customIn)) {
    const builtinValues = new Set(BUILTIN_DEPARTMENTS.map((d) => d.value));
    for (const row of customIn) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const r = row as Record<string, unknown>;
      const value = typeof r.value === 'string' ? r.value.trim() : '';
      if (!value || builtinValues.has(value)) continue;
      const label = typeof r.label === 'string' ? r.label.trim() : '';
      const color =
        typeof r.color === 'string' && r.color.trim() ? r.color.trim() : DEFAULT_CUSTOM_COLOR;
      const pc = r.permissionCategory;
      const permissionCategory =
        pc === 'sala_bar' || pc === 'sala' || pc === 'kitchen' || pc === 'bar' ? pc : undefined;
      custom.push(
        permissionCategory
          ? { value, label: label || value, color, permissionCategory }
          : { value, label: label || value, color }
      );
    }
  }
  return { schemaVersion: 1, builtinOverrides, custom };
}

export function getDepartmentsCloudSnapshot(): DepartmentsCloudV1 {
  const builtinOverrides = { ...getBuiltinOverrides() };
  let custom: Department[] = [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) custom = parsed as Department[];
    }
  } catch {
    custom = [];
  }
  const builtinValues = new Set(BUILTIN_DEPARTMENTS.map((d) => d.value));
  const outCustom: DepartmentsCloudV1['custom'] = [];
  for (const d of custom) {
    if (!d || typeof d !== 'object' || builtinValues.has(d.value)) continue;
    const label = typeof d.label === 'string' ? d.label.trim() : '';
    const color = typeof d.color === 'string' && d.color.trim() ? d.color.trim() : DEFAULT_CUSTOM_COLOR;
    const row: DepartmentsCloudV1['custom'][number] = {
      value: d.value,
      label: label || d.value,
      color,
    };
    if (d.permissionCategory === 'sala_bar' || d.permissionCategory === 'sala' || d.permissionCategory === 'kitchen' || d.permissionCategory === 'bar') {
      row.permissionCategory = d.permissionCategory;
    }
    outCustom.push(row);
  }
  return { schemaVersion: 1, builtinOverrides, custom: outCustom };
}

/** Applica quanto scaricato da Storage: sovrascrive le chiavi locali dei reparti. */
export function applyDepartmentsCloudSnapshot(data: DepartmentsCloudV1 | null): boolean {
  if (!data || data.schemaVersion !== 1) return false;
  const builtinValues = new Set(BUILTIN_DEPARTMENTS.map((d) => d.value));
  const sanitized = (Array.isArray(data.custom) ? data.custom : []).filter(
    (d) => d && typeof d.value === 'string' && d.value.trim() && !builtinValues.has(d.value)
  );
  try {
    const ov =
      data.builtinOverrides && typeof data.builtinOverrides === 'object' && !Array.isArray(data.builtinOverrides)
        ? (data.builtinOverrides as Record<string, BuiltinOverride>)
        : {};
    saveBuiltinOverrides(ov);
    localStorage.setItem(KEY, JSON.stringify(sanitized));
  } catch {
    return false;
  }
  return true;
}

/**
 * Colori pieni Material 500 (± brand): ogni swatch è una tinta netta, senza scale chiaro/scuro.
 * Ordine approssimativo spettro + marroni + grigio.
 */
export const DEPARTMENT_COLOR_PRESETS: readonly string[] = [
  '#F44336', // rosso
  '#E91E63', // rosa / magenta
  '#FF5722', // arancione scuro
  '#FF9800', // arancione
  '#FFC107', // ambra
  '#FFEB3B', // giallo
  '#CDDC39', // lime
  '#8BC34A', // verde chiaro
  '#4CAF50', // verde
  'var(--brand)', // FLOW blue (brand)
  '#0099CC', // blue-cyan
  '#00BCD4', // ciano
  '#03A9F4', // azzurro
  '#1976D2', // blu (Material 700: testo bianco sopra ≥ AA)
  '#3F51B5', // indaco
  '#673AB7', // viola profondo
  '#9C27B0', // viola
  '#795548', // marrone
  '#6D4C41', // marrone scuro
  '#9E9E9E', // grigio (neutro definito)
];

export function getDepartments(): Department[] {
  try {
    const raw = localStorage.getItem(KEY);
    const builtin = mergeBuiltinsWithOverrides();
    if (!raw) return builtin;
    const custom = JSON.parse(raw) as Department[];
    const builtinValues = new Set(BUILTIN_DEPARTMENTS.map((d) => d.value));
    const extras = custom.filter((d) => !builtinValues.has(d.value));
    return [...builtin, ...extras];
  } catch {
    return mergeBuiltinsWithOverrides();
  }
}

/** Returns the hex color for a department value. */
export function getDeptColor(value: string): string {
  const dept = getDepartments().find((d) => d.value === value);
  return dept?.color ?? DEFAULT_CUSTOM_COLOR;
}

/**
 * Restituisce una variante del colore pieno abbastanza scura perché il testo
 * bianco sopra rispetti il contrasto AA (≥4.5:1). I colori già scuri (o i token
 * `var(--brand)`) restano invariati.
 */
export function ensureWhiteTextContrast(color: string | null | undefined): string {
  const c = color ?? DEFAULT_CUSTOM_COLOR;
  if (!c.startsWith('#') || c.length < 7) return c;
  const hex = c.slice(1, 7);
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return c;
  const num = parseInt(hex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const TARGET = 0.17; // → bianco sopra ≈ 4.8:1
  if (L <= TARGET) return c;
  const k = TARGET / L;
  const scale = (v: number) => Math.min(255, Math.round(v * k));
  const to2 = (v: number) => v.toString(16).padStart(2, '0');
  return `#${to2(scale(r))}${to2(scale(g))}${to2(scale(b))}`;
}

export function addDepartment(
  label: string,
  color?: string,
  permissionCategory?: PermissionCategory
): Department[] {
  const value = label.trim().toLowerCase().replace(/\s+/g, '_');
  const current = getDepartments();
  if (current.some((d) => d.value === value)) return current;
  const row: Department = {
    value,
    label: label.trim(),
    color: color ?? DEFAULT_CUSTOM_COLOR,
    ...(permissionCategory ? { permissionCategory } : {}),
  };
  const all = [...current, row];
  saveCustomDepartments(all);
  return all;
}

export function removeDepartment(value: string): Department[] {
  const builtinValues = new Set(BUILTIN_DEPARTMENTS.map((d) => d.value));
  if (builtinValues.has(value)) {
    // Per i built-in: nasconde tramite override (non rimuove il codice fisso)
    const ov = { ...getBuiltinOverrides(), [value]: { ...getBuiltinOverrides()[value], hidden: true } };
    saveBuiltinOverrides(ov);
    return getDepartments();
  }
  const all = getDepartments().filter((d) => d.value !== value);
  saveCustomDepartments(all);
  return all;
}

/** Chiavi con cui confrontare il reparto utente vs `rule.departments` (valore proprio + categoria se impostata). */
export function getDeptPermissionMatchKeys(deptValue: string | null | undefined): string[] {
  if (!deptValue) return [];
  const list = getDepartments();
  const d = list.find((x) => x.value === deptValue);
  if (!d) return [deptValue];
  const builtinValues = new Set(BUILTIN_DEPARTMENTS.map((b) => b.value));
  if (builtinValues.has(d.value)) return [d.value];
  if (d.permissionCategory) return [d.value, d.permissionCategory];
  return [d.value];
}

/**
 * Verifica se il reparto di un utente rientra nel filterKey scelto nel filtro,
 * tenendo conto della permissionCategory per reparti custom.
 *
 * Esempi:
 *   filterKey='kitchen', userDept='cucina_2' (permissionCategory:'kitchen') → true
 *   filterKey='sala_bar', userDept='sala'                                     → true
 *   filterKey='sala_bar', userDept='mio_rep' (permissionCategory:'sala')      → true
 */
export function deptMatchesFilterKey(
  userDept: string | null | undefined,
  filterKey: string
): boolean {
  if (!userDept || !filterKey) return false;

  // Corrispondenza diretta
  if (userDept === filterKey) return true;

  // sala_bar aggruppa i built-in sala e bar
  if (filterKey === 'sala_bar' && (userDept === 'sala' || userDept === 'bar')) return true;

  // Controlla le match-keys del reparto (include permissionCategory se presente)
  const matchKeys = getDeptPermissionMatchKeys(userDept);
  if (matchKeys.includes(filterKey)) return true;

  // Se il filtro è sala_bar verifica anche le categorie sala/bar
  if (filterKey === 'sala_bar') {
    if (matchKeys.includes('sala') || matchKeys.includes('bar')) return true;
  }

  return false;
}

/** Reparto utente soddisfa il filtro reparti della regola pausa? */
export function departmentMatchesBreakRuleDepartments(
  userDept: string | null | undefined,
  ruleDepts: string[]
): boolean {
  if (!ruleDepts.length) return true;
  /* Utente senza reparto: matcha sempre (admin/manager senza reparto non devono essere esclusi). */
  if (!userDept) return true;
  const keys = getDeptPermissionMatchKeys(userDept);
  return keys.some((k) => ruleDepts.includes(k));
}

/**
 * Aggiorna reparto (`value` invariato).
 * Built-in: salva solo etichetta/colore in override locale (codice sala/kitchen/bar fisso).
 * Custom: `permissionCategory` opzionale; assente = non modificare la categoria.
 */
export function updateDepartment(
  value: string,
  updates: { label: string; color: string; permissionCategory?: PermissionCategory | '' }
): Department[] {
  const builtinValues = new Set(BUILTIN_DEPARTMENTS.map((d) => d.value));
  const label = updates.label.trim();
  if (!label) return getDepartments();
  const color = updates.color.trim() || DEFAULT_CUSTOM_COLOR;

  if (builtinValues.has(value)) {
    const overrides = { ...getBuiltinOverrides(), [value]: { label, color } };
    saveBuiltinOverrides(overrides);
    return getDepartments();
  }

  const current = getDepartments();
  if (!current.some((d) => d.value === value)) return current;
  const next = current.map((d) => {
    if (d.value !== value) return d;
    const nextRow: Department = { ...d, label, color };
    if ('permissionCategory' in updates) {
      if (updates.permissionCategory) {
        nextRow.permissionCategory = updates.permissionCategory;
      } else {
        delete nextRow.permissionCategory;
      }
    }
    return nextRow;
  });
  saveCustomDepartments(next);
  return next;
}

function saveCustomDepartments(all: Department[]) {
  try {
    const builtinValues = new Set(BUILTIN_DEPARTMENTS.map((d) => d.value));
    const custom = all.filter((d) => !builtinValues.has(d.value));
    localStorage.setItem(KEY, JSON.stringify(custom));
  } catch { /* ignore */ }
}
