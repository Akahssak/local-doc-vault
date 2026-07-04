import type { DataAnalytics, DataRecord, DocRollup } from '@/types';
import { abbreviate, classNames, formatMoney, formatNumber } from '@/lib/util';
import { ChartBarIcon, LayersIcon, TrendingUpIcon } from '@/components/Icons';

interface Props {
  analytics: DataAnalytics;
  onPickDocument?: (docId: string) => void;
  onOpenRecord?: (rec: DataRecord) => void;
  activeDocId?: string;
}

function Panel({
  title,
  icon,
  children,
  right,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-800/70 text-brand-300 ring-1 ring-slate-700">
            {icon}
          </span>
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** Horizontal bar list: rows per source document. */
function PerDocumentChart({
  rows,
  activeDocId,
  onPick,
}: {
  rows: DocRollup[];
  activeDocId?: string;
  onPick?: (docId: string) => void;
}) {
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <Empty />;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const pct = (r.count / maxCount) * 100;
        const active = r.docId === activeDocId;
        return (
          <button
            key={r.docId}
            onClick={() => onPick?.(r.docId)}
            className="group block w-full text-left"
            title={`${r.fileName} · ${formatNumber(r.count)} rows · avg ${formatMoney(r.avg)}`}
          >
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-slate-300 group-hover:text-slate-50">{r.fileName}</span>
              <span className="shrink-0 font-medium text-slate-400">{formatNumber(r.count)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={classNames(
                  'h-full rounded-full bg-gradient-to-r transition-all',
                  active ? 'from-brand-400 to-brand-500' : 'from-brand-600 to-brand-500/70',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Vertical bars: value distribution histogram. */
function DistributionChart({ analytics }: { analytics: DataAnalytics }) {
  const { histogram } = analytics;
  if (histogram.length === 0) return <Empty />;
  const maxCount = Math.max(1, ...histogram.map((b) => b.count));
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5">
        {histogram.map((b, i) => {
          const h = (b.count / maxCount) * 100;
          return (
            <div
              key={i}
              className="group relative min-w-0 flex-1 rounded-t bg-gradient-to-t from-brand-600/70 to-brand-400 transition-all hover:from-brand-500 hover:to-brand-300"
              style={{ height: `${Math.max(h, b.count ? 4 : 0)}%` }}
            >
              <div className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-200 shadow-lg group-hover:block">
                {formatNumber(b.count)} rows · {abbreviate(b.from)}–{abbreviate(b.to)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-500">
        <span>{abbreviate(analytics.min)}</span>
        <span>price →</span>
        <span>{abbreviate(analytics.max)}</span>
      </div>
    </div>
  );
}

/** Top priced rows as a ranked horizontal bar list. */
function TopRecordsChart({
  records,
  onOpen,
}: {
  records: DataRecord[];
  onOpen?: (rec: DataRecord) => void;
}) {
  if (records.length === 0) return <Empty />;
  const max = Math.max(1, ...records.map((r) => r.value ?? 0));
  return (
    <div className="space-y-2">
      {records.map((r) => {
        const pct = ((r.value ?? 0) / max) * 100;
        return (
          <button
            key={r.id}
            onClick={() => onOpen?.(r)}
            className="group block w-full text-left"
            title={r.text}
          >
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-slate-300 group-hover:text-slate-50">
                {r.label || r.code || r.text}
              </span>
              <span className="shrink-0 font-semibold text-emerald-300">
                {formatMoney(r.value ?? 0)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
                style={{ width: `${pct}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Empty() {
  return (
    <div className="grid place-items-center py-10 text-xs text-slate-600">
      No data for the current filters.
    </div>
  );
}

export function Charts({ analytics, onPickDocument, onOpenRecord, activeDocId }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Panel title="Rows per document" icon={<LayersIcon className="h-4 w-4" />}>
        <PerDocumentChart
          rows={analytics.perDocument}
          activeDocId={activeDocId}
          onPick={onPickDocument}
        />
      </Panel>
      <Panel
        title="Price distribution"
        icon={<ChartBarIcon className="h-4 w-4" />}
        right={
          <span className="text-[11px] text-slate-500">
            {formatNumber(analytics.valueCount)} priced
          </span>
        }
      >
        <DistributionChart analytics={analytics} />
      </Panel>
      <Panel title="Top priced rows" icon={<TrendingUpIcon className="h-4 w-4" />}>
        <TopRecordsChart records={analytics.topRecords} onOpen={onOpenRecord} />
      </Panel>
    </div>
  );
}
