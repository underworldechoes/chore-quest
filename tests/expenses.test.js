import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toCsv, rowsToTransactions } from '../src/chores/expenses/csv.js';
import { suggestExpenseCategory, analyzeExpenses, merchantKey } from '../src/chores/expenses/analyzer.js';

test('CSV round-trips quotes, commas and CRLF', () => {
  const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"']]);
  assert.equal(toCsv(rows), 'a,b\n"x, y","say ""hi"""');
});

test('tolerates bank header aliases and currency symbols', () => {
  const txs = rowsToTransactions(parseCsv('Posted Date,Merchant,Debit\n2026-01-02,UBER TRIP,"-₹1,250.50"'));
  assert.deepEqual(txs[0], { id: 'tx0', date: '2026-01-02', description: 'UBER TRIP', amount: 1250.5 });
});

test('rejects CSVs without required columns', () => {
  assert.throws(() => rowsToTransactions([['foo'], ['bar']]), /description/);
});

test('suggests by keyword and learns merchants', () => {
  assert.equal(suggestExpenseCategory({ description: 'NETFLIX.COM' }).category, 'subs');
  const memory = { lookup: (k) => (k === 'merchant:blue tokai' ? 'food' : undefined) };
  const s = suggestExpenseCategory({ description: 'BLUE TOKAI ROASTERS' }, memory);
  assert.equal(s.category, 'food');
  assert.equal(merchantKey('UBER *TRIP 8812'), 'uber trip');
});

test('analysis finds recurring, double charges and outliers', () => {
  const txs = [
    { date: '2026-09-01', description: 'NETFLIX', amount: 649, category: 'subs' },
    { date: '2026-10-01', description: 'NETFLIX', amount: 649, category: 'subs' },
    { date: '2026-09-03', description: 'SWIGGY 1', amount: 400, category: 'food' },
    { date: '2026-09-03', description: 'SWIGGY 1', amount: 400, category: 'food' },
    { date: '2026-09-04', description: 'CAFE', amount: 300, category: 'food' },
    { date: '2026-09-05', description: 'FANCY DINNER', amount: 5000, category: 'food' },
  ];
  const r = analyzeExpenses(txs);
  assert.equal(r.total, 7398);
  assert.deepEqual(r.recurring.map((x) => x.merchant), ['netflix']);
  assert.equal(r.doubleCharges.length, 1);
  assert.deepEqual(r.outliers.map((t) => t.description), ['FANCY DINNER']);
});

test('keywords match whole words, not fragments inside other words', () => {
  assert.equal(suggestExpenseCategory({ description: 'SPOTIFY PREMIUM' }).category, 'subs');
  assert.equal(suggestExpenseCategory({ description: 'HDFC EMI 0042' }).category, 'bills');
  assert.equal(suggestExpenseCategory({ description: 'ELECTRICITY BESCOM' }).category, 'bills');
});

test('CSV export neutralises spreadsheet formula injection', () => {
  const out = toCsv([['=HYPERLINK("http://evil","x")', '+cmd', '-2+3', '@SUM(A1)', 42, 'SWIGGY']]);
  assert.equal(out, `"'=HYPERLINK(""http://evil"",""x"")",'+cmd,'-2+3,'@SUM(A1),42,SWIGGY`);
});
