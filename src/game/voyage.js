// The trip between town and battle: walk through the gate, launch, jump to warp,
// cruise while the briefing plays, then brake, land and drop the wanderer off.
import { SPRITES, HERO_PALETTE, SHIP_PALETTE, drawSprite } from './sprites.js';
import { W, H, GROUND, HERO_X, drawArena } from './game.js';
import { GATE_STYLE } from './town.js';
import { text, FONT } from './draw.js';
import { sfx } from './audio.js';

const SHIP_SCALE = 3;
const SHIP_W = 24 * SHIP_SCALE;
const SHIP_H = 11 * SHIP_SCALE;
const CRUISE_SPEED = 9;
const STAR_COUNT = 240;
const LAND_X = HERO_X + 34;

// How long each scripted phase lasts (seconds). 'cruise' lasts until arrive() is called.
const PHASES = { enter: 1.5, launch: 1.8, jump: 0.55, cruise: Infinity, brake: 0.8, land: 1.4, drop: 0.5, liftoff: 0.7 };
const NEXT = { enter: 'launch', launch: 'jump', jump: 'cruise', brake: 'land', land: 'drop', drop: 'liftoff', liftoff: null };

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeIn = (t) => t ** 3;

export class Voyage {
  /** @param {HTMLCanvasElement} canvas @param {{chore}} opts */
  constructor(canvas, { chore }) {
    this.ctx = canvas.getContext('2d');
    this.chore = chore;
    this.gateColor = GATE_STYLE[chore.id]?.color ?? '#5ce1e6';
    this.phase = 'enter';
    this.t = 0;
    this.time = 0;
    this.flash = 0;
    this.speed = 0;
    this.stars = Array.from({ length: STAR_COUNT }, () => newStar(Math.random()));
    this.dust = [];
    this.frame = this.frame.bind(this);
  }

  /** Plays enter -> launch -> jump. Resolves once the ship is cruising at warp. */
  depart() {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
    return new Promise((resolve) => { this.onCruise = resolve; });
  }

  /** Plays brake -> land -> drop -> liftoff. Resolves when the arena is ready. */
  arrive() {
    this.go('brake');
    return new Promise((resolve) => { this.onDone = resolve; });
  }

  go(phase) {
    this.phase = phase;
    this.t = 0;
    if (phase === 'launch') sfx.engine();
    if (phase === 'jump') sfx.warp();
    if (phase === 'brake') sfx.brake();
    if (phase === 'cruise') { this.flash = 1; this.onCruise?.(); }
    if (phase === 'land') this.flash = 1;
  }

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.t += dt;
    if (this.t >= PHASES[this.phase]) {
      const next = NEXT[this.phase];
      if (!next) { this.running = false; this.onDone?.(); return; }
      this.go(next);
    }
    this.update(dt);
    this.draw();
    requestAnimationFrame(this.frame);
  }

  get progress() {
    return Math.min(1, this.t / PHASES[this.phase]);
  }

  update(dt) {
    const p = this.progress;
    // Slow drift, then a sudden exponential surge into warp, then a hard brake.
    this.speed = {
      launch: 0.08 + p * 0.25,
      jump: 0.33 + easeIn(p) * CRUISE_SPEED,
      cruise: CRUISE_SPEED,
      brake: CRUISE_SPEED * (1 - p) ** 2,
    }[this.phase] ?? 0;

    for (const s of this.stars) {
      s.pz = s.z;
      s.z -= this.speed * dt * 0.12;
      if (s.z <= 0.02) Object.assign(s, newStar(1));
    }
    for (const d of this.dust) { d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt; }
    this.dust = this.dust.filter((d) => d.life > 0);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  // ---------- rendering ----------

  draw() {
    const { ctx } = this;
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    if (this.phase === 'enter') this.drawEnter(ctx);
    else if (['launch', 'jump', 'cruise', 'brake'].includes(this.phase)) this.drawSpace(ctx);
    else this.drawLanding(ctx);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(230, 250, 255, ${this.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawEnter(ctx) {
    const p = this.progress;
    const gx = W / 2;
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0b0e1c';
    ctx.fillRect(0, GROUND, W, H - GROUND);

    const glowA = 0.25 + p * 0.6;
    const g = ctx.createRadialGradient(gx, GROUND - 30, 0, gx, GROUND - 30, 70 + p * 60);
    g.addColorStop(0, this.gateColor);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = glowA;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#2a2f45';
    ctx.fillRect(gx - 32, GROUND - 66, 12, 66);
    ctx.fillRect(gx + 20, GROUND - 66, 12, 66);
    for (let i = 0; i < 6; i++) ctx.fillRect(gx - 30 + i * 2, GROUND - 70 - i * 2, 60 - i * 4, 4);
    ctx.fillStyle = '#03040a';
    ctx.fillRect(gx - 20, GROUND - 62, 40, 62);

    // The wanderer walks in and fades into the doorway.
    const walk = Math.min(1, p / 0.7);
    const hx = gx - 130 + walk * 118;
    ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    const sprite = Math.floor(this.time * 8) % 2 ? SPRITES.heroWalk : SPRITES.hero;
    drawSprite(ctx, sprite, HERO_PALETTE, hx, GROUND - sprite.length * 2, 2);
    ctx.globalAlpha = 1;
    centered(ctx, `Entering ${GATE_STYLE[this.chore.id]?.name ?? this.chore.title}...`, 40, '#8fa3d9');
  }

  drawSpace(ctx) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H / 2 - 20;
    const streak = this.speed > 1;

    for (const s of this.stars) {
      const sx = cx + (s.x * 0.35) / s.z;
      const sy = cy + (s.y * 0.35) / s.z;
      const bright = Math.min(1, (1 - s.z) * 1.4);
      ctx.strokeStyle = s.tint ? `rgba(92, 225, 230, ${bright})` : `rgba(230, 240, 255, ${bright})`;
      ctx.lineWidth = s.z < 0.3 ? 2 : 1;
      ctx.beginPath();
      if (streak) {
        // Exaggerate the trail so warp reads as long streaks from the centre.
        const tz = Math.min(1, s.z + (s.pz - s.z) * 6 + 0.01);
        ctx.moveTo(cx + (s.x * 0.35) / tz, cy + (s.y * 0.35) / tz);
      } else ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (streak ? 0 : 1), sy);
      ctx.stroke();
    }

    this.drawShip(ctx);

    const label = {
      launch: '[SYSTEM] ENGINES ONLINE',
      jump: '[SYSTEM] WARP DRIVE ENGAGED',
      cruise: `[SYSTEM] WARPING TO ${this.chore.title.toUpperCase()}`,
      brake: '[SYSTEM] DROPPING OUT OF WARP',
    }[this.phase];
    centered(ctx, label, 12, '#5ce1e6');
  }

  drawShip(ctx) {
    const p = this.progress;
    let x = W / 2 - SHIP_W / 2;
    let y = H / 2 - 20 - SHIP_H / 2;
    let stretch = 1;

    if (this.phase === 'launch') {
      x -= 50 - easeOut(p) * 40;
      y += Math.sin(this.time * 2) * 2;
    } else if (this.phase === 'jump') {
      x -= 10 - p * 10;
      stretch = 1 + easeIn(p) * 2.5;
    } else {
      x += (Math.random() - 0.5) * (this.phase === 'cruise' ? 1.5 : 3);
      y += (Math.random() - 0.5) * 1.5;
    }

    // Engine flame grows with speed.
    const flame = 6 + Math.min(this.speed, CRUISE_SPEED) * 4 + Math.random() * 4;
    flameBack(ctx, x, y + SHIP_H / 2, flame);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(stretch, 1);
    drawSprite(ctx, SPRITES.ship, SHIP_PALETTE, 0, 0, SHIP_SCALE);
    ctx.restore();
  }

  drawLanding(ctx) {
    const p = this.progress;
    drawArena(ctx, this.chore.id, this.time, H);

    let y = GROUND - SHIP_H;
    if (this.phase === 'land') y = -SHIP_H + easeOut(p) * (GROUND - SHIP_H + SHIP_H);
    if (this.phase === 'liftoff') y = GROUND - SHIP_H - easeIn(p) * (GROUND + 20);

    if (this.phase !== 'drop') flameDown(ctx, LAND_X + SHIP_W / 2 - 4, y + SHIP_H, 6 + Math.random() * 6);
    drawSprite(ctx, SPRITES.ship, SHIP_PALETTE, LAND_X, y, SHIP_SCALE);

    if (this.phase === 'land' && p > 0.85 && !this.landed) {
      this.landed = true;
      for (let i = 0; i < 24; i++) {
        const dir = i % 2 ? 1 : -1;
        this.dust.push({ x: LAND_X + SHIP_W / 2, y: GROUND - 2, vx: dir * (40 + Math.random() * 120), vy: -Math.random() * 30, life: 0.6 });
      }
    }
    ctx.fillStyle = '#9aa3c7';
    for (const d of this.dust) ctx.fillRect(d.x, d.y, 2, 2);

    // The wanderer steps out once the ship touches down.
    if (this.phase === 'drop' || this.phase === 'liftoff') {
      drawSprite(ctx, SPRITES.hero, HERO_PALETTE, HERO_X, GROUND - SPRITES.hero.length * 2, 2);
    }
    centered(ctx, `ARRIVED: ${this.chore.title.toUpperCase()}`, 40, '#e8e6f0');
  }
}

function newStar(z) {
  return { x: (Math.random() - 0.5) * W * 2, y: (Math.random() - 0.5) * H * 2, z, pz: z, tint: Math.random() < 0.2 };
}

function flameBack(ctx, x, cy, len) {
  ctx.fillStyle = '#ff9f43';
  ctx.fillRect(x - len, cy - 4, len, 8);
  ctx.fillStyle = '#ffd36b';
  ctx.fillRect(x - len * 0.6, cy - 2, len * 0.6, 4);
}

function flameDown(ctx, cx, y, len) {
  ctx.fillStyle = '#ff9f43';
  ctx.fillRect(cx - 4, y, 8, len);
  ctx.fillStyle = '#ffd36b';
  ctx.fillRect(cx - 2, y, 4, len * 0.6);
}

function centered(ctx, str, y, color) {
  text(ctx, str, Math.round((W - ctx.measureText(str).width) / 2), y, color);
}
