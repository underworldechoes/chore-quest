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

## Guns are batch tools (RPG upgrades)

Real work earns **coins**. At the **Armory** (the forge at the east end of town) you buy and upgrade three guns,
each up to Lv3. Each gun is a different way to batch real chores:

| Gun | Key | What one shot really does | Upgrades |
|---|---|---|---|
| **Pulse Blaster** | `Z` | Handles exactly one item. | Bigger coin bounty (+50%, +100%) |
| **Chain Scatter** | `X` | Also files other on-screen items that Byte is confident belong in the **same bin**. | Chains to 2 / 3 / 5 items; confidence bar 88% / 85% / 80% |
| **Rail Lance** | `C` | Pierces every on-screen item of the **same kind** (same file type / same merchant) and files them all with *your* choice. | Pierces 3 / 5 / 8; cooldown 6s / 4s / 2.5s |

Byte gives gear advice from how you actually play. If your last backlog came in same-kind groups, it suggests the Rail Lance. If you agreed with it 80%+ of the time, it suggests the Chain Scatter. Mid-battle it calls out when 3+ same-kind items are on screen.

## 2.5D battles

Battles take place in a perspective corridor: 2D pixel sprites in a 3D-looking space (a vanishing point, a scrolling floor grid, pillars with torches, distance fog, and enemies that scale up with drop shadows as they approach). It's pure canvas, with no 3D library. The game logic still runs on a flat distance axis, and only the renderer projects it into depth.

## Bosses, movement and dodging

- **Move** with `A`/`D` or the arrow keys (strafe), and `W`/`S` (step forward/back).
- Every enemy gets its own randomized movement (weave, zig-zag, drift, or stop-and-dash) and speed, so no two waves play the same.
- **Big items are bosses.** Files over 10 MB / 50 MB / 200 MB / 1 GB, and spends over ₹2k / ₹5k / ₹10k / ₹20k, take 2 to 5 hits. Their colour shifts to crimson as they lose HP. The real action only happens on the killing blow, using the bin you chose with the first hit.
- **The heaviest item in each wave comes last as the FINAL BOSS** (+1 HP, gold aura).
- An enemy that reaches you is always left untouched. **Dodge** it and your combo survives; get hit and you lose the combo and 2 coins.

## The Summit and the Hermit

East of the Armory, past the lamps, the road climbs a snowy mountain to the **Summit Trail** gate. **The Hermit**, an old archivist with a lantern staff, waits at its foot with advice. The heaviest sender in your inbox waits at the top as the **Frost Wraith**.

Each quest has its own detailed boss sprite: the **Hoard Golem** (files), the **Ledger Wraith** (expenses) and the **Frost Wraith** (email).

## Story quest: The Clutter King

Read the **Guild Board** in town (`W`/`E`) to open the quest log. Five chapters (The Hoard Stirs, Debts of the Mire, The Weight of Things, Steel of the Forge, The Clutter King) complete **only from real progress**: items cleared, bosses slain, guns owned, level reached. Each one pays coins and unlocks the next part of Byte's story. The current goal is always shown in the town HUD.

## Blades

Six original pixel-art swords (Lantern Edge, Tidecutter, Emberfang, Jade Requiem, Voidrend, Dawnbreaker) unlock as you level up. Choose one from the **sliding carousel** in the Armory (buttons, swipe/scroll, or the arrow keys). The equipped blade is drawn in your hand in town and in battle.

## Security

See [SECURITY.md](SECURITY.md). In short: everything stays on the device; files are moved, never deleted, and every move can be undone; there is no `innerHTML`; CSV exports are protected against formula injection; a strict CSP and security headers apply on every host; and there are zero dependencies.

## Quests

| Quest | Real input | What actually happens |
|---|---|---|
| **Folder Dungeon** | Any folder (e.g. Downloads) via the File System Access API | Files get moved into `Images/ Docs/ Media/ Archives/ Dupes/ Misc/`. Byte detects duplicates by SHA-256 and sends them to `Dupes/` (it never deletes anything). You can **undo all** moves at the end. |
| **Expense Swamp** | A bank-statement CSV (common header names are recognised) | Each transaction gets a category. You download `expenses_categorised.csv` and a report that flags **recurring subscriptions** (with yearly cost), **possible double charges** and **unusually large** spends. |
| **Inbox Peak** (Summit Trail) | A Google Takeout email export (`.mbox`), parsed headers-only in the browser | Every Mail Wraith is a **sender**. Zap it into Keep / Receipts / Social / News / Promo / Mute and you download **`gmail-filters.xml`** (import it in Gmail > Settings > Filters) that labels and archives everything from that sender, plus an unsubscribe list. Mail is never deleted and nothing is uploaded. |

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
| `A`/`D`, arrows | Strafe across the corridor (dodge) |
| `W` / `S` | Step forward / back |
| `Z` / `X` / `C` | Switch gun (if owned) |
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

This runs 42 unit tests (Node 18+ built-in test runner) covering the classifiers, the CSV parser, expense analysis, the assistant's planning and difficulty logic, progression, and memory.

## Deploy to Google Cloud Run

The repo ships a `Dockerfile` (nginx serving the static files on `$PORT`). From the project folder, or from Cloud Shell after cloning:

```bash
gcloud run deploy chore-quest --source . --region asia-south1 --allow-unauthenticated
```

Cloud Run builds the image and prints a `https://chore-quest-....run.app` URL. HTTPS matters here: the real-folder quest needs a secure origin for the File System Access API.

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
    inbox/                mbox.js + classifier.js (pure, Gmail filter export) + index.js
  game/
    town.js               Lanternfall hub: walkable side-scroller with quest gates
    game.js               the battle loop; talks only to a chore session
    progression.js        XP → level/title (pure)
    arsenal.js            guns, upgrades, coin bounty, which extra items a shot hits (pure)
    voyage.js             warp-jump cutscene between town and battle
    encounters.js         random enemy motion, boss HP plan, final boss, boss colours (pure)
    story.js              story quest chapters, checked against real progress (pure)
    blades.js             sword designs and level unlocks
  ui/dom.js               safe DOM builder (textContent only, no innerHTML)
    draw.js               shared canvas UI helpers
    sprites.js            procedural pixel art (no asset files)
    audio.js              WebAudio blips
tests/                    node:test suites for all pure logic
```

The game engine knows nothing about files or money. It only calls `session.suggest`, `session.apply`
and `session.finish`. To add a new chore (an inbox `.mbox`, an ESLint JSON report, etc.), write one
module that follows the contract in [`src/chores/registry.js`](src/chores/registry.js) and add it to `CHORES`.
