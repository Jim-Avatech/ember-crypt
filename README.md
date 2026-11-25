# Ember Crypt

A small Diablo II–style isometric action RPG for phones, played in landscape. Play it at
**https://jim-avatech.github.io/ember-crypt/** (on iPhone: Share → Add to Home Screen for full screen).

## v0.7.1 — full item comparison, tap-to-deselect

- **Item comparison shows every stat.** It's built from the game's stat model (`Game.compare`): damage (each hand), attacks/s, AR, crit, defense, life, mana, Str/Dex/Vit/Energy, life and mana leech, run speed, attack speed, each resist, gold find, magic find, +skills, and Str/Dex/level requirements. Gains are green, losses red. Stats the new item lacks count as losses.
- A one-hand weapon compares in the main hand and in the off-hand (dual wield, replacing a shield). A ring compares against both rings.
- `STAT_COMPARE` is a Record over every affix stat, so a new stat won't compile until it's mapped. `tests/compare.test.ts` checks every stat as both a gain and a loss.
- **A second tap on a selected item deselects it**, in the backpack, stash and shop. Equip with the Equip / Main hand / Off-hand buttons, by dragging onto a slot, or by tapping the item then a slot. Sell, To stash and To backpack are buttons.

## v0.7 — bigger backpack and a camp stash

- **Backpack doubled to 10×8 (80 cells)**, beside the equipment at 852×393. Cells stay about the same size (32 px), so nothing needs scrolling. Saves migrate to v5 with every item in the same spot, since the grid only grew downward.
- **Stash:** an iron-bound chest in Ember Camp, left of the campfire. Walk up to it ("▣ Open stash") or tap it. The 10×10 stash sits beside your backpack. Drag between them using the normal fit/swap rules, tap an item then a cell, or tap an item twice to send it across. It's usable only in camp, saved with the hero, and included in save exports.

## v0.6.1 — iPhone sound fix

- Audio now starts on the **end** of a tap (touchend / pointerup / click / keydown). iOS ignores touchstart/pointerdown for this, which is where the game used to start it, so the AudioContext stayed suspended and nothing played.
- Every tap retries until audio is running. Audio also resumes when the app comes back from the background, since iOS suspends or "interrupts" it there (Home Screen mode included). A silent buffer plays on unlock, and on iOS 17+ the page asks to route as media playback (`navigator.audioSession.type = "playback"`).
- Settings → **🔊 Test sound** plays a chime and shows the audio state. Bad or missing sound settings fall back to on, and imported saves no longer reset other settings.

## v0.6 — Diablo II skill tree, throwing weapons, quarterstaff

- **Skill tree matches Diablo II LoD 1.10+** for every Barbarian skill (levels, prerequisites, placement; enforced by `tests/v06.test.ts`). All six weapon masteries are available from level 1 and all work. Frenzy is back to level 24 after Double Throw.
- **Save v4 migration:** points in any skill that no longer qualifies (e.g. Frenzy before 24, or without Double Throw) are refunded and removed from the skill buttons, with a toast saying which.
- **Throwing weapons:** Throwing Knife (stack 40), Throwing Axe (30), Javelin (25). With one in the main hand the attack button throws (➶ plus a count) at the nearest enemy in range; at 0 it fights in melee. Stacks refill free when you arrive in camp, and Hilde sells all three. Thrown hits use Throwing Mastery; melee with a throwing axe uses Axe Mastery and a javelin uses Spear Mastery. **Double Throw** throws one from each hand (needs a thrower in both).
- **Quarterstaff:** two-handed, the fastest swing (0.42 s), tight damage spread (0.85–1.15×). It uses **Pole Arm Mastery**; D2 has no staff mastery for Barbarians.

## v0.5 — Item Guide, safer saves, auto-potions

- **Guide tab** (also a button in Settings): item classes with icon, size, speed, damage spread, requirements and what each is for; damage/defense by item level; every affix tier with its value range and minimum item level; rarity rules and drop odds; monsters by level; the skill list. All generated from the game data, so it can't go out of date.
- **Saves:** written to a temp key, checked, then swapped in; up to 3 rotating backups; mirrored to IndexedDB; a damaged save falls back to the newest good copy (the damaged one is kept); a save from a newer version is never overwritten. Saves after every change (debounced), right away on level-up and arriving in camp, every 8 s, and when the app is hidden. The game asks the browser for persistent storage. Settings shows the last-saved time and has **Copy save code / Download file / Import** plus one-tap restore of backups. Starting a new character keeps the old one in the backups.
  - **Rule for future versions:** never wipe saves. Any change to the save shape bumps the save version and adds a migration step with a fixture test (`tests/save.test.ts` covers v0.1, v0.2 and v0.3 saves).
  - **What can still lose a save:** clearing Safari's website data; Safari deleting storage for a site you haven't opened in 7 days (only when played in a Safari tab, not from the Home Screen); losing or resetting the phone. An exported code or file survives all of these.
- **Auto-potions** (Settings): auto health drinks a healing potion at or below 10% life (adjustable 5–50%, on by default, 2.5 s cooldown). Auto mana (on by default): if a skill fails for lack of mana and you press it again within 1.5 s, a mana potion is drunk.

## v0.4 — easier taps, Return to Town

- **Tap targets:** every tab, close button and menu button is at least 44×44 pt. Panel buttons now act on finger-up with some slack (a tap that drifts a little or lands just above a tab still counts). Tapping the dim area around a panel only closes it when you're clearly away from any button. The game ignores touches while a panel is open.
- **Return to Town:** a ⌂ Town button (top right, in the crypt) and a menu entry in Settings. Stand still for 1.2 s; monster hits don't interrupt it, walking cancels it. A blue portal appears next to the camp waypoint and takes you back to the exact spot, with the level as you left it. Items never need identifying.

## v0.3 — magic and rare items, simpler item classes, faster movement

- **One base per item class.** Sword, Axe, Mace, Great Sword (two-handed), Armor, Helm, Shield, Gloves, Boots, Belt, Ring, Amulet. The class sets damage spread (axe swingy, mace steady), attack speed, grid size and requirements. **Item level** sets the damage or defense numbers. **Rarity** sets how many random affixes it gets. Old saves are converted to the new classes automatically (the old item art is kept, picked by class and level).
- **Magic (blue):** 1–2 affixes, at most one prefix and one suffix, named like *Jagged Axe of the Fox*.
- **Rare (yellow):** 3–6 affixes (max 3 prefixes, 3 suffixes), a random two-word name with the class name under it.
- **Affixes** (D2 names, tiers gated by item level): enhanced damage, +min/+max damage, attack rating, enhanced/+defense, Str/Dex/Vit/Energy, life, mana, life and mana leech, faster run/walk, increased attack speed, fire/cold/lightning/poison/all resists, +1–2 to a Barbarian skill you have learned, gold find, magic find.
- **Drops:** odds scale with monster level and your magic find (rare odds with D2-style diminishing returns). The boss always drops magic or better, with a 30% rare chance per item. Rings and amulets are never white. Blue and yellow drops have colored labels and a light beam.
- **Hilde** now stocks plain gear of every class at your depth plus 2–4 magic items; prices scale with level and affixes.
- Tooltips show item level, affix lines in blue, requirements in red when unmet, and a comparison against what you have equipped (damage, AR, defense, life, mana, speed, leech, resists, MF). The Character panel shows totals including gear.
- **Movement speed:** v0.2 drew the world smaller (pixel-art rescale) without speeding things up, so walking covered ~21% fewer pixels per second. Player base speed is now 4.6 tiles/s (was 3.5) and monsters are 27% faster, a touch snappier than v0.1 on screen.
- Resistances are tracked but do nothing yet (no elemental monsters).

## v0.2 — camp, grid inventory, dual wield, pixel art

- **Ember Camp:** every session starts in a fenced camp with tents, a campfire, and **Hilde the Trader** (sell loot, buy potions and a few white items, and her stock refreshes each visit). A **waypoint** links camp and every crypt level you've reached. Dying sends you back to camp.
- **D2-style grid inventory:** 10×4 backpack (10×8 since v0.7). Items take their D2 sizes (sword 1×3, axe 2×3, armor 2×3, helm 2×2, ring/potion 1×1…). Drag with your finger to move items (green = fits, yellow = swap, red = won't fit), or tap an item and then tap a cell. Drag out of the window to drop. Saves from v0.1 are converted automatically; anything that doesn't fit is sold for gold.
- **Equipment doll:** head, chest, gloves, boots, belt, two rings, amulet, main hand and off-hand. Drag onto a slot, tap item → tap slot, or tap a selected item again to equip. New bases: sashes and belts (more potion room), and plain rings and amulets (small fixed bonuses, since D2 has no white jewelry).
- **Dual wield:** a one-handed weapon fits in the off-hand. Basic attacks alternate hands. Two-handed weapons lock the off-hand.
- **Double Swing:** one hit with each weapon when dual wielding, or two hits with the main hand.
- **Frenzy:** two quick hits. Each hit adds a stack (up to 5) of attack speed and move speed. Stacks start fading 4 seconds after your last hit. It needs Double Swing and level 12 here (D2: level 24, after Double Throw).
- **Pixel art:** the Barbarian, Zombies, Fallen, the boss, the trader, tiles, walls, camp props and every item icon are pixel sprites drawn at low resolution and scaled up without smoothing. Characters have 8 facing directions with idle, walk, attack (separate main/off-hand swings), war cry, leap and death animations. The gear you wear (weapons, shield, helm, armor) shows on the sprite.
- Everything from v0.1 is still there: invisible floating joystick, no auto-attack, three skill buttons, the full Barbarian skill tree, potions, leveling, boss and stairs.

### Art credits

All art is generated by code in this repo (`src/sprites/`, `src/pixel.ts`). No third-party art assets are used.

## Develop

```bash
npm install
npm run dev                     # http://localhost:5174/ember-crypt/
npm run build
node scripts/e2e.mjs [url] [dir] # phone-landscape touch test, saves screenshots
npm test                        # unit tests: affix rolling, stat application, save migration
```

Test hooks (`window.__ec`, `?new`, `?seed=`) only work in dev builds or when the URL has `?debug`.

Plain TypeScript + Canvas 2D, built with Vite. No game engine.
