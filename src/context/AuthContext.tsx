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

export type AuthStatus = 'loading' | 'needs-setup' | 'locked' | 'unlocked';

interface AuthContextValue {
  status: AuthStatus;
  setupPassword: (password: string) => Promise<void>;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  changePassword: (current: string, next: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let active = true;
    (async () => {
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

  const value = useMemo<AuthContextValue>(
    () => ({ status, setupPassword, login, logout, changePassword }),
    [status, setupPassword, login, logout, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
