import type { DocStatus, StoredDocument } from '@/types';
import { FolderIcon, TrashIcon, EyeIcon, TagIcon } from '@/components/Icons';
import { formatBytes, formatDate, classNames, extOf } from '@/lib/util';

function StatusBadge({ status }: { status: DocStatus }) {
  const map: Record<DocStatus, string> = {
    ready: 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300',
    processing: 'border-amber-800/60 bg-amber-950/40 text-amber-300',
    error: 'border-rose-800/60 bg-rose-950/40 text-rose-300',
  };
  return (
    <span className={classNames('rounded-full border px-2 py-0.5 text-[10px] font-medium', map[status])}>
      {status}
    </span>
  );
}

interface Props {
  docs: StoredDocument[];
  matchCounts?: Map<string, number>;
  onOpen: (doc: StoredDocument) => void;
  onDelete: (doc: StoredDocument) => void;
}

export function DocumentList({ docs, matchCounts, onOpen, onDelete }: Props) {
  if (docs.length === 0) {
    return (
      <div className="card grid place-items-center px-6 py-16 text-center">
        <FolderIcon className="mb-3 h-10 w-10 text-slate-600" />
        <p className="text-sm text-slate-400">No documents match.</p>
        <p className="text-xs text-slate-600">Upload a PDF or clear the filters.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {docs.map((doc) => {
        const count = matchCounts?.get(doc.id);
        const ext = extOf(doc.fileName).replace('.', '').toUpperCase() || 'FILE';
        return (
          <div
            key={doc.id}
            onClick={() => onOpen(doc)}
            className="card group flex cursor-pointer flex-col gap-3 p-4 transition hover:border-brand-600/60 hover:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-800/70 text-brand-300 ring-1 ring-slate-700">
                <FolderIcon className="h-5 w-5" />
                <span className="absolute -bottom-1.5 -right-1.5 rounded bg-brand-600 px-1 text-[8px] font-bold text-white">
                  {ext}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {typeof count === 'number' && (
                  <span className="chip border-brand-700/60 bg-brand-950/40 text-brand-200">
                    {count} match{count === 1 ? '' : 'es'}
                  </span>
                )}
                <StatusBadge status={doc.status} />
              </div>
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100" title={doc.fileName}>
                {doc.fileName}
              </p>
              {doc.company && (
                <p
                  className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-brand-300"
                  title={`Company folder: ${doc.company}`}
                >
                  <FolderIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{doc.company}</span>
                </p>
              )}
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                {doc.preview || 'No extractable text.'}
              </p>
            </div>

            {doc.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <TagIcon className="h-3 w-3 text-slate-600" />
                {doc.tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-slate-700 bg-slate-800/50 px-1.5 py-0.5 text-[10px] text-slate-300"
                  >
                    {t}
                  </span>
                ))}
                {doc.tags.length > 4 && (
                  <span className="text-[10px] text-slate-600">+{doc.tags.length - 4}</span>
                )}
              </div>
            )}

            <div className="mt-auto flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>{doc.pageCount ? `${doc.pageCount}p` : '—'}</span>
                <span>·</span>
                <span>{formatBytes(doc.size)}</span>
                <span>·</span>
                <span>{formatDate(doc.addedAt)}</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-brand-300"
                  title="Open"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(doc);
                  }}
                >
                  <EyeIcon className="h-4 w-4" />
                </button>
                <button
                  className="rounded-md p-1.5 text-slate-400 hover:bg-rose-950/60 hover:text-rose-300"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(doc);
                  }}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
