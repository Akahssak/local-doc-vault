/**
 * Theme management: light, dark or follow-system, persisted per device.
 *
 * The resolved theme is applied by toggling the `dark` class on <html> (which
 * flips the CSS-variable palette defined in index.css) and by keeping the
 * browser UI (`<meta name="theme-color">`) in sync. A matching inline script in
 * index.html applies the stored choice before first paint to avoid a flash.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'vault.theme';
const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: '#0b1020',
  light: '#f1f5f9',
};

interface ThemeContextValue {
  /** The user's choice: light, dark or system. */
  choice: ThemeChoice;
  /** The actually-applied theme after resolving `system`. */
  resolved: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
  /** Cycle light → dark → system → light. */
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* localStorage may be unavailable */
  }
  return 'system';
}

function apply(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[resolved]);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readStoredChoice());
  const [systemDark, setSystemDark] = useState<boolean>(() => prefersDark());

  // Track the OS preference so `system` reacts live.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;

  // Apply to the document whenever the resolved theme changes.
  useEffect(() => {
    apply(resolved);
  }, [resolved]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore persistence failures */
    }
  }, []);

  const cycle = useCallback(() => {
    setChoice(choice === 'light' ? 'dark' : choice === 'dark' ? 'system' : 'light');
  }, [choice, setChoice]);

  const value = useMemo<ThemeContextValue>(
    () => ({ choice, resolved, setChoice, cycle }),
    [choice, resolved, setChoice, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
