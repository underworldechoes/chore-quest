import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newArsenal, purchase, nextCost, extraTargets, coinsFor } from '../src/game/arsenal.js';
import { recommendWeapon, repeatRatio } from '../src/assistant/assistant.js';

const enemy = (key, category, confidence = 0.99) => ({ item: { key }, suggestion: { category, confidence }, state: 'walk' });
const keyOf = (item) => item.key;

test('buy then upgrade, with coin checks and max level', () => {
  let a = { ...newArsenal(), coins: 200 };
  assert.equal(nextCost(a, 'scatter'), 30);
  a = purchase(a, 'scatter');
  assert.equal(a.owned.scatter, 1);
  assert.equal(a.equipped, 'scatter');
  a = purchase(purchase(a, 'scatter'), 'scatter');
  assert.equal(a.owned.scatter, 3);
  assert.equal(nextCost(a, 'scatter'), null);
  assert.throws(() => purchase(a, 'scatter'), /max level/);
  assert.throws(() => purchase({ ...newArsenal(), coins: 5 }, 'rail'), /55 more/);
});

test('scatter chains only to confident same-bin items, up to its chain limit', () => {
  const target = enemy('a', 'images');
  const enemies = [target, enemy('b', 'images'), enemy('c', 'images', 0.5), enemy('d', 'docs'), enemy('e', 'images'), enemy('f', 'images')];
  const hits = extraTargets({ weaponId: 'scatter', level: 1, target, categoryId: 'images', enemies, keyOf });
  assert.deepEqual(hits.map((h) => h.enemy.item.key), ['b', 'e']);
});

test('rail pierces same-kind items and applies the player choice', () => {
  const target = enemy('jpg', 'images');
  const enemies = [target, enemy('jpg', 'docs', 0.3), enemy('pdf', 'docs'), enemy('jpg', 'images')];
  const hits = extraTargets({ weaponId: 'rail', level: 1, target, categoryId: 'misc', enemies, keyOf });
  assert.equal(hits.length, 2);
  assert.ok(hits.every((h) => h.categoryId === 'misc'));
});

test('blaster has no extra targets but upgrades boost coins', () => {
  assert.deepEqual(extraTargets({ weaponId: 'blaster', level: 3, target: enemy('a', 'x'), categoryId: 'x', enemies: [], keyOf }), []);
  assert.equal(coinsFor({ weaponId: 'blaster', level: 1, combo: 0 }), 1);
  assert.equal(coinsFor({ weaponId: 'blaster', level: 3, combo: 12 }), 4);
});

test('Byte recommends gear from play style', () => {
  assert.equal(recommendWeapon(null).weaponId, 'blaster');
  assert.equal(recommendWeapon({ repeatRatio: 0.5, agreeRate: 0.9 }).weaponId, 'rail');
  assert.equal(recommendWeapon({ repeatRatio: 0.1, agreeRate: 0.9 }).weaponId, 'scatter');
  assert.equal(recommendWeapon({ repeatRatio: 0.1, agreeRate: 0.4 }).weaponId, 'blaster');
  const items = ['a', 'a', 'a', 'b', 'c'].map((key) => ({ key }));
  assert.equal(repeatRatio(items, keyOf), 0.6);
});
