import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditableField, RecordEdit, RecordEdits } from '@/types';
import { DEFAULT_EDITS, loadEdits, saveEdits } from '@/lib/data/edits';

export interface RecordEditsApi {
  edits: RecordEdits;
  loaded: boolean;
  /** Number of rows that carry at least one manual edit or tag. */
  editCount: number;
  /** Set (value) or clear (null/empty) one editable field on a row. */
  setField: (id: string, field: EditableField, value: string | number | null) => void;
  /** Replace the tag list for a row (empty list removes all its tags). */
  setTags: (id: string, tags: string[]) => void;
  /** Drop every manual edit on a single row. */
  clearRow: (id: string) => void;
  /** Drop all manual edits on every row. */
  clearAll: () => void;
}

const SAVE_DELAY_MS = 300;

/** True when a typed value should CLEAR the field rather than set it. */
function isBlank(value: string | number | null): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return !(value > 0);
  return value.trim() === '';
}

/** Store `next` under `id`, or drop the id entirely once it has no edits left. */
function place(edits: RecordEdits, id: string, next: RecordEdit): void {
  if (Object.keys(next).length === 0) delete edits[id];
  else edits[id] = next;
}

/**
 * Manage manual per-row edits (company / size / pattern / type / RCP + tags)
 * with an optimistic UI: state updates immediately and the IndexedDB write is
 * debounced so rapid typing stays smooth. The latest value is flushed on
 * unmount so nothing is lost.
 */
export function useRecordEdits(): RecordEditsApi {
  const [edits, setEdits] = useState<RecordEdits>(DEFAULT_EDITS);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef<RecordEdits>(edits);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void loadEdits().then((e) => {
      if (!alive) return;
      latest.current = e;
      setEdits(e);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const commit = useCallback((next: RecordEdits) => {
    latest.current = next;
    setEdits(next); // optimistic
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void saveEdits(next);
    }, SAVE_DELAY_MS);
  }, []);

  const setField = useCallback(
    (id: string, field: EditableField, value: string | number | null) => {
      const next = { ...latest.current };
      const cur: RecordEdit = { ...(next[id] ?? {}) };
      if (isBlank(value)) {
        delete cur[field];
      } else if (field === 'rcp') {
        cur.rcp = Math.round(Number(value));
      } else if (field === 'tube') {
        cur.tube = String(value).trim().toUpperCase();
      } else {
        cur[field] = String(value).replace(/\s+/g, ' ').trim();
      }
      place(next, id, cur);
      commit(next);
    },
    [commit],
  );

  const setTags = useCallback(
    (id: string, tags: string[]) => {
      const next = { ...latest.current };
      const cur: RecordEdit = { ...(next[id] ?? {}) };
      const clean = Array.from(
        new Set(tags.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean)),
      ).slice(0, 24);
      if (clean.length) cur.tags = clean;
      else delete cur.tags;
      place(next, id, cur);
      commit(next);
    },
    [commit],
  );

  const clearRow = useCallback(
    (id: string) => {
      const next = { ...latest.current };
      delete next[id];
      commit(next);
    },
    [commit],
  );

  const clearAll = useCallback(() => commit({}), [commit]);

  // Flush any pending write when the component using this hook unmounts.
  useEffect(
    () => () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        void saveEdits(latest.current);
      }
    },
    [],
  );

  return {
    edits,
    loaded,
    editCount: Object.keys(edits).length,
    setField,
    setTags,
    clearRow,
    clearAll,
  };
}
