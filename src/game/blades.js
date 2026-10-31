// Sword designs. Original pixel art: h hilt, g guard, b blade, e edge highlight, x glowing tip.
// Each blade is cosmetic and unlocks with your level, so real work shows up in your hand.

const STRAIGHT = [
  '..g.............',
  '..g..bbbbbbbbbb.',
  'hhgbbeeeeeeeeeeb',
  'hhgbbbbbbbbbbbbx',
  '..g..bbbbbbbbb..',
  '..g.............',
];
const CURVED = [
  '................',
  '..g.........bbb.',
  'hhgbbbbbbbbeeebx',
  'hhgbeeeeeeebbb..',
  '..gbbbbbbb......',
  '................',
];
const JAGGED = [
  '..g....b...b....',
  '..g.bbbbbbbbbbb.',
  'hhgbeeeeeeeeeeex',
  'hhgbbbbbbbbbbbb.',
  '..g.b...b...bb..',
  '..g.............',
];

export const BLADES = [
  { id: 'lantern', name: 'Lantern Edge', unlock: 1, shape: STRAIGHT, lore: 'Forged in Lanternfall. Plain, honest, sharp.', palette: { h: '#5b3a29', g: '#ffd36b', b: '#c9d4ff', e: '#ffffff', x: '#ffd36b' } },
  { id: 'tide', name: 'Tidecutter', unlock: 1, shape: CURVED, lore: 'A curved blade that sorts like water finds its level.', palette: { h: '#1d3557', g: '#5ce1e6', b: '#3a86c8', e: '#bdf3ff', x: '#5ce1e6' } },
  { id: 'ember', name: 'Emberfang', unlock: 2, shape: JAGGED, lore: 'Burns through backlogs. Still warm from the Forge.', palette: { h: '#3b1f1a', g: '#ff9f43', b: '#d9480f', e: '#ffd8a8', x: '#ffd36b' } },
  { id: 'jade', name: 'Jade Requiem', unlock: 3, shape: CURVED, lore: 'Quiet as a ledger that finally balances.', palette: { h: '#203a2c', g: '#a3e635', b: '#2f9e6b', e: '#c6f6d5', x: '#5fd38d' } },
  { id: 'void', name: 'Voidrend', unlock: 4, shape: JAGGED, lore: 'Cuts duplicates out of existence. Mostly into /Dupes.', palette: { h: '#1a1033', g: '#b388ff', b: '#4a2b8a', e: '#e0c3ff', x: '#ff6bff' } },
  { id: 'dawn', name: 'Dawnbreaker', unlock: 5, shape: STRAIGHT, lore: 'Only for those who have seen an empty inbox.', palette: { h: '#4a3b1a', g: '#fff3b0', b: '#ffe066', e: '#ffffff', x: '#ffffff' } },
];

export const DEFAULT_BLADE = 'lantern';
export const getBlade = (id) => BLADES.find((b) => b.id === id) ?? BLADES[0];
export const isUnlocked = (blade, level) => level >= blade.unlock;
