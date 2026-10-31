// Persistent learned preferences + play history. Storage is injected so it's testable in Node.
import { newArsenal } from '../game/arsenal.js';

const KEY = 'chore-quest:v1';

export class Memory {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = { prefs: {}, history: {}, xp: 0, arsenal: newArsenal() };
    try {
      const raw = storage?.getItem(KEY);
      if (raw) this.data = { ...this.data, ...JSON.parse(raw) };
    } catch { /* corrupt or unavailable storage: start fresh */ }
  }

  /** Record that the user put something with `key` into `category`. */
  learn(key, category) {
    if (!key) return;
    const votes = (this.data.prefs[key] ??= {});
    votes[category] = (votes[category] ?? 0) + 1;
    this.save();
  }

  /** The user's dominant category for `key`, once they've shown a clear preference. */
  lookup(key) {
    const votes = this.data.prefs[key];
    if (!votes) return undefined;
    const [best, count] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    const total = Object.values(votes).reduce((a, b) => a + b, 0);
    return count / total >= 0.6 ? best : undefined;
  }

  /** Scope lookups to one chore so "ext:pdf" and "merchant:pdf" never collide. */
  scoped(choreId) {
    return {
      learn: (key, cat) => key && this.learn(`${choreId}|${key}`, cat),
      lookup: (key) => this.lookup(`${choreId}|${key}`),
    };
  }

  history(choreId) {
    return this.data.history[choreId] ?? { runs: 0, itemsDone: 0, pace: null, lastRun: null };
  }

  recordRun(choreId, { itemsDone, minutes, agreeRate = null, repeatRatio = null }) {
    const h = this.history(choreId);
    // A run abandoned before doing anything says nothing about the player's pace.
    const pace = minutes > 0 && itemsDone > 0 ? itemsDone / minutes : h.pace;
    this.data.history[choreId] = {
      runs: h.runs + 1,
      itemsDone: h.itemsDone + itemsDone,
      // Exponential moving average keeps the pace estimate responsive but stable.
      pace: h.pace && pace ? h.pace * 0.6 + pace * 0.4 : pace,
      lastRun: Date.now(),
      agreeRate,
      repeatRatio,
    };
    this.save();
  }

  get xp() {
    return this.data.xp;
  }

  addXp(amount) {
    this.data.xp += Math.max(0, Math.round(amount));
    this.save();
  }

  get arsenal() {
    return this.data.arsenal;
  }

  set arsenal(value) {
    this.data.arsenal = value;
    this.save();
  }

  /** The most recent run across all chores: what Byte bases its gear advice on. */
  lastRun() {
    return Object.values(this.data.history).sort((a, b) => (b.lastRun ?? 0) - (a.lastRun ?? 0))[0] ?? null;
  }

  save() {
    try { this.storage?.setItem(KEY, JSON.stringify(this.data)); } catch { /* quota/private mode */ }
  }
}
