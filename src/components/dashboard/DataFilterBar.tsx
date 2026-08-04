import { useMemo, useState } from 'react';
import type { DataFacets, DataFilter, DataQueryField, DocRollup, TriState } from '@/types';
import { activeDataFilterCount } from '@/lib/data/filter';
import { classNames, formatNumber } from '@/lib/util';
import {
  AlertIcon,
  ChevronDownIcon,
  FilterIcon,
  SearchIcon,
} from '@/components/Icons';

interface Props {
  filter: DataFilter;
  onChange: (next: DataFilter) => void;
  /** Documents available to scope by (with row counts). */
  documents: DocRollup[];
  /** Distinct brand/size/pattern/tube values across the dataset (filter menus). */
  facets: DataFacets;
  error?: string;
  resultInfo?: { shown: number; total: number } | null;
}

const FIELDS: Array<{ value: DataQueryField; label: string }> = [
  { value: 'all', label: 'Whole row' },
  { value: 'code', label: 'Code only' },
  { value: 'label', label: 'Description' },
];

/** Add or remove a value from a multi-select list. */
function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

/** A multi-select group of chips for a facet (company / size / pattern / tube). */
function FacetChips({
  title,
  options,
  selected,
  onToggle,
  hint,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  hint?: string;
}) {
  if (options.length === 0) return null;
  const sel = new Set(selected);
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
        {selected.length > 0 && <span className="ml-1.5 text-brand-300">· {selected.length}</span>}
        {hint && <span className="ml-1 normal-case text-slate-600">{hint}</span>}
      </p>
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto pr-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={classNames(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition',
              sel.has(o)
                ? 'border-brand-500 bg-brand-500/20 text-brand-100'
                : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200',
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Two-input numeric range (min / max) used for the DP and RCP price bounds. */
function RangeInputs({
  title,
  min,
  max,
  onMin,
  onMax,
}: {
  title: string;
  min: number | null;
  max: number | null;
  onMin: (v: number | null) => void;
  onMax: (v: number | null) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          value={min ?? ''}
          placeholder="min"
          onChange={(e) => onMin(e.target.value === '' ? null : Number(e.target.value))}
          className="input h-9 w-full px-2 py-1 text-xs"
        />
        <span className="text-slate-600">–</span>
        <input
          type="number"
          min={0}
          value={max ?? ''}
          placeholder="max"
          onChange={(e) => onMax(e.target.value === '' ? null : Number(e.target.value))}
          className="input h-9 w-full px-2 py-1 text-xs"
        />
      </div>
    </div>
  );
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

/** Small segmented control (used for tri-state toggles). */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex h-9 w-full rounded-lg border border-slate-700 bg-slate-800/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={classNames(
            'flex-1 rounded-md px-2 text-xs font-medium transition',
            value === o.value
              ? 'bg-brand-500/20 text-brand-100'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DataFilterBar({ filter, onChange, documents, facets, error, resultInfo }: Props) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<DataFilter>) => onChange({ ...filter, ...patch });
  const activeCount = useMemo(() => activeDataFilterCount(filter), [filter]);

  function toggleDoc(docId: string) {
    set({ docIds: toggleIn(filter.docIds, docId) });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9 pr-28"
            placeholder={
              filter.useRegex
                ? 'Regex across every row, e.g. R15|R16'
                : 'Filter the data — code, size, pattern, price…'
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

        {/* Query field scope */}
        <select
          className="input h-10 w-full py-0 sm:w-36"
          value={filter.field}
          onChange={(e) => set({ field: e.target.value as DataQueryField })}
          title="Where to apply the query"
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
          <ChevronDownIcon className={classNames('h-4 w-4 transition', open && 'rotate-180')} />
        </button>
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-rose-300">
          <AlertIcon className="h-3.5 w-3.5" /> Invalid regex: {error}
        </p>
      ) : resultInfo ? (
        <p className="text-xs text-slate-500">
          <span className="text-slate-300">{formatNumber(resultInfo.shown)}</span> of{' '}
          {formatNumber(resultInfo.total)} data rows match
        </p>
      ) : null}

      {open && (
        <div className="card space-y-4 p-4">
          {/* Company / size / tube / pattern facets (auto-populated from the data) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FacetChips
              title="Company"
              options={facets.brands}
              selected={filter.brands}
              onToggle={(v) => set({ brands: toggleIn(filter.brands, v) })}
            />
            <FacetChips
              title="Tube type"
              hint="(TL = tubeless · TT = tube type)"
              options={facets.tubes}
              selected={filter.tubes}
              onToggle={(v) => set({ tubes: toggleIn(filter.tubes, v) })}
            />
          </div>

          <FacetChips
            title="Category"
            hint="(vehicle segment — recognised automatically)"
            options={facets.categories}
            selected={filter.categories}
            onToggle={(v) => set({ categories: toggleIn(filter.categories, v) })}
          />

          <FacetChips
            title="Tyre size"
            options={facets.sizes}
            selected={filter.sizes}
            onToggle={(v) => set({ sizes: toggleIn(filter.sizes, v) })}
          />

          <FacetChips
            title="Pattern"
            options={facets.patterns}
            selected={filter.patterns}
            onToggle={(v) => set({ patterns: toggleIn(filter.patterns, v) })}
          />

          {documents.length > 1 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Source document
              </p>
              <div className="flex flex-wrap gap-1.5">
                {documents.map((d) => (
                  <button
                    key={d.docId}
                    type="button"
                    onClick={() => toggleDoc(d.docId)}
                    className={classNames(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                      filter.docIds.includes(d.docId)
                        ? 'border-brand-500 bg-brand-500/20 text-brand-100'
                        : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200',
                    )}
                    title={`${formatNumber(d.count)} rows`}
                  >
                    {d.fileName}
                    <span className="ml-1.5 text-[10px] text-slate-500">{formatNumber(d.count)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* DP and RCP price ranges (manual min/max entry) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <RangeInputs
              title="Dealer price · DP (₹)"
              min={filter.minDp}
              max={filter.maxDp}
              onMin={(v) => set({ minDp: v })}
              onMax={(v) => set({ maxDp: v })}
            />
            <RangeInputs
              title="Customer price · RCP (₹)"
              min={filter.minRcp}
              max={filter.maxRcp}
              onMin={(v) => set({ minRcp: v })}
              onMax={(v) => set({ maxRcp: v })}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                SKU / article code
              </p>
              <Segmented<TriState>
                value={filter.hasCode}
                onChange={(v) => set({ hasCode: v })}
                options={[
                  { value: 'any', label: 'Any' },
                  { value: 'yes', label: 'With code' },
                  { value: 'no', label: 'Without' },
                ]}
              />
              <label className="mt-2 flex h-8 cursor-pointer items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={filter.onlyWithValue}
                  onChange={(e) => set({ onlyWithValue: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-brand-500 focus:ring-brand-500"
                />
                Only rows with a price
              </label>
              <label className="flex h-8 cursor-pointer items-center gap-2 text-xs text-amber-300">
                <input
                  type="checkbox"
                  checked={filter.editedOnly}
                  onChange={(e) => set({ editedOnly: e.target.checked })}
                  className="h-4 w-4 rounded border-amber-600/60 bg-slate-800 text-amber-500 focus:ring-amber-500"
                />
                Only edited rows
              </label>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Page range
              </p>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  value={filter.minPage ?? ''}
                  placeholder="from"
                  onChange={(e) => set({ minPage: e.target.value === '' ? null : Number(e.target.value) })}
                  className="input h-9 w-full px-2 py-1 text-xs"
                />
                <span className="text-slate-600">–</span>
                <input
                  type="number"
                  min={1}
                  value={filter.maxPage ?? ''}
                  placeholder="to"
                  onChange={(e) => set({ maxPage: e.target.value === '' ? null : Number(e.target.value) })}
                  className="input h-9 w-full px-2 py-1 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() =>
                set({
                  docIds: [],
                  brands: [],
                  sizes: [],
                  patterns: [],
                  tubes: [],
                  categories: [],
                  minDp: null,
                  maxDp: null,
                  minRcp: null,
                  maxRcp: null,
                  minValue: null,
                  maxValue: null,
                  onlyWithValue: false,
                  editedOnly: false,
                  hasCode: 'any',
                  minPage: null,
                  maxPage: null,
                  minColumns: 0,
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
