/**
 * Ingestion orchestrator: the single place that ties together on-device
 * storage (OPFS), the metadata/content index (IndexedDB) and extraction.
 */
import { extractDocument, makePreview } from '@/lib/pdf/extract';
import * as db from '@/lib/storage/db';
import * as opfs from '@/lib/storage/opfs';
import { extOf, newId, sha256Hex } from '@/lib/util';
import type { DocumentJson, StoredDocument } from '@/types';

export interface IngestResult {
  doc: StoredDocument;
  duplicate: boolean;
}

/** Store one file privately on-device and index its extracted JSON. */
export async function ingestFile(file: File): Promise<IngestResult> {
  const hash = await sha256Hex(await file.arrayBuffer());

  const existing = await db.findDocumentByHash(hash);
  if (existing) return { doc: existing, duplicate: true };

  const id = newId();
  const opfsPath = `${id}${extOf(file.name)}`;

  // 1) Persist the original bytes in the app-private OPFS vault.
  await opfs.writeFile(opfsPath, file);

  // 2) Extract structured JSON content (best effort).
  let json: DocumentJson | undefined;
  let status: StoredDocument['status'] = 'ready';
  let error: string | undefined;
  try {
    json = await extractDocument(file);
  } catch (e) {
    status = 'error';
    error = (e as Error).message;
  }

  const doc: StoredDocument = {
    id,
    fileName: file.name,
    opfsPath,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    pageCount: json?.pageCount ?? 0,
    status,
    error,
    addedAt: new Date().toISOString(),
    hash,
    preview: json ? makePreview(json.fullText) : '',
    textLength: json?.fullText.length ?? 0,
    tags: [],
  };

  await db.putDocument(doc);
  if (json) await db.putContent(id, json);

  return { doc, duplicate: false };
}

/** Remove a document from OPFS + IndexedDB. */
export async function removeDocument(doc: StoredDocument): Promise<void> {
  await opfs.deleteFile(doc.opfsPath);
  await db.deleteContent(doc.id);
  await db.deleteDocumentMeta(doc.id);
}

/** Create an object URL for the original stored binary (remember to revoke). */
export async function getOriginalUrl(doc: StoredDocument): Promise<string> {
  const file = await opfs.readFile(doc.opfsPath);
  return URL.createObjectURL(file);
}

/** Persist an updated metadata row (e.g. after editing tags). */
export function updateDocument(doc: StoredDocument): Promise<IDBValidKey> {
  return db.putDocument(doc);
}
