// Minimal RFC-4180-ish CSV parsing/serialising (quoted fields, escaped quotes, CRLF).

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

export function toCsv(rows) {
  return rows
    .map((r) => r.map((v) => {
      const s = String(v ?? '');
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');
}

const COLUMN_ALIASES = {
  date: ['date', 'transaction date', 'posted date', 'txn date'],
  description: ['description', 'merchant', 'payee', 'details', 'narration', 'name'],
  amount: ['amount', 'debit', 'value', 'amt'],
};

/** Turn parsed CSV rows into transaction objects, tolerating common bank-export header names. */
export function rowsToTransactions(rows) {
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(
    Object.entries(COLUMN_ALIASES).map(([key, aliases]) => [key, header.findIndex((h) => aliases.includes(h))]),
  );
  if (col.description < 0 || col.amount < 0) {
    throw new Error('CSV needs at least a description/merchant column and an amount column.');
  }
  return rows.slice(1).map((r, i) => ({
    id: `tx${i}`,
    date: col.date >= 0 ? r[col.date]?.trim() : '',
    description: r[col.description]?.trim() ?? '',
    amount: Math.abs(parseFloat(String(r[col.amount]).replace(/[^0-9.-]/g, '')) || 0),
  }));
}
