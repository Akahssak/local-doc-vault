import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { StorageMeter } from '@/components/StorageMeter';
import { CloseIcon, FolderIcon, SettingsIcon, SpinnerIcon } from '@/components/Icons';
import { toast } from '@/components/Toast';
import {
  connectSharedFolder,
  disconnectSharedFolder,
  getPathHint,
  getSharedFolderName,
  isSharedFolderSupported,
  pullFromSharedFolder,
  pushToSharedFolder,
  setPathHint,
} from '@/lib/storage/sharedFolder';

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

  const sharedSupported = isSharedFolderSupported();
  const [folderName, setFolderName] = useState<string | null>(null);
  const [folderBusy, setFolderBusy] = useState<null | 'connect' | 'push' | 'pull'>(null);
  const [pullArmed, setPullArmed] = useState(false);
  const [pathHint, setPathHintInput] = useState('');

  useEffect(() => {
    if (sharedSupported) {
      getSharedFolderName().then(setFolderName);
      getPathHint().then((h) => setPathHintInput(h ?? ''));
    }
  }, [sharedSupported]);

  async function handleSavePathHint() {
    await setPathHint(pathHint);
    toast('Folder location note saved. Push to share it with other browsers.', 'success');
  }

  async function handleConnectFolder() {
    setFolderBusy('connect');
    try {
      const name = await connectSharedFolder();
      setFolderName(name);
      toast(`Connected shared folder "${name}".`, 'success');
    } catch (err) {
      const e = err as Error;
      if (e.name !== 'AbortError') toast(e.message, 'error');
    } finally {
      setFolderBusy(null);
    }
  }

  async function handlePushFolder() {
    setFolderBusy('push');
    try {
      const { folder, documents } = await pushToSharedFolder();
      setFolderName(folder);
      toast(`Pushed ${documents} document${documents === 1 ? '' : 's'} to "${folder}".`, 'success');
    } catch (err) {
      const e = err as Error;
      if (e.name !== 'AbortError') toast(e.message, 'error');
    } finally {
      setFolderBusy(null);
    }
  }

  async function handlePullFolder() {
    setFolderBusy('pull');
    try {
      const { documents } = await pullFromSharedFolder();
      toast(`Pulled ${documents} document${documents === 1 ? '' : 's'}. Reloading…`, 'success');
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      const e = err as Error;
      if (e.name !== 'AbortError') toast(e.message, 'error');
      setFolderBusy(null);
      setPullArmed(false);
    }
  }

  async function handleDisconnectFolder() {
    await disconnectSharedFolder();
    setFolderName(null);
    toast('Shared folder disconnected on this browser.', 'success');
  }

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

          {/* Shared folder — multi-browser on this PC */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <FolderIcon className="h-4 w-4 text-brand-300" /> Shared folder (multi-browser)
            </h3>
            {!sharedSupported ? (
              <p className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
                Sharing one vault across browsers needs a Chromium browser (Chrome or Edge) on
                desktop. This browser does not support choosing a shared folder.
              </p>
            ) : (
              <div className="card bg-slate-900/40 p-4">
                <p className="text-sm text-slate-300">
                  Pick a real folder on this PC to hold the vault. Any other browser here can open
                  the same folder and share these documents <em>and the admin password</em>.
                </p>
                {folderName && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-300">
                    <FolderIcon className="h-3.5 w-3.5" /> Connected: {folderName}
                  </p>
                )}

                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    Folder location note (helps others pick the right folder)
                  </label>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      value={pathHint}
                      onChange={(e) => setPathHintInput(e.target.value)}
                      placeholder="e.g. D:\TyreVault"
                    />
                    <button
                      className="btn-secondary"
                      onClick={handleSavePathHint}
                      disabled={folderBusy !== null}
                    >
                      Save note
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Browsers can't read the real path, so type it here once. It syncs on Push and is
                    shown on the folder-pick screen in other browsers.
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="btn-secondary"
                    onClick={handleConnectFolder}
                    disabled={folderBusy !== null}
                  >
                    {folderBusy === 'connect' ? (
                      <SpinnerIcon className="h-4 w-4 animate-spin" />
                    ) : folderName ? (
                      'Change folder'
                    ) : (
                      'Choose folder'
                    )}
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handlePushFolder}
                    disabled={folderBusy !== null}
                    title="Write this browser's vault into the shared folder"
                  >
                    {folderBusy === 'push' ? (
                      <SpinnerIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      'Push to folder'
                    )}
                  </button>
                  {folderName && (
                    <button
                      className="btn-ghost text-slate-400"
                      onClick={handleDisconnectFolder}
                      disabled={folderBusy !== null}
                    >
                      Disconnect
                    </button>
                  )}
                </div>

                <div className="mt-3 rounded-md border border-amber-900/50 bg-amber-950/20 p-3">
                  <p className="text-xs text-amber-200/90">
                    Pull replaces everything in <strong>this</strong> browser with the folder's
                    contents.
                  </p>
                  {!pullArmed ? (
                    <button
                      className="btn-secondary mt-2"
                      onClick={() => setPullArmed(true)}
                      disabled={folderBusy !== null}
                    >
                      Pull from folder…
                    </button>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        className="btn-danger"
                        onClick={handlePullFolder}
                        disabled={folderBusy !== null}
                      >
                        {folderBusy === 'pull' ? (
                          <SpinnerIcon className="h-4 w-4 animate-spin" />
                        ) : (
                          'Yes, replace & pull'
                        )}
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => setPullArmed(false)}
                        disabled={folderBusy !== null}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  Safety: the folder holds the password only as a salted hash, never plaintext — but
                  it is only as private as this PC's folder permissions. Keep it off shared drives.
                </p>
              </div>
            )}
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
