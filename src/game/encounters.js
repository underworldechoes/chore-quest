// How enemies behave: randomized movement styles, boss HP and the wave's final boss.
// Pure functions (randomness is injected) so behaviour is unit tested.

export const MOTIONS = ['weave', 'zigzag', 'drift', 'dash'];
export const FINAL_BOSS_BONUS_HP = 1;
export const MAX_HP = 6;
const FINAL_BOSS_COLOR = '#ffd36b';
const ENRAGED_COLOR = '#ff2a4d';

/** Give a new enemy its own movement personality. */
export function newMotion(rand = Math.random, { boss = false } = {}) {
  return {
    kind: MOTIONS[Math.floor(rand() * MOTIONS.length)],
    lane: rand() * 1.6 - 0.8,
    base: rand() * 1.2 - 0.6,
    amp: (boss ? 0.15 : 0.3) + rand() * (boss ? 0.25 : 0.55),
    freq: 0.35 + rand() * 0.9,
    phase: rand() * Math.PI * 2,
    speedMul: (boss ? 0.65 : 0.8) + rand() * 0.45,
    target: rand() * 2 - 1,
    retarget: 0.4 + rand(),
  };
}

const clampLane = (v) => Math.max(-1, Math.min(1, v));
const triangle = (t) => 2 * Math.abs(2 * (t - Math.floor(t + 0.5))) - 1;

/**
 * Advance one enemy's sideways movement.
 * @returns {number} forward-speed multiplier for this frame (dashers pause, then lunge)
 */
export function stepMotion(m, time, dt, rand = Math.random) {
  switch (m.kind) {
    case 'weave':
      m.lane = clampLane(m.base + m.amp * Math.sin(time * m.freq * Math.PI * 2 + m.phase));
      return m.speedMul;
    case 'zigzag':
      m.lane = clampLane(m.base + m.amp * triangle(time * m.freq + m.phase));
      return m.speedMul;
    case 'drift':
      m.retarget -= dt;
      if (m.retarget <= 0) { m.target = rand() * 2 - 1; m.retarget = 0.5 + rand() * 1.2; }
      m.lane = clampLane(m.lane + (m.target - m.lane) * Math.min(1, dt * 2));
      return m.speedMul;
    case 'dash': {
      m.lane = clampLane(m.base + m.amp * 0.5 * Math.sin(time * m.freq * Math.PI * 2 + m.phase));
      const cycle = (time * 0.6 + m.phase) % 1;
      return m.speedMul * (cycle < 0.35 ? 0.15 : cycle < 0.55 ? 2.6 : 1);
    }
    default:
      return m.speedMul;
  }
}

/**
 * Plan a wave: the heaviest item (if it's a real boss) is saved for last as the final boss.
 * @returns {{items: any[], hp: Map<any, number>, finalItem: any|null}}
 */
export function planWave(items, bossHpOf) {
  const hp = new Map(items.map((it) => [it, Math.max(1, bossHpOf(it))]));
  const heaviest = items.reduce((best, it) => (best === null || hp.get(it) > hp.get(best) ? it : best), null);
  if (!heaviest || hp.get(heaviest) < 2) return { items, hp, finalItem: null };
  hp.set(heaviest, Math.min(MAX_HP, hp.get(heaviest) + FINAL_BOSS_BONUS_HP));
  return { items: [...items.filter((it) => it !== heaviest), heaviest], hp, finalItem: heaviest };
}

/** Bosses glow hotter as they lose health: base colour at full HP, crimson on the last hit. */
export function bossColor(baseColor, hp, maxHp, final = false) {
  const from = final ? FINAL_BOSS_COLOR : baseColor;
  if (maxHp <= 1) return from;
  const t = 1 - (hp - 1) / (maxHp - 1);
  return mix(from, ENRAGED_COLOR, t);
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
