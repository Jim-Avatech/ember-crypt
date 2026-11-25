# Ember Crypt

A small Diablo II–style isometric action RPG for phones, played in landscape. Play it at
**https://jim-avatech.github.io/ember-crypt/** (on iPhone: Share → Add to Home Screen for full screen).

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
- **D2-style grid inventory:** 10×4 backpack. Items take their D2 sizes (sword 1×3, axe 2×3, armor 2×3, helm 2×2, ring/potion 1×1…). Drag with your finger to move items (green = fits, yellow = swap, red = won't fit), or tap an item and then tap a cell. Drag out of the window to drop. Saves from v0.1 are converted automatically; anything that doesn't fit is sold for gold.
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
