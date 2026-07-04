// Throwaway: generate a realistic tyre price-list .xlsx to test ingestion.
import { writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const rows = [
  ['SIZE', 'Pattern', 'SKU Code', 'Load Index', 'Speed', 'DP', 'RCP', 'Tube'],
  ['145/80R13', 'AMAZER', '700123', '75', 'T', 3200, 3600, 'TL'],
  ['165/80R14', 'AMAZER 4G', '700124', '84', 'T', 3900, 4300, 'TL'],
  ['175/65R14', 'ALNAC', '700125', '82', 'H', 4200, 4700, 'TL'],
  ['185/70R14', 'ALNAC 4G', '700126', '88', 'H', 4600, 5150, 'TL'],
  ['195/65R15', 'APTERRA', '700127', '91', 'V', 5300, 5950, 'TL'],
  ['205/55R16', 'APTERRA HT', '700128', '94', 'W', 6100, 6850, 'TL'],
  ['215/60R16', 'AMAZER XL', '700129', '99', 'V', 6700, 7500, 'TL'],
  ['225/45R17', 'APTERRA HP', '700130', '94', 'Y', 7900, 8850, 'TL'],
];

const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Passenger');
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync('Apollo Tyres Price List 2026.xlsx', buf);
console.log('wrote Apollo Tyres Price List 2026.xlsx with', rows.length - 1, 'data rows');
