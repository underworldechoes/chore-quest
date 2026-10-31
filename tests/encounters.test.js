import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newMotion, stepMotion, planWave, bossColor, MOTIONS } from '../src/game/encounters.js';
import { fileBossHp } from '../src/chores/files/classifier.js';
import { expenseBossHp } from '../src/chores/expenses/analyzer.js';

const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('every motion style keeps enemies inside the corridor', () => {
  for (let k = 0; k < MOTIONS.length; k++) {
    const m = { ...newMotion(seq(0.5, 0.9, 0.1, 0.7)), kind: MOTIONS[k], amp: 3 };
    for (let t = 0; t < 10; t += 0.05) {
      const speed = stepMotion(m, t, 0.05, seq(0.99, 0.01));
      assert.ok(m.lane >= -1 && m.lane <= 1, `${m.kind} left the corridor`);
      assert.ok(speed > 0);
    }
  }
});

test('enemies get different personalities', () => {
  const kinds = new Set(Array.from({ length: 40 }, () => newMotion().kind));
  assert.ok(kinds.size >= 3);
});

test('boss HP scales with file size and spend', () => {
  assert.equal(fileBossHp(2 * 1024 ** 2), 1);
  assert.equal(fileBossHp(60 * 1024 ** 2), 3);
  assert.equal(fileBossHp(3 * 1024 ** 3), 5);
  assert.equal(expenseBossHp(450), 1);
  assert.equal(expenseBossHp(18000), 4);
});

test('the heaviest item becomes the final boss, saved for last with bonus HP', () => {
  const items = [{ s: 1 }, { s: 4 }, { s: 2 }];
  const wave = planWave(items, (it) => it.s);
  assert.equal(wave.finalItem, items[1]);
  assert.equal(wave.items.at(-1), items[1]);
  assert.equal(wave.hp.get(items[1]), 5);
  assert.equal(planWave([{ s: 1 }], (it) => it.s).finalItem, null);
});

test('bosses shift to crimson as they lose health', () => {
  assert.equal(bossColor('#4fc3f7', 4, 4), '#4fc3f7');
  assert.equal(bossColor('#4fc3f7', 1, 4), '#ff2a4d');
  assert.equal(bossColor('#4fc3f7', 1, 1), '#4fc3f7');
});
