import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { DataFilter, DataRecord, DataSortKey, EditableField, PricingSettings } from '@/types';
import { compileQuery, getRanges } from '@/lib/search/search';
import { computeRowPricing } from '@/lib/data/pricing';
import { Highlight } from '@/components/Highlight';
import { ChevronDownIcon, CloseIcon, PencilIcon, PlusIcon, TableIcon } from '@/components/Icons';
import { classNames, formatMoney, formatNumber } from '@/lib/util';

interface Props {
  records: DataRecord[];
  filter: DataFilter;
  /** Current pricing (default DP/RCP discounts + per-row overrides). */
  pricing: PricingSettings;
  onSort: (key: DataSortKey) => void;
  onOpen: (rec: DataRecord) => void;
  /** Set (number) or clear (null) a row's DP discount override. */
  onRowDp: (id: string, pct: number | null) => void;
  /** Set (number) or clear (null) a row's RCP discount override. */
  onRowRcp: (id: string, pct: number | null) => void;
  /** Set (value) or clear (null) an editable field on a row. */
  onEditField: (id: string, field: EditableField, value: string | number | null) => void;
  /** Replace a row's manual tag list. */
  onEditTags: (id: string, tags: string[]) => void;
  /** Cap rendered rows for responsiveness; the rest are summarised. */
  limit?: number;
}

const COLUMNS: Array<{
  id: string;
  label: string;
  sortKey?: DataSortKey;
  align?: 'right';
  title?: string;
}> = [
  { id: 'brand', label: 'Company', sortKey: 'brand', title: 'Manufacturer — recognised automatically. Click to edit.' },
  { id: 'code', label: 'Code', sortKey: 'code' },
  { id: 'size', label: 'Size', sortKey: 'size', title: 'Tyre size (universal across brands). Click to edit — sort groups by size.' },
  { id: 'pattern', label: 'Pattern', sortKey: 'pattern', title: 'Tread pattern / model (brand-specific). Click to edit.' },
  { id: 'tube', label: 'Type', title: 'Tube type — TL (tubeless) or TT (tube type). Click to set.' },
  { id: 'dp', label: 'DP', sortKey: 'dp', align: 'right', title: 'Dealer price — total billing incl. GST (from the file). Net after the DP discount shown beneath it.' },
  { id: 'dpPct', label: 'DP discount', align: 'right', title: 'Discount you get off the dealer price. Saved automatically.' },
  { id: 'rcp', label: 'RCP', sortKey: 'rcp', align: 'right', title: 'Recommended customer price — click to add or edit. Net after the RCP discount shown beneath it.' },
  { id: 'rcpPct', label: 'RCP discount', align: 'right', title: 'Discount you give the customer off the RCP. Saved automatically.' },
  { id: 'tags', label: 'Tags', title: 'Your own tags for this row (added by you, not extracted).' },
  { id: 'page', label: 'Pg', sortKey: 'page', align: 'right' },
];

/** One editable percentage cell (stops row-click so typing never opens the row). */
function PctCell({
  value,
  overridden,
  defaultPct,
  onChange,
  label,
  accent,
}: {
  value: number;
  overridden: boolean;
  defaultPct: number;
  onChange: (pct: number | null) => void;
  label: string;
  accent: 'brand' | 'emerald';
}) {
  return (
    <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-end gap-1">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={0.5}
          value={overridden ? value : ''}
          placeholder={String(defaultPct)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={classNames(
            'w-14 rounded-md border bg-transparent px-1.5 py-1 text-right text-xs tabular-nums outline-none transition',
            overridden
              ? accent === 'brand'
                ? 'border-brand-500/60 text-brand-200 focus:border-brand-500'
                : 'border-emerald-500/60 text-emerald-200 focus:border-emerald-500'
              : 'border-slate-700 text-slate-300 placeholder:text-slate-500 focus:border-brand-500',
          )}
          title={
            overridden
              ? 'Custom for this row \u2014 clear to use the default'
              : `Using the default ${defaultPct}% \u2014 type to override`
          }
          aria-label={label}
        />
        <span className="text-[10px] text-slate-500">%</span>
      </div>
    </td>
  );
}

/** A small dot + label shown when a field was set by the user rather than extracted. */
function EditedDot({ title = 'Added by you' }: { title?: string }) {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title={title} />;
}

/** Click-to-edit inline text/number field. Commits on Enter or blur, cancels on Esc. */
function EditableInline({
  value,
  edited,
  onCommit,
  kind = 'text',
  placeholder = 'Add',
  align = 'left',
  mono = false,
  ariaLabel,
}: {
  value: string;
  edited?: boolean;
  onCommit: (raw: string) => void;
  kind?: 'text' | 'number';
  placeholder?: string;
  align?: 'left' | 'right';
  mono?: boolean;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  function begin() {
    setDraft(value);
    setEditing(true);
  }
  function commit(next: string) {
    setEditing(false);
    if (next.trim() !== value.trim()) onCommit(next);
  }

  if (editing) {
    return (
      <input
        ref={ref}
        type={kind === 'number' ? 'number' : 'text'}
        inputMode={kind === 'number' ? 'decimal' : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(draft);
          } else if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className={classNames(
          'w-full min-w-0 rounded-md border border-brand-500/60 bg-slate-900 px-1.5 py-1 text-xs text-slate-100 outline-none focus:border-brand-500',
          mono && 'font-mono',
          align === 'right' && 'text-right tabular-nums',
        )}
        aria-label={ariaLabel}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={begin}
      title={edited ? 'Added by you \u2014 click to edit' : 'Click to edit'}
      className={classNames(
        'group inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 transition hover:bg-slate-700/40',
        align === 'right' && 'flex-row-reverse',
        mono && 'font-mono',
        edited ? 'text-amber-300' : value ? 'text-slate-200' : 'text-slate-500',
      )}
    >
      <span className={classNames('truncate', !value && 'italic text-slate-600')}>{value || placeholder}</span>
      {edited ? (
        <EditedDot />
      ) : (
        <PencilIcon className="h-3 w-3 shrink-0 text-slate-500 opacity-0 transition group-hover:opacity-100" />
      )}
    </button>
  );
}

/** Tube-type cell — click reveals an Auto / TL / TT selector. */
function TubeCell({ value, edited, onCommit }: { value: string; edited?: boolean; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  return (
    <td className="whitespace-nowrap px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
      {editing ? (
        <select
          ref={ref}
          value={value}
          onChange={(e) => {
            onCommit(e.target.value);
            setEditing(false);
          }}
          onBlur={() => setEditing(false)}
          className="rounded-md border border-brand-500/60 bg-slate-900 px-1 py-1 text-xs text-slate-100 outline-none focus:border-brand-500"
          aria-label="Tube type for this row"
        >
          <option value="">Auto</option>
          <option value="TL">TL</option>
          <option value="TT">TT</option>
        </select>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title={edited ? 'Added by you \u2014 click to change' : 'Click to set the tube type'}
          className="group inline-flex items-center gap-1"
        >
          {value ? (
            <span
              className={classNames(
                'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                value === 'TL' ? 'border-sky-500/40 text-sky-300' : 'border-amber-500/40 text-amber-300',
                edited && 'ring-1 ring-amber-400/50',
              )}
            >
              {value}
            </span>
          ) : (
            <span className="italic text-slate-600">Add</span>
          )}
          {edited ? (
            <EditedDot />
          ) : (
            <PencilIcon className="h-3 w-3 text-slate-500 opacity-0 transition group-hover:opacity-100" />
          )}
        </button>
      )}
    </td>
  );
}

/** RCP cell — click-to-edit the customer price, with the discounted net shown beneath. */
function RcpValueCell({
  rcp,
  net,
  showNet,
  edited,
  onCommit,
}: {
  rcp: number | null;
  net: number | null;
  showNet: boolean;
  edited?: boolean;
  onCommit: (raw: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const current = rcp !== null ? String(rcp) : '';

  function begin() {
    setDraft(current);
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    if (draft.trim() !== current.trim()) onCommit(draft);
  }

  return (
    <td className="whitespace-nowrap px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
      {editing ? (
        <input
          ref={ref}
          type="number"
          inputMode="decimal"
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              setEditing(false);
            }
          }}
          placeholder="RCP"
          className="w-20 rounded-md border border-brand-500/60 bg-slate-900 px-1.5 py-1 text-right text-xs tabular-nums text-slate-100 outline-none focus:border-brand-500"
          aria-label="Recommended customer price for this row"
        />
      ) : (
        <button
          type="button"
          onClick={begin}
          title={edited ? 'Added by you \u2014 click to edit' : 'Click to add or edit the RCP'}
          className="group inline-flex flex-col items-end leading-tight"
        >
          {rcp !== null ? (
            <span
              className={classNames(
                'inline-flex items-center gap-1 text-xs tabular-nums',
                edited ? 'text-amber-300' : 'text-slate-300',
              )}
            >
              {edited && <EditedDot />}
              {formatMoney(rcp)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs italic text-slate-600">
              <PencilIcon className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
              Add RCP
            </span>
          )}
          {showNet && net !== null && (
            <span className="text-[10px] tabular-nums text-emerald-400/80" title="Customer price after the RCP discount">
              net {formatMoney(net)}
            </span>
          )}
        </button>
      )}
    </td>
  );
}

/** Tags cell — user-added chips plus an inline add field. */
function TagsCell({ tags, onCommit }: { tags: string[]; onCommit: (tags: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) ref.current?.focus();
  }, [adding]);

  function add() {
    const t = draft.replace(/\s+/g, ' ').trim();
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) onCommit([...tags, t]);
    setDraft('');
    setAdding(false);
  }
  function remove(t: string) {
    onCommit(tags.filter((x) => x !== t));
  }

  return (
    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex max-w-[13rem] flex-wrap items-center gap-1">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-200"
            title="Tag added by you"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              className="text-violet-300/70 hover:text-violet-100"
              aria-label={`Remove tag ${t}`}
            >
              <CloseIcon className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {adding ? (
          <input
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              } else if (e.key === 'Escape') {
                setDraft('');
                setAdding(false);
              }
            }}
            placeholder={'tag\u2026'}
            className="w-20 rounded-md border border-brand-500/60 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-100 outline-none focus:border-brand-500"
            aria-label="New tag"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="grid h-5 w-5 place-items-center rounded-full border border-dashed border-slate-600 text-slate-500 transition hover:border-slate-400 hover:text-slate-300"
            title="Add a tag"
            aria-label="Add a tag"
          >
            <PlusIcon className="h-3 w-3" />
          </button>
        )}
      </div>
    </td>
  );
}

export function DataTable({
  records,
  filter,
  pricing,
  onSort,
  onOpen,
  onRowDp,
  onRowRcp,
  onEditField,
  onEditTags,
  limit = 300,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Precompute highlight ranges for the visible label/code cells.
  const regex = useMemo(() => {
    if (!filter.query.trim()) return null;
    return compileQuery({
      query: filter.query,
      useRegex: filter.useRegex,
      caseSensitive: filter.caseSensitive,
      wholeWord: filter.wholeWord,
    }).regex;
  }, [filter.query, filter.useRegex, filter.caseSensitive, filter.wholeWord]);

  const shown = showAll ? records : records.slice(0, limit);
  const hiddenCount = records.length - shown.length;

  function ranges(text: string): Array<[number, number]> {
    if (!regex) return [];
    return getRanges(regex, text);
  }

  if (records.length === 0) {
    return (
      <div className="card grid place-items-center px-6 py-16 text-center">
        <TableIcon className="mb-3 h-10 w-10 text-slate-600" />
        <p className="text-sm text-slate-400">No rows match the current filters.</p>
        <p className="text-xs text-slate-600">Clear the query or widen the price range.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="max-h-[62vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
            <tr className="border-b border-slate-800 text-left">
              {COLUMNS.map((c) => {
                const active = c.sortKey && filter.sortKey === c.sortKey;
                return (
                  <th
                    key={c.id}
                    title={c.title}
                    className={classNames(
                      'whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400',
                      c.align === 'right' && 'text-right',
                      c.sortKey && 'cursor-pointer select-none hover:text-slate-200',
                    )}
                    onClick={() => c.sortKey && onSort(c.sortKey)}
                  >
                    <span className={classNames('inline-flex items-center gap-1', c.align === 'right' && 'flex-row-reverse')}>
                      {c.label}
                      {active && (
                        <ChevronDownIcon
                          className={classNames('h-3 w-3', filter.sortDir === 'asc' && 'rotate-180')}
                        />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const p = computeRowPricing(r, pricing);
              return (
              <Fragment key={r.id}>
                <tr
                  onClick={() => onOpen(r)}
                  className="cursor-pointer border-b border-slate-800/60 transition hover:bg-slate-800/40"
                >
                  <td
                    className="max-w-[13rem] px-3 py-2 text-xs text-slate-300"
                    title={r.fileName}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-start gap-1.5">
                      {r.fields && r.fields.length > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(r.id);
                          }}
                          className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded text-slate-500 hover:bg-slate-700/60 hover:text-slate-200"
                          title={expanded.has(r.id) ? 'Hide columns' : 'Show all columns'}
                          aria-label="Toggle column breakdown"
                        >
                          <ChevronDownIcon
                            className={classNames('h-3 w-3 transition', expanded.has(r.id) && 'rotate-180')}
                          />
                        </button>
                      ) : (
                        <span className="mt-0.5 inline-block h-4 w-4 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <EditableInline
                          value={r.brand ?? ''}
                          edited={r.edited?.brand}
                          onCommit={(v) => onEditField(r.id, 'brand', v.trim() === '' ? null : v)}
                          placeholder="Company"
                          ariaLabel="Company for this row"
                        />
                        {r.category && (
                          <span
                            className="mt-0.5 block truncate pl-1 text-[10px] text-slate-500"
                            title={'Vehicle segment \u2014 recognised automatically'}
                          >
                            {r.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-300">
                    {r.code ? <Highlight text={r.code} ranges={ranges(r.code)} /> : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <EditableInline
                      value={r.size ?? ''}
                      edited={r.edited?.size}
                      mono
                      onCommit={(v) => onEditField(r.id, 'size', v.trim() === '' ? null : v)}
                      placeholder="Add size"
                      ariaLabel="Tyre size for this row"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <EditableInline
                      value={r.pattern ?? ''}
                      edited={r.edited?.pattern}
                      onCommit={(v) => onEditField(r.id, 'pattern', v.trim() === '' ? null : v)}
                      placeholder="Add pattern"
                      ariaLabel="Pattern for this row"
                    />
                  </td>
                  <TubeCell
                    value={r.tube ?? ''}
                    edited={r.edited?.tube}
                    onCommit={(v) => onEditField(r.id, 'tube', v === '' ? null : v)}
                  />
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {p.dp !== null ? (
                      <div className="flex flex-col items-end leading-tight">
                        <span className="text-xs tabular-nums text-slate-300">{formatMoney(p.dp)}</span>
                        {p.dpFinal !== null && p.dpPct > 0 && (
                          <span
                            className="text-[10px] tabular-nums text-sky-400/80"
                            title="Your net cost after the DP discount"
                          >
                            net {formatMoney(p.dpFinal)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-600">{'\u2014'}</span>
                    )}
                  </td>
                  <PctCell
                    value={p.dpPct}
                    overridden={p.dpOverridden}
                    defaultPct={pricing.defaultDpPct}
                    onChange={(pct) => onRowDp(r.id, pct)}
                    label="DP discount percent for this row"
                    accent="brand"
                  />
                  <RcpValueCell
                    rcp={p.rcp}
                    net={p.rcpFinal}
                    showNet={p.rcpPct > 0}
                    edited={r.edited?.rcp}
                    onCommit={(v) => {
                      const n = Number(v);
                      onEditField(r.id, 'rcp', v.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : n);
                    }}
                  />
                  <PctCell
                    value={p.rcpPct}
                    overridden={p.rcpOverridden}
                    defaultPct={pricing.defaultRcpPct}
                    onChange={(pct) => onRowRcp(r.id, pct)}
                    label="RCP discount percent for this row"
                    accent="emerald"
                  />
                  <TagsCell tags={r.tags ?? []} onCommit={(tags) => onEditTags(r.id, tags)} />
                  <td className="px-3 py-2 text-right text-xs text-slate-500 tabular-nums">{r.page}</td>
                </tr>

                {expanded.has(r.id) && r.fields && r.fields.length > 0 && (
                  <tr className="border-b border-slate-800/60 bg-slate-900/60">
                    <td colSpan={COLUMNS.length} className="px-4 py-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Columns read from {r.fileName}
                      </p>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                        {r.fields.map((f) => (
                          <div key={f.key} className="flex flex-col">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              {f.name}
                            </span>
                            <span
                              className={classNames(
                                'text-sm tabular-nums',
                                f.role === 'price' ? 'font-semibold text-emerald-300' : 'text-slate-200',
                              )}
                            >
                              {f.value === null || f.value === ''
                                ? '—'
                                : f.kind === 'number'
                                  ? f.role === 'price'
                                    ? formatMoney(Number(f.value))
                                    : formatNumber(Number(f.value))
                                  : String(f.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-800 px-3 py-2 text-xs text-slate-500">
        <span>
          Showing {formatNumber(shown.length)} of {formatNumber(records.length)} rows
        </span>
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="font-medium text-brand-300 hover:text-brand-200"
          >
            Show all {formatNumber(records.length)}
          </button>
        )}
      </div>
    </div>
  );
}
