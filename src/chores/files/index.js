// "Folder Dungeon" chore: sorts a real folder (File System Access API) or a demo folder.
import { FILE_CATEGORIES, suggestFileCategory, findDuplicates, extensionOf, baseNameOf, fileBossHp } from './classifier.js';

const MAX_FILES = 500;
const HASH_LIMIT_BYTES = 25 * 1024 * 1024;

// A few heavyweights so the demo has bosses to fight.
const DEMO_BIG_FILES = {
  'ubuntu-24.04.iso': 2.6 * 1024 ** 3,
  'vacation.mp4': 1.3 * 1024 ** 3,
  'project_backup.zip': 640 * 1024 ** 2,
  'trailer.mkv': 380 * 1024 ** 2,
  'setup_game.exe': 120 * 1024 ** 2,
  'clip.mov': 75 * 1024 ** 2,
  'node-v22-x64.msi': 31 * 1024 ** 2,
};

const DEMO_FILES = [
  'IMG_2041.jpg', 'IMG_2041 (1).jpg', 'Screenshot 2026-03-11.png', 'resume_final_v3.docx', 'invoice_march.pdf',
  'node-v22-x64.msi', 'vacation.mp4', 'lofi_beats.mp3', 'project_backup.zip', 'notes.txt', 'budget.xlsx',
  'meme.gif', 'setup_game.exe', 'thesis_draft.pdf', 'thesis_draft - Copy.pdf', 'podcast_ep12.m4a', 'logo.svg',
  'random_file', 'data.parquet', 'receipt_scan.png', 'slides_final.pptx', 'DSC_0099.jpeg', 'archive.7z',
  'contract_signed.pdf', 'voice_memo.wav', 'wallpaper.webp', 'ubuntu-24.04.iso', 'todo.md', 'trailer.mkv',
  'config.backup', 'family_photo.heic', 'report_q3.docx', 'report_q3 (2).docx', 'song.flac', 'clip.mov',
].map((name, i) => {
  if (DEMO_BIG_FILES[name]) return { id: `f${i}`, name, size: DEMO_BIG_FILES[name], lastModified: i };
  // Copies like "x (1).jpg" get the same size as "x.jpg", so duplicate detection has something to find.
  const canonical = `${baseNameOf(name)}.${extensionOf(name)}`;
  const size = [...canonical].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9_000_000, 7) + 1000;
  return { id: `f${i}`, name, size, lastModified: i };
});

export const filesChore = {
  id: 'files',
  title: 'Folder Dungeon',
  enemyName: 'Clutter Slime',
  blurb: 'Pick a messy folder (Downloads?). Every slime is a real file. Zap it into the right subfolder.',
  categories: FILE_CATEGORIES,
  realLabel: 'Choose a folder',
  story: [
    'BYTE: The Downloads Dungeon has been festering for months...',
    'BYTE: Each Clutter Slime is a real file. Zap one and I move it into a tidy subfolder.',
    'BYTE: Nothing gets deleted. Dupes go to a "Dupes" folder, and you can undo everything at the end.',
  ],
  supportsReal: () => typeof window !== 'undefined' && 'showDirectoryPicker' in window,

  async open(mode, memory) {
    const backend = mode === 'real' ? await RealFolder.pick() : new DemoFolder();
    const items = await backend.list();
    const dupes = findDuplicates(items);
    for (const it of items) {
      it.isDuplicate = dupes.has(it.id);
      it.label = it.name;
      it.sublabel = formatSize(it.size);
    }
    const journal = [];

    return {
      items,
      sourceName: backend.name,
      suggest: (item) => suggestFileCategory(item, memory),
      bossHp: (item) => fileBossHp(item.size),
      learnKey: (item) => (item.isDuplicate ? null : `ext:${extensionOf(item.name)}`),
      async apply(item, categoryId) {
        const folder = FILE_CATEGORIES.find((c) => c.id === categoryId).label;
        const finalName = await backend.move(item, folder);
        journal.push({ item, folder, finalName });
      },
      async undoAll() {
        for (const entry of journal.reverse()) await backend.restore(entry);
        journal.length = 0;
      },
      async finish(results) {
        const counts = countBy(results.filter((r) => r.category), (r) => r.category);
        const lines = FILE_CATEGORIES.filter((c) => counts[c.id]).map((c) => `${c.label}/ : ${counts[c.id]} file${counts[c.id] === 1 ? '' : 's'}`);
        const freed = results.filter((r) => r.category === 'dupes').reduce((s, r) => s + r.item.size, 0);
        if (freed) lines.push(`Dupes quarantined: ${formatSize(freed)} you can safely delete`);
        lines.push(backend.isDemo ? '(Demo folder: no real files touched)' : `Real folder updated: ${backend.name}`);
        return { lines, downloads: [], canUndo: journal.length > 0 && !backend.isDemo };
      },
    };
  },
};

class RealFolder {
  static async pick() {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'chore-quest' });
    return new RealFolder(dir);
  }

  constructor(dir) {
    this.dir = dir;
    this.name = dir.name;
    this.isDemo = false;
    this.handles = new Map();
  }

  async list() {
    const items = [];
    for await (const [name, handle] of this.dir.entries()) {
      if (handle.kind !== 'file' || name.startsWith('.') || name === 'desktop.ini') continue;
      const file = await handle.getFile();
      const id = `r${items.length}`;
      this.handles.set(id, handle);
      items.push({ id, name, size: file.size, lastModified: file.lastModified, file });
      if (items.length >= MAX_FILES) break;
    }
    await hashSameSizeFiles(items);
    return items;
  }

  async move(item, folderName) {
    const target = await this.dir.getDirectoryHandle(folderName, { create: true });
    const finalName = await freeName(target, item.name);
    const handle = this.handles.get(item.id);
    if (typeof handle.move === 'function') {
      await handle.move(target, finalName);
    } else {
      // Fallback for browsers without FileSystemHandle.move(): copy, then remove original.
      const dest = await target.getFileHandle(finalName, { create: true });
      const writable = await dest.createWritable();
      await writable.write(await handle.getFile());
      await writable.close();
      await this.dir.removeEntry(item.name);
      this.handles.set(item.id, dest);
    }
    return finalName;
  }

  async restore({ item, folder, finalName }) {
    const sub = await this.dir.getDirectoryHandle(folder);
    const handle = await sub.getFileHandle(finalName);
    const backName = await freeName(this.dir, item.name);
    if (typeof handle.move === 'function') await handle.move(this.dir, backName);
    else {
      const dest = await this.dir.getFileHandle(backName, { create: true });
      const w = await dest.createWritable();
      await w.write(await handle.getFile());
      await w.close();
      await sub.removeEntry(finalName);
    }
  }
}

class DemoFolder {
  name = 'Demo Downloads';
  isDemo = true;
  async list() { return DEMO_FILES.map((f) => ({ ...f })); }
  async move(item) { return item.name; }
  async restore() {}
}

/** Only hash files that share a size with another file: avoids reading every byte of a big folder. */
async function hashSameSizeFiles(items) {
  const bySize = countBy(items, (i) => i.size);
  for (const it of items) {
    if (bySize[it.size] > 1 && it.size <= HASH_LIMIT_BYTES && crypto?.subtle) {
      const buf = await it.file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      it.hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    delete it.file;
  }
}

async function freeName(dir, name) {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 0; ; n++) {
    const candidate = n === 0 ? name : `${stem} (${n})${ext}`;
    try { await dir.getFileHandle(candidate); } catch { return candidate; }
  }
}

function countBy(arr, fn) {
  return arr.reduce((acc, x) => ((acc[fn(x)] = (acc[fn(x)] ?? 0) + 1), acc), {});
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
