// Screen flow: title -> town -> quest window -> voyage (briefing at warp) -> battle -> results -> town.
// From town you can also visit the armory to buy and upgrade guns.
import { CHORES, getChore } from './chores/registry.js';
import { Memory } from './assistant/memory.js';
import { recommendChore, planSession, recommendWeapon } from './assistant/assistant.js';
import { Game, W, H } from './game/game.js';
import { Town } from './game/town.js';
import { Voyage } from './game/voyage.js';
import { sfx } from './game/audio.js';
import { levelFromXp, xpForRun } from './game/progression.js';
import { WEAPONS, MAX_LEVEL, nextCost, purchase, describeWeapon } from './game/arsenal.js';

const memory = new Memory();
const $ = (sel) => document.querySelector(sel);
const canvas = $('#game');
canvas.width = W;
canvas.height = H;

const state = { minutes: 15, townX: 90, visitedTown: false };

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  canvas.classList.toggle('dim', !['play', 'town', 'voyage', 'story'].includes(id));
}

function recommendation() {
  return recommendChore(CHORES, {
    minutes: state.minutes,
    hour: new Date().getHours(),
    history: (id) => memory.history(id),
  });
}

function progress() {
  const totalCleared = CHORES.reduce((sum, c) => sum + memory.history(c.id).itemsDone, 0);
  return { ...levelFromXp(memory.xp), totalCleared, coins: memory.arsenal.coins };
}

// ---------- town ----------

function enterTown() {
  show('town');
  const town = new Town(canvas, {
    chores: CHORES,
    recommendedId: recommendation().choreId,
    progress: progress(),
    startX: state.townX,
    showTitle: !state.visitedTown,
    onEnter: (choreId, x) => { state.townX = x; openGate(choreId); },
    onArmory: (x) => { state.townX = x; openArmory(); },
  });
  state.visitedTown = true;
  document.fonts.ready.then(() => town.start());
}

// ---------- quest window ----------

function openGate(choreId) {
  const chore = getChore(choreId);
  const rec = recommendation();
  const h = memory.history(chore.id);

  $('#gate-title').textContent = chore.title;
  $('#gate-blurb').textContent = chore.blurb;
  $('#gate-history').textContent = h.runs
    ? `Cleared ${h.itemsDone} so far · your pace ${Math.round(h.pace)} items/min`
    : 'Uncharted: never attempted';
  $('#byte-advice').textContent = rec.choreId === chore.id
    ? rec.message
    : `${rec.message} But this quest is fine too.`;

  document.querySelectorAll('[data-minutes]').forEach((b) => {
    b.classList.toggle('selected', Number(b.dataset.minutes) === state.minutes);
    b.onclick = () => { state.minutes = Number(b.dataset.minutes); openGate(choreId); };
  });

  const real = $('#gate-real');
  real.textContent = chore.realLabel;
  real.disabled = !chore.supportsReal();
  real.title = real.disabled ? 'Needs Chrome or Edge' : '';
  real.onclick = () => launch(chore.id, 'real');
  $('#gate-demo').onclick = () => launch(chore.id, 'demo');
  show('gate');
}

$('#gate-back').addEventListener('click', enterTown);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ['gate', 'armory'].some((id) => $(`#${id}`).classList.contains('active'))) enterTown();
});

// ---------- armory ----------

function openArmory(notice = '') {
  const arsenal = memory.arsenal;
  const advice = recommendWeapon(memory.lastRun());
  const advised = WEAPONS.find((w) => w.id === advice.weaponId);
  $('#armory-coins').textContent = `${arsenal.coins} G`;
  $('#armory-advice').textContent = notice || `${advised.name}: ${advice.reason}`;

  $('#weapons').replaceChildren(...WEAPONS.map((w) => {
    const level = arsenal.owned[w.id];
    const cost = nextCost(arsenal, w.id);
    const row = document.createElement('article');
    row.className = `weapon${w.id === advice.weaponId ? ' recommended' : ''}`;
    row.style.setProperty('--wpn', w.color);
    row.innerHTML = `
      <div class="weapon-head">
        <h3>${w.name} <span class="muted">[${w.key.toUpperCase()}]</span></h3>
        <span class="lv">${level ? `Lv${level}/${MAX_LEVEL}` : 'LOCKED'}</span>
      </div>
      <p>${w.blurb}</p>
      <p class="muted">${describeWeapon(w.id, level || 1)}${level && level < MAX_LEVEL ? ` → next: ${describeWeapon(w.id, level + 1)}` : ''}</p>
      <div class="row"></div>`;
    const actions = row.querySelector('.row');
    if (cost !== null) {
      const buy = Object.assign(document.createElement('button'), {
        className: 'btn', textContent: `${level ? 'Upgrade' : 'Buy'} · ${cost} G`, disabled: arsenal.coins < cost,
      });
      buy.addEventListener('click', () => {
        memory.arsenal = purchase(memory.arsenal, w.id);
        sfx.sweep();
        openArmory(`[SYSTEM] ${w.name} is now Lv${memory.arsenal.owned[w.id]}!`);
      });
      actions.append(buy);
    }
    if (level) {
      const equipped = arsenal.equipped === w.id;
      const equip = Object.assign(document.createElement('button'), {
        className: 'btn ghost', textContent: equipped ? 'Equipped' : 'Equip', disabled: equipped,
      });
      equip.addEventListener('click', () => { memory.arsenal = { ...memory.arsenal, equipped: w.id }; openArmory(); });
      actions.append(equip);
    }
    return row;
  }));
  show('armory');
}

$('#armory-back').addEventListener('click', enterTown);

// ---------- launch ----------

async function launch(choreId, mode) {
  const chore = getChore(choreId);
  const scoped = memory.scoped(choreId);
  let session;
  try {
    session = await chore.open(mode, scoped);
  } catch (err) {
    if (err.name !== 'AbortError') alert(err.message);
    return;
  }
  if (!session.items.length) {
    alert('Nothing to do here. This folder is already clean!');
    return;
  }

  const plan = planSession({
    itemCount: session.items.length,
    minutes: state.minutes,
    hour: new Date().getHours(),
    pace: memory.history(choreId).pace,
  });
  const items = session.items.slice(0, plan.waveSize);

  // The briefing plays while the ship cruises at warp; the last line triggers the landing.
  const voyage = new Voyage(canvas, { chore });
  show('voyage');
  await voyage.depart();
  await playStory([
    `[SYSTEM] Quest accepted: ${chore.title}`,
    ...chore.story,
    `BYTE: ${plan.message}`,
    'BYTE: Keys 1-6 zap. SPACE trusts me. Q = auto-sweep. ESC = retreat.',
  ]);
  show('voyage');
  await voyage.arrive();
  startGame(chore, session, scoped, items);
}

function playStory(lines) {
  show('story');
  const box = $('#story-text');
  let i = 0;
  return new Promise((resolve) => {
    const next = () => {
      if (i >= lines.length) {
        window.removeEventListener('keydown', onKey);
        $('#story').removeEventListener('click', next);
        resolve();
        return;
      }
      const line = lines[i++];
      box.textContent = line;
      box.classList.toggle('system', line.startsWith('[SYSTEM]'));
    };
    const onKey = (e) => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); next(); } };
    window.addEventListener('keydown', onKey);
    $('#story').addEventListener('click', next);
    next();
  });
}

function startGame(chore, session, scoped, items) {
  show('play');
  const game = new Game(canvas, {
    session, chore, items, memory: scoped,
    arsenal: memory.arsenal,
    onEquip: (id) => { memory.arsenal = { ...memory.arsenal, equipped: id }; },
    onEnd: (results, stats) => showResults(chore, session, results, stats),
  });
  document.fonts.ready.then(() => game.start());
}

// ---------- results ----------

async function showResults(chore, session, results, stats) {
  const done = results.filter((r) => r.category).length;
  const before = levelFromXp(memory.xp);
  const xp = xpForRun({ done, bestCombo: stats.bestCombo, override: stats.override });
  memory.addXp(xp);
  memory.recordRun(chore.id, {
    itemsDone: done, minutes: stats.minutes, agreeRate: stats.agreeRate, repeatRatio: stats.repeatRatio,
  });
  memory.arsenal = { ...memory.arsenal, coins: memory.arsenal.coins + stats.coins };
  const after = levelFromXp(memory.xp);
  const summary = await session.finish(results);
  const decided = stats.agree + stats.override;

  $('#result-title').textContent = `${chore.title} cleared!`;
  $('#result-xp').textContent = after.level > before.level
    ? `+${xp} XP · +${stats.coins} G · LEVEL UP! Lv${after.level} ${after.title}`
    : `+${xp} XP · +${stats.coins} G · Lv${after.level} ${after.title} (${after.needed - after.into} to next)`;
  $('#result-xp').classList.toggle('levelup', after.level > before.level);
  $('#result-stats').innerHTML = `
    <div><b>${done}</b><span>real ${chore.id === 'files' ? 'files sorted' : 'transactions filed'}</span></div>
    <div><b>${stats.bestCombo}</b><span>best combo</span></div>
    <div><b>${decided ? Math.round((stats.agree / decided) * 100) : 0}%</b><span>agreed w/ Byte</span></div>
    <div><b>${stats.override}</b><span>lessons taught</span></div>
    <div><b>${stats.skipped}</b><span>left untouched</span></div>
    <div><b>${stats.minutes.toFixed(1)}m</b><span>time spent</span></div>`;
  $('#result-lines').replaceChildren(...summary.lines.map((l) => Object.assign(document.createElement('li'), { textContent: l })));

  const actions = $('#result-actions');
  actions.replaceChildren();
  for (const d of summary.downloads) {
    const a = Object.assign(document.createElement('a'), {
      className: 'btn', href: URL.createObjectURL(d.blob), download: d.name, textContent: `Download ${d.name}`,
    });
    actions.append(a);
  }
  if (summary.canUndo) {
    const undo = Object.assign(document.createElement('button'), { className: 'btn ghost', textContent: 'Undo all moves' });
    undo.addEventListener('click', async () => {
      undo.disabled = true;
      undo.textContent = 'Restoring...';
      try { await session.undoAll(); undo.textContent = 'Restored'; } catch (e) { undo.textContent = `Undo failed: ${e.message}`; }
    });
    actions.append(undo);
  }
  const back = Object.assign(document.createElement('button'), { className: 'btn ghost', textContent: 'Return to Lanternfall' });
  back.addEventListener('click', enterTown);
  actions.append(back);
  show('results');
}

$('#start').addEventListener('click', enterTown);
show('title');
