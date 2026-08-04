/**
 * Accurate, geometry-based table understanding.
 *
 * Price-list PDFs encode a table: a header row names the columns and every
 * data row places its values at the SAME horizontal (x) positions as those
 * headers. pdf.js gives us each token's x-position (see `DocCell`), so instead
 * of guessing what a number means we can:
 *
 *   1. Detect the header row(s) (they contain column keywords).
 *   2. Cluster the header tokens into columns by x-position.
 *   3. Assign every data-row token to the column it sits under (nearest x).
 *
 * This is deterministic and driven by the document's own headers — e.g. for a
 * Continental list `3700` is read as the value of the "RCP" column, and `541`
 * as "GST 18%", rather than "the biggest number on the line".
 */
import type { ColumnRole, DocCell, DocPage, DocumentJson, RecordField } from '@/types';

const CODE_RE = /^\d{6,}$/;
const HEADER_WORDS =
  /\b(inch|rim|size|article|code|sku|part|item|desc|description|spec|pattern|name|price|billing|incl|prc|gst|tax|total|rcp|mrp|retail|nbp|epr|load|speed|index|hsn|qty|rate|amount|mfg|net|list|discount)\b/i;

/** x-tolerance (PDF units) for treating header tokens as the same column. */
const CLUSTER_TOL = 26;

export interface TableColumn {
  key: string;
  name: string;
  /** Header x-position (left edge). */
  x: number;
  role: ColumnRole;
  kind: 'text' | 'number';
}

export interface TableSchema {
  columns: TableColumn[];
  /** The joined header text (handy for debugging / display). */
  headerText: string;
}

/** Parse a token into a price-like number, or null. Long ints are codes. */
function toNumber(token: string): number | null {
  const c = token.replace(/[₹$€£,]/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(c)) return null;
  if (!c.includes('.') && c.length > 5) return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}

/**
 * True when a line looks like a data row. A row qualifies if it has a long code
 * or at least two numbers; when `minNumbers` is relaxed to 1 (spreadsheets,
 * whose price lists often have a single price column) a single number plus a
 * descriptive text cell is enough. Header/section rows carry no numbers and are
 * therefore never mistaken for data.
 */
export function isDataRow(cells: DocCell[], minNumbers = 2): boolean {
  let numeric = 0;
  let hasCode = false;
  let textCells = 0;
  for (const c of cells) {
    if (CODE_RE.test(c.str)) hasCode = true;
    else if (toNumber(c.str) !== null) numeric++;
    else if (/[a-z]{3,}/i.test(c.str)) textCells++;
  }
  if (hasCode || numeric >= 2) return true;
  return numeric >= minNumbers && textCells >= 1;
}

function normalizeKey(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'col'
  );
}

/** Infer the business meaning of a column from its header name. */
function classify(name: string): ColumnRole {
  const l = name.toLowerCase();
  if (l.includes('index')) return 'index';
  if (l.includes('code') || l.includes('sku') || /\bart(icle)?\s*no\b/.test(l)) return 'code';
  if (
    l.includes('size') ||
    l.includes('desc') ||
    l.includes('pattern') ||
    l.includes('rim') ||
    l.includes('inch') ||
    l.includes('name') ||
    l.includes('spec')
  ) {
    return 'desc';
  }
  return 'price';
}

function nearestColumn(x: number, columns: TableColumn[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < columns.length; i++) {
    const d = Math.abs(x - columns[i].x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Assign each token to its column by x, returning one string per column. */
function assignCells(cells: DocCell[], columns: TableColumn[]): string[] {
  const out = new Array<string>(columns.length).fill('');
  for (const cell of cells) {
    const s = cell.str.trim();
    if (!s) continue;
    const i = nearestColumn(cell.x, columns);
    out[i] = out[i] ? `${out[i]} ${s}` : s;
  }
  return out;
}

interface HeaderToken {
  line: number;
  x: number;
  str: string;
}

/** Options that make schema detection more forgiving for some sources. */
export interface DetectSchemaOptions {
  /**
   * When no header row contains recognisable keywords, treat the row directly
   * above the first data row as the header anyway. Spreadsheets almost always
   * put column names in the first row even when those names are non-standard
   * (e.g. "Item", "Rate", "Selling"), so this lets those tables still be read.
   */
  assumeHeaderRow?: boolean;
  /**
   * Minimum count of price-like numbers a row needs to count as data. Defaults
   * to 2; spreadsheets pass 1 so single-price-column sheets are still parsed.
   */
  minDataNumbers?: number;
}

/** Core: build a table schema from one page's positioned rows, or null. */
function schemaFromRows(
  rows: Array<{ cells: DocCell[] }>,
  opts: DetectSchemaOptions,
): TableSchema | null {
  const minNumbers = opts.minDataNumbers ?? 2;

  // Find the first data row; the header is the keyword line(s) just above it.
  let firstData = -1;
  for (let i = 0; i < rows.length; i++) {
    if (isDataRow(rows[i].cells, minNumbers)) {
      firstData = i;
      break;
    }
  }
  if (firstData <= 0) return null;

  let headerLines = rows
    .slice(Math.max(0, firstData - 4), firstData)
    .filter((l) => HEADER_WORDS.test(l.cells.map((c) => c.str).join(' ')));
  // Fallback: no keyword header found. For forgiving sources (spreadsheets),
  // assume the row just above the first data row holds the column names.
  if (!headerLines.length && opts.assumeHeaderRow && firstData > 0) {
    headerLines = [rows[firstData - 1]];
  }
  if (!headerLines.length) return null;

  // Collect all header tokens, then cluster them into columns by x-position.
  const tokens: HeaderToken[] = [];
  headerLines.forEach((l, li) =>
    l.cells.forEach((c) => {
      const str = c.str.trim();
      if (str) tokens.push({ line: li, x: c.x, str });
    }),
  );
  if (!tokens.length) return null;
  tokens.sort((a, b) => a.x - b.x);

  const clusters: HeaderToken[][] = [];
  for (const t of tokens) {
    const last = clusters[clusters.length - 1];
    if (last && t.x - last[last.length - 1].x <= CLUSTER_TOL) last.push(t);
    else clusters.push([t]);
  }

  const columns: TableColumn[] = clusters
    .map((parts) => {
      const name = parts
        .slice()
        .sort((a, b) => a.line - b.line || a.x - b.x)
        .map((p) => p.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      const x = Math.min(...parts.map((p) => p.x));
      return { key: normalizeKey(name), name, x, role: classify(name), kind: 'text' as const };
    })
    .filter((c) => /[a-z0-9]/i.test(c.name));
  if (columns.length < 2) return null;

  // Decide each column's data kind by sampling real data rows.
  const sample = rows.slice(firstData, firstData + 20).filter((l) => isDataRow(l.cells, minNumbers));
  const numeric = new Array(columns.length).fill(0);
  const total = new Array(columns.length).fill(0);
  for (const row of sample) {
    assignCells(row.cells, columns).forEach((val, i) => {
      if (!val) return;
      total[i]++;
      if (toNumber(val) !== null) numeric[i]++;
    });
  }
  columns.forEach((c, i) => {
    if (total[i] > 0 && numeric[i] / total[i] >= 0.6) c.kind = 'number';
  });

  return { columns, headerText: columns.map((c) => c.name).join(' | ') };
}

/** Detect the table schema for a single page / sheet, or null. */
export function detectPageSchema(page: DocPage, opts: DetectSchemaOptions = {}): TableSchema | null {
  const rows = page.lines.filter((l): l is typeof l & { cells: DocCell[] } => !!l.cells?.length);
  if (rows.length < 2) return null;
  return schemaFromRows(rows, opts);
}

/**
 * Detect a document-wide schema from the first page that has a usable header.
 * Used as a fallback for pages that carry data but repeat no header (e.g. later
 * pages of a multi-page PDF price list).
 */
export function detectSchema(
  json: DocumentJson,
  opts: DetectSchemaOptions = {},
): TableSchema | null {
  for (const page of json.pages) {
    const schema = detectPageSchema(page, opts);
    if (schema) return schema;
  }
  return null;
}

/** Map one data row's tokens to named fields using the detected schema. */
export function mapRowToFields(cells: DocCell[], schema: TableSchema): RecordField[] {
  const values = assignCells(cells, schema.columns);
  return schema.columns.map((c, i) => {
    const raw = values[i] ?? '';
    if (c.kind === 'number') {
      const n = toNumber(raw);
      return { key: c.key, name: c.name, role: c.role, kind: c.kind, value: n !== null ? n : raw || null };
    }
    return { key: c.key, name: c.name, role: c.role, kind: c.kind, value: raw || null };
  });
}

/**
 * Choose the row's headline price from its fields: prefer a consumer/retail or
 * total column, otherwise the right-most price column.
 */
export function headlinePrice(fields: RecordField[]): number | null {
  const prices = fields.filter(
    (f): f is RecordField & { value: number } => f.role === 'price' && typeof f.value === 'number',
  );
  if (!prices.length) return null;
  const byName = (re: RegExp) => prices.find((f) => re.test(f.name.toLowerCase()));
  const pick = byName(/rcp|mrp|retail/) || byName(/total/) || prices[prices.length - 1];
  return pick.value;
}

/** All price columns on a row, in left→right order. */
function priceFields(fields: RecordField[]): Array<RecordField & { value: number }> {
  return fields.filter(
    (f): f is RecordField & { value: number } => f.role === 'price' && typeof f.value === 'number',
  );
}

/**
 * Dealer price — the total billing amount incl. GST that the dealer actually
 * pays. Detected from the column header: a "total" billing column, or a column
 * that spells out the GST-inclusive sum (e.g. Kelly's "NBP+EPR+GST"), or an
 * explicitly named dealer/DP/net-billing column.
 */
export function dealerPrice(fields: RecordField[]): number | null {
  const prices = priceFields(fields);
  if (!prices.length) return null;
  const byName = (re: RegExp) => prices.find((f) => re.test(f.name.toLowerCase()));
  const pick =
    byName(/total/) ||
    byName(/nbp\s*\+\s*epr\s*\+\s*gst|incl\.?\s*gst|\bgst\s*\)/) ||
    byName(/per\s*set|net\s*(?:price|bill)|\bn\.?d\.?p\b|nett|dealer|\bdp\b/) ||
    byName(/billing|\brate\b/) ||
    null;
  return pick ? pick.value : null;
}

/**
 * Recommended customer price (RCP / MRP / retail / list price). Null when the
 * document publishes no customer-facing price (e.g. dealer-only lists).
 */
export function retailPrice(fields: RecordField[]): number | null {
  const prices = priceFields(fields);
  if (!prices.length) return null;
  const byName = (re: RegExp) => prices.find((f) => re.test(f.name.toLowerCase()));
  const pick =
    byName(/\brcp\b|\bmrp\b|retail|recommend|customer|list\s*price/) ||
    byName(/inclusive|incl\.?\s*of\s*gst/) ||
    null;
  return pick ? pick.value : null;
}

/* --------------------------------------------------------------------------
 * Tyre size & pattern
 *
 * SIZE is a universal ISO/ETRTO code (e.g. 145/80R13): section width / aspect
 * ratio / construction / rim diameter. It means the same physical tyre for
 * every brand, so it lets the same size be compared across manufacturers.
 *
 * PATTERN is the tread-design/model code (e.g. CC6, UC6, VFM1). It is
 * brand-owned — each manufacturer invents its own names — so it can never be
 * matched from a fixed list. Instead we identify it by ROLE and SHAPE:
 *   1. If the document names a "Pattern" column, use it (Kelly).
 *   2. Otherwise strip everything we can identify with strict rules from the
 *      size/article cell — the size, the load+speed code and junk — and the
 *      short letters-first code that survives is the pattern (Continental).
 * ------------------------------------------------------------------------ */

/**
 * ISO / ETRTO tyre-size code with an aspect ratio, e.g. `145/80R13`,
 * `205/55ZR16`, `295/95D20`, `80/100-17`. Shape: width `/` aspect `construction`
 * rim. The construction letter may be `R` (radial), `ZR`, `D` (diagonal/bias
 * belted), `B` or a bare `-` (bias), and any part may carry a decimal
 * (`12.5/80-18`, `275/80R22.5`). The aspect allows three digits so wide
 * motorcycle sizes like `80/100-17` and `110/90-17` are matched.
 */
const SIZE_RE = /(\d{2,3}(?:\.\d)?)\s*\/\s*(\d{2,3}(?:\.\d)?)\s*(Z?R|D|B|-)\s*(\d{2}(?:\.\d)?)/i;
/**
 * The same size written with SPACES instead of a slash, e.g. Bridgestone's
 * `155 65 R12` / `155 65 R 12`. Shape: 3-digit width, 2–3-digit aspect, then the
 * construction letter and rim.
 */
const SIZE_SPACED_RE = /\b(\d{3})\s+(\d{2,3})\s+(Z?R|D|B)\s*(\d{2}(?:\.\d)?)\b/i;
/**
 * Bias / OTR / radial / diagonal sizes that omit the "/aspect" part, e.g.
 * `12.00-24`, `7.50-16`, `4.00-8`, `2.75-17` (bias); `10.00 R20`, `165 R14`,
 * `11R22.5`, `195R15C` (radial); and `165 D14`, `165 D 12` (diagonal). Shape:
 * width, then `-` / `R` / `D` / `B`, then the rim. A trailing letter such as the
 * `C` in `195R15C` is allowed (and dropped).
 */
const SIZE_ALT_RE = /\b(\d{1,3}(?:\.\d{1,2})?)\s*([RDB-])\s*(\d{1,2}(?:\.\d)?)(?![\d.])/i;

/** Global copies used to strip every size occurrence from a pattern cell. */
const SIZE_RE_G = new RegExp(SIZE_RE.source, 'gi');
const SIZE_SPACED_RE_G = new RegExp(SIZE_SPACED_RE.source, 'gi');
const SIZE_ALT_RE_G = new RegExp(SIZE_ALT_RE.source, 'gi');

/**
 * Load index + speed symbol travelling together, digits-first, e.g. `75T`,
 * `86 H`, `100S`, and the dual-load truck form `152/148J`.
 */
const LOAD_SPEED_RE = /\b\d{2,3}(?:\/\d{2,3})?\s?[A-Z]{1,2}\b/g;
/** Header names that explicitly hold the tread pattern. */
const PATTERN_NAME_RE = /pattern|tread|design|model|variant|series/i;
/** A pattern code: letters first, then an optional short number, e.g. `CC6`, `VFM1`, `PC5`, `UC2`, `C5`. */
const PATTERN_TOKEN_RE = /^[A-Z]{1,4}-?\d{1,2}$/;
/** A family/range word: pure letters, e.g. `COMC`, `ULTC`, `AXX`. */
const FAMILY_TOKEN_RE = /^[A-Z]{2,5}$/;
/** Words that are never part of a tread-name (fitment / marketing / spec noise). */
const PATTERN_NOISE_RE = /^(FR|XL|PLY|SET|EMBEDDED|RADIAL|BIAS|DOM|SV|LV|PR)$/;

/** Normalise a slashed size match to a compact, comparable form (`145/80R13`). */
function normalizeSize(m: RegExpExecArray): string {
  return `${m[1]}/${m[2]}${m[3].toUpperCase()}${m[4]}`.replace(/\s+/g, '');
}

/** Extract the ISO tyre size from a free-text string, or null. */
export function extractSize(text: string): string | null {
  // Preferred, universal form first: width/aspect + rim (e.g. `145/80R13`).
  const m = SIZE_RE.exec(text);
  if (m) return normalizeSize(m);
  // Space-separated aspect (Bridgestone `155 65 R12`) → `155/65R12`.
  const sp = SIZE_SPACED_RE.exec(text);
  if (sp) return `${sp[1]}/${sp[2]}${sp[3].toUpperCase()}${sp[4]}`.replace(/\s+/g, '');
  // Bias / OTR / radial / diagonal without aspect (e.g. `12.00-24`, `10.00 R20`,
  // `165 D14`). Guard the rim to a real tyre-rim diameter (8"–63") and the width
  // to ≥2" so a stray dash — a grade suffix like `-D`, a code like `L-3`, or a
  // date like `01-06` — is never mistaken for a size.
  const a = SIZE_ALT_RE.exec(text);
  if (a) {
    const rim = parseFloat(a[3]);
    const width = parseFloat(a[1]);
    if (rim >= 8 && rim <= 63 && width >= 2) {
      const u = a[2].toUpperCase();
      const sep = u === 'R' || u === 'D' || u === 'B' ? u : '-';
      return `${a[1]}${sep}${a[3]}`.replace(/\s+/g, '');
    }
  }
  return null;
}

/**
 * Extract the tread pattern from a free-text/combined cell. Strategy:
 *   1. Strip everything we can identify — every size form, the ply rating
 *      (`16PR`), the load+speed code (`151F`, `152/148J`), grade suffixes
 *      (`-D`, `-K`), tube-type words (`TL`/`TT`/`TTF`) and junk (`#`, `_`).
 *   2. If a short letters-first code with a digit survives (Continental `CC6`,
 *      `UC6`, `PC6`), that IS the pattern.
 *   3. Otherwise the descriptive words that remain are the model name — which
 *      is frequently multi-word (`TERRA MT`, `JET ML HD`, `ULTIMA HI^LIFE`,
 *      `AMAZER 4G LIFE`). Return up to four such words.
 */
export function extractPattern(text: string): string | null {
  let s = ` ${text.toUpperCase().replace(/_/g, ' ')} `;
  s = s.replace(SIZE_RE_G, ' ').replace(SIZE_SPACED_RE_G, ' ').replace(SIZE_ALT_RE_G, ' ');
  s = s.replace(/\([^)]*\)/g, ' '); // (TTF), (TT), (Enliten)
  s = s.replace(/\b\d{1,2}\s?PR\b/g, ' '); // ply rating 16PR / 18 PR
  s = s.replace(LOAD_SPEED_RE, ' '); // load + speed 151F, 152/148J, 100T
  s = s.replace(/-\s*[A-Z]\b/g, ' '); // grade suffix -D, -K
  s = s.replace(/\b(TUBELESS|TUBE\s?TYPE|TUBETYPE|TTF|TTL|TL|TT|TO)\b/g, ' ');
  s = s.replace(/[#*]+/g, ' ');
  const toks = s
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => /^[A-Z0-9]/.test(t));
  // A short coded token wins (Continental prints e.g. `COMC CC6` → `CC6`).
  const coded = toks.filter((t) => PATTERN_TOKEN_RE.test(t) && /\d/.test(t));
  if (coded.length) return coded[coded.length - 1];
  // Otherwise assemble the model name from the descriptive words that survive.
  const words = toks.filter((t) => /[A-Z]/.test(t) && t.length >= 2 && !/^\d+$/.test(t) && !PATTERN_NOISE_RE.test(t));
  if (words.length) return words.slice(0, 4).join(' ');
  const fam = toks.filter((t) => FAMILY_TOKEN_RE.test(t));
  return fam.length ? fam[fam.length - 1] : null;
}

/** Text fields on a row, with size/spec-named columns tried first. */
function textFields(fields: RecordField[]): RecordField[] {
  const text = fields.filter((f) => f.value != null && typeof f.value !== 'number');
  const named = text.filter((f) => /size|article|spec|desc|dimension|section|pattern|tread/i.test(f.name));
  const rest = text.filter((f) => !named.includes(f));
  return [...named, ...rest];
}

/** Detect the ISO tyre size for a row from its named columns. */
export function tyreSize(fields: RecordField[]): string | null {
  for (const f of textFields(fields)) {
    const r = extractSize(String(f.value));
    if (r) return r;
  }
  return null;
}

/** Detect the tread pattern for a row: a named Pattern column, else by elimination. */
export function tyrePattern(fields: RecordField[]): string | null {
  // Layer 1: a real, explicitly named "Pattern"/"Tread"/"Model" column — use its
  // value verbatim (cleaned), so multi-word names survive (`Earth-1 Max`,
  // `GT Max`, `Sturdo`, `B250 (Enliten)`, `VFM1`).
  const named = fields.find(
    (f) => PATTERN_NAME_RE.test(f.name) && f.value != null && typeof f.value !== 'number' && String(f.value).trim(),
  );
  if (named) {
    const raw = String(named.value)
      .replace(/[#*]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (raw && !SIZE_RE.test(raw) && !SIZE_SPACED_RE.test(raw)) return raw.slice(0, 40);
  }
  // Layer 2: strip size/load/speed/junk from the size-or-article cell.
  for (const f of textFields(fields)) {
    const raw = String(f.value);
    if (!/size|article|spec|desc|pattern|tread/i.test(f.name) && !SIZE_RE.test(raw)) continue;
    const r = extractPattern(raw);
    if (r) return r;
  }
  return null;
}

/* --------------------------------------------------------------------------
 * Company / brand + tube type
 * ------------------------------------------------------------------------ */

/** Known manufacturer keywords → their proper company name. */
const BRAND_MAP: Array<[RegExp, string]> = [
  [/\bconti(nental)?\b/i, 'Continental'],
  [/\bkelly\b/i, 'Kelly'],
  [/\bmrf\b/i, 'MRF'],
  [/\bapollo\b/i, 'Apollo'],
  [/\bceat\b/i, 'CEAT'],
  [/\bbridgestone\b/i, 'Bridgestone'],
  [/\bmichelin\b/i, 'Michelin'],
  [/\bgood\s*year\b/i, 'Goodyear'],
  [/\bjk\b|\bjk\s*tyre\b/i, 'JK Tyre'],
  [/\byokohama\b/i, 'Yokohama'],
  [/\bpirelli\b/i, 'Pirelli'],
  [/\bdunlop\b/i, 'Dunlop'],
  [/\bbkt\b/i, 'BKT'],
  [/\bfalken\b/i, 'Falken'],
  [/\bhankook\b/i, 'Hankook'],
  [/\bbirla\b/i, 'Birla'],
  [/\btvs\b/i, 'TVS'],
];

/** Words that are never a brand — used to find the leading brand token. */
const NON_BRAND_WORD =
  /^(new|price|list|pricelist|w\.?e\.?f|from|dealer|customer|final|updated|revised|effective|rate|rates|tyre|tyres|tire|tires|india|ltd|pvt|jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(tember)?|oct(ober)?|nov(ember)?|dec(ember)?)$/i;

/**
 * Company / brand for a document, derived from its file name. Matches a known
 * manufacturer first; otherwise takes the leading word(s) of the file name
 * (skipping generic words like "New Price List" and month/year tokens), so a
 * brand-new supplier's list is still labelled automatically.
 */
export function detectBrand(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '');
  for (const [re, name] of BRAND_MAP) if (re.test(base)) return name;
  const tokens = base.split(/[^A-Za-z0-9&]+/).filter(Boolean);
  for (const tok of tokens) {
    const fuzzy = fuzzyBrand(tok);
    if (fuzzy) return fuzzy;
  }
  const lead = tokens.filter((t) => !/^\d+(st|nd|rd|th)?$/i.test(t) && !NON_BRAND_WORD.test(t));
  const first = lead[0] ?? tokens[0] ?? 'Unknown';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Canonical manufacturer names, used for typo-tolerant file-name matching. */
const KNOWN_BRANDS = [
  'Continental', 'Kelly', 'MRF', 'Apollo', 'CEAT', 'Bridgestone', 'Michelin',
  'Goodyear', 'JK Tyre', 'Yokohama', 'Pirelli', 'Dunlop', 'BKT', 'Falken',
  'Hankook', 'Birla', 'TVS',
];

/** Levenshtein edit distance between two short strings. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[n];
}

/**
 * Match a single file-name token to a known brand, tolerating a small typo
 * (e.g. "APOLLP" → Apollo) or a shared 5-letter prefix.
 */
function fuzzyBrand(token: string): string | null {
  const t = token.toLowerCase();
  if (t.length < 4) return null;
  for (const brand of KNOWN_BRANDS) {
    const b = brand.toLowerCase().replace(/\s+/g, '');
    if (b.length < 4) continue;
    if (t === b) return brand;
    if (b.length >= 5 && t.length >= 5 && t.slice(0, 5) === b.slice(0, 5)) return brand;
    if (Math.abs(t.length - b.length) <= 1 && editDistance(t, b) <= 1) return brand;
  }
  return null;
}

/** Find a known brand named anywhere in free text (e.g. a document title row). */
export function detectBrandFromText(text: string): string | null {
  for (const [re, name] of BRAND_MAP) if (re.test(text)) return name;
  return null;
}

/**
 * Resolve a document's brand: a known manufacturer in the file name (exact or
 * typo-tolerant) wins; otherwise one named inside the document text (many price
 * lists print the company name in a title row); otherwise the leading file-name
 * word. Keeps a brand-new supplier's list labelled automatically.
 */
export function resolveBrand(fileName: string, sampleText = ''): string {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '');
  for (const [re, name] of BRAND_MAP) if (re.test(base)) return name;
  const tokens = base.split(/[^A-Za-z0-9&]+/).filter(Boolean);
  for (const tok of tokens) {
    const fuzzy = fuzzyBrand(tok);
    if (fuzzy) return fuzzy;
  }
  const fromText = detectBrandFromText(sampleText);
  if (fromText) return fromText;
  const lead = tokens.filter((t) => !/^\d+(st|nd|rd|th)?$/i.test(t) && !NON_BRAND_WORD.test(t));
  const first = lead[0] ?? tokens[0] ?? 'Unknown';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Tube construction glued to (or standing beside) a size, e.g. `R12TL`, `TT`. */
const TUBE_RE = /(?:\d\s*)?\b(TL|TT)\b|R\s*\d{2}\s*(TL|TT)/i;

/** Extract the tube type (TL / TT) from a free-text string, or null. */
export function extractTube(text: string): string | null {
  const m = TUBE_RE.exec(text.toUpperCase());
  if (!m) return null;
  return (m[1] || m[2] || '').toUpperCase() || null;
}

/** Normalise a free-text tube marker (TL / TT / tubeless / tube-type) or null. */
function normalizeTube(raw: string): string | null {
  const v = raw.trim().toUpperCase();
  if (/\bTUBELESS\b|\bTL\b/.test(v)) return 'TL';
  if (/TUBE[\s-]*TYPE|\bTT\b|\bTUBE\b/.test(v)) return 'TT';
  return null;
}

/** Detect the tube type for a row: a named Tube/Type column, else from text. */
export function tyreTube(fields: RecordField[]): string | null {
  const named = fields.find(
    (f) =>
      /\btube\b|construction|\btl\/tt\b|\btype\b/i.test(f.name) &&
      f.value != null &&
      String(f.value).trim(),
  );
  if (named) {
    const t = normalizeTube(String(named.value));
    if (t) return t;
  }
  for (const f of textFields(fields)) {
    const r = extractTube(String(f.value));
    if (r) return r;
  }
  return null;
}

/* --------------------------------------------------------------------------
 * Tyre category / vehicle segment
 *
 * Price-list workbooks split their rows across sheets by segment — TRUCK BIAS,
 * TBR, PCR, LCV, SCV, FARM, 2WLR, 3WLR, TUBES … So the sheet (page) title is a
 * reliable, automatic signal for "what kind of tyre this is": a two-wheeler, a
 * truck, a tractor, and so on. We map the many vendor spellings to one tidy set
 * of segment names and fall back to the cleaned title for anything unusual.
 * ------------------------------------------------------------------------ */

/** Ordered rules: the FIRST match wins, so put the specific ones on top. */
const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/\b3\s*-?\s*w(?:l|h)?r?\b|three\s*wheel/i, '3-Wheeler'],
  [/\b2\s*-?\s*w(?:l|h)?r?\b|two\s*wheel|motor\s*cycle|\bscooter\b|\bmoped\b/i, '2-Wheeler'],
  [/tractor\s*front|\bfront\b/i, 'Tractor Front'],
  [/tractor\s*rear|\brear\b/i, 'Tractor Rear'],
  [/tractor|\bfarm\b|\bagri|\bimplement\b/i, 'Farm'],
  [/\bt\.?\s*b\.?\s*r\b|truck.*radial|radial.*truck|bus.*radial/i, 'Truck Radial'],
  [/truck.*bias|bias.*truck|\btruck\b|\bbus\b|\btbb\b|\bhcv\b/i, 'Truck / Bus'],
  [/pick\s*-?\s*up/i, 'Pickup'],
  [/\blcv\b|light\s*commercial/i, 'LCV'],
  [/\bscv\b|small\s*commercial/i, 'SCV'],
  [/\bpcr\b|passenger|\bcar\b|\bsuv\b|\bmuv\b/i, 'Passenger Car'],
  [/\botr\b|\boffthe?road\b|earth\s*mover|\bloader\b|\bgrader\b|\bdumper\b|industr|\bindl?\b|mining/i, 'OTR / Industrial'],
  [/\bflap[s]?\b/i, 'Flap'],
  [/\btube[s]?\b/i, 'Tube'],
];

/** Turn a raw sheet title into a tidy, comparable label. */
function cleanTitle(title: string): string {
  const t = title.replace(/[<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // Title-case short ALL-CAPS names; leave mixed-case product names intact.
  return t
    .split(' ')
    .map((w) => (/^[A-Z0-9]+$/.test(w) && w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ');
}

/**
 * Recognise the tyre category / vehicle segment from a sheet (page) title.
 * Returns null when there is no title (e.g. PDFs) so the field stays empty
 * rather than guessing.
 */
export function detectCategory(title?: string | null): string | null {
  if (!title) return null;
  for (const [re, name] of CATEGORY_RULES) if (re.test(title)) return name;
  const cleaned = cleanTitle(title);
  return cleaned || null;
}
