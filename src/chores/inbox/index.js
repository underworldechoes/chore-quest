// "Inbox Peak" chore: sort an email export (Google Takeout .mbox) sender by sender,
// then export Gmail filters you can import. Mail is never deleted and nothing is uploaded.
import { parseMbox, groupBySender, domainOf } from './mbox.js';
import { INBOX_CATEGORIES, suggestInboxCategory, inboxBossHp, toGmailFilters } from './classifier.js';
import { toCsv } from '../expenses/csv.js';

const MAX_MBOX_BYTES = 200 * 1024 * 1024;
const MAX_SENDERS = 400;

// [name, address, emails, has unsubscribe, sample subject]
const DEMO_SENDERS = [
  ['Myntra', 'offers@myntra.com', 612, true, 'FLAT 70% OFF ends tonight'],
  ['LinkedIn', 'messages-noreply@linkedin.com', 341, true, 'You appeared in 12 searches'],
  ['Medium Daily Digest', 'noreply@medium.com', 228, true, 'Stories for you'],
  ['Swiggy', 'noreply@swiggy.in', 160, true, 'Your order receipt'],
  ['GitHub', 'notifications@github.com', 140, true, '[repo] New issue opened'],
  ['Zomato', 'promotions@zomato.com', 96, true, 'Craving pizza? 50% off'],
  ['HDFC Bank', 'alerts@hdfcbank.net', 88, false, 'Transaction alert'],
  ['Substack', 'weekly@substack.com', 74, true, 'This week in AI'],
  ['Instagram', 'no-reply@mail.instagram.com', 66, true, 'See what you missed'],
  ['Amazon', 'order-update@amazon.in', 58, false, 'Your order has shipped'],
  ['Flipkart', 'deals@flipkart.com', 51, true, 'Big Billion Days deal'],
  ['Mom', 'mom.home@gmail.com', 44, false, 'Did you eat?'],
  ['Prof. Sharma', 'r.sharma@university.edu', 31, false, 'Assignment 3 feedback'],
  ['Spotify', 'no-reply@spotify.com', 29, true, 'Your Wrapped is here'],
  ['Netflix', 'info@mailer.netflix.com', 27, true, 'New arrivals this week'],
  ['Hackathon Team', 'team@promptwars.dev', 24, false, 'Round 2 results'],
  ['Discord', 'noreply@discord.com', 22, true, 'You have 5 unread messages'],
  ['Uber Receipts', 'uber.india@uber.com', 19, false, 'Your Tuesday trip receipt'],
  ['Google', 'no-reply@accounts.google.com', 17, false, 'Security alert'],
  ['Quora Digest', 'digest@quora.com', 16, true, 'Top stories for you'],
  ['Friend', 'rahul.k@outlook.com', 14, false, 'Weekend plans?'],
  ['Coursera', 'no-reply@coursera.org', 13, true, 'Your weekly learning update'],
  ['Paytm', 'payments@paytm.com', 12, false, 'Payment successful'],
  ['Reddit', 'noreply@redditmail.com', 11, true, 'Trending on r/programming'],
  ['Airtel', 'billing@airtel.in', 9, false, 'Your bill is ready'],
  ['IndiGo', 'bookings@goindigo.in', 7, false, 'Booking confirmation'],
  ['Random Shop', 'hello@randomshop.store', 6, true, 'We miss you'],
  ['Mailer Daemon', 'mailer-daemon@googlemail.com', 5, false, 'Delivery failed'],
  ['Notion', 'team@makenotion.com', 4, true, 'Product update'],
  ['Unknown', 'x7@qzv.io', 3, false, 'hi'],
];

export const inboxChore = {
  id: 'inbox',
  title: 'Inbox Peak',
  enemyName: 'Mail Wraith',
  blurb: 'Load your Google Takeout .mbox. Every wraith is a sender. Sort them; get Gmail filters to import.',
  categories: INBOX_CATEGORIES,
  realLabel: 'Load .mbox export',
  story: [
    'BYTE: The Summit Trail. Every unread email you ever ignored drifts up here as a Mail Wraith.',
    'BYTE: Each wraith is one sender. Zap it into a bin and I write a Gmail filter for everything they send.',
    'BYTE: Nothing gets deleted. You import the filters into Gmail yourself, and you get an unsubscribe list too.',
  ],
  supportsReal: () => true,

  async open(mode, memory) {
    const senders = mode === 'real' ? groupBySender(parseMbox(await pickMboxText())) : demoSenders();
    if (!senders.length) throw new Error('No emails found in that file. Export "Mail" from takeout.google.com as .mbox.');
    const items = senders.slice(0, MAX_SENDERS).map((s, i) => ({
      ...s,
      id: `s${i}`,
      label: s.name || s.address,
      sublabel: `${s.count} emails · ${s.address}`,
    }));

    return {
      items,
      sourceName: mode === 'real' ? 'your mailbox' : 'demo inbox',
      suggest: (item) => suggestInboxCategory(item, memory),
      learnKey: (item) => `sender:${domainOf(item.address)}`,
      bossHp: (item) => inboxBossHp(item.count),
      async apply(item, categoryId) { item.category = categoryId; },
      async finish(results) {
        const decided = results.filter((r) => r.category).map((r) => ({ address: r.item.address, category: r.category, item: r.item }));
        const label = (id) => INBOX_CATEGORIES.find((c) => c.id === id)?.label ?? id;
        const counts = {};
        for (const d of decided) counts[d.category] = (counts[d.category] ?? 0) + d.item.count;
        const handled = Object.values(counts).reduce((a, b) => a + b, 0);
        const unsub = decided.filter((d) => d.item.unsubscribe && ['promo', 'news', 'mute'].includes(d.category));

        const lines = INBOX_CATEGORIES.filter((c) => counts[c.id]).map((c) => `${c.label.padEnd(8)} ${counts[c.id]} emails`);
        lines.push(`${handled} emails across ${decided.length} senders now have a rule`);
        if (unsub.length) lines.push(`${unsub.length} senders worth unsubscribing from (list included)`);
        lines.push('Import: Gmail > Settings > Filters and Blocked Addresses > Import filters');

        return {
          lines,
          canUndo: false,
          downloads: [
            { name: 'gmail-filters.xml', blob: new Blob([toGmailFilters(decided)], { type: 'application/xml' }) },
            {
              name: 'unsubscribe-list.csv',
              blob: new Blob([toCsv([['Sender', 'Address', 'Emails', 'Bin'], ...unsub.map((d) => [d.item.name, d.address, d.item.count, label(d.category)])])], { type: 'text/csv' }),
            },
          ],
        };
      },
    };
  },
};

function demoSenders() {
  return DEMO_SENDERS.map(([name, address, count, unsubscribe, subject]) => ({
    name, address, count, unsubscribe, subjects: [subject], labels: '',
  }));
}

function pickMboxText() {
  return new Promise((resolve, reject) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.mbox,.eml,.txt' });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('No file chosen.'));
      if (file.size > MAX_MBOX_BYTES) return reject(new Error('That export is over 200 MB. Export a single label or year instead.'));
      file.text().then(resolve, reject);
    });
    input.addEventListener('cancel', () => reject(new DOMException('cancelled', 'AbortError')));
    input.click();
  });
}
