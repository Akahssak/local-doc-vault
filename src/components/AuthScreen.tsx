import { useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { APP_CONFIG } from '@/config';
import { ShieldIcon, SpinnerIcon, LockIcon, FolderIcon } from '@/components/Icons';
import { adoptSharedFolder, getPathHintLocal, isSharedFolderSupported } from '@/lib/storage/sharedFolder';

interface Props {
  mode: 'setup' | 'login';
}

export function AuthScreen({ mode }: Props) {
  const { setupPassword, login, resetVault } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);

  const isSetup = mode === 'setup';
  const sharedSupported = isSharedFolderSupported();
  const [adoptBusy, setAdoptBusy] = useState(false);
  const pathHint = getPathHintLocal();

  async function onAdopt() {
    setError(null);
    setAdoptBusy(true);
    try {
      const { documents } = await adoptSharedFolder();
      setError(null);
      // Reload so auth re-reads the shared credential and shows the login screen.
      void documents;
      window.location.reload();
    } catch (err) {
      const e = err as Error;
      if (e.name !== 'AbortError') setError(e.message);
      setAdoptBusy(false);
    }
  }

  async function onReset() {
    setBusy(true);
    setError(null);
    try {
      await resetVault();
      setResetArmed(false);
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSetup) {
      if (password.length < 8) return setError('Use at least 8 characters.');
      if (password !== confirm) return setError('Passwords do not match.');
    } else if (!password) {
      return setError('Enter the admin password.');
    }

    setBusy(true);
    try {
      if (isSetup) {
        await setupPassword(password);
      } else {
        const ok = await login(password);
        if (!ok) setError('Incorrect password.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md animate-fade-in p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600/20 ring-1 ring-brand-500/40">
            <ShieldIcon className="h-7 w-7 text-brand-300" />
          </div>
          <h1 className="text-xl font-semibold text-slate-50">{APP_CONFIG.appName}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {isSetup
              ? 'Create the admin password to secure this device vault.'
              : 'Enter the admin password to unlock your vault.'}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              {isSetup ? 'New admin password' : 'Admin password'}
            </label>
            <input
              type="password"
              className="input"
              autoFocus
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {isSetup && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Confirm password
              </label>
              <input
                type="password"
                className="input"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-rose-800/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? (
              <SpinnerIcon className="h-4 w-4" />
            ) : (
              <LockIcon className="h-4 w-4" />
            )}
            {isSetup ? 'Create vault' : 'Unlock'}
          </button>
        </form>

        {!isSetup && (
          <div className="mt-5 border-t border-slate-800 pt-4">
            {!resetArmed ? (
              <button
                type="button"
                className="w-full text-center text-xs text-slate-500 hover:text-rose-300"
                onClick={() => {
                  setError(null);
                  setResetArmed(true);
                }}
                disabled={busy}
              >
                Forgot password? Reset this vault
              </button>
            ) : (
              <div className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-3">
                <p className="text-xs text-rose-200">
                  This permanently deletes <strong>all documents and settings</strong> on this
                  device and removes the admin password, so you can create a brand-new vault. This
                  cannot be undone.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-danger flex-1"
                    onClick={onReset}
                    disabled={busy}
                  >
                    {busy ? <SpinnerIcon className="h-4 w-4" /> : null}
                    Erase &amp; start over
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setResetArmed(false)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          Your files are stored privately on this device only. Nothing is uploaded to a server.
        </p>

        {sharedSupported && !resetArmed && (
          <div className="mt-4 border-t border-slate-800 pt-4 text-center">
            <p className="mb-2 text-[11px] text-slate-500">
              Already set up this vault in another browser on this PC?
            </p>
            {pathHint && (
              <p className="mx-auto mb-2 max-w-xs rounded-md border border-brand-800/50 bg-brand-950/30 px-2 py-1.5 text-[11px] text-brand-200">
                Select this folder: <span className="font-mono text-brand-100">{pathHint}</span>
              </p>
            )}
            <button
              type="button"
              className="btn-ghost mx-auto"
              onClick={onAdopt}
              disabled={busy || adoptBusy}
            >
              {adoptBusy ? (
                <SpinnerIcon className="h-4 w-4 animate-spin" />
              ) : (
                <FolderIcon className="h-4 w-4" />
              )}
              Use a shared vault folder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
