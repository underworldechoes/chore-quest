// Pure expense categorisation + analysis.

export const EXPENSE_CATEGORIES = [
  { id: 'food', label: 'Food', color: '#81c784' },
  { id: 'transport', label: 'Travel', color: '#4fc3f7' },
  { id: 'bills', label: 'Bills', color: '#ffd54f' },
  { id: 'subs', label: 'Subs', color: '#ba68c8' },
  { id: 'shopping', label: 'Shop', color: '#ff8a65' },
  { id: 'other', label: 'Other', color: '#90a4ae' },
];

const KEYWORDS = {
  food: ['swiggy', 'zomato', 'restaurant', 'cafe', 'coffee', 'starbucks', 'pizza', 'burger', 'grocery', 'mart', 'dominos', 'mcdonald', 'kfc', 'bakery'],
  transport: ['uber', 'ola', 'lyft', 'metro', 'fuel', 'petrol', 'shell', 'irctc', 'airlines', 'indigo', 'rapido', 'parking', 'toll'],
  bills: ['electric', 'water', 'gas bill', 'rent', 'airtel', 'jio', 'broadband', 'insurance', 'emi', 'utility'],
  subs: ['netflix', 'spotify', 'prime', 'youtube', 'icloud', 'adobe', 'chatgpt', 'claude', 'hotstar', 'github', 'notion', 'subscription'],
  shopping: ['amazon', 'flipkart', 'myntra', 'ikea', 'store', 'mall', 'decathlon', 'nykaa'],
};

/** Normalise a bank description to a stable merchant key ("UBER *TRIP 8812" -> "uber trip"). */
export function merchantKey(description) {
  return description
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 2)
    .join(' ');
}

export function suggestExpenseCategory(tx, memory) {
  const key = merchantKey(tx.description);
  const learned = memory?.lookup(`merchant:${key}`);
  if (learned) return { category: learned, confidence: 0.96, reason: `you filed "${key}" here before` };

  const desc = tx.description.toLowerCase();
  for (const [category, words] of Object.entries(KEYWORDS)) {
    // Match at the start of a word, so "emi" (loan EMI) doesn't fire inside "premium".
    const hit = words.find((w) => new RegExp(`\\b${w}`).test(desc));
    if (hit) return { category, confidence: 0.88, reason: `matches "${hit}"` };
  }
  return { category: 'other', confidence: 0.3, reason: 'unknown merchant' };
}

/** Bigger spends are tougher bosses: 1 hit under 2,000, up to 5 hits from 20,000. */
export function expenseBossHp(amount) {
  if (amount >= 20000) return 5;
  if (amount >= 10000) return 4;
  if (amount >= 5000) return 3;
  if (amount >= 2000) return 2;
  return 1;
}

const monthOf = (date) => (date || '').slice(0, 7);

/**
 * Analyse categorised transactions.
 * @param {Array<{id,date,description,amount,category}>} txs
 */
export function analyzeExpenses(txs) {
  const totals = {};
  for (const t of txs) totals[t.category] = (totals[t.category] ?? 0) + t.amount;

  // Recurring: same merchant in >= 2 distinct months with amounts within 10%.
  const byMerchant = new Map();
  for (const t of txs) {
    const k = merchantKey(t.description);
    if (!byMerchant.has(k)) byMerchant.set(k, []);
    byMerchant.get(k).push(t);
  }
  const recurring = [];
  for (const [merchant, list] of byMerchant) {
    const months = new Set(list.map((t) => monthOf(t.date)).filter(Boolean));
    if (months.size < 2) continue;
    const amounts = list.map((t) => t.amount);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    if (max - min <= max * 0.1) recurring.push({ merchant, amount: max, count: list.length });
  }

  // Possible double charges: same date + merchant + amount.
  const seen = new Set();
  const doubleCharges = [];
  for (const t of txs) {
    const k = `${t.date}|${merchantKey(t.description)}|${t.amount}`;
    if (seen.has(k)) doubleCharges.push(t);
    else seen.add(k);
  }

  // Outliers: more than 2.5x the median spend of its category.
  const outliers = [];
  const byCat = Object.groupBy ? Object.groupBy(txs, (t) => t.category) : groupBy(txs, (t) => t.category);
  for (const list of Object.values(byCat)) {
    if (list.length < 3) continue;
    const sorted = list.map((t) => t.amount).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const t of list) if (t.amount > median * 2.5) outliers.push(t);
  }

  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  return { totals, total, recurring, doubleCharges, outliers };
}

function groupBy(arr, fn) {
  return arr.reduce((acc, x) => ((acc[fn(x)] ??= []).push(x), acc), {});
}
