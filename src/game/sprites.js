// Tiny procedural pixel art: each sprite is rows of palette characters ('.' = transparent).

export const SPRITES = {
  // A masked wanderer: pale mask, lantern antenna, dark cloak.
  hero: [
    '.....ll.....',
    '.....n......',
    '...mmmmmm...',
    '..mmmmmmmm..',
    '..meemmeem..',
    '..meemmeem..',
    '..mmmmmmmm..',
    '...mmmmmm...',
    '..cccccccc..',
    '.cccccccccc.',
    '.ccdccccdcc.',
    '.cccccccccc.',
    '..cdcccdcc..',
    '..d......d..',
  ],
  heroWalk: [
    '.....ll.....',
    '.....n......',
    '...mmmmmm...',
    '..mmmmmmmm..',
    '..meemmeem..',
    '..meemmeem..',
    '..mmmmmmmm..',
    '...mmmmmm...',
    '..cccccccc..',
    '.cccccccccc.',
    '.ccdccccdcc.',
    '.cccccccccc.',
    '..cdcccdcc..',
    '...d....d...',
  ],
  heroCast: [
    '.....ll.....',
    '.....n......',
    '...mmmmmm...',
    '..mmmmmmmm..',
    '..meemmeem..',
    '..meemmeem..',
    '..mmmmmmmm..',
    '...mmmmmm...',
    '..cccccccc..',
    '.cccccccccc.',
    '.ccdccccdcc.',
    '.cccccccccc.',
    '..cdcccdcc..',
    '..d......d..',
  ],
  // Side view, nose pointing right.
  ship: [
    '.......ww...............',
    '......wwwwhh............',
    '..ttwwwwwwwwwwhh........',
    '.ttggwwwwwwwwwwwwhh.....',
    'tttggwwbbbbwwwwwwwwwhh..',
    'tttggwwbccbwwwwwwwwwwwhh',
    'tttggwwbbbbwwwwwwwwwhh..',
    '.ttggwwwwwwwwwwwwhh.....',
    '..ttwwwwwwwwwwhh........',
    '......wwwwhh............',
    '.......ww...............',
  ],
  // Bosses: bigger, more detailed originals. g/d take the boss colour so it can shift as HP drops.
  bossFiles: [ // Hoard Golem
    '.....dddddddd.....',
    '...ddggggggggdd...',
    '..dggggggggggggd..',
    '..dggkkggggkkggd..',
    '..dggkaggggkaggd..',
    '..dggggggggggggd..',
    '...dggwwwwwwggd...',
    'dd..dggggggggd..dd',
    'dgdddggggggggdddgd',
    'dggggggggggggggggd',
    'dgg.dggggggggd.ggd',
    'dgg.dggddddggd.ggd',
    'ddd.dggd..dggd.ddd',
    '....dggd..dggd....',
    '...ddggd..dggdd...',
    '...dddd....dddd...',
  ],
  bossExpenses: [ // Ledger Wraith
    '.......dddd.......',
    '.....ddggggdd.....',
    '....dggggggggd....',
    '...dggkkkkkkggd...',
    '...dgkkrkkrkkgd...',
    '...dgkkkkkkkkgd...',
    '....dgkkkkkkgd....',
    '..ddggggggggggdd..',
    '.dgggggaaagggggd..',
    'dggg.ggaaagg.gggd.',
    'dgg..ggggggg..ggd.',
    '.dd..dggggggd..dd.',
    '.....dggggggd.....',
    '....dgggggggd.....',
    '...dggg.dggggd....',
    '..dgg...dd.dggd...',
  ],
  bossInbox: [ // Frost Wraith of the Summit
    '..a.....a....a....',
    '..aa...aaa..aa....',
    '..dggggggggggggd..',
    '..dwwwwwwwwwwwwd..',
    '..dgwwwwwwwwwwgd..',
    '..dggwwwwwwwwggd..',
    '..dgkkgwwwwgkkgd..',
    '..dgkrggwwggkrgd..',
    '..dggggggggggggd..',
    '...dggggggggggd...',
    '..dggdggggggdggd..',
    '.dgd.dggggggd.dgd.',
    '.dd..dgg..ggd..dd.',
    '.....dg....gd.....',
    '......d....d......',
  ],
  envelope: [ // Mail Wraith
    '.gggggggg.',
    'gdggggggdg',
    'ggdggggdgg',
    'gggdggdggg',
    'ggkggggkgg',
    'gggggggggg',
    'gggggggggg',
    '.d.d..d.d.',
  ],
  smithUp: [ // hammer raised
    '.........mm.',
    '.........mm.',
    '..hhhh...w..',
    '.hsssh..w...',
    '.hsksk.w....',
    '..sssssw....',
    '..hhhhss....',
    '.ttaattts...',
    'tttaaatt....',
    't.taaat.....',
    's.taaat.....',
    '..pp.pp.....',
    '..pp.pp.....',
    '..bb.bb.....',
  ],
  smithDown: [ // hammer striking the anvil
    '............',
    '............',
    '..hhhh......',
    '.hsssh......',
    '.hsksk......',
    '..sssss.....',
    '..hhhh......',
    '.ttaatttsswww',
    'tttaaatt...mm',
    't.taaat....mm',
    's.taaat......',
    '..pp.pp......',
    '..pp.pp......',
    '..bb.bb......',
  ],
  hermit: [
    '....hhh....',
    '...hhhhh..a',
    '..hhsssh..l',
    '..hsksksh.l',
    '..hswwwsh.l',
    '...wwwww..l',
    '..rrwwwrr.l',
    '.rrrrwrrrrl',
    '.rrrrrrrrrl',
    '.rrrrrrrr.l',
    '..rrrrrrr.l',
    '..rr...rr.l',
    '..bb...bb.l',
  ],
  slime: [
    '...gggg...',
    '..gggggg..',
    '.ggwggwgg.',
    '.ggkggkgg.',
    'gggggggggg',
    'gggggggggg',
    'gddggggddg',
    '.dddddddd.',
  ],
  goblin: [
    '..gggggg..',
    'ggggggggg.',
    '.gwkggwkg.',
    '.gggggggg.',
    '..gkkkkg..',
    '.pppyyppp.',
    'gppppppppg',
    '..pppppp..',
    '..dd..dd..',
  ],
  byte: [
    '.cccc.',
    'cwwwwc',
    'cwkkwc',
    'cwkkwc',
    'cwwwwc',
    '.cccc.',
  ],
};

export const HERO_PALETTE = { l: '#ffd36b', n: '#c9d4ff', m: '#e8e6f0', e: '#0a0a14', c: '#2a3354', d: '#161b30' };
export const HERMIT_PALETTE = { h: '#4a4a5e', s: '#e0b896', k: '#1b1b1b', w: '#f0f0f0', r: '#5a4632', b: '#2a1f18', l: '#8b6b3e', a: '#ffd36b' };
export const SMITH_PALETTE = { s: '#d9a57a', h: '#3b2a20', k: '#1b1b1b', a: '#6b4a2e', t: '#8a3b2b', p: '#2e2a3a', b: '#1b1612', m: '#aab3c5', w: '#7a5530' };
export const SHIP_PALETTE = { w: '#c9d4ff', h: '#5b6aa8', b: '#2a3354', c: '#5ce1e6', g: '#ffd36b', t: '#3a4270' };
export const BYTE_PALETTE ={ c: '#26c6da', w: '#e0f7fa', k: '#006064' };

export function enemyPalette(body) {
  return { g: body, d: shade(body, -0.35), w: '#ffffff', k: '#1b1b1b', p: '#8d6e63', y: '#ffca28', a: '#ffd36b', r: '#ff2a4d' };
}

export function drawSprite(ctx, rows, palette, x, y, scale = 1, flip = false) {
  const width = Math.max(...rows.map((r) => r.length));
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const color = palette[row[c]];
      if (!color) continue;
      const col = flip ? width - 1 - c : c;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x + col * scale), Math.round(y + r * scale), scale, scale);
    }
  }
}

export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (amount < 0 ? v * amount : (255 - v) * amount))));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
