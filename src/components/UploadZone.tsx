import { useCallback, useRef, useState, type DragEvent } from 'react';
import { APP_CONFIG } from '@/config';
import { UploadIcon, SpinnerIcon } from '@/components/Icons';
import type { UploadProgress } from '@/hooks/useDocuments';
import { classNames } from '@/lib/util';

interface Props {
  onFiles: (files: File[]) => void;
  progress: UploadProgress | null;
}

export function UploadZone({ onFiles, progress }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onFiles(Array.from(list));
    },
    [onFiles],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const busy = progress !== null;
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !busy && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !busy) inputRef.current?.click();
      }}
      className={classNames(
        'card flex cursor-pointer flex-col items-center justify-center gap-3 border-dashed px-6 py-8 text-center transition',
        dragging ? 'border-brand-500 bg-brand-500/5' : 'hover:border-slate-600',
        busy && 'pointer-events-none opacity-80',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={APP_CONFIG.accept}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-600/15 ring-1 ring-brand-500/30">
        {busy ? (
          <SpinnerIcon className="h-6 w-6 text-brand-300" />
        ) : (
          <UploadIcon className="h-6 w-6 text-brand-300" />
        )}
      </div>

      {busy ? (
        <div className="w-full max-w-xs">
          <p className="truncate text-sm text-slate-300">
            Storing {progress?.current ?? ''}…
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {progress?.done} / {progress?.total}
          </p>
        </div>
      ) : (
        <>
          <div>
            <p className="text-sm font-medium text-slate-200">
              Drop files here or click to upload
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              PDFs & Excel sheets are parsed to searchable JSON. Stored privately on this device.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
