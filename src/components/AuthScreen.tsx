import { useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { APP_CONFIG } from '@/config';
import { ShieldIcon, SpinnerIcon, LockIcon } from '@/components/Icons';

interface Props {
  mode: 'setup' | 'login';
}

export function AuthScreen({ mode }: Props) {
  const { setupPassword, login } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSetup = mode === 'setup';

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

        <p className="mt-6 text-center text-xs text-slate-500">
          Your files are stored privately on this device only. Nothing is uploaded to a server.
        </p>
      </div>
    </div>
  );
}
