import { useEffect, useMemo, useState } from 'react';
import * as opfs from '@/lib/storage/opfs';
import type { VaultNode } from '@/lib/storage/opfs';
import { formatBytes } from '@/lib/util';
import {
  CloseIcon,
  CodeIcon,
  DownloadIcon,
  FileIcon,
  FilterIcon,
  FolderIcon,
  SearchIcon,
  SpinnerIcon,
} from '@/components/Icons';
import { toast } from '@/components/Toast';

/**
 * A tiny JSON file kept in the vault root that remembers recent searches so the
 * browser can suggest them (debounced) next time it opens. Using the vault
 * (OPFS) as the single common store means both edit-detection AND the search
 * history come from the same on-device place.
 */
const SEARCH_HISTORY_FILE = '_search-history.json';
const MAX_HISTORY = 8;

interface Props {
  onClose: () => void;
  /** The vault folder name shown to the user (from the manifest). */
  folderName: string;
  /** Bump to force a re-read of the tree (e.g. doc count changes). */
  refreshKey: number;
}

/** Recursively sum file sizes in a subtree. */
function totalSize(nodes: VaultNode[]): number {
  return nodes.reduce(
    (sum, n) => sum + (n.kind === 'file' ? (n.size ?? 0) : totalSize(n.children ?? [])),
    0,
  );
}

/** Download a single stored file straight out of OPFS. */
async function download(node: VaultNode) {
  try {
    const file = await opfs.readFile(node.path);
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = node.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast((err as Error).message, 'error');
  }
}

/**
 * Walk the tree, read every `.json` sidecar, and collect the paths of those that
 * carry hand-corrected rows (a non-empty `editedRecords` section). These files
 * are shown in amber so the user can tell edited data apart from the raw,
 * as-extracted JSON at a glance.
 */
async function collectEditedJsonPaths(nodes: VaultNode[]): Promise<Set<string>> {
  const edited = new Set<string>();
  const jsonPaths: string[] = [];
  const walk = (list: VaultNode[]) => {
    for (const n of list) {
      if (n.kind === 'directory') walk(n.children ?? []);
      else if (n.name.toLowerCase().endsWith('.json')) jsonPaths.push(n.path);
    }
  };
  walk(nodes);
  await Promise.all(
    jsonPaths.map(async (path) => {
      const data = await opfs.readJson<{ editedRecords?: unknown[] }>(path).catch(() => null);
      if (data && Array.isArray(data.editedRecords) && data.editedRecords.length > 0) {
        edited.add(path);
      }
    }),
  );
  return edited;
}

/** Hide internal bookkeeping files (like the search-history JSON) from the tree. */
function pruneHidden(nodes: VaultNode[]): VaultNode[] {
  return nodes.filter((n) => n.name !== SEARCH_HISTORY_FILE);
}

/**
 * Filter the tree by a name query and/or the "edited only" toggle. A folder is
 * kept when any descendant survives; if the folder name itself matches the
 * query, its children are kept without also needing to match the text.
 */
function filterTree(
  nodes: VaultNode[],
  query: string,
  editedOnly: boolean,
  editedPaths: Set<string>,
): VaultNode[] {
  const needle = query.trim().toLowerCase();
  const out: VaultNode[] = [];
  for (const n of nodes) {
    if (n.kind === 'directory') {
      const nameMatch = needle ? n.name.toLowerCase().includes(needle) : false;
      const kids = filterTree(n.children ?? [], nameMatch ? '' : query, editedOnly, editedPaths);
      if (kids.length > 0) out.push({ ...n, children: kids });
    } else {
      const isJson = n.name.toLowerCase().endsWith('.json');
      const passEdited = !editedOnly || (isJson && editedPaths.has(n.path));
      const passQuery = !needle || n.name.toLowerCase().includes(needle);
      if (passEdited && passQuery) out.push(n);
    }
  }
  return out;
}

/** Load the saved search terms from the vault (empty when missing). */
async function loadSearchHistory(): Promise<string[]> {
  const data = await opfs.readJson<{ queries?: string[] }>(SEARCH_HISTORY_FILE).catch(() => null);
  return Array.isArray(data?.queries) ? data!.queries : [];
}

/** Persist the search terms back into the vault JSON. */
async function saveSearchHistory(list: string[]): Promise<void> {
  await opfs
    .writeJson(SEARCH_HISTORY_FILE, { queries: list, updatedAt: new Date().toISOString() })
    .catch(() => {});
}

function TreeItem({
  node,
  depth,
  editedPaths,
}: {
  node: VaultNode;
  depth: number;
  editedPaths: Set<string>;
}) {
  const isJson = node.name.toLowerCase().endsWith('.json');
  const isEdited = isJson && editedPaths.has(node.path);
  const pad = { paddingLeft: `${depth * 16 + 12}px` };

  if (node.kind === 'directory') {
    const children = node.children ?? [];
    const fileCount = children.filter((c) => c.kind === 'file').length;
    return (
      <div>
        <div
          className="flex items-center gap-2 rounded-md py-1.5 pr-3 text-sm text-slate-100"
          style={pad}
        >
          <FolderIcon className="h-4 w-4 shrink-0 text-brand-300" />
          <span className="truncate font-medium">{node.name}</span>
          <span className="ml-auto shrink-0 text-[11px] text-slate-500">
            {fileCount} file{fileCount === 1 ? '' : 's'} · {formatBytes(totalSize(children))}
          </span>
        </div>
        {children.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} editedPaths={editedPaths} />
        ))}
      </div>
    );
  }

  // Color coding: amber = JSON that holds manual edits, green = raw extracted
  // JSON, slate = the original uploaded file.
  const iconClass = isEdited ? 'text-amber-300' : isJson ? 'text-emerald-300' : 'text-slate-400';
  const textClass = isEdited
    ? 'text-amber-200'
    : isJson
      ? 'text-emerald-200/90'
      : 'text-slate-200';

  return (
    <div
      className="group flex items-center gap-2 rounded-md py-1.5 pr-2 text-sm hover:bg-slate-800/50"
      style={pad}
    >
      {isJson ? (
        <CodeIcon className={`h-4 w-4 shrink-0 ${iconClass}`} />
      ) : (
        <FileIcon className={`h-4 w-4 shrink-0 ${iconClass}`} />
      )}
      <span className={`truncate ${textClass}`}>{node.name}</span>
      {isEdited && (
        <span
          className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-500/30"
          title="This JSON contains rows you edited by hand."
        >
          edited
        </span>
      )}
      <span className="ml-auto shrink-0 text-[11px] text-slate-500">
        {formatBytes(node.size ?? 0)}
      </span>
      <button
        type="button"
        onClick={() => download(node)}
        title={`Download ${node.name}`}
        className="shrink-0 rounded-md p-1 text-slate-500 opacity-0 transition hover:bg-slate-700 hover:text-white group-hover:opacity-100"
      >
        <DownloadIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export function VaultStorageDialog({ onClose, folderName, refreshKey }: Props) {
  const [tree, setTree] = useState<VaultNode[] | null>(null);
  const [editedPaths, setEditedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Search + filter state.
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [editedOnly, setEditedOnly] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    opfs
      .listVaultTree()
      .then(async (t) => {
        if (!alive) return;
        const visible = pruneHidden(t);
        setTree(visible);
        // Find which .json sidecars hold manual edits so we can color them amber.
        const edited = await collectEditedJsonPaths(visible);
        if (alive) setEditedPaths(edited);
      })
      .catch(() => {
        if (alive) setTree([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  // Load the remembered searches once, straight from the vault JSON.
  useEffect(() => {
    let alive = true;
    loadSearchHistory().then((h) => alive && setHistory(h));
    return () => {
      alive = false;
    };
  }, []);

  // Debounce the raw input: only after the user pauses (300ms) do we apply the
  // filter and remember the term. This keeps typing smooth on large vaults.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery(query);
      const term = query.trim();
      if (term.length >= 2) {
        setHistory((prev) => {
          if (prev[0]?.toLowerCase() === term.toLowerCase()) return prev;
          const next = [
            term,
            ...prev.filter((x) => x.toLowerCase() !== term.toLowerCase()),
          ].slice(0, MAX_HISTORY);
          void saveSearchHistory(next);
          return next;
        });
      }
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const stats = useMemo(() => {
    const nodes = tree ?? [];
    const folders = nodes.filter((n) => n.kind === 'directory').length;
    let files = 0;
    const countFiles = (list: VaultNode[]) =>
      list.forEach((n) =>
        n.kind === 'file' ? (files += 1) : countFiles(n.children ?? []),
      );
    countFiles(nodes);
    return { folders, files, size: totalSize(nodes) };
  }, [tree]);

  // The tree actually shown, after applying the search term + edited-only filter.
  const view = useMemo(() => {
    if (!tree) return null;
    if (!debouncedQuery.trim() && !editedOnly) return tree;
    return filterTree(tree, debouncedQuery, editedOnly, editedPaths);
  }, [tree, debouncedQuery, editedOnly, editedPaths]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-50">
            <FolderIcon className="h-4 w-4 text-brand-300" />
            Storage folder
            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-brand-300">
              {folderName}/
            </span>
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-800 bg-slate-900/40 px-4 py-3 text-[11px] leading-relaxed text-slate-400">
          This is the app's <span className="text-slate-200">private on-device folder</span> (OPFS).
          It lives inside the browser and isn't visible in Windows Explorer for privacy. Files are
          grouped into a folder per company; each original file is saved next to its extracted{' '}
          <span className="font-mono text-emerald-300">.json</span> data.
          {/* Legend: explain what each color means so the user can read the tree. */}
          <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-400" /> Original file
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-300" /> Extracted JSON
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-300" /> JSON with your edits
            </span>
          </span>
          {tree && tree.length > 0 && (
            <span className="mt-1 block text-slate-500">
              {stats.folders} compan{stats.folders === 1 ? 'y' : 'ies'} · {stats.files} file
              {stats.files === 1 ? '' : 's'} · {formatBytes(stats.size)} total
            </span>
          )}
        </div>

        {/* Search + filter toolbar. The term is remembered in the vault JSON and
            offered back as suggestions through the datalist below. */}
        {tree && tree.length > 0 && (
          <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                list="vault-search-history"
                placeholder="Search files and folders…"
                className="input !py-1.5 !pl-9 !pr-8 text-sm"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  title="Clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-white"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              )}
              <datalist id="vault-search-history">
                {history.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
            </div>
            <button
              type="button"
              onClick={() => setEditedOnly((v) => !v)}
              title="Show only JSON files that contain your edits"
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                editedOnly
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <FilterIcon className="h-3.5 w-3.5" />
              Edited only
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <SpinnerIcon className="h-4 w-4 animate-spin" /> Reading folder…
            </div>
          ) : !tree || tree.length === 0 ? (
            <div className="grid place-items-center px-6 py-16 text-center">
              <FolderIcon className="mb-3 h-10 w-10 text-slate-600" />
              <p className="text-sm text-slate-400">The vault folder is empty.</p>
              <p className="text-xs text-slate-600">
                Upload a document to see it stored here by company.
              </p>
            </div>
          ) : view && view.length === 0 ? (
            <div className="grid place-items-center px-6 py-16 text-center">
              <SearchIcon className="mb-3 h-10 w-10 text-slate-600" />
              <p className="text-sm text-slate-400">
                {editedOnly ? 'No edited JSON files yet.' : 'No files match your search.'}
              </p>
              <p className="text-xs text-slate-600">
                {editedOnly
                  ? 'Edit a row in the data table and it will show here in amber.'
                  : 'Try a different word, or clear the filter.'}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {(view ?? []).map((node) => (
                <TreeItem key={node.path} node={node} depth={0} editedPaths={editedPaths} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
