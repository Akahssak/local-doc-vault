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

/** Write bytes to `path` inside the private vault directory (overwrites). */
export async function writeFile(path: string, data: Blob | ArrayBuffer): Promise<void> {
  const dir = await getVaultDir();
  const handle = await dir.getFileHandle(path, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
}

/** Read a stored file back as a `File` (a Blob with name/size/type). */
export async function readFile(path: string): Promise<File> {
  const dir = await getVaultDir();
  const handle = await dir.getFileHandle(path);
  return handle.getFile();
}

/** Delete a stored file. Missing files are ignored. */
export async function deleteFile(path: string): Promise<void> {
  try {
    const dir = await getVaultDir();
    await dir.removeEntry(path);
  } catch {
    /* already gone */
  }
}

/** True if a file with `path` exists inside the vault. */
export async function fileExists(path: string): Promise<boolean> {
  try {
    const dir = await getVaultDir();
    await dir.getFileHandle(path);
    return true;
  } catch {
    return false;
  }
}

/** Read a UTF-8 text file from the vault, or `null` if it does not exist. */
export async function readTextFile(path: string): Promise<string | null> {
  try {
    const dir = await getVaultDir();
    const handle = await dir.getFileHandle(path);
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
