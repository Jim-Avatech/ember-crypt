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
