// "Expense Swamp" chore: categorise a bank-statement CSV and produce a cleaned report.
import { parseCsv, rowsToTransactions, toCsv } from './csv.js';
import { EXPENSE_CATEGORIES, suggestExpenseCategory, analyzeExpenses, merchantKey, expenseBossHp } from './analyzer.js';

const DEMO_CSV = `Date,Description,Amount
2026-09-01,NETFLIX.COM SUBSCRIPTION,649
2026-09-02,UBER *TRIP 8812,312
2026-09-03,SWIGGY ORDER 22341,486
2026-09-03,SWIGGY ORDER 22341,486
2026-09-05,AMAZON PAY INDIA,2399
2026-09-06,AIRTEL BROADBAND,999
2026-09-08,STARBUCKS KORAMANGALA,420
2026-09-09,RAPIDO BIKE,89
2026-09-11,SPOTIFY PREMIUM,119
2026-09-12,BLUE TOKAI ROASTERS,380
2026-09-14,FLIPKART INTERNET,15499
2026-09-15,RENT TRANSFER SEPTEMBER,18000
2026-09-18,ZOMATO ONLINE,552
2026-09-20,PVR CINEMAS,700
2026-09-22,INDIGO AIRLINES,5420
2026-09-25,DOMINOS PIZZA,399
2026-10-01,NETFLIX.COM SUBSCRIPTION,649
2026-10-02,UBER *TRIP 9921,288
2026-10-04,ELECTRICITY BESCOM,1430
2026-10-05,ZOMATO ONLINE,610
2026-10-07,CULT FIT MEMBERSHIP,1299
2026-10-09,AMAZON PAY INDIA,849
2026-10-11,SPOTIFY PREMIUM,119
2026-10-12,BLUE TOKAI ROASTERS,410
2026-10-15,RENT TRANSFER OCTOBER,18000
2026-10-19,MYNTRA FASHION,1899
2026-10-21,SHELL PETROL PUMP,2100
2026-10-24,CULT FIT MEMBERSHIP,1299
2026-10-27,SWIGGY INSTAMART,743
2026-10-29,CLAUDE.AI SUBSCRIPTION,1700`;

export const expensesChore = {
  id: 'expenses',
  title: 'Expense Swamp',
  enemyName: 'Receipt Goblin',
  blurb: 'Load a bank-statement CSV. Every goblin is a transaction. Zap it into a category; get a clean report.',
  categories: EXPENSE_CATEGORIES,
  realLabel: 'Load a CSV',
  story: [
    'BYTE: The Expense Swamp! Receipt Goblins hoard your unreviewed transactions.',
    'BYTE: Zap each one into a category. I learn every merchant you correct me on.',
    'BYTE: At the end I hand you a categorised CSV plus subscriptions and double charges I caught.',
  ],
  supportsReal: () => true,

  async open(mode, memory) {
    const text = mode === 'real' ? await pickCsvText() : DEMO_CSV;
    const items = rowsToTransactions(parseCsv(text)).map((tx) => ({
      ...tx,
      label: tx.description,
      sublabel: `${tx.date}  ₹${tx.amount.toLocaleString('en-IN')}`,
    }));
    if (!items.length) throw new Error('No transactions found in that CSV.');

    return {
      items,
      sourceName: mode === 'real' ? 'your statement' : 'demo statement',
      suggest: (item) => suggestExpenseCategory(item, memory),
      bossHp: (item) => expenseBossHp(item.amount),
      learnKey: (item) => `merchant:${merchantKey(item.description)}`,
      async apply(item, categoryId) { item.category = categoryId; },
      async finish(results) {
        const done = results.filter((r) => r.category).map((r) => r.item);
        const report = analyzeExpenses(done);
        const label = (id) => EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
        const money = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

        const lines = Object.entries(report.totals)
          .sort((a, b) => b[1] - a[1])
          .map(([cat, amt]) => `${label(cat).padEnd(7)} ${money(amt)}`);
        lines.push(`TOTAL   ${money(report.total)}`);
        report.recurring.forEach((r) => lines.push(`Recurring: ${r.merchant} ${money(r.amount)}/mo (${money(r.amount * 12)}/yr)`));
        report.doubleCharges.forEach((t) => lines.push(`Possible double charge: ${t.description} ${money(t.amount)} on ${t.date}`));
        report.outliers.forEach((t) => lines.push(`Unusually large: ${t.description} ${money(t.amount)}`));

        const csv = toCsv([
          ['Date', 'Description', 'Amount', 'Category'],
          ...items.map((t) => [t.date, t.description, t.amount, t.category ? label(t.category) : 'Unreviewed']),
        ]);
        const summary = ['Chore Quest - Expense Report', '', ...lines].join('\n');
        return {
          lines,
          canUndo: false,
          downloads: [
            { name: 'expenses_categorised.csv', blob: new Blob([csv], { type: 'text/csv' }) },
            { name: 'expense_report.txt', blob: new Blob([summary], { type: 'text/plain' }) },
          ],
        };
      },
    };
  },
};

function pickCsvText() {
  return new Promise((resolve, reject) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.csv,text/csv' });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) file.text().then(resolve, reject);
      else reject(new Error('No file chosen.'));
    });
    input.addEventListener('cancel', () => reject(new DOMException('cancelled', 'AbortError')));
    input.click();
  });
}
