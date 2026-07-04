/**
 * The aggregated "global JSON" for the whole vault.
 *
 * Every document's metadata + per-page text is merged into one structure and
 * written to the vault as `global.json`. It is rebuilt from the source of truth
 * (IndexedDB) whenever documents change, so adding a PDF automatically extends
 * the global JSON, and removing one prunes it. The admin can export this file to
 * get the entire vault as a single portable JSON document.
 */
import { APP_CONFIG } from '@/config';
import * as opfs from '@/lib/storage/opfs';
import { extOf } from '@/lib/util';
import type { DocumentJson, GlobalIndex, GlobalIndexEntry, StoredDocument } from '@/types';

/** Reduce one document (metadata + extracted JSON) to a global-index entry. */
export function buildEntry(doc: StoredDocument, json?: DocumentJson): GlobalIndexEntry {
  return {
    id: doc.id,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    ext: extOf(doc.fileName),
    size: doc.size,
    pageCount: doc.pageCount,
    status: doc.status,
    addedAt: doc.addedAt,
    hash: doc.hash,
    tags: doc.tags,
    preview: doc.preview,
    textLength: doc.textLength,
    pages: json ? json.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })) : [],
  };
}

/** Build the full aggregated index from all documents + their content. */
export function buildGlobalIndex(
  vaultId: string,
  docs: StoredDocument[],
  contents: Map<string, DocumentJson>,
): GlobalIndex {
  const documents = docs.map((d) => buildEntry(d, contents.get(d.id)));
  return {
    vaultId,
    schemaVersion: APP_CONFIG.globalIndexSchema,
    updatedAt: new Date().toISOString(),
    documentCount: documents.length,
    totalPages: documents.reduce((sum, d) => sum + d.pageCount, 0),
    totalBytes: documents.reduce((sum, d) => sum + d.size, 0),
    documents,
  };
}

/** Persist the aggregated index into the vault (`global.json`). */
export async function saveGlobalIndex(index: GlobalIndex): Promise<void> {
  if (!opfs.isOpfsSupported()) return;
  await opfs.writeJson(APP_CONFIG.globalIndexFile, index);
}

/** Load the aggregated index from the vault, or `null` if not written yet. */
export async function loadGlobalIndex(): Promise<GlobalIndex | null> {
  return opfs.readJson<GlobalIndex>(APP_CONFIG.globalIndexFile);
}

/** A downloadable Blob of the aggregated index (pretty-printed JSON). */
export function globalIndexBlob(index: GlobalIndex): Blob {
  return new Blob([JSON.stringify(index, null, 2)], { type: 'application/json' });
}
