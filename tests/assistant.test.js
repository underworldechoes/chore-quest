import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSession, recommendChore, enemySpeed, canAutoSweep } from '../src/assistant/assistant.js';
import { Memory } from '../src/assistant/memory.js';

const chores = [{ id: 'files', title: 'Folder Dungeon' }, { id: 'expenses', title: 'Expense Swamp' }];
const fresh = () => ({ runs: 0, lastRun: null });

test('splits big backlogs into a wave that fits the time available', () => {
  const p = planSession({ itemCount: 5000, minutes: 5, hour: 14, pace: 30 });
  assert.equal(p.waveSize, 150);
  assert.match(p.message, /save 4850/);
});

test('late at night, sessions are capped short', () => {
  const p = planSession({ itemCount: 5000, minutes: 30, hour: 1, pace: 20 });
  assert.equal(p.waveSize, 100);
});

test('small backlog is done in one go', () => {
  assert.equal(planSession({ itemCount: 12, minutes: 15, hour: 12 }).waveSize, 12);
});

test('recommends quick expense review when short on time', () => {
  assert.equal(recommendChore(chores, { minutes: 5, hour: 12, history: fresh }).choreId, 'expenses');
  assert.equal(recommendChore(chores, { minutes: 30, hour: 12, history: fresh }).choreId, 'files');
});

test('recommends the chore neglected longest', () => {
  const now = Date.now();
  const history = (id) => ({ lastRun: id === 'files' ? now : now - 20 * 86_400_000 });
  assert.equal(recommendChore(chores, { minutes: 15, hour: 12, history, now }).choreId, 'expenses');
});

test('enemies slow down when Byte is unsure, speed up on combos', () => {
  const sure = enemySpeed({ combo: 0, agreeRate: 0.5, confidence: 0.9 });
  assert.ok(enemySpeed({ combo: 0, agreeRate: 0.5, confidence: 0.3 }) < sure);
  assert.ok(enemySpeed({ combo: 20, agreeRate: 0.5, confidence: 0.9 }) > sure);
  assert.equal(canAutoSweep({ confidence: 0.95 }), true);
  assert.equal(canAutoSweep({ confidence: 0.6 }), false);
});

test('memory persists, needs a clear majority, and tracks pace', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k), setItem: (k, v) => store.set(k, v) };
  const m = new Memory(storage);
  m.learn('k', 'a'); m.learn('k', 'b');
  assert.equal(m.lookup('k'), undefined);
  m.learn('k', 'a');
  assert.equal(new Memory(storage).lookup('k'), 'a');
  m.recordRun('files', { itemsDone: 60, minutes: 2 });
  assert.equal(new Memory(storage).history('files').pace, 30);
});
