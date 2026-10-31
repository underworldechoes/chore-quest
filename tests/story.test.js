import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, storyLog, newlyCompleted, activeChapter } from '../src/game/story.js';
import { BLADES, getBlade, isUnlocked, DEFAULT_BLADE } from '../src/game/blades.js';

const progress = (over = {}) => ({ filesDone: 0, expensesDone: 0, bossesSlain: 0, gunsOwned: 1, finalBossesSlain: 0, level: 1, ...over });

test('chapters complete in order from real progress', () => {
  const p = progress({ filesDone: 12, expensesDone: 15 });
  assert.deepEqual(newlyCompleted(p, []).map((c) => c.id), ['stirring', 'ledger']);
  assert.deepEqual(newlyCompleted(p, ['stirring', 'ledger']), []);
});

test('a later chapter cannot be completed before an earlier one', () => {
  const p = progress({ expensesDone: 50, bossesSlain: 3 });
  assert.deepEqual(newlyCompleted(p, []), []);
});

test('story log marks done / active / locked', () => {
  const log = storyLog(progress(), ['stirring']);
  assert.deepEqual(log.map((c) => c.status), ['done', 'active', 'locked', 'locked', 'locked']);
  assert.equal(activeChapter(progress(), CHAPTERS.map((c) => c.id)), null);
});

test('blades unlock by level and unknown ids fall back safely', () => {
  assert.ok(BLADES.length >= 6);
  assert.equal(getBlade('nope').id, DEFAULT_BLADE);
  assert.equal(isUnlocked(getBlade('dawn'), 4), false);
  assert.equal(isUnlocked(getBlade('dawn'), 5), true);
  for (const b of BLADES) for (const row of b.shape) for (const ch of row) assert.ok(ch === '.' || ch in b.palette, `${b.id} uses unknown colour ${ch}`);
});
