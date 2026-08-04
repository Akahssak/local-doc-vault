/**
 * Shared-folder vault sync (File System Access API).
 *
 * OPFS + IndexedDB are private to a single browser profile, so two browsers on
 * the same PC normally cannot see each other's vault. This module lets the admin
 * pick a REAL folder on disk (e.g. C:\TyreVault). Because that folder lives on
 * the actual file system, every Chromium browser on the machine can open the
 * same folder and share ONE vault — including the (hashed) admin password.
 *
 * Design: manual "Push" / "Pull".
 *  - Push  = write the whole vault (documents + extracted JSON + settings +
 *            credential + original files) into the folder as `vault-sync.json`
 *            plus an `originals/` sub-folder.
 *  - Pull  = read that folder back into this browser's IndexedDB + OPFS so it
 *            can log in with the shared password and see the shared data.
 *
 * Availability: Chromium desktop only (Chrome/Edge). Firefox/Safari and mobile
 * do not implement `showDirectoryPicker`, so the feature is hidden there.
 */
import type { DocumentJson, StoredDocument } from '@/types';
import * as db from '@/lib/storage/db';
import * as opfs from '@/lib/storage/opfs';

const HANDLE_KEY = 'sharedFolderHandle';
const NAME_KEY = 'sharedFolderName';
const SYNCED_AT_KEY = 'sharedFolderSyncedAt';
const SYNC_FILE = 'vault-sync.json';
const META_FILE = 'vault-sync.meta.json';
const ORIGINALS_DIR = 'originals';
const SYNC_SCHEMA = 1;
/** Marker written next to the vault so any browser can recognise it as ours. */
const APP_MARK = 'local-doc-vault';

/** The picked folder handle, with the permission methods the DOM lib omits. */
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
};

interface VaultSync {
  schema: number;
  updatedAt: string;
  settings: Array<{ key: string; value: unknown }>;
  documents: StoredDocument[];
  content: Array<{ id: string; json: DocumentJson }>;
}

/** True when this browser can pick a real on-disk folder. */
export function isSharedFolderSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Name of the currently-connected shared folder, or null when none. */
export async function getSharedFolderName(): Promise<string | null> {
  const name = await db.getSetting<string>(NAME_KEY);
  return name ?? null;
}

/** The saved handle from a previous session (may need permission re-granted). */
async function getSavedHandle(): Promise<DirHandle | null> {
  const handle = await db.getSetting<DirHandle>(HANDLE_KEY);
  return handle ?? null;
}

/** Make sure we still hold read/write permission, prompting inside a user gesture. */
async function ensurePermission(handle: DirHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if (handle.queryPermission && (await handle.queryPermission(opts)) === 'granted') return true;
  if (handle.requestPermission && (await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

/** Prompt the user to choose a folder and remember it. Returns its name. */
export async function connectSharedFolder(): Promise<string> {
  const picker = (
    window as unknown as {
      showDirectoryPicker: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<DirHandle>;
    }
  ).showDirectoryPicker;
  const handle = await picker({ mode: 'readwrite' });
  if (!(await ensurePermission(handle))) {
    throw new Error('Permission to use the folder was not granted.');
  }
  await db.setSetting(HANDLE_KEY, handle);
  await db.setSetting(NAME_KEY, handle.name);
  return handle.name;
}

/** Forget the connected folder (does not delete anything on disk). */
export async function disconnectSharedFolder(): Promise<void> {
  await db.setSetting(HANDLE_KEY, undefined);
  await db.setSetting(NAME_KEY, undefined);
}

/** Resolve a usable handle: the saved one if permitted, else re-pick. */
async function resolveHandle(): Promise<DirHandle> {
  const saved = await getSavedHandle();
  if (saved && (await ensurePermission(saved))) return saved;
  // Saved handle missing or permission lost — ask the user to pick again.
  const name = await connectSharedFolder();
  const handle = await getSavedHandle();
  if (!handle) throw new Error(`Could not open folder "${name}".`);
  return handle;
}

async function writeFileInDir(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: Blob | ArrayBuffer | string,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(data as FileSystemWriteChunkType);
  } finally {
    await writable.close();
  }
}

/**
 * PUSH: write this browser's entire vault into the shared folder so other
 * browsers on the PC can pull it. Returns the number of documents written.
 */
export async function pushToSharedFolder(): Promise<{ folder: string; documents: number }> {
  const dir = await resolveHandle();

  const [settings, documents, content] = await Promise.all([
    db.getAllSettings(),
    db.getAllDocuments(),
    db.getAllContent(),
  ]);

  // Don't copy the folder handle itself back into the folder.
  const cleanSettings = settings.filter((s) => s.key !== HANDLE_KEY && s.key !== NAME_KEY);

  const snapshot: VaultSync = {
    schema: SYNC_SCHEMA,
    updatedAt: new Date().toISOString(),
    settings: cleanSettings,
    documents,
    content,
  };
  await writeFileInDir(dir, SYNC_FILE, JSON.stringify(snapshot, null, 2));

  // Tiny marker file: lets other browsers detect the vault and know how fresh
  // it is WITHOUT parsing the whole (possibly large) snapshot on every load.
  await writeFileInDir(
    dir,
    META_FILE,
    JSON.stringify({ app: APP_MARK, schema: SYNC_SCHEMA, updatedAt: snapshot.updatedAt }),
  );

  // Copy every original binary, keyed by document id (safe file name).
  const originals = await dir.getDirectoryHandle(ORIGINALS_DIR, { create: true });
  for (const doc of documents) {
    try {
      const file = await opfs.readFile(doc.opfsPath);
      await writeFileInDir(originals, doc.id, file);
    } catch {
      /* original missing locally — skip, metadata still syncs */
    }
  }

  return { folder: dir.name, documents: documents.length };
}

async function readJsonFromDir<T>(dir: FileSystemDirectoryHandle, name: string): Promise<T | null> {
  try {
    const handle = await dir.getFileHandle(name);
    const text = await (await handle.getFile()).text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * PULL: replace this browser's local vault with the shared folder's contents.
 * The caller should reload the app afterwards so auth/state re-initialise.
 */
export async function pullFromSharedFolder(): Promise<{ folder: string; documents: number }> {
  return pullUsing(await resolveHandle());
}

/** Core pull, given an already-resolved (permitted) folder handle. */
async function pullUsing(dir: DirHandle): Promise<{ folder: string; documents: number }> {
  const snapshot = await readJsonFromDir<VaultSync>(dir, SYNC_FILE);
  if (!snapshot) {
    throw new Error('No vault found in that folder. Push from another browser first.');
  }

  // Start from a clean local slate so nothing stale lingers.
  await opfs.deleteVaultDir();
  await db.clearEverything();

  // Restore settings (includes the hashed admin password), documents, content.
  for (const s of snapshot.settings) await db.setSetting(s.key, s.value);
  for (const doc of snapshot.documents) await db.putDocument(doc);
  for (const rec of snapshot.content) await db.putContent(rec.id, rec.json);

  // Restore original binaries + JSON sidecars into OPFS.
  let originals: FileSystemDirectoryHandle | null = null;
  try {
    originals = await dir.getDirectoryHandle(ORIGINALS_DIR);
  } catch {
    originals = null;
  }
  for (const doc of snapshot.documents) {
    if (originals) {
      try {
        const handle = await originals.getFileHandle(doc.id);
        const file = await handle.getFile();
        await opfs.writeFile(doc.opfsPath, file);
      } catch {
        /* original missing in folder — metadata still restored */
      }
    }
    const rec = snapshot.content.find((c) => c.id === doc.id);
    if (rec && doc.jsonPath) {
      await opfs.writeJson(doc.jsonPath, rec.json).catch(() => {});
    }
  }

  // Remember the folder on THIS browser too, so future push/pull is one click.
  await db.setSetting(HANDLE_KEY, dir);
  await db.setSetting(NAME_KEY, dir.name);
  // Record how fresh our copy now is, so auto-sync won't pull the same data twice.
  await db.setSetting(SYNCED_AT_KEY, snapshot.updatedAt);

  return { folder: dir.name, documents: snapshot.documents.length };
}

/**
 * Onboard a brand-new browser: pick a folder and immediately pull from it.
 * Used from the login screen so a second browser can adopt the shared vault
 * (and its admin password) in one step.
 */
export async function adoptSharedFolder(): Promise<{ folder: string; documents: number }> {
  await connectSharedFolder();
  return pullFromSharedFolder();
}

/**
 * AUTO-SYNC on app boot. If this browser already picked the shared folder and
 * still silently holds permission, and the folder holds a NEWER vault than our
 * last sync, pull it automatically — no clicks. This is what makes multi-browser
 * sharing feel automatic after the one-time folder pick. Returns whether it
 * pulled (the caller should reload when it did).
 */
export async function autoSyncOnLoad(): Promise<{ pulled: boolean; documents?: number }> {
  if (!isSharedFolderSupported()) return { pulled: false };
  const saved = await getSavedHandle();
  if (!saved) return { pulled: false };

  // Silent check only: we cannot prompt for permission without a user gesture,
  // so if it isn't already granted we quietly skip (manual Pull still works).
  const state = saved.queryPermission ? await saved.queryPermission({ mode: 'read' }) : 'prompt';
  if (state !== 'granted') return { pulled: false };

  const meta = await readJsonFromDir<{ app?: string; updatedAt?: string }>(saved, META_FILE);
  if (!meta?.updatedAt || meta.app !== APP_MARK) return { pulled: false };

  const localAt = await db.getSetting<string>(SYNCED_AT_KEY);
  if (localAt && meta.updatedAt <= localAt) return { pulled: false }; // already current

  const res = await pullUsing(saved);
  return { pulled: true, documents: res.documents };
}
