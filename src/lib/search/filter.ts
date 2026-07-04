/**
 * Global dashboard filtering over the whole vault.
 *
 * Combines metadata filters (type, tags, status, size, pages, date) with a
 * text/regex query that can target the file name, the tags, the extracted
 * content, or all of them. Pure functions so the result is easy to memoise.
 */
import { compileQuery, searchDocuments } from '@/lib/search/search';
import { extOf } from '@/lib/util';
import type { DocumentJson, GlobalFilter, StoredDocument } from '@/types';

export const DEFAULT_FILTER: GlobalFilter = {
  query: '',
  field: 'all',
  useRegex: false,
  caseSensitive: false,
  wholeWord: false,
  fileTypes: [],
  tags: [],
  status: 'any',
  minSize: null,
  maxSize: null,
  minPages: null,
  maxPages: null,
  addedAfter: null,
  addedBefore: null,
  sortKey: 'addedAt',
  sortDir: 'desc',
};

export interface FilterEntry {
  meta: StoredDocument;
  json: DocumentJson | undefined;
}

export interface GlobalFilterResult {
  /** Documents that pass every active filter, already sorted. */
  docs: StoredDocument[];
  /** docId -> number of content matches (only when the query hits content). */
  matchCounts: Map<string, number>;
  /** Whether the query is currently searching document content. */
  contentQueryActive: boolean;
  /** Invalid-regex message, if any. */
  error?: string;
}

/** Reset a global RegExp before testing so `lastIndex` never leaks between calls. */
function test(regex: RegExp, value: string): boolean {
  regex.lastIndex = 0;
  return regex.test(value);
}

/** Metadata-only predicate (everything except the text/regex query). */
function passesMeta(meta: StoredDocument, f: GlobalFilter): boolean {
  if (f.fileTypes.length && !f.fileTypes.includes(extOf(meta.fileName))) return false;
  if (f.tags.length && !f.tags.every((t) => meta.tags.includes(t))) return false;
  if (f.status !== 'any' && meta.status !== f.status) return false;
  if (f.minSize != null && meta.size < f.minSize) return false;
  if (f.maxSize != null && meta.size > f.maxSize) return false;
  if (f.minPages != null && meta.pageCount < f.minPages) return false;
  if (f.maxPages != null && meta.pageCount > f.maxPages) return false;
  const day = meta.addedAt.slice(0, 10);
  if (f.addedAfter && day < f.addedAfter) return false;
  if (f.addedBefore && day > f.addedBefore) return false;
  return true;
}

function sortDocs(docs: StoredDocument[], f: GlobalFilter): void {
  const dir = f.sortDir === 'asc' ? 1 : -1;
  docs.sort((a, b) => {
    let cmp: number;
    switch (f.sortKey) {
      case 'fileName':
        cmp = a.fileName.localeCompare(b.fileName);
        break;
      case 'size':
        cmp = a.size - b.size;
        break;
      case 'pageCount':
        cmp = a.pageCount - b.pageCount;
        break;
      case 'textLength':
        cmp = a.textLength - b.textLength;
        break;
      default:
        cmp = a.addedAt.localeCompare(b.addedAt);
    }
    return cmp * dir;
  });
}

/** Apply the full global filter to the vault. */
export function applyGlobalFilter(
  entries: FilterEntry[],
  filter: GlobalFilter,
): GlobalFilterResult {
  const query = filter.query.trim();
  const matchCounts = new Map<string, number>();
  const wantsContent = query !== '' && (filter.field === 'content' || filter.field === 'all');
  const wantsName = query !== '' && (filter.field === 'name' || filter.field === 'all');
  const wantsTags = query !== '' && (filter.field === 'tags' || filter.field === 'all');

  // 1) Metadata prefilter.
  let candidates = entries.filter(({ meta }) => passesMeta(meta, filter));

  // 2) Text/regex query.
  if (query !== '') {
    const compiled = compileQuery({
      query: filter.query,
      useRegex: filter.useRegex,
      caseSensitive: filter.caseSensitive,
      wholeWord: filter.wholeWord,
    });
    if (compiled.error || !compiled.regex) {
      return {
        docs: [],
        matchCounts,
        contentQueryActive: wantsContent,
        error: compiled.error,
      };
    }
    const regex = compiled.regex;

    // Content search (reuses the highlight-capable engine) for match counts.
    let contentIds: Set<string> | null = null;
    if (wantsContent) {
      const out = searchDocuments(candidates, {
        query: filter.query,
        useRegex: filter.useRegex,
        caseSensitive: filter.caseSensitive,
        wholeWord: filter.wholeWord,
      });
      contentIds = new Set();
      for (const r of out.results) {
        matchCounts.set(r.docId, r.matchCount);
        contentIds.add(r.docId);
      }
    }

    candidates = candidates.filter(({ meta }) => {
      if (wantsName && test(regex, meta.fileName)) return true;
      if (wantsTags && meta.tags.some((t) => test(regex, t))) return true;
      if (wantsContent && contentIds?.has(meta.id)) return true;
      return false;
    });
  }

  const docs = candidates.map((c) => c.meta);
  sortDocs(docs, filter);
  return { docs, matchCounts, contentQueryActive: wantsContent };
}

/** Distinct tags across the given documents (sorted). */
export function collectTags(docs: StoredDocument[]): string[] {
  const set = new Set<string>();
  for (const d of docs) for (const t of d.tags) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Distinct file extensions across the given documents (sorted). */
export function collectFileTypes(docs: StoredDocument[]): string[] {
  const set = new Set<string>();
  for (const d of docs) set.add(extOf(d.fileName));
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Count how many filters (besides the query) are currently active. */
export function activeFilterCount(f: GlobalFilter): number {
  let n = 0;
  if (f.fileTypes.length) n++;
  if (f.tags.length) n++;
  if (f.status !== 'any') n++;
  if (f.minSize != null || f.maxSize != null) n++;
  if (f.minPages != null || f.maxPages != null) n++;
  if (f.addedAfter || f.addedBefore) n++;
  return n;
}
