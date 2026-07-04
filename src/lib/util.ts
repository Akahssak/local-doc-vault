/** Small shared helpers. */

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Return the lowercased extension including the dot, e.g. ".pdf" (or ""). */
export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Compact integer, e.g. 1234 -> "1,234", 1200000 -> "12L" style grouping. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(Math.round(n));
}

/** Money with the ₹ symbol and Indian digit grouping. */
export function formatMoney(n: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
}

/** Abbreviate large counts for compact chart/axis labels. */
export function abbreviate(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `${(n / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}
