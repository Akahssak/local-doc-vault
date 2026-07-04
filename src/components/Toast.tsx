import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, AlertIcon, CloseIcon } from '@/components/Icons';
import { classNames } from '@/lib/util';

type ToastType = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let counter = 0;
const listeners = new Set<(t: ToastItem) => void>();

export function toast(message: string, type: ToastType = 'info'): void {
  const item: ToastItem = { id: ++counter, message, type };
  listeners.forEach((l) => l(item));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const on = (t: ToastItem) => {
      setItems((prev) => [...prev, t]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, 3800);
    };
    listeners.add(on);
    return () => {
      listeners.delete(on);
    };
  }, []);

  const dismiss = (id: number) => setItems((prev) => prev.filter((x) => x.id !== id));

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-xs flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={classNames(
            'pointer-events-auto flex animate-fade-in items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm shadow-xl backdrop-blur',
            t.type === 'success' && 'border-emerald-800/60 bg-emerald-950/70 text-emerald-100',
            t.type === 'error' && 'border-rose-800/60 bg-rose-950/70 text-rose-100',
            t.type === 'info' && 'border-slate-700 bg-slate-900/80 text-slate-100',
          )}
        >
          <span className="mt-0.5 shrink-0">
            {t.type === 'error' ? (
              <AlertIcon className="h-4 w-4" />
            ) : (
              <CheckIcon className="h-4 w-4" />
            )}
          </span>
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 opacity-60 transition hover:opacity-100"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
