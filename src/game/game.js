// The battle loop. It knows nothing about files or money: it only talks to a chore `session`.
// Enemies advance along a 2.5D perspective corridor; game logic runs on a flat "distance" axis
// plus a sideways lane, and only rendering projects it into depth.
import { SPRITES, HERO_PALETTE, BYTE_PALETTE, enemyPalette, drawSprite } from './sprites.js';
import { enemySpeed, spawnInterval, canAutoSweep, commentary, repeatRatio } from '../assistant/assistant.js';
import { WEAPONS, getWeapon, weaponStats, extraTargets, coinsFor } from './arsenal.js';
import { newMotion, stepMotion, planWave, bossColor } from './encounters.js';
import { getBlade } from './blades.js';
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

// Distance axis: enemies spawn at SPAWN_X and reach the front line at SKIP_X.
const SPAWN_X = W + 10;
const SKIP_X = HERO_X + 26;

// Perspective: vanishing point, the near end of the lane, and how wide the corridor is.
const HORIZON = 96;
const VP_X = 300;
const NEAR = { x: 150, y: 216 };
const MAX_Z = 6;
const LANE_HALF = 120;

// The wanderer can strafe across the corridor and step a little way into it.
const HERO_MIN_Z = 1;
const HERO_MAX_Z = 1.5;
const HERO_STRAFE = 1.9;
const HERO_STEP = 0.6;
const HIT_WIDTH = 0.32;
const HIT_COIN_PENALTY = 2;

const THEMES = {
  files: { skyTop: '#07091a', skyBottom: '#24204a', floor: '#120f26', grid: '#3b2f6b', pillar: '#1a1838', fog: '36, 32, 74' },
  expenses: { skyTop: '#06140f', skyBottom: '#173a2c', floor: '#0b1a14', grid: '#1f5a40', pillar: '#12261d', fog: '23, 58, 44' },
};

/** Project depth z (1 = front line) and sideways lane (-1..1) onto the screen. */
function project(z, lane = 0) {
  return {
    x: VP_X + (NEAR.x - VP_X) / z + (lane * LANE_HALF) / z,
    y: HORIZON + (NEAR.y - HORIZON) / z,
    scale: 3 / z,
  };
}

const depthOf = (x) => 1 + ((x - SKIP_X) / (SPAWN_X - SKIP_X)) * (MAX_Z - 1);
const xOfDepth = (z) => SKIP_X + ((z - 1) / (MAX_Z - 1)) * (SPAWN_X - SKIP_X);

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{session, chore, items, memory, arsenal, blade, onEquip:(id)=>void, onEnd:(results, stats)=>void}} opts
   */
  constructor(canvas, { session, chore, items, memory, arsenal, blade, onEquip, onEnd }) {
    this.ctx = canvas.getContext('2d');
    this.canvas = canvas;
    this.session = session;
    this.chore = chore;
    this.memory = memory;
    this.onEquip = onEquip;
    this.onEnd = onEnd;
    this.items = items;
    const wave = planWave(items, (it) => session.bossHp?.(it) ?? 1);
    this.queue = [...wave.items];
    this.bossHp = wave.hp;
    this.finalItem = wave.finalItem;
    this.total = items.length;
    this.theme = THEMES[chore.id] ?? THEMES.files;
    this.blade = getBlade(blade);

    this.owned = arsenal.owned;
    this.weapon = arsenal.equipped;
    this.railCooldown = 0;

    this.hero = { lane: 0, z: HERO_MIN_Z, hurt: 0 };
    this.held = { left: false, right: false, up: false, down: false };

    this.enemies = [];
    this.bolts = [];
    this.particles = [];
    this.results = [];
    this.pending = new Set();
    this.stats = {
      agree: 0, override: 0, skipped: 0, bestCombo: 0, coins: 0, hits: 0, dodges: 0, bosses: 0, finalBosses: 0,
      startedAt: performance.now(),
    };
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
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onPointer = this.onPointer.bind(this);
    this.frame = this.frame.bind(this);
  }

  start() {
    this.running = true;
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('pointerdown', this.onPointer);
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
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

  static MOVE_KEYS = {
    arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
  };

  onKey(e) {
    const k = e.key.toLowerCase();
    const move = Game.MOVE_KEYS[k];
    if (move) { e.preventDefault(); this.held[move] = true; return; }
    const n = parseInt(e.key, 10);
    const weapon = WEAPONS.find((w) => w.key === k);
    if (n >= 1 && n <= this.chore.categories.length) this.decide(this.chore.categories[n - 1].id);
    else if (weapon) this.equip(weapon.id);
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.acceptSuggestion(); }
    else if (k === 'q') this.autoSweep();
    else if (e.key === 'Escape') this.finish();
  }

  onKeyUp(e) {
    const move = Game.MOVE_KEYS[e.key.toLowerCase()];
    if (move) this.held[move] = false;
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
    if (t) this.decide(t.lockedCategory ?? t.suggestion.category);
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
   * Bosses lock in the first category they're hit with and only act once their HP runs out.
   * A primary shot may also hit extra enemies, depending on the equipped weapon.
   */
  decide(categoryId, enemy = this.target, primary = true) {
    if (!categoryId || !enemy || enemy.state !== 'walk') return;
    const weaponId = primary ? this.firingWeapon() : 'blaster';
    this.castTimer = 0.15;

    if (enemy.hp > 1) {
      enemy.lockedCategory ??= categoryId;
      enemy.hp--;
      enemy.flash = 0.15;
      enemy.x = Math.min(SPAWN_X, enemy.x + 10);
      this.bolts.push({ enemy, color: this.categoryColor(enemy.lockedCategory), t: 0, beam: weaponId === 'rail', kill: false });
      sfx.zap();
      if (primary) this.say(`${enemy.final ? 'FINAL BOSS' : 'BOSS'} hit! ${enemy.hp} HP left.`, 1.2);
      return;
    }

    categoryId = enemy.lockedCategory ?? categoryId;
    enemy.state = 'zapped';
    const agreed = categoryId === enemy.suggestion.category;

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
    if (enemy.maxHp > 1) {
      this.stats.bosses++;
      if (enemy.final) this.stats.finalBosses++;
      this.say(enemy.final ? 'FINAL BOSS DOWN! The wave is clear.' : 'Boss down!', 2);
    }

    this.bolts.push({ enemy, color: this.categoryColor(categoryId), t: 0, beam: weaponId === 'rail', kill: true });

    const level = this.owned[this.weapon] ?? 1;
    const job = this.session.apply(enemy.item, categoryId)
      .then(() => {
        this.results.push({ item: enemy.item, category: categoryId, agreed });
        this.stats.coins += coinsFor({ weaponId: this.weapon, level, combo: this.combo }) * enemy.maxHp;
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

  categoryColor(id) {
    return this.chore.categories.find((c) => c.id === id).color;
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
    this.moveHero(dt);

    this.spawnTimer -= dt;
    const alive = this.enemies.filter((e) => e.state === 'walk').length;
    // Never leave a fast player waiting on an empty screen.
    if (alive === 0) this.spawnTimer = Math.min(this.spawnTimer, 0.1);
    if (this.queue.length && this.spawnTimer <= 0 && alive < MAX_ALIVE) {
      this.spawn(this.queue.shift());
      this.spawnTimer = spawnInterval({ combo: this.combo, agreeRate: this.agreeRate });
    }

    const frontLine = xOfDepth(this.hero.z);
    let ahead = -Infinity;
    for (const e of this.enemies) {
      e.flash = Math.max(0, (e.flash ?? 0) - dt);
      if (e.state !== 'walk') continue;
      const pace = stepMotion(e.motion, this.time, dt);
      const speed = enemySpeed({ combo: this.combo, agreeRate: this.agreeRate, confidence: e.suggestion.confidence });
      e.x = Math.max(e.x - speed * pace * dt, ahead + SPACING);
      ahead = e.x;
      if (e.x <= frontLine) this.reachFrontLine(e);
      e.bob += dt * 8 * e.motion.speedMul;
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
        const p = this.screenPos(b.enemy);
        this.burst(p.x, p.y - 8 * p.scale, b.color, p.scale);
        if (b.kill) b.enemy.state = 'dead';
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
    this.hero.hurt = Math.max(0, this.hero.hurt - dt);
    this.shake = Math.max(0, this.shake - dt * 20);
    if (this.message) this.message.ttl -= dt;

    if (!this.queue.length && !this.enemies.length && !this.pending.size) this.finish();
  }

  moveHero(dt) {
    const { held, hero } = this;
    const strafe = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    const step = (held.up ? 1 : 0) - (held.down ? 1 : 0);
    hero.lane = Math.max(-1, Math.min(1, hero.lane + strafe * HERO_STRAFE * dt));
    hero.z = Math.max(HERO_MIN_Z, Math.min(HERO_MAX_Z, hero.z + step * HERO_STEP * dt));
    hero.moving = strafe !== 0 || step !== 0;
  }

  /**
   * An enemy that reaches you is left untouched in the real world either way.
   * Dodge it and your combo survives; get hit and you lose the combo and a few coins.
   */
  reachFrontLine(enemy) {
    enemy.state = 'dead';
    this.results.push({ item: enemy.item, category: null });
    this.stats.skipped++;
    if (Math.abs(enemy.motion.lane - this.hero.lane) < HIT_WIDTH * (enemy.maxHp > 1 ? 1.5 : 1)) {
      this.stats.hits++;
      this.combo = 0;
      this.stats.coins = Math.max(0, this.stats.coins - HIT_COIN_PENALTY);
      this.hero.hurt = 0.4;
      this.shake = 6;
      sfx.skip();
      this.say('Ouch! Dodge with A/D or the arrow keys. (It stays untouched.)', 2);
    } else {
      this.stats.dodges++;
      sfx.agree();
      this.say('Dodged! Combo kept. (It stays untouched.)');
    }
  }

  /** Byte's heads-up when a new target arrives: bosses, low confidence, or a group the Rail Lance could clear. */
  announce(t) {
    if (t.maxHp > 1) {
      const kind = t.final ? 'FINAL BOSS' : 'BOSS';
      this.say(`${kind}: ${fit(t.item.label, 22)} (${t.item.sublabel.trim()}). ${t.maxHp} hits!`, 2.5);
      return;
    }
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
    const hp = this.bossHp.get(item) ?? 1;
    const final = item === this.finalItem;
    this.enemies.push({
      item, suggestion, hp, maxHp: hp, final,
      x: SPAWN_X, bob: Math.random() * 6, state: 'walk',
      motion: newMotion(Math.random, { boss: hp > 1 }),
      baseColor: this.categoryColor(suggestion.category),
    });
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
    return project(depthOf(enemy.x), enemy.motion.lane);
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
    const heroPos = project(this.hero.z, this.hero.lane);
    const heroPx = Math.max(2, Math.round(heroPos.scale));

    // Painter's algorithm: far things first; the hero is drawn when the enemies behind it are done.
    const enemies = [...this.enemies].sort((a, b) => b.x - a.x);
    const heroX = xOfDepth(this.hero.z);
    let heroDrawn = false;
    for (const e of enemies) {
      if (!heroDrawn && e.x < heroX) { this.drawHero(ctx, heroPos, heroPx); heroDrawn = true; }
      this.drawEnemy(ctx, e, enemySprite, spriteW, e === target);
    }
    if (!heroDrawn) this.drawHero(ctx, heroPos, heroPx);

    const gun = { x: heroPos.x + 6 * heroPx, y: heroPos.y - 4 * heroPx - 8 };
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

  drawEnemy(ctx, e, sprite, spriteW, isTarget) {
    const p = this.screenPos(e);
    const bossScale = e.maxHp > 1 ? 1 + (e.maxHp - 1) * 0.22 : 1;
    const px = Math.max(1, Math.round(p.scale * bossScale));
    const hop = Math.abs(Math.sin(e.bob)) * (e.motion.kind === 'dash' ? 4 : 2) * p.scale;
    const w = spriteW * px;
    const top = p.y - sprite.length * px - hop;

    shadow(ctx, p.x, p.y, w * 0.45);
    if (e.maxHp > 1) {
      const aura = bossColor(e.baseColor, e.hp, e.maxHp, e.final);
      glow(ctx, p.x, top + (sprite.length * px) / 2, w * (e.final ? 1.3 : 0.9), aura, 0.35 + Math.sin(this.time * 6) * 0.1);
    }
    const color = e.flash > 0 ? '#ffffff' : e.maxHp > 1 ? bossColor(e.baseColor, e.hp, e.maxHp, e.final) : e.baseColor;
    ctx.globalAlpha = Math.min(1, 0.35 + p.scale / 2);
    drawSprite(ctx, sprite, enemyPalette(color), p.x - w / 2, top, px);
    ctx.globalAlpha = 1;

    if (e.maxHp > 1) {
      const bw = Math.max(16, w);
      ctx.fillStyle = '#000000aa';
      ctx.fillRect(p.x - bw / 2, top - 7, bw, 4);
      ctx.fillStyle = bossColor(e.baseColor, e.hp, e.maxHp, e.final);
      ctx.fillRect(p.x - bw / 2 + 1, top - 6, ((bw - 2) * e.hp) / e.maxHp, 2);
    }
    if (isTarget) {
      const ay = top - (e.maxHp > 1 ? 16 : 10) + Math.sin(this.time * 6) * 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x - 2, ay, 5, 2); ctx.fillRect(p.x - 1, ay + 2, 3, 2); ctx.fillRect(p.x, ay + 4, 1, 1);
    }
  }

  drawHero(ctx, pos, px) {
    const sprite = this.castTimer > 0 ? SPRITES.heroCast : this.hero.moving && Math.floor(this.time * 8) % 2 ? SPRITES.heroWalk : SPRITES.hero;
    const x = pos.x - 6 * px;
    shadow(ctx, pos.x, pos.y, 6 * px);
    if (this.hero.hurt > 0 && Math.floor(this.time * 20) % 2) ctx.globalAlpha = 0.4;
    drawSprite(ctx, sprite, HERO_PALETTE, x, pos.y - sprite.length * px, px);
    const lunge = this.castTimer > 0 ? 2 * px : 0;
    drawSprite(ctx, this.blade.shape, this.blade.palette, x + 9 * px + lunge, pos.y - 7 * px, Math.max(1, px - 1));
    ctx.globalAlpha = 1;
    drawSprite(ctx, SPRITES.byte, BYTE_PALETTE, x + 15 * px, pos.y - 25 * px + Math.sin(this.time * 3) * 3, 2);
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
      const cat = this.chore.categories.find((c) => c.id === (target.lockedCategory ?? s.category));
      const boss = target.maxHp > 1 ? `${target.final ? 'FINAL BOSS' : 'BOSS'} ${target.hp}/${target.maxHp} ` : '';
      text(ctx, fit(target.item.label, 40), 10, 10, '#ffffff');
      text(ctx, `${boss}${target.item.sublabel}`, 10, 22, boss ? bossColor(target.baseColor, target.hp, target.maxHp, target.final) : '#b0bec5');
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

    // Category bar: keys 1..N, Byte's pick (or a boss's locked bin) glows.
    const cats = this.chore.categories;
    const w = W / cats.length;
    const highlight = target?.lockedCategory ?? target?.suggestion.category;
    cats.forEach((c, i) => {
      const x = i * w;
      const suggested = highlight === c.id;
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
