// Weapons are batch tools in disguise: each one decides which *other* real items a single shot also handles.
// Pure functions only, so the shop and the battle share the same rules and they're unit tested.

export const WEAPONS = [
  {
    id: 'blaster',
    key: 'z',
    name: 'Pulse Blaster',
    color: '#5ce1e6',
    price: 0,
    blurb: 'One shot, one item. Precise. Upgrades raise the coin bounty.',
    levels: [{ bonus: 0 }, { bonus: 0.5 }, { bonus: 1 }],
    upgradeCost: [20, 45],
  },
  {
    id: 'scatter',
    key: 'x',
    name: 'Chain Scatter',
    color: '#ffd36b',
    price: 30,
    blurb: 'Your shot chains to other items Byte is sure belong in the same bin.',
    levels: [{ chain: 2, confidence: 0.88 }, { chain: 3, confidence: 0.85 }, { chain: 5, confidence: 0.8 }],
    upgradeCost: [35, 70],
  },
  {
    id: 'rail',
    key: 'c',
    name: 'Rail Lance',
    color: '#ff6b9a',
    price: 60,
    blurb: 'Pierces every item of the same kind (file type / merchant) and files them all with your choice.',
    levels: [{ pierce: 3, cooldown: 6 }, { pierce: 5, cooldown: 4 }, { pierce: 8, cooldown: 2.5 }],
    upgradeCost: [45, 90],
  },
];

export const MAX_LEVEL = 3;

export const getWeapon = (id) => WEAPONS.find((w) => w.id === id);

export function weaponStats(id, level) {
  return getWeapon(id).levels[Math.min(level, MAX_LEVEL) - 1];
}

export function describeWeapon(id, level) {
  const s = weaponStats(id, level);
  if (id === 'blaster') return `+${Math.round(s.bonus * 100)}% coins per item`;
  if (id === 'scatter') return `chains to ${s.chain} items at ${Math.round(s.confidence * 100)}%+ confidence`;
  return `pierces ${s.pierce} same-kind items, ${s.cooldown}s cooldown`;
}

export const newArsenal = () => ({ coins: 0, owned: { blaster: 1 }, equipped: 'blaster' });

/** Cost of the next purchase for this weapon: buying it, upgrading it, or null when maxed. */
export function nextCost(arsenal, id) {
  const weapon = getWeapon(id);
  const level = arsenal.owned[id];
  if (!level) return weapon.price;
  return level >= MAX_LEVEL ? null : weapon.upgradeCost[level - 1];
}

/** Buy or upgrade. Returns a new arsenal; throws if unaffordable or maxed. */
export function purchase(arsenal, id) {
  const cost = nextCost(arsenal, id);
  if (cost === null) throw new Error('Already at max level.');
  if (arsenal.coins < cost) throw new Error(`Need ${cost - arsenal.coins} more coins.`);
  const level = (arsenal.owned[id] ?? 0) + 1;
  return {
    ...arsenal,
    coins: arsenal.coins - cost,
    owned: { ...arsenal.owned, [id]: level },
    equipped: level === 1 ? id : arsenal.equipped,
  };
}

/**
 * Which extra enemies a shot also hits.
 * @param {{weaponId, level, target, categoryId, enemies, keyOf:(item)=>string|null}} shot
 * @returns {Array<{enemy, categoryId}>}
 */
export function extraTargets({ weaponId, level, target, categoryId, enemies, keyOf }) {
  const others = enemies.filter((e) => e !== target && e.state === 'walk');
  if (weaponId === 'scatter') {
    const { chain, confidence } = weaponStats('scatter', level);
    return others
      .filter((e) => e.suggestion.category === categoryId && e.suggestion.confidence >= confidence)
      .slice(0, chain)
      .map((enemy) => ({ enemy, categoryId }));
  }
  if (weaponId === 'rail') {
    const key = keyOf(target.item);
    if (!key) return [];
    const { pierce } = weaponStats('rail', level);
    return others
      .filter((e) => keyOf(e.item) === key)
      .slice(0, pierce)
      .map((enemy) => ({ enemy, categoryId }));
  }
  return [];
}

/** Coins for one real item handled. Combos and the blaster's upgrades raise the bounty. */
export function coinsFor({ weaponId, level, combo }) {
  const bonus = weaponId === 'blaster' ? weaponStats('blaster', level).bonus : 0;
  return Math.round((1 + Math.floor(combo / 10)) * (1 + bonus));
}
