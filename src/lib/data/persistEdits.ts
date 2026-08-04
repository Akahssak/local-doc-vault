/**
 * Persist hand-corrected rows back into each document's own JSON sidecar.
 *
 * Manual edits already live in IndexedDB (see {@link useRecordEdits}), but the
 * admin also wants the CHANGED DATA saved into the JSON itself — so the `.json`
 * file stored next to each source on disk carries the corrections. This writes
 * only the edited rows (under `editedRecords`) and strips the section again once
 * a document's edits are all cleared.
 */
import { writeJson } from '@/lib/storage/opfs';
import { toPersistedRecord } from '@/lib/data/records';
import type { DataRecord, DocumentJson, StoredDocument } from '@/types';

/**
 * Mirror the edited rows of every affected document into its JSON sidecar.
 * `written` remembers which sidecars we have touched, so when a document's last
 * edit is removed we rewrite it once more to drop the now-stale section.
 */
export async function persistEditedSidecars(
  docs: StoredDocument[],
  contents: Map<string, DocumentJson>,
  records: DataRecord[],
  written: Set<string>,
): Promise<void> {
  const byDoc = new Map<string, DataRecord[]>();
  for (const r of records) {
    if (r.edited && Object.keys(r.edited).length) {
      const list = byDoc.get(r.docId);
      if (list) list.push(r);
      else byDoc.set(r.docId, [r]);
    }
  }
  const targets = new Set<string>([...byDoc.keys(), ...written]);
  for (const docId of targets) {
    const doc = docs.find((d) => d.id === docId);
    if (!doc?.jsonPath) continue;
    const json = contents.get(docId);
    if (!json) continue;
    const edited = byDoc.get(docId);
    const next: DocumentJson = { ...json };
    if (edited && edited.length) {
      next.editedRecords = edited.map(toPersistedRecord);
      written.add(docId);
    } else {
      delete next.editedRecords;
      written.delete(docId);
    }
    try {
      await writeJson(doc.jsonPath, next);
    } catch {
      /* best-effort: the IndexedDB copy still holds the edit */
    }
  }
}
