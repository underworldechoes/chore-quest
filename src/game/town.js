// Lanternfall: the walkable hub town. Each quest gate leads to a chore.
import { SPRITES, HERO_PALETTE, BYTE_PALETTE, HERMIT_PALETTE, drawSprite } from './sprites.js';
import { panel, text, fit, FONT } from './draw.js';
import { W, H } from './game.js';
import { getBlade } from './blades.js';

const WORLD_W = 1260;
const GROUND = 214;
const SCALE = 2;
const WALK_SPEED = 95;
const NEAR = 28;
const BOARD_X = 510;
const ARMORY_X = 870;
const LAMPS = [70, 215, 430, 610, 790, 960, 1210];
const HERMIT_X = 1030;
const HERMIT_LINES = [
  'HERMIT: Ten thousand unread letters sleep on that mountain, child.',
  'HERMIT: Sort the senders, not the letters. One rule tames a thousand.',
  'HERMIT: The Frost Wraith at the summit is whoever emails you the most.',
  'HERMIT: I never delete. I only file. Byte will write the rules for you.',
];
const GATE_X = [330, 700, 1120];
export const GATE_STYLE = {
  files: { color: '#9b7bff', name: 'The Hoard Well' },
  expenses: { color: '#5fd38d', name: 'Mire Gate' },
  inbox: { color: '#b39ddb', name: 'The Peak' },
};
// Mid-layer houses: [x, width, height, colour].
const HOUSES = [
  [20, 60, 46, '#1b2240'], [120, 48, 62, '#202a4d'], [250, 70, 40, '#1b2240'], [395, 52, 70, '#232d55'],
  [560, 64, 50, '#1e2648'], [650, 40, 74, '#232d55'], [760, 70, 44, '#1b2240'], [870, 56, 60, '#202a4d'],
];

export class Town {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{chores, recommendedId, progress, startX?, showTitle?, onEnter:(choreId:string, x:number)=>void, onArmory:(x:number)=>void, onBoard:(x:number)=>void, blade?:string, quest?:string}} opts
   */
  constructor(canvas, { chores, recommendedId, progress, startX = 90, showTitle = true, onEnter, onArmory, onBoard, blade, quest }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gates = chores.map((chore, i) => ({ chore, x: GATE_X[i] ?? 300 + i * 200, ...GATE_STYLE[chore.id] }));
    this.recommendedId = recommendedId;
    this.progress = progress;
    this.onEnter = onEnter;
    this.onArmory = onArmory;
    this.onBoard = onBoard;
    this.blade = getBlade(blade);
    this.quest = quest;

    this.x = startX;
    this.facing = 1;
    this.moving = false;
    this.keys = { left: false, right: false };
    this.targetX = null;
    this.autoEnter = null;
    this.byte = { x: startX - 20, y: GROUND - 50 };
    this.time = 0;
    this.titleTimer = showTitle ? 3.5 : 0;
    this.rain = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 140 + Math.random() * 80 }));
    this.motes = Array.from({ length: 24 }, (_, i) => ({ x: (i * 41) % WORLD_W, y: GROUND - Math.random() * 120, p: Math.random() * 6 }));

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onPointer = this.onPointer.bind(this);
    this.frame = this.frame.bind(this);
  }

  start() {
    this.running = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('pointerdown', this.onPointer);
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('pointerdown', this.onPointer);
  }

  get camera() {
    return Math.max(0, Math.min(WORLD_W - W, this.x - W / 2));
  }

  get nearGate() {
    return this.gates.find((g) => Math.abs(g.x - this.x) < NEAR);
  }

  get nearArmory() {
    return Math.abs(ARMORY_X - this.x) < NEAR;
  }

  // ---------- input ----------

  onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') { this.keys.left = true; this.targetX = null; }
    else if (k === 'arrowright' || k === 'd') { this.keys.right = true; this.targetX = null; }
    else if (!e.repeat && ['arrowup', 'w', 'e', 'enter', ' '].includes(k)) { e.preventDefault(); this.interact(); }
  }

  onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') this.keys.left = false;
    if (k === 'arrowright' || k === 'd') this.keys.right = false;
  }

  onPointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    const worldX = ((e.clientX - rect.left) / rect.width) * W + this.camera;
    const gate = this.gates.find((g) => Math.abs(g.x - worldX) < 34);
    const armory = Math.abs(ARMORY_X - worldX) < 34 ? { armory: true, x: ARMORY_X } : null;
    const dest = gate ?? armory;
    this.targetX = dest ? dest.x : worldX;
    this.autoEnter = dest;
  }

  interact() {
    const gate = this.nearGate;
    if (gate) this.enter(gate);
    else if (this.nearArmory) this.enter({ armory: true });
    else if (Math.abs(this.x - BOARD_X) < NEAR) { this.stop(); this.onBoard(this.x); }
  }

  enter(dest) {
    this.stop();
    if (dest.armory) this.onArmory(this.x);
    else this.onEnter(dest.chore.id, this.x);
  }

  // ---------- simulation ----------

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.update(dt);
    if (this.running) this.draw();
    requestAnimationFrame(this.frame);
  }

  update(dt) {
    let dir = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    if (!dir && this.targetX !== null) {
      const dx = this.targetX - this.x;
      if (Math.abs(dx) < 3) {
        this.targetX = null;
        if (this.autoEnter) return this.enter(this.autoEnter);
      } else dir = Math.sign(dx);
    }
    this.moving = dir !== 0;
    if (dir) this.facing = dir;
    this.x = Math.max(16, Math.min(WORLD_W - 16, this.x + dir * WALK_SPEED * dt));

    // Byte drifts after the player, or hovers over the gate it recommends when you're idle.
    const rec = this.gates.find((g) => g.chore.id === this.recommendedId);
    const idle = !this.moving && !this.nearGate && rec;
    const tx = idle ? rec.x - 4 : this.x - this.facing * 22;
    const ty = idle ? GROUND - 104 : GROUND - 52;
    this.byte.x += (tx - this.byte.x) * Math.min(1, dt * (idle ? 1.2 : 4));
    this.byte.y += (ty - this.byte.y) * Math.min(1, dt * 3);

    for (const r of this.rain) {
      r.y += r.s * dt; r.x -= r.s * 0.25 * dt;
      if (r.y > H) { r.y = -6; r.x = Math.random() * (W + 60); }
    }
    for (const m of this.motes) {
      m.y -= 8 * dt; m.p += dt;
      if (m.y < GROUND - 140) m.y = GROUND;
    }
    this.titleTimer = Math.max(0, this.titleTimer - dt);
  }

  // ---------- rendering ----------

  draw() {
    const { ctx } = this;
    const cam = this.camera;
    ctx.font = FONT;
    ctx.textBaseline = 'top';

    this.drawSky(ctx, cam);
    ctx.save();
    ctx.translate(-Math.round(cam * 0.5), 0);
    HOUSES.forEach(([x, w, h, c], i) => house(ctx, x * 1.2, w, h, c, this.time, i));
    ctx.restore();

    ctx.save();
    ctx.translate(-Math.round(cam), 0);
    this.drawGround(ctx);
    LAMPS.forEach((x) => lamp(ctx, x, this.time));
    this.drawMountain(ctx);
    this.drawBoard(ctx);
    this.drawArmory(ctx);
    this.gates.forEach((g) => this.drawGate(ctx, g));
    this.drawMotes(ctx);
    drawSprite(ctx, SPRITES.hermit, HERMIT_PALETTE, HERMIT_X - 11, GROUND - SPRITES.hermit.length * SCALE + Math.round(Math.sin(this.time * 1.5)), SCALE, this.x > HERMIT_X);
    glow(ctx, HERMIT_X + 9, GROUND - 22, 18, '#ffd36b', 0.18);

    const sprite = this.moving && Math.floor(this.time * 8) % 2 ? SPRITES.heroWalk : SPRITES.hero;
    const bob = this.moving ? 0 : Math.round(Math.sin(this.time * 2));
    drawSprite(ctx, sprite, HERO_PALETTE, this.x - 12, GROUND - sprite.length * SCALE + bob, SCALE, this.facing < 0);
    const bladeX = this.facing < 0 ? this.x - 12 - 14 : this.x + 6;
    drawSprite(ctx, this.blade.shape, this.blade.palette, bladeX, GROUND - 9 * SCALE + bob, 1, this.facing < 0);
    glow(ctx, this.x + this.facing * -1, GROUND - 26, 22, '#ffd36b', 0.12);
    drawSprite(ctx, SPRITES.byte, BYTE_PALETTE, this.byte.x, this.byte.y + Math.sin(this.time * 3) * 3, SCALE);
    ctx.restore();

    this.drawRain(ctx);
    this.drawHud(ctx);
  }

  drawSky(ctx, cam) {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#05060f');
    sky.addColorStop(0.6, '#121a38');
    sky.addColorStop(1, '#25305e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Moon + distant spires on the slowest parallax layer.
    const mx = 360 - cam * 0.05;
    glow(ctx, mx, 70, 70, '#c9d4ff', 0.18);
    ctx.fillStyle = '#d9defa';
    circle(ctx, mx, 70, 22);
    ctx.fillStyle = '#0c1026';
    for (let i = 0; i < 16; i++) {
      const x = i * 70 - (cam * 0.15) % 70 - 40;
      const h = 60 + ((i * 37) % 50);
      ctx.fillRect(x, GROUND - h, 18, h);
      ctx.fillRect(x + 6, GROUND - h - 18, 6, 18);
      ctx.fillRect(x + 8, GROUND - h - 26, 2, 8);
    }
  }

  drawGround(ctx) {
    ctx.fillStyle = '#0b0e1c';
    ctx.fillRect(0, GROUND, WORLD_W, H - GROUND);
    ctx.fillStyle = '#1c2340';
    for (let x = 0; x < WORLD_W; x += 14) ctx.fillRect(x + ((x / 14) % 2) * 7, GROUND + 2, 10, 3);
    ctx.fillStyle = '#2b3460';
    ctx.fillRect(0, GROUND, WORLD_W, 2);
  }

  drawGate(ctx, g) {
    const { x, color } = g;
    const top = GROUND - 66;
    glow(ctx, x, GROUND - 30, 48, color, 0.25 + Math.sin(this.time * 2) * 0.08);
    ctx.fillStyle = '#2a2f45';
    ctx.fillRect(x - 32, top, 12, 66);
    ctx.fillRect(x + 20, top, 12, 66);
    for (let i = 0; i < 6; i++) ctx.fillRect(x - 30 + i * 2, top - 4 - i * 2, 60 - i * 4, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x - 3, top - 14, 6, 6);
    ctx.fillStyle = '#03040a';
    ctx.fillRect(x - 20, top + 4, 40, 62);
    for (let i = 0; i < 6; i++) {
      const py = GROUND - ((this.time * 18 + i * 11) % 60);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x - 14 + ((i * 7) % 28), py, 2, 2);
      ctx.globalAlpha = 1;
    }

    const label = g.chore.title;
    const lw = label.length * 8 + 10;
    panel(ctx, x - lw / 2, top - 34, lw, 14, '#0a1024dd');
    text(ctx, label, x - lw / 2 + 5, top - 31, color);

    if (g.chore.id === this.recommendedId) {
      const by = top - 50 + Math.sin(this.time * 5) * 2;
      text(ctx, '!', x - 3, by, '#ffd36b');
    }
  }

  drawBoard(ctx) {
    const x = BOARD_X;
    ctx.fillStyle = '#2a211d';
    ctx.fillRect(x - 20, GROUND - 22, 3, 22);
    ctx.fillRect(x + 17, GROUND - 22, 3, 22);
    ctx.fillStyle = '#4a3a2f';
    ctx.fillRect(x - 24, GROUND - 50, 48, 30);
    ctx.fillStyle = '#e9dfc4';
    [[-20, -46], [-6, -44], [8, -47], [-14, -33], [4, -32]].forEach(([dx, dy]) => ctx.fillRect(x + dx, GROUND + dy, 10, 9));
  }

  /** The Peak: a storm-wrapped crag crowned by a gothic spire, a winding stair, dead trees and mist. */
  drawMountain(ctx) {
    const peakX = 1150;
    const strike = this.time % 6 < 0.18;
    // Scale the whole scene around its base so the spire's tip stays on screen.
    ctx.save();
    ctx.translate(peakX, GROUND);
    ctx.scale(0.78, 0.78);
    ctx.translate(-peakX, -GROUND);

    // Storm glow behind the spire, brighter on a lightning strike.
    glow(ctx, peakX, GROUND - 170, 120, strike ? '#e6d9ff' : '#6b5b95', strike ? 0.5 : 0.25);

    // Jagged crag.
    for (let i = 0; i < 64; i++) {
      const y = GROUND - 140 + i * 2.2;
      const half = 18 + i * 2.6 + (i % 5) * 3;
      ctx.fillStyle = i % 7 === 0 ? '#2a2438' : '#1a1626';
      ctx.fillRect(peakX - half, y, half * 2, 3);
    }

    // Gothic spire: tower, side turrets, needle tops and lit windows.
    ctx.fillStyle = '#100d18';
    ctx.fillRect(peakX - 14, GROUND - 210, 28, 74);
    ctx.fillRect(peakX - 26, GROUND - 186, 8, 50);
    ctx.fillRect(peakX + 18, GROUND - 180, 8, 44);
    for (const [x, top, h] of [[peakX - 2, GROUND - 246, 36], [peakX - 23, GROUND - 204, 18], [peakX + 21, GROUND - 196, 16]]) {
      for (let i = 0; i < h; i++) ctx.fillRect(x - Math.floor(i / 6), top + i, 4 + Math.floor(i / 6) * 2, 1);
    }
    const windowGlow = 0.6 + Math.sin(this.time * 3) * 0.2;
    ctx.fillStyle = `rgba(159, 216, 120, ${windowGlow})`;
    for (const [x, y] of [[peakX - 6, GROUND - 196], [peakX + 2, GROUND - 180], [peakX - 6, GROUND - 162], [peakX - 24, GROUND - 170]]) ctx.fillRect(x, y, 3, 5);

    // Winding stone stair from the gate up to the spire.
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const sx = 1120 + Math.sin(t * Math.PI * 2.2) * 40 * (1 - t) + t * 30;
      const sy = GROUND - 8 - t * 128;
      ctx.fillStyle = i % 2 ? '#4a4558' : '#3a3648';
      ctx.fillRect(sx - 7 + t * 4, sy, 14 - t * 8, 3);
      ctx.fillStyle = '#2f4a2a';
      ctx.fillRect(sx - 8 + t * 4, sy + 2, 2, 1);
    }

    // Dead trees clinging to the rock.
    ctx.strokeStyle = '#0c0a12';
    ctx.lineWidth = 1;
    for (const [x, y, s] of [[1040, GROUND - 40, 1], [1215, GROUND - 70, -1], [1075, GROUND - 95, -1], [1230, GROUND - 25, 1]]) {
      tree(ctx, x, y, s);
    }

    // Mist wisps drifting around the crag.
    for (let i = 0; i < 7; i++) {
      const mx = 1040 + ((i * 53 + this.time * 8) % 220);
      const my = GROUND - 30 - ((i * 37) % 130) + Math.sin(this.time + i) * 4;
      ctx.fillStyle = 'rgba(200, 190, 230, 0.12)';
      ctx.fillRect(mx, my, 26, 3);
      ctx.fillRect(mx + 6, my - 3, 14, 2);
    }

    // Lightning.
    if (strike) {
      ctx.strokeStyle = '#f3ecff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      let lx = peakX + 30;
      ctx.moveTo(lx, 0);
      for (let y = 0; y < GROUND - 240; y += 14) { lx += ((y * 7) % 23) - 11; ctx.lineTo(lx, y); }
      ctx.lineTo(peakX, GROUND - 246);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawArmory(ctx) {
    const x = ARMORY_X;
    const flicker = 0.35 + Math.sin(this.time * 11) * 0.08;
    ctx.fillStyle = '#241c22';
    ctx.fillRect(x - 34, GROUND - 52, 68, 52);
    for (let i = 0; i < 6; i++) ctx.fillRect(x - 38 + i * 4, GROUND - 56 - i * 4, 76 - i * 8, 4);
    ctx.fillRect(x + 16, GROUND - 84, 10, 30);
    ctx.fillStyle = '#05060f';
    ctx.fillRect(x - 14, GROUND - 34, 28, 34);
    glow(ctx, x, GROUND - 16, 40, '#ff7a2f', flicker);
    ctx.fillStyle = '#ff9f43';
    ctx.fillRect(x - 8, GROUND - 10, 16, 6);
    ctx.fillStyle = '#6b7395';
    ctx.fillRect(x - 30, GROUND - 12, 12, 4);
    ctx.fillRect(x - 27, GROUND - 8, 6, 8);
    for (let i = 0; i < 3; i++) {
      const sy = GROUND - 90 - ((this.time * 14 + i * 10) % 30);
      ctx.fillStyle = `rgba(150, 150, 170, ${0.3 - i * 0.08})`;
      ctx.fillRect(x + 18 + Math.sin(this.time + i) * 3, sy, 6, 4);
    }
    const label = 'Armory';
    const lw = label.length * 8 + 10;
    panel(ctx, x - lw / 2, GROUND - 106, lw, 14, '#0a1024dd');
    text(ctx, label, x - lw / 2 + 5, GROUND - 103, '#ff9f43');
  }

  drawMotes(ctx) {
    for (const m of this.motes) {
      ctx.fillStyle = `rgba(150, 230, 255, ${0.35 + Math.sin(m.p * 3) * 0.25})`;
      ctx.fillRect(m.x + Math.sin(m.p) * 6, m.y, 1, 1);
    }
  }

  drawRain(ctx) {
    ctx.fillStyle = '#8fa3d955';
    for (const r of this.rain) ctx.fillRect(r.x, r.y, 1, 5);
  }

  drawHud(ctx) {
    const p = this.progress;

    // Status window (top-left).
    panel(ctx, 4, 4, 178, 30, '#06102acc');
    text(ctx, `Lv${p.level} ${p.title}`, 10, 8, '#e8e6f0');
    ctx.fillStyle = '#0d1b3a';
    ctx.fillRect(10, 22, 164, 6);
    ctx.fillStyle = '#5ce1e6';
    ctx.fillRect(10, 22, (164 * p.into) / p.needed, 6);

    if (this.quest) {
      panel(ctx, 4, 38, 236, 14, '#06102acc');
      text(ctx, fit(`QUEST: ${this.quest}`, 28), 9, 41, '#ffd36b');
    }
    text(ctx, 'LANTERNFALL', W - 98, 8, '#8fa3d9');
    text(ctx, 'SAFE ZONE', W - 82, 20, '#5fd38d');
    const coins = `${p.coins} G`;
    text(ctx, coins, W - 10 - coins.length * 8, 32, '#ffd36b');

    // Context prompt (bottom).
    const gate = this.nearGate;
    if (gate) {
      const rec = gate.chore.id === this.recommendedId ? '  * BYTE PICKS' : '';
      systemWindow(ctx, `[W/E] ENTER ${gate.name.toUpperCase()}${rec}`, fit(gate.chore.blurb, 49));
    } else if (Math.abs(this.x - HERMIT_X) < NEAR) {
      systemWindow(ctx, 'THE HERMIT', fit(HERMIT_LINES[Math.floor(this.time / 4) % HERMIT_LINES.length], 54));
    } else if (this.nearArmory) {
      systemWindow(ctx, '[W/E] ENTER ARMORY', 'Buy and upgrade guns with coins from real chores');
    } else if (Math.abs(this.x - BOARD_X) < NEAR) {
      systemWindow(ctx, '[W/E] READ THE QUEST LOG', `Total cleared: ${p.totalCleared}   XP to next: ${p.needed - p.into}`);
    } else if (this.time < 6) {
      systemWindow(ctx, 'CONTROLS', 'A/D walk   W/E enter a gate   or click one');
    }

    // Area title card, fades in then out.
    if (this.titleTimer > 0) {
      const t = this.titleTimer;
      ctx.globalAlpha = Math.min(1, t, (3.5 - t) * 2);
      ctx.font = '16px "Press Start 2P", monospace';
      const title = 'LANTERNFALL';
      const tw = ctx.measureText(title).width;
      text(ctx, title, (W - tw) / 2, 50, '#e8e6f0');
      ctx.fillStyle = '#e8e6f0';
      ctx.fillRect(W / 2 - 90, 74, 180, 1);
      ctx.font = FONT;
      const sub = 'the town where chores come to die';
      text(ctx, sub, (W - ctx.measureText(sub).width) / 2, 82, '#8fa3d9');
      ctx.globalAlpha = 1;
    }
  }
}

function systemWindow(ctx, head, body) {
  const x = 40, y = H - 44, w = W - 80;
  panel(ctx, x, y, w, 36, '#06102ae6');
  ctx.strokeStyle = '#5ce1e6';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 35);
  ctx.fillStyle = '#5ce1e6';
  [[x, y], [x + w - 4, y], [x, y + 32], [x + w - 4, y + 32]].forEach(([cx, cy]) => ctx.fillRect(cx, cy, 4, 4));
  text(ctx, head, x + 8, y + 6, '#5ce1e6');
  text(ctx, body, x + 8, y + 20, '#e8e6f0');
}

function house(ctx, x, w, h, color, time, seed) {
  const base = GROUND - h;
  ctx.fillStyle = color;
  ctx.fillRect(x, base, w, h);
  for (let i = 0, rw = w + 6; rw > 0; i++, rw -= 8) ctx.fillRect(x - 3 + i * 4, base - (i + 1) * 4, rw, 4);
  for (let wx = x + 8; wx < x + w - 8; wx += 16) {
    const lit = (wx + seed * 13) % 3 !== 0;
    if (!lit) continue;
    const flicker = 0.75 + Math.sin(time * 3 + wx) * 0.15;
    ctx.fillStyle = `rgba(242, 212, 138, ${flicker})`;
    ctx.fillRect(wx, base + 12, 5, 7);
  }
}

function lamp(ctx, x, time) {
  ctx.fillStyle = '#2a2f45';
  ctx.fillRect(x, GROUND - 46, 2, 46);
  ctx.fillRect(x - 4, GROUND - 48, 10, 2);
  ctx.fillStyle = '#ffd36b';
  ctx.fillRect(x - 2, GROUND - 56, 6, 8);
  glow(ctx, x + 1, GROUND - 52, 42, '#ffd36b', 0.22 + Math.sin(time * 7 + x) * 0.03);
}

function glow(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function tree(ctx, x, y, side) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + side * 4, y - 14);
  ctx.lineTo(x + side * 10, y - 20);
  ctx.moveTo(x + side * 4, y - 14);
  ctx.lineTo(x - side * 3, y - 22);
  ctx.moveTo(x + side * 7, y - 17);
  ctx.lineTo(x + side * 12, y - 15);
  ctx.stroke();
}
