import { SearchIcon, AlertIcon } from '@/components/Icons';
import type { SearchOptions } from '@/types';
import { classNames } from '@/lib/util';

interface Props {
  options: SearchOptions;
  onChange: (next: SearchOptions) => void;
  error?: string;
  matchInfo?: { docs: number; matches: number } | null;
}

function Toggle({
  active,
  label,
  title,
  onClick,
}: {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={classNames(
        'grid h-7 w-8 place-items-center rounded-md border text-xs font-semibold transition',
        active
          ? 'border-brand-500 bg-brand-500/20 text-brand-200'
          : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200',
      )}
    >
      {label}
    </button>
  );
}

export function SearchBar({ options, onChange, error, matchInfo }: Props) {
  const set = (patch: Partial<SearchOptions>) => onChange({ ...options, ...patch });

  return (
    <div className="space-y-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          className="input pl-9 pr-28"
          placeholder={options.useRegex ? 'Regex, e.g. \\d{3,}\\s?(kg|ltr)' : 'Search text…'}
          value={options.query}
          onChange={(e) => set({ query: e.target.value })}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <Toggle
            active={options.caseSensitive}
            label="Aa"
            title="Match case"
            onClick={() => set({ caseSensitive: !options.caseSensitive })}
          />
          <Toggle
            active={options.wholeWord}
            label="W"
            title="Whole word"
            onClick={() => set({ wholeWord: !options.wholeWord })}
          />
          <Toggle
            active={options.useRegex}
            label=".*"
            title="Use regular expression"
            onClick={() => set({ useRegex: !options.useRegex })}
          />
        </div>
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-rose-300">
          <AlertIcon className="h-3.5 w-3.5" /> Invalid regex: {error}
        </p>
      ) : matchInfo && options.query.trim() ? (
        <p className="text-xs text-slate-500">
          {matchInfo.matches.toLocaleString()} match
          {matchInfo.matches === 1 ? '' : 'es'} in {matchInfo.docs} document
          {matchInfo.docs === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}
