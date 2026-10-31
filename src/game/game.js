// The arcade loop. It knows nothing about files or money: it only talks to a chore `session`.
import { SPRITES, HERO_PALETTE, BYTE_PALETTE, enemyPalette, drawSprite } from './sprites.js';
import { enemySpeed, spawnInterval, canAutoSweep, commentary } from '../assistant/assistant.js';
import { sfx } from './audio.js';
import { panel, text, fit, FONT } from './draw.js';

export const W = 480;
export const H = 270;
export const GROUND = 200;
export const HERO_X = 24;
const SCALE = 2;
const MAX_ALIVE = 7;
const SPACING = 34;
const SWEEP_MAX = 8;
export const BAR_Y = 226;

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{session, chore, items, memory, onEnd:(results, stats)=>void}} opts
   */
  constructor(canvas, { session, chore, items, memory, onEnd }) {
    this.ctx = canvas.getContext('2d');
    this.canvas = canvas;
    this.session = session;
    this.chore = chore;
    this.memory = memory;
    this.onEnd = onEnd;
    this.queue = [...items];
    this.total = items.length;

    this.enemies = [];
    this.bolts = [];
    this.particles = [];
    this.results = [];
    this.pending = new Set();
    this.stats = { agree: 0, override: 0, skipped: 0, bestCombo: 0, startedAt: performance.now() };
    this.combo = 0;
    this.sweep = 0;
    this.spawnTimer = 0;
    this.castTimer = 0;
    this.shake = 0;
    this.message = { text: chore.story.at(-1).replace('BYTE: ', ''), ttl: 3 };
    this.time = 0;
    this.running = false;
    this.ending = false;

    this.onKey = this.onKey.bind(this);
    this.onPointer = this.onPointer.bind(this);
    this.frame = this.frame.bind(this);
  }

  start() {
    this.running = true;
    window.addEventListener('keydown', this.onKey);
    this.canvas.addEventListener('pointerdown', this.onPointer);
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    window.removeEventListener('keydown', this.onKey);
    this.canvas.removeEventListener('pointerdown', this.onPointer);
  }

  get agreeRate() {
    const decided = this.stats.agree + this.stats.override;
    return decided ? this.stats.agree / decided : 0.5;
  }

  get target() {
    return this.enemies.find((e) => e.state === 'walk');
  }

  // ---------- input ----------

  onKey(e) {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= this.chore.categories.length) this.decide(this.chore.categories[n - 1].id);
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.acceptSuggestion(); }
    else if (e.key.toLowerCase() === 'q') this.autoSweep();
    else if (e.key === 'Escape') this.finish();
  }

  onPointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    if (y >= BAR_Y) {
      const i = Math.floor(x / (W / this.chore.categories.length));
      this.decide(this.chore.categories[i]?.id);
    } else if (y > 70) {
      this.acceptSuggestion();
    }
  }

  acceptSuggestion() {
    const t = this.target;
    if (t) this.decide(t.suggestion.category);
  }

  autoSweep() {
    if (this.sweep < SWEEP_MAX) return;
    const easy = this.enemies.filter((e) => e.state === 'walk' && canAutoSweep(e.suggestion));
    easy.forEach((e) => this.decide(e.suggestion.category, e));
    this.sweep = 0;
    sfx.sweep();
    this.say(commentary('sweep', { count: easy.length }), 2.5);
  }

  /** The core move: a player decision becomes a real-world action via the chore session. */
  decide(categoryId, enemy = this.target) {
    if (!categoryId || !enemy || enemy.state !== 'walk') return;
    enemy.state = 'zapped';
    const agreed = categoryId === enemy.suggestion.category;
    const category = this.chore.categories.find((c) => c.id === categoryId);

    this.combo++;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
    if (agreed) {
      this.stats.agree++;
      this.sweep = Math.min(SWEEP_MAX, this.sweep + 1);
      sfx.agree();
      if (this.combo % 10 === 0) this.say(commentary('combo', { combo: this.combo }));
    } else {
      this.stats.override++;
      const key = this.session.learnKey(enemy.item);
      this.memory.learn(key, categoryId);
      sfx.zap();
      this.say(commentary('override', { key: key?.split(':')[1] }));
    }

    this.castTimer = 0.15;
    this.bolts.push({ x: HERO_X + 24, y: GROUND - 14, enemy, color: category.color });

    const job = this.session.apply(enemy.item, categoryId)
      .then(() => this.results.push({ item: enemy.item, category: categoryId, agreed }))
      .catch((err) => {
        this.results.push({ item: enemy.item, category: null, error: err.message });
        this.combo = 0;
        this.say(commentary('error', { message: err.message }), 3);
      })
      .finally(() => this.pending.delete(job));
    this.pending.add(job);
  }

  say(text, ttl = 1.8) {
    this.message = { text, ttl };
  }

  // ---------- simulation ----------

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.update(dt);
    this.draw();
    requestAnimationFrame(this.frame);
  }

  update(dt) {
    this.spawnTimer -= dt;
    const alive = this.enemies.filter((e) => e.state === 'walk').length;
    // Never leave a fast player waiting on an empty screen.
    if (alive === 0) this.spawnTimer = Math.min(this.spawnTimer, 0.1);
    if (this.queue.length && this.spawnTimer <= 0 && alive < MAX_ALIVE) {
      this.spawn(this.queue.shift());
      this.spawnTimer = spawnInterval({ combo: this.combo, agreeRate: this.agreeRate });
    }

    let ahead = -Infinity;
    for (const e of this.enemies) {
      if (e.state === 'walk') {
        const speed = enemySpeed({ combo: this.combo, agreeRate: this.agreeRate, confidence: e.suggestion.confidence });
        e.x = Math.max(e.x - speed * dt, ahead + SPACING);
        ahead = e.x;
        if (e.x <= HERO_X + 26) this.skip(e);
      }
      e.bob += dt * 8;
    }

    const t = this.target;
    if (t && !t.announced) {
      t.announced = true;
      if (t.suggestion.confidence < 0.6) this.say(commentary('unsure', { reason: t.suggestion.reason }), 2.5);
    }

    for (const b of this.bolts) {
      const tx = b.enemy.x + 10;
      b.x += 600 * dt;
      if (b.x >= tx) {
        b.done = true;
        b.enemy.state = 'dead';
        this.burst(tx, GROUND - 8, b.color);
      }
    }
    this.bolts = this.bolts.filter((b) => !b.done);
    this.enemies = this.enemies.filter((e) => e.state !== 'dead');

    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    this.castTimer -= dt;
    this.shake = Math.max(0, this.shake - dt * 20);
    if (this.message) this.message.ttl -= dt;

    if (!this.queue.length && !this.enemies.length && !this.pending.size) this.finish();
  }

  spawn(item) {
    const suggestion = this.session.suggest(item);
    const base = this.chore.categories.find((c) => c.id === suggestion.category).color;
    this.enemies.push({ item, suggestion, x: W + 10, bob: Math.random() * 6, state: 'walk', palette: enemyPalette(base) });
  }

  skip(enemy) {
    enemy.state = 'dead';
    this.results.push({ item: enemy.item, category: null });
    this.stats.skipped++;
    this.combo = 0;
    this.shake = 4;
    sfx.skip();
    this.say(commentary('skip'));
  }

  burst(x, y, color) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 120;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.5, color });
    }
  }

  async finish() {
    if (this.ending) return;
    this.ending = true;
    await Promise.allSettled([...this.pending]);
    // Anything never decided is left untouched.
    for (const e of this.enemies) if (e.state === 'walk') this.results.push({ item: e.item, category: null });
    for (const item of this.queue) this.results.push({ item, category: null });
    this.stop();
    this.stats.minutes = (performance.now() - this.stats.startedAt) / 60000;
    this.onEnd(this.results, this.stats);
  }

  // ---------- rendering ----------

  draw() {
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * this.shake, 0);
    this.drawWorld(ctx);
    ctx.restore();
    this.drawHud(ctx);
  }

  drawWorld(ctx) {
    drawArena(ctx, this.chore.id, this.time);

    const heroSprite = this.castTimer > 0 ? SPRITES.heroCast : SPRITES.hero;
    drawSprite(ctx, heroSprite, HERO_PALETTE, HERO_X, GROUND - heroSprite.length * SCALE, SCALE);
    drawSprite(ctx, SPRITES.byte, BYTE_PALETTE, HERO_X + 30, GROUND - 52 + Math.sin(this.time * 3) * 3, SCALE);

    const enemySprite = this.chore.id === 'files' ? SPRITES.slime : SPRITES.goblin;
    const target = this.target;
    for (const e of this.enemies) {
      const y = GROUND - enemySprite.length * SCALE - Math.abs(Math.sin(e.bob)) * 3;
      drawSprite(ctx, enemySprite, e.palette, e.x, y, SCALE);
      if (e === target) {
        ctx.fillStyle = '#ffffff';
        const ax = e.x + 8, ay = y - 10 + Math.sin(this.time * 6) * 2;
        ctx.fillRect(ax, ay, 5, 2); ctx.fillRect(ax + 1, ay + 2, 3, 2); ctx.fillRect(ax + 2, ay + 4, 1, 1);
      }
    }

    for (const b of this.bolts) {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, 10, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(b.x + 6, b.y + 1, 4, 1);
    }
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 2, 2);
    }
  }

  drawHud(ctx) {
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    const target = this.target;

    // Target card: what this enemy really is and what Byte thinks.
    panel(ctx, 4, 4, W - 8, 44);
    if (target) {
      const s = target.suggestion;
      const cat = this.chore.categories.find((c) => c.id === s.category);
      text(ctx, fit(target.item.label, 40), 10, 10, '#ffffff');
      text(ctx, target.item.sublabel, 10, 22, '#b0bec5');
      text(ctx, `BYTE: ${cat.label} ${Math.round(s.confidence * 100)}%`, 10, 34, cat.color);
      text(ctx, fit(s.reason, 26), 200, 34, '#90a4ae');
    } else {
      text(ctx, this.queue.length ? 'Incoming...' : 'Wrapping up...', 10, 22, '#b0bec5');
    }

    const done = this.total - this.queue.length - this.enemies.filter((e) => e.state === 'walk').length;
    text(ctx, `${done}/${this.total}`, W - 74, 10, '#ffffff');
    if (this.combo > 1) text(ctx, `x${this.combo}`, W - 74, 22, '#ffca28');

    // Byte's speech.
    if (this.message?.ttl > 0) {
      panel(ctx, 4, 52, W - 8, 16, '#0b3c49');
      text(ctx, fit(this.message.text, 56), 10, 56, '#e0f7fa');
    }

    // Auto-sweep meter.
    const full = this.sweep >= SWEEP_MAX;
    ctx.fillStyle = '#00000088';
    ctx.fillRect(W - 110, 74, 104, 10);
    ctx.fillStyle = full ? (Math.floor(this.time * 6) % 2 ? '#26c6da' : '#e0f7fa') : '#26c6da';
    ctx.fillRect(W - 108, 76, (100 * this.sweep) / SWEEP_MAX, 6);
    text(ctx, full ? 'Q: SWEEP!' : 'SWEEP', W - 110, 88, full ? '#e0f7fa' : '#607d8b');

    // Category bar: keys 1..N, Byte's pick glows.
    const cats = this.chore.categories;
    const w = W / cats.length;
    cats.forEach((c, i) => {
      const x = i * w;
      const suggested = target?.suggestion.category === c.id;
      const glow = suggested ? 0.6 + Math.sin(this.time * 10) * 0.4 : 0;
      ctx.fillStyle = '#14141f';
      ctx.fillRect(x + 2, BAR_Y, w - 4, H - BAR_Y - 2);
      ctx.strokeStyle = suggested ? `rgba(255,255,255,${glow})` : c.color;
      ctx.lineWidth = suggested ? 2 : 1;
      ctx.strokeRect(x + 3, BAR_Y + 1, w - 6, H - BAR_Y - 4);
      ctx.fillStyle = c.color;
      ctx.fillRect(x + 6, BAR_Y + 5, 14, 14);
      text(ctx, String(i + 1), x + 9, BAR_Y + 8, '#000000');
      text(ctx, fit(c.label, 9), x + 6, BAR_Y + 26, suggested ? '#ffffff' : c.color);
    });
  }
}

/** The battle backdrop (sky, stars, ground). Shared with the landing cutscene. */
export function drawArena(ctx, choreId, time, bottom = BAR_Y) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, choreId === 'files' ? '#07091a' : '#06140f');
  sky.addColorStop(1, choreId === 'files' ? '#24204a' : '#173a2c');
  ctx.fillStyle = sky;
  ctx.fillRect(-10, 0, W + 20, GROUND);
  for (let i = 0; i < 40; i++) {
    const x = (i * 97 + time * (i % 3 + 1) * -4) % W;
    ctx.fillStyle = i % 5 ? '#ffffff33' : '#ffffff88';
    ctx.fillRect((x + W) % W, 70 + ((i * 53) % 110), 1, 1);
  }
  ctx.fillStyle = '#2b2b3d';
  ctx.fillRect(-10, GROUND, W + 20, bottom - GROUND);
  ctx.fillStyle = '#3d3d55';
  for (let x = -((time * 20) % 16); x < W; x += 16) ctx.fillRect(x, GROUND, 8, 3);
}
