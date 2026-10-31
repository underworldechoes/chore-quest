// Frontier-style progression: chores done in the real world become XP and levels.

const TITLES = ['Wanderer', 'Tidy Squire', 'Clutter Hunter', 'Ledger Knight', 'Archive Warden', 'Frontier Sage'];

/** XP needed to go from `level` to `level + 1`. Grows linearly so early levels come fast. */
export const xpToNext = (level) => 60 + (level - 1) * 40;

export function levelFromXp(xp) {
  let level = 1;
  let rest = Math.max(0, xp);
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: rest, needed: xpToNext(level), title: TITLES[Math.min(level - 1, TITLES.length - 1)] };
}

/** Real work earns most XP; combos and teaching Byte add a bonus. */
export function xpForRun({ done, bestCombo, override }) {
  return done * 10 + bestCombo * 3 + override * 5;
}
