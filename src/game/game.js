// The battle loop. It knows nothing about files or money: it only talks to a chore `session`.
// Enemies advance along a 2.5D perspective corridor; game logic runs in a flat "distance" axis
// and only rendering projects it into depth.
import { SPRITES, HERO_PALETTE, BYTE_PALETTE, enemyPalette, drawSprite } from './sprites.js';
import { enemySpeed, spawnInterval, canAutoSweep, commentary, repeatRatio } from '../assistant/assistant.js';
import { WEAPONS, getWeapon, weaponStats, extraTargets, coinsFor } from './arsenal.js';
import { sfx } from './audio.js';
import { panel, text, fit, FONT } from './draw.js';

export const W = 480;
export const H = 270;
export const GROUND = 200;
export const HERO_X = 24;
export const BAR_Y = 226;
const MAX_ALIVE = 7;
const SPACING = 34;
const SWEEP_MAX = 8;

// Distance axis: enemies spawn at SPAWN_X and are skipped when they reach SKIP_X.
const SPAWN_X = W + 10;
const SKIP_X = HERO_X + 26;

// Perspective: vanishing point and the near end of the lane.
const HORIZON = 96;
const VP_X = 300;
const NEAR = { x: 150, y: 216 };
const MAX_Z = 6;
const HERO_POS = { x: 54, y: 218 };

const THEMES = {
  files: { skyTop: '#07091a', skyBottom: '#24204a', floor: '#120f26', grid: '#3b2f6b', pillar: '#1a1838', fog: '36, 32, 74' },
  expenses: { skyTop: '#06140f', skyBottom: '#173a2c', floor: '#0b1a14', grid: '#1f5a40', pillar: '#12261d', fog: '23, 58, 44' },
};

/** Project a depth z (1 = nearest) onto the screen. */
function project(z) {
  return { x: VP_X + (NEAR.x - VP_X) / z, y: HORIZON + (NEAR.y - HORIZON) / z, scale: 3 / z };
}

const depthOf = (x) => 1 + ((x - SKIP_X) / (SPAWN_X - SKIP_X)) * (MAX_Z - 1);

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{session, chore, items, memory, arsenal, onEquip:(id)=>void, onEnd:(results, stats)=>void}} opts
   */
  constructor(canvas, { session, chore, items, memory, arsenal, onEquip, onEnd }) {
    this.ctx = canvas.getContext('2d');
    this.canvas = canvas;
    this.session = session;
    this.chore = chore;
    this.memory = memory;
    this.onEquip = onEquip;
    this.onEnd = onEnd;
    this.items = items;
    this.queue = [...items];
    this.total = items.length;
    this.theme = THEMES[chore.id] ?? THEMES.files;

    this.owned = arsenal.owned;
    this.weapon = arsenal.equipped;
    this.railCooldown = 0;

    this.enemies = [];
    this.bolts = [];
    this.particles = [];
    this.results = [];
    this.pending = new Set();
    this.stats = { agree: 0, override: 0, skipped: 0, bestCombo: 0, coins: 0, startedAt: performance.now() };
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

  keyOf = (item) => this.session.learnKey(item);

  // ---------- input ----------

  onKey(e) {
    const k = e.key.toLowerCase();
    const n = parseInt(e.key, 10);
    const weapon = WEAPONS.find((w) => w.key === k);
    if (n >= 1 && n <= this.chore.categories.length) this.decide(this.chore.categories[n - 1].id);
    else if (weapon) this.equip(weapon.id);
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.acceptSuggestion(); }
    else if (k === 'q') this.autoSweep();
    else if (e.key === 'Escape') this.finish();
  }

  onPointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    if (y >= BAR_Y) {
      const i = Math.floor(x / (W / this.chore.categories.length));
      this.decide(this.chore.categories[i]?.id);
    } else if (y >= 74 && y <= 98 && x < 80) {
      this.equip(WEAPONS[Math.floor((x - 6) / 24)]?.id);
    } else if (y > 70) {
      this.acceptSuggestion();
    }
  }

  equip(id) {
    if (!id || !this.owned[id] || id === this.weapon) return;
    this.weapon = id;
    this.onEquip?.(id);
    this.say(commentary('weapon', { name: getWeapon(id).name }));
  }

  acceptSuggestion() {
    const t = this.target;
    if (t) this.decide(t.suggestion.category);
  }

  autoSweep() {
    if (this.sweep < SWEEP_MAX) return;
    const easy = this.enemies.filter((e) => e.state === 'walk' && canAutoSweep(e.suggestion));
    easy.forEach((e) => this.decide(e.suggestion.category, e, false));
    this.sweep = 0;
    sfx.sweep();
    this.say(commentary('sweep', { count: easy.length }), 2.5);
  }

  /**
   * The core move: a player decision becomes a real-world action via the chore session.
   * A primary shot may also hit extra enemies, depending on the equipped weapon.
   */
  decide(categoryId, enemy = this.target, primary = true) {
    if (!categoryId || !enemy || enemy.state !== 'walk') return;
    enemy.state = 'zapped';
    const agreed = categoryId === enemy.suggestion.category;
    const category = this.chore.categories.find((c) => c.id === categoryId);

    this.combo++;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
    if (agreed) {
      this.stats.agree++;
      this.sweep = Math.min(SWEEP_MAX, this.sweep + 1);
      if (primary) sfx.agree();
      if (this.combo % 10 === 0) this.say(commentary('combo', { combo: this.combo }));
    } else {
      this.stats.override++;
      if (primary) {
        const key = this.keyOf(enemy.item);
        this.memory.learn(key, categoryId);
        sfx.zap();
        this.say(commentary('override', { key: key?.split(':')[1] }));
      }
    }

    const weaponId = primary ? this.firingWeapon() : 'blaster';
    this.castTimer = 0.15;
    this.bolts.push({ enemy, color: category.color, t: 0, beam: weaponId === 'rail' });

    const level = this.owned[this.weapon] ?? 1;
    const job = this.session.apply(enemy.item, categoryId)
      .then(() => {
        this.results.push({ item: enemy.item, category: categoryId, agreed });
        this.stats.coins += coinsFor({ weaponId: this.weapon, level, combo: this.combo });
      })
      .catch((err) => {
        this.results.push({ item: enemy.item, category: null, error: err.message });
        this.combo = 0;
        this.say(commentary('error', { message: err.message }), 3);
      })
      .finally(() => this.pending.delete(job));
    this.pending.add(job);

    if (!primary || weaponId === 'blaster') return;
    const extras = extraTargets({
      weaponId, level: this.owned[weaponId], target: enemy, categoryId, enemies: this.enemies, keyOf: this.keyOf,
    });
    if (weaponId === 'rail' && extras.length) this.railCooldown = weaponStats('rail', this.owned.rail).cooldown;
    extras.forEach((x) => this.decide(x.categoryId, x.enemy, false));
  }

  /** The rail lance needs to recharge; while it does, shots behave like the blaster. */
  firingWeapon() {
    if (this.weapon === 'rail' && this.railCooldown > 0) {
      this.say(commentary('cooldown'));
      return 'blaster';
    }
    return this.weapon;
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
        if (e.x <= SKIP_X) this.skip(e);
      }
      e.bob += dt * 8;
    }

    const t = this.target;
    if (t && !t.announced) {
      t.announced = true;
      this.announce(t);
    }

    for (const b of this.bolts) {
      b.t += dt / 0.14;
      if (b.t >= 1) {
        b.done = true;
        b.enemy.state = 'dead';
        const p = this.screenPos(b.enemy);
        this.burst(p.x, p.y - 8 * p.scale, b.color, p.scale);
      }
    }
    this.bolts = this.bolts.filter((b) => !b.done);
    this.enemies = this.enemies.filter((e) => e.state !== 'dead');

    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    this.railCooldown = Math.max(0, this.railCooldown - dt);
    this.castTimer -= dt;
    this.shake = Math.max(0, this.shake - dt * 20);
    if (this.message) this.message.ttl -= dt;

    if (!this.queue.length && !this.enemies.length && !this.pending.size) this.finish();
  }

  /** Byte's heads-up when a new target arrives: low confidence, or a group the Rail Lance could clear. */
  announce(t) {
    if (t.suggestion.confidence < 0.6) {
      this.say(commentary('unsure', { reason: t.suggestion.reason }), 2.5);
      return;
    }
    const key = this.keyOf(t.item);
    const same = key ? this.enemies.filter((e) => e.state === 'walk' && this.keyOf(e.item) === key).length : 0;
    if (same >= 3 && this.owned.rail && this.weapon !== 'rail') this.say(commentary('rail', { count: same }), 2.5);
  }

  spawn(item) {
    const suggestion = this.session.suggest(item);
    const base = this.chore.categories.find((c) => c.id === suggestion.category).color;
    this.enemies.push({ item, suggestion, x: SPAWN_X, bob: Math.random() * 6, state: 'walk', palette: enemyPalette(base) });
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

  burst(x, y, color, scale = 1) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (40 + Math.random() * 100) * Math.max(0.5, scale / 2);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.5, color });
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
    this.stats.agreeRate = this.agreeRate;
    this.stats.repeatRatio = repeatRatio(this.items, this.keyOf);
    this.onEnd(this.results, this.stats);
  }

  // ---------- rendering ----------

  screenPos(enemy) {
    return project(depthOf(enemy.x));
  }

  draw() {
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * this.shake, 0);
    this.drawWorld(ctx);
    ctx.restore();
    this.drawHud(ctx);
  }

  drawWorld(ctx) {
    this.drawCorridor(ctx);

    const enemySprite = this.chore.id === 'files' ? SPRITES.slime : SPRITES.goblin;
    const spriteW = enemySprite[0].length;
    const target = this.target;
    // Painter's algorithm: far enemies first.
    for (const e of [...this.enemies].sort((a, b) => b.x - a.x)) {
      const p = this.screenPos(e);
      const px = Math.max(1, Math.round(p.scale));
      const hop = Math.abs(Math.sin(e.bob)) * 2 * p.scale;
      shadow(ctx, p.x, p.y, spriteW * px * 0.45);
      ctx.globalAlpha = Math.min(1, 0.35 + p.scale / 2);
      drawSprite(ctx, enemySprite, e.palette, p.x - (spriteW * px) / 2, p.y - enemySprite.length * px - hop, px);
      ctx.globalAlpha = 1;
      if (e === target) {
        const ay = p.y - enemySprite.length * px - hop - 12 + Math.sin(this.time * 6) * 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(p.x - 2, ay, 5, 2); ctx.fillRect(p.x - 1, ay + 2, 3, 2); ctx.fillRect(p.x, ay + 4, 1, 1);
      }
    }

    const heroSprite = this.castTimer > 0 ? SPRITES.heroCast : SPRITES.hero;
    shadow(ctx, HERO_POS.x + 18, HERO_POS.y, 18);
    drawSprite(ctx, heroSprite, HERO_PALETTE, HERO_POS.x, HERO_POS.y - heroSprite.length * 3, 3);
    drawSprite(ctx, SPRITES.byte, BYTE_PALETTE, HERO_POS.x + 46, HERO_POS.y - 74 + Math.sin(this.time * 3) * 3, 2);

    const gun = { x: HERO_POS.x + 40, y: HERO_POS.y - 34 };
    for (const b of this.bolts) {
      const p = this.screenPos(b.enemy);
      const tx = p.x, ty = p.y - 8 * p.scale;
      const head = { x: gun.x + (tx - gun.x) * b.t, y: gun.y + (ty - gun.y) * b.t };
      const tailT = b.beam ? 0 : Math.max(0, b.t - 0.3);
      const tail = { x: gun.x + (tx - gun.x) * tailT, y: gun.y + (ty - gun.y) * tailT };
      ctx.strokeStyle = b.beam ? '#ff6b9a' : b.color;
      ctx.lineWidth = b.beam ? 4 : 3;
      line(ctx, tail, head);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      line(ctx, tail, head);
    }
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 2, 2);
    }
  }

  drawCorridor(ctx) {
    const th = this.theme;
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
    sky.addColorStop(0, th.skyTop);
    sky.addColorStop(1, th.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(-10, 0, W + 20, HORIZON);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = i % 5 ? '#ffffff33' : '#ffffff88';
      ctx.fillRect((i * 97) % W, 6 + ((i * 53) % (HORIZON - 10)), 1, 1);
    }

    ctx.fillStyle = th.floor;
    ctx.fillRect(-10, HORIZON, W + 20, BAR_Y - HORIZON);

    // Floor grid: rows scroll toward the camera, columns converge on the vanishing point.
    ctx.strokeStyle = th.grid;
    ctx.lineWidth = 1;
    const scroll = (this.time * 0.6) % 1;
    for (let k = 0; k < 14; k++) {
      const z = 1 + (k + 1 - scroll) * 0.45;
      const y = Math.round(HORIZON + (NEAR.y - HORIZON) / z) + 0.5;
      ctx.globalAlpha = Math.min(1, 1.6 / z);
      line(ctx, { x: -10, y }, { x: W + 10, y });
    }
    ctx.globalAlpha = 0.7;
    for (let i = -8; i <= 8; i++) {
      line(ctx, { x: VP_X, y: HORIZON }, { x: NEAR.x + i * 70, y: NEAR.y + 40 });
    }
    ctx.globalAlpha = 1;

    // Pillars with torches line the corridor, far to near.
    for (const z of [MAX_Z, 4.4, 3.2, 2.3, 1.6]) {
      const p = project(z);
      for (const side of [-1, 1]) {
        const x = p.x + side * 230 / z;
        const w = 22 / z;
        const h = 130 / z;
        ctx.fillStyle = th.pillar;
        ctx.fillRect(x - w / 2, p.y - h, w, h);
        ctx.fillStyle = '#000000';
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x + (side < 0 ? w / 4 : -w / 2), p.y - h, w / 4, h);
        ctx.globalAlpha = 1;
        const flicker = 0.2 + Math.sin(this.time * 9 + z * 3 + side) * 0.05;
        glow(ctx, x, p.y - h * 0.75, 50 / z, '#ffb347', flicker);
        ctx.fillStyle = '#ffd36b';
        ctx.fillRect(x - 2 / z, p.y - h * 0.75 - 6 / z, Math.max(1, 4 / z), Math.max(2, 7 / z));
      }
    }

    // Distance fog hides the vanishing point.
    const fog = ctx.createLinearGradient(0, HORIZON - 20, 0, HORIZON + 50);
    fog.addColorStop(0, `rgba(${th.fog}, 0)`);
    fog.addColorStop(0.4, `rgba(${th.fog}, 0.85)`);
    fog.addColorStop(1, `rgba(${th.fog}, 0)`);
    ctx.fillStyle = fog;
    ctx.fillRect(-10, HORIZON - 20, W + 20, 70);
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

    this.drawWeapons(ctx);

    // Auto-sweep meter + coins.
    const full = this.sweep >= SWEEP_MAX;
    ctx.fillStyle = '#00000088';
    ctx.fillRect(W - 110, 74, 104, 10);
    ctx.fillStyle = full ? (Math.floor(this.time * 6) % 2 ? '#26c6da' : '#e0f7fa') : '#26c6da';
    ctx.fillRect(W - 108, 76, (100 * this.sweep) / SWEEP_MAX, 6);
    text(ctx, full ? 'Q: SWEEP!' : 'SWEEP', W - 110, 88, full ? '#e0f7fa' : '#607d8b');
    text(ctx, `${this.stats.coins} G`, W - 110, 100, '#ffd36b');

    // Category bar: keys 1..N, Byte's pick glows.
    const cats = this.chore.categories;
    const w = W / cats.length;
    cats.forEach((c, i) => {
      const x = i * w;
      const suggested = target?.suggestion.category === c.id;
      const glowA = suggested ? 0.6 + Math.sin(this.time * 10) * 0.4 : 0;
      ctx.fillStyle = '#14141f';
      ctx.fillRect(x + 2, BAR_Y, w - 4, H - BAR_Y - 2);
      ctx.strokeStyle = suggested ? `rgba(255,255,255,${glowA})` : c.color;
      ctx.lineWidth = suggested ? 2 : 1;
      ctx.strokeRect(x + 3, BAR_Y + 1, w - 6, H - BAR_Y - 4);
      ctx.fillStyle = c.color;
      ctx.fillRect(x + 6, BAR_Y + 5, 14, 14);
      text(ctx, String(i + 1), x + 9, BAR_Y + 8, '#000000');
      text(ctx, fit(c.label, 9), x + 6, BAR_Y + 26, suggested ? '#ffffff' : c.color);
    });
  }

  /** Weapon slots Z / X / C. Locked slots are dimmed; the rail shows its recharge. */
  drawWeapons(ctx) {
    WEAPONS.forEach((wpn, i) => {
      const x = 6 + i * 24;
      const owned = this.owned[wpn.id];
      const active = wpn.id === this.weapon;
      ctx.fillStyle = active ? '#06102a' : '#00000088';
      ctx.fillRect(x, 74, 22, 22);
      ctx.strokeStyle = active ? wpn.color : '#2b3460';
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(x + 0.5, 74.5, 21, 21);
      ctx.globalAlpha = owned ? 1 : 0.25;
      ctx.fillStyle = wpn.color;
      ctx.fillRect(x + 5, 83, 12, 4);
      ctx.fillRect(x + 5, 87, 4, 4);
      text(ctx, wpn.key.toUpperCase(), x + 7, 76, '#e8e6f0');
      ctx.globalAlpha = 1;
      if (wpn.id === 'rail' && owned && this.railCooldown > 0) {
        const max = weaponStats('rail', owned).cooldown;
        ctx.fillStyle = '#000000aa';
        ctx.fillRect(x + 1, 75, 20, 20 * (this.railCooldown / max));
      }
    });
    const wpn = getWeapon(this.weapon);
    text(ctx, `${wpn.name} Lv${this.owned[this.weapon]}`, 6, 100, wpn.color);
  }
}

/** The side-view arena backdrop (sky, stars, ground) used by the landing cutscene. */
export function drawArena(ctx, choreId, time, bottom = BAR_Y) {
  const th = THEMES[choreId] ?? THEMES.files;
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, th.skyTop);
  sky.addColorStop(1, th.skyBottom);
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

function line(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function shadow(ctx, x, y, rx) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
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
