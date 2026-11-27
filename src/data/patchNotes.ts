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
      "Early levels are easier: on level 1 monsters have 20% less life and deal 10% less damage, easing back to normal by level 60. Levels 60–80 are unchanged; boss damage is unchanged everywhere.",
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
