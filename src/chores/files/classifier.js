// Pure file-classification rules. No DOM / File System access here so it can be unit tested.

export const FILE_CATEGORIES = [
  { id: 'images', label: 'Images', color: '#4fc3f7' },
  { id: 'docs', label: 'Docs', color: '#ffd54f' },
  { id: 'media', label: 'Media', color: '#ba68c8' },
  { id: 'archives', label: 'Archives', color: '#ff8a65' },
  { id: 'dupes', label: 'Dupes', color: '#e57373' },
  { id: 'misc', label: 'Misc', color: '#90a4ae' },
];

const EXTENSION_MAP = {
  images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'tiff', 'ico'],
  docs: ['pdf', 'doc', 'docx', 'txt', 'md', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'odt', 'rtf', 'epub'],
  media: ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'mp4', 'mkv', 'mov', 'avi', 'webm'],
  archives: ['zip', 'rar', '7z', 'tar', 'gz', 'exe', 'msi', 'dmg', 'iso', 'apk', 'deb'],
};

const EXT_LOOKUP = Object.fromEntries(
  Object.entries(EXTENSION_MAP).flatMap(([cat, exts]) => exts.map((e) => [e, cat])),
);

// Filename hints that override weak extension guesses (e.g. "Screenshot 2024.pdf" is still a doc,
// but "invoice.png" is a scanned document the user probably wants with their docs).
const NAME_HINTS = [
  { pattern: /(invoice|receipt|statement|resume|cv|contract|report)/i, category: 'docs', reason: 'name looks like paperwork' },
  { pattern: /(screenshot|screen shot|img_|dsc_|photo)/i, category: 'images', reason: 'name looks like a photo/screenshot' },
  { pattern: /(setup|installer|install)/i, category: 'archives', reason: 'name looks like an installer' },
];

const COPY_SUFFIX = /\s*(\(\d+\)|-\s*copy|\s+copy(\s*\d+)?)$/i;

export function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function baseNameOf(name) {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return stem.replace(COPY_SUFFIX, '').trim().toLowerCase();
}

/**
 * Mark files that are byte-identical (same hash) to an earlier file as duplicates.
 * Falls back to "same base name + same size" when no hash is available.
 * Returns a Set of item ids that are duplicates (the first/oldest copy is kept).
 */
export function findDuplicates(items) {
  const seen = new Map();
  const dupes = new Set();
  const sorted = [...items].sort((a, b) => (a.lastModified ?? 0) - (b.lastModified ?? 0));
  for (const item of sorted) {
    const key = item.hash ? `h:${item.hash}` : `n:${baseNameOf(item.name)}.${extensionOf(item.name)}:${item.size}`;
    if (seen.has(key)) dupes.add(item.id);
    else seen.set(key, item.id);
  }
  return dupes;
}

/**
 * Suggest a category for a file.
 * @param {{name:string,size:number,isDuplicate?:boolean}} item
 * @param {{lookup:(key:string)=>string|undefined}} memory learned user preferences
 * @returns {{category:string, confidence:number, reason:string}}
 */
export function suggestFileCategory(item, memory) {
  if (item.isDuplicate) {
    return { category: 'dupes', confidence: 0.97, reason: 'identical copy of another file' };
  }

  const ext = extensionOf(item.name);
  const learned = memory?.lookup(`ext:${ext}`);
  if (learned) {
    return { category: learned, confidence: 0.95, reason: `you usually put .${ext} here` };
  }

  const hint = NAME_HINTS.find((h) => h.pattern.test(item.name));
  const byExt = EXT_LOOKUP[ext];

  if (hint && byExt && hint.category !== byExt) {
    return { category: hint.category, confidence: 0.6, reason: `${hint.reason} (but it's a .${ext})` };
  }
  if (byExt) {
    return { category: byExt, confidence: hint ? 0.98 : 0.9, reason: `.${ext} file` };
  }
  if (hint) {
    return { category: hint.category, confidence: 0.55, reason: hint.reason };
  }
  return { category: 'misc', confidence: 0.35, reason: ext ? `unknown .${ext} type` : 'no extension' };
}
