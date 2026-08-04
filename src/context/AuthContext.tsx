import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  changeAdminPassword,
  isAdminConfigured,
  isSessionActive,
  logout as logoutSession,
  markLoggedIn,
  setAdminPassword,
  verifyAdminPassword,
} from '@/lib/auth/auth';
import { hardResetVault } from '@/lib/storage/reset';
import { autoSyncOnLoad } from '@/lib/storage/sharedFolder';

export type AuthStatus = 'loading' | 'needs-setup' | 'locked' | 'unlocked';

interface AuthContextValue {
  status: AuthStatus;
  setupPassword: (password: string) => Promise<void>;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  changePassword: (current: string, next: string) => Promise<void>;
  /** Erase all on-device data (incl. password) and return to first-run setup. */
  resetVault: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let active = true;
    (async () => {
      // If this browser already shares an on-disk vault folder and it holds a
      // newer copy, adopt it automatically before deciding the auth state. This
      // is what makes multi-browser sharing feel automatic: whenever any browser
      // pushes, the others silently catch up (password included) on next load.
      try {
        const sync = await autoSyncOnLoad();
        if (!active) return;
        if (sync.pulled) {
          window.location.reload();
          return;
        }
      } catch {
        /* offline / permission lost — fall through to normal local boot */
      }
      const configured = await isAdminConfigured();
      if (!active) return;
      if (!configured) setStatus('needs-setup');
      else setStatus(isSessionActive() ? 'unlocked' : 'locked');
    })();
    return () => {
      active = false;
    };
  }, []);

  const setupPassword = useCallback(async (password: string) => {
    await setAdminPassword(password);
    markLoggedIn();
    setStatus('unlocked');
  }, []);

  const login = useCallback(async (password: string) => {
    const ok = await verifyAdminPassword(password);
    if (ok) {
      markLoggedIn();
      setStatus('unlocked');
    }
    return ok;
  }, []);

  const logout = useCallback(() => {
    logoutSession();
    setStatus('locked');
  }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    await changeAdminPassword(current, next);
  }, []);

  const resetVault = useCallback(async () => {
    await hardResetVault();
    logoutSession();
    setStatus('needs-setup');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, setupPassword, login, logout, changePassword, resetVault }),
    [status, setupPassword, login, logout, changePassword, resetVault],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
