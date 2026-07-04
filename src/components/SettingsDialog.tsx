import { useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { StorageMeter } from '@/components/StorageMeter';
import { CloseIcon, SettingsIcon } from '@/components/Icons';
import { toast } from '@/components/Toast';

interface Props {
  onClose: () => void;
  onWipe: () => Promise<void>;
  docCount: number;
  refreshKey: number;
}

export function SettingsDialog({ onClose, onWipe, docCount, refreshKey }: Props) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [wipeArmed, setWipeArmed] = useState(false);

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) return toast('New password must be at least 8 characters.', 'error');
    if (next !== confirm) return toast('New passwords do not match.', 'error');
    setBusy(true);
    try {
      await changePassword(current, next);
      toast('Password updated.', 'success');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleWipe() {
    setBusy(true);
    try {
      await onWipe();
      toast('All documents removed from this device.', 'success');
      setWipeArmed(false);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-50">
            <SettingsIcon className="h-4 w-4 text-brand-300" /> Settings
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-auto p-4">
          {/* Storage */}
          <section className="card bg-slate-900/40 p-4">
            <StorageMeter refreshKey={refreshKey} />
          </section>

          {/* Change password */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Change admin password
            </h3>
            <form onSubmit={onChangePassword} className="space-y-3">
              <input
                type="password"
                className="input"
                placeholder="Current password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
              <input
                type="password"
                className="input"
                placeholder="New password (min 8 chars)"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <input
                type="password"
                className="input"
                placeholder="Confirm new password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <button type="submit" className="btn-primary w-full" disabled={busy}>
                Update password
              </button>
            </form>
          </section>

          {/* Danger zone */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-rose-400">
              Danger zone
            </h3>
            <div className="card border-rose-900/50 bg-rose-950/20 p-4">
              <p className="text-sm text-slate-300">
                Permanently delete all {docCount} document{docCount === 1 ? '' : 's'} and their
                extracted data from this device.
              </p>
              {!wipeArmed ? (
                <button
                  className="btn-danger mt-3"
                  onClick={() => setWipeArmed(true)}
                  disabled={busy || docCount === 0}
                >
                  Wipe vault
                </button>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  <button className="btn-danger" onClick={handleWipe} disabled={busy}>
                    Yes, delete everything
                  </button>
                  <button className="btn-ghost" onClick={() => setWipeArmed(false)} disabled={busy}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
