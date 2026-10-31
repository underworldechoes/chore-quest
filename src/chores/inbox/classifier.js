// Pure sender classification + Gmail filter export.
import { domainOf } from './mbox.js';

export const INBOX_CATEGORIES = [
  { id: 'keep', label: 'Keep', color: '#5fd38d' },
  { id: 'receipts', label: 'Receipts', color: '#ffd54f' },
  { id: 'social', label: 'Social', color: '#4fc3f7' },
  { id: 'news', label: 'News', color: '#ba68c8' },
  { id: 'promo', label: 'Promo', color: '#ff8a65' },
  { id: 'mute', label: 'Mute', color: '#90a4ae' },
];

const RULES = [
  { category: 'receipts', test: /(receipt|invoice|order|payment|statement|billing|transaction|bank|upi)/i, why: 'looks like receipts/billing' },
  { category: 'social', test: /(linkedin|facebook|instagram|twitter|x\.com|discord|reddit|quora|whatsapp)/i, why: 'social network' },
  { category: 'promo', test: /(sale|offer|deal|% off|discount|coupon|promo|shop|store|myntra|flipkart|amazon)/i, why: 'promotional' },
  { category: 'news', test: /(newsletter|digest|weekly|daily|substack|medium|news|update)/i, why: 'newsletter / digest' },
  { category: 'mute', test: /(no-?reply|notification|alerts?@|mailer-daemon)/i, why: 'automated notifications' },
];
const PERSONAL_DOMAINS = /^(gmail|outlook|hotmail|yahoo|icloud|proton(mail)?)\./i;

export function suggestInboxCategory(sender, memory) {
  const domain = domainOf(sender.address);
  const learned = memory?.lookup(`sender:${domain}`);
  if (learned) return { category: learned, confidence: 0.95, reason: `you sorted @${domain} before` };

  if (PERSONAL_DOMAINS.test(domain) && !sender.unsubscribe) {
    return { category: 'keep', confidence: 0.9, reason: 'a real person writing to you' };
  }
  const haystack = `${sender.name} ${sender.address} ${sender.subjects.join(' ')}`;
  const rule = RULES.find((r) => r.test.test(haystack));
  if (rule) return { category: rule.category, confidence: sender.unsubscribe ? 0.92 : 0.82, reason: rule.why };
  if (sender.unsubscribe) return { category: 'news', confidence: 0.7, reason: 'mailing list (has unsubscribe)' };
  return { category: 'keep', confidence: 0.4, reason: 'unknown sender' };
}

/** Senders who flood you are bosses: 20+ emails = 2 hits, up to 5 hits at 500+. */
export function inboxBossHp(count) {
  if (count >= 500) return 5;
  if (count >= 200) return 4;
  if (count >= 60) return 3;
  if (count >= 20) return 2;
  return 1;
}

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
export const xmlEscape = (s) => String(s).replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

// What each bin becomes in Gmail. Nothing ever deletes mail.
const ACTIONS = {
  keep: null,
  receipts: { label: 'Chore Quest/Receipts', archive: false },
  social: { label: 'Chore Quest/Social', archive: true },
  news: { label: 'Chore Quest/News', archive: true },
  promo: { label: 'Chore Quest/Promo', archive: true },
  mute: { label: 'Chore Quest/Muted', archive: true, markRead: true },
};

/**
 * Build a Gmail filters XML file (Settings → Filters and Blocked Addresses → Import filters).
 * @param {Array<{address:string, category:string}>} decisions
 */
export function toGmailFilters(decisions, now = new Date()) {
  const entries = decisions.flatMap(({ address, category }) => {
    const action = ACTIONS[category];
    if (!action) return [];
    const props = [
      ['from', address],
      ['label', action.label],
      action.archive ? ['shouldArchive', 'true'] : null,
      action.markRead ? ['shouldMarkAsRead', 'true'] : null,
    ].filter(Boolean);
    return [[
      '  <entry>',
      "    <category term='filter'></category>",
      '    <title>Mail Filter</title>',
      `    <updated>${now.toISOString()}</updated>`,
      '    <content></content>',
      ...props.map(([k, v]) => `    <apps:property name='${k}' value='${xmlEscape(v)}'/>`),
      '  </entry>',
    ].join('\n')];
  });
  return [
    "<?xml version='1.0' encoding='UTF-8'?>",
    "<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>",
    '  <title>Chore Quest mail filters</title>',
    ...entries,
    '</feed>',
    '',
  ].join('\n');
}
