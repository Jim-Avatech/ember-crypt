/**
 * Patch notes shown in Settings → 📜 Patch notes, newest first. Every release adds one entry at the TOP of this list
 * (a few very short bullets). The game's version label is read from the first entry.
 */
export interface PatchNote {
  version: string;
  title: string;
  notes: string[];
}

export const PATCH_NOTES: PatchNote[] = [
  {
    version: "1.7.1",
    title: "One rule for every hero",
    notes: [
      "Leech now follows one rule for every hero, set by what deals the damage: weapon hits leech in full; spells and skill effects (War Cry too, which didn't leech before) leech at 35%, capped; Valkyries never leech for you.",
      "The Character screen's Spell DPS and Cast time rows now show for any hero with a damaging spell learned, not just the Sorceress.",
    ],
  },
  {
    version: "1.7",
    title: "Base spell damage",
    notes: [
      "Every hero now has a base spell damage (what a 100% spell hits for), shown on the Character screen and in spell tooltips: character level + Energy + caster items.",
      "Energy raises it (each point a little less than the one before), so a caster now chooses between Energy and Vitality.",
      "Wands, orbs and battle staves carry “+N Base Spell Damage”, more the higher the item level (a battle staff as much as a wand and an orb together). Other weapons carry none: a Sorceress with a sword casts weaker spells.",
      "Spell multiples are lower to match: with a caster weapon of her level and some Energy a Sorceress hits a little harder than before (about 10–18% more for mid- and high-level heroes); without a caster weapon about 25% less.",
    ],
  },
  {
    version: "1.6.4",
    title: "Spells leech",
    notes: [
      "Life and mana leech now work with spells and skill effects too (Sorceress spells, Exploding/Freezing Arrow bursts, Lightning Fury and Charged Strike bolts, Plague and Immolation clouds) at 35% of your leech, and they return at most 4% of your max life and 4% of your max mana a second, so a big pack can't heal you outright. Weapon hits leech in full as before.",
    ],
  },
  {
    version: "1.6.3",
    title: "+Skills like Diablo II, potion stacks",
    notes: [
      "Charged Bolt spreads a bit wider: a 45° cone around your aim (was 30°), with a bit more wander. About half of the bolts reach an enemy 6 tiles away (was about 6 of 10).",
      "“+1 to Frozen Armor” (or any single skill) on an item now gives you that skill even with no points in it, as long as it's your class and you meet its level. It shows in blue in the skill tree, goes on an empty skill button, and leaves your buttons when you take the item off. It doesn't open the skills after it.",
      "“+2 to Fire Spells” and “+1 to Sorceress Skill Levels” still only raise skills you have (points, or granted by an item), like Diablo II.",
      "Healing and mana potions stack in the backpack and stash (up to 20 a cell), and move into your belt by themselves whenever it has room. Older saves merge their loose potions; none are lost.",
    ],
  },
  {
    version: "1.6.2",
    title: "Charged Bolt aims better",
    notes: [
      "Charged Bolt: every bolt now leaves inside a 30° cone around your aim (was about 80°). They still jink and wiggle, but each one keeps heading roughly toward the spot you aimed at, so most of them reach an enemy 6 tiles away (about 6 of 10 there, was about 1 of 10).",
    ],
  },
  {
    version: "1.6.1",
    title: "Sorceress fixes",
    notes: [
      "Spell tooltips now show your spell base damage (what a 100% spell hits for at your level) and the real damage each level does, e.g. “Fire Ball … = 331–448 fire”. The Character screen shows your spell base damage and cast time.",
      "New affixes: +1–2 to all skills of a class (“+1 to Sorceress Skill Levels”) and +1–3 to one skill tree (“+2 to Fire Spells”). Staves, wands and orbs roll them for the Sorceress, bows, spears and javelins for the Amazon, other weapons and helms for the Barbarian, amulets mostly for your own class. Brann can add them too.",
      "New affix: Faster Cast Rate (+10/20/30%), mostly on staves, wands and orbs, also on amulets, rings and helms. It shortens a spell's 0.5 s cast (up to twice as fast at +100%) and counts in Spell DPS.",
      "Static Field reaches much further (6.5 tiles at level 1, was 3.9; up to 10), shows its full reach when cast, no longer hits through walls, and always takes at least 1 life from a monster that has some to lose.",
      "Mana comes back faster: the Sorceress regenerates 2× as fast as the others (was 1.5×) and Warmth gives +60% at level 1 and +20% a level (was +30% and +12%).",
    ],
  },
  {
    version: "1.6",
    title: "The Sorceress",
    notes: [
      "New hero: the Sorceress, from Diablo II. Make one from New hero. Frail (10 Strength, 10 Vitality) but with deep mana (35 Energy, 2 mana a level and per Energy point) that comes back 1.5× as fast as the others'. She starts with a battle staff; a wand waits in her bag.",
      "Three spell trees with Diablo II's skills, levels and prerequisites: Fire (Fire Bolt to Meteor and Hydra), Cold (Ice Bolt to Blizzard and Frozen Orb, three ice armors) and Lightning (Charged Bolt to Chain Lightning, Thunder Storm, Teleport and Energy Shield). Spell damage grows with her level and the skill's level, never her weapon; each Mastery adds to its element. No synergies.",
      "Kept simple for phones: Telekinesis knocks an enemy back and stuns it; Teleport blinks the way you aim (never through walls); Inferno is a short burst of flame; Hydra is a head that stays put (up to 3); Thunder Storm strikes nearby enemies on its own; Static Field never kills and never takes a boss below half its life. Meteor, Blizzard, Fire Wall, Frozen Orb and Hydra have short cooldowns.",
      "Her armors, Energy Shield, Enchant, Thunder Storm, Blaze and Hydras show on the buff bar. The Character screen shows Spell DPS for her main spell, and the training dummy counts spell damage.",
      "New items: battle staves (two-handed), wands and orbs (off-hand, where a shield goes). Their +skill rolls are Sorceress spells only. Like the Amazon she can't dual wield. Loot leans to her items like it does for the other classes; how often items drop is unchanged.",
    ],
  },
  {
    version: "1.5.1",
    title: "Levels numbered within each act",
    notes: [
      "Level numbers count 1–20 within each act everywhere you see them: above the minimap (“Act 4 · Level 7”, not “Level 67”), the waypoint list, arrival and portal messages, and the Character screen's deepest level.",
    ],
  },
  {
    version: "1.5",
    title: "Where you are, fair DPS, coloured resistances",
    notes: [
      "The act and level you're on (like “Act 3 · Level 2”) now show above the minimap, top left.",
      "A weapon you don't have the Strength, Dexterity or level for now shows the DPS you'd get with just enough of what's missing (80 Dexterity with 90 required counts as 90). Stats you already have enough of count as they are. It still shows red until you meet the requirements.",
      "No more red “Main hand only” notes or Off-hand button for the Amazon. She still can't put a weapon in her off-hand; trying says so briefly.",
      "Character screen: one Resistances row in colour: green poison, yellow lightning, red fire, blue cold. Items, the shop and compare use the same colours, and life leech (red) and mana leech (blue) are coloured too.",
    ],
  },
  {
    version: "1.4",
    title: "Brann the Runesmith, one affix pool, no doubled affixes",
    notes: [
      "New in camp: Brann the Runesmith, northwest of the campfire. For gold he adds one random affix to an item in your backpack or one you're wearing: normal → magic (1 affix) → magic (2) → rare (3) → rare (4). Four is the most an item can hold. Each step costs more (and more for higher item levels); he shows the price and asks first, and takes carried gold before stash gold.",
      "Affixes are one pool now: any affix can roll in any slot, with no prefix/suffix limits. Magic items still get 1–2 and rares 3–4.",
      "The same stat can never roll twice on one item (before, two Magic Find rows or two Attack Rating rows could). Items you already have with a doubled stat were merged into one row, keeping the higher value. Nothing was removed.",
      "Lightning Fury rebalanced: it did 1.4–2× Lightning Strike's damage, now about 85–90% of it (it's the safer, ranged one). Its bolts reach as many enemies as Strike's chain (3 at level 1 up to 9) for 40% of your hit at level 1, up 10.5% a level (13% past level 10), and the javelin itself hits for half. Lightning Strike is unchanged.",
      "More monsters act by act: Act I is the same, and every later act has 25% more monsters than the act before (Act II 1.25×, Act III about 1.56×, Act IV about 1.95× Act I). The extra packs go to the emptiest rooms, never the room you arrive in or the boss's room, and never crowd a room or a corridor. Bosses are still alone.",
    ],
  },
  {
    version: "1.3.2",
    title: "Amazons don't dual wield",
    notes: [
      "Like Diablo II, only the Barbarian dual wields. The Amazon holds one one-handed weapon; her off-hand takes a shield, or a quiver with a bow. Equipping, dragging and the compare sheet show why a second weapon can't go in her off-hand, and her DPS never counts one.",
      "An Amazon who had a weapon in her off-hand gets it back in her bag (or, if the bag is full, in the camp stash, or on the ground in camp next to her). Nothing is lost.",
    ],
  },
  {
    version: "1.3.1",
    title: "Ice Arrow pierces you can see",
    notes: [
      "Ice Arrow always pierced as often as any other arrow, but the Pierce tag, sparks and glow were ice blue, the same colour as its damage numbers and the frozen monster, so you couldn't see it. Pierces are now bright magenta \"⇶ Pierce\" above the damage number, with a magenta streak on the arrow, on every arrow.",
      "Checked every arrow and throw: a normal shot, Magic, Fire, Cold and Ice Arrow, Multiple Shot, Strafe, thrown weapons and Poison Javelin pierce; Exploding, Immolation and Freezing Arrow burst and stop, Guided Arrow stops on its target, Lightning Bolt always passes through.",
    ],
  },
  {
    version: "1.3",
    title: "Buff bar, freeze resistance, Pierce you can see, DPS, training dummy",
    notes: [
      "Every timed effect now shows in one buff bar along the top, both classes: warcries, Frenzy, Concentrate, Berserk, Slow Missiles, Decoy, Grim Ward, Inner Sight, Battle Cry, Taunt, plus chill and poison, each with seconds left and a draining bar.",
      "Freeze resistance: champions, uniques and bosses resist freezes more the deeper you go, and after a freeze they can't be frozen again for a moment, so nothing tough can be freeze-locked. Act bosses are only chilled. Normal monsters freeze as before.",
      "Pierce always worked (about half your arrows at 51%), but you couldn't tell. A piercing arrow now glows, the monster shows \"Pierce\", and the arrow flies on into the next one.",
      "DPS: weapon tooltips, the compare sheet and the Character screen show your normal attack's damage per second (damage, attack speed and crits together), so a Short Bow vs a Long Bow is easy to compare.",
      "A training dummy stands in camp, west of the campfire. It never dies or fights back and gives nothing; hit it to see every hit and a live DPS meter (last 5 seconds, total, hits).",
      "Strafe toned down a little: −30% damage per arrow at level 1, +4% per level (was −20%, +5%), and its volley takes slightly longer. It's still the strongest single-target bow skill.",
    ],
  },
  {
    version: "1.2.2",
    title: "Guided Arrow really homes",
    notes: [
      "Guided Arrow now seeks like it should: it locks onto the monster you aim at (even one around a corner), and if there isn't one it grabs the nearest monster it can see while flying, so a shot down a hall curves into the room instead of hitting the back wall.",
      "It turns smoothly, follows the way around corners, never passes through walls, and picks a new target if its first one dies.",
    ],
  },
  {
    version: "1.2.1",
    title: "Multiple Shot rebalance",
    notes: [
      "Multiple Shot's arrows now share one volley's damage: the whole volley is 125% of a normal shot at level 1, +5% per level (level 10: 170%, level 20: 220%), split evenly over the arrows (still +1 arrow per level, up to 12).",
      "Point-blank shotgunning still works (every arrow can hit the same monster), it just pays off less wildly. The tooltip shows damage per arrow and the volley total.",
    ],
  },
  {
    version: "1.2",
    title: "Respec one point at a time, any skill on ⚔",
    notes: [
      "Respec: take one point out of a skill (Skills → − Point) or a stat (Character → −) and get it back to spend again. Each point costs 50 gold × your level (level 20: 1,000 gold), paid from the gold you carry, then your stash gold when you're in camp.",
      "You can't remove a point a learned skill depends on, go below your class's starting stats, or drop a stat your worn gear needs.",
      "Any learned skill can go on the main ⚔ button (Skills → pick a skill → ⚔). It works like a skill button: attack skills repeat while held and swing normally when you're out of mana; warcries and other helpers fire once per press, then holding ⚔ keeps attacking.",
    ],
  },
  {
    version: "1.1",
    title: "Gentler early levels, class loot, stash gold, buy-back",
    notes: [
      "Early levels are easier: on level 1 monsters have 20% less life and deal 10% less damage, easing back to normal by the end of Act III. Act IV is unchanged; boss damage is unchanged everywhere.",
      "Loot leans to your class (Amazons find more bows, javelins and spears; Barbarians more swords, axes and maces). Hilde always stocks a magic weapon for your class.",
      "+skill items match the item: bows give Bow skills, javelins and spears give Javelin skills, other weapons and helms give Barbarian skills, amulets mostly your own class.",
      "Gear you no longer meet the requirements for turns red and stops working until you do.",
      "Stash gold: each hero can keep gold in the camp stash. It's yours only and safe when you die (you still lose 10% of the gold you carry).",
      "Hilde's buy-back row: your last 8 sales, kept separate from her wares.",
      "Potions: a To belt button, and the belt refills from your backpack after you drink.",
      "Amazons shoot and throw javelins 15% faster, and arrows leave the bow sooner.",
      "Bosses chase further (45 steps) and give up only after 8 seconds without being hit or seeing you; they heal once home. Other monsters give up after 5 seconds out of sight. Fallen scatter when a packmate dies.",
      "Corridors are 3 tiles wide. Only waypoint levels (1 and every 5th) show a waypoint stone. The Character panel says which stat adds damage for your weapon.",
      "The Character screen shows your hero's name and class (it always said Barbarian).",
    ],
  },
  {
    version: "1.0.1",
    title: "Bigger stacks, levels that stay cleared, delete hero, bosses that chase",
    notes: [
      "Arrows 600 → 1,200 per quiver; Javelins 100 → 200, Throwing Axes 120 → 240, Throwing Knives 160 → 320. Existing stacks fill up next time you're in camp.",
      "A level you leave stays as you left it (kills, loot, dead boss) for 5 minutes; after that it's fresh again. Monsters still alive heal while you're away.",
      "Delete a hero from the hero screen (🗑, then type the name to confirm). Other heroes and the shared stash are kept.",
      "Hero slots 8 → 12.",
      "Bosses no longer get stuck in their room: they follow you through doorways and corridors. They give up only when you're 28+ steps from their room, then walk back and heal.",
      "New: these patch notes.",
    ],
  },
  {
    version: "1.0",
    title: "The Amazon and hero slots",
    notes: [
      "New class: the Amazon, with all 30 skills in 3 tabs (Bow & Crossbow, Passive & Magic, Javelin & Spear).",
      "New items: Short Bow (faster), Long Bow (harder hits), Arrows (off-hand quiver, refills in camp) and a two-handed Spear.",
      "Basic attacks: Attack/Stab, Throw and Shoot; any of them can go on a skill button, and ⚔ can be set to one.",
      "Javelins are held overhead, pointing forward, for both classes: stab from the grip or throw.",
      "Hero select: up to 8 heroes, your existing hero is hero 1. The camp stash is shared by all heroes.",
      "Same loot for every class; the Amazon wears lighter-looking armor.",
    ],
  },
  {
    version: "0.9.4",
    title: "Life ring and tougher bosses",
    notes: [
      "Life and mana arcs under the hero's feet (HUD option C); the corner orbs are gone.",
      "Low life (under 35%): a red heartbeat pulse at the screen edge, with sound.",
      "Bosses hit about 80% of the time and harder, with a telegraphed ground slam (step out of the red ring).",
      "Boss modifiers from level 7 (Extra Fast or Stone Skin).",
    ],
  },
  {
    version: "0.9.3",
    title: "Harder monsters",
    notes: ["Monsters +30% life and +50% damage; bosses 1.9× life.", "The skill page offers only buttons 1–3."],
  },
  {
    version: "0.9.2",
    title: "Fewer drops, three skill buttons",
    notes: [
      "Item drops halved again (about 4.2% of normal kills).",
      "Three skill buttons; no top-left text; the boss bar stays clear of the HUD.",
      "Monsters +30% life, +25% damage.",
      "Throwing stacks ×4; rings ask Left or Right.",
    ],
  },
  {
    version: "0.9.1",
    title: "Fewer drops, two-handed grip",
    notes: ["Item drops halved (same quality mix).", "Two-handed weapons are held with both hands, with chop and sweep swings."],
  },
  {
    version: "0.9",
    title: "Every Barbarian skill",
    notes: ["All 30 Barbarian skills work (Whirlwind, Berserk, warcries and more).", "Skill buttons beside ⚔."],
  },
  {
    version: "0.8.3",
    title: "Back up to Files",
    notes: ["📁 Back up to Files (iCloud Drive) and Restore from file.", "A reminder when the last file backup is over a day old."],
  },
  {
    version: "0.8.2",
    title: "Compare cards scroll",
    notes: ["Item compare cards scroll by touch."],
  },
  {
    version: "0.8.1",
    title: "Black screen fix",
    notes: ["Fixed a black screen after an update.", "A boot screen with repair and backup options if loading ever fails."],
  },
];

export const GAME_VERSION = PATCH_NOTES[0].version;
