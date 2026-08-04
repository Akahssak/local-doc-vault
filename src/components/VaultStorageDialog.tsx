import { useEffect, useMemo, useState } from 'react';
import * as opfs from '@/lib/storage/opfs';
import type { VaultNode } from '@/lib/storage/opfs';
import { formatBytes } from '@/lib/util';
import {
  CloseIcon,
  CodeIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  SpinnerIcon,
} from '@/components/Icons';
import { toast } from '@/components/Toast';

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

  useEffect(() => {
    let alive = true;
    setLoading(true);
    opfs
      .listVaultTree()
      .then(async (t) => {
        if (!alive) return;
        setTree(t);
        // Find which .json sidecars hold manual edits so we can color them amber.
        const edited = await collectEditedJsonPaths(t);
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
          ) : (
            <div className="space-y-0.5">
              {tree.map((node) => (
                <TreeItem key={node.path} node={node} depth={0} editedPaths={editedPaths} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
