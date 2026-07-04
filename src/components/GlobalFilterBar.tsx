import { useMemo, useState } from 'react';
import type { FilterField, GlobalFilter, SortKey } from '@/types';
import { activeFilterCount } from '@/lib/search/filter';
import { classNames } from '@/lib/util';
import {
  AlertIcon,
  ChevronDownIcon,
  FilterIcon,
  SearchIcon,
  SortIcon,
} from '@/components/Icons';

interface Props {
  filter: GlobalFilter;
  onChange: (next: GlobalFilter) => void;
  availableTypes: string[];
  availableTags: string[];
  error?: string;
  resultInfo?: { shown: number; total: number; matches: number } | null;
}

const FIELDS: Array<{ value: FilterField; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'name', label: 'File name' },
  { value: 'content', label: 'Content' },
  { value: 'tags', label: 'Tags' },
];

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'addedAt', label: 'Date added' },
  { value: 'fileName', label: 'Name' },
  { value: 'size', label: 'Size' },
  { value: 'pageCount', label: 'Pages' },
  { value: 'textLength', label: 'Text length' },
];

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

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition',
        active
          ? 'border-brand-500 bg-brand-500/20 text-brand-100'
          : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200',
      )}
    >
      {label}
    </button>
  );
}

function NumberField({
  value,
  placeholder,
  onChange,
}: {
  value: number | null;
  placeholder: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className="input h-9 w-full px-2 py-1 text-xs"
    />
  );
}

export function GlobalFilterBar({
  filter,
  onChange,
  availableTypes,
  availableTags,
  error,
  resultInfo,
}: Props) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<GlobalFilter>) => onChange({ ...filter, ...patch });
  const activeCount = useMemo(() => activeFilterCount(filter), [filter]);

  function toggleInList(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  const kb = (bytes: number | null) => (bytes == null ? null : Math.round(bytes / 1024));
  const toBytes = (v: number | null) => (v == null ? null : Math.round(v * 1024));

  return (
    <div className="space-y-3">
      {/* Query row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9 pr-28"
            placeholder={
              filter.useRegex ? 'Regex, e.g. \\d{3,}\\s?(kg|ltr)' : 'Search across the whole vault…'
            }
            value={filter.query}
            onChange={(e) => set({ query: e.target.value })}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            <Toggle
              active={filter.caseSensitive}
              label="Aa"
              title="Match case"
              onClick={() => set({ caseSensitive: !filter.caseSensitive })}
            />
            <Toggle
              active={filter.wholeWord}
              label="W"
              title="Whole word"
              onClick={() => set({ wholeWord: !filter.wholeWord })}
            />
            <Toggle
              active={filter.useRegex}
              label=".*"
              title="Use regular expression"
              onClick={() => set({ useRegex: !filter.useRegex })}
            />
          </div>
        </div>

        {/* Field selector */}
        <select
          className="input h-10 w-full py-0 sm:w-40"
          value={filter.field}
          onChange={(e) => set({ field: e.target.value as FilterField })}
          title="Where to search"
        >
          {FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              in {f.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={classNames(
            'flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition',
            open || activeCount
              ? 'border-brand-500 bg-brand-500/15 text-brand-100'
              : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800',
          )}
        >
          <FilterIcon className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[11px] font-bold text-white">
              {activeCount}
            </span>
          )}
          <ChevronDownIcon
            className={classNames('h-4 w-4 transition', open && 'rotate-180')}
          />
        </button>
      </div>

      {/* Status line */}
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-rose-300">
          <AlertIcon className="h-3.5 w-3.5" /> Invalid regex: {error}
        </p>
      ) : resultInfo ? (
        <p className="text-xs text-slate-500">
          Showing <span className="text-slate-300">{resultInfo.shown}</span> of {resultInfo.total}{' '}
          document{resultInfo.total === 1 ? '' : 's'}
          {filter.query.trim() && (filter.field === 'content' || filter.field === 'all')
            ? ` · ${resultInfo.matches.toLocaleString()} content match${
                resultInfo.matches === 1 ? '' : 'es'
              }`
            : ''}
        </p>
      ) : null}

      {/* Filter panel */}
      {open && (
        <div className="card space-y-4 p-4">
          {/* File types */}
          {availableTypes.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                File type
              </p>
              <div className="flex flex-wrap gap-1.5">
                {availableTypes.map((t) => (
                  <Chip
                    key={t || 'none'}
                    label={t || '(no ext)'}
                    active={filter.fileTypes.includes(t)}
                    onClick={() => set({ fileTypes: toggleInList(filter.fileTypes, t) })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {availableTags.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Tags (match all)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    active={filter.tags.includes(t)}
                    onClick={() => set({ tags: toggleInList(filter.tags, t) })}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Status */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Status
              </p>
              <select
                className="input h-9 w-full py-0 text-xs"
                value={filter.status}
                onChange={(e) =>
                  set({ status: e.target.value as GlobalFilter['status'] })
                }
              >
                <option value="any">Any</option>
                <option value="ready">Ready</option>
                <option value="processing">Processing</option>
                <option value="error">Error</option>
              </select>
            </div>

            {/* Size */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Size (KB)
              </p>
              <div className="flex items-center gap-1.5">
                <NumberField
                  value={kb(filter.minSize)}
                  placeholder="min"
                  onChange={(v) => set({ minSize: toBytes(v) })}
                />
                <span className="text-slate-600">–</span>
                <NumberField
                  value={kb(filter.maxSize)}
                  placeholder="max"
                  onChange={(v) => set({ maxSize: toBytes(v) })}
                />
              </div>
            </div>

            {/* Pages */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Pages
              </p>
              <div className="flex items-center gap-1.5">
                <NumberField
                  value={filter.minPages}
                  placeholder="min"
                  onChange={(v) => set({ minPages: v })}
                />
                <span className="text-slate-600">–</span>
                <NumberField
                  value={filter.maxPages}
                  placeholder="max"
                  onChange={(v) => set({ maxPages: v })}
                />
              </div>
            </div>

            {/* Sort */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Sort by
              </p>
              <div className="flex items-center gap-1.5">
                <select
                  className="input h-9 w-full py-0 text-xs"
                  value={filter.sortKey}
                  onChange={(e) => set({ sortKey: e.target.value as SortKey })}
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  title={filter.sortDir === 'asc' ? 'Ascending' : 'Descending'}
                  onClick={() => set({ sortDir: filter.sortDir === 'asc' ? 'desc' : 'asc' })}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800"
                >
                  <SortIcon
                    className={classNames('h-4 w-4', filter.sortDir === 'asc' && 'rotate-180')}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Added after
              </p>
              <input
                type="date"
                className="input h-9 w-full py-0 text-xs"
                value={filter.addedAfter ?? ''}
                onChange={(e) => set({ addedAfter: e.target.value || null })}
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Added before
              </p>
              <input
                type="date"
                className="input h-9 w-full py-0 text-xs"
                value={filter.addedBefore ?? ''}
                onChange={(e) => set({ addedBefore: e.target.value || null })}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                set({
                  fileTypes: [],
                  tags: [],
                  status: 'any',
                  minSize: null,
                  maxSize: null,
                  minPages: null,
                  maxPages: null,
                  addedAfter: null,
                  addedBefore: null,
                })
              }
              className="text-xs font-medium text-slate-400 hover:text-slate-200"
            >
              Reset filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
