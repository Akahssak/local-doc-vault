/**
 * Ingestion orchestrator: the single place that ties together on-device
 * storage (OPFS), the metadata/content index (IndexedDB) and extraction.
 */
import { extractDocument, makePreview } from '@/lib/pdf/extract';
import { detectBrand, detectBrandFromText } from '@/lib/data/columns';
import * as db from '@/lib/storage/db';
import * as opfs from '@/lib/storage/opfs';
import { newId, sanitizeFolderName, sha256Hex } from '@/lib/util';
import type { DocumentJson, StoredDocument } from '@/types';

export interface IngestResult {
  doc: StoredDocument;
  duplicate: boolean;
}

/**
 * Resolve the company a document belongs to. We trust the file name first
 * (e.g. "Continental Price List.pdf"), fall back to a brand named inside the
 * extracted text, and finally to "Unknown" — so every file is always filed
 * under some company folder.
 */
function resolveCompany(fileName: string, fullText?: string): string {
  const fromName = detectBrand(fileName);
  const generic = !fromName || fromName === 'Unknown';
  if (!generic) return fromName;
  const fromText = fullText ? detectBrandFromText(fullText) : null;
  return fromText ?? fromName ?? 'Unknown';
}

/** Store one file privately on-device and index its extracted JSON. */
export async function ingestFile(file: File): Promise<IngestResult> {
  const hash = await sha256Hex(await file.arrayBuffer());

  const existing = await db.findDocumentByHash(hash);
  if (existing) return { doc: existing, duplicate: true };

  const id = newId();

  // 1) Extract structured JSON content first (best effort). Its text also helps
  //    us recognise which company the document belongs to.
  let json: DocumentJson | undefined;
  let status: StoredDocument['status'] = 'ready';
  let error: string | undefined;
  try {
    json = await extractDocument(file);
  } catch (e) {
    status = 'error';
    error = (e as Error).message;
  }

  // 2) File the document under a folder named after its company, keeping the
  //    ORIGINAL file name. Only true name clashes get a numeric suffix.
  const company = resolveCompany(file.name, json?.fullText);
  const folder = sanitizeFolderName(company);
  const storedName = await opfs.uniqueName(folder, file.name);
  const opfsPath = `${folder}/${storedName}`;
  const jsonPath = json ? `${opfsPath}.json` : undefined;

  // 3) Persist the original bytes in the company folder…
  await opfs.writeFile(opfsPath, file);
  // …and write the extracted JSON right next to the source ("just below" it).
  if (json && jsonPath) await opfs.writeJson(jsonPath, json);

  const doc: StoredDocument = {
    id,
    fileName: file.name,
    company,
    opfsPath,
    jsonPath,
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

/** Remove a document (original + its JSON sidecar) from OPFS + IndexedDB. */
export async function removeDocument(doc: StoredDocument): Promise<void> {
  await opfs.deleteFile(doc.opfsPath);
  if (doc.jsonPath) await opfs.deleteFile(doc.jsonPath);
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
