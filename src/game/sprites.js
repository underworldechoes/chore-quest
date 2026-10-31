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
    '.ccdccccdcnnnn',
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
export const SHIP_PALETTE = { w: '#c9d4ff', h: '#5b6aa8', b: '#2a3354', c: '#5ce1e6', g: '#ffd36b', t: '#3a4270' };
export const BYTE_PALETTE ={ c: '#26c6da', w: '#e0f7fa', k: '#006064' };

export function enemyPalette(body) {
  return { g: body, d: shade(body, -0.35), w: '#ffffff', k: '#1b1b1b', p: '#8d6e63', y: '#ffca28' };
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
