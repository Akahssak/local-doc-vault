/**
 * Global filtering over the parsed data rows. This is the single filter that
 * drives every dashboard visual (KPIs, charts and the data grid): the user
 * filters the DATA inside the JSON, not the PDF files.
 */
import { compileQuery } from '@/lib/search/search';
import type { DataFacets, DataFilter, DataRecord } from '@/types';

export const DEFAULT_DATA_FILTER: DataFilter = {
  query: '',
  field: 'all',
  useRegex: false,
  caseSensitive: false,
  wholeWord: false,
  docIds: [],
  brands: [],
  sizes: [],
  patterns: [],
  tubes: [],
  categories: [],
  minDp: null,
  maxDp: null,
  minRcp: null,
  maxRcp: null,
  minValue: null,
  maxValue: null,
  onlyWithValue: false,
  editedOnly: false,
  hasCode: 'any',
  minPage: null,
  maxPage: null,
  minColumns: 0,
  sortKey: 'value',
  sortDir: 'desc',
};

export interface DataFilterResult {
  records: DataRecord[];
  /** True if the value range or document scope is narrowing results. */
  narrowed: boolean;
  error?: string;
}

/** Distinct, sorted facet values across the dataset (drives the filter menus). */
export function computeFacets(records: DataRecord[]): DataFacets {
  const brands = new Set<string>();
  const sizes = new Set<string>();
  const patterns = new Set<string>();
  const tubes = new Set<string>();
  const categories = new Set<string>();
  for (const r of records) {
    if (r.brand) brands.add(r.brand);
    if (r.size) sizes.add(r.size);
    if (r.pattern) patterns.add(r.pattern);
    if (r.tube) tubes.add(r.tube);
    if (r.category) categories.add(r.category);
  }
  const alpha = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return {
    brands: [...brands].sort(alpha),
    sizes: [...sizes].sort(alpha),
    patterns: [...patterns].sort(alpha),
    tubes: [...tubes].sort(alpha),
    categories: [...categories].sort(alpha),
  };
}

function sortRecords(records: DataRecord[], f: DataFilter): void {
  const dir = f.sortDir === 'asc' ? 1 : -1;
  records.sort((a, b) => {
    let cmp: number;
    switch (f.sortKey) {
      case 'label':
        cmp = a.label.localeCompare(b.label);
        break;
      case 'fileName':
        cmp = a.fileName.localeCompare(b.fileName) || a.page - b.page || a.line - b.line;
        break;
      case 'page':
        cmp = a.page - b.page || a.line - b.line;
        break;
      case 'code':
        cmp = (a.code ?? '').localeCompare(b.code ?? '');
        break;
      case 'brand':
        cmp =
          (a.brand ?? '').localeCompare(b.brand ?? '') ||
          (a.size ?? '').localeCompare(b.size ?? '', undefined, { numeric: true });
        break;
      case 'dp':
        cmp = (a.dp ?? 0) - (b.dp ?? 0);
        break;
      case 'rcp':
        cmp = (a.rcp ?? 0) - (b.rcp ?? 0);
        break;
      case 'size':
        cmp =
          (a.size ?? '').localeCompare(b.size ?? '', undefined, { numeric: true }) ||
          (a.pattern ?? '').localeCompare(b.pattern ?? '') ||
          (a.value ?? 0) - (b.value ?? 0);
        break;
      case 'pattern':
        cmp =
          (a.pattern ?? '').localeCompare(b.pattern ?? '') ||
          (a.size ?? '').localeCompare(b.size ?? '', undefined, { numeric: true }) ||
          (a.value ?? 0) - (b.value ?? 0);
        break;
      default:
        cmp = (a.value ?? 0) - (b.value ?? 0);
    }
    return cmp * dir;
  });
}

/** Apply every active filter to the dataset and return sorted rows. */
export function applyDataFilter(records: DataRecord[], filter: DataFilter): DataFilterResult {
  const scope = filter.docIds.length ? new Set(filter.docIds) : null;
  const brandSet = filter.brands.length ? new Set(filter.brands) : null;
  const sizeSet = filter.sizes.length ? new Set(filter.sizes) : null;
  const patternSet = filter.patterns.length ? new Set(filter.patterns) : null;
  const tubeSet = filter.tubes.length ? new Set(filter.tubes) : null;
  const categorySet = filter.categories.length ? new Set(filter.categories) : null;
  const narrowed =
    scope !== null ||
    brandSet !== null ||
    sizeSet !== null ||
    patternSet !== null ||
    tubeSet !== null ||
    categorySet !== null ||
    filter.minDp !== null ||
    filter.maxDp !== null ||
    filter.minRcp !== null ||
    filter.maxRcp !== null ||
    filter.minValue !== null ||
    filter.maxValue !== null ||
    filter.onlyWithValue ||
    filter.editedOnly ||
    filter.hasCode !== 'any' ||
    filter.minPage !== null ||
    filter.maxPage !== null ||
    filter.minColumns > 0;

  let regex: RegExp | null = null;
  if (filter.query.trim()) {
    const compiled = compileQuery({
      query: filter.query,
      useRegex: filter.useRegex,
      caseSensitive: filter.caseSensitive,
      wholeWord: filter.wholeWord,
    });
    if (compiled.error) return { records: [], narrowed, error: compiled.error };
    regex = compiled.regex;
  }

  const out = records.filter((r) => {
    if (scope && !scope.has(r.docId)) return false;
    if (brandSet && !(r.brand && brandSet.has(r.brand))) return false;
    if (sizeSet && !(r.size && sizeSet.has(r.size))) return false;
    if (patternSet && !(r.pattern && patternSet.has(r.pattern))) return false;
    if (tubeSet && !(r.tube && tubeSet.has(r.tube))) return false;
    if (categorySet && !(r.category && categorySet.has(r.category))) return false;
    if (filter.minDp !== null && (r.dp ?? -Infinity) < filter.minDp) return false;
    if (filter.maxDp !== null && (r.dp ?? Infinity) > filter.maxDp) return false;
    if (filter.minRcp !== null && (r.rcp ?? -Infinity) < filter.minRcp) return false;
    if (filter.maxRcp !== null && (r.rcp ?? Infinity) > filter.maxRcp) return false;
    if (filter.onlyWithValue && r.value === null) return false;
    if (filter.editedOnly && !(r.edited && Object.keys(r.edited).length > 0)) return false;
    if (filter.minValue !== null && (r.value ?? -Infinity) < filter.minValue) return false;
    if (filter.maxValue !== null && (r.value ?? Infinity) > filter.maxValue) return false;
    if (filter.hasCode === 'yes' && !r.code) return false;
    if (filter.hasCode === 'no' && r.code) return false;
    if (filter.minPage !== null && r.page < filter.minPage) return false;
    if (filter.maxPage !== null && r.page > filter.maxPage) return false;
    if (filter.minColumns > 0 && r.numbers.length < filter.minColumns) return false;
    if (regex) {
      regex.lastIndex = 0;
      // Match against the scoped text: whole row, code only, or description.
      // A whole-row query also searches any user-added tags.
      const target =
        filter.field === 'code'
          ? r.code ?? ''
          : filter.field === 'label'
            ? r.label
            : r.tags && r.tags.length
              ? `${r.text} ${r.tags.join(' ')}`
              : r.text;
      if (!regex.test(target)) return false;
    }
    return true;
  });

  sortRecords(out, filter);
  return { records: out, narrowed };
}

/** Number of active filters besides the text query (for the UI badge). */
export function activeDataFilterCount(f: DataFilter): number {
  let n = 0;
  if (f.docIds.length) n++;
  if (f.brands.length) n++;
  if (f.sizes.length) n++;
  if (f.patterns.length) n++;
  if (f.tubes.length) n++;
  if (f.categories.length) n++;
  if (f.minDp !== null || f.maxDp !== null) n++;
  if (f.minRcp !== null || f.maxRcp !== null) n++;
  if (f.minValue !== null || f.maxValue !== null) n++;
  if (f.onlyWithValue) n++;
  if (f.editedOnly) n++;
  if (f.hasCode !== 'any') n++;
  if (f.minPage !== null || f.maxPage !== null) n++;
  if (f.minColumns > 0) n++;
  return n;
}
