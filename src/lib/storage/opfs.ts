/**
 * Origin Private File System (OPFS) wrapper.
 *
 * OPFS gives us a real on-device directory that is private to THIS web app's
 * origin. No other website, native app, or the user's normal file browser can
 * read it — it is the "folder that only the app has access to". It persists
 * across sessions and works on desktop and Android (Chrome/Edge/Firefox and
 * Safari 16.4+).
 */
import { APP_CONFIG } from '@/config';

export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.storage &&
    typeof navigator.storage.getDirectory === 'function' &&
    typeof FileSystemFileHandle !== 'undefined' &&
    typeof FileSystemFileHandle.prototype.createWritable === 'function'
  );
}

/** The fixed name of the vault folder (same on every visit for this device). */
export function getVaultDirName(): string {
  return APP_CONFIG.vaultDir;
}

async function getVaultDir(): Promise<FileSystemDirectoryHandle> {
  if (!isOpfsSupported()) {
    throw new Error(
      'This browser does not support private on-device storage (OPFS). ' +
        'Use a recent version of Chrome, Edge, Firefox, or Safari 16.4+.'
    );
  }
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(APP_CONFIG.vaultDir, { create: true });
}

/**
 * Split a vault-relative path such as `Continental/list.pdf` into its parent
 * directory segments and the final file name. Empty/whitespace segments are
 * dropped so a stray leading/trailing slash never creates a nameless folder.
 */
function splitPath(path: string): { segments: string[]; name: string } {
  const parts = path.split('/').map((p) => p.trim()).filter(Boolean);
  const name = parts.pop() ?? path;
  return { segments: parts, name };
}

/**
 * Walk the nested company sub-folders under the vault root, optionally creating
 * each one. This is what lets every company have its own directory.
 */
async function resolveDir(
  segments: string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let dir = await getVaultDir();
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create });
  }
  return dir;
}

/** Write bytes to `path` inside the private vault directory (overwrites). */
export async function writeFile(path: string, data: Blob | ArrayBuffer): Promise<void> {
  const { segments, name } = splitPath(path);
  const dir = await resolveDir(segments, true);
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
}

/** Read a stored file back as a `File` (a Blob with name/size/type). */
export async function readFile(path: string): Promise<File> {
  const { segments, name } = splitPath(path);
  const dir = await resolveDir(segments, false);
  const handle = await dir.getFileHandle(name);
  return handle.getFile();
}

/** Delete a stored file. Missing files are ignored. */
export async function deleteFile(path: string): Promise<void> {
  try {
    const { segments, name } = splitPath(path);
    const dir = await resolveDir(segments, false);
    await dir.removeEntry(name);
  } catch {
    /* already gone */
  }
}

/** True if a file with `path` exists inside the vault. */
export async function fileExists(path: string): Promise<boolean> {
  try {
    const { segments, name } = splitPath(path);
    const dir = await resolveDir(segments, false);
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * Return a file name that does not yet exist inside `dirPath`, keeping the
 * ORIGINAL name whenever possible. Only when a *different* file already occupies
 * that name is a ` (2)`, ` (3)`… suffix added — so the company's documents keep
 * their real names and nothing is silently overwritten.
 */
export async function uniqueName(dirPath: string, name: string): Promise<string> {
  const join = (n: string) => (dirPath ? `${dirPath}/${n}` : n);
  if (!(await fileExists(join(name)))) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!(await fileExists(join(candidate)))) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}

/** Read a UTF-8 text file from the vault, or `null` if it does not exist. */
export async function readTextFile(path: string): Promise<string | null> {
  try {
    const { segments, name } = splitPath(path);
    const dir = await resolveDir(segments, false);
    const handle = await dir.getFileHandle(name);
    return await (await handle.getFile()).text();
  } catch {
    return null;
  }
}

/** Write a UTF-8 text file into the vault (overwrites). */
export async function writeTextFile(path: string, text: string): Promise<void> {
  await writeFile(path, new Blob([text], { type: 'application/json' }));
}

/** Read + parse a JSON file from the vault, or `null` if missing/corrupt. */
export async function readJson<T>(path: string): Promise<T | null> {
  const text = await readTextFile(path);
  if (text == null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Serialise + write a value as pretty JSON into the vault. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeTextFile(path, JSON.stringify(value, null, 2));
}

/** Best-effort on-device usage/quota in bytes. */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number }> {
  if (navigator.storage?.estimate) {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  }
  return { usage: 0, quota: 0 };
}

/** A node in the vault folder tree — either a folder (with children) or a file. */
export interface VaultNode {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  size?: number;
  children?: VaultNode[];
}

async function walkDir(dir: FileSystemDirectoryHandle, prefix: string): Promise<VaultNode[]> {
  const nodes: VaultNode[] = [];
  // `entries()` is an async iterator of [name, handle] not yet in the TS lib defs.
  const entries = (
    dir as unknown as { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }
  ).entries();
  for await (const [name, handle] of entries) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      nodes.push({
        name,
        path,
        kind: 'directory',
        children: await walkDir(handle as FileSystemDirectoryHandle, path),
      });
    } else {
      const file = await (handle as FileSystemFileHandle).getFile();
      nodes.push({ name, path, kind: 'file', size: file.size });
    }
  }
  // Folders first, then files; each group sorted alphabetically.
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

/**
 * Recursively list everything inside the vault folder as a tree:
 * company folders → original files + their `.json` sidecars.
 * Returns an empty array when OPFS isn't supported.
 */
export async function listVaultTree(): Promise<VaultNode[]> {
  if (!isOpfsSupported()) return [];
  const root = await getVaultDir();
  return walkDir(root, '');
}

/**
 * Delete the ENTIRE vault folder (originals + sidecars + manifest) from OPFS.
 * Best-effort: missing folders are ignored. Used by the "reset vault" flow so a
 * locked-out admin can start over with a completely empty on-device store.
 */
export async function deleteVaultDir(): Promise<void> {
  if (!isOpfsSupported()) return;
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(APP_CONFIG.vaultDir, { recursive: true });
  } catch {
    /* folder already gone */
  }
}

/**
 * Ask the browser to make storage persistent so it is not evicted under
 * storage pressure. Returns whether persistence is granted.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage?.persist && navigator.storage?.persisted) {
    if (await navigator.storage.persisted()) return true;
    return navigator.storage.persist();
  }
  return false;
}
