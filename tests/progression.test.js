import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelFromXp, xpForRun, xpToNext } from '../src/game/progression.js';
import { Memory } from '../src/assistant/memory.js';

test('levels up at the right thresholds', () => {
  assert.equal(levelFromXp(0).level, 1);
  assert.equal(levelFromXp(xpToNext(1) - 1).level, 1);
  assert.deepEqual(levelFromXp(xpToNext(1) + 5), { level: 2, into: 5, needed: xpToNext(2), title: 'Tidy Squire' });
  assert.equal(levelFromXp(1e6).title, 'Frontier Sage');
});

test('real work is worth more than combos', () => {
  assert.equal(xpForRun({ done: 10, bestCombo: 5, override: 2 }), 100 + 15 + 10);
});

test('xp persists in memory', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k), setItem: (k, v) => store.set(k, v) };
  new Memory(storage).addXp(42);
  assert.equal(new Memory(storage).xp, 42);
});
