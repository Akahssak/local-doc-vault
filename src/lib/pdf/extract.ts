/**
 * Extraction: turn an uploaded file into structured JSON.
 *
 *  - PDF   -> parsed with pdf.js; text items are grouped back into lines using
 *             their on-page coordinates so tables/price-lists stay readable.
 *  - XLSX  -> parsed with SheetJS; every sheet becomes a page and each column
 *             is given a synthetic x-position so the same column detector used
 *             for PDFs can read the table.
 *  - text  -> read as UTF-8 and split into lines.
 *  - other -> stored as-is with no extracted text (searchable by file name).
 */
import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this to a hashed URL and bundles the worker for offline use.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { APP_CONFIG } from '@/config';
import type { DocCell, DocLine, DocPage, DocumentJson } from '@/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfTextItem {
  str: string;
  transform: number[]; // [a, b, c, d, e(x), f(y)]
  width: number;
  height: number;
  hasEOL?: boolean;
}

interface Glyph {
  x: number;
  y: number;
  w: number;
  str: string;
}

/** Group pdf.js text items into visual lines (top→bottom, left→right). */
function groupIntoLines(items: PdfTextItem[]): DocLine[] {
  const glyphs: Glyph[] = [];
  for (const it of items) {
    if (typeof it.str !== 'string' || it.str.length === 0) continue;
    glyphs.push({ x: it.transform[4], y: it.transform[5], w: it.width, str: it.str });
  }
  if (glyphs.length === 0) return [];

  // Primary sort: top of page first (larger y). Secondary: left first.
  glyphs.sort((a, b) => (Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x));

  const rows: Glyph[][] = [];
  const yTolerance = 3;
  for (const g of glyphs) {
    const current = rows[rows.length - 1];
    if (current && Math.abs(current[0].y - g.y) <= yTolerance) {
      current.push(g);
    } else {
      rows.push([g]);
    }
  }

  const lines: DocLine[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let text = '';
    let prevEnd: number | null = null;
    const cells: DocCell[] = [];
    for (const g of row) {
      const str = g.str.replace(/\s+/g, ' ').trim();
      if (str) cells.push({ x: Math.round(g.x), str });
      if (prevEnd !== null) {
        const gap = g.x - prevEnd;
        const approxSpace = g.w > 0 ? g.w / Math.max(g.str.length, 1) : 2;
        if (gap > Math.max(1, approxSpace * 0.5) && !text.endsWith(' ')) text += ' ';
      }
      text += g.str;
      prevEnd = g.x + g.w;
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (text) lines.push({ index: lines.length, y: row[0].y, text, cells });
  }
  return lines;
}

async function extractPdf(file: File): Promise<DocumentJson> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    isEvalSupported: false, // safer: no code eval from PDF content
  });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;

  let info: Record<string, unknown> | undefined;
  try {
    const meta = await pdf.getMetadata();
    info = meta?.info as Record<string, unknown> | undefined;
  } catch {
    /* metadata is optional */
  }

  const pages: DocPage[] = [];
  for (let p = 1; p <= pageCount; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const lines = groupIntoLines(content.items as PdfTextItem[]);
    pages.push({
      pageNumber: p,
      width: viewport.width,
      height: viewport.height,
      text: lines.map((l) => l.text).join('\n'),
      lines,
    });
    page.cleanup();
  }

  await pdf.cleanup();
  await loadingTask.destroy();

  return {
    fileName: file.name,
    pageCount,
    pages,
    fullText: pages.map((p) => p.text).join('\n\n'),
    extractedAt: new Date().toISOString(),
    info,
  };
}

async function extractText(file: File): Promise<DocumentJson> {
  const raw = await file.text();
  const lines: DocLine[] = raw
    .split(/\r\n|\r|\n/)
    .map((t, i) => ({ index: i, y: -i, text: t }));
  return {
    fileName: file.name,
    pageCount: 1,
    pages: [{ pageNumber: 1, width: 0, height: 0, text: raw, lines }],
    fullText: raw,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Synthetic horizontal spacing (in the same arbitrary units as PDF cell x's)
 * given to each spreadsheet column. Must be comfortably larger than the column
 * detector's clustering tolerance so every column stays distinct.
 */
const SHEET_COL_X = 100;

async function extractSpreadsheet(file: File): Promise<DocumentJson> {
  // Loaded on demand so the (large) spreadsheet parser is only pulled in when
  // an Excel/ODS file is actually uploaded.
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();

  // `dense` keeps memory reasonable on big sheets; no eval/formula execution.
  // A throw here usually means the file is password-protected or corrupt.
  let workbook: import('xlsx').WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array', dense: true });
  } catch (e) {
    throw new Error(
      `This spreadsheet could not be read — it may be password-protected or corrupt. (${(e as Error).message})`,
    );
  }

  const pages: DocPage[] = [];
  workbook.SheetNames.forEach((name, si) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return;

    // header:1 -> array-of-arrays (row -> column-indexed cells). raw:false gives
    // display text (formatted numbers/dates); toNumber() later strips currency.
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    }) as unknown[][];

    const lines: DocLine[] = [];
    for (const row of rows) {
      const cells: DocCell[] = [];
      const parts: string[] = [];
      row.forEach((cell, ci) => {
        const str = cell == null ? '' : String(cell).replace(/\s+/g, ' ').trim();
        if (!str) return;
        cells.push({ x: ci * SHEET_COL_X, str });
        parts.push(str);
      });
      const text = parts.join(' ').trim();
      if (!text) continue;
      lines.push({ index: lines.length, y: -lines.length, text, cells });
    }

    pages.push({
      pageNumber: si + 1,
      width: 0,
      height: 0,
      text: lines.map((l) => l.text).join('\n'),
      lines,
      title: name,
    });
  });

  // Nothing readable (empty workbook, image-only sheet, etc.). Signal an error
  // so the file is still stored & downloadable but clearly flagged.
  if (!pages.some((p) => p.lines.length > 0)) {
    throw new Error('No readable rows were found in this spreadsheet.');
  }

  return {
    fileName: file.name,
    pageCount: pages.length,
    pages,
    fullText: pages.map((p) => p.text).join('\n\n'),
    extractedAt: new Date().toISOString(),
  };
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isSpreadsheet(file: File): boolean {
  const name = file.name.toLowerCase();
  return APP_CONFIG.spreadsheetExtensions.some((ext) => name.endsWith(ext));
}

function isTextLike(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith('text/') ||
    file.type === 'application/json' ||
    APP_CONFIG.textExtensions.some((ext) => name.endsWith(ext))
  );
}

/** Entry point: extract JSON content from any uploaded file. */
export async function extractDocument(file: File): Promise<DocumentJson> {
  if (isPdf(file)) return extractPdf(file);
  if (isSpreadsheet(file)) return extractSpreadsheet(file);
  if (isTextLike(file)) return extractText(file);
  return {
    fileName: file.name,
    pageCount: 0,
    pages: [],
    fullText: '',
    extractedAt: new Date().toISOString(),
  };
}

/** A short single-line preview for list rows. */
export function makePreview(fullText: string, max = 180): string {
  const collapsed = fullText.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}
