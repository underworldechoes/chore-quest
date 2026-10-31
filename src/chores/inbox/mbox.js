// Minimal, defensive .mbox reader (Google Takeout "All mail" export). Only headers are read;
// message bodies are never parsed or stored.

const MAX_HEADER_BYTES = 16 * 1024;

/** Decode RFC 2047 encoded words like =?UTF-8?B?...?= and =?UTF-8?Q?...?=. Falls back to the raw text. */
export function decodeWords(value) {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (raw, charset, enc, data) => {
    try {
      const bytes = enc.toUpperCase() === 'B'
        ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
        : Uint8Array.from(
          data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))),
          (c) => c.charCodeAt(0),
        );
      return new TextDecoder(charset.toLowerCase()).decode(bytes);
    } catch {
      return raw;
    }
  });
}

/** Parse "Name <addr@x.com>" or "addr@x.com". */
export function parseAddress(value) {
  const decoded = decodeWords(value).trim();
  const angle = decoded.match(/^(.*)<([^>]+)>\s*$/);
  const address = (angle ? angle[2] : decoded).trim().toLowerCase();
  const name = angle ? angle[1].trim().replace(/^"|"$/g, '') : '';
  return { name, address };
}

function parseHeaders(block) {
  const headers = {};
  const unfolded = block.slice(0, MAX_HEADER_BYTES).replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    if (!(key in headers)) headers[key] = line.slice(i + 1).trim();
  }
  return headers;
}

/** Split an mbox into messages and keep just the headers we need. */
export function parseMbox(text) {
  const messages = [];
  for (const chunk of text.split(/^From .*$/m)) {
    const end = chunk.search(/\r?\n\r?\n/);
    if (end < 0 && !chunk.trim()) continue;
    const h = parseHeaders(end >= 0 ? chunk.slice(0, end) : chunk);
    if (!h.from) continue;
    const { name, address } = parseAddress(h.from);
    messages.push({
      name,
      address,
      subject: decodeWords(h.subject ?? '(no subject)'),
      date: h.date ?? '',
      unsubscribe: Boolean(h['list-unsubscribe']),
      gmailLabels: h['x-gmail-labels'] ?? '',
    });
  }
  return messages;
}

/** One enemy per sender: the chore is "decide what happens to everything from X". */
export function groupBySender(messages) {
  const bySender = new Map();
  for (const m of messages) {
    if (!m.address.includes('@')) continue;
    const s = bySender.get(m.address) ?? { address: m.address, name: m.name, count: 0, subjects: [], unsubscribe: false, labels: '' };
    s.count++;
    s.unsubscribe ||= m.unsubscribe;
    s.labels ||= m.gmailLabels;
    if (!s.name && m.name) s.name = m.name;
    if (s.subjects.length < 3) s.subjects.push(m.subject);
    bySender.set(m.address, s);
  }
  return [...bySender.values()].sort((a, b) => b.count - a.count);
}

export const domainOf = (address) => address.split('@')[1] ?? '';
