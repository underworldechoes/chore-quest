// Byte, the companion AI. All decision logic lives here as pure functions of the user's context.

export const DEFAULT_PACE = 25; // items per minute before we know the player
export const AUTO_SWEEP_CONFIDENCE = 0.9;

const isLateNight = (hour) => hour >= 23 || hour < 5;

/**
 * Pick which chore to tackle first.
 * Prefers chores that fit the time the user has and haven't been touched recently.
 */
export function recommendChore(chores, { minutes, hour, history, now = Date.now() }) {
  const scored = chores.map((chore) => {
    const h = history(chore.id);
    const daysSince = h.lastRun ? (now - h.lastRun) / 86_400_000 : 30;
    let score = Math.min(daysSince, 30);
    // Expense review is short and high value; folder cleanup rewards longer sessions.
    if (chore.id === 'expenses' && minutes <= 5) score += 10;
    if (chore.id === 'files' && minutes >= 10) score += 8;
    return { chore, score, daysSince };
  });
  scored.sort((a, b) => b.score - a.score);
  const { chore, daysSince } = scored[0];

  let why;
  if (daysSince >= 30) why = `you've never cleared the ${chore.title}`;
  else if (daysSince < 1) why = `it fits ${minutes} min best`;
  else why = `it's been ${Math.round(daysSince)} day(s)`;
  if (isLateNight(hour)) why += '. It\'s late, so we\'ll keep it short';
  return { choreId: chore.id, message: `I'd start with ${chore.title}: ${why}.` };
}

/**
 * Size the session to the user's available time, using their historical pace.
 * Big backlogs are split into waves so the chore never feels endless.
 */
export function planSession({ itemCount, minutes, hour, pace }) {
  const effectiveMinutes = isLateNight(hour) ? Math.min(minutes, 5) : minutes;
  const itemsPerMinute = pace ?? DEFAULT_PACE;
  const capacity = Math.max(5, Math.round(itemsPerMinute * effectiveMinutes));
  const waveSize = Math.min(itemCount, capacity);
  const estMinutes = Math.max(1, Math.round(waveSize / itemsPerMinute));
  const remaining = itemCount - waveSize;

  const message = remaining > 0
    ? `${itemCount} items is a lot. Let's clear ${waveSize} now (~${estMinutes} min) and save ${remaining} for next time.`
    : `${itemCount} items, about ${estMinutes} min at your pace. Let's go!`;
  return { waveSize, estMinutes, message };
}

/**
 * Dynamic difficulty: speed up when the player is fast and agrees with Byte,
 * slow down for low-confidence items so the human has time to think.
 */
export function enemySpeed({ combo, agreeRate, confidence, base = 38 }) {
  const comboBoost = 1 + Math.min(combo, 30) * 0.03;
  const trustBoost = 0.8 + agreeRate * 0.4;
  const doubtSlowdown = confidence < 0.6 ? 0.55 : 1;
  return base * comboBoost * trustBoost * doubtSlowdown;
}

export function spawnInterval({ combo, agreeRate }) {
  return Math.max(0.45, 1.6 - Math.min(combo, 30) * 0.03 - agreeRate * 0.3);
}

export function canAutoSweep(suggestion) {
  return suggestion.confidence >= AUTO_SWEEP_CONFIDENCE;
}

/**
 * Gear advice based on how the player actually plays.
 * Repetitive backlogs (many same-type files / same merchant) favour the Rending Lance;
 * players who trust Byte get the most out of the Chain Cleave.
 */
export function recommendWeapon(lastRun) {
  if (lastRun?.agreeRate == null) return { weaponId: 'blaster', reason: "Clear a quest first and I'll study your style." };
  const pct = (n) => Math.round(n * 100);
  if ((lastRun.repeatRatio ?? 0) >= 0.3) {
    return { weaponId: 'rail', reason: `${pct(lastRun.repeatRatio)}% of your last backlog came in same-kind groups. A Rending Lance clears a group in one strike.` };
  }
  if ((lastRun.agreeRate ?? 0) >= 0.8) {
    return { weaponId: 'scatter', reason: `You agreed with me ${pct(lastRun.agreeRate)}% of the time. A Chain Cleave turns that trust into multi-hits.` };
  }
  return { weaponId: 'blaster', reason: 'You correct me a lot, so precision matters. Upgrade the Swift Strike for bigger bounties.' };
}

/** Share of items that belong to a group of 3+ with the same learn key. */
export function repeatRatio(items, keyOf) {
  if (!items.length) return 0;
  const counts = {};
  for (const it of items) {
    const k = keyOf(it);
    if (k) counts[k] = (counts[k] ?? 0) + 1;
  }
  const grouped = items.filter((it) => (counts[keyOf(it)] ?? 0) >= 3).length;
  return grouped / items.length;
}

/** Short reactive lines so Byte feels alive. */
export function commentary(event, ctx = {}) {
  switch (event) {
    case 'agree': return pick(['Nice!', 'Exactly what I thought.', 'Clean!', 'Sorted.']);
    case 'override': return `Noted. I'll remember that for ${ctx.key ?? 'next time'}.`;
    case 'unsure': return `Hmm, not sure about this one (${ctx.reason}). Your call!`;
    case 'combo': return `${ctx.combo} combo! The clutter fears you.`;
    case 'sweep': return `AUTO-SWEEP! I handled ${ctx.count} easy ones.`;
    case 'skip': return 'Skipped. It stays where it was. No harm done.';
    case 'rail': return `${ctx.count} of the same kind on screen! Rending Lance [C] gets them all.`;
    case 'weapon': return `${ctx.name} equipped.`;
    case 'cooldown': return 'Rending Lance recharging... striking normally.';
    case 'error': return `Ouch, couldn't do that: ${ctx.message}`;
    default: return '';
  }
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
