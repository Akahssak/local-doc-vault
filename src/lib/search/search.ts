/**
 * Regex / text search over extracted document content.
 * Pure functions so they are easy to reason about and test.
 */
import { APP_CONFIG } from '@/config';
import type {
  DocumentJson,
  DocumentSearchResult,
  SearchMatch,
  SearchOptions,
  StoredDocument,
} from '@/types';

export interface CompiledQuery {
  regex: RegExp | null;
  error?: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Turn user options into a RegExp (or a friendly error). */
export function compileQuery(options: SearchOptions): CompiledQuery {
  const query = options.query.trim();
  if (!query) return { regex: null };

  let pattern = options.useRegex ? query : escapeRegExp(query);
  if (options.wholeWord) pattern = `\\b(?:${pattern})\\b`;

  const flags = 'g' + (options.caseSensitive ? '' : 'i');
  try {
    return { regex: new RegExp(pattern, flags) };
  } catch (err) {
    return { regex: null, error: (err as Error).message };
  }
}

/** Find all match ranges of `regex` within `text`. Safe against empty matches. */
export function getRanges(regex: RegExp, text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = regex.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    ranges.push([start, end]);
    if (m[0].length === 0) regex.lastIndex++; // avoid infinite loop on empty match
    if (++guard > 5000) break;
  }
  return ranges;
}

export interface SearchOutput {
  results: DocumentSearchResult[];
  totalMatches: number;
  error?: string;
}

/**
 * Run a search across the provided document entries.
 * Returns per-document results sorted by match count (desc).
 */
export function searchDocuments(
  entries: Array<{ meta: StoredDocument; json: DocumentJson | undefined }>,
  options: SearchOptions,
): SearchOutput {
  const { regex, error } = compileQuery(options);
  if (error) return { results: [], totalMatches: 0, error };
  if (!regex) return { results: [], totalMatches: 0 };

  const scope =
    options.docIds && options.docIds.length ? new Set(options.docIds) : null;

  const results: DocumentSearchResult[] = [];
  let totalMatches = 0;

  for (const { meta, json } of entries) {
    if (scope && !scope.has(meta.id)) continue;
    if (!json) continue;

    const matches: SearchMatch[] = [];
    let count = 0;

    for (const page of json.pages) {
      for (const line of page.lines) {
        if (!line.text) continue;
        const ranges = getRanges(regex, line.text);
        if (ranges.length === 0) continue;
        count += ranges.length;
        if (matches.length < APP_CONFIG.maxMatchesPerDoc) {
          matches.push({
            docId: meta.id,
            fileName: meta.fileName,
            pageNumber: page.pageNumber,
            lineIndex: line.index,
            lineText: line.text,
            ranges,
          });
        }
      }
    }

    if (count > 0) {
      results.push({ docId: meta.id, fileName: meta.fileName, matchCount: count, matches });
      totalMatches += count;
    }
  }

  results.sort((a, b) => b.matchCount - a.matchCount);
  return { results, totalMatches };
}

export interface Segment {
  text: string;
  match: boolean;
}

/** Split a line into highlighted / plain segments for rendering. */
export function toSegments(text: string, ranges: Array<[number, number]>): Segment[] {
  if (ranges.length === 0) return [{ text, match: false }];
  const segments: Segment[] = [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [s, e] of sorted) {
    const start = Math.max(s, pos);
    if (start > pos) segments.push({ text: text.slice(pos, start), match: false });
    if (e > start) segments.push({ text: text.slice(start, e), match: true });
    pos = Math.max(pos, e);
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), match: false });
  return segments;
}
