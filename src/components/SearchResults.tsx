import { useState } from 'react';
import type { DocumentSearchResult } from '@/types';
import { Highlight } from '@/components/Highlight';
import { FileIcon, SearchIcon } from '@/components/Icons';
import { classNames } from '@/lib/util';

interface Props {
  results: DocumentSearchResult[];
  onOpen: (docId: string, pageNumber: number) => void;
}

export function SearchResults({ results, onOpen }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (results.length === 0) {
    return (
      <div className="card grid place-items-center px-6 py-16 text-center">
        <SearchIcon className="mb-3 h-10 w-10 text-slate-600" />
        <p className="text-sm text-slate-400">No matches found.</p>
        <p className="text-xs text-slate-600">Try a different term, or toggle regex.</p>
      </div>
    );
  }

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      {results.map((res) => {
        const isCollapsed = collapsed.has(res.docId);
        return (
          <div key={res.docId} className="card overflow-hidden">
            <button
              onClick={() => toggle(res.docId)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-900"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <FileIcon className="h-4 w-4 shrink-0 text-brand-300" />
                <span className="truncate text-sm font-medium text-slate-100">
                  {res.fileName}
                </span>
              </div>
              <span className="chip shrink-0 border-brand-700/60 bg-brand-950/40 text-brand-200">
                {res.matchCount} match{res.matchCount === 1 ? '' : 'es'}
              </span>
            </button>

            {!isCollapsed && (
              <ul className="divide-y divide-slate-800/70 border-t border-slate-800">
                {res.matches.map((m, i) => (
                  <li key={i}>
                    <button
                      onClick={() => onOpen(m.docId, m.pageNumber)}
                      className={classNames(
                        'flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-slate-900',
                      )}
                    >
                      <span className="mt-0.5 shrink-0 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                        p{m.pageNumber}
                      </span>
                      <span className="min-w-0 break-words font-mono text-xs leading-relaxed text-slate-300">
                        <Highlight text={m.lineText} ranges={m.ranges} />
                      </span>
                    </button>
                  </li>
                ))}
                {res.matchCount > res.matches.length && (
                  <li className="px-4 py-2 text-center text-[11px] text-slate-500">
                    Showing first {res.matches.length} of {res.matchCount} matches — open the
                    document to see all.
                  </li>
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
