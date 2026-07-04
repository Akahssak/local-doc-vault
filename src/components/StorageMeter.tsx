import { useEffect, useState } from 'react';
import { getStorageEstimate, requestPersistentStorage } from '@/lib/storage/opfs';
import { formatBytes } from '@/lib/util';

interface Props {
  /** Bump this (e.g. document count) to re-read the estimate. */
  refreshKey?: number;
  compact?: boolean;
}

export function StorageMeter({ refreshKey = 0, compact = false }: Props) {
  const [usage, setUsage] = useState(0);
  const [quota, setQuota] = useState(0);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getStorageEstimate().then(({ usage, quota }) => {
      if (!active) return;
      setUsage(usage);
      setQuota(quota);
    });
    if (navigator.storage?.persisted) {
      navigator.storage.persisted().then((p) => active && setPersisted(p));
    }
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const pct = quota ? Math.min(100, (usage / quota) * 100) : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
        </div>
        <span>{formatBytes(usage)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-300">On-device storage</span>
        <span className="text-slate-400">
          {formatBytes(usage)} {quota ? `/ ${formatBytes(quota)}` : ''}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {persisted === null
            ? ''
            : persisted
              ? 'Persistent storage granted — data is protected from eviction.'
              : 'Storage may be evicted under pressure.'}
        </span>
        {persisted === false && (
          <button
            className="btn-ghost !px-2.5 !py-1 text-xs"
            onClick={async () => setPersisted(await requestPersistentStorage())}
          >
            Make persistent
          </button>
        )}
      </div>
    </div>
  );
}
