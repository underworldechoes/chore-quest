# Chore Quest

**Play the game. The chores do themselves.**

Chore Quest is a fast 2D pixel arcade game where every enemy is one of your **real** chores.
Zapping a Clutter Slime moves a real file into the right folder. Zapping a Receipt Goblin files a real
bank transaction into a category. When the wave ends, the chore is done.

Your companion **Byte** is the smart assistant. It guesses each item, learns from your corrections,
sizes the session to the time you have, and handles the easy items for you.

## The world

You dive in at **Lanternfall**, a quiet, rain-soaked, lantern-lit hub town (all art is procedural pixel art, no asset files).
Walk with `A`/`D`, or click a gate to walk to it. Each **quest gate** leads to a chore. Byte hovers over the
gate it recommends. The **Guild Board** shows your totals. Real work earns **XP and levels**
(Wanderer, Tidy Squire, Clutter Hunter and up), shown in game-system windows: quest accepted, quest complete, level up.

## Quests

| Quest | Real input | What actually happens |
|---|---|---|
| **Folder Dungeon** | Any folder (e.g. Downloads) via the File System Access API | Files get moved into `Images/ Docs/ Media/ Archives/ Dupes/ Misc/`. Byte detects duplicates by SHA-256 and sends them to `Dupes/` (it never deletes anything). You can **undo all** moves at the end. |
| **Expense Swamp** | A bank-statement CSV (common header names are recognised) | Each transaction gets a category. You download `expenses_categorised.csv` and a report that flags **recurring subscriptions** (with yearly cost), **possible double charges** and **unusually large** spends. |

Both quests also have a **Demo** mode with sample data, so you can try them without touching your files.

## How Byte decides (the smart assistant)

All of Byte's logic is in pure, unit-tested functions in [`src/assistant/`](src/assistant):

- **Classification with confidence.** Rules (extensions, filename hints, merchant keywords) give a category, a confidence and a reason that is shown in the game. Conflicting signals, like `receipt_scan.png`, lower the confidence.
- **Learning from the user.** When you pick something other than Byte's suggestion, Byte saves your preference (`.parquet → Docs`, `blue tokai → Food`) in `localStorage`. It only trusts a preference once it holds a clear 60% majority.
- **Context-aware planning.** You say how much time you have (5, 15 or 30 min). Byte uses your past pace (a moving average of items per minute) to split a huge backlog into a wave you can finish. For example: "5000 items is a lot. Let's clear 150 now and save 4850 for next time." Late at night it keeps sessions short.
- **Chore recommendation.** Byte suggests which quest to start, based on what you neglected longest and what fits your time.
- **Dynamic difficulty.** Enemies speed up as your combo and agreement grow. They **slow down when Byte is unsure**, which gives you time to think on hard calls.
- **Auto-Sweep.** Agreeing with Byte fills a meter. Press **Q** and Byte resolves every on-screen item it is at least 90% sure of.
- **Safe defaults.** If an enemy reaches you, it is *skipped* and the item stays untouched. Files are moved, never deleted, and every move is logged so it can be undone.

## Controls

| Key | Action |
|---|---|
| `A`/`D`, click | Walk around town (click a gate to walk in) |
| `W` / `E` | Enter the gate you're standing at |
| `1`–`6` / click a bin | Zap the targeted enemy into that category |
| `Space` / `Enter` / click the field | Accept Byte's suggestion |
| `Q` | Auto-Sweep (when the meter is full) |
| `Esc` | End the run (anything you didn't zap stays untouched) |

## Run it

No build step and no dependencies. It is plain ES modules.

```bash
python -m http.server 5173
```

Then open http://localhost:5173 in **Chrome or Edge**. Real folder sorting needs the File System Access API; the CSV quest and the demos work in any modern browser.

```bash
npm test
```

This runs 21 unit tests (Node 18+ built-in test runner) covering the classifiers, the CSV parser, expense analysis, the assistant's planning and difficulty logic, progression, and memory.

## Architecture

```
src/
  main.js                 screen flow: title → town → quest window → story → battle → results → town
  assistant/
    assistant.js          Byte's decisions: recommend, plan, difficulty, commentary (pure)
    memory.js             learned preferences + play history (storage injected)
  chores/
    registry.js           the chore plugin contract
    files/                classifier.js (pure) + index.js (File System Access / demo backend)
    expenses/             csv.js + analyzer.js (pure) + index.js (CSV input, report output)
  game/
    town.js               Lanternfall hub: walkable side-scroller with quest gates
    game.js               the battle loop; talks only to a chore session
    progression.js        XP → level/title (pure)
    draw.js               shared canvas UI helpers
    sprites.js            procedural pixel art (no asset files)
    audio.js              WebAudio blips
tests/                    node:test suites for all pure logic
```

The game engine knows nothing about files or money. It only calls `session.suggest`, `session.apply`
and `session.finish`. To add a new chore (an inbox `.mbox`, an ESLint JSON report, etc.), write one
module that follows the contract in [`src/chores/registry.js`](src/chores/registry.js) and add it to `CHORES`.
