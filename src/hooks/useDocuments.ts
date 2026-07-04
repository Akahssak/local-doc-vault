import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as db from '@/lib/storage/db';
import { ingestFile, removeDocument, updateDocument } from '@/lib/ingest';
import { buildGlobalIndex, saveGlobalIndex } from '@/lib/storage/globalIndex';
import { initVault } from '@/lib/storage/vault';
import type { DocumentJson, GlobalIndex, StoredDocument, VaultManifest } from '@/types';

export interface UploadProgress {
  total: number;
  done: number;
  current?: string;
}

export interface AddFilesResult {
  added: number;
  duplicates: number;
  failed: number;
}

export interface DocumentsApi {
  docs: StoredDocument[];
  contents: Map<string, DocumentJson>;
  loading: boolean;
  progress: UploadProgress | null;
  /** Stable identity of the on-device vault folder. */
  manifest: VaultManifest | null;
  /** Aggregated JSON of the whole vault (rebuilt from docs + contents). */
  globalIndex: GlobalIndex;
  addFiles: (files: File[]) => Promise<AddFilesResult>;
  remove: (doc: StoredDocument) => Promise<void>;
  saveTags: (doc: StoredDocument, tags: string[]) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useDocuments(): DocumentsApi {
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [contents, setContents] = useState<Map<string, DocumentJson>>(new Map());
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [manifest, setManifest] = useState<VaultManifest | null>(null);

  const refresh = useCallback(async () => {
    const all = await db.getAllDocuments();
    const map = new Map<string, DocumentJson>();
    await Promise.all(
      all.map(async (d) => {
        const c = await db.getContent(d.id);
        if (c) map.set(d.id, c);
      }),
    );
    setDocs(all);
    setContents(map);
    setLoading(false);
  }, []);

  // One-time: establish/confirm the vault folder identity, then load documents.
  useEffect(() => {
    void (async () => {
      try {
        setManifest(await initVault());
      } catch (err) {
        console.error('Vault init failed', err);
      }
      await refresh();
    })();
  }, [refresh]);

  // Aggregated global JSON, always derived from the current documents.
  const globalIndex = useMemo(
    () => buildGlobalIndex(manifest?.vaultId ?? 'pending', docs, contents),
    [manifest?.vaultId, docs, contents],
  );

  // Persist the global JSON into the vault whenever it changes (after load).
  const lastSaved = useRef<string>('');
  useEffect(() => {
    if (loading || !manifest) return;
    const stamp = `${globalIndex.documentCount}:${globalIndex.totalBytes}:${globalIndex.totalPages}`;
    if (stamp === lastSaved.current) return;
    lastSaved.current = stamp;
    void saveGlobalIndex(globalIndex).catch((e) => console.error('Save global index failed', e));
  }, [globalIndex, loading, manifest]);

  const addFiles = useCallback(
    async (files: File[]): Promise<AddFilesResult> => {
      let added = 0;
      let duplicates = 0;
      let failed = 0;
      setProgress({ total: files.length, done: 0, current: files[0]?.name });
      for (let i = 0; i < files.length; i++) {
        setProgress({ total: files.length, done: i, current: files[i].name });
        try {
          const res = await ingestFile(files[i]);
          if (res.duplicate) duplicates++;
          else added++;
        } catch (err) {
          failed++;
          console.error('Failed to ingest', files[i].name, err);
        }
      }
      setProgress(null);
      await refresh();
      return { added, duplicates, failed };
    },
    [refresh],
  );

  const remove = useCallback(
    async (doc: StoredDocument) => {
      await removeDocument(doc);
      await refresh();
    },
    [refresh],
  );

  const saveTags = useCallback(
    async (doc: StoredDocument, tags: string[]) => {
      await updateDocument({ ...doc, tags });
      await refresh();
    },
    [refresh],
  );

  return {
    docs,
    contents,
    loading,
    progress,
    manifest,
    globalIndex,
    addFiles,
    remove,
    saveTags,
    refresh,
  };
}
