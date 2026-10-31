// The story quest, "The Clutter King". Chapters complete from real progress, never from button presses.
// Pure: a chapter's check reads a progress snapshot, so the whole storyline is unit tested.

export const CHAPTERS = [
  {
    id: 'stirring',
    title: 'Ch.1 The Hoard Stirs',
    goal: 'Clear 10 items in the Folder Dungeon',
    check: (p) => p.filesDone >= 10,
    reward: 40,
    epilogue: 'BYTE: The Hoard Well is quieter now. But something below is still hoarding... and it keeps receipts.',
  },
  {
    id: 'ledger',
    title: 'Ch.2 Debts of the Mire',
    goal: 'Clear 10 items in the Expense Swamp',
    check: (p) => p.expensesDone >= 10,
    reward: 40,
    epilogue: 'BYTE: Every coin accounted for. The goblins whisper one name: the Clutter King.',
  },
  {
    id: 'weight',
    title: 'Ch.3 The Weight of Things',
    goal: 'Slay a boss (a big file or a big spend)',
    check: (p) => p.bossesSlain >= 1,
    reward: 60,
    epilogue: 'BYTE: The heavy ones fall too. The Forge keeper says steel alone won\'t be enough.',
  },
  {
    id: 'forge',
    title: 'Ch.4 Steel of the Forge',
    goal: 'Own two guns from the Armory',
    check: (p) => p.gunsOwned >= 2,
    reward: 60,
    epilogue: 'BYTE: Armed and organised. The King waits at the end of every wave.',
  },
  {
    id: 'king',
    title: 'Ch.5 The Clutter King',
    goal: 'Defeat a FINAL BOSS and reach Lv3',
    check: (p) => p.finalBossesSlain >= 1 && p.level >= 3,
    reward: 150,
    epilogue: 'BYTE: The Clutter King is dust. Lanternfall sleeps soundly... until the Downloads folder fills again.',
  },
];

/** Every chapter with its status. Chapters unlock in order; the first unfinished one is "active". */
export function storyLog(progress, claimed) {
  let activeFound = false;
  return CHAPTERS.map((ch) => {
    const done = claimed.includes(ch.id);
    let status = done ? 'done' : 'locked';
    if (!done && !activeFound) { status = 'active'; activeFound = true; }
    return { ...ch, status };
  });
}

/** Chapters completed by the latest progress, in order (a chapter can't be skipped ahead of earlier ones). */
export function newlyCompleted(progress, claimed) {
  const finished = [];
  for (const ch of CHAPTERS) {
    if (claimed.includes(ch.id)) continue;
    if (!ch.check(progress)) break;
    finished.push(ch);
  }
  return finished;
}

export const activeChapter = (progress, claimed) => storyLog(progress, claimed).find((c) => c.status === 'active') ?? null;
