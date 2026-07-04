/**
 * Aggregate parsed data rows into the numbers the dashboard visualises.
 * Pure functions so results are easy to memoise and reason about.
 */
import type { DataAnalytics, DataRecord, DocRollup, HistogramBin } from '@/types';

function median(sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

/** Build ~`binCount` evenly-sized value buckets for a distribution chart. */
function buildHistogram(values: number[], binCount = 8): HistogramBin[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ from: min, to: max, count: values.length }];

  const width = (max - min) / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }
  return bins;
}

/** Compute KPIs, per-document rollups, a value histogram and the top rows. */
export function computeAnalytics(records: DataRecord[]): DataAnalytics {
  const values = records
    .map((r) => r.value)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const sum = values.reduce((a, b) => a + b, 0);
  const valueCount = values.length;
  const avg = valueCount ? sum / valueCount : 0;
  const min = valueCount ? values[0] : 0;
  const max = valueCount ? values[valueCount - 1] : 0;

  // Per-document rollups.
  const byDoc = new Map<string, DataRecord[]>();
  for (const r of records) {
    const list = byDoc.get(r.docId);
    if (list) list.push(r);
    else byDoc.set(r.docId, [r]);
  }
  const perDocument: DocRollup[] = [];
  for (const [docId, list] of byDoc) {
    const vals = list.map((r) => r.value).filter((v): v is number => v !== null);
    const s = vals.reduce((a, b) => a + b, 0);
    perDocument.push({
      docId,
      fileName: list[0].fileName,
      count: list.length,
      sum: s,
      avg: vals.length ? s / vals.length : 0,
      min: vals.length ? Math.min(...vals) : 0,
      max: vals.length ? Math.max(...vals) : 0,
    });
  }
  perDocument.sort((a, b) => b.count - a.count);

  const topRecords = [...records]
    .filter((r) => r.value !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 8);

  return {
    recordCount: records.length,
    documentCount: byDoc.size,
    valueCount,
    sum,
    avg,
    min,
    max,
    median: median(values),
    perDocument,
    histogram: buildHistogram(values),
    topRecords,
  };
}
