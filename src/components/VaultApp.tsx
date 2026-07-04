import { useDeferredValue, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useDocuments } from '@/hooks/useDocuments';
import { usePricing } from '@/hooks/usePricing';
import { useRecordEdits } from '@/hooks/useRecordEdits';
import { parseAllRecords } from '@/lib/data/records';
import { applyRecordEdits } from '@/lib/data/edits';
import { computeAnalytics } from '@/lib/data/analytics';
import { computeRowPricing } from '@/lib/data/pricing';
import { applyDataFilter, computeFacets, DEFAULT_DATA_FILTER } from '@/lib/data/filter';
import { isOpfsSupported } from '@/lib/storage/opfs';
import { clearAllData } from '@/lib/storage/db';
import { classNames, formatNumber } from '@/lib/util';
import type { DataFilter, DataRecord, DataSortKey, StoredDocument } from '@/types';

import { Header } from '@/components/Header';
import { UploadZone } from '@/components/UploadZone';
import { KpiCards } from '@/components/dashboard/KpiCards';
import { Charts } from '@/components/dashboard/Charts';
import { DataTable } from '@/components/dashboard/DataTable';
import { DataFilterBar } from '@/components/dashboard/DataFilterBar';
import { DocumentList } from '@/components/DocumentList';
import { DocumentViewer } from '@/components/DocumentViewer';
import { SettingsDialog } from '@/components/SettingsDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  AlertIcon,
  ChartBarIcon,
  DatabaseIcon,
  DownloadIcon,
  FolderIcon,
  GridIcon,
  PercentIcon,
  SearchIcon,
  TableIcon,
} from '@/components/Icons';
import { toast } from '@/components/Toast';

interface Selection {
  doc: StoredDocument;
  page?: number;
}

type Tab = 'dashboard' | 'data' | 'documents';

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: 'Dashboard', icon: <ChartBarIcon className="h-4 w-4" /> },
  { id: 'data', label: 'Data', icon: <TableIcon className="h-4 w-4" /> },
  { id: 'documents', label: 'Documents', icon: <GridIcon className="h-4 w-4" /> },
];

export function VaultApp() {
  const { logout } = useAuth();
  const { docs, contents, loading, progress, manifest, globalIndex, addFiles, remove, saveTags, refresh } =
    useDocuments();
  const pricing = usePricing();
  const edits = useRecordEdits();

  const [tab, setTab] = useState<Tab>('dashboard');
  const [dataFilter, setDataFilter] = useState<DataFilter>(DEFAULT_DATA_FILTER);
  const [docQuery, setDocQuery] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<StoredDocument | null>(null);

  const opfsOk = useMemo(() => isOpfsSupported(), []);
  const deferredFilter = useDeferredValue(dataFilter);

  // Parse the business rows out of the extracted JSON (the "data in the JSON").
  const allRecords = useMemo(
    () => parseAllRecords(docs.map((d) => ({ docId: d.id, json: contents.get(d.id) }))),
    [docs, contents],
  );

  // Layer the admin's manual corrections (company/size/pattern/type/RCP + tags)
  // on top of the auto-extracted rows so every downstream view — facets,
  // filters, KPIs, charts and the export — reflects exactly what they edited.
  const records = useMemo(() => applyRecordEdits(allRecords, edits.edits), [allRecords, edits.edits]);

  // Full-dataset rollups (used for the filter bar's document chips).
  const allAnalytics = useMemo(() => computeAnalytics(records), [records]);

  // Distinct brand/size/pattern/tube values for the filter menus (auto-updates
  // as new PDFs introduce new values).
  const facets = useMemo(() => computeFacets(records), [records]);

  // Apply the single global data filter that drives every visual.
  const filtered = useMemo(
    () => applyDataFilter(records, deferredFilter),
    [records, deferredFilter],
  );

  // Analytics recomputed over the FILTERED rows so KPIs + charts react live.
  const analytics = useMemo(() => computeAnalytics(filtered.records), [filtered.records]);

  const visibleDocs = useMemo(() => {
    const q = docQuery.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) => d.fileName.toLowerCase().includes(q) || d.preview.toLowerCase().includes(q),
    );
  }, [docs, docQuery]);

  const dataSearchOptions = {
    query: deferredFilter.query,
    useRegex: deferredFilter.useRegex,
    caseSensitive: deferredFilter.caseSensitive,
    wholeWord: deferredFilter.wholeWord,
  };

  async function handleFiles(files: File[]) {
    if (!opfsOk) {
      toast('This browser can\u2019t store files privately (OPFS unsupported).', 'error');
      return;
    }
    const res = await addFiles(files);
    const parts: string[] = [];
    if (res.added) parts.push(`${res.added} added`);
    if (res.duplicates) parts.push(`${res.duplicates} duplicate${res.duplicates === 1 ? '' : 's'} skipped`);
    if (res.failed) parts.push(`${res.failed} failed`);
    toast(parts.join(' \u00b7 ') || 'Nothing to add', res.failed ? 'error' : 'success');
  }

  function openRecord(rec: DataRecord) {
    const doc = docs.find((d) => d.id === rec.docId);
    if (doc) setSelection({ doc, page: rec.page });
  }

  function pickDocument(docId: string) {
    setDataFilter((f) => ({
      ...f,
      docIds: f.docIds.length === 1 && f.docIds[0] === docId ? [] : [docId],
    }));
  }

  function sortBy(key: DataSortKey) {
    setDataFilter((f) => ({
      ...f,
      sortKey: key,
      sortDir: f.sortKey === key && f.sortDir === 'desc' ? 'asc' : 'desc',
    }));
  }

  function exportGlobalJson() {
    // Mirror the editable pricing (dealer/customer price + both discounts and
    // their discounted net prices) plus the admin's manual corrections
    // (company/size/pattern/type/RCP), recognised category and tags into the
    // exported JSON so the download reflects exactly what the table shows.
    const rows = records
      .map((r) => {
        const p = computeRowPricing(r, pricing.pricing);
        return {
          id: r.id,
          fileName: r.fileName,
          brand: r.brand ?? null,
          code: r.code,
          size: r.size ?? null,
          pattern: r.pattern ?? null,
          tube: r.tube ?? null,
          category: r.category ?? null,
          tags: r.tags ?? [],
          edited: r.edited ? Object.keys(r.edited) : [],
          dp: p.dp,
          dpDiscountPct: p.dpPct,
          dpNet: p.dpFinal,
          rcp: p.rcp,
          rcpDiscountPct: p.rcpPct,
          rcpNet: p.rcpFinal,
        };
      })
      .filter((x) => x.dp !== null || x.rcp !== null);
    const merged = {
      ...globalIndex,
      pricing: {
        defaultDpPct: pricing.pricing.defaultDpPct,
        defaultRcpPct: pricing.pricing.defaultRcpPct,
        rows,
      },
    };
    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${manifest?.folderName ?? 'vault'}-global.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Exported global.json', 'success');
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const doc = pendingDelete;
    setPendingDelete(null);
    if (selection?.doc.id === doc.id) setSelection(null);
    await remove(doc);
    toast(`Deleted ${doc.fileName}`, 'success');
  }

  async function wipeAll() {
    await Promise.all(docs.map((d) => remove(d).catch(() => undefined)));
    await clearAllData();
    await refresh();
    setSelection(null);
  }

  const selectedJson = selection ? contents.get(selection.doc.id) : undefined;
  const showDataTools = tab === 'dashboard' || tab === 'data';

  return (
    <div className="min-h-screen">
      <Header
        docCount={docs.length}
        refreshKey={docs.length}
        onLock={logout}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        {!opfsOk && (
          <div className="card flex items-start gap-3 border-amber-800/50 bg-amber-950/20 p-4">
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div className="text-sm text-amber-100">
              <p className="font-medium">Private on-device storage isn't available here.</p>
              <p className="mt-0.5 text-amber-200/80">
                Use a recent Chrome, Edge, Firefox, or Safari 16.4+ (desktop or Android) to upload
                and store files privately.
              </p>
            </div>
          </div>
        )}

        <UploadZone onFiles={handleFiles} progress={progress} />

        {/* Vault identity + global JSON toolbar */}
        <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-800/70 text-brand-300 ring-1 ring-slate-700">
              <FolderIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">
                Folder: <span className="font-mono text-brand-300">{manifest?.folderName ?? 'vault'}</span>
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {manifest ? (
                  <>
                    Vault ID <span className="font-mono">{manifest.vaultId.slice(0, 8)}</span> ·{' '}
                    {manifest.deviceLabel} · reused on every visit
                  </>
                ) : (
                  'Preparing vault…'
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="chip border-slate-700 bg-slate-800/50 text-slate-300">
              <DatabaseIcon className="mr-1 inline h-3.5 w-3.5" />
              {formatNumber(allAnalytics.recordCount)} rows · {globalIndex.documentCount} docs
            </span>
            <button
              type="button"
              onClick={exportGlobalJson}
              disabled={globalIndex.documentCount === 0}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              title="Download the whole vault as one JSON file"
            >
              <DownloadIcon className="h-4 w-4" />
              Export global.json
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center justify-between">
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800/40 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={classNames(
                  'flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition',
                  tab === t.id
                    ? 'bg-brand-500/20 text-brand-100 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Global DATA filter (drives dashboard + data table) */}
        {showDataTools && (
          <div className="card p-4">
            <DataFilterBar
              filter={dataFilter}
              onChange={setDataFilter}
              documents={allAnalytics.perDocument}
              facets={facets}
              error={filtered.error}
              resultInfo={{ shown: filtered.records.length, total: records.length }}
            />
          </div>
        )}

        {loading ? (
          <div className="card grid place-items-center py-16 text-sm text-slate-500">
            Loading vault…
          </div>
        ) : docs.length === 0 ? (
          <div className="card grid place-items-center px-6 py-16 text-center">
            <DatabaseIcon className="mb-3 h-10 w-10 text-slate-600" />
            <p className="text-sm text-slate-400">Your vault is empty.</p>
            <p className="text-xs text-slate-600">
              Upload a price-list PDF above to build the dashboard.
            </p>
          </div>
        ) : tab === 'dashboard' ? (
          <div className="space-y-5">
            <KpiCards analytics={analytics} />
            <Charts
              analytics={analytics}
              onPickDocument={pickDocument}
              onOpenRecord={openRecord}
              activeDocId={dataFilter.docIds.length === 1 ? dataFilter.docIds[0] : undefined}
            />
            {analytics.recordCount === 0 && (
              <div className="card grid place-items-center py-10 text-sm text-slate-500">
                No data rows match the current filters.
              </div>
            )}
          </div>
        ) : tab === 'data' ? (
          <div className="space-y-4">
            <div className="card flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-800/70 text-emerald-300 ring-1 ring-slate-700">
                  <PercentIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-100">Default discounts</p>
                  <p className="text-[11px] text-slate-500">
                    <span className="text-slate-300">DP&nbsp;%</span> is your discount off the dealer price (your
                    cost); <span className="text-slate-300">RCP&nbsp;%</span> is the discount you give the customer
                    off the recommended price (your selling price). Type per-row values to override. Saved
                    automatically.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 lg:ml-auto">
                {edits.editCount > 0 && (
                  <button
                    type="button"
                    onClick={edits.clearAll}
                    className="text-xs font-medium text-amber-300/80 hover:text-amber-200"
                    title="Undo every manual company / size / pattern / type / RCP change and tag"
                  >
                    Reset {formatNumber(edits.editCount)} edited row
                    {edits.editCount === 1 ? '' : 's'}
                  </button>
                )}
                {pricing.overrideCount > 0 && (
                  <button
                    type="button"
                    onClick={pricing.clearOverrides}
                    className="text-xs font-medium text-slate-400 hover:text-slate-200"
                  >
                    Reset {formatNumber(pricing.overrideCount)} custom row
                    {pricing.overrideCount === 1 ? '' : 's'}
                  </button>
                )}
                <label className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-400">DP</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={pricing.pricing.defaultDpPct}
                    onChange={(e) => pricing.setDefaultDpPct(Number(e.target.value))}
                    className="input h-10 w-20 text-right tabular-nums"
                    aria-label="Default DP discount percent for all rows"
                  />
                  <span className="text-sm font-medium text-slate-400">%</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-400">RCP</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={pricing.pricing.defaultRcpPct}
                    onChange={(e) => pricing.setDefaultRcpPct(Number(e.target.value))}
                    className="input h-10 w-20 text-right tabular-nums"
                    aria-label="Default RCP discount percent for all rows"
                  />
                  <span className="text-sm font-medium text-slate-400">%</span>
                </label>
              </div>
            </div>
            <DataTable
              records={filtered.records}
              filter={deferredFilter}
              pricing={pricing.pricing}
              onSort={sortBy}
              onOpen={openRecord}
              onRowDp={pricing.setRowDp}
              onRowRcp={pricing.setRowRcp}
              onEditField={edits.setField}
              onEditTags={edits.setTags}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative max-w-md">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                className="input pl-9"
                placeholder="Filter documents by name…"
                value={docQuery}
                onChange={(e) => setDocQuery(e.target.value)}
                spellCheck={false}
              />
            </div>
            <DocumentList
              docs={visibleDocs}
              onOpen={(doc) => setSelection({ doc })}
              onDelete={(doc) => setPendingDelete(doc)}
            />
          </div>
        )}
      </main>

      {selection && (
        <DocumentViewer
          doc={selection.doc}
          json={selectedJson}
          searchOptions={dataSearchOptions}
          initialPage={selection.page}
          onClose={() => setSelection(null)}
          onDelete={(doc) => setPendingDelete(doc)}
          onSaveTags={async (doc, tags) => {
            await saveTags(doc, tags);
            setSelection((cur) => (cur ? { ...cur, doc: { ...cur.doc, tags } } : cur));
            toast('Tags saved.', 'success');
          }}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          onWipe={wipeAll}
          docCount={docs.length}
          refreshKey={docs.length}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete document?"
          danger
          confirmLabel="Delete"
          message={
            <>
              <span className="font-medium text-slate-200">{pendingDelete.fileName}</span> and its
              extracted data will be permanently removed from this device.
            </>
          }
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
