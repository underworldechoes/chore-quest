import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestFileCategory, findDuplicates, baseNameOf, extensionOf } from '../src/chores/files/classifier.js';
import { Memory } from '../src/assistant/memory.js';

const noMemory = { lookup: () => undefined };

test('classifies by extension', () => {
  assert.equal(suggestFileCategory({ name: 'cat.PNG' }, noMemory).category, 'images');
  assert.equal(suggestFileCategory({ name: 'song.mp3' }, noMemory).category, 'media');
  assert.equal(suggestFileCategory({ name: 'setup.exe' }, noMemory).category, 'archives');
});

test('filename hints beat extension but with lower confidence', () => {
  const s = suggestFileCategory({ name: 'receipt_scan.png' }, noMemory);
  assert.equal(s.category, 'docs');
  assert.ok(s.confidence < 0.9);
});

test('unknown files fall back to misc with low confidence', () => {
  const s = suggestFileCategory({ name: 'data.parquet' }, noMemory);
  assert.equal(s.category, 'misc');
  assert.ok(s.confidence < 0.5);
});

test('learned preference overrides rules', () => {
  const memory = new Memory(null).scoped('files');
  memory.learn('ext:parquet', 'docs');
  const s = suggestFileCategory({ name: 'data.parquet' }, memory);
  assert.equal(s.category, 'docs');
  assert.match(s.reason, /you usually/);
});

test('duplicates: keeps oldest, flags copies by hash or name+size', () => {
  const items = [
    { id: 'a', name: 'report.pdf', size: 100, lastModified: 1 },
    { id: 'b', name: 'report (1).pdf', size: 100, lastModified: 2 },
    { id: 'c', name: 'x.jpg', size: 5, hash: 'h1', lastModified: 3 },
    { id: 'd', name: 'totally-different.jpg', size: 5, hash: 'h1', lastModified: 4 },
    { id: 'e', name: 'report.pdf', size: 999, lastModified: 5 },
  ];
  assert.deepEqual([...findDuplicates(items)].sort(), ['b', 'd']);
});

test('name helpers', () => {
  assert.equal(extensionOf('archive.tar.gz'), 'gz');
  assert.equal(extensionOf('.bashrc'), '');
  assert.equal(baseNameOf('thesis_draft - Copy.pdf'), 'thesis_draft');
});
