import { StorageMeter } from '@/components/StorageMeter';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LockIcon, SettingsIcon, ShieldIcon } from '@/components/Icons';
import { APP_CONFIG } from '@/config';

interface Props {
  docCount: number;
  refreshKey: number;
  onLock: () => void;
  onOpenSettings: () => void;
}

export function Header({ docCount, refreshKey, onLock, onOpenSettings }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600/20 ring-1 ring-brand-500/40">
          <ShieldIcon className="h-5 w-5 text-brand-300" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-slate-50">{APP_CONFIG.appName}</h1>
          <p className="text-[11px] text-slate-500">
            {docCount} document{docCount === 1 ? '' : 's'} · private on-device
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <StorageMeter refreshKey={refreshKey} compact />
          </div>
          <ThemeToggle />
          <button
            className="rounded-lg border border-slate-700 bg-slate-800/40 p-2 text-slate-300 hover:bg-slate-800"
            title="Settings"
            onClick={onOpenSettings}
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
          <button
            className="rounded-lg border border-slate-700 bg-slate-800/40 p-2 text-slate-300 hover:bg-slate-800"
            title="Lock vault"
            onClick={onLock}
          >
            <LockIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
