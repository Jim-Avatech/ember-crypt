/** Barbarian skill tree modeled on Diablo II: Lord of Destruction (names, tabs, level gates, prerequisites). */
export type Tab = "combat" | "masteries" | "warcries";

export interface SkillDef {
  id: string;
  name: string;
  tab: Tab;
  reqLvl: number;
  prereq: string[];
  row: number;
  col: number;
  kind: "active" | "passive";
  implemented: boolean;
  glyph: string;
  mana?: (lvl: number) => number;
  /** one-line summary */
  blurb: string;
  /** effect text at a given skill level */
  effect?: (lvl: number) => string;
}

export const TAB_NAMES: Record<Tab, string> = {
  combat: "Combat Skills",
  masteries: "Combat Masteries",
  warcries: "Warcries",
};

export const MAX_SKILL_LVL = 20;

// ---- numbers used by both the game and the descriptions ----
export const bashDmg = (l: number) => 50 + (l - 1) * 10; // % damage
export const bashAR = (l: number) => 20 + (l - 1) * 5;
export const doubleSwingAR = (l: number) => 15 + (l - 1) * 5;
export const stunDur = (l: number) => 1 + l * 0.2;
export const stunAR = (l: number) => 15 + (l - 1) * 10;
export const doubleThrowAR = (l: number) => 20 + (l - 1) * 7;
export const frenzyDmg = (l: number) => 50 + (l - 1) * 9;
export const frenzyAR = (l: number) => 20 + (l - 1) * 6;
/** per-stack attack speed and move speed, in % */
export const frenzyIas = (l: number) => Math.min(14, 6 + Math.floor((l - 1) / 2));
export const frenzyMove = (l: number) => Math.min(12, 5 + Math.floor((l - 1) / 3));
export const FRENZY_MAX_STACKS = 5;
export const FRENZY_HOLD = 4; // seconds a stack lasts without hitting
export const leapRange = (l: number) => Math.min(9, 4 + l * 0.3);
export const leapAttackDmg = (l: number) => 100 + (l - 1) * 25;
export const masteryDmg = (l: number) => 28 + (l - 1) * 8;
export const masteryAR = (l: number) => 28 + (l - 1) * 8;
export const masteryCrit = (l: number) => (l <= 0 ? 0 : Math.min(30, 3 + (l - 1) * 2));
export const ironSkinDef = (l: number) => 30 + (l - 1) * 10;
export const incSpeed = (l: number) => (l <= 0 ? 0 : Math.round(13 + (37 * (l - 1)) / (l + 5)));
export const howlDur = (l: number) => 3 + l;
export const findPotionChance = (l: number) => Math.min(70, 15 + (l - 1) * 3);
export const shoutDef = (l: number) => 100 + (l - 1) * 10;
export const shoutDur = (l: number) => 10 + l * 2;
export const boPct = (l: number) => 35 + (l - 1) * 3;
export const boDur = (l: number) => 30 + l * 5;

const S = (d: Partial<SkillDef> & Pick<SkillDef, "id" | "name" | "tab" | "reqLvl" | "row" | "col" | "glyph" | "blurb">): SkillDef => ({
  prereq: [],
  kind: "active",
  implemented: false,
  ...d,
});

export const SKILLS: SkillDef[] = [
  // ---------------- Combat Skills ----------------
  S({
    id: "bash", name: "Bash", tab: "combat", reqLvl: 1, row: 0, col: 0, glyph: "⚒", implemented: true,
    blurb: "A powerful blow that knocks the enemy back.",
    mana: () => 2,
    effect: (l) => `+${bashDmg(l)}% damage, +${bashAR(l)}% attack rating, knockback`,
  }),
  S({
    id: "leap", name: "Leap", tab: "combat", reqLvl: 6, row: 1, col: 1, glyph: "⤴", implemented: true,
    blurb: "Leap away (in the joystick direction) and knock back nearby enemies when you land.",
    mana: () => 5,
    effect: (l) => `Leap ${leapRange(l).toFixed(1)} yards, knockback on landing`,
  }),
  S({
    id: "double_swing", name: "Double Swing", tab: "combat", reqLvl: 6, row: 1, col: 2, glyph: "⚔", prereq: ["bash"], implemented: true,
    blurb: "Strike with both weapons, one hit each. With one weapon, it hits twice.",
    mana: () => 2,
    effect: (l) => `Hits twice, +${doubleSwingAR(l)}% attack rating`,
  }),
  S({
    id: "stun", name: "Stun", tab: "combat", reqLvl: 12, row: 2, col: 0, glyph: "✷", prereq: ["bash"], implemented: true,
    blurb: "A blow that leaves the enemy stunned.",
    mana: () => 2,
    effect: (l) => `Stuns for ${stunDur(l).toFixed(1)}s, +${stunAR(l)}% attack rating`,
  }),
  S({
    id: "double_throw", name: "Double Throw", tab: "combat", reqLvl: 12, row: 2, col: 2, glyph: "⇉", prereq: ["double_swing"], implemented: true,
    blurb: "Throw both weapons at once, one from each hand. Needs a throwing weapon in each hand (knives, throwing axes or javelins).",
    mana: () => 1,
    effect: (l) => `Throws one weapon per hand, +${doubleThrowAR(l)}% attack rating`,
  }),
  S({
    id: "leap_attack", name: "Leap Attack", tab: "combat", reqLvl: 18, row: 3, col: 1, glyph: "⇓", prereq: ["leap"], implemented: true,
    blurb: "Leap onto the nearest enemy and smash it.",
    mana: () => 9,
    effect: (l) => `+${leapAttackDmg(l)}% damage`,
  }),
  S({ id: "concentrate", name: "Concentrate", tab: "combat", reqLvl: 18, row: 3, col: 0, glyph: "◎", prereq: ["stun"], blurb: "An uninterruptible attack that boosts defense." }),
  S({
    id: "frenzy", name: "Frenzy", tab: "combat", reqLvl: 24, row: 4, col: 2, glyph: "≋", prereq: ["double_throw"], implemented: true,
    blurb: "Two quick hits. Each hit stacks extra attack and move speed (up to 5). Stacks fade after a few seconds without hitting.",
    mana: () => 3,
    effect: (l) => `+${frenzyDmg(l)}% damage, +${frenzyAR(l)}% attack, +${frenzyIas(l)}% attack speed and +${frenzyMove(l)}% move speed per stack`,
  }),
  S({ id: "whirlwind", name: "Whirlwind", tab: "combat", reqLvl: 30, row: 5, col: 1, glyph: "↻", prereq: ["leap_attack", "concentrate"], blurb: "Spin through enemies, striking everything nearby." }),
  S({ id: "berserk", name: "Berserk", tab: "combat", reqLvl: 30, row: 5, col: 0, glyph: "☠", prereq: ["concentrate"], blurb: "A reckless magic-damage attack." }),

  // ---------------- Combat Masteries ----------------
  S({
    id: "sword_mastery", name: "Sword Mastery", tab: "masteries", reqLvl: 1, row: 0, col: 0, glyph: "†", kind: "passive", implemented: true,
    blurb: "Passive: better with swords.",
    effect: (l) => `+${masteryDmg(l)}% damage, +${masteryAR(l)}% attack, ${masteryCrit(l)}% critical strike`,
  }),
  S({
    id: "axe_mastery", name: "Axe Mastery", tab: "masteries", reqLvl: 1, row: 0, col: 1, glyph: "ᚨ", kind: "passive", implemented: true,
    blurb: "Passive: better with axes.",
    effect: (l) => `+${masteryDmg(l)}% damage, +${masteryAR(l)}% attack, ${masteryCrit(l)}% critical strike`,
  }),
  S({
    id: "mace_mastery", name: "Mace Mastery", tab: "masteries", reqLvl: 1, row: 0, col: 2, glyph: "♣", kind: "passive", implemented: true,
    blurb: "Passive: better with maces and clubs.",
    effect: (l) => `+${masteryDmg(l)}% damage, +${masteryAR(l)}% attack, ${masteryCrit(l)}% critical strike`,
  }),
  S({
    id: "polearm_mastery", name: "Pole Arm Mastery", tab: "masteries", reqLvl: 1, row: 1, col: 0, glyph: "⟊", kind: "passive", implemented: true,
    blurb: "Passive: better with pole arms. In Ember Crypt that means the Quarterstaff.",
    effect: (l) => `+${masteryDmg(l)}% damage, +${masteryAR(l)}% attack, ${masteryCrit(l)}% critical strike`,
  }),
  S({
    id: "throwing_mastery", name: "Throwing Mastery", tab: "masteries", reqLvl: 1, row: 1, col: 1, glyph: "➶", kind: "passive", implemented: true,
    blurb: "Passive: better when throwing knives, throwing axes and javelins.",
    effect: (l) => `+${masteryDmg(l)}% damage, +${masteryAR(l)}% attack, ${masteryCrit(l)}% critical strike`,
  }),
  S({
    id: "spear_mastery", name: "Spear Mastery", tab: "masteries", reqLvl: 1, row: 1, col: 2, glyph: "↑", kind: "passive", implemented: true,
    blurb: "Passive: better with spears. In Ember Crypt that means a javelin used in melee.",
    effect: (l) => `+${masteryDmg(l)}% damage, +${masteryAR(l)}% attack, ${masteryCrit(l)}% critical strike`,
  }),
  S({ id: "increased_stamina", name: "Increased Stamina", tab: "masteries", reqLvl: 12, row: 2, col: 0, glyph: "♥", kind: "passive", blurb: "Passive: more stamina." }),
  S({
    id: "iron_skin", name: "Iron Skin", tab: "masteries", reqLvl: 18, row: 3, col: 2, glyph: "⛨", kind: "passive", implemented: true,
    blurb: "Passive: tougher skin.",
    effect: (l) => `+${ironSkinDef(l)}% defense`,
  }),
  S({
    id: "increased_speed", name: "Increased Speed", tab: "masteries", reqLvl: 24, row: 4, col: 0, glyph: "»", kind: "passive", prereq: ["increased_stamina"], implemented: true,
    blurb: "Passive: move faster.",
    effect: (l) => `+${incSpeed(l)}% movement speed`,
  }),
  S({ id: "natural_resistance", name: "Natural Resistance", tab: "masteries", reqLvl: 30, row: 5, col: 2, glyph: "❂", kind: "passive", prereq: ["iron_skin"], blurb: "Passive: elemental resistances." }),

  // ---------------- Warcries ----------------
  S({
    id: "howl", name: "Howl", tab: "warcries", reqLvl: 1, row: 0, col: 0, glyph: "☊", implemented: true,
    blurb: "Nearby monsters flee in terror.",
    mana: () => 4,
    effect: (l) => `Monsters flee for ${howlDur(l)}s`,
  }),
  S({
    id: "find_potion", name: "Find Potion", tab: "warcries", reqLvl: 1, row: 0, col: 2, glyph: "⚱", implemented: true,
    blurb: "Search a nearby corpse for a potion.",
    mana: () => 0,
    effect: (l) => `${findPotionChance(l)}% chance to find a potion`,
  }),
  S({ id: "taunt", name: "Taunt", tab: "warcries", reqLvl: 6, row: 1, col: 0, glyph: "☄", prereq: ["howl"], blurb: "Enrage a monster into attacking you." }),
  S({
    id: "shout", name: "Shout", tab: "warcries", reqLvl: 6, row: 1, col: 1, glyph: "◈", prereq: ["howl"], implemented: true,
    blurb: "Raise your defense.",
    mana: () => 6,
    effect: (l) => `+${shoutDef(l)}% defense for ${shoutDur(l)}s`,
  }),
  S({ id: "find_item", name: "Find Item", tab: "warcries", reqLvl: 12, row: 2, col: 2, glyph: "✦", prereq: ["find_potion"], blurb: "Search a corpse for an item." }),
  S({ id: "battle_cry", name: "Battle Cry", tab: "warcries", reqLvl: 18, row: 3, col: 0, glyph: "✕", prereq: ["taunt"], blurb: "Weaken nearby monsters." }),
  S({
    id: "battle_orders", name: "Battle Orders", tab: "warcries", reqLvl: 24, row: 4, col: 1, glyph: "⚑", prereq: ["shout"], implemented: true,
    blurb: "Raise your maximum life and mana.",
    mana: () => 7,
    effect: (l) => `+${boPct(l)}% max life and mana for ${boDur(l)}s`,
  }),
  S({ id: "grim_ward", name: "Grim Ward", tab: "warcries", reqLvl: 24, row: 4, col: 2, glyph: "☗", prereq: ["find_item"], blurb: "Turn a corpse into a frightening totem." }),
  S({ id: "war_cry", name: "War Cry", tab: "warcries", reqLvl: 30, row: 5, col: 0, glyph: "✺", prereq: ["battle_cry", "battle_orders"], blurb: "Damage and stun nearby monsters." }),
  S({ id: "battle_command", name: "Battle Command", tab: "warcries", reqLvl: 30, row: 5, col: 1, glyph: "⚜", prereq: ["battle_orders"], blurb: "+1 to all skills for a while." }),
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
