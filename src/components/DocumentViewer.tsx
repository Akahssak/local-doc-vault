import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentJson, SearchOptions, StoredDocument } from '@/types';
import { compileQuery, getRanges } from '@/lib/search/search';
import { getOriginalUrl } from '@/lib/ingest';
import { Highlight } from '@/components/Highlight';
import {
  CloseIcon,
  CodeIcon,
  DownloadIcon,
  FileIcon,
  TagIcon,
  TrashIcon,
} from '@/components/Icons';
import { formatBytes, formatDate, classNames } from '@/lib/util';

interface Props {
  doc: StoredDocument;
  json: DocumentJson | undefined;
  searchOptions: SearchOptions;
  initialPage?: number;
  onClose: () => void;
  onDelete: (doc: StoredDocument) => void;
  onSaveTags: (doc: StoredDocument, tags: string[]) => void;
}

export function DocumentViewer({
  doc,
  json,
  searchOptions,
  initialPage,
  onClose,
  onDelete,
  onSaveTags,
}: Props) {
  const [view, setView] = useState<'text' | 'json'>('text');
  const [tags, setTags] = useState<string[]>(doc.tags);
  const [tagInput, setTagInput] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const regex = useMemo(() => {
    if (!searchOptions.query.trim()) return null;
    return compileQuery(searchOptions).regex;
  }, [searchOptions]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Jump to the requested page once content is shown.
  useEffect(() => {
    if (view !== 'text' || !initialPage) return;
    const el = pageRefs.current[initialPage];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [initialPage, view]);

  const tagsChanged = useMemo(
    () => tags.join('\u0000') !== doc.tags.join('\u0000'),
    [tags, doc.tags],
  );

  function addTag() {
    const value = tagInput.trim().replace(/,$/, '').trim();
    if (value && !tags.includes(value)) setTags([...tags, value]);
    setTagInput('');
  }

  async function downloadOriginal() {
    const url = await getOriginalUrl(doc);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function exportJson() {
    if (!json) return;
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.fileName.replace(/\.[^.]+$/, '')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="card flex h-full max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-800/70 text-brand-300 ring-1 ring-slate-700">
              <FileIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-50" title={doc.fileName}>
                {doc.fileName}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {doc.pageCount ? `${doc.pageCount} pages · ` : ''}
                {formatBytes(doc.size)} · added {formatDate(doc.addedAt)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-50"
            title="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2.5">
          <TagIcon className="h-4 w-4 text-slate-500" />
          {tags.map((t) => (
            <span key={t} className="chip">
              {t}
              <button
                className="text-slate-500 hover:text-rose-300"
                onClick={() => setTags(tags.filter((x) => x !== t))}
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            className="min-w-[8rem] flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none"
            placeholder="Add tag…"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag();
              }
            }}
          />
          {tagsChanged && (
            <button
              className="btn-primary !px-2.5 !py-1 text-xs"
              onClick={() => onSaveTags(doc, tags)}
            >
              Save tags
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2.5">
          <div className="flex rounded-lg border border-slate-700 p-0.5">
            <button
              onClick={() => setView('text')}
              className={classNames(
                'rounded-md px-3 py-1 text-xs font-medium transition',
                view === 'text' ? 'bg-slate-700 text-slate-50' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              Text
            </button>
            <button
              onClick={() => setView('json')}
              className={classNames(
                'rounded-md px-3 py-1 text-xs font-medium transition',
                view === 'json' ? 'bg-slate-700 text-slate-50' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <span className="inline-flex items-center gap-1">
                <CodeIcon className="h-3.5 w-3.5" /> JSON
              </span>
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={downloadOriginal}>
              <DownloadIcon className="h-4 w-4" /> Original
            </button>
            <button
              className="btn-ghost !px-2.5 !py-1.5 text-xs"
              onClick={exportJson}
              disabled={!json}
            >
              <DownloadIcon className="h-4 w-4" /> JSON
            </button>
            <button
              className="btn-danger !px-2.5 !py-1.5 text-xs"
              onClick={() => onDelete(doc)}
            >
              <TrashIcon className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>

        {/* Body */}
        <div ref={bodyRef} className="flex-1 overflow-auto p-4">
          {doc.status === 'error' && (
            <p className="rounded-lg border border-rose-800/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              Extraction failed: {doc.error ?? 'unknown error'}. The original file is still stored
              and downloadable.
            </p>
          )}

          {view === 'json' ? (
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-950/70 p-3 font-mono text-xs leading-relaxed text-slate-300">
              {json ? JSON.stringify(json, null, 2) : 'No extracted content.'}
            </pre>
          ) : !json || json.pages.length === 0 ? (
            <p className="text-sm text-slate-500">No extractable text for this file.</p>
          ) : (
            <div className="space-y-6">
              {json.pages.map((page) => (
                <div
                  key={page.pageNumber}
                  ref={(el) => {
                    pageRefs.current[page.pageNumber] = el;
                  }}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                      Page {page.pageNumber}
                    </span>
                    <span className="h-px flex-1 bg-slate-800" />
                  </div>
                  <div className="space-y-0.5 font-mono text-xs leading-relaxed text-slate-300">
                    {page.lines.map((line) => (
                      <p key={line.index} className="break-words">
                        {regex ? (
                          <Highlight text={line.text} ranges={getRanges(regex, line.text)} />
                        ) : (
                          line.text
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
