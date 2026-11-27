import { SORC_SKILLS } from "./sorc";

/** Barbarian and Amazon skill trees modeled on Diablo II: Lord of Destruction (names, tabs, level gates, prerequisites). */
export type Tab = "combat" | "masteries" | "warcries" | "bow" | "passive" | "javelin" | "fire" | "cold" | "lightning" | "basic";
/** v1.0 hero classes (v1.6: the Sorceress) */
export type HeroClass = "barbarian" | "amazon" | "sorceress";
export const CLASS_NAME: Record<HeroClass, string> = { barbarian: "Barbarian", amazon: "Amazon", sorceress: "Sorceress" };
export const HERO_CLASSES: HeroClass[] = ["barbarian", "amazon", "sorceress"];

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
  /** v1.0: which class can learn it ("any" = basic attacks everyone has) */
  cls: HeroClass | "any";
}

export const TAB_NAMES: Record<Tab, string> = {
  combat: "Combat Skills",
  masteries: "Combat Masteries",
  warcries: "Warcries",
  bow: "Bow & Crossbow",
  passive: "Passive & Magic",
  javelin: "Javelin & Spear",
  fire: "Fire Spells",
  cold: "Cold Spells",
  lightning: "Lightning Spells",
  basic: "Basic",
};
/** v1.0: skill tabs per class, in D2 order, then the basic attacks everyone has */
export const CLASS_TABS: Record<HeroClass, Tab[]> = {
  barbarian: ["combat", "masteries", "warcries", "basic"],
  amazon: ["bow", "passive", "javelin", "basic"],
  sorceress: ["fire", "cold", "lightning", "basic"],
};
/** v1.0: basic attacks (no points needed) that can go on a skill button or the main attack button */
export const BASIC_IDS = ["basic_attack", "basic_throw", "basic_shoot"] as const;
export type BasicId = (typeof BASIC_IDS)[number];
export const isBasic = (id: string | null | undefined): id is BasicId => !!id && (BASIC_IDS as readonly string[]).includes(id);

export const MAX_SKILL_LVL = 20;
/** Skill buttons next to the attack button (v0.9: 4, was 3). */
export const SKILL_SLOTS = 3; // v0.9.2: back to three buttons (James prefers three)

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
/** Shout lasts longer for each hard point in Battle Orders and Battle Command (D2 synergy). */
export const shoutDur = (l: number, syn = 0) => 10 + l * 2 + syn * 5;
export const boPct = (l: number) => 35 + (l - 1) * 3;
/** Battle Orders lasts longer for each hard point in Shout and Battle Command (D2 synergy). */
export const boDur = (l: number, syn = 0) => 30 + l * 5 + syn * 5;
// ---- v0.9: the rest of the tree ----
export const concDmg = (l: number) => 70 + (l - 1) * 15;
export const concAR = (l: number) => 40 + (l - 1) * 5;
export const concDef = (l: number) => 100 + (l - 1) * 5;
export const berserkDmg = (l: number) => 75 + (l - 1) * 15;
export const berserkAR = (l: number) => 100 + (l - 1) * 10;
export const BERSERK_DEF_T = 1.5;
export const wwDmg = (l: number) => (l - 1) * 8;
export const wwAR = (l: number) => (l - 1) * 5;
export const WW_TICK = 0.22;
export const WW_DUR = 1.0;
export const stamLife = (l: number) => (l <= 0 ? 0 : Math.round(4 + (l - 1) * 1.5));
export const stamRegen = (l: number) => (l <= 0 ? 0 : 10 + (l - 1) * 5);
export const natRes = (l: number) => (l <= 0 ? 0 : Math.round(12 + (68 * (l - 1)) / (l + 5)));
export const tauntDmg = (l: number) => Math.min(60, 10 + (l - 1) * 3);
export const tauntDur = (l: number) => 8 + l;
export const findItemChance = (l: number) => Math.min(60, 14 + Math.round((l - 1) * 2.5));
export const bcDef = (l: number) => Math.min(80, 50 + (l - 1) * 2);
export const BC_DMG = 25;
export const bcDur = (l: number) => 8 + l * 2;
export const grimRadius = (l: number) => Math.min(6, 2.6 + l * 0.2);
export const grimDur = (l: number) => 20 + l * 2;
/** War Cry damage; +6% per hard point in Howl, Taunt, Battle Cry and Battle Orders (D2 synergy). */
export const warCryDmg = (l: number, syn = 0): [number, number] => {
  const k = 1 + (6 * syn) / 100;
  return [Math.round((16 + (l - 1) * 9) * k), Math.round((22 + (l - 1) * 11) * k)];
};
export const warCryStun = (l: number) => Math.min(3, 0.8 + l * 0.12);
export const bcmdBonus = (l: number) => (l <= 0 ? 0 : 1 + Math.floor((l - 1) / 9));
export const bcmdDur = (l: number) => 20 + l * 5;

const S = (d: Partial<SkillDef> & Pick<SkillDef, "id" | "name" | "tab" | "reqLvl" | "row" | "col" | "glyph" | "blurb">): SkillDef => ({
  prereq: [],
  kind: "active",
  implemented: false,
  cls: d.tab === "bow" || d.tab === "passive" || d.tab === "javelin" ? "amazon" : d.tab === "basic" ? "any" : "barbarian",
  ...d,
});

// ---- v1.0 Amazon numbers (elemental parts are a % of the weapon's average hit, so they keep up with item level) ----
export const jabDmg = (l: number) => -15 + (l - 1) * 5;
export const jabAR = (l: number) => 10 + (l - 1) * 8;
export const powerStrikeLight = (l: number) => 50 + (l - 1) * 20;
export const poisonJavDps = (l: number) => 14 + (l - 1) * 5;
export const impaleDmg = (l: number) => 100 + (l - 1) * 25;
export const impaleAR = (l: number) => 25 + (l - 1) * 5;
export const lightningBoltDmg = (l: number) => 110 + (l - 1) * 30;
export const chargedStrikeBolts = (l: number) => Math.min(8, 2 + Math.floor(l / 2));
export const chargedStrikeDmg = (l: number) => 35 + (l - 1) * 12;
export const plagueDps = (l: number) => 30 + (l - 1) * 10;
export const fendDmg = (l: number) => 40 + (l - 1) * 10;
export const fendAR = (l: number) => 40 + (l - 1) * 10;
export const lightningStrikeHits = (l: number) => Math.min(8, 2 + Math.floor(l / 3));
export const lightningStrikeDmg = (l: number) => 80 + (l - 1) * 25;
/**
 * v1.4: Lightning Fury rebalanced to about 85-90% of Lightning Strike's DPS at the same skill level and gear (Fury is
 * the safer, ranged one). Before, its thrown javelin (more damage than a stab, and the Amazon throws 15% faster) hit in
 * full and its bolts did 90%+25%/level, so it did 1.4x-2x Strike's DPS. Now the javelin's own hit is FURY_JAV_HIT of a
 * normal throw, the bolts reach as many enemies as Strike's chain (bolts = Strike's chain + 1, it also zaps its target)
 * and each does 40% + 10.5% a level (13% a level past 10) of your hit, tuned in a real-game-loop sim (tests/furySim.ts). Lightning Strike is unchanged.
 */
export const FURY_JAV_HIT = 0.5;
export const furyBolts = (l: number) => Math.min(9, 3 + Math.floor(l / 3));
export const furyDmg = (l: number) => Math.round(40 + (l - 1) * 10.5 + Math.max(0, l - 10) * 2.5);
/** Before v1.4 (kept for the balance test's before/after table). */
export const furyBoltsV13 = (l: number) => Math.min(10, 2 + Math.floor(l / 2));
export const furyDmgV13 = (l: number) => 90 + (l - 1) * 25;
export const innerSightDef = (l: number) => Math.min(70, 30 + (l - 1) * 4);
export const innerSightDur = (l: number) => 8 + l * 4;
export const critStrike = (l: number) => (l <= 0 ? 0 : Math.min(75, Math.round((75 * l) / (l + 3.7))));
export const dodgeChance = (l: number) => (l <= 0 ? 0 : Math.min(70, Math.round(6 + (64 * l) / (l + 4))));
export const avoidChance = (l: number) => (l <= 0 ? 0 : Math.min(75, Math.round(12 + (63 * l) / (l + 4))));
export const evadeChance = dodgeChance;
export const slowMissilesDur = (l: number) => 12 + l * 3;
export const penetrateAR = (l: number) => 35 + (l - 1) * 10;
export const decoyDur = (l: number) => 10 + l * 5;
export const valkDmg = (l: number) => 40 + (l - 1) * 15;
export const valkLife = (l: number) => 150 + (l - 1) * 25; // % of the hero's max life
export const pierceChance = (l: number) => (l <= 0 ? 0 : Math.min(100, Math.round(10 + (90 * l) / (l + 6))));
export const magicArrowDmg = (l: number) => 10 + (l - 1) * 6;
export const fireArrowDmg = (l: number) => 35 + (l - 1) * 15;
export const coldArrowDmg = (l: number) => 25 + (l - 1) * 12;
export const coldArrowChill = (l: number) => 2 + l * 0.4;
export const multiShotArrows = (l: number) => Math.min(12, 2 + l);
/** v1.0–v1.2: each arrow −25% damage (kept for reference; v1.2.1 splits a volley total instead) */
export const MULTI_DMG = -25;
/** v1.2.1: a whole Multiple Shot volley deals this % of your normal hit (125% at level 1, +5% per level)... */
export const multiShotTotal = (l: number) => 125 + 5 * (Math.max(1, l) - 1);
/** ...split evenly over its arrows, so point-blank (every arrow on one monster) is about 1.25× a normal shot */
export const multiShotPer = (l: number) => multiShotTotal(l) / multiShotArrows(l);
const pct1 = (v: number) => `${Math.round(v * 10) / 10}`;
export const explodingDmg = (l: number) => 45 + (l - 1) * 20;
export const guidedDmg = (l: number) => 50 + (l - 1) * 10;
export const iceArrowDmg = (l: number) => 35 + (l - 1) * 12;
export const iceArrowFreeze = (l: number) => Math.min(3, 1 + l * 0.1);
export const strafeArrows = (l: number) => Math.min(10, 4 + Math.ceil(l / 2));
/** v1.3: modest nerf (was -20% +5%/level with a 0.5 + 0.28/arrow draw): on one target Strafe out-damaged every other bow skill 2-3× */
export const strafeDmg = (l: number) => -30 + (l - 1) * 4;
/** v1.3: Strafe's draw time in weapon-speed units: 0.5 + 0.32 per arrow (was 0.28) */
export const strafeDur = (n: number) => 0.5 + 0.32 * n;
export const immolationDmg = (l: number) => 60 + (l - 1) * 20;
export const immolationDps = (l: number) => 25 + (l - 1) * 8;
export const immolationDur = (l: number) => 3 + l * 0.2;
export const freezingDmg = (l: number) => 45 + (l - 1) * 15;
export const freezingFreeze = (l: number) => Math.min(3, 1.4 + l * 0.08);

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
  S({
    id: "concentrate", name: "Concentrate", tab: "combat", reqLvl: 18, row: 3, col: 0, glyph: "◎", prereq: ["stun"], implemented: true,
    blurb: "A focused blow that can't be knocked aside: it lands even if you're hit, and raises your defense while you swing.",
    mana: () => 2,
    effect: (l) => `+${concDmg(l)}% damage, +${concAR(l)}% attack rating, +${concDef(l)}% defense while attacking`,
  }),
  S({
    id: "frenzy", name: "Frenzy", tab: "combat", reqLvl: 24, row: 4, col: 2, glyph: "≋", prereq: ["double_throw"], implemented: true,
    blurb: "Two quick hits. Each hit stacks extra attack and move speed (up to 5). Stacks fade after a few seconds without hitting.",
    mana: () => 3,
    effect: (l) => `+${frenzyDmg(l)}% damage, +${frenzyAR(l)}% attack, +${frenzyIas(l)}% attack speed and +${frenzyMove(l)}% move speed per stack`,
  }),
  S({
    id: "whirlwind", name: "Whirlwind", tab: "combat", reqLvl: 30, row: 5, col: 1, glyph: "↻", prereq: ["leap_attack", "concentrate"], implemented: true,
    blurb: "Spin through enemies for a second, striking everything around you with both weapons. Steer with the joystick; hold the button to keep spinning.",
    mana: () => 8,
    effect: (l) => `+${wwDmg(l)}% damage, +${wwAR(l)}% attack rating, a hit on every nearby enemy every ${WW_TICK}s`,
  }),
  S({
    id: "berserk", name: "Berserk", tab: "combat", reqLvl: 30, row: 5, col: 0, glyph: "☠", prereq: ["concentrate"], implemented: true,
    blurb: "A reckless magic blow that ignores the monster's defense, but drops your own defense to zero for a moment.",
    mana: () => 4,
    effect: (l) => `+${berserkDmg(l)}% magic damage, +${berserkAR(l)}% attack rating, your defense is 0 for ${BERSERK_DEF_T}s`,
  }),

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
  S({
    id: "increased_stamina", name: "Increased Stamina", tab: "masteries", reqLvl: 12, row: 2, col: 0, glyph: "♥", kind: "passive", implemented: true,
    blurb: "Passive: endurance. Ember Crypt has no stamina bar, so it adds life and faster life regeneration instead.",
    effect: (l) => `+${stamLife(l)}% maximum life, +${stamRegen(l)}% life regeneration`,
  }),
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
  S({
    id: "natural_resistance", name: "Natural Resistance", tab: "masteries", reqLvl: 30, row: 5, col: 2, glyph: "❂", kind: "passive", prereq: ["iron_skin"], implemented: true,
    blurb: "Passive: resist fire, cold, lightning and poison (diminishing returns, like D2).",
    effect: (l) => `+${natRes(l)}% to all resistances`,
  }),

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
  S({
    id: "taunt", name: "Taunt", tab: "warcries", reqLvl: 6, row: 1, col: 0, glyph: "☄", prereq: ["howl"], implemented: true,
    blurb: "Enrage the nearest monster: it comes straight for you, but hits weaker and less often.",
    mana: () => 3,
    effect: (l) => `Target deals ${tauntDmg(l)}% less damage and has ${tauntDmg(l)}% less attack rating for ${tauntDur(l)}s`,
  }),
  S({
    id: "shout", name: "Shout", tab: "warcries", reqLvl: 6, row: 1, col: 1, glyph: "◈", prereq: ["howl"], implemented: true,
    blurb: "Raise your defense. Lasts 5s longer per point in Battle Orders and Battle Command.",
    mana: () => 6,
    effect: (l) => `+${shoutDef(l)}% defense for ${shoutDur(l)}s`,
  }),
  S({
    id: "find_item", name: "Find Item", tab: "warcries", reqLvl: 12, row: 2, col: 2, glyph: "✦", prereq: ["find_potion"], implemented: true,
    blurb: "Search a nearby corpse for an item (each corpse can be searched once, by Find Item, Find Potion or Grim Ward).",
    mana: () => 7,
    effect: (l) => `${findItemChance(l)}% chance to find an item`,
  }),
  S({
    id: "battle_cry", name: "Battle Cry", tab: "warcries", reqLvl: 18, row: 3, col: 0, glyph: "✕", prereq: ["taunt"], implemented: true,
    blurb: "Weaken every monster nearby: lower defense and damage.",
    mana: () => 5,
    effect: (l) => `-${bcDef(l)}% defense and -${BC_DMG}% damage for ${bcDur(l)}s`,
  }),
  S({
    id: "battle_orders", name: "Battle Orders", tab: "warcries", reqLvl: 24, row: 4, col: 1, glyph: "⚑", prereq: ["shout"], implemented: true,
    blurb: "Raise your maximum life and mana. Lasts 5s longer per point in Shout and Battle Command.",
    mana: () => 7,
    effect: (l) => `+${boPct(l)}% max life and mana for ${boDur(l)}s`,
  }),
  S({
    id: "grim_ward", name: "Grim Ward", tab: "warcries", reqLvl: 24, row: 4, col: 2, glyph: "☗", prereq: ["find_item"], implemented: true,
    blurb: "Turn a nearby corpse into a totem that frightens monsters away from it (bosses ignore it).",
    mana: () => 4,
    effect: (l) => `Frightens monsters within ${grimRadius(l).toFixed(1)} yards for ${grimDur(l)}s`,
  }),
  S({
    id: "war_cry", name: "War Cry", tab: "warcries", reqLvl: 30, row: 5, col: 0, glyph: "✺", prereq: ["battle_cry", "battle_orders"], implemented: true,
    blurb: "A shout that damages and stuns every monster close to you. +6% damage per point in Howl, Taunt, Battle Cry and Battle Orders.",
    mana: () => 12,
    effect: (l) => `${warCryDmg(l)[0]}-${warCryDmg(l)[1]} damage (before synergies), stun ${warCryStun(l).toFixed(1)}s, radius 4`,
  }),
  S({
    id: "battle_command", name: "Battle Command", tab: "warcries", reqLvl: 30, row: 5, col: 1, glyph: "⚜", prereq: ["battle_orders"], implemented: true,
    blurb: "Raise all your skills for a while (only skills you've put a point in). Also lengthens Shout and Battle Orders.",
    mana: () => 11,
    effect: (l) => `+${bcmdBonus(l)} to all skills for ${bcmdDur(l)}s`,
  }),

  // ================= v1.0 Amazon =================
  // ---------------- Bow and Crossbow ----------------
  S({
    id: "magic_arrow", name: "Magic Arrow", tab: "bow", reqLvl: 1, row: 0, col: 0, glyph: "➶", implemented: true,
    blurb: "A magical arrow that needs no ammunition and is hard to dodge. Needs a bow.",
    mana: () => 1,
    effect: (l) => `+${magicArrowDmg(l)}% damage, ignores defense, uses no arrows`,
  }),
  S({
    id: "fire_arrow", name: "Fire Arrow", tab: "bow", reqLvl: 1, row: 0, col: 2, glyph: "✹", implemented: true,
    blurb: "Shoots a burning arrow that adds fire damage. Needs a bow and arrows.",
    mana: () => 2,
    effect: (l) => `Adds fire damage equal to ${fireArrowDmg(l)}% of your hit`,
  }),
  S({
    id: "cold_arrow", name: "Cold Arrow", tab: "bow", reqLvl: 6, row: 1, col: 1, glyph: "❄", implemented: true,
    blurb: "An icy arrow that adds cold damage and slows the enemy.",
    mana: () => 3,
    effect: (l) => `Adds cold damage equal to ${coldArrowDmg(l)}% of your hit, slows for ${coldArrowChill(l).toFixed(1)}s`,
  }),
  S({
    id: "multiple_shot", name: "Multiple Shot", tab: "bow", reqLvl: 6, row: 1, col: 0, glyph: "⋔", prereq: ["magic_arrow"], implemented: true,
    blurb: "Splits one shot into a fan of arrows that share its damage: all of them on one monster is a bit more than a normal shot.",
    mana: (l) => 4 + Math.floor(l / 2),
    effect: (l) => `${multiShotArrows(l)} arrows, ${pct1(multiShotPer(l))}% damage each (volley total ${multiShotTotal(l)}%)`,
  }),
  S({
    id: "exploding_arrow", name: "Exploding Arrow", tab: "bow", reqLvl: 12, row: 2, col: 2, glyph: "✸", prereq: ["multiple_shot", "fire_arrow"], implemented: true,
    blurb: "An arrow that explodes on impact, burning everything nearby.",
    mana: () => 5,
    effect: (l) => `Explosion deals fire damage equal to ${explodingDmg(l)}% of your hit`,
  }),
  S({
    id: "ice_arrow", name: "Ice Arrow", tab: "bow", reqLvl: 18, row: 3, col: 1, glyph: "❆", prereq: ["cold_arrow"], implemented: true,
    blurb: "An arrow that freezes its target solid.",
    mana: () => 4,
    effect: (l) => `Adds cold damage equal to ${iceArrowDmg(l)}% of your hit, freezes for ${iceArrowFreeze(l).toFixed(1)}s`,
  }),
  S({
    id: "guided_arrow", name: "Guided Arrow", tab: "bow", reqLvl: 18, row: 3, col: 0, glyph: "⇢", prereq: ["cold_arrow", "multiple_shot"], implemented: true,
    blurb: "An arrow that seeks its target and always hits.",
    mana: () => 6,
    effect: (l) => `+${guidedDmg(l)}% damage, always hits, homes in`,
  }),
  S({
    id: "strafe", name: "Strafe", tab: "bow", reqLvl: 24, row: 4, col: 0, glyph: "⋙", prereq: ["guided_arrow"], implemented: true,
    blurb: "Rapidly shoots an arrow at each enemy in range, one after another.",
    mana: () => 11,
    effect: (l) => `Up to ${strafeArrows(l)} arrows, ${strafeDmg(l) >= 0 ? "+" : ""}${strafeDmg(l)}% damage`,
  }),
  S({
    id: "immolation_arrow", name: "Immolation Arrow", tab: "bow", reqLvl: 24, row: 4, col: 2, glyph: "♨", prereq: ["exploding_arrow"], implemented: true,
    blurb: "An explosive arrow that leaves the ground burning.",
    mana: () => 6,
    effect: (l) => `Explosion ${immolationDmg(l)}% of your hit as fire, then ${immolationDps(l)}%/s burning for ${immolationDur(l).toFixed(1)}s`,
  }),
  S({
    id: "freezing_arrow", name: "Freezing Arrow", tab: "bow", reqLvl: 30, row: 5, col: 1, glyph: "✻", prereq: ["ice_arrow"], implemented: true,
    blurb: "An arrow that bursts in a cold explosion, freezing every enemy around it.",
    mana: () => 9,
    effect: (l) => `Cold burst ${freezingDmg(l)}% of your hit, freezes for ${freezingFreeze(l).toFixed(1)}s`,
  }),
  // ---------------- Passive and Magic ----------------
  S({
    id: "inner_sight", name: "Inner Sight", tab: "passive", reqLvl: 1, row: 0, col: 0, glyph: "◉", implemented: true,
    blurb: "Lights up nearby enemies, making them easier to hit.",
    mana: () => 5,
    effect: (l) => `Enemies within 9 yards: −${innerSightDef(l)}% defense for ${innerSightDur(l)}s`,
  }),
  S({
    id: "critical_strike", name: "Critical Strike", tab: "passive", reqLvl: 1, row: 0, col: 2, glyph: "✦", kind: "passive", implemented: true,
    blurb: "Chance for physical attacks (melee, thrown and arrows) to do double damage.",
    effect: (l) => `${critStrike(l)}% chance of double damage`,
  }),
  S({
    id: "dodge", name: "Dodge", tab: "passive", reqLvl: 6, row: 1, col: 1, glyph: "↶", kind: "passive", implemented: true,
    blurb: "Chance to dodge melee attacks while standing still or attacking.",
    effect: (l) => `${dodgeChance(l)}% chance to dodge melee hits`,
  }),
  S({
    id: "slow_missiles", name: "Slow Missiles", tab: "passive", reqLvl: 12, row: 2, col: 0, glyph: "⌛", prereq: ["inner_sight"], implemented: true,
    blurb: "Enemy missiles near you fly at a third of their speed.",
    mana: () => 5,
    effect: (l) => `Missiles within 10 yards at 1/3 speed for ${slowMissilesDur(l)}s`,
  }),
  S({
    id: "avoid", name: "Avoid", tab: "passive", reqLvl: 12, row: 2, col: 1, glyph: "⤳", prereq: ["dodge"], kind: "passive", implemented: true,
    blurb: "Chance to avoid enemy missiles.",
    effect: (l) => `${avoidChance(l)}% chance to avoid missiles`,
  }),
  S({
    id: "penetrate", name: "Penetrate", tab: "passive", reqLvl: 18, row: 3, col: 2, glyph: "⟶", prereq: ["critical_strike"], kind: "passive", implemented: true,
    blurb: "Raises the attack rating of arrows and thrown weapons.",
    effect: (l) => `+${penetrateAR(l)}% attack rating with bows and throws`,
  }),
  S({
    id: "decoy", name: "Decoy", tab: "passive", reqLvl: 24, row: 4, col: 0, glyph: "☥", prereq: ["slow_missiles"], implemented: true,
    blurb: "Creates a copy of you that draws nearby enemies' attacks.",
    mana: () => 15,
    effect: (l) => `Lasts ${decoyDur(l)}s or until destroyed`,
  }),
  S({
    id: "evade", name: "Evade", tab: "passive", reqLvl: 24, row: 4, col: 1, glyph: "⇝", prereq: ["avoid"], kind: "passive", implemented: true,
    blurb: "Chance to avoid any attack while moving.",
    effect: (l) => `${evadeChance(l)}% chance to evade melee and missiles while moving`,
  }),
  S({
    id: "valkyrie", name: "Valkyrie", tab: "passive", reqLvl: 30, row: 5, col: 0, glyph: "♆", prereq: ["decoy", "evade"], implemented: true,
    blurb: "Summons a spectral Valkyrie who fights at your side until she falls.",
    mana: () => 25,
    effect: (l) => `+${valkDmg(l)}% spear damage, life ${valkLife(l)}% of yours`,
  }),
  S({
    id: "pierce", name: "Pierce", tab: "passive", reqLvl: 30, row: 5, col: 2, glyph: "⇶", prereq: ["penetrate"], kind: "passive", implemented: true,
    blurb: "Chance for arrows and thrown weapons to pass through enemies and hit more.",
    effect: (l) => `${pierceChance(l)}% chance to pierce`,
  }),
  // ---------------- Javelin and Spear ----------------
  S({
    id: "jab", name: "Jab", tab: "javelin", reqLvl: 1, row: 0, col: 0, glyph: "⇡", implemented: true,
    blurb: "Three rapid stabs. Needs a javelin or spear.",
    mana: () => 2,
    effect: (l) => `3 hits, ${jabDmg(l) >= 0 ? "+" : ""}${jabDmg(l)}% damage, +${jabAR(l)}% attack rating`,
  }),
  S({
    id: "power_strike", name: "Power Strike", tab: "javelin", reqLvl: 6, row: 1, col: 1, glyph: "ϟ", prereq: ["jab"], implemented: true,
    blurb: "A stab charged with lightning. Needs a javelin or spear.",
    mana: () => 2,
    effect: (l) => `Adds lightning damage equal to ${powerStrikeLight(l)}% of your hit`,
  }),
  S({
    id: "poison_javelin", name: "Poison Javelin", tab: "javelin", reqLvl: 6, row: 1, col: 2, glyph: "☣", implemented: true,
    blurb: "A thrown javelin that leaves a trail of poison gas. Needs throwing javelins.",
    mana: () => 4,
    effect: (l) => `Poison trail: ${poisonJavDps(l)}% of your hit per second`,
  }),
  S({
    id: "impale", name: "Impale", tab: "javelin", reqLvl: 12, row: 2, col: 0, glyph: "⟟", prereq: ["jab"], implemented: true,
    blurb: "A slow, devastating thrust. Needs a javelin or spear.",
    mana: () => 3,
    effect: (l) => `+${impaleDmg(l)}% damage, +${impaleAR(l)}% attack rating`,
  }),
  S({
    id: "lightning_bolt", name: "Lightning Bolt", tab: "javelin", reqLvl: 12, row: 2, col: 2, glyph: "⚡", prereq: ["power_strike", "poison_javelin"], implemented: true,
    blurb: "Throws a javelin that becomes a bolt of lightning, passing through every enemy in its path.",
    mana: () => 6,
    effect: (l) => `Lightning ${lightningBoltDmg(l)}% of your hit, never misses, pierces`,
  }),
  S({
    id: "charged_strike", name: "Charged Strike", tab: "javelin", reqLvl: 18, row: 3, col: 1, glyph: "⌁", prereq: ["power_strike", "lightning_bolt"], implemented: true,
    blurb: "A stab that releases crackling charged bolts.",
    mana: () => 4,
    effect: (l) => `${chargedStrikeBolts(l)} charged bolts, ${chargedStrikeDmg(l)}% of your hit each`,
  }),
  S({
    id: "plague_javelin", name: "Plague Javelin", tab: "javelin", reqLvl: 18, row: 3, col: 2, glyph: "☠", prereq: ["lightning_bolt"], implemented: true,
    blurb: "A thrown javelin that bursts into a spreading cloud of poison.",
    mana: () => 7,
    effect: (l) => `Poison cloud: ${plagueDps(l)}% of your hit per second for 3s`,
  }),
  S({
    id: "fend", name: "Fend", tab: "javelin", reqLvl: 24, row: 4, col: 0, glyph: "⋀", prereq: ["impale"], implemented: true,
    blurb: "Stabs every enemy within reach.",
    mana: () => 5,
    effect: (l) => `Hits every enemy in reach, +${fendDmg(l)}% damage, +${fendAR(l)}% attack rating`,
  }),
  S({
    id: "lightning_strike", name: "Lightning Strike", tab: "javelin", reqLvl: 30, row: 5, col: 1, glyph: "⛓", prereq: ["charged_strike"], implemented: true,
    blurb: "A stab that unleashes chain lightning, jumping from enemy to enemy.",
    mana: () => 9,
    effect: (l) => `Chains to ${lightningStrikeHits(l)} enemies, ${lightningStrikeDmg(l)}% of your hit each`,
  }),
  S({
    id: "lightning_fury", name: "Lightning Fury", tab: "javelin", reqLvl: 30, row: 5, col: 2, glyph: "☈", prereq: ["plague_javelin"], implemented: true,
    blurb: "A thrown javelin that bursts into lightning bolts on impact, striking enemies around it.",
    mana: () => 10,
    effect: (l) => `${furyBolts(l)} bolts, ${furyDmg(l)}% of your hit each; the javelin itself hits for ${Math.round(FURY_JAV_HIT * 100)}%`,
  }),
  // ================= v1.0 basic attacks (every class) =================
  S({
    id: "basic_attack", name: "Attack / Stab", tab: "basic", reqLvl: 1, row: 0, col: 0, glyph: "⚔", implemented: true,
    blurb: "A normal melee attack with your weapon. With javelins, a forward stab from the overhead grip.",
    effect: () => "Melee hit with your weapon",
  }),
  S({
    id: "basic_throw", name: "Throw", tab: "basic", reqLvl: 1, row: 0, col: 1, glyph: "➹", implemented: true,
    blurb: "Throw your throwing weapon (javelins, throwing axes or knives). Stacks refill in camp.",
    effect: () => "Throws one weapon from the stack",
  }),
  S({
    id: "basic_shoot", name: "Shoot", tab: "basic", reqLvl: 1, row: 0, col: 2, glyph: "↟", implemented: true,
    blurb: "Shoot an arrow with your bow. Needs a quiver of arrows in the off-hand; it refills in camp.",
    effect: () => "Shoots one arrow",
  }),
];

SKILLS.splice(SKILLS.findIndex((s) => s.tab === "basic"), 0, ...SORC_SKILLS);

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/** D2 rule: hard points in a skill are capped at 1 + (character level − the skill's required level), max 20. +skills from gear go on top. */
export const skillCap = (charLevel: number, reqLvl: number) => Math.max(0, Math.min(MAX_SKILL_LVL, 1 + charLevel - reqLvl));
