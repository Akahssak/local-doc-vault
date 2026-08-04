/**
 * Tiny promise-based IndexedDB layer (no external dependency).
 *
 * Object stores:
 *  - documents: StoredDocument metadata (keyPath "id"), indexed by addedAt & hash
 *  - content:   { id, json } extracted DocumentJson (keyPath "id")
 *  - settings:  { key, value } app settings incl. hashed admin password
 */
import { APP_CONFIG } from '@/config';
import type { StoredDocument, DocumentJson } from '@/types';

const { name, version, stores } = APP_CONFIG.db;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(stores.documents)) {
        const s = db.createObjectStore(stores.documents, { keyPath: 'id' });
        s.createIndex('addedAt', 'addedAt', { unique: false });
        s.createIndex('hash', 'hash', { unique: false });
      }
      if (!db.objectStoreNames.contains(stores.content)) {
        db.createObjectStore(stores.content, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(stores.settings)) {
        db.createObjectStore(stores.settings, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

/* ------------------------------ documents ------------------------------ */

export function putDocument(doc: StoredDocument): Promise<IDBValidKey> {
  return request(stores.documents, 'readwrite', (s) => s.put(doc));
}

export function getDocument(id: string): Promise<StoredDocument | undefined> {
  return request(stores.documents, 'readonly', (s) => s.get(id));
}

export async function getAllDocuments(): Promise<StoredDocument[]> {
  const all = await request<StoredDocument[]>(stores.documents, 'readonly', (s) => s.getAll());
  return all.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export function findDocumentByHash(hash: string): Promise<StoredDocument | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(stores.documents, 'readonly');
        const idx = t.objectStore(stores.documents).index('hash');
        const req = idx.get(hash);
        req.onsuccess = () => resolve(req.result as StoredDocument | undefined);
        req.onerror = () => reject(req.error);
      }),
  );
}

export function deleteDocumentMeta(id: string): Promise<void> {
  return request(stores.documents, 'readwrite', (s) => s.delete(id));
}

/* ------------------------------- content ------------------------------- */

export function putContent(id: string, json: DocumentJson): Promise<IDBValidKey> {
  return request(stores.content, 'readwrite', (s) => s.put({ id, json }));
}

export async function getContent(id: string): Promise<DocumentJson | undefined> {
  const rec = await request<{ id: string; json: DocumentJson } | undefined>(
    stores.content,
    'readonly',
    (s) => s.get(id),
  );
  return rec?.json;
}

export function deleteContent(id: string): Promise<void> {
  return request(stores.content, 'readwrite', (s) => s.delete(id));
}

/** Every extracted-content row — used when exporting the vault to a shared folder. */
export function getAllContent(): Promise<Array<{ id: string; json: DocumentJson }>> {
  return request(stores.content, 'readonly', (s) => s.getAll());
}

/* ------------------------------ settings ------------------------------- */

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const rec = await request<{ key: string; value: T } | undefined>(
    stores.settings,
    'readonly',
    (s) => s.get(key),
  );
  return rec?.value;
}

export function setSetting<T = unknown>(key: string, value: T): Promise<IDBValidKey> {
  return request(stores.settings, 'readwrite', (s) => s.put({ key, value }));
}

/** Every settings row (incl. the hashed admin password) — used for shared-folder export. */
export function getAllSettings(): Promise<Array<{ key: string; value: unknown }>> {
  return request(stores.settings, 'readonly', (s) => s.getAll());
}

/* -------------------------------- reset -------------------------------- */

/** Remove all metadata + content (used by "wipe vault"). Does not touch OPFS. */
export async function clearAllData(): Promise<void> {
  await Promise.all([
    request(stores.documents, 'readwrite', (s) => s.clear()),
    request(stores.content, 'readwrite', (s) => s.clear()),
  ]);
}

/**
 * Nuke EVERYTHING in IndexedDB — documents, content AND settings (which holds
 * the hashed admin password). Used by the "reset vault" flow when the admin has
 * forgotten the password and needs to create a brand-new vault from scratch.
 */
export async function clearEverything(): Promise<void> {
  await Promise.all([
    request(stores.documents, 'readwrite', (s) => s.clear()),
    request(stores.content, 'readwrite', (s) => s.clear()),
    request(stores.settings, 'readwrite', (s) => s.clear()),
  ]);
}
