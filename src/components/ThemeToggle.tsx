/**
 * Compact theme switcher: cycles Light → Dark → System and shows the icon for
 * the current choice. Sits in the header and is keyboard/touch friendly.
 */
import { useTheme } from '@/context/ThemeContext';
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/Icons';

const LABELS = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
} as const;

export function ThemeToggle() {
  const { choice, resolved, cycle } = useTheme();

  const Icon = choice === 'system' ? MonitorIcon : choice === 'dark' ? MoonIcon : SunIcon;
  const next = choice === 'light' ? 'Dark' : choice === 'dark' ? 'System' : 'Light';

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${LABELS[choice]}${choice === 'system' ? ` (${resolved})` : ''} — switch to ${next}`}
      aria-label={`Theme: ${LABELS[choice]}. Switch to ${next}.`}
      className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/40 px-2.5 py-2 text-slate-300 transition hover:bg-slate-800"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden text-xs font-medium sm:inline">{LABELS[choice]}</span>
    </button>
  );
}
