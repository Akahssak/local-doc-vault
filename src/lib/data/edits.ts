/**
 * Manual, per-row edits layered on top of the auto-parsed rows.
 *
 * Extraction is never perfect: a size may be misread, a company may be missing
 * from the file name, or a list may publish no customer price (RCP) at all. So
 * the admin can correct or add a handful of fields by hand — company, size,
 * pattern, tube type and RCP — plus attach free-form tags.
 *
 * The dealer price (DP) and the SKU code are always taken straight from the
 * source and are intentionally NOT editable here.
 *
 * Every edit is keyed by the stable {@link DataRecord.id} (`docId:page:line`),
 * persisted to IndexedDB and mirrored into the exported `global.json`, so
 * hand-corrections survive reloads and show up in the download.
 */
import { APP_CONFIG } from '@/config';
import { getSetting, setSetting } from '@/lib/storage/db';
import type { DataRecord, EditedFields, RecordEdit, RecordEdits } from '@/types';

export const DEFAULT_EDITS: RecordEdits = {};

/** Trim, collapse whitespace and cap a free-text value the user typed. */
function cleanText(raw: unknown, max = 60): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : undefined;
}

/** Normalise one persisted edit, dropping empty or invalid parts. */
function normalizeEdit(raw: unknown): RecordEdit | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const out: RecordEdit = {};

  const brand = cleanText(o.brand, 40);
  if (brand) out.brand = brand;
  const size = cleanText(o.size, 32);
  if (size) out.size = size;
  const pattern = cleanText(o.pattern, 32);
  if (pattern) out.pattern = pattern;
  const tube = cleanText(o.tube, 8);
  if (tube) out.tube = tube.toUpperCase();

  const rcp = Number(o.rcp);
  if (Number.isFinite(rcp) && rcp > 0) out.rcp = Math.round(rcp);

  if (Array.isArray(o.tags)) {
    const tags = Array.from(
      new Set(o.tags.map((t) => cleanText(t, 24)).filter((t): t is string => !!t)),
    ).slice(0, 24);
    if (tags.length) out.tags = tags;
  }

  return Object.keys(out).length ? out : null;
}

/** Load persisted manual edits (empty when none have been made). */
export async function loadEdits(): Promise<RecordEdits> {
  const raw = await getSetting<Record<string, unknown>>(APP_CONFIG.settingsKeys.recordEdits);
  if (!raw || typeof raw !== 'object') return {};
  const out: RecordEdits = {};
  for (const [id, e] of Object.entries(raw)) {
    const norm = normalizeEdit(e);
    if (norm) out[id] = norm;
  }
  return out;
}

/** Persist all manual edits to IndexedDB. */
export function saveEdits(edits: RecordEdits): Promise<unknown> {
  return setSetting(APP_CONFIG.settingsKeys.recordEdits, edits);
}

/**
 * Overlay the user's manual edits on the auto-parsed rows. Any edited field
 * replaces the extracted value and is flagged in `edited` (so the table can
 * show an "added / edited" marker); tags are attached as-is. Returns new record
 * objects and never mutates the parsed input, so re-parsing stays pure.
 */
export function applyRecordEdits(records: DataRecord[], edits: RecordEdits): DataRecord[] {
  if (!edits || Object.keys(edits).length === 0) return records;
  return records.map((r) => {
    const e = edits[r.id];
    if (!e) return r;

    const edited: EditedFields = {};
    const next: DataRecord = { ...r };
    if (e.brand !== undefined) {
      next.brand = e.brand;
      edited.brand = true;
    }
    if (e.size !== undefined) {
      next.size = e.size;
      edited.size = true;
    }
    if (e.pattern !== undefined) {
      next.pattern = e.pattern;
      edited.pattern = true;
    }
    if (e.tube !== undefined) {
      next.tube = e.tube;
      edited.tube = true;
    }
    if (e.rcp !== undefined) {
      next.rcp = e.rcp;
      edited.rcp = true;
    }
    if (e.tags && e.tags.length) next.tags = e.tags;
    next.edited = edited;
    return next;
  });
}
