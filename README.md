# Ember Crypt

A small Diablo II–style isometric action RPG for phones, played in landscape. Play it at
**https://jim-avatech.github.io/ember-crypt/** (on iPhone: Share → Add to Home Screen for full screen).

## v1.6: The Sorceress

- New class `sorceress` (hero select now shows three cards). D2 starting stats 10/25/10/35, 40 life (+1/level, +2 per Vitality), 35 mana (+2/level, +2 per Energy), mana regen ×1.5. Starts with a Battle Staff, a Wand in the bag and 3 mana potions. Own puppet model (`sorc` in src/sprites/puppet.ts): long robe that changes colour and trim with the armour worn, circlets for helms, staff/wand/orb art.
- Skills: `src/data/sorc.ts` (all numbers) and `src/spells.ts` (casting, spell entities, buffs). Fire / Cold / Lightning trees, 10 skills each, D2 prerequisites; tree rows unlock at levels 1/6/12/18/24/30. Damage = `spellBase(clvl)` × skill growth × (1 + mastery), never the weapon. Fixed 0.5 s cast. Cooldowns on Meteor 1.2 s, Blizzard 1.8 s, Fire Wall 1.4 s, Frozen Orb 1.0 s, Hydra 0.6 s. Cold uses the v1.3 chill/freeze rules. Static Field never kills and stops bosses at 50%. Timed buffs (armours, Energy Shield, Enchant, Thunder Storm, Blaze, Hydras) show on the buff bar. Any learned spell can go on ⚔.
- Simplified for mobile: Telekinesis is a knockback + stun bolt; Teleport blinks along the aim to the last open point (never through walls); Inferno is one cone burst; Blaze is a timed trail of fire; Fire Wall is a 5-tile segment; Hydra is one head per cast (max 3, 10 s); Thunder Storm strikes a random nearby monster; Energy Shield moves a share of damage to mana (1.5 mana per life); Chilling Armor answers missiles only; Cold Mastery is +% cold damage; Enchant is self only; one cold armour at a time; no synergies; no faster cast rate.
- Items: Battle Staff (2H), Wand (1H), Orb (off-hand, shield slot). +skill rolls on them are Sorceress skills only. Drops lean 40% toward the hero's class (`leanWeights`), overall weapon/armour share unchanged. Hilde stocks a magic Sorceress weapon. Only the Barbarian dual wields (`NO_DUAL_MSG`).
- Character screen: Spell DPS row (⚔ spell, one target); the training dummy counts spell hits.
- Balance: `tests/classSim.ts` clears a pack of 5 real monsters through `Game.update`; `tests/v16balance.test.ts` keeps the Sorceress within 0.6×–1.3× of the other classes at levels 1/10/30/60.
- Tests: `tests/v16.test.ts`, `tests/v16balance.test.ts`, `scripts/v16-shots.mjs` (screenshots/v16, Chromium + WebKit). SW cache v33.

## v1.5.1: Levels numbered within each act

- Every level number the player sees counts 1-20 within its act: `whereLabel` (map label, Character screen deepest level, save-import prompt) is "Act N · Level levelInAct(floor)"; the portal messages use `floorName` ("Burning Hells — Level 7"). Waypoint list, arrival toast and hero select were already per act. The v1.1 patch note no longer says "level 60". Floors stay 1-80 internally.
- Tests: `tests/v151.test.ts`, `scripts/v151-shots.mjs` (screenshots/v151). SW cache v32.

## v1.5: Where you are, fair DPS, coloured resistances

- Act and level (`whereLabel` in src/data/acts.ts, `#where` in the HUD): "Act 3 · Level 42" (the level number waypoints use) or "Ember Camp", 13px bold, directly above the minimap, below the buff bar; part of the boss bar's `hudAvoid` boxes.
- DPS with missing requirements: `Game.reqMetPreview(it, slot)` puts the item in the slot and raises only what's short (Strength / Dexterity counted with the other working gear, never the item's own +Str/+Dex; level) to exactly the requirement, then reads `derived()`, and restores everything. `weaponDps` (every item card: bag, worn, stash, shop, compare cards) and `compare()`'s DPS / damage / attacks rows (`DPS_METRICS`) use it. `meetsReq` / `usable` are untouched, so the item still shows red.
- Amazon: no "Main hand only" line, no off-hand compare card or red note, no Off-hand button. `equipError` still refuses with `AMAZON_OFFHAND_MSG` ("Amazons can't dual wield"), toasted on a drag.
- Colours (`src/tints.ts`, styles.css `.r-poison/.r-light/.r-fire/.r-cold/.lleech/.mleech`): Character screen has one "Resistances" row (poison, lightning, fire, cold) and a coloured leech row; item lines (`modLine`) colour resistances and leech everywhere, All Resistances gets one dot per colour.
- Tests: `tests/v15.test.ts`, `scripts/v15-shots.mjs` (screenshots/v15). SW cache v31.

## v1.4: Brann the Runesmith, one affix pool, no doubled affixes

- `src/data/affixes.ts`: one flat pool (`AffixDef` has no side any more). `rollMore` picks uniformly over the (affix, tier) pairs that fit the item type and level and share no stat with the item (`statsOf`). Magic: 1–2 (`MAGIC_TWO`), rare: 3–4 (`RARE_COUNTS`). The magic-find prefix and suffix are one `mf` affix now. Names (`magicName`, `rareName`) come from what rolled and never decide it.
- Old items: `mergeDuplicateMods` (every load: equipped, bag, stash, unclaimed, and the shared stash in main.ts) merges a doubled stat into one row with the higher value and turns `p:`/`s:` affix keys into plain ids. A one-time toast says how many items changed.
- Crafting: Brann the Runesmith (town `crafter` at 10.5, 8.5), Craft tab. `craftAffix` adds one affix with the same rules as drops (+skill locks by item via `skillPoolFor`); 1–2 affixes → magic (renamed), 3 → rare (new rare name), 4 is `MAX_AFFIXES`. Cost `craftCost(ilvl, n) = (50 + 20·ilvl) × [1, 3, 8, 20][n]` (rounded to 10), paid carried gold first, then stash gold (`Game.payGold`).
- Lightning Fury vs Lightning Strike (added to v1.4 after the first v1.4 deploy, SW cache v29): Fury did 1.4–2× Strike's DPS (its thrown javelin outdamages a stab, the Amazon throws 15% faster, and its bolts did 90% + 25%/level each). Now `FURY_JAV_HIT` = 0.5 (the javelin's own hit), `furyBolts` = Strike's chain + 1 (3…9), `furyDmg` = 40 + 10.5·(l−1) + 2.5·max(0, l−10). Strike is unchanged. `tests/furySim.ts` measures both through `Game.update` (same Amazon, javelin and real monsters of her level, packs of 1/3/5); `tests/v14fury.test.ts` keeps Fury at 80–95% of Strike in every case and 85–90% on average.
- Monster density by act (also added to v1.4 after the Fury deploy, SW cache v30): `Game.addActPacks` runs after a level's normal pack rolls (unchanged, so Act I is identical) and adds packs of the act's own monsters until the level holds `ACT_MONSTER_MULT[act]` × what the rolls gave ([1, 1.427, 1.719, 2.211], tuned from the acts' own averages 44.2 / 38.7 / 40.2 / 39.0) = 44.2 / 55.3 / 69.1 / 86.3 monsters a level, ×1.25 per act. Added packs go to the least crowded rooms, never the start or boss room, on room-interior tiles, up to `ROOM_CROWD` (0.6) monsters per tile. Bosses unchanged. Frame time: `scripts/v14-density-perf.mjs`.
- Tests: `tests/v14.test.ts`, `tests/v14fury.test.ts`, `tests/v14density.test.ts`, `scripts/v14-shots.mjs` (screenshots/v14). SW cache v28, v29 for the Fury rebalance, v30 for the act density.

## v1.3.2: Amazons don't dual wield

- D2 rule: only the Barbarian dual wields (`Game.canDualWield()`). For an Amazon, `slotsFor` gives a one-hander the main hand only, `equipError`/`swapEquip` refuse a weapon in the off-hand with `AMAZON_OFFHAND_MSG`, `defaultSlot` never picks the off-hand, `compareSlots` compares against the main hand, and `derived()` ignores an off-hand weapon (no dual-wield DPS). The compare sheet shows an off-hand card that says why; the Off-hand button is disabled; dragging onto the off-hand toasts the reason.
- Saves: on load, an Amazon's off-hand weapon (`clearAmazonOffhand`) goes to the bag; if full, to `player.unclaimed`, which `placeUnclaimed()` (main.ts, after the shared stash sync) puts in the stash, or else on the ground in camp, re-dropped every visit and kept in the save until picked up. Never deleted.
- Tests: `tests/v132.test.ts`, `scripts/v132-shots.mjs` (screenshots/v132). SW cache v27.

## v1.3.1: Ice Arrow pierces you can see

- Ice Arrow always pierced as often as other arrows (real game loop: ~51% at Pierce 5), but v1.3's pierce cue (tag, sparks, streak) was ice cyan, the colour of Ice Arrow's damage numbers and of the frozen monster's ice block, so it was invisible. The cue is now magenta "⇶ Pierce" (`PIERCE_COLOR`), above the damage number, with a magenta/white streak.
- `PIERCING_SKILLS` lists what rolls Pierce: normal shot/throw, Magic, Fire, Cold, Ice Arrow, Multiple Shot, Strafe, Poison Javelin, Double Throw. Exploding/Immolation/Freezing Arrow, Guided Arrow, Plague Javelin, Lightning Fury stop; Lightning Bolt always passes through.
- Tests: `tests/v131.test.ts` (one per skill, through Game.update), `scripts/v131-shots.mjs` (screenshots/v131). SW cache v26.

## v1.3: Buff bar, freeze resistance, visible Pierce, DPS, training dummy

- **Buff bar:** every timed effect shows along the top (no rings on the skill buttons, since thumbs cover them). Barbarian: Battle Orders, Shout, Battle Command, Frenzy (stacks), Concentrate, Berserk, Grim Ward, Battle Cry, Taunt. Amazon: Slow Missiles, Decoy, Inner Sight. Both: chilled and poisoned. Each shows its icon, seconds left and a draining bar. Strafe (a single volley) and Valkyrie (no time limit) have no timer.
- **Freeze resistance** (`freezeResFor`, `FREEZE_*` in src/game.ts): a freeze lasts (1 − res) as long and a chill (1 − res/2); after a freeze wears off the monster can't be frozen again for a while. Base res: normal 0, champion 20%, unique 35%, boss 55%, act boss 60%; +0.4% per floor past the first (not normal monsters), capped at 80%. Thaw window: champion 0.75 s, unique 1.5 s, boss 3 s. Act bosses are never hard-frozen (chill only). Chilled speed: normal/champion 50%, unique 55%, boss 65%, act boss 70%.
- **Pierce** rolled correctly before (51% at level 5) but was invisible. A piercing arrow now glows, the monster shows "Pierce", and the arrow carries on into the next one.
- **DPS** (`Derived.dps`/`aps`, `Game.basicDps`, `weaponDps`): the ⚔ normal attack's average hit × (1 + crit) over its real attack time (bow: speed / (1 + IAS) / 1.15 for an Amazon; swings and throws speed / (1 + IAS); dual wield alternates). Misses are not counted. A bag or shop weapon shows the DPS you'd have with it equipped, next to your worn weapon's DPS in the compare sheet (cards keep no deltas). DPS is also on the Character screen and first in `Game.compare`'s stat list.
- **Training dummy** in camp at (9.5, 17.5), west of the campfire, off the paths. It never dies, moves or fights back, gives no XP, gold, loot or leech, and the Valkyrie ignores it. Every hit lands 95% of the time. The meter shows rolling DPS over the last 5 s, total damage, hits and time; after 4 s idle the session ends and its average stays up as "Last".
- **Strafe:** −30% +4%/level per arrow (was −20% +5%), draw time 0.5 + 0.32 per arrow (was 0.28). On one target at level 10 that's about 2.8 normal shots' worth per volley time (was 3.7).

## v1.2.2: Guided Arrow really homes

- Guided Arrow used to steer only toward the monster picked when it was shot (the nearest one the hero could see), and snapped straight at it. Shot down a hall at monsters around the corner, it had no target, flew straight and hit the back wall; it also stopped homing if its target died.
- Now it locks onto the monster nearest the aim line (within 35°, in bow range, even out of sight); otherwise, in flight, it acquires the nearest monster it can see within 9 tiles (preferring ones ahead) and re-acquires when its target dies.
- It turns at up to 9 rad/s (harder when a wall is just ahead), follows the walking path when its target is around a corner, never passes through walls, and may fly up to 2.5× the bow's range while chasing.
- Guided Arrow is the only homing projectile (Charged Bolt sparks wander on purpose).

## v1.2.1: Multiple Shot rebalance

- A volley's total damage is `multiShotTotal(l)` = 125% + 5% × (level − 1) of a normal hit, split evenly over `multiShotArrows(l)` arrows (`multiShotPer`), applied as a whole-hit multiplier (physical and elemental) in `playerHit`. Every arrow can still hit the same monster.
- Tests: `tests/v121.test.ts` (formula at levels 1/10/20, point-blank ≈ 1.25× / 1.7× a normal shot), `scripts/v121-shots.mjs` (tooltip). SW cache `ember-crypt-shell-v23`.

## v1.2: respec one point at a time, any skill on ⚔

- Respec (`canUnstat`/`unstat`, `canUnlearn`/`unlearn`, `respecCost` in `src/game.ts`): one stat or skill point back for 50 gold × level (`RESPEC_GOLD_PER_LEVEL`), paid from carried gold, then stash gold in camp. Never below class starting stats, never a prerequisite of a learned skill, never a stat worn gear needs (refused rather than turning gear red). UI: − on the Character page, − Point on the Skills page, with a confirm showing the cost.
- Any learned active skill on ⚔ (`mainAtk`, `mainAtkOk`, `mainSkill`): attack skills repeat while held and fall back to a normal attack without mana; `ONCE_PER_PRESS` skills (warcries, Leap, Amazon helpers) fire once per press, then a held ⚔ attacks normally. The button shows the skill's glyph, dimmed without mana; it never moves or resizes.
- Tests: `tests/v12.test.ts`, `scripts/v12-shots.mjs`. SW cache `ember-crypt-shell-v22`.

## v1.1: gentler early levels, class loot, red items, stash gold, buy-back

- Difficulty curve: level 1 monsters have 80% life / 90% damage of v1.0.1, rising linearly to 100% at level 60 (`CURVE_*`, `curveHp`, `curveDmg` in `src/game.ts`). Levels 60–80 and boss damage are exactly v1.0.1 (tested against `tests/fixtures/v101-monsters.json`).
- Class-leaning weapon drops (`CLASS_DROP_WEIGHTS`; overall item rate and armor share unchanged); Hilde always stocks a magic weapon for your class.
- Gear whose requirements you no longer meet is red and gives nothing (`inactiveSlots`, `usable`, `worn`); bows/javelins you can't use refuse to fire with a hint.
- +skill rolls match the item (`skillPoolFor`): bows → Bow & Crossbow, javelins/spears → Javelin & Spear, other weapons and helms → Barbarian, amulets mostly the finder's class.
- Buy-back row (last 8 sales, `buyback`, `BUYBACK_MAX`), separate from Hilde's wares. Stash gold per hero (`stashGold`, saved with the hero; death costs 10% of carried gold only).
- Potions: To belt, belt refills from the backpack. Amazon bows/javelins 15% faster (`AMAZON_SPEED`), arrows leave at 50% of the draw (`BOW_RELEASE`).
- Bosses: leash 45 steps, give up only after 8 s unhit and unseen, heal only once home. Normal monsters give up after 5 s out of sight beyond 12 tiles; Fallen scatter 1.5 s when a packmate dies.
- 3-wide corridors (`CORRIDOR_W`); waypoint stone only on waypoint levels (`waypointHere`); Character header shows name and class; weapon-aware stat text.
- Tests: `tests/v11.test.ts`, `scripts/v11-shots.mjs` (Chromium + WebKit, 852×393). SW cache `ember-crypt-shell-v21`.

## v1.0.1: bigger stacks, levels that stay cleared, delete hero, bosses that chase, patch notes

- **Bigger stacks (×2):** Arrows 600 → 1,200 per quiver; Javelins 100 → 200; Throwing Axes 120 → 240; Throwing Knives 160 → 320. Existing stacks fill to the new max the next time you're in camp (which includes opening the game).
- **Levels stay as you left them for 5 minutes** (`FLOOR_KEEP_MS` in `src/game.ts`). Leave a level by waypoint, stairs, ⌂ Town or dying, and coming back within 5 minutes gives the same level: killed monsters stay dead, loot stays on the ground, a dead boss stays dead with the stairs open, and the map stays explored. Monsters still alive return to their spots at full life. After 5 minutes away the level is fresh (same layout, as before). Kept in memory only (up to 8 levels; an app restart starts fresh). The blue camp portal still returns you to the exact spot.
- **Delete hero:** a 🗑 button on each hero card opens a red confirm box; Delete forever stays off until you type the hero's name. Only that hero's slot is removed (save, temp, 3 backups, damaged copy, IndexedDB copy); other heroes and the shared stash aren't touched, and slots are never renumbered, so Files backups and cloud rows keep their numbers. A deleted slot's cloud copy isn't pulled back (cloud row deleted via `delete_save`, plus a local "deleted at" marker). Deleting the hero you're playing keeps the hero screen open until you pick or make another. The last deleted hero is kept in one hidden safety copy (`ember-crypt-last-deleted-hero`).
- **12 hero slots** (was 8). The hero list scrolls by touch; a counter shows used/12.
- **Bosses chase:** bosses have a 0.5 body, which exactly filled a floor tile, so they couldn't steer through corridors or doorways and stayed stuck in their room. Monsters now collide with walls using at most 0.4 (`wallR`). In a 48-level simulation, every boss reached a hero standing 7–9 steps outside its room (before: 0 of 48). **Leash:** a boss gives up only when you're more than 28 steps (walking distance, `BOSS_LEASH`) from its room. It then walks home around walls, healing 25% of its life per second, and is at full life once back. Boss damage is unchanged.
- **Patch notes** in Settings (📜 Patch notes), newest first, from `src/data/patchNotes.ts` (each release adds an entry at the top; the version label comes from it).
- Fix: opening Change hero from Settings no longer lets the same tap pick the hero under your finger.

## v1.0: the Amazon, hero slots, bows, spears and javelin stab/throw

- **Heroes.** The game opens on a hero select. Your existing Barbarian is hero #1 (his save keys are unchanged, so
  nothing moves); up to 8 heroes, each with its own save, 3 rotating backups and IndexedDB copy. New hero →
  Barbarian or Amazon, with a name. Settings → 👥 Change hero switches any time. "Start this hero over" replaces
  only the current hero (the old one goes to that hero's backups). Heroes can't be deleted yet.
- **Shared stash.** The camp stash chest is shared by all heroes on the device (newest change wins; every hero's save
  also keeps a copy). 📁 Back up to Files now writes every hero plus the shared stash into one file; Restore puts
  the other heroes back into their slots when those are empty or older. Cloud save (still off) syncs one row per hero
  slot (`supabase/schema.sql` has the new table and an upgrade note).
- **The Amazon.** Dex-focused (Str 20, Dex 25, Vit 20, Energy 15; 3 life per Vitality), starts with a javelin and a
  buckler, a short bow and a quiver in her bag. All 30 Diablo II skills in Bow & Crossbow, Passive & Magic and
  Javelin & Spear, with D2's levels (1/6/12/18/24/30), prerequisites and the 1-point-per-level cap. Her own look:
  slimmer, blonde ponytail, and the same armor items drawn as leather and bronze scale instead of steel plate; light
  headgear keeps the hair showing.
- **New weapons** (same itemization rules, same loot pool for every class): Short Bow (fast), Long Bow (hits
  harder), Arrows (an off-hand quiver of 600 that refills in camp, never magic), Spear (two-handed, long reach).
- **Basic attacks.** Skills → Basic: Attack / Stab, Throw and Shoot. Any of them can go on a skill button, and the main
  ⚔ button can be set to one (Auto = shoot with a bow, throw a throwing weapon, else attack). So a javelin can stab
  or be thrown before any skills. Works for the Barbarian too. Attacking stays manual.
- **Javelins are held overhead** (D2 style) when idle and walking, for both classes, in all 8 directions; the stab
  thrusts forward from that grip and the throw releases from it. Javelin item art is unchanged.
- **Drop weights** (items on normal kills still ~4.1–4.2%, normal/magic/rare ~35/51/14%; weapons+arrows are 51.3% of
  drops, was 51.2%): sword, axe, mace 0.85 each (were 1.2) · great sword 0.5 (0.7) · quarterstaff 0.4 (0.6) ·
  throwing knife, throwing axe, javelin 0.35 each (0.5) · spear 0.45 · short bow 0.45 · long bow 0.4 · arrows 0.25.
- **Simplifications.** Elemental damage (fire/cold/lightning/poison arrows and javelins) is a % of the weapon's average
  hit so it keeps pace with your gear; no Amazon synergies yet; Valkyrie and Decoy last until killed or until you
  change level; one Valkyrie and one Decoy at a time; no crossbows (the tab keeps D2's name).

## v0.9.4: life ring under the hero (HUD option C), bosses that hit like bosses

- **Life and mana where your eyes already are:** a red life arc and a blue mana arc curve under the hero's feet, with the life number beside them. The bottom-corner orbs are gone (the left thumb used to cover the life orb, and the right thumb the mana orb). They stay only for screen readers.
- **Readable number:** bold, with a black outline and shadow. It sits right, left or below the ring, whichever side no monster is standing on. The ring and number are kept on screen.
- **Low life (under 35%):** the screen edge pulses red like a heartbeat, stronger the lower you go, and a soft heartbeat sound plays in time with it (only when Sound is on).
- **Everything else:** the XP bar moved right, out from under the left thumb. Minimap, buffs, the menu row with Town, and the potions were already clear of both thumbs, so they stay put. **Attack and the three skill buttons haven't moved by a pixel.**
- **Bosses hit like bosses.** Measured on an "on-level hero" (the level a full clear gives, magic gear in every slot, no buffs) standing still next to the boss (`tests/bossfight.sim.test.ts`):
  - **Accuracy:** bosses aim with 3× attack rating and don't lose accuracy when you out-level them. They used to miss about half the time; now it's about 80%. Defense still helps.
  - **Damage:** an average hit is set from that hero's life: level bosses 30% on an act's first level up to 35% on its last, act bosses 38% (bolts 0.9×). Bosses also attack 10% faster.
  - **Ground slam (telegraphed):** level bosses stop, raise their weapon, and a red ring grows on the floor for 1.1 s (0.8 s deep in an act). Then it bursts for about half your life. Step out and it does nothing. It comes every 7 s on an act's first level, down to every 4.3 s on its last. Act bosses add the slam to their rotation, and their specials come every 3 s (was 3.6 s).
  - **Modifiers (shown on the boss bar):** none early in an act; from level 7, Extra Fast or Stone Skin; from level 14, and on every act boss, both.

  | Floor (boss) | Hit chance before → after | Normal hit, % of life | Slam / big hit | Damage per second standing still |
  |---|---|---|---|---|
  | 1 (Gravelord Morth) | 57% → 80% | 22% → 33% | — → 51% | 7% → 21% |
  | 20 (Ember Lich, act) | 55% → 81% | 26% → 32% | 47% → 51% | 17% → 31% |
  | 40 (Queen Sekhet, act) | 51% → 78% | 28% → 26% (lightning resist) | — → 52% | 25% → 37% |
  | 80 (Malakar, act) | 50% → 78% | 44% → 34% | 55% → 51% | 55% → 61% |
  | 19 / 39 / 79 (elders) | 52 / 51 / 50% → 76 / 80 / 78% | 40 / 39 / 49% → 36 / 32 / 32% | — → ~50% | 11–12% → 29–31% |

- The A/B mockups (`screenshots/hud-options/`) are kept for reference; their code was removed.

## v0.9.3: harder monsters, skill page matches the three buttons

- **Monsters, on top of v0.9.2:** +30% life and +50% damage for every monster. Totals vs v0.9.1 are life ×1.69 and damage ×1.875; champions and uniques build on these.
- **Bosses:** level bosses and act bosses have **1.9× their v0.9.2 life** (the general +30% isn't stacked on top), and take the general +50% damage.
- **Representative averages, v0.9.2 → v0.9.3:**

  | Floor | Normal life | Normal damage | Boss life | Boss damage |
  |---|---|---|---|---|
  | 1 | 14 → 18 | 4 → 5 | 265 → 502 | 11 → 16 |
  | 20 | 84 → 109 | 16 → 23 | 2711 → 5151 | 59 → 87 |
  | 40 | 273 → 354 | 38 → 56 | 6084 → 11560 | 113 → 169 |
  | 80 | 544 → 708 | 107 → 161 | 14820 → 28158 | 213 → 319 |
- **Skill page:** it now offers only buttons 1–3, and the game refuses any other slot. A save with a value on a 4th button is cleaned when it loads and when it saves; the skill stays learned.

## v0.9.2: fewer drops, three skill buttons, cleaner HUD, tougher monsters, more throwing ammo, ring choice

- **Drops halved again** (40,000 simulated kills):

  | Source | v0.9.1 | v0.9.2 |
  |---|---|---|
  | Normal monster, item | 8.3% of kills | 4.2% |
  | Champion | 0.5 items per kill | 0.25 |
  | Unique | 1 item | 0.5 (always magic or better) |

  The normal/magic/rare mix is unchanged at about 36/51/13%. Gold, potions, bosses, artifacts and Find Item are unchanged.
- **Three skill buttons:** if a v0.9 save had a skill on the 4th button, the button is dropped but the skill stays learned.
- **Boss bar:**
  - The bar stays at the top center but is pushed below any HUD element it would touch (menu buttons, buffs, minimap); toasts move below it.
  - Checked at 852×393 with iPhone safe areas (47/59 px sides, 21 px bottom) in Chromium and WebKit: `scripts/v092-shots.mjs`.
- **No top-left text:**
  - The game name, area, level and portal line are gone.
  - ⌂ Town (top right) shows whenever you're in the crypt. The first trip down shows a one-time tip about it, and starting a return says "walk to cancel".
  - Floor and portal info still come as toasts.
- **Monsters:** +30% life and +25% damage for every monster. Champions, uniques and bosses build on that, so they scale too. Representative averages, before → after:

  | Floor | Normal life | Normal damage | Boss life | Boss damage |
  |---|---|---|---|---|
  | 1 | 10 → 14 | 3 → 4 | 204 → 265 | 9 → 11 |
  | 20 | 64 → 84 | 13 → 16 | 2086 → 2711 | 47 → 59 |
  | 40 | 210 → 273 | 30 → 38 | 4680 → 6084 | 90 → 113 |
  | 80 | 419 → 544 | 86 → 107 | 11400 → 14820 | 170 → 213 |
- **Throwing weapons ×4:** Throwing Knives 40 → 160, Throwing Axes 30 → 120, Javelins 25 → 100. Existing stacks fill to the new cap the next time you're in camp, which includes opening the game.
- **Rings:**
  - Equipping a ring offers **Left ring** and **Right ring**.
  - The compare sheet shows both equipped rings, labelled left and right.

## v0.9.1: half the item drops, two-handed grip

- **Drops (measured over 40,000 simulated kills, Act II):**

  | Source | Before | After |
  |---|---|---|
  | Normal monster, item | 17.1% of kills | 8.3% (target 8.5%) |
  | Champion | 1 item every kill | 1 item on 50% of kills |
  | Unique | 2 items | 1 item (still always magic or better) |

  The normal/magic/rare mix is unchanged: about 36/51/13% of normal-monster items before and after. Every item still makes the same quality roll; there are simply fewer of them.
  Gold (20% of normal kills) and potions (9%) are unchanged, because fights are tuned around potions. Bosses, act artifacts and Find Item are unchanged. Test: `tests/drops.sim.test.ts`.
- **Two-handed weapons are held with both hands:**
  - Applies to Great Sword (Two-Handed Sword, Claymore art), Quarterstaff, and the two-handed axe and maul art.
  - The main hand holds the top of the grip and the other hand sits lower on the shaft, with both arms solved by IK. This covers every frame of idle, walk, attacks, Leap and warcries, in all 8 directions.
  - Two-handers get their own swings: a normal attack is an overhead chop. Double Swing and Frenzy do a chop and then a horizontal sweep. Whirlwind spins with both hands on the hilt.
  - One-handed and dual-wield art is unchanged.
  - Check: `node scripts/twohand-sheet.mjs` renders all 1,736 two-handed frames and measures each hand's distance from the shaft (it must be 0); contact sheets go to `screenshots/twohand-sheet-*.png`.
- **Kept:** Frenzy and Double Swing work with a two-handed weapon, swinging it twice (`tests/v091.test.ts`).
- **No stamina bar, by design:** Increased Stamina gives life instead.

## v0.9: every Barbarian skill, four skill buttons

All 30 Barbarian skills now work. There are four skill buttons next to ⚔. In Skills, pick a skill and tap 1–4 to assign it; a newly learned active skill fills the first empty button. A tap shorter than one frame now always counts. Hard points stay capped at 1 + (level − skill level), and old saves keep their skills (a 4th empty button is added).

| Skill | What it does here | Simplified vs D2 |
|---|---|---|
| Concentrate | An uninterruptible blow; +defense while swinging | No Berserk/BO synergy |
| Whirlwind | ~1 s spin (holding repeats it), steer with the stick, hits all around with alternating weapons | Fixed 1 s spins, not a click-to-point path |
| Berserk | Magic hit that ignores defense; your defense drops to 0 briefly | No Howl synergy |
| Increased Stamina | +life and life regen | No stamina bar, so it converts to life |
| Natural Resistance | +all resistances, diminishing returns | Same curve shape as D2 |
| Taunt | The nearest monster comes at you, and hits weaker and less often | Ranged monsters are weakened and aggroed, not forced into melee |
| Battle Cry | Lowers defense and damage of monsters nearby | — |
| Find Item | Searches a corpse for an item (each corpse once) | One shared "searched" flag with Find Potion/Grim Ward |
| Grim Ward | A corpse becomes a bone totem; normal monsters flee from it | Bosses and elites ignore it |
| War Cry | Damages and stuns all nearby; +6% damage per hard point in Howl, Taunt, Battle Cry, Battle Orders | Synergy set close to D2 |
| Battle Command | +1 (or more) to all skills you've learned, for a while | Self only (no party) |

Shout and Battle Orders lengthen each other (+5 s per hard point; Battle Command adds too). Visuals: spinning blade arcs for Whirlwind, rings for warcries, stun stars, a red mark on taunted monsters, a violet haze from Battle Cry, and the Grim Ward totem. HUD chips show Battle Command, Concentrate and Berserk.

Tests: `tests/v09.test.ts` and `scripts/skills-shots.mjs` (screenshots plus checks).

## v0.8.3: back up to Files / iCloud Drive

- **Settings → 📁 Back up to Files** writes a real save file (`ember-crypt-lv24-2026-11-25.embercrypt`, plain JSON). On iPhone it opens the share sheet, so pick **Save to Files** and then iCloud Drive. Where sharing files isn't supported, it downloads the file instead.
- **Restore from file** accepts that file (or an older `.json` export). It checks and upgrades the file, shows which hero it holds, and asks first. Your current hero always goes into Backups before it is replaced.
- Settings shows **Last file backup**. After a level-up or a boss kill, if your hero (level 3+) hasn't been backed up for over 24 hours, a gentle reminder appears, at most every 12 hours.
- Tests: `tests/filebackup.test.ts` and `npm run test:file-backup` (share sheet, download fallback, restore, a bad file refused, reminder; Chromium and WebKit).

## Cloud save (ready, switched off until a free Supabase project exists)

Code: `src/cloud.ts`, schema `supabase/schema.sql`, tests `tests/cloud.test.ts` + `scripts/cloud-ui.mjs` (two devices against a fake Supabase).

- **Sign-in:** email + 6-digit code. There's no password, and no link that would open Safari instead of the Home Screen app.
- **Storage:** one row per player, protected by row-level security. Writes go through `put_save()`, a server-side compare-and-swap.
- **Sync:** 2.5 s after opening, every 60 s, when the app is hidden or comes back online, and with **Sync now**.
- **Conflicts:**
  - Newest wins. The losing copy is kept: on the device it goes into Backups; in the cloud it goes into `prev_data`.
  - A device's **first** sync keeps the hero with more progress, so a fresh level-1 hero on a new phone never overwrites the real one.
- **Flag:** off unless the build has `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` and `VITE_CLOUD=1` (or `?cloud` in the URL). With it off, nothing is loaded or shown.

**To switch it on (free tier, no card):**

1. Create a free account at supabase.com (sign in with GitHub or email), then create a project on the Free plan.
2. Run `supabase/schema.sql` in the SQL editor.
3. Auth → Providers → Email: keep it enabled.
4. Auth → Email Templates → "Magic Link": make sure the body contains `{{ .Token }}` so the email shows the 6-digit code.
5. Project Settings → API: copy the Project URL and the `anon` public key into a `.env.local`:
   `VITE_SUPABASE_URL=…`, `VITE_SUPABASE_ANON_KEY=…`, `VITE_CLOUD=1`
6. Build and deploy.

**Free-tier limits:**
- Free projects pause after about a week with no activity; resuming is one click in the dashboard. The game keeps working offline meanwhile.
- The built-in email sender allows only a few emails per hour. That's fine for signing in a couple of devices.

## v0.8.2 — compare cards scroll

- Each card in the compare sheet now scrolls on its own by touch. Before, the game's touch handler blocked scrolling outside the panel body, so long items were cut off. A "▾ more" fade shows while a card has more below it, and spacing is tighter so most items fit without scrolling at 852×393.
- Test: `scripts/compare-scroll.mjs`. At 852×393, and again at 852×300 to force overflow, it swipes each card and checks that the last affix of a 4-affix rare is reachable.

## v0.8.1 — no more black screen after an update

- **Fix:** the v0.8 service worker deleted the old cache, and that cache held the new game files fetched on the first open after the update. Opening the app again on a weak or no connection then found the page but not the game files, and showed a black screen. The new worker caches a version's files before it takes over. It keeps hashed files across updates, and loads the page from the network first with a 6 s timeout.
- **Boot screen:** a loading indicator shows until the first frame. If a file fails to load, or the game errors while starting or keeps failing every frame, the error appears on screen with Reload, Repair & reload (clears the app cache, never the save), Export save and Load last backup. Load last backup keeps the current save under another key.
- **Saves:** if a save can't be opened, it's kept as the damaged copy and the newest working backup loads instead. If none works, saving pauses so nothing is overwritten.
- **Build:** the target is now Safari 14 / ES2020 for older iPhones. Export no longer passes the whole save as function arguments, which a large save could overflow on Safari.
- Test scripts: `scripts/boot-check.mjs`, `scripts/sw-upgrade.mjs`, `scripts/save-fuzz.mjs`, `scripts/boot-fail.mjs`, `scripts/boot-time.mjs`, `scripts/canvas-mem.mjs`.

## v0.8 — four acts, new monsters, bosses and artifacts

- **Four acts of 20 levels each**, all reached from Ember Camp, which stays the same: **I Ember Crypt**, **II Sunken Tombs** (sandstone), **III Drowned Jungle** (moss and water), **IV Burning Hells** (basalt and lava). Levels are generated from the act's theme, with their own floor, wall, torch and decal art. The HUD shows *Act N · Area · Level M/20*.
- **Pacing**: each level takes about 2–5 minutes, so an act takes an hour or more. A full clear gives about 13–15 hero levels per act (roughly level 15 / 29 / 42 / 56 at the end of Acts I–IV). Monster level climbs from 1 to 12, then 13–24, 25–36 and 37–49, which raises item levels. Kills give less XP than before (×0.3), deeper acts a little more (×1.1/1.2/1.3), and monsters more than 3 levels below you give less (−15% per level, like Diablo II).
- **New monsters, 3–4 per act**, each with its own pixel sprite and behavior: Skeleton Archers (ranged); Tomb Mummies (poison), Sand Raiders (charging packs), Serpent Priests (lightning casters); Bog Lurkers (cold, chill you), Flayers (fast packs), Thorn Spitters (poison spit), Swamp Bloaters (explode); Hell Imps (fire packs), Doom Knights (charge), Pit Conjurers (fire bolts), Burning Souls (explode in fire).
- **A boss on every level**, named and tougher each level of the act (monster level climbs, plus +4% life and +2% damage per level). Level 20 holds the act's **final boss** with special attacks: The Ember Lich (fire bolt fan, flame nova), Queen Sekhet (charge, lightning fan), Mother Mire (poison nova, summons her brood), Malakar, Lord of Embers (fire nova, burning charge, summoned imps).
- **Artifacts**: each final boss drops one (The Ember Heart, The Sun Scarab, The Mire Pearl, The Cinder Crown). Walk over it to collect it. Artifacts are kept in a new **Artifacts** tab (also in Settings), not your bag, and saved and exported with your hero. They do nothing yet.
- **Elemental damage**: fire, cold, lightning and poison are cut by your resists (max 75%). Cold slows you; poison hurts over time.
- **Waypoints** on level 1 and every 5th level of each act, grouped by act; reaching an act unlocks it. Use ⌂ Town and the blue portal to return to any other level. Magic find rises +20% per act and +1% per level. The Item Guide has new **Acts & artifacts** and per-act **Monsters** sections.
- **Saves v6**: older heroes keep everything. Levels 1–20 of the old endless crypt become Act I levels 1–20; deeper heroes are held at Act I level 20 until they beat the Ember Lich.

### v0.8 also: compare sheet, skill cap, fewer affixes, harder fights

- **Compare sheet:** tapping a bag, stash or shop item opens its full card beside what you wear in that slot (both rings; main and off-hand for one-handers). Each card lists its own stats, with no +/- list. The action buttons sit underneath, plus ✕ Close.
- **Diablo II skill cap:** hard points in a skill are at most 1 + (your level − the skill's level). +skills on gear go on top. Old saves get points above the cap refunded.
- **Affixes:** magic items roll 1–2, rares roll 3–4 (was 3–6). Rares you already own keep all their affixes.
- **Difficulty:**
  - Monster life and damage grow faster per level.
  - Champion packs (blue) and named uniques (gold) carry modifiers: Extra Strong, Extra Fast, Stone Skin, Fire Enchanted and Cold Enchanted.
  - Monsters are denser later in each act and in later acts.
  - Level bosses have +25% life; final bosses have +20% life.
  - Potions heal over 1.5 s, with a 1.5 s cooldown per kind.
  - Natural regen is slower and potions drop less often.
  - Gear requirements climb faster, so stat points matter.

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
