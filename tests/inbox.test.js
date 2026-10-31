import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMbox, groupBySender, decodeWords, parseAddress } from '../src/chores/inbox/mbox.js';
import { suggestInboxCategory, inboxBossHp, toGmailFilters, xmlEscape } from '../src/chores/inbox/classifier.js';

const MBOX = [
  'From 1@xxx Mon Jan 1 00:00:00 2026',
  'From: "Myntra" <Offers@Myntra.com>',
  'Subject: =?UTF-8?B?NzAlIE9GRg==?=',
  'List-Unsubscribe: <mailto:u@myntra.com>',
  '',
  'body line',
  'From 2@xxx Mon Jan 1 00:00:00 2026',
  'From: offers@myntra.com',
  'Subject: Flash',
  '  sale',
  '',
  'From 3@xxx Mon Jan 1 00:00:00 2026',
  'From: Mom <mom@gmail.com>',
  'Subject: Did you eat?',
  '',
  'hi',
].join('\n');

test('mbox headers parse with folding and encoded words; bodies are ignored', () => {
  const msgs = parseMbox(MBOX);
  assert.equal(msgs.length, 3);
  assert.equal(msgs[0].subject, '70% OFF');
  assert.equal(msgs[1].subject, 'Flash sale');
  assert.equal(msgs[0].unsubscribe, true);
  assert.equal(decodeWords('=?utf-8?Q?Hello_World?='), 'Hello World');
  assert.deepEqual(parseAddress('"A, B" <x@y.com>'), { name: 'A, B', address: 'x@y.com' });
});

test('senders are grouped case-insensitively and sorted by volume', () => {
  const senders = groupBySender(parseMbox(MBOX));
  assert.equal(senders[0].address, 'offers@myntra.com');
  assert.equal(senders[0].count, 2);
  assert.equal(senders[0].unsubscribe, true);
});

test('classifier: people are kept, lists are sorted, memory wins', () => {
  const s = (address, extra = {}) => ({ name: '', address, subjects: [], unsubscribe: false, ...extra });
  assert.equal(suggestInboxCategory(s('mom@gmail.com')).category, 'keep');
  assert.equal(suggestInboxCategory(s('deals@flipkart.com', { unsubscribe: true })).category, 'promo');
  assert.equal(suggestInboxCategory(s('alerts@hdfcbank.net', { subjects: ['Transaction alert'] })).category, 'receipts');
  const memory = { lookup: (k) => (k === 'sender:flipkart.com' ? 'mute' : undefined) };
  assert.equal(suggestInboxCategory(s('deals@flipkart.com'), memory).category, 'mute');
  assert.equal(inboxBossHp(5), 1);
  assert.equal(inboxBossHp(612), 5);
});

test('Gmail filters are valid, escaped, and never delete', () => {
  const xml = toGmailFilters([
    { address: "o'brien&co@<evil>.com", category: 'promo' },
    { address: 'mom@gmail.com', category: 'keep' },
    { address: 'x@y.com', category: 'mute' },
  ], new Date(0));
  assert.match(xml, /value='o&apos;brien&amp;co@&lt;evil&gt;\.com'/);
  assert.doesNotMatch(xml, /mom@gmail\.com/);
  assert.match(xml, /shouldMarkAsRead/);
  assert.doesNotMatch(xml, /shouldTrash|delete/i);
  assert.equal(xmlEscape(`<a href="x">`), '&lt;a href=&quot;x&quot;&gt;');
});
