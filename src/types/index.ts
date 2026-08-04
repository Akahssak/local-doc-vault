/**
 * Shared data model for the Local Doc Vault.
 *
 * Storage split:
 *  - The original uploaded binary lives in OPFS (origin-private, app-only).
 *  - `StoredDocument` (metadata) + `DocumentJson` (extracted content) live in
 *    IndexedDB so we can search/filter without re-reading big binaries.
 */

/** A single positioned token (pdf.js text item) within a line. */
export interface DocCell {
  /** Left x-position in PDF user space (used to align values to columns). */
  x: number;
  /** The token text. */
  str: string;
}

/** A single reconstructed line of text on a page. */
export interface DocLine {
  /** 0-based line index within the page. */
  index: number;
  /** Approximate vertical position in PDF user space (higher = nearer top). */
  y: number;
  /** Reconstructed line text. */
  text: string;
  /** Positioned tokens that make up the line, left→right (PDF only). */
  cells?: DocCell[];
}

/** One page of extracted content. */
export interface DocPage {
  /** 1-based page number. */
  pageNumber: number;
  width: number;
  height: number;
  /** Full page text (lines joined by "\n"). */
  text: string;
  lines: DocLine[];
  /**
   * Human title of the page's source section. For spreadsheets this is the
   * worksheet/tab name (e.g. `TRUCK BIAS`, `2WLR`), which we use to recognise
   * the tyre category. Undefined for PDFs and plain text.
   */
  title?: string;
}

/** The full JSON representation of a document's textual content. */
export interface DocumentJson {
  fileName: string;
  pageCount: number;
  pages: DocPage[];
  /** All page text joined together. */
  fullText: string;
  /** ISO timestamp of extraction. */
  extractedAt: string;
  /** Metadata dictionary from the source (pdf.js info) when available. */
  info?: Record<string, unknown>;
  /**
   * Rows the admin has hand-corrected, written back into this document's own
   * JSON sidecar so the saved file on disk carries the edited data (not just
   * the in-app store). Present only once at least one row has been edited.
   */
  editedRecords?: PersistedRecord[];
}

/**
 * A single business row persisted into a document's JSON sidecar. `editedFields`
 * lists which values the admin changed by hand, so an external reader can tell
 * corrections apart from auto-extracted values.
 */
export interface PersistedRecord {
  id: string;
  page: number;
  line: number;
  brand: string | null;
  code: string | null;
  size: string | null;
  pattern: string | null;
  tube: string | null;
  category: string | null;
  dp: number | null;
  rcp: number | null;
  tags: string[];
  /** Names of the fields on this row the user edited (e.g. `["size","pattern"]`). */
  editedFields: EditableField[];
  /** ISO timestamp when this row's edit was saved. */
  savedAt: string;
}

export type DocStatus = 'processing' | 'ready' | 'error';

/** Lightweight metadata row shown in lists and used for filtering. */
export interface StoredDocument {
  id: string;
  fileName: string;
  /**
   * Company / brand this document belongs to. Every company gets its own
   * folder in the vault; this is that folder's display name.
   */
  company: string;
  /**
   * Path of the original binary inside the OPFS vault directory, of the form
   * `<Company>/<original file name>` — the file keeps its real name.
   */
  opfsPath: string;
  /**
   * Path of the extracted JSON stored right next to the source
   * (`<Company>/<original file name>.json`). Undefined when extraction failed.
   */
  jsonPath?: string;
  mimeType: string;
  /** Size in bytes. */
  size: number;
  pageCount: number;
  status: DocStatus;
  error?: string;
  /** ISO timestamp when the document was added. */
  addedAt: string;
  /** SHA-256 hex digest of the file bytes (used for de-duplication). */
  hash: string;
  /** Short text preview for list rows. */
  preview: string;
  /** Length of extracted text (rough "how much content" signal). */
  textLength: number;
  /** Free-form tags added by the admin. */
  tags: string[];
}

/** Options controlling a search run. */
export interface SearchOptions {
  query: string;
  useRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  /** Restrict to these document ids; empty/undefined = search everything. */
  docIds?: string[];
}

/** A single matching line with the matched character ranges highlighted. */
export interface SearchMatch {
  docId: string;
  fileName: string;
  pageNumber: number;
  lineIndex: number;
  lineText: string;
  /** Half-open [start, end) offsets within `lineText` that matched. */
  ranges: Array<[number, number]>;
}

/** Search results grouped by document. */
export interface DocumentSearchResult {
  docId: string;
  fileName: string;
  matchCount: number;
  matches: SearchMatch[];
}

/* --------------------------------------------------------------------------
 * Vault identity + global aggregated index
 * ------------------------------------------------------------------------ */

/**
 * Stable identity of the on-device vault folder. Written once (per device) into
 * the vault as `_vault.json`. If it already exists we REUSE it (same folder);
 * if it is missing we CREATE a fresh one (new device / first run).
 */
export interface VaultManifest {
  /** Stable random id generated on first run and never changed. */
  vaultId: string;
  /** OPFS directory name that holds the files (from APP_CONFIG.vaultDir). */
  folderName: string;
  schemaVersion: number;
  /** ISO timestamp the vault was first created on this device. */
  createdAt: string;
  /** ISO timestamp of the last write to the manifest. */
  updatedAt: string;
  /** Best-effort human label for the device/browser. */
  deviceLabel: string;
  appName: string;
}

/** A page reduced to just its number + text for the aggregated index. */
export interface GlobalIndexPage {
  pageNumber: number;
  text: string;
}

/** One document's entry inside the aggregated global JSON. */
export interface GlobalIndexEntry {
  id: string;
  fileName: string;
  /** Company folder this document is filed under. */
  company: string;
  mimeType: string;
  /** Lowercased extension incl. dot, e.g. ".pdf" ("" if none). */
  ext: string;
  size: number;
  pageCount: number;
  status: DocStatus;
  addedAt: string;
  hash: string;
  tags: string[];
  preview: string;
  textLength: number;
  pages: GlobalIndexPage[];
}

/**
 * The single aggregated structure that grows every time a document is added.
 * Persisted to the vault as `global.json` and used for cross-document filtering
 * and full-vault export.
 */
export interface GlobalIndex {
  vaultId: string;
  schemaVersion: number;
  updatedAt: string;
  documentCount: number;
  totalPages: number;
  totalBytes: number;
  documents: GlobalIndexEntry[];
}

/* --------------------------------------------------------------------------
 * Global dashboard filtering
 * ------------------------------------------------------------------------ */

/** Which field(s) the text/regex query is applied to. */
export type FilterField = 'all' | 'name' | 'content' | 'tags';

/** Sort keys for the filtered document grid. */
export type SortKey = 'addedAt' | 'fileName' | 'size' | 'pageCount' | 'textLength';
export type SortDir = 'asc' | 'desc';

/** Full set of dashboard filters applied over the global index. */
export interface GlobalFilter {
  /** Text or regex query. */
  query: string;
  field: FilterField;
  useRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  /** Extensions to include (e.g. [".pdf"]). Empty = all. */
  fileTypes: string[];
  /** Tags that must ALL be present. Empty = ignore. */
  tags: string[];
  status: DocStatus | 'any';
  /** Size bounds in bytes (null = unbounded). */
  minSize: number | null;
  maxSize: number | null;
  /** Page-count bounds (null = unbounded). */
  minPages: number | null;
  maxPages: number | null;
  /** Inclusive yyyy-mm-dd date bounds (null = unbounded). */
  addedAfter: string | null;
  addedBefore: string | null;
  sortKey: SortKey;
  sortDir: SortDir;
}

/* --------------------------------------------------------------------------
 * Row-level business data (parsed FROM the extracted JSON)
 * ------------------------------------------------------------------------ */

/**
 * One business row parsed out of a document's text — e.g. a single priced line
 * item in a price list. This is the "data inside the JSON" that the dashboard
 * filters and visualises (not the PDF file itself).
 */
export interface DataRecord {
  /** Stable id: `${docId}:${page}:${line}`. */
  id: string;
  docId: string;
  fileName: string;
  /** 1-based page the row came from. */
  page: number;
  /** 0-based line index within the page. */
  line: number;
  /** The raw reconstructed line text. */
  text: string;
  /** Descriptive part of the row (spec / description tokens). */
  label: string;
  /** Long identifier detected in the row (SKU / article code), if any. */
  code: string | null;
  /** All price-like numbers found on the row. */
  numbers: number[];
  /** Headline value for the row (the row's real selling/retail price) or null. */
  value: number | null;
  /**
   * Dealer price — the total billing amount incl. GST that the dealer pays
   * (e.g. Continental "Total Billing Price", Kelly "NBP+EPR+GST"). Null when the
   * document has no such column.
   */
  dp?: number | null;
  /**
   * Recommended customer price (RCP / MRP / retail column). Null when the
   * document does not publish one.
   */
  rcp?: number | null;
  /**
   * Normalised ISO tyre size, e.g. `145/80R13`. Universal across brands, so it
   * lets the same size be compared across different manufacturers. Null when no
   * size could be detected on the row.
   */
  size?: string | null;
  /**
   * Tyre tread pattern / model code, e.g. `CC6`, `UC6`, `VFM1`. Brand-specific
   * (each manufacturer owns its own names). Null when none was detected.
   */
  pattern?: string | null;
  /**
   * Manufacturer / company the row belongs to, derived from the source file
   * name (e.g. `Continental`, `Kelly`). Lets rows be grouped and filtered by
   * company across many uploaded lists.
   */
  brand?: string | null;
  /**
   * Tube construction: `TL` (tubeless) or `TT` (tube type). Null when the list
   * does not state it.
   */
  tube?: string | null;
  /**
   * Named columns parsed from the document's own header row, in left→right
   * order. Present when a table schema was detected; enables an accurate,
   * per-column breakdown instead of guessing what each number means.
   */
  fields?: RecordField[];
  /**
   * Tyre category / vehicle segment (e.g. `2-Wheeler`, `Truck/Bus`, `Farm`),
   * recognised automatically from the workbook sheet the row came from. Null
   * for sources that carry no segment (e.g. a single-table PDF).
   */
  category?: string | null;
  /**
   * Free-form tags ADDED BY THE USER on this row (never auto-extracted). Shown
   * with an "added" marker so manual notes stay distinct from parsed data.
   */
  tags?: string[];
  /**
   * Which display fields the user has manually overridden, so the table can
   * flag them as "added / edited" instead of auto-extracted.
   */
  edited?: EditedFields;
}

/**
 * Distinct facet values across the whole dataset, used to populate the filter
 * dropdowns. Recomputed from the parsed rows, so a newly uploaded PDF that
 * introduces a new brand / size / pattern / tube automatically adds its values.
 */
export interface DataFacets {
  brands: string[];
  sizes: string[];
  patterns: string[];
  tubes: string[];
  /** Distinct tyre categories / segments (2-Wheeler, Truck/Bus, Farm, …). */
  categories: string[];
}

/* --------------------------------------------------------------------------
 * Editable pricing (dealer price vs. customer price + your discount)
 * ------------------------------------------------------------------------ */

/**
 * A single row's custom percentage overrides. Either side is optional — an
 * absent value means "use the matching global default".
 */
export interface RowOverride {
  /** Custom discount % off the dealer price (DP) for this row. */
  dp?: number;
  /** Custom discount % off the customer price (RCP) for this row. */
  rcp?: number;
}

/**
 * Row fields the admin can correct by hand. The dealer price (DP) and the SKU
 * code are always taken from the source and are NOT in this list.
 */
export type EditableField = 'brand' | 'size' | 'pattern' | 'tube' | 'rcp';

/** Flags marking which fields on a row were set by the user (not extracted). */
export type EditedFields = Partial<Record<EditableField, boolean>>;

/**
 * One row's manual edits. Any present field REPLACES the auto-extracted value;
 * `tags` are always user-added. Persisted to IndexedDB and mirrored into the
 * exported `global.json`, so hand-corrections survive reloads and show in the
 * download.
 */
export interface RecordEdit {
  /** Corrected company / manufacturer. */
  brand?: string;
  /** Corrected tyre size. */
  size?: string;
  /** Corrected tread pattern / model. */
  pattern?: string;
  /** Corrected tube type (`TL` or `TT`). */
  tube?: string;
  /** Recommended customer price the user typed or added for this row. */
  rcp?: number;
  /** Free-form tags the user attached to this row. */
  tags?: string[];
}

/** Every manual row edit, keyed by {@link DataRecord.id}. */
export type RecordEdits = Record<string, RecordEdit>;

/**
 * User-editable pricing preferences. Two independent percentages drive every
 * row:
 *  - a DP discount (what you negotiate off the dealer price → your net cost),
 *  - an RCP discount (what you give the customer off the recommended price →
 *    your selling price).
 * Persisted to IndexedDB (settings store) and mirrored into the exported
 * `global.json`, so values typed in the table survive reloads and show in JSON.
 */
export interface PricingSettings {
  /** Discount % off the dealer price, applied to every non-overridden row. */
  defaultDpPct: number;
  /** Discount % off the customer price, applied to every non-overridden row. */
  defaultRcpPct: number;
  /** Per-row DP/RCP overrides, keyed by {@link DataRecord.id}. */
  overrides: Record<string, RowOverride>;
}

/** Derived pricing for one row (dealer & customer prices + both discounts). */
export interface RowPricing {
  /** Dealer price — total billing incl. GST (list dealer price). */
  dp: number | null;
  /** Recommended customer price. */
  rcp: number | null;
  /** Effective DP discount % used for this row. */
  dpPct: number;
  /** Effective RCP discount % used for this row. */
  rcpPct: number;
  /** Your net cost = dp × (1 − dpPct / 100). */
  dpFinal: number | null;
  /** Your selling price = (rcp ?? dp) × (1 − rcpPct / 100). */
  rcpFinal: number | null;
  /** Profit = your selling price − your net cost (null when unknown). */
  margin: number | null;
  /** True when this row carries a custom DP discount. */
  dpOverridden: boolean;
  /** True when this row carries a custom RCP discount. */
  rcpOverridden: boolean;
}

/** The business meaning of a detected table column. */
export type ColumnRole = 'code' | 'desc' | 'index' | 'price';

/** One named value on a data row, mapped from a real column header. */
export interface RecordField {
  /** Normalised key, e.g. `gst_18`, `billing_price`. */
  key: string;
  /** Display name taken from the header, e.g. `GST 18%`. */
  name: string;
  role: ColumnRole;
  kind: 'text' | 'number';
  value: string | number | null;
}

/** Which part of a data row the text/regex query is applied to. */
export type DataQueryField = 'all' | 'code' | 'label';

/** Three-state toggle used by several data filters. */
export type TriState = 'any' | 'yes' | 'no';

/** Filters applied to the parsed data rows (drives every dashboard visual). */
export interface DataFilter {
  query: string;
  /** Where the query applies: whole row, code only, or description only. */
  field: DataQueryField;
  useRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  /** Restrict to these source documents. Empty = all. */
  docIds: string[];
  /** Restrict to these companies / brands. Empty = all. */
  brands: string[];
  /** Restrict to these tyre sizes. Empty = all. */
  sizes: string[];
  /** Restrict to these tread patterns. Empty = all. */
  patterns: string[];
  /** Restrict to these tube types (TL / TT). Empty = all. */
  tubes: string[];
  /** Restrict to these tyre categories / segments. Empty = all. */
  categories: string[];
  /** Dealer-price (DP) bounds (null = unbounded). */
  minDp: number | null;
  maxDp: number | null;
  /** Customer-price (RCP) bounds (null = unbounded). */
  minRcp: number | null;
  maxRcp: number | null;
  /** Headline-value bounds (null = unbounded). */
  minValue: number | null;
  maxValue: number | null;
  /** Only rows that carry a numeric value. */
  onlyWithValue: boolean;
  /** Require / exclude rows that carry a SKU / article code. */
  hasCode: TriState;
  /** Page-number bounds (null = unbounded). */
  minPage: number | null;
  maxPage: number | null;
  /** Minimum count of price-like numbers on the row (0 = ignore). */
  minColumns: number;
  sortKey: DataSortKey;
  sortDir: SortDir;
}

export type DataSortKey =
  | 'value'
  | 'label'
  | 'fileName'
  | 'page'
  | 'code'
  | 'size'
  | 'pattern'
  | 'brand'
  | 'dp'
  | 'rcp';

/** Per-document rollup for charts. */
export interface DocRollup {
  docId: string;
  fileName: string;
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
}

/** One bucket of the value histogram. */
export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

/** Aggregated analytics over a set of data rows. */
export interface DataAnalytics {
  recordCount: number;
  documentCount: number;
  valueCount: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  median: number;
  perDocument: DocRollup[];
  histogram: HistogramBin[];
  topRecords: DataRecord[];
}
