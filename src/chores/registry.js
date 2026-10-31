// Every chore implements the same contract, so adding a new one (inbox, lint report...) is one file:
//   { id, title, enemyName, blurb, categories, story, realLabel, supportsReal(), open(mode, memory) -> session }
//   session: { items, sourceName, suggest(item), learnKey(item), bossHp(item), apply(item, cat), finish(results), undoAll?() }
import { filesChore } from './files/index.js';
import { expensesChore } from './expenses/index.js';
import { inboxChore } from './inbox/index.js';

export const CHORES = [filesChore, expensesChore, inboxChore];

export const getChore = (id) => CHORES.find((c) => c.id === id);
