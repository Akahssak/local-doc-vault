/**
 * Parse business rows out of extracted document text.
 *
 * The extracted JSON gives us lines of text per page. Price lists (and most
 * tabular PDFs) encode one business record per line: a description/spec, a
 * long identifier (SKU / article code) and a series of prices. This module
 * turns those lines into structured {@link DataRecord}s so the dashboard can
 * filter and visualise the DATA inside the JSON rather than the PDF files.
 *
 * The heuristics are format-agnostic (no hard-coded columns) but tuned to work
 * well for price lists:
 *   - A pure integer with 6+ digits is treated as a code (SKU / article no.).
 *   - A number with a decimal, or an integer of <=5 digits, is a "price-like"
 *     value. The headline `value` is the largest of these (usually the RCP /
 *     total / final price).
 *   - Everything else (specs like "195/65R15", patterns, letters) is the label.
 */
import type { DataRecord, DocCell, DocumentJson, EditableField, PersistedRecord } from '@/types';
import { APP_CONFIG } from '@/config';
import {
  dealerPrice,
  detectBrand,
  detectCategory,
  detectPageSchema,
  detectSchema,
  extractPattern,
  extractSize,
  extractTube,
  headlinePrice,
  isDataRow,
  mapRowToFields,
  resolveBrand,
  retailPrice,
  tyrePattern,
  tyreSize,
  tyreTube,
  type TableSchema,
} from './columns';

const CODE_RE = /^\d{6,}$/;
const HASH_RE = /^#+$/;

/** Parse a single token into a price-like number, or null if it is not one. */
function priceValue(token: string): number | null {
  // Strip common currency symbols and thousands separators, then trim any
  // spacing (e.g. "₹ 18,360" -> "18360").
  const cleaned = token.replace(/[₹$€£,]/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  // Long pure integers are codes, not prices.
  if (!cleaned.includes('.') && cleaned.length > 5) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Break one line of text into a structured record, or null if it is not data. */
export function parseLine(
  docId: string,
  fileName: string,
  page: number,
  line: number,
  text: string,
  brand: string = detectBrand(fileName),
): DataRecord | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const tokens = trimmed.split(/\s+/);
  const numbers: number[] = [];
  const labelParts: string[] = [];
  let code: string | null = null;

  for (const tok of tokens) {
    if (CODE_RE.test(tok)) {
      if (!code || tok.length > code.length) code = tok;
      continue;
    }
    const price = priceValue(tok);
    if (price !== null) {
      numbers.push(price);
      continue;
    }
    if (HASH_RE.test(tok)) continue;
    labelParts.push(tok);
  }

  const label = labelParts.join(' ').trim();
  const value = numbers.length ? Math.max(...numbers) : null;

  // Qualify as a business row: needs a description plus either a code or a
  // couple of numbers, and a headline value. This drops headers/section titles.
  const isData = label.length > 0 && (code !== null || numbers.length >= 2) && value !== null;
  if (!isData) return null;

  return {
    id: `${docId}:${page}:${line}`,
    docId,
    fileName,
    page,
    line,
    text: trimmed,
    label,
    code,
    numbers,
    value,
    size: extractSize(trimmed),
    pattern: extractPattern(trimmed),
    brand,
    tube: extractTube(trimmed),
  };
}

/**
 * Build a record from a data row using the detected column schema. Every value
 * is read from its real, named column, so `value` is the row's actual retail /
 * selling price rather than "the largest number on the line".
 */
function buildFromSchema(
  docId: string,
  fileName: string,
  page: number,
  line: number,
  text: string,
  cells: DocCell[],
  schema: TableSchema,
  brand: string,
  minNumbers = 2,
): DataRecord | null {
  if (!isDataRow(cells, minNumbers)) return null;

  const fields = mapRowToFields(cells, schema);

  const codeField = fields.find(
    (f) => f.role === 'code' && f.value != null && CODE_RE.test(String(f.value)),
  );
  const code = codeField
    ? String(codeField.value)
    : (cells.map((c) => c.str).find((s) => CODE_RE.test(s)) ?? null);

  const label = fields
    .filter((f) => f.role === 'desc' && f.kind === 'text' && f.value != null)
    .map((f) => String(f.value))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const numbers = fields
    .filter((f) => f.role === 'price' && typeof f.value === 'number')
    .map((f) => f.value as number);

  const value = headlinePrice(fields) ?? (numbers.length ? Math.max(...numbers) : null);

  // Needs an identity (description or code) and a price to be a business row.
  if (!(label || code) || value === null) return null;

  return {
    id: `${docId}:${page}:${line}`,
    docId,
    fileName,
    page,
    line,
    text: text.trim(),
    label: label || (code ?? ''),
    code,
    numbers,
    value,
    dp: dealerPrice(fields),
    rcp: retailPrice(fields),
    size: tyreSize(fields),
    pattern: tyrePattern(fields),
    brand,
    tube: tyreTube(fields) ?? extractTube(text),
    fields,
  };
}

/** Parse every data row from one document's extracted JSON. */
export function parseDocumentRecords(docId: string, json: DocumentJson): DataRecord[] {
  // Spreadsheets get forgiving header detection: their first row is almost
  // always the header even when the column names are non-standard.
  const isSpreadsheet = APP_CONFIG.spreadsheetExtensions.some((ext) =>
    json.fileName.toLowerCase().endsWith(ext),
  );
  const schemaOpts = { assumeHeaderRow: isSpreadsheet, minDataNumbers: isSpreadsheet ? 1 : 2 };
  const minNumbers = isSpreadsheet ? 1 : 2;
  // Document-wide schema fallback (e.g. later PDF pages that repeat no header).
  const docSchema = detectSchema(json, schemaOpts);
  // Brand resolved once per document: file name (typo-tolerant) or, failing
  // that, a manufacturer named in the first lines (title rows).
  const sampleText = (json.pages[0]?.lines ?? [])
    .slice(0, 15)
    .map((l) => l.text)
    .join(' ');
  const brand = resolveBrand(json.fileName, sampleText);
  const out: DataRecord[] = [];
  for (const pg of json.pages) {
    // Each sheet of a workbook can have its own columns, so detect per page and
    // fall back to the document schema when a page repeats no header.
    const pageSchema = detectPageSchema(pg, schemaOpts) ?? docSchema;
    // The sheet/tab name tells us the tyre segment (2-wheeler, truck, farm, …).
    const category = detectCategory(pg.title);
    for (const ln of pg.lines) {
      const rec =
        pageSchema && ln.cells && ln.cells.length
          ? buildFromSchema(docId, json.fileName, pg.pageNumber, ln.index, ln.text, ln.cells, pageSchema, brand, minNumbers)
          : parseLine(docId, json.fileName, pg.pageNumber, ln.index, ln.text, brand);
      if (rec) {
        if (category) rec.category = category;
        out.push(rec);
      }
    }
  }
  return out;
}

/** Parse data rows across many documents into one flat business dataset. */
export function parseAllRecords(
  entries: Array<{ docId: string; json: DocumentJson | undefined }>,
): DataRecord[] {
  const all: DataRecord[] = [];
  for (const { docId, json } of entries) {
    if (!json) continue;
    all.push(...parseDocumentRecords(docId, json));
  }
  return all;
}

/**
 * Flatten an (edited) business row into the compact shape stored inside a
 * document's JSON sidecar, so hand-corrections are saved in the JSON itself.
 */
export function toPersistedRecord(r: DataRecord): PersistedRecord {
  return {
    id: r.id,
    page: r.page,
    line: r.line,
    brand: r.brand ?? null,
    code: r.code,
    size: r.size ?? null,
    pattern: r.pattern ?? null,
    tube: r.tube ?? null,
    category: r.category ?? null,
    dp: r.dp ?? null,
    rcp: r.rcp ?? null,
    tags: r.tags ?? [],
    editedFields: r.edited ? (Object.keys(r.edited) as EditableField[]) : [],
    savedAt: new Date().toISOString(),
  };
}
