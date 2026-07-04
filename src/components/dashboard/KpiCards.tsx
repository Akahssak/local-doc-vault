import type { ReactNode } from 'react';
import type { DataAnalytics } from '@/types';
import { abbreviate, formatMoney, formatNumber } from '@/lib/util';
import {
  DatabaseIcon,
  FolderIcon,
  RupeeIcon,
  SigmaIcon,
  TrendingUpIcon,
} from '@/components/Icons';

interface Props {
  analytics: DataAnalytics;
}

interface Kpi {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  accent: string;
}

export function KpiCards({ analytics }: Props) {
  const kpis: Kpi[] = [
    {
      label: 'Data rows',
      value: formatNumber(analytics.recordCount),
      hint: `${analytics.documentCount} source${analytics.documentCount === 1 ? '' : 's'}`,
      icon: <DatabaseIcon className="h-5 w-5" />,
      accent: 'from-sky-500/20 to-sky-500/5 text-sky-300 ring-sky-500/30',
    },
    {
      label: 'Documents',
      value: formatNumber(analytics.documentCount),
      hint: 'in global.json',
      icon: <FolderIcon className="h-5 w-5" />,
      accent: 'from-violet-500/20 to-violet-500/5 text-violet-300 ring-violet-500/30',
    },
    {
      label: 'Avg price',
      value: analytics.valueCount ? formatMoney(analytics.avg) : '—',
      hint: `median ${analytics.valueCount ? formatMoney(analytics.median) : '—'}`,
      icon: <TrendingUpIcon className="h-5 w-5" />,
      accent: 'from-emerald-500/20 to-emerald-500/5 text-emerald-300 ring-emerald-500/30',
    },
    {
      label: 'Price range',
      value: analytics.valueCount
        ? `${abbreviate(analytics.min)}–${abbreviate(analytics.max)}`
        : '—',
      hint: analytics.valueCount ? `max ${formatMoney(analytics.max)}` : 'no priced rows',
      icon: <RupeeIcon className="h-5 w-5" />,
      accent: 'from-amber-500/20 to-amber-500/5 text-amber-300 ring-amber-500/30',
    },
    {
      label: 'Total value',
      value: analytics.valueCount ? formatMoney(analytics.sum) : '—',
      hint: `${formatNumber(analytics.valueCount)} priced rows`,
      icon: <SigmaIcon className="h-5 w-5" />,
      accent: 'from-rose-500/20 to-rose-500/5 text-rose-300 ring-rose-500/30',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {kpis.map((k) => (
        <div key={k.label} className="card relative overflow-hidden p-4">
          <div
            className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br ${k.accent.split(' ').slice(0, 2).join(' ')} blur-xl`}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {k.label}
            </span>
            <span className={`grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ring-1 ${k.accent}`}>
              {k.icon}
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">{k.value}</p>
          {k.hint && <p className="mt-0.5 text-[11px] text-slate-500">{k.hint}</p>}
        </div>
      ))}
    </div>
  );
}
