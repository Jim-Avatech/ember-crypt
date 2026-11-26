import { enchant, rollDrop } from "./data/affixes";
import {
  BASE_BY_ID, type EquipSlot, ITEM_BASES, type Item, type Kind, type StatKey, beltSlotsOf, isTwoHanded, itemDamage, isBow, isQuiver, isSpearLike, offBlocked,
  isThrowing, itemDefense, itemName, itemPrice, itemReqs, makeItem, migrateItem, modTotal, QUALITY_COLOR, qtyMax, qualityOf, sellPrice,
} from "./data/items";
import {
  ELEM_COLOR, ELITE_MODS, type Elem, type EliteMod, MONSTERS, type MonsterDef, type MonsterKind, type Shot, scaleAR, scaleDef, scaleDmg, scaleHp, scaleXp, uniqueName,
} from "./data/monsters";
import {
  ACTS, ARTIFACT_BY_ID, ARTIFACT_COLOR, LEVELS_PER_ACT, hasWaypoint, MAX_FLOOR, actDef, actOf, floorName, isFinalLevel, levelInAct, mlvlOf, xpPenalty, XP_RATE, bossName,
} from "./data/acts";
import {
  FRENZY_HOLD, FRENZY_MAX_STACKS, MAX_SKILL_LVL, SKILLS, SKILL_BY_ID, bashAR, bashDmg, boDur, boPct, doubleSwingAR, doubleThrowAR,
  findPotionChance, frenzyAR, frenzyDmg, frenzyIas, frenzyMove, howlDur,
  incSpeed, ironSkinDef, leapAttackDmg, leapRange, masteryAR, masteryCrit, masteryDmg, shoutDef, shoutDur,
  stunAR, stunDur, skillCap,
  BC_DMG, BERSERK_DEF_T, SKILL_SLOTS, WW_DUR, WW_TICK, bcDef, bcDur, bcmdBonus, bcmdDur, berserkAR, berserkDmg, concAR, concDef, concDmg,
  findItemChance, grimDur, grimRadius, natRes, stamLife, stamRegen, tauntDmg, tauntDur, warCryDmg, warCryStun, wwAR, wwDmg,
  type BasicId, type HeroClass, CLASS_NAME, isBasic, avoidChance, chargedStrikeBolts, chargedStrikeDmg, coldArrowChill, coldArrowDmg, critStrike, decoyDur,
  dodgeChance, evadeChance, explodingDmg, fendAR, fendDmg, fireArrowDmg, freezingDmg, freezingFreeze, furyBolts, furyDmg, guidedDmg, iceArrowDmg,
  iceArrowFreeze, immolationDmg, immolationDps, immolationDur, impaleAR, impaleDmg, innerSightDef, innerSightDur, jabAR, jabDmg, lightningBoltDmg,
  lightningStrikeDmg, lightningStrikeHits, magicArrowDmg, multiShotArrows, multiShotPer, penetrateAR, pierceChance, plagueDps, poisonJavDps,
  powerStrikeLight, slowMissilesDur, strafeArrows, strafeDmg, valkDmg, valkLife,
} from "./data/skills";
import { type BagEntry, STASH_H, STASH_W, addItem, findSpot, fits, moveItem, sizeOf } from "./inventory";
import { type Level, bfs, generateLevel, generateTown, idx, isFloor, lineOfSight } from "./map";
import { Rng, chance, rand, randInt } from "./rng";

/** v0.9.1 drop rates: a normal monster drops an item 8.5% of the time (was 17%); a champion has a 50% chance of one item (was always 1). */
/** v0.9.2: every monster (elites and bosses build on these) has +30% life and +25% damage. */
export const MON_HP = 1.69; // v0.9.3: +30% on v0.9.2's 1.3
export const MON_DMG = 1.875; // v0.9.3: +50% on v0.9.2's 1.25
/**
 * v1.1 difficulty curve: monster life and damage start lower and rise in a straight line to exactly today's values
 * at floor CURVE_END (end of Act III); floors CURVE_END..80 are unchanged. Floor 1 = life x0.80, damage x0.90.
 * Boss life follows the curve; boss damage is set per floor from the on-level hero's life (bossUp), not from this.
 */
/** v1.1: weapons that lean toward each class (drops, and Hilde's guaranteed magic weapon). */
export const CLASS_WEAPONS: Record<HeroClass, string[]> = {
  barbarian: ["sword", "axe", "mace", "great_sword"],
  amazon: ["javelin", "spear", "short_bow", "long_bow"],
};
/** v1.1: every equipment slot, in a fixed order (for the usable-gear cache) */
const EQUIP_ORDER: EquipSlot[] = ["main", "off", "head", "chest", "gloves", "boots", "belt", "ring1", "ring2", "amulet"];
/** v1.1: how many sold items Hilde keeps for buy-back */
export const BUYBACK_MAX = 8;
export const CURVE_END = 60;
export const CURVE_HP0 = 0.8;
export const CURVE_DMG0 = 0.9;
const curveAt = (f: number, start: number) => (f >= CURVE_END ? 1 : start + ((1 - start) * (Math.max(1, f) - 1)) / (CURVE_END - 1));
export const curveHp = (floor: number) => curveAt(floor, CURVE_HP0);
export const curveDmg = (floor: number) => curveAt(floor, CURVE_DMG0);
/**
 * v0.9.4 bosses. Accuracy: a boss rolls 3x its attack rating and ignores the hero being above its level, so an
 * on-level hero standing still is hit about 80% of the time (defense still helps). Damage: an average hit is a set
 * share of an on-level hero's life (≈ 55 + 10.6 × the level a full clear gives, about 1.1 × monster level + 1.5):
 * level bosses 30% on an act's first level up to 35% on its last, act bosses 38% (their bolts do 0.9x). Big telegraphed slams hit ~1.5x.
 */
export const BOSS_AR = 3;
export const heroLifeRef = (floor: number) => 55 + 10.6 * (1.1 * mlvlOf(floor) + 1.5);
export const bossHitShare = (floor: number) =>
  isFinalLevel(floor) ? 0.38 : 0.3 + (0.05 * (levelInAct(floor) - 1)) / Math.max(1, LEVELS_PER_ACT - 2);
/** Elite-style boss modifiers: none early in an act, one from level 7, two from level 14; act bosses get both. */
export const bossMods = (floor: number): EliteMod[] =>
  isFinalLevel(floor) ? ["fast", "stone"] : levelInAct(floor) >= 14 ? ["fast", "stone"] : levelInAct(floor) >= 7 ? [levelInAct(floor) % 2 ? "fast" : "stone"] : [];
/** Seconds between a level boss's ground slams (7 s on an act's first level down to 4.3 s on its last). */
export const slamEvery = (floor: number) => 7 - (2.7 * (levelInAct(floor) - 1)) / Math.max(1, LEVELS_PER_ACT - 2);
/** v0.9.3: level and act bosses end up with 1.9x their v0.9.2 life (the general +30% is not stacked on top). */
export const BOSS_HP_EXTRA = 1.9 / 1.3;
export const ITEM_DROP = 0.0425; // v0.9.2: halved again (was 0.085, originally 0.17)
export const ELITE_ITEM_CHANCE = 0.25; // champions (was 0.5, originally always 1)
export const UNIQUE_ITEM_CHANCE = 0.5; // uniques: one item half the time (was always 1, originally 2); always magic or better

export interface Stats {
  str: number;
  dex: number;
  vit: number;
  ene: number;
}

export type Action =
  | { type: "swing"; skill: string | null; t: number; dur: number; hitAt: number[]; hands: number[]; hitsDone: number; target: Monster | null }
  | { type: "leap"; skill: string; t: number; dur: number; fx: number; fy: number; tx: number; ty: number; target: Monster | null }
  | { type: "cry"; t: number; dur: number }
  | { type: "whirl"; t: number; dur: number; dx: number; dy: number; tick: number; hand: number; spin: number }
  | { type: "throw"; skill: string | null; t: number; dur: number; releaseAt: number[]; hands: number[]; done: number; target: Monster | null }
  /** v1.0: a bow shot (Strafe: one release per target) */
  | { type: "shoot"; skill: string | null; t: number; dur: number; releaseAt: number[]; done: number; target: Monster | null; targets: Monster[] };

/** A thrown weapon in flight. */
export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dist: number;
  range: number;
  hand: Hand;
  handIdx: number;
  skill: string | null;
  /** item class, for the sprite */
  cls: string;
  t: number;
  /** v1.0: what flies (thrown weapon by default), its element color, monsters already hit (piercing) */
  kind?: "weapon" | "arrow" | "bolt" | "cbolt";
  elem?: Elem;
  hits?: number[];
  /** Guided Arrow: the monster it steers toward */
  homing?: Monster | null;
  /** v1.2.2: Guided Arrow seeks a target in flight (and re-acquires one when its target dies) */
  seek?: boolean;
  /** v1.2.2: walking-distance field to the target, to curve around corners; when it was made and for whom */
  seekFlow?: Uint16Array;
  seekFlowT?: number;
  seekFlowFor?: number;
  /** v1.2.2: the furthest a seeking arrow may fly */
  maxRange?: number;
  /** Poison Javelin: distance since the last poison puff */
  trail?: number;
}

/** v1.0: burning or poisoned ground (Immolation Arrow, Poison/Plague Javelin) that hurts monsters standing in it. */
export interface Patch {
  x: number;
  y: number;
  r: number;
  t: number;
  life: number;
  /** damage per second */
  dps: number;
  elem: Elem;
  tick: number;
}

/** v1.0: a lightning arc drawn for a moment (Lightning Strike, Lightning Fury). */
export interface Zap {
  pts: { x: number; y: number }[];
  t: number;
  life: number;
}

/** v1.0: Amazon Decoy and Valkyrie. */
export interface Ally {
  kind: "decoy" | "valkyrie";
  x: number;
  y: number;
  fx: number;
  fy: number;
  hp: number;
  maxHp: number;
  t: number;
  life: number;
  atkT: number;
  /** current swing (seconds left), for the animation */
  swingT: number;
  walkPhase: number;
  moving: boolean;
}

export interface Player {
  /** v1.0: hero class and name (old saves are Barbarians) */
  cls: HeroClass;
  name: string;
  /** v1.0: the basic attack the main ⚔ button uses (null = automatic: shoot with a bow, throw a throwing weapon, else attack) */
  /** what the main ⚔ button does: null = automatic basic attack, a basic attack id, or (v1.2) any active skill */
  mainAtk: string | null;
  x: number;
  y: number;
  r: number;
  fx: number;
  fy: number;
  hp: number;
  mana: number;
  level: number;
  xp: number;
  base: Stats;
  statPoints: number;
  skillPoints: number;
  skills: Record<string, number>;
  slots: (string | null)[];
  bag: BagEntry[];
  /** camp stash (10×10), usable only in town */
  stash: BagEntry[];
  equip: Partial<Record<EquipSlot, Item>>;
  nextHand: number;
  frenzy: { stacks: number; t: number; decay: number };
  gold: number;
  /** v1.1: gold kept in the camp stash (this hero only); it is never lost when you die */
  stashGold: number;
  hpPots: number;
  mpPots: number;
  action: Action | null;
  walkPhase: number;
  moving: boolean;
  /** seconds left: shout, battle orders, concentrate (defense while swinging), berserk (defense 0), battle command */
  buffs: { shout: number; bo: number; conc: number; bers: number; bcmd: number; slowm?: number };
  flash: number;
  z: number;
  moveTarget: GroundItem | null;
  dead: boolean;
  healLeft: number;
  manaLeft: number;
  kills: number;
  /** artifacts collected from act bosses (not in the bag) */
  artifacts: FoundArtifact[];
  /** cold: seconds of chill left (slower movement) */
  chillT: number;
  /** poison damage over time */
  poison: { t: number; dps: number };
}

export interface Monster {
  id: number;
  def: MonsterDef;
  mlvl: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dmgMin: number;
  dmgMax: number;
  ar: number;
  defense: number;
  xp: number;
  state: "idle" | "chase" | "attack" | "dead";
  atkT: number;
  windT: number;
  stunT: number;
  fearT: number;
  kx: number;
  ky: number;
  flash: number;
  fx: number;
  fy: number;
  walkPhase: number;
  pack: number;
  homeX: number;
  homeY: number;
  wanderT: number;
  wx: number;
  wy: number;
  deadT: number;
  searched: boolean;
  lastHurt: number;
  /** charge / special cooldown */
  cd: number;
  /** seconds of charge left, and its direction */
  charging: number;
  cdx: number;
  cdy: number;
  /** next special (final bosses) */
  spIdx: number;
  /** exploder fuse (-1 = not lit) */
  fuse: number;
  /** summoned by a boss */
  minion: boolean;
  /** corpse used up by Grim Ward (not drawn) */
  hidden?: boolean;
  /** 0 normal, 1 champion (blue), 2 unique (gold) */
  elite: 0 | 1 | 2;
  /** v0.9 warcry effects: where fear runs from (Grim Ward; null = from the hero), Taunt and Battle Cry debuffs */
  flee: { x: number; y: number } | null;
  taunt: { t: number; pct: number };
  bcry: { t: number; def: number; dmg: number };
  mods: EliteMod[];
  /** v0.9.4: seconds left in a boss's ground-slam windup (it stands still) */
  slamT?: number;
  /** v1.0.1: a boss walking back to its room after you got too far away (and its path home) */
  leashed?: boolean;
  homeFlow?: Uint16Array;
  /** v1.1: seconds the hunted hero has been out of reach and out of sight */
  lostT?: number;
  /** v1.0 Amazon effects: slowed (Cold Arrow), frozen (Ice/Freezing Arrow, drawn blue), Inner Sight defense cut */
  chillT?: number;
  frozenT?: number;
  sight?: { t: number; def: number };
}

/** Seconds between two potions of the same kind (v0.8). */
export const POTION_CD = 1.5;

export interface GroundItem {
  id: number;
  x: number;
  y: number;
  item?: Item;
  gold?: number;
  /** artifact id (orange, auto-collected) */
  artifact?: string;
  t: number;
}

export interface FoundArtifact {
  id: string;
  /** ms since epoch */
  at: number;
  /** player level when found */
  level: number;
}

/** A monster arrow / bolt / spit in flight. */
export interface MonsterShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dist: number;
  range: number;
  dmgMin: number;
  dmgMax: number;
  ar: number;
  mlvl: number;
  elem: Elem;
  look: Shot["look"];
  color: string;
  t: number;
  big: boolean;
}

/** A telegraphed area attack (boss nova, exploder burst). */
/** Grim Ward totem: frightens monsters away. */
export interface Ward {
  x: number;
  y: number;
  t: number;
  life: number;
  radius: number;
}

export interface Nova {
  x: number;
  y: number;
  t: number;
  /** seconds of warning before it goes off */
  warn: number;
  radius: number;
  elem: Elem;
  dmgMin: number;
  dmgMax: number;
  done: boolean;
}

export interface HitLog {
  hand: number;
  skill: string | null;
  t: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  life: number;
  size: number;
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  life: number;
  color: string;
  size: number;
}

export interface Ring {
  x: number;
  y: number;
  t: number;
  life: number;
  radius: number;
  color: string;
}

export interface FrameInput {
  /** joystick in screen space, normalized; mag 0..1 */
  mx: number;
  my: number;
  mag: number;
  attack: boolean;
  skills: boolean[];
}

export interface GameEvents {
  sound(name: string): void;
  toast(text: string): void;
  changed(): void;
  died(): void;
  levelUp(level: number): void;
  shake(amount: number): void;
  /** a level boss or act boss died (v0.8.3: backup reminder) */
  bossKilled?(): void;
}

export interface Hand {
  /** v1.0: a bow shot or a throw (Penetrate, Pierce, Dexterity damage) */
  missile?: boolean;
  slot: EquipSlot | null;
  min: number;
  max: number;
  dmgPct: number;
  ar: number;
  crit: number;
  speed: number;
  kind: Kind | "fist";
  twoHanded: boolean;
}

export interface Derived {
  maxHp: number;
  maxMana: number;
  /** weapons in use: [main] or [main, off] when dual wielding */
  hands: Hand[];
  dual: boolean;
  def: number;
  speed: number;
  ias: number;
  /** main-hand shortcuts */
  dmgMin: number;
  dmgMax: number;
  dmgPct: number;
  ar: number;
  crit: number;
  swing: number;
  weaponKind: Kind | "fist";
  /** resistances in % (capped at 75) against elemental monster attacks */
  res: { fire: number; cold: number; light: number; poison: number };
  /** % of damage dealt returned as life / mana */
  ll: number;
  ml: number;
  /** % faster run/walk and increased attack speed from gear */
  frw: number;
  gearIas: number;
  gf: number;
  mf: number;
  /** total attributes, gear included */
  stats: Stats;
}

export interface CompareRow {
  id: string;
  label: string;
  diff: number;
  digits: number;
  unit: string;
  good: boolean;
}

const avgHit = (h: Hand | undefined) => (h ? ((h.min + h.max) / 2) * (1 + h.dmgPct / 100) : 0);

/** The stats the compare tooltip diffs, all read from derived(). */
export const COMPARE_METRICS: { id: string; label: string; get: (d: Derived) => number; digits?: number; unit?: string; lowerBetter?: boolean }[] = [
  { id: "dmg", label: "damage", get: (d) => avgHit(d.hands[0]), digits: 1 },
  { id: "dmg2", label: "off-hand damage", get: (d) => (d.dual ? avgHit(d.hands[1]) : 0), digits: 1 },
  { id: "aps", label: "attacks/s", get: (d) => 1 / d.swing, digits: 2 },
  { id: "ar", label: "attack rating", get: (d) => d.ar },
  { id: "crit", label: "critical strike", get: (d) => d.crit, unit: "%" },
  { id: "def", label: "defense", get: (d) => d.def },
  { id: "life", label: "life", get: (d) => d.maxHp },
  { id: "mana", label: "mana", get: (d) => d.maxMana },
  { id: "str", label: "Strength", get: (d) => d.stats.str },
  { id: "dex", label: "Dexterity", get: (d) => d.stats.dex },
  { id: "vit", label: "Vitality", get: (d) => d.stats.vit },
  { id: "ene", label: "Energy", get: (d) => d.stats.ene },
  { id: "ll", label: "life leech", get: (d) => d.ll, unit: "%" },
  { id: "ml", label: "mana leech", get: (d) => d.ml, unit: "%" },
  { id: "frw", label: "run speed", get: (d) => d.frw, unit: "%" },
  { id: "ias", label: "attack speed", get: (d) => d.gearIas, unit: "%" },
  { id: "fres", label: "fire resist", get: (d) => d.res.fire, unit: "%" },
  { id: "cres", label: "cold resist", get: (d) => d.res.cold, unit: "%" },
  { id: "lres", label: "lightning resist", get: (d) => d.res.light, unit: "%" },
  { id: "pres", label: "poison resist", get: (d) => d.res.poison, unit: "%" },
  { id: "gf", label: "gold find", get: (d) => d.gf, unit: "%" },
  { id: "mf", label: "magic find", get: (d) => d.mf, unit: "%" },
];

/**
 * Which compare rows each affix stat shows up in. A Record over every StatKey, so adding a new
 * affix stat won't compile until it's mapped here (and the unit test checks each one really changes).
 */
export const STAT_COMPARE: Record<StatKey, string[]> = {
  edmg: ["dmg"], mindmg: ["dmg"], maxdmg: ["dmg"], ar: ["ar"], str: ["str"], dex: ["dex"], vit: ["vit", "life"], ene: ["ene", "mana"],
  life: ["life"], mana: ["mana"], ll: ["ll"], ml: ["ml"], frw: ["frw"], ias: ["ias", "aps"], fres: ["fres"], cres: ["cres"], lres: ["lres"],
  pres: ["pres"], ares: ["fres", "cres", "lres", "pres"], edef: ["def"], def: ["def"], gf: ["gf"], mf: ["mf"], skill: ["skill:*"],
};

/** Base walking speed in tiles per second (v0.3: raised from 3.5 to keep the v0.1 on-screen speed after the pixel-art rescale). */
export const BASE_RUN = 4.6;

export const BASE_POTS = 4;
export const VENDOR_W = 10;
export const VENDOR_H = 10; // v1.0: room for bows, a spear and arrows
export const BASE_STATS: Stats = { str: 30, dex: 20, vit: 25, ene: 10 };
/** v1.0: per-class starting attributes and life/mana growth (D2 numbers) */
export const CLASS_DEF: Record<HeroClass, { stats: Stats; life: number; lifePerVit: number; mana: number; manaPerEne: number }> = {
  barbarian: { stats: BASE_STATS, life: 55, lifePerVit: 4, mana: 10, manaPerEne: 1.5 },
  amazon: { stats: { str: 20, dex: 25, vit: 20, ene: 15 }, life: 50, lifePerVit: 3, mana: 15, manaPerEne: 1.5 },
};
export const isHeroClass = (c: unknown): c is HeroClass => c === "barbarian" || c === "amazon";

/** Total XP needed to reach level L+1 from level L. */
export const xpForLevel = (L: number) => (L <= 1 ? 0 : Math.round(100 * Math.pow(L - 1, 1.9)));

/** Current save schema. Bump it (and add a migration step) whenever the save shape changes. */
export const SAVE_VERSION = 7; // v1.0: hero class + name (multiple heroes)

export interface SaveData {
  /** schema version (SAVE_VERSION when written) */
  v: number;
  /** ms since epoch, set by saveGame */
  savedAt?: number;
  /** copy of the player's settings, so exports carry them */
  settings?: Record<string, unknown>;
  seed: number;
  floor: number;
  maxFloor: number;
  player: Pick<Player, "level" | "xp" | "base" | "statPoints" | "skillPoints" | "skills" | "slots" | "bag" | "equip" | "gold" | "hpPots" | "mpPots" | "kills"> & {
    stashGold?: number; stash?: BagEntry[]; artifacts?: FoundArtifact[]; cls?: HeroClass; name?: string; mainAtk?: string | null;
  };
  /** v1.0: when the (shared) stash last changed; the newest copy of the stash wins across heroes */
  stashAt?: number;
  /** items that didn't fit when an old save was converted */
  migratedSold?: number;
  migratedFrom?: number;
  /** v4: skills whose points were refunded because the tree changed (names) */
  refundedSkills?: string[];
  refundedPoints?: number;
  /** v6: skill points refunded by the D2 per-level skill cap */
  cappedSkills?: string[];
  cappedPoints?: number;
  /** v6: deepest level of the old endless crypt (set when a pre-acts save is converted) */
  actsFrom?: number;
}

/**
 * Refund points from any skill the hero can't legally have under the current tree
 * (level too low, a prerequisite with no points, or a skill that no longer exists).
 * Repeats until stable, since refunding one skill can break a later one. Also clears hotbar slots.
 */
export function refundSkills(p: Pick<Player, "level" | "skills" | "slots" | "skillPoints"> & { cls?: HeroClass }): { names: string[]; points: number } {
  const names: string[] = [];
  let points = 0;
  for (let changed = true; changed; ) {
    changed = false;
    for (const [id, pts] of Object.entries(p.skills)) {
      if (!pts) continue;
      const def = SKILL_BY_ID[id];
      const ok = def && def.cls !== "any" && (def.cls === (p.cls ?? "barbarian")) && p.level >= def.reqLvl && (def.prereq ?? []).every((q) => (p.skills[q] ?? 0) > 0);
      if (ok) continue;
      points += pts;
      names.push(def ? def.name : id);
      delete p.skills[id];
      changed = true;
    }
  }
  if (points) {
    p.skillPoints += points;
    p.slots = p.slots.map((s) => (s && (p.skills[s] || isBasic(s)) ? s : null));
  }
  return { names, points };
}

/**
 * v0.8 (D2 rule): trim hard points above 1 + (character level − required level) and refund them.
 * Returns how many points came back and from which skills.
 */
export function capSkills(p: Pick<Player, "level" | "skills" | "skillPoints">): { names: string[]; points: number } {
  const names: string[] = [];
  let points = 0;
  for (const [id, pts] of Object.entries(p.skills)) {
    const def = SKILL_BY_ID[id];
    if (!def || !pts) continue;
    const cap = skillCap(p.level, def.reqLvl);
    if (pts > cap) {
      points += pts - cap;
      names.push(def.name);
      p.skills[id] = cap;
    }
  }
  p.skillPoints += points;
  return { names, points };
}

/** Which mastery boosts each weapon kind in melee (D2: Pole Arm for staves is our call; spears = javelins). */
const MASTERY_OF: Partial<Record<Kind | "fist", string>> = {
  sword: "sword_mastery", axe: "axe_mastery", mace: "mace_mastery", spear: "spear_mastery", staff: "polearm_mastery",
};

const MELEE_SKILLS = new Set(["bash", "double_swing", "stun", "frenzy", "concentrate", "berserk", "jab", "power_strike", "impale", "charged_strike", "fend", "lightning_strike"]);
/** v1.0 Amazon skill groups */
const SPEAR_MELEE = new Set(["jab", "power_strike", "impale", "charged_strike", "fend", "lightning_strike"]);
const JAV_THROWS = new Set(["poison_javelin", "lightning_bolt", "plague_javelin", "lightning_fury"]);
const BOW_SKILLS = new Set(["magic_arrow", "fire_arrow", "cold_arrow", "multiple_shot", "exploding_arrow", "guided_arrow", "ice_arrow", "strafe", "immolation_arrow", "freezing_arrow"]);
const TWO_HIT = new Set(["double_swing", "frenzy"]);
/** v1.2: the main ⚔ button can hold a basic attack or any active skill of the hero's class */
export function mainAtkOk(id: unknown, cls: HeroClass): id is string {
  if (typeof id !== "string") return false;
  if (isBasic(id)) return true;
  const s = SKILL_BY_ID[id];
  return !!s && s.kind === "active" && s.implemented && s.cls === cls;
}
/**
 * v1.2: skills that don't attack (warcries, Leap, Amazon helpers). On ⚔ they fire once per press; holding ⚔ after
 * that keeps attacking normally, so a held button never burns mana re-casting a buff.
 */
export const ONCE_PER_PRESS = new Set(["leap", "howl", "find_potion", "taunt", "shout", "find_item", "battle_cry", "battle_orders", "grim_ward", "war_cry", "battle_command", "inner_sight", "slow_missiles", "decoy", "valkyrie"]);
/** v1.2.2: Guided Arrow homing: lock-on radius in flight (tiles), turn rate (rad/s), aim cone at release (rad), and how much
 * further than the bow's range it may fly while chasing */
export const GUIDED_SEEK_R = 9;
export const GUIDED_TURN = 9;
export const GUIDED_AIM_CONE = 0.61;
export const GUIDED_RANGE_MUL = 2.5;
/** v1.2: removing one skill or stat point costs this much gold per character level (level 20: 1,000 gold) */
export const RESPEC_GOLD_PER_LEVEL = 50;
export const respecCost = (level: number) => RESPEC_GOLD_PER_LEVEL * Math.max(1, level);

/** Drop anything that would crash the game (unknown item classes, broken bag entries). */
function sanitizeV3(d: SaveData): SaveData {
  const p = d.player;
  if (!p || typeof p !== "object") return d;
  const okEntry = (e: BagEntry) => e && e.item && BASE_BY_ID[e.item.baseId] && Number.isFinite(e.x) && Number.isFinite(e.y);
  if (Array.isArray(p.bag)) p.bag = p.bag.filter(okEntry);
  p.stash = Array.isArray(p.stash) ? p.stash.filter(okEntry) : [];
  if (p.equip && typeof p.equip === "object") for (const k of Object.keys(p.equip) as EquipSlot[]) if (!p.equip[k] || !BASE_BY_ID[p.equip[k]!.baseId]) delete p.equip[k];
  if (!p.skills || typeof p.skills !== "object") p.skills = {};
  if (!Array.isArray(p.slots)) p.slots = [null, null, null];
  for (const k of ["hpPots", "mpPots", "kills", "statPoints", "skillPoints"] as const) if (!Number.isFinite(p[k])) p[k] = 0;
  return d;
}

/**
 * Bring any older save up to the current version, one step at a time:
 * v1 (20-slot list) → v2 (grid bag, D2 slots) → v3 (item classes) → v4 (D2 1.10 skill tree: refund skills that no longer qualify).
 * Never wipe: every step keeps the hero, and anything that can't be kept is turned into gold or points.
 */
export function migrateSave(raw: unknown): SaveData | null {
  const d = migrateSaveSteps(raw);
  // v0.9.3: three skill buttons; a value on a 4th (from v0.9-v0.9.2) is dropped, the skill stays learned
  if (d?.player && Array.isArray(d.player.slots)) {
    d.player.slots = d.player.slots.slice(0, SKILL_SLOTS);
    while (d.player.slots.length < SKILL_SLOTS) d.player.slots.push(null);
  }
  return d;
}
function migrateSaveSteps(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as { v: number };
  if (d.v === 7) return sanitizeV7(sanitizeV6(sanitizeV3(d as SaveData)));
  if (d.v === 6) return toV7(sanitizeV6(sanitizeV3(d as SaveData)));
  if (d.v === 5) return toV7(toV6(sanitizeV3(d as SaveData)));
  if (d.v === 4) return toV7(toV6(toV5(sanitizeV3(d as SaveData))));
  const v3 = d.v === 3 ? sanitizeV3(d as SaveData) : migrateToV3(raw);
  if (!v3) return null;
  return toV7(toV6(toV5(toV4(v3))));
}

/** v7 (v1.0): every hero before multiple heroes was a Barbarian. Nothing else changes. */
function toV7(d: SaveData): SaveData {
  d.v = 7;
  d.player.cls = "barbarian";
  if (typeof d.player.name !== "string" || !d.player.name.trim()) d.player.name = "Barbarian";
  return sanitizeV7(d);
}
function sanitizeV7(d: SaveData): SaveData {
  const p = d.player;
  if (!isHeroClass(p.cls)) p.cls = "barbarian";
  if (typeof p.name !== "string" || !p.name.trim()) p.name = CLASS_NAME[p.cls];
  p.name = p.name.slice(0, 16);
  if (p.mainAtk !== null && p.mainAtk !== undefined && !mainAtkOk(p.mainAtk, p.cls)) p.mainAtk = null;
  // points in another class's skills (hand-edited or mixed-up save) go back to the pool, never lost
  if (p.skills && typeof p.skills === "object")
    for (const [id, n] of Object.entries(p.skills)) {
      const def = SKILL_BY_ID[id];
      if (def && def.cls !== p.cls && def.cls !== "any") {
        p.skillPoints = (Number(p.skillPoints) || 0) + (Number(n) || 0);
        delete p.skills[id];
      }
    }
  // a slot holding a skill of another class (hand-edited save) is cleared; basic attacks are fine
  if (Array.isArray(p.slots)) p.slots = p.slots.map((s) => (s && (isBasic(s) || SKILL_BY_ID[s]?.cls === p.cls) ? s : null));
  return d;
}

/** Keep only known, unique artifacts and floors inside the game. */
function sanitizeV6(d: SaveData): SaveData {
  const seen = new Set<string>();
  const list = Array.isArray(d.player.artifacts) ? d.player.artifacts : [];
  d.player.artifacts = list.filter((a) => a && ARTIFACT_BY_ID[a.id] && !seen.has(a.id) && seen.add(a.id));
  d.floor = Math.max(1, Math.min(MAX_FLOOR, Number(d.floor) || 1));
  d.maxFloor = Math.max(d.floor, Math.min(MAX_FLOOR, Number(d.maxFloor) || 1));
  return d;
}

/**
 * v6: the dungeon became four acts of five levels. Old saves had one endless crypt, so the hero
 * keeps their Act I progress: floors past level 5 clamp to Act I level 5 (the Ember Lich), and
 * the artifact collection starts empty.
 */
function toV6(d: SaveData): SaveData {
  d.v = 6;
  d.player.artifacts = [];
  const f = Number(d.floor) || 1;
  const mf = Math.max(f, Number(d.maxFloor) || 1);
  d.actsFrom = mf;
  if (Number.isFinite(d.player.level) && d.player.skills) {
    const c = capSkills(d.player);
    if (c.points) {
      d.cappedSkills = c.names;
      d.cappedPoints = c.points;
    }
  }
  d.floor = Math.max(1, Math.min(LEVELS_PER_ACT, f));
  d.maxFloor = Math.max(1, Math.min(LEVELS_PER_ACT, mf));
  return d;
}

/** v5: backpack grew from 10×4 to 10×8 (positions unchanged) and the camp stash was added (empty). */
function toV5(d: SaveData): SaveData {
  d.v = 5;
  if (!Array.isArray(d.player.stash)) d.player.stash = [];
  return d;
}

function toV4(d: SaveData): SaveData {
  const p = d.player;
  if (!Number.isFinite(p.level)) p.level = 1;
  const r = refundSkills(p);
  d.v = 4;
  if (r.points) {
    d.refundedSkills = r.names;
    d.refundedPoints = r.points;
  }
  return d;
}

function migrateToV3(raw: unknown): SaveData | null {
  const d = raw as Record<string, unknown> & { v: number };
  if (d.v !== 1 && d.v !== 2) return null;
  const op = d.player as Record<string, unknown>;
  const equip: Partial<Record<EquipSlot, Item>> = {};
  let loose: Item[] = [];
  if (d.v === 1) {
    const oldEq = (op.equip ?? {}) as Record<string, Item>;
    const map: Record<string, EquipSlot> = { weapon: "main", shield: "off", armor: "chest", helm: "head", gloves: "gloves", boots: "boots" };
    for (const [k, v] of Object.entries(oldEq)) if (v && map[k]) equip[map[k]] = v;
    loose = ((op.inventory as (Item | null)[]) ?? []).filter((it): it is Item => !!it);
  } else {
    Object.assign(equip, op.equip ?? {});
    loose = ((op.bag as BagEntry[]) ?? []).map((e) => e.item);
  }
  // convert items to the class system
  for (const k of Object.keys(equip) as EquipSlot[]) {
    const it = migrateItem(equip[k]!);
    if (it) equip[k] = it;
    else delete equip[k];
  }
  if (isTwoHanded(equip.main) && equip.off) {
    loose.push(equip.off);
    delete equip.off;
  }
  // repack the bag (sizes changed); small items first so as many as possible survive
  const items = loose.map(migrateItem).filter((it): it is Item => !!it);
  const area = (it: Item) => BASE_BY_ID[it.baseId].w * BASE_BY_ID[it.baseId].h;
  items.sort((a, b) => area(a) - area(b));
  const bag: BagEntry[] = [];
  let gold = Number(op.gold ?? 0);
  let sold = 0;
  for (const it of items) {
    if (!addItem(bag, it)) {
      gold += sellPrice(it);
      sold++;
    }
  }
  const floor = Number(d.floor ?? 1);
  return {
    v: 3, seed: Number(d.seed), floor, maxFloor: Number(d.maxFloor ?? floor), migratedSold: sold, migratedFrom: d.v,
    player: {
      level: op.level as number, xp: op.xp as number, base: op.base as Stats, statPoints: op.statPoints as number,
      skillPoints: op.skillPoints as number, skills: (op.skills ?? {}) as Record<string, number>,
      slots: (op.slots ?? [null, null, null]) as (string | null)[], bag, equip, gold,
      hpPots: Number(op.hpPots ?? 0), mpPots: Number(op.mpPots ?? 0), kills: Number(op.kills ?? 0),
    },
  };
}

interface DungeonSnap {
  level: Level;
  monsters: Monster[];
  ground: GroundItem[];
  stairs: { x: number; y: number } | null;
  boss: Monster | null;
  px: number;
  py: number;
}

export const RECALL_TIME = 1.2;
/**
 * v1.0.1: a level you leave keeps its state (killed monsters, loot on the ground, dead boss, explored map) for this
 * long; come back within it (waypoint, stairs or town) and it's as you left it, after that it's a fresh level.
 */
export const FLOOR_KEEP_MS = 5 * 60 * 1000;
/** v1.0.1: at most this many kept levels (oldest dropped first). */
export const FLOOR_KEEP_MAX = 8;
/** v1.0.1: a boss gives up the chase when you are this many steps (walking distance) from its room's centre. */
export const BOSS_LEASH = 45;
/** v1.1: a boss beyond its leash gives up only after this many seconds without being hit or seeing you. */
export const BOSS_GIVE_UP = 8;
/** v1.1: normal monsters give up the chase after this long out of sight while more than CHASE_LOST_DIST tiles away. */
export const CHASE_LOST_S = 5;
export const CHASE_LOST_DIST = 12;
/** v1.1: Amazons shoot bows and throw javelins this much faster (1.15 = 15%) */
export const AMAZON_SPEED = 1.15;
/** v1.1: share of a bow shot's animation before the arrow leaves (was 0.62, which felt late) */
export const BOW_RELEASE = 0.5;
/** v1.1: when a Fallen dies, its packmates within this many tiles run from the body for this long */
export const FALLEN_SCATTER_R = 9;
export const FALLEN_SCATTER_S = 1.5;
/** v1.0.1: share of max life per second a leashed boss healed while walking home. v1.1: 0, it heals only once home. */
export const BOSS_RETURN_HEAL = 0;
/**
 * v1.0.1: wall-collision radius for monsters. Bosses are drawn with a 0.5 body, which exactly filled a tile and left
 * them unable to steer through 2-wide corridors and doorways (stuck in their room). Walls now use at most 0.4.
 */
export const wallR = (m: { def: { radius: number } }) => Math.min(m.def.radius, 0.4);

export class Game {
  level!: Level;
  floor = 1;
  seed: number;
  player: Player;
  monsters: Monster[] = [];
  ground: GroundItem[] = [];
  floaters: Floater[] = [];
  particles: Particle[] = [];
  rings: Ring[] = [];
  stairs: { x: number; y: number } | null = null;
  boss: Monster | null = null;
  time = 0;
  inTown = true;
  maxFloor = 1;
  vendorStock: BagEntry[] = [];
  private prevAttack = false;
  /** v1.2: ⚔ was pressed and hasn't started an action yet (a press during another action still counts) */
  private atkPressPending = false;
  /** v1.1: the last items you sold (newest first), kept apart from Hilde's wares for this play session */
  buyback: Item[] = [];
  hitLog: HitLog[] = [];
  projectiles: Projectile[] = [];
  shots: MonsterShot[] = [];
  novas: Nova[] = [];
  /** set when Malakar falls */
  victory = false;
  potCd = { hp: 0, mp: 0 };
  wards: Ward[] = [];
  /** v1.0 Amazon effects */
  patches: Patch[] = [];
  zaps: Zap[] = [];
  allies: Ally[] = [];
  /** v1.0: when the stash last changed (ms), so the newest copy of the shared stash wins */
  stashAt = 0;
  private flow = new Uint16Array(60 * 60);
  private flowFrom = -1;
  private nextId = 1;
  private exploreT = 0;
  private skillCd = 0;
  events: GameEvents;
  /** Auto-potion settings (copied from Settings by main.ts). */
  auto = { hp: true, hpAt: 10, mp: true };
  private pressSeq = Array(SKILL_SLOTS).fill(0) as number[];
  private prevSkills = Array(SKILL_SLOTS).fill(false) as boolean[];
  private castSlot = -1;
  private noMana = { key: "", t: -99 };
  private autoHpT = -99;
  /** Return to Town channel in progress (seconds done / total). Monster hits don't stop it; walking does. */
  recall: { t: number; dur: number } | null = null;
  /** v1.0.1: levels you left recently, by floor (memory only; see FLOOR_KEEP_MS). */
  floorCache = new Map<number, { snap: DungeonSnap; left: number }>();
  /** wall clock for the level-keep timer (tests replace it) */
  now = () => Date.now();
  /** Blue portal in camp that leads back to the exact spot you recalled from (kept in memory only). */
  portal: { x: number; y: number; floor: number; snap: DungeonSnap } | null = null;
  /** world-space joystick direction from last frame (used by Leap) */
  moveDir = { x: 0, y: 0, active: false };

  constructor(events: GameEvents, save?: SaveData | null, seed?: number, hero?: { cls: HeroClass; name?: string }) {
    this.events = events;
    this.seed = save?.seed ?? seed ?? (Math.random() * 1e9) | 0;
    const cls: HeroClass = hero?.cls ?? "barbarian";
    this.player = {
      cls, name: (hero?.name ?? "").trim().slice(0, 16) || CLASS_NAME[cls], mainAtk: null,
      x: 0, y: 0, r: 0.28, fx: 1, fy: 1, hp: 1, mana: 1, level: 1, xp: 0,
      base: { ...CLASS_DEF[cls].stats }, statPoints: 0, skillPoints: 1, skills: {}, slots: Array(SKILL_SLOTS).fill(null),
      bag: [], stash: [], equip: {}, nextHand: 0, frenzy: { stacks: 0, t: 0, decay: 0 }, gold: 0, stashGold: 0, hpPots: 3, mpPots: 1,
      action: null, walkPhase: 0, moving: false, buffs: { shout: 0, bo: 0, conc: 0, bers: 0, bcmd: 0 }, flash: 0, z: 0,
      moveTarget: null, dead: false, healLeft: 0, manaLeft: 0, kills: 0, artifacts: [], chillT: 0, poison: { t: 0, dps: 0 },
    };
    if (save) {
      Object.assign(this.player, JSON.parse(JSON.stringify(save.player)));
      this.player.bag = this.player.bag ?? [];
      this.player.stash = this.player.stash ?? [];
      this.player.artifacts = this.player.artifacts ?? [];
      // v1.1: stash gold (saves from before v1.1 start with none)
      const sg = Number(this.player.stashGold);
      this.player.stashGold = Number.isFinite(sg) && sg > 0 ? Math.floor(sg) : 0;
      // v0.9.2: 3 skill buttons (a skill on the v0.9 4th button is dropped; it stays learned)
      this.player.slots = Array.isArray(this.player.slots) ? this.player.slots.slice(0, SKILL_SLOTS) : [];
      while (this.player.slots.length < SKILL_SLOTS) this.player.slots.push(null);
      this.player.chillT = 0;
      this.player.poison = { t: 0, dps: 0 };
      if (!isHeroClass(this.player.cls)) this.player.cls = "barbarian";
      if (!this.player.name) this.player.name = CLASS_NAME[this.player.cls];
      if (!mainAtkOk(this.player.mainAtk, this.player.cls)) this.player.mainAtk = null;
      this.stashAt = save.stashAt ?? 0;
      this.floor = save.floor;
      this.maxFloor = Math.max(save.maxFloor ?? save.floor, save.floor);
    } else if (cls === "amazon") {
      // D2 Amazon: javelins and a buckler; a short bow and a quiver wait in the bag
      this.player.equip.main = makeItem("javelin", 1);
      this.player.equip.off = makeItem("shield", 1);
      this.player.equip.chest = makeItem("armor", 1);
      this.player.equip.belt = makeItem("belt", 1);
      addItem(this.player.bag, makeItem("short_bow", 1));
      addItem(this.player.bag, makeItem("arrows", 1));
    } else {
      this.player.equip.main = makeItem("axe", 1);
      this.player.equip.chest = makeItem("armor", 1);
      this.player.equip.belt = makeItem("belt", 1);
    }
    // like Diablo II, a loaded game starts in town
    this.goTown(true);
    const d = this.derived();
    this.player.hp = d.maxHp;
    this.player.mana = d.maxMana;
  }

  toSave(): SaveData {
    const p = this.player;
    return {
      v: SAVE_VERSION, seed: this.seed, floor: this.floor, maxFloor: this.maxFloor, stashAt: this.stashAt,
      player: {
        cls: p.cls, name: p.name, mainAtk: p.mainAtk,
        level: p.level, xp: p.xp, base: p.base, statPoints: p.statPoints, skillPoints: p.skillPoints,
        skills: p.skills, slots: p.slots.slice(0, SKILL_SLOTS), bag: p.bag, stash: p.stash, equip: p.equip, gold: p.gold, stashGold: p.stashGold,
        hpPots: p.hpPots, mpPots: p.mpPots, kills: p.kills, artifacts: p.artifacts,
      },
    };
  }

  // ------------------------------------------------------------------ level setup
  /** Travel to the town hub. */
  /** v1.0.1: remember the level you're leaving (see FLOOR_KEEP_MS). */
  private keepFloor() {
    if (this.inTown || !this.level || this.level.kind !== "dungeon") return;
    const p = this.player;
    const snap: DungeonSnap = { level: this.level, monsters: this.monsters, ground: this.ground, stairs: this.stairs, boss: this.boss, px: p.x, py: p.y };
    this.floorCache.delete(this.floor);
    this.floorCache.set(this.floor, { snap, left: this.now() });
    while (this.floorCache.size > FLOOR_KEEP_MAX) this.floorCache.delete(this.floorCache.keys().next().value!);
    // a camp portal to this level leads back to it as it is now
    if (this.portal && this.portal.floor === this.floor) this.portal.snap = { ...snap, px: this.portal.snap.px, py: this.portal.snap.py };
  }

  /** v1.0.1: the kept state of a level if you left it less than FLOOR_KEEP_MS ago (and forget expired ones). */
  private takeKeptFloor(floor: number): DungeonSnap | null {
    const t = this.now();
    for (const [f, e] of this.floorCache) if (t - e.left >= FLOOR_KEEP_MS) this.floorCache.delete(f);
    const e = this.floorCache.get(floor);
    if (!e) return null;
    this.floorCache.delete(floor);
    return e.snap;
  }

  goTown(silent = false) {
    this.keepFloor();
    this.inTown = true;
    this.level = generateTown();
    this.monsters = [];
    this.ground = [];
    this.floaters = [];
    this.particles = [];
    this.rings = [];
    this.stairs = null;
    this.boss = null;
    this.flowFrom = -1;
    const p = this.player;
    p.x = this.level.spawn.x;
    p.y = this.level.spawn.y;
    p.fx = 1;
    p.fy = 1;
    p.action = null;
    p.moveTarget = null;
    p.dead = false;
    p.buffs = { shout: 0, bo: 0, conc: 0, bers: 0, bcmd: 0, slowm: 0 };
    p.frenzy = { stacks: 0, t: 0, decay: 0 };
    this.patches = [];
    this.zaps = [];
    this.allies = [];
    p.chillT = 0;
    p.poison = { t: 0, dps: 0 };
    const d = this.derived();
    p.hp = d.maxHp;
    p.mana = d.maxMana;
    this.projectiles = [];
    this.shots = [];
    this.novas = [];
    this.wards = [];
    this.restock();
    // throwing weapons (v1.0: and quivers) refill for free in camp
    let refilled = 0;
    for (const it of [...Object.values(p.equip), ...p.bag.map((e) => e.item)]) {
      if (it && qtyMax(it) > 0 && (it.qty ?? 0) < qtyMax(it)) {
        it.qty = qtyMax(it);
        refilled++;
      }
    }
    if (refilled) setTimeout(() => this.events.toast(p.cls === "amazon" ? "Hilde restocked your javelins and arrows" : "Hilde restocked your throwing weapons"), silent ? 900 : 1600);
    if (!silent) {
      this.events.sound("stairs");
      this.events.toast("Ember Camp — you're safe here");
      this.events.changed();
    }
  }

  /** Travel to a dungeon level (by waypoint or stairs). */
  goDungeon(floor: number) {
    this.startFloor(floor);
    this.events.sound("stairs");
    const a = actDef(this.floor);
    const l = levelInAct(this.floor);
    this.events.toast(l === 1 ? `Act ${a.roman}: ${a.area} — ${a.tagline}` : isFinalLevel(this.floor) ? `${floorName(this.floor)} — the lair of ${MONSTERS[a.finalBoss].name}` : `${floorName(this.floor)}/${LEVELS_PER_ACT}`);
    // v0.9.2: the top-left text is gone, so the first trip down says where the way home is
    if (this.floor === 1 && this.player.kills === 0) setTimeout(() => this.events.toast("Tip: ⌂ Town (top right) takes you back to camp at any time"), 3200);
    this.events.changed();
  }

  /** Vendor goods: basics plus a few random pieces near the deepest level reached. */
  restock() {
    const stock: BagEntry[] = [];
    const rng = new Rng(this.seed + this.maxFloor * 31 + Math.floor(this.time * 7));
    const r = () => rng.next();
    const lvl = Math.max(1, Math.round(mlvlOf(this.maxFloor) * 1.4));
    const add = (it: Item) => addItem(stock, it, VENDOR_W, VENDOR_H);
    add(makeItem("hp_potion"));
    add(makeItem("mp_potion"));
    // plain gear of every class near your level
    for (const id of ["sword", "axe", "mace", "great_sword", "quarterstaff", "throwing_knife", "throwing_axe", "javelin", "spear", "short_bow", "long_bow", "arrows", "armor", "helm", "shield", "gloves", "boots", "belt"]) add(makeItem(id, Math.max(1, lvl - 1 + Math.floor(r() * 3))));
    // a few magic pieces (Hilde never sells rares)
    const n = 2 + Math.floor(r() * 3);
    const pool = ITEM_BASES.filter((b) => b.weight > 0 && b.slot !== "quiver"); // arrows are never magic
    // v1.1: the first one is always a weapon for your class
    const mine = new Set(CLASS_WEAPONS[this.player.cls] ?? []);
    const classPool = pool.filter((b) => mine.has(b.id));
    for (let i = 0, got = 0; i < n * 4 && got < n; i++) {
      const from = got === 0 && classPool.length ? classPool : pool;
      const b = from[Math.floor(r() * from.length)];
      const it = enchant(makeItem(b.id, lvl + Math.floor(r() * 3)), "magic", r, this.player.cls);
      if (it.q === "magic" && add(it)) got++;
    }
    this.vendorStock = stock;
  }

  startFloor(floor: number) {
    floor = Math.max(1, Math.min(MAX_FLOOR, floor));
    this.keepFloor();
    const kept = this.takeKeptFloor(floor);
    this.inTown = false;
    this.floor = floor;
    this.maxFloor = Math.max(this.maxFloor, floor);
    this.level = kept ? kept.level : generateLevel(this.seed + floor * 7919);
    this.monsters = [];
    this.ground = [];
    this.floaters = [];
    this.particles = [];
    this.rings = [];
    this.projectiles = [];
    this.shots = [];
    this.novas = [];
    this.wards = [];
    this.patches = [];
    this.zaps = [];
    this.allies = [];
    this.stairs = null;
    this.flowFrom = -1;
    const rng = new Rng(this.seed + floor * 104729);
    const p = this.player;
    p.x = this.level.spawn.x;
    p.y = this.level.spawn.y;
    p.action = null;
    p.moveTarget = null;
    this.boss = null;
    if (kept) {
      // v1.0.1: the level as you left it. Living monsters forget you and are back to full life.
      this.monsters = kept.monsters;
      this.ground = kept.ground;
      this.stairs = kept.stairs;
      this.boss = kept.boss;
      for (const m of this.monsters) {
        if (m.state === "dead") continue;
        m.state = "idle";
        m.hp = m.maxHp;
        m.leashed = false;
        m.homeFlow = undefined;
        m.x = m.homeX;
        m.y = m.homeY;
      }
      this.exploreAround(true);
      return;
    }
    let pack = 0;
    const act = actDef(floor);
    const ml = mlvlOf(floor);
    const lvl = levelInAct(floor);
    // unique monsters: from Act I level 3 on, one per level (two from level 10 on)
    let uniques = act.n === 1 && lvl < 3 ? 0 : lvl >= 10 ? 2 : 1;
    for (const room of this.level.rooms) {
      if (room === this.level.start) continue;
      const isBoss = room === this.level.bossRoom;
      // v0.8 difficulty: density climbs through each act and from act to act
      const extra = 0.12 + 0.02 * (lvl - 1) + 0.08 * (act.n - 1);
      const packs = isBoss ? 1 : rng.int(1, 2) + (rng.chance(extra) ? 1 : 0);
      for (let k = 0; k < packs; k++) {
        pack++;
        const kind: MonsterKind = act.monsters[rng.int(0, act.monsters.length - 1)];
        const [lo, hi] = MONSTERS[kind].pack;
        // elite packs: a unique leader with a normal pack, or a small pack of champions
        let tier: 0 | 1 | 2 = 0;
        if (!isBoss && uniques > 0 && rng.chance(0.3)) {
          tier = 2;
          uniques--;
        } else if (!isBoss && rng.chance(0.06 + 0.004 * lvl + 0.02 * (act.n - 1))) tier = 1;
        const nMods = tier === 2 ? Math.min(3, act.n === 1 ? 1 : act.n <= 3 ? 2 : 3) : tier === 1 ? 1 : 0;
        const mods = rng.shuffle(Object.keys(ELITE_MODS) as EliteMod[]).slice(0, nMods);
        const name = tier === 2 ? uniqueName(() => rng.next()) : "";
        const n = tier === 1 ? rng.int(2, Math.max(2, Math.min(4, hi))) : rng.int(lo, hi);
        for (let i = 0; i < n; i++) {
          const x = rng.int(room.x + 1, room.x + room.w - 2) + 0.5;
          const y = rng.int(room.y + 1, room.y + room.h - 2) + 0.5;
          const m = this.spawn(kind, ml, x, y, pack);
          if (tier === 1 || (tier === 2 && i === 0)) this.makeElite(m, tier, mods, name);
        }
      }
      if (isBoss) {
        pack++;
        this.boss = this.spawnBoss(floor, room.cx + 0.5, room.cy + 0.5, pack);
      }
    }
    this.exploreAround(true);
  }

  /**
   * The boss guarding the stairs. Levels 1-4 of an act have a named level boss that gets tougher
   * each level (higher monster level, more life and damage); level 5 has the act's final boss.
   */
  spawnBoss(floor: number, x: number, y: number, pack: number): Monster {
    const act = actDef(floor);
    const lvl = levelInAct(floor);
    const ml = mlvlOf(floor);
    if (isFinalLevel(floor)) {
      const m = this.spawn(act.finalBoss, ml + 2, x, y, pack);
      m.cd = 3;
      m.maxHp = m.hp = Math.round(m.hp * 1.2 * BOSS_HP_EXTRA); // v0.8: tougher final bosses; v0.9.3: 1.9x v0.9.2
      this.bossUp(m, floor);
      m.def = { ...m.def, specials: [...(m.def.specials ?? []), "slam"] };
      return m;
    }
    const m = this.spawn(act.levelBoss, ml + 1, x, y, pack, { ...MONSTERS[act.levelBoss], name: bossName(act, lvl) });
    // on top of the climbing monster level, each level's boss gets +4% life and +2% damage
    const k = 1 + 0.04 * (lvl - 1);
    m.maxHp = m.hp = Math.round(m.hp * k * 1.25 * BOSS_HP_EXTRA); // v0.8: +25% life on every level boss; v0.9.3: 1.9x v0.9.2
    this.bossUp(m, floor);
    m.cd = slamEvery(floor) * 0.6;
    return m;
  }

  /** v0.9.4: boss damage set from the on-level hero's life, plus elite-style modifiers (shown on the boss bar). */
  private bossUp(m: Monster, floor: number) {
    // v1.1: from the monster's damage before the difficulty curve, so boss hits stay exactly as in v1.0.1
    const raw = (v: number) => Math.max(1, Math.round(scaleDmg(v, m.mlvl) * MON_DMG));
    const lo = raw(m.def.dmgMin);
    const hi = raw(m.def.dmgMax);
    const avg = (lo + hi) / 2 || 1;
    const k = (bossHitShare(floor) * heroLifeRef(floor)) / avg;
    m.dmgMin = Math.max(1, Math.round(lo * k));
    m.dmgMax = Math.max(m.dmgMin, Math.round(hi * k));
    const mods = bossMods(floor);
    const d: MonsterDef = { ...m.def, atkInterval: m.def.atkInterval * 0.9 }; // a little quicker than before
    if (mods.includes("fast")) {
      d.speed *= 1.2;
      d.atkInterval *= 0.8;
      d.windup *= 0.85;
    }
    if (mods.includes("stone")) m.defense = Math.round(m.defense * 2);
    m.def = d;
    m.mods = mods;
  }

  /** Turn a monster into a champion (tier 1, blue) or a unique (tier 2, gold) with modifiers. */
  makeElite(m: Monster, tier: 1 | 2, mods: EliteMod[], name: string) {
    const d: MonsterDef = { ...m.def, name: tier === 2 ? name : `Champion ${m.def.name}` };
    let hp = tier === 2 ? 4 : 2.5;
    let dmg = tier === 2 ? 1.5 : 1.3;
    if (mods.includes("strong")) dmg *= 1.5;
    if (mods.includes("fast")) {
      d.speed *= 1.35;
      d.atkInterval *= 0.75;
      d.windup *= 0.8;
    }
    if (mods.includes("stone")) {
      hp *= 1.25;
      m.defense *= 3;
    }
    if (mods.includes("fire")) d.elem = "fire";
    if (mods.includes("cold")) d.elem = "cold";
    d.aggro += 2;
    m.def = d;
    m.elite = tier;
    m.mods = mods;
    m.mlvl += tier;
    m.maxHp = m.hp = Math.round(m.hp * hp);
    m.dmgMin = Math.round(m.dmgMin * dmg);
    m.dmgMax = Math.round(m.dmgMax * dmg);
    m.ar = Math.round(m.ar * 1.2);
    m.xp = Math.round(m.xp * (tier === 2 ? 5 : 3));
  }

  private spawn(kind: MonsterKind, mlvl: number, x: number, y: number, pack: number, defOverride?: MonsterDef): Monster {
    const def = defOverride ?? MONSTERS[kind];
    const ch = curveHp(this.floor);
    const cd = curveDmg(this.floor);
    const hp = Math.round(scaleHp(def.hp, mlvl) * MON_HP * ch);
    const m: Monster = {
      id: this.nextId++, def, mlvl, x, y, hp, maxHp: hp,
      dmgMin: Math.max(1, Math.round(scaleDmg(def.dmgMin, mlvl) * MON_DMG * cd)), dmgMax: Math.max(1, Math.round(scaleDmg(def.dmgMax, mlvl) * MON_DMG * cd)),
      ar: scaleAR(def.ar, mlvl), defense: scaleDef(def.def, mlvl), xp: Math.max(1, Math.round(scaleXp(def.xp, mlvl) * actDef(Math.max(1, this.floor)).reward * XP_RATE)),
      state: "idle", atkT: 0, windT: 0, stunT: 0, fearT: 0, kx: 0, ky: 0, flash: 0, fx: 0, fy: 1,
      walkPhase: Math.random() * 6, pack, homeX: x, homeY: y, wanderT: Math.random() * 3, wx: x, wy: y,
      deadT: 0, searched: false, lastHurt: -99, cd: rand(0.5, 2), charging: 0, cdx: 0, cdy: 0, spIdx: 0, fuse: -1, minion: false, elite: 0, mods: [],
      flee: null, taunt: { t: 0, pct: 0 }, bcry: { t: 0, def: 0, dmg: 0 },
    };
    this.monsters.push(m);
    return m;
  }

  // ------------------------------------------------------------------ derived stats
  /** Sum of one stat over all equipped items. */
  gear(k: StatKey): number {
    let t = 0;
    for (const it of this.worn()) t += modTotal(it, k);
    return t;
  }

  private inactiveRefs: (Item | undefined)[] = [];
  private inactiveNums = [-1, -1, -1];
  private inactiveSet = new Set<EquipSlot>();
  private wornList: Item[] = [];
  /**
   * v1.1: worn items whose requirements you no longer meet (say a Dexterity ring came off) stop working until you
   * meet them again, like Diablo II's red items: no stats, defense, +skills or damage. An item's own bonuses never
   * count toward its own requirements. Cached until the gear, level or base Strength/Dexterity change.
   */
  inactiveSlots(): Set<EquipSlot> {
    const p = this.player;
    const eq = p.equip;
    const refs = this.inactiveRefs;
    const nums = this.inactiveNums;
    let same = nums[0] === p.level && nums[1] === p.base.str && nums[2] === p.base.dex;
    for (let i = 0; same && i < EQUIP_ORDER.length; i++) if (refs[i] !== eq[EQUIP_ORDER[i]]) same = false;
    if (same) return this.inactiveSet;
    const off = new Set<EquipSlot>();
    for (let pass = 0; pass < 12; pass++) {
      let str = p.base.str;
      let dex = p.base.dex;
      for (const sl of EQUIP_ORDER) if (eq[sl] && !off.has(sl)) { str += modTotal(eq[sl], "str"); dex += modTotal(eq[sl], "dex"); }
      let changed = false;
      for (const sl of EQUIP_ORDER) {
        const it = eq[sl];
        if (!it || off.has(sl)) continue;
        const r = itemReqs(it);
        if (str - modTotal(it, "str") < r.str || dex - modTotal(it, "dex") < r.dex || p.level < r.lvl) {
          off.add(sl);
          changed = true;
        }
      }
      if (!changed) break;
    }
    for (let i = 0; i < EQUIP_ORDER.length; i++) refs[i] = eq[EQUIP_ORDER[i]];
    nums[0] = p.level;
    nums[1] = p.base.str;
    nums[2] = p.base.dex;
    this.inactiveSet = off;
    this.wornList = [];
    for (const sl of EQUIP_ORDER) if (eq[sl] && !off.has(sl)) this.wornList.push(eq[sl]!);
    return off;
  }
  /** v1.1: is the item in this slot working (worn and its requirements met)? */
  usable(sl: EquipSlot): boolean {
    return !!this.player.equip[sl] && !this.inactiveSlots().has(sl);
  }
  /** v1.1: the worn items that are working. */
  worn(): Item[] {
    this.inactiveSlots();
    return this.wornList;
  }

  /** Attributes with gear bonuses. */
  stats(): Stats {
    const b = this.player.base;
    return { str: b.str + this.gear("str"), dex: b.dex + this.gear("dex"), vit: b.vit + this.gear("vit"), ene: b.ene + this.gear("ene") };
  }

  /** Stats for one hand. `thrown`: the weapon is being thrown (Throwing Mastery instead of its melee mastery). */
  handFor(slot: EquipSlot | null, thrown = false): Hand {
    const p = this.player;
    const s = this.stats();
    const it = slot ? p.equip[slot] : undefined;
    const b = it ? BASE_BY_ID[it.baseId] : null;
    const kind: Kind | "fist" = b ? b.kind : "fist";
    const bow = kind === "bow";
    const missile = thrown || bow;
    const mastery = thrown ? "throwing_mastery" : MASTERY_OF[kind] ?? null;
    const ml = mastery ? this.skillLevel(mastery) : 0;
    // v1.0 Amazon: Penetrate raises missile attack rating; Critical Strike stacks with mastery crits
    const arPct = (ml ? masteryAR(ml) : 0) + (missile ? (this.skillLevel("penetrate") ? penetrateAR(this.skillLevel("penetrate")) : 0) : 0);
    const arFlat = this.gear("ar");
    const [min, max] = it && b ? itemDamage(it) : [1, 2];
    const cs = critStrike(this.skillLevel("critical_strike"));
    const mc = masteryCrit(ml);
    // D2: bows get their damage bonus from Dexterity, thrown weapons from both, melee from Strength
    const statPct = bow ? s.dex : thrown ? Math.round(0.75 * (s.str + s.dex)) : s.str;
    return {
      slot,
      missile,
      min,
      max,
      dmgPct: statPct + (ml ? masteryDmg(ml) : 0),
      ar: Math.round((s.dex * 5 + 20 + p.level * 5 + arFlat) * (1 + arPct / 100)),
      crit: cs ? Math.round(100 * (1 - (1 - mc / 100) * (1 - cs / 100))) : mc,
      speed: b ? b.speed! : 0.42,
      kind,
      twoHanded: !!b && b.hands === 2,
    };
  }

  derived(): Derived {
    const p = this.player;
    const s = this.stats();
    const isWeapon = (sl: EquipSlot) => this.usable(sl) && BASE_BY_ID[p.equip[sl]!.baseId].slot === "weapon";
    const hands: Hand[] = [];
    if (isWeapon("main")) hands.push(this.handFor("main"));
    if (isWeapon("off")) hands.push(this.handFor("off"));
    if (!hands.length) hands.push(this.handFor(null));
    let armor = 0;
    for (const it of this.worn()) armor += itemDefense(it);
    const g = (k: StatKey) => this.gear(k);
    let defPct = 0;
    const isl = this.skillLevel("iron_skin");
    if (isl) defPct += ironSkinDef(isl);
    if (p.buffs.shout > 0) defPct += shoutDef(this.skillLevel("shout") || 1);
    if (p.buffs.conc > 0) defPct += concDef(this.skillLevel("concentrate") || 1);
    const stam = stamLife(this.skillLevel("increased_stamina"));
    const boMul = p.buffs.bo > 0 ? 1 + boPct(this.skillLevel("battle_orders") || 1) / 100 : 1;
    const cd = CLASS_DEF[p.cls] ?? CLASS_DEF.barbarian;
    const maxHp = Math.round((cd.life + (s.vit - cd.stats.vit) * cd.lifePerVit + (p.level - 1) * 2 + g("life")) * boMul * (1 + stam / 100));
    const maxMana = Math.round((cd.mana + (s.ene - cd.stats.ene) * cd.manaPerEne + (p.level - 1) * 1.5 + g("mana")) * boMul);
    const fl = this.skillLevel("frenzy");
    const gearIas = Math.min(60, g("ias"));
    const ias = (fl ? (p.frenzy.stacks * frenzyIas(fl)) / 100 : 0) + gearIas / 100;
    const move = fl ? (p.frenzy.stacks * frenzyMove(fl)) / 100 : 0;
    const frw = g("frw");
    const m = hands[0];
    const all = g("ares") + natRes(this.skillLevel("natural_resistance"));
    const cap = (v: number) => Math.min(75, v);
    return {
      maxHp, maxMana, hands, dual: hands.length === 2,
      def: p.buffs.bers > 0 ? 0 : Math.round((armor + s.dex / 4) * (1 + defPct / 100)),
      speed: BASE_RUN * (1 + incSpeed(this.skillLevel("increased_speed")) / 100 + move + frw / 100) * (p.chillT > 0 ? 0.65 : 1),
      ias,
      dmgMin: m.min, dmgMax: m.max, dmgPct: m.dmgPct, ar: m.ar, crit: m.crit, swing: m.speed / (1 + ias), weaponKind: m.kind,
      res: { fire: cap(g("fres") + all), cold: cap(g("cres") + all), light: cap(g("lres") + all), poison: cap(g("pres") + all) },
      ll: g("ll"), ml: g("ml"), frw, gearIas, gf: g("gf"), mf: g("mf"), stats: s,
    };
  }

  /** What derived stats would be with an item put in a slot (for tooltips). */
  /**
   * Which equipment slots to compare a bag item against: both hands for a one-hand weapon
   * (main, and off-hand = dual wield / replacing a shield), both rings when both are worn.
   */
  compareSlots(it: Item): EquipSlot[] {
    const b = BASE_BY_ID[it.baseId];
    const opts = this.slotsFor(it);
    if (!opts.length) return [];
    // v0.8 compare sheet: a one-hander is shown against both hands, a ring against both rings
    if (b.slot === "weapon" && b.hands === 1) return ["main", "off"];
    if (b.slot === "ring") return ["ring1", "ring2"];
    return [opts[0]];
  }

  /**
   * Every stat difference from equipping `it` in `slot`, from the full stat model (derived()) plus
   * per-skill bonuses and requirements. Stats the new item lacks show up as losses.
   */
  compare(it: Item, slot: EquipSlot): CompareRow[] {
    const now = this.derived();
    const then = this.previewEquip(it, slot);
    const rows: CompareRow[] = [];
    for (const m of COMPARE_METRICS) {
      const a = m.get(now);
      const b = m.get(then);
      const diff = b - a;
      if (Math.abs(diff) < (m.digits ? 0.5 * 10 ** -m.digits : 0.5)) continue;
      rows.push({ id: m.id, label: m.label, diff, digits: m.digits ?? 0, unit: m.unit ?? "", good: m.lowerBetter ? diff < 0 : diff > 0 });
    }
    // +skills (whether or not the skill is learned yet)
    const skillsOf = (x: Item | undefined) => {
      const out: Record<string, number> = {};
      for (const md of x?.mods ?? []) if (md.s === "skill" && md.sk) out[md.sk] = (out[md.sk] ?? 0) + md.v;
      return out;
    };
    const p = this.player;
    const gone = [p.equip[slot], slot === "main" && offBlocked(it, p.equip.off) ? p.equip.off : undefined];
    const before: Record<string, number> = {};
    for (const x of gone) for (const [k, v] of Object.entries(skillsOf(x))) before[k] = (before[k] ?? 0) + v;
    const after = skillsOf(it);
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const diff = (after[k] ?? 0) - (before[k] ?? 0);
      if (diff) rows.push({ id: `skill:${k}`, label: `to ${SKILL_BY_ID[k]?.name ?? k}`, diff, digits: 0, unit: "", good: diff > 0 });
    }
    // requirements: lower is better
    const cur = p.equip[slot];
    const rn = itemReqs(it);
    const rc = cur ? itemReqs(cur) : { str: 0, dex: 0, lvl: 0 };
    for (const [k, label] of [["str", "Strength needed"], ["dex", "Dexterity needed"], ["lvl", "level needed"]] as const) {
      const diff = rn[k] - rc[k];
      if (diff) rows.push({ id: `req:${k}`, label, diff, digits: 0, unit: "", good: diff < 0 });
    }
    return rows;
  }

  previewEquip(it: Item, slot: EquipSlot): Derived {
    const p = this.player;
    const saved = { ...p.equip };
    p.equip[slot] = it;
    if (slot === "main" && offBlocked(it, p.equip.off)) delete p.equip.off;
    const d = this.derived();
    p.equip = saved;
    return d;
  }

  meetsReq(it: Item): boolean {
    const r = itemReqs(it);
    const s = this.stats();
    return s.str >= r.str && s.dex >= r.dex && this.player.level >= r.lvl;
  }


  // ------------------------------------------------------------------ main update
  update(dt: number, input: FrameInput) {
    this.time += dt;
    const p = this.player;
    const d = this.derived();

    // world-space move direction from screen-space joystick
    if (input.mag > 0) {
      const a = input.mx / 32;
      const b = input.my / 16;
      let wx = (a + b) / 2;
      let wy = (b - a) / 2;
      const l = Math.hypot(wx, wy) || 1;
      wx /= l;
      wy /= l;
      this.moveDir = { x: wx, y: wy, active: true };
    } else this.moveDir.active = false;

    if (this.recall && !p.dead) {
      // channeling Return to Town: moving cancels it, monster hits don't
      if (input.mag > 0.35) {
        this.recall = null;
        this.events.toast("Return to Town cancelled");
      } else {
        this.recall.t += dt;
        if (this.recall.t >= this.recall.dur) {
          this.recall = null;
          this.finishRecall();
          return;
        }
        input = { ...input, mx: 0, my: 0, mag: 0, attack: false, skills: input.skills.map(() => false) };
      }
    } else if (p.dead) this.recall = null;
    if (!p.dead) this.updateAilments(dt);
    if (!p.dead) this.updatePlayer(dt, input, d);
    this.updateMonsters(dt, d);
    this.updateFx(dt);
    this.updateProjectiles(dt);
    this.updatePatches(dt);
    if (this.allies.length) this.updateAllies(dt);
    this.updateShots(dt, d);
    this.updateNovas(dt, d);
    for (const w of this.wards) w.t += dt;
    if (this.wards.length) this.wards = this.wards.filter((w) => w.t < w.life);
    if (!p.dead) {
      // artifacts are collected just by walking over them
      for (const g of this.ground) if (g.artifact && Math.hypot(g.x - p.x, g.y - p.y) < 0.75) {
        this.pickUp(g);
        break;
      }
    }
    this.exploreT -= dt;
    if (this.exploreT <= 0) {
      this.exploreT = 0.2;
      this.exploreAround(false);
    }
  }

  private updatePlayer(dt: number, input: FrameInput, d: Derived) {
    const p = this.player;
    // regen + potions
    // v0.8: slower natural regen (was full mana in 22 s, full life in 160 s)
    p.mana = Math.min(d.maxMana, p.mana + (d.maxMana / 45) * dt);
    p.hp = Math.min(d.maxHp, p.hp + (d.maxHp / 300) * (1 + stamRegen(this.skillLevel("increased_stamina")) / 100) * dt);
    if (p.healLeft > 0) {
      // potions heal over 1.5 s instead of half a second
      const amt = Math.min(p.healLeft, d.maxHp * 0.3 * dt);
      p.healLeft -= amt;
      p.hp = Math.min(d.maxHp, p.hp + amt);
    }
    if (p.manaLeft > 0) {
      const amt = Math.min(p.manaLeft, d.maxMana * 0.5 * dt);
      p.manaLeft -= amt;
      p.mana = Math.min(d.maxMana, p.mana + amt);
    }
    if (p.buffs.shout > 0) p.buffs.shout = Math.max(0, p.buffs.shout - dt);
    p.buffs.conc = Math.max(0, p.buffs.conc - dt);
    if (p.buffs.slowm) {
      p.buffs.slowm = Math.max(0, p.buffs.slowm - dt);
      if (p.buffs.slowm === 0) this.events.changed();
    }
    p.buffs.bers = Math.max(0, p.buffs.bers - dt);
    if (p.buffs.bcmd > 0) {
      p.buffs.bcmd = Math.max(0, p.buffs.bcmd - dt);
      if (p.buffs.bcmd === 0) this.events.changed();
    }
    if (p.buffs.bo > 0) {
      p.buffs.bo = Math.max(0, p.buffs.bo - dt);
      if (p.buffs.bo === 0) {
        const nd = this.derived();
        p.hp = Math.min(p.hp, nd.maxHp);
        p.mana = Math.min(p.mana, nd.maxMana);
      }
    }
    p.flash = Math.max(0, p.flash - dt * 4);
    if (p.frenzy.t > 0) p.frenzy.t = Math.max(0, p.frenzy.t - dt);
    else if (p.frenzy.stacks > 0) {
      p.frenzy.decay += dt;
      if (p.frenzy.decay >= 0.5) {
        p.frenzy.decay = 0;
        p.frenzy.stacks--;
      }
    }

    // auto health potion at low life (short cooldown so it never double-drinks)
    if (this.auto.hp && p.hp > 0 && p.hp <= (d.maxHp * this.auto.hpAt) / 100 && p.healLeft <= 0 && this.time - this.autoHpT > 2.5) {
      if (p.hpPots > 0 || p.bag.some((q) => BASE_BY_ID[q.item.baseId].potion === "hp")) {
        this.autoHpT = this.time;
        this.usePotion("hp");
        this.floatAt(p.x, p.y, "Auto potion", "#ff8a7a", 12);
      }
    }

    // start actions
    for (let i = 0; i < input.skills.length; i++) {
      if (input.skills[i] && !this.prevSkills[i]) {
        this.pressSeq[i]++;
        this.skillCd = 0; // a fresh press always gets a try (the 0.5 s retry delay is for holding)
      }
      this.prevSkills[i] = input.skills[i];
    }
    this.skillCd = Math.max(0, this.skillCd - dt);
    if (!p.action && this.skillCd <= 0) {
      for (let i = 0; i < input.skills.length; i++) {
        const id = p.slots[i];
        if (input.skills[i] && id) {
          this.castSlot = i;
          if (this.castSkill(id, d)) break;
          this.skillCd = 0.5;
        }
      }
    }
    // v1.2: a fresh press of ⚔ (for once-per-press skills on it)
    const freshAtk = input.attack && !this.prevAttack;
    if (freshAtk) this.atkPressPending = true;
    if (!input.attack) this.atkPressPending = false;
    this.prevAttack = input.attack;
    if (!p.action && input.attack) {
      const fresh = this.atkPressPending;
      this.atkPressPending = false;
      this.mainAttack(d, fresh);
    }

    // run current action
    p.moving = false;
    if (p.action) {
      this.runAction(dt, d);
      return;
    }

    // movement
    if (this.moveDir.active) {
      p.moveTarget = null;
      const spd = d.speed * (0.45 + 0.55 * Math.min(1, input.mag));
      this.moveEntity(p, this.moveDir.x * spd * dt, this.moveDir.y * spd * dt, p.r);
      p.fx = this.moveDir.x;
      p.fy = this.moveDir.y;
      p.moving = true;
      p.walkPhase += dt * spd * 3.2;
    } else if (p.moveTarget) {
      const g = p.moveTarget;
      if (!this.ground.includes(g)) p.moveTarget = null;
      else {
        const dx = g.x - p.x;
        const dy = g.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.8) {
          this.pickUp(g);
          p.moveTarget = null;
        } else {
          const ox = p.x;
          const oy = p.y;
          this.moveEntity(p, (dx / dist) * d.speed * dt, (dy / dist) * d.speed * dt, p.r);
          p.fx = dx / dist;
          p.fy = dy / dist;
          p.moving = true;
          p.walkPhase += dt * d.speed * 3.2;
          if (Math.hypot(p.x - ox, p.y - oy) < 0.002) p.moveTarget = null; // stuck on a wall
        }
      }
    }

    // auto-pickup gold, and potions while the belt has room
    for (const g of this.ground) {
      if (g.t < 0.35) continue;
      if (g.item) {
        const pk = BASE_BY_ID[g.item.baseId].potion;
        if (!pk || (pk === "hp" ? p.hpPots : p.mpPots) >= this.beltCap()) continue;
      }
      if (Math.hypot(g.x - p.x, g.y - p.y) < 0.75) {
        this.pickUp(g);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ skills & attacks
  /** Skill level including +skill gear (gear only boosts skills you've learned). */
  skillLevel(id: string) {
    const hard = this.player.skills[id] ?? 0;
    if (!hard) return 0;
    let bonus = 0;
    for (const it of this.worn()) for (const m of it.mods ?? []) if (m.s === "skill" && m.sk === id) bonus += m.v;
    if (this.player.buffs.bcmd > 0) bonus += bcmdBonus(this.gearLevel("battle_command"));
    return hard + bonus;
  }

  /** Hard points + gear (no Battle Command), so Battle Command doesn't feed itself. */
  private gearLevel(id: string) {
    const hard = this.player.skills[id] ?? 0;
    if (!hard) return 0;
    let bonus = 0;
    for (const it of this.worn()) for (const m of it.mods ?? []) if (m.s === "skill" && m.sk === id) bonus += m.v;
    return hard + bonus;
  }

  /** Points spent in a skill (no gear). */
  hardLevel(id: string) {
    return this.player.skills[id] ?? 0;
  }

  canLearn(id: string): { ok: boolean; why?: string } {
    const s = SKILL_BY_ID[id];
    const p = this.player;
    if (!s) return { ok: false, why: "Unknown skill" };
    if (s.cls === "any") return { ok: false, why: "Always available" };
    if (s.cls !== p.cls) return { ok: false, why: `${CLASS_NAME[s.cls]} only` };
    const lvl = this.hardLevel(id);
    if (!s.implemented) return { ok: false, why: "Coming soon" };
    if (lvl >= MAX_SKILL_LVL) return { ok: false, why: "Maxed" };
    if (p.level < s.reqLvl) return { ok: false, why: `Requires level ${s.reqLvl}` };
    if (lvl >= skillCap(p.level, s.reqLvl)) return { ok: false, why: `Next point at character level ${s.reqLvl + lvl}` };
    const missing = s.prereq.filter((q) => !this.skillLevel(q));
    if (missing.length) return { ok: false, why: `Requires ${missing.map((m) => SKILL_BY_ID[m].name).join(" and ")}` };
    if (p.skillPoints <= 0) return { ok: false, why: "No skill points" };
    return { ok: true };
  }

  learn(id: string): boolean {
    if (!this.canLearn(id).ok) return false;
    const p = this.player;
    p.skillPoints--;
    const first = !p.skills[id];
    p.skills[id] = (p.skills[id] ?? 0) + 1;
    // auto-assign a newly learned active skill to the first empty slot
    if (first && SKILL_BY_ID[id].kind === "active" && !p.slots.includes(id)) {
      const empty = p.slots.indexOf(null);
      if (empty >= 0) p.slots[empty] = id;
    }
    this.events.sound("learn");
    this.events.changed();
    return true;
  }

  assignSlot(slot: number, id: string | null) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= SKILL_SLOTS) return; // v0.9.3: buttons 1-3 only
    const p = this.player;
    if (id && !isBasic(id) && SKILL_BY_ID[id]?.cls !== p.cls) return; // v1.0: only your own class's skills
    if (id) {
      const prev = p.slots.indexOf(id);
      if (prev >= 0) p.slots[prev] = null;
    }
    p.slots[slot] = id;
    this.events.changed();
  }

  /** Which attack the main ⚔ button uses (null = automatic). v1.2: any learned active skill of your class too. */
  setMainAtk(id: string | null) {
    const p = this.player;
    p.mainAtk = id && mainAtkOk(id, p.cls) && (isBasic(id) || this.skillLevel(id) > 0) ? id : null;
    this.events.changed();
  }

  // ------------------------------------------------------------------ v1.2: respec one point at a time
  /** Gold you can pay a respec with: carried gold, plus the stash's gold while you are in camp (where the stash is). */
  respecFunds(): number {
    return this.player.gold + (this.inTown ? this.player.stashGold : 0);
  }
  private payRespec(): boolean {
    const p = this.player;
    const cost = respecCost(p.level);
    if (this.respecFunds() < cost) return false;
    const fromBag = Math.min(p.gold, cost);
    p.gold -= fromBag;
    p.stashGold -= cost - fromBag;
    return true;
  }
  /** Can one hard point come out of this skill? (Not if a skill you've learned needs it, like D2's tree.) */
  canUnlearn(id: string): { ok: boolean; why?: string; cost: number } {
    const p = this.player;
    const cost = respecCost(p.level);
    const s = SKILL_BY_ID[id];
    const hard = p.skills[id] ?? 0;
    if (!s || s.cls !== p.cls || hard <= 0) return { ok: false, why: "No points to remove", cost };
    if (hard === 1) {
      const needs = SKILLS.filter((o) => (p.skills[o.id] ?? 0) > 0 && o.prereq.includes(id));
      if (needs.length) return { ok: false, why: `${needs.map((o) => o.name).join(" and ")} need${needs.length === 1 ? "s" : ""} it`, cost };
    }
    if (this.respecFunds() < cost) return { ok: false, why: `Needs ${cost.toLocaleString()} gold`, cost };
    return { ok: true, cost };
  }
  /** Take one point out of a skill for gold; the skill point comes back to spend again. */
  unlearn(id: string): string | null {
    const c = this.canUnlearn(id);
    if (!c.ok) return c.why ?? "Can't";
    const p = this.player;
    this.payRespec();
    p.skills[id]--;
    p.skillPoints++;
    if (p.skills[id] <= 0) {
      delete p.skills[id];
      if (this.skillLevel(id) <= 0) {
        // fully unlearned (no +skill gear keeps it): off the buttons
        p.slots = p.slots.map((q) => (q === id ? null : q));
        if (p.mainAtk === id) p.mainAtk = null;
      }
    }
    this.clampVitals();
    this.events.sound("gold");
    this.events.changed();
    return null;
  }
  /** Can one point come out of this stat? Never below the class's starting value or below what worn gear needs. */
  canUnstat(k: keyof Stats): { ok: boolean; why?: string; cost: number } {
    const p = this.player;
    const cost = respecCost(p.level);
    const min = (CLASS_DEF[p.cls] ?? CLASS_DEF.barbarian).stats[k];
    if (p.base[k] <= min) return { ok: false, why: `Starts at ${min}`, cost };
    if (k === "str" || k === "dex") {
      const before = new Set(this.inactiveSlots());
      p.base[k]--;
      const after = this.inactiveSlots();
      p.base[k]++;
      this.inactiveSlots();
      const lost = [...after].filter((sl) => !before.has(sl));
      if (lost.length) return { ok: false, why: `Your ${itemName(p.equip[lost[0]]!)} needs it`, cost };
    }
    if (this.respecFunds() < cost) return { ok: false, why: `Needs ${cost.toLocaleString()} gold`, cost };
    return { ok: true, cost };
  }
  /** Take one point out of a stat for gold; the stat point comes back to spend again. */
  unstat(k: keyof Stats): string | null {
    const c = this.canUnstat(k);
    if (!c.ok) return c.why ?? "Can't";
    const p = this.player;
    this.payRespec();
    p.base[k]--;
    p.statPoints++;
    this.clampVitals();
    this.events.sound("gold");
    this.events.changed();
    return null;
  }

  /** The closest unsearched corpse within reach (Find Potion, Find Item, Grim Ward). */
  private nearCorpse(): Monster | null {
    const p = this.player;
    let best: Monster | null = null;
    let bd = 2.6;
    for (const m of this.monsters) {
      if (m.state !== "dead" || m.searched || m.hidden) continue;
      const dd = Math.hypot(m.x - p.x, m.y - p.y);
      if (dd < bd) {
        bd = dd;
        best = m;
      }
    }
    return best;
  }

  /** Non-weapon damage (War Cry): always hits, no leech. */
  private directHit(m: Monster, dmg: number, color: string) {
    m.hp -= dmg;
    m.flash = 1;
    m.lastHurt = this.time;
    this.floatAt(m.x, m.y, `${dmg}`, color, 15);
    for (let i = 0; i < 5; i++) this.spark(m.x, m.y, m.def.blood, 3);
    if (m.hp <= 0) this.kill(m);
  }

  private nearestMonster(maxDist: number, requireLos = true): Monster | null {
    const p = this.player;
    let best: Monster | null = null;
    let bd = maxDist;
    for (const m of this.monsters) {
      if (m.state === "dead") continue;
      const dd = Math.hypot(m.x - p.x, m.y - p.y) - m.def.radius;
      if (dd < bd && (!requireLos || lineOfSight(this.level, p.x, p.y, m.x, m.y))) {
        bd = dd;
        best = m;
      }
    }
    return best;
  }

  /** Hand indexes that would throw for this attack, or null to melee. */
  private throwHands(skill: string | null, d: Derived): number[] | null {
    const p = this.player;
    const ok = (sl: EquipSlot) => isThrowing(p.equip[sl]) && this.usable(sl) && (p.equip[sl]!.qty ?? 0) > 0;
    if (skill === "double_throw") return d.dual && ok("main") && ok("off") ? [0, 1] : null;
    if (skill) return null;
    if (d.dual) {
      const h = p.nextHand % 2;
      if (ok(h ? "off" : "main")) return [h];
      if (ok(h ? "main" : "off")) return [1 - h];
      return null;
    }
    return ok("main") ? [0] : null;
  }

  private startThrow(skill: string | null, hands: number[], d: Derived) {
    const p = this.player;
    const sl = (h: number): EquipSlot => (h === 1 ? "off" : "main");
    const range = Math.max(...hands.map((h) => BASE_BY_ID[p.equip[sl(h)]!.baseId].thrown!.range));
    const target = this.nearestMonster(range);
    if (target) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const l = Math.hypot(dx, dy) || 1;
      p.fx = dx / l;
      p.fy = dy / l;
    } else if (this.moveDir.active) {
      p.fx = this.moveDir.x;
      p.fy = this.moveDir.y;
    }
    let dur = hands.reduce((a, h) => a + d.hands[Math.min(h, d.hands.length - 1)].speed, 0) / hands.length;
    if (hands.length === 2) dur *= 1.15;
    dur /= 1 + d.ias;
    if (p.cls === "amazon" && hands.every((h) => isSpearLike(p.equip[sl(h)]))) dur /= AMAZON_SPEED;
    if (d.dual && !skill) p.nextHand = 1 - hands[0];
    p.action = { type: "throw", skill, t: 0, dur, releaseAt: hands.length === 2 ? [0.28, 0.78] : [0.55], hands, done: 0, target };
    p.moveTarget = null;
    this.events.sound("swing");
  }

  private release(a: Extract<Action, { type: "throw" }>, handIdx: number) {
    const p = this.player;
    const slot: EquipSlot = handIdx === 1 ? "off" : "main";
    const it = p.equip[slot];
    if (!it || !isThrowing(it) || (it.qty ?? 0) <= 0) return;
    it.qty = (it.qty ?? 0) - 1;
    const b = BASE_BY_ID[it.baseId];
    let ax = p.fx;
    let ay = p.fy;
    const t = a.target && a.target.state !== "dead" ? a.target : null;
    if (t) {
      const l = Math.hypot(t.x - p.x, t.y - p.y) || 1;
      ax = (t.x - p.x) / l;
      ay = (t.y - p.y) / l;
    }
    if (a.hands.length === 2) {
      // Double Throw: the two weapons fan out slightly
      const ang = (handIdx === 0 ? -1 : 1) * 0.09;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      [ax, ay] = [ax * c - ay * sn, ax * sn + ay * c];
    }
    const speed = a.skill === "lightning_bolt" ? 20 : b.kind === "spear" ? 15 : 13;
    this.projectiles.push({
      x: p.x + ax * 0.4, y: p.y + ay * 0.4, vx: ax * speed, vy: ay * speed, dist: 0, range: b.thrown!.range + (a.skill === "lightning_bolt" ? 4 : 1),
      hand: this.handFor(slot, true), handIdx, skill: a.skill, cls: a.skill === "lightning_bolt" ? "lbolt" : it.baseId, t: 0,
      kind: a.skill === "lightning_bolt" ? "bolt" : "weapon", elem: a.skill === "lightning_bolt" ? "light" : a.skill === "poison_javelin" || a.skill === "plague_javelin" ? "poison" : undefined,
      hits: [], trail: 0,
    });
    if (a.skill === "lightning_bolt") this.events.sound("bolt");
    this.hitLog.push({ hand: handIdx, skill: a.skill ?? "throw", t: this.time });
    if (it.qty === 0) this.events.toast(`Out of ${b.name}s: they refill in camp (you can still fight with it)`);
    this.events.changed();
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const q = this.projectiles[i];
      q.t += dt;
      // Guided Arrow seeks and steers toward a target (v1.2.2); charged bolts wander
      if (q.seek) this.steerGuided(q, dt);
      else if (q.kind === "cbolt" && Math.random() < dt * 8) {
        const an = Math.atan2(q.vy, q.vx) + rand(-0.9, 0.9);
        const sp = Math.hypot(q.vx, q.vy);
        q.vx = Math.cos(an) * sp;
        q.vy = Math.sin(an) * sp;
      }
      const steps = 3;
      let gone = false;
      for (let k = 0; k < steps && !gone; k++) {
        const stepLen = (Math.hypot(q.vx, q.vy) * dt) / steps;
        q.x += (q.vx * dt) / steps;
        q.y += (q.vy * dt) / steps;
        q.dist += stepLen;
        if (q.skill === "poison_javelin") {
          q.trail = (q.trail ?? 0) + stepLen;
          if (q.trail > 0.8) {
            q.trail = 0;
            const lvl = this.skillLevel("poison_javelin");
            this.addPatch(q.x, q.y, 0.9, 1.8, this.avgHit(q.hand) * (poisonJavDps(lvl) / 100), "poison");
          }
        }
        if (this.blocked(q.x, q.y, 0.05) || q.dist > q.range) {
          gone = true;
          if (q.skill === "plague_javelin") this.plague(q.x - q.vx * 0.02, q.y - q.vy * 0.02, this.skillLevel("plague_javelin"), this.avgHit(q.hand));
          if (q.kind === "arrow" && (q.skill === "exploding_arrow" || q.skill === "immolation_arrow" || q.skill === "freezing_arrow") && !this.blocked(q.x, q.y, 0.05)) {
            // arrows that run out of range still go off where they land
            const lvl = this.skillLevel(q.skill);
            const avg = this.avgHit(q.hand);
            if (q.skill === "freezing_arrow") this.burst(q.x, q.y, 2, avg * (freezingDmg(lvl) / 100), "cold", { freeze: freezingFreeze(lvl) });
            else this.burst(q.x, q.y, 1.6, avg * ((q.skill === "exploding_arrow" ? explodingDmg(lvl) : immolationDmg(lvl)) / 100), "fire");
            if (q.skill === "immolation_arrow") this.addPatch(q.x, q.y, 1.5, immolationDur(lvl), avg * (immolationDps(lvl) / 100), "fire");
          }
          break;
        }
        for (const m of this.monsters) {
          if (m.state === "dead" || q.hits?.includes(m.id)) continue;
          if (Math.hypot(m.x - q.x, m.y - q.y) < m.def.radius + 0.22) {
            (q.hits ??= []).push(m.id);
            if (!this.projHit(q, m)) {
              gone = true;
              break;
            }
          }
        }
      }
      if (gone) this.projectiles.splice(i, 1);
    }
  }

  /**
   * v1.2.2: Guided Arrow homing, like D2. Before v1.2.2 it only followed a target picked when it was shot (the
   * nearest monster in the hero's sight) and turned instantly toward it; shot down a hall at monsters around the
   * corner it had no target, flew straight and hit the wall, and it stopped homing when its target died.
   * Now, in flight, it locks onto the nearest monster it can see within GUIDED_SEEK_R (preferring ones ahead),
   * re-acquires when its target dies, and turns at up to GUIDED_TURN rad/s toward it; when the target is around a
   * corner it follows the walking path to it, and it turns harder when a wall is just ahead.
   */
  private steerGuided(q: Projectile, dt: number) {
    if (q.homing && q.homing.state === "dead") q.homing = null;
    if (!q.homing) q.homing = this.guidedAcquire(q);
    const m = q.homing;
    if (!m) return;
    const sp = Math.hypot(q.vx, q.vy) || 1;
    let ax = m.x;
    let ay = m.y;
    if (!lineOfSight(this.level, q.x, q.y, m.x, m.y)) {
      // around a corner: follow the walking path toward the target, two tiles ahead
      if (!q.seekFlow || q.seekFlowFor !== m.id || this.time - (q.seekFlowT ?? 0) > 0.25) {
        q.seekFlow = bfs(this.level, Math.floor(m.x), Math.floor(m.y), q.seekFlow);
        q.seekFlowT = this.time;
        q.seekFlowFor = m.id;
      }
      const f = q.seekFlow;
      let tx = Math.floor(q.x);
      let ty = Math.floor(q.y);
      if (f[idx(tx, ty)] === 65535 || f[idx(tx, ty)] > GUIDED_SEEK_R * 3) {
        q.homing = null; // unreachable or too far by path: fly on and look again
        return;
      }
      for (let k = 0; k < 2; k++) {
        const st = this.flowStep({ x: tx + 0.5, y: ty + 0.5 }, f);
        if (!st) break;
        tx += Math.round(st.x);
        ty += Math.round(st.y);
      }
      ax = tx + 0.5;
      ay = ty + 0.5;
    }
    const want = Math.atan2(ay - q.y, ax - q.x);
    const cur = Math.atan2(q.vy, q.vx);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    // a wall just ahead: turn harder so it curves into the room instead of hitting the wall
    const wallAhead = this.blocked(q.x + (q.vx / sp) * 0.9, q.y + (q.vy / sp) * 0.9, 0.05);
    const maxTurn = GUIDED_TURN * (wallAhead ? 2.2 : 1) * dt;
    const an = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
    q.vx = Math.cos(an) * sp;
    q.vy = Math.sin(an) * sp;
    q.range = Math.min(q.maxRange ?? q.range, Math.max(q.range, q.dist + 2));
  }
  /** v1.2.2: the monster a Guided Arrow locks onto: in sight of the arrow, within GUIDED_SEEK_R, ahead preferred. */
  private guidedAcquire(q: { x: number; y: number; vx: number; vy: number }): Monster | null {
    const sp = Math.hypot(q.vx, q.vy) || 1;
    let best: Monster | null = null;
    let bs = Infinity;
    for (const m of this.monsters) {
      if (m.state === "dead" || m.hidden) continue;
      const dx = m.x - q.x;
      const dy = m.y - q.y;
      const d = Math.hypot(dx, dy);
      if (d > GUIDED_SEEK_R || !lineOfSight(this.level, q.x, q.y, m.x, m.y)) continue;
      const cos = (dx * q.vx + dy * q.vy) / (d * sp || 1);
      const score = d * (1 + 0.6 * (1 - cos)); // a monster behind counts as up to 2.2× further
      if (score < bs) {
        bs = score;
        best = m;
      }
    }
    return best;
  }
  /** v1.2.2: Guided Arrow at release: the monster nearest the aim line (within 35°, in bow range), seen or not. */
  private guidedAim(ang: number): Monster | null {
    const p = this.player;
    const R = this.bowRange();
    let best: Monster | null = null;
    let bs = Infinity;
    for (const m of this.monsters) {
      if (m.state === "dead" || m.hidden) continue;
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > R || d < 0.01) continue;
      let off = Math.atan2(dy, dx) - ang;
      while (off > Math.PI) off -= Math.PI * 2;
      while (off < -Math.PI) off += Math.PI * 2;
      if (Math.abs(off) > GUIDED_AIM_CONE) continue;
      const score = d * (1 + 2 * Math.abs(off));
      if (score < bs) {
        bs = score;
        best = m;
      }
    }
    return best;
  }

  /** v1.0: the main ⚔ button: the chosen basic attack, or automatic (shoot with a bow, throw a throwing weapon, else attack). */
  mainBasic(): BasicId {
    const p = this.player;
    if (p.mainAtk && isBasic(p.mainAtk)) return p.mainAtk;
    if (isBow(p.equip.main)) return "basic_shoot";
    return "basic_attack"; // "attack" still throws a throwing weapon automatically, like before v1.0
  }
  /** v1.2: the skill on ⚔ (null when ⚔ holds a basic attack or Auto) */
  mainSkill(): string | null {
    const id = this.player.mainAtk;
    return id && !isBasic(id) ? id : null;
  }
  private mainAttack(d: Derived, fresh: boolean) {
    const p = this.player;
    const sk = this.mainSkill();
    if (sk) {
      // v1.2: a skill on ⚔ works like on a skill button. Attack skills repeat while held and, out of mana, fall
      // back to a normal attack (as on the skill buttons); buffs, warcries and helpers fire once per press, and a
      // held ⚔ then keeps attacking. If the skill can't be used (no mana, wrong weapon), ⚔ attacks normally.
      if (this.skillLevel(sk) <= 0) {
        p.mainAtk = null; // unlearned (gear with the +skill came off): back to Auto
      } else if (!ONCE_PER_PRESS.has(sk) || fresh) {
        this.castSlot = -1;
        if (this.castSkill(sk, d)) return;
      }
      this.autoAttack(d);
      return;
    }
    const id = p.mainAtk as BasicId | null;
    if (!id) {
      this.autoAttack(d);
      return;
    }
    if (!this.castBasic(id, d) && id !== "basic_attack") this.startSwing(null, d, true);
  }
  /** Auto: shoot with a bow, throw a throwing weapon with a stack, else melee. */
  private autoAttack(d: Derived) {
    const p = this.player;
    if (isBow(p.equip.main) && this.usable("main")) this.castBasic("basic_shoot", d);
    else if (isBow(p.equip.main)) {
      this.unusableHint("main");
      this.startSwing(null, d, true);
    } else this.startSwing(null, d); // throws a throwing weapon with a stack, else melee
  }
  /** v1.0: basic attacks (no mana, no points). Returns false when it can't be used right now. */
  castBasic(id: BasicId, d: Derived): boolean {
    const p = this.player;
    if (id === "basic_shoot" || (id === "basic_attack" && isBow(p.equip.main) && this.usable("main"))) {
      if (!isBow(p.equip.main)) {
        this.hint("Needs a bow");
        return false;
      }
      if (!this.usable("main")) {
        this.unusableHint("main");
        return false;
      }
      if (!this.hasArrows()) {
        this.hint("No arrows: equip a quiver (refills in camp)");
        return false;
      }
      this.startShoot(null, d);
      return true;
    }
    if (id === "basic_throw") {
      const th = this.throwHands(null, d);
      if (!th) {
        const w = p.equip.main ?? p.equip.off;
        this.hint(isThrowing(w) ? `Out of ${BASE_BY_ID[w!.baseId].name}s (refill in camp)` : "Needs a throwing weapon");
        return false;
      }
      this.startThrow(null, th, d);
      return true;
    }
    this.startSwing(null, d, true);
    return true;
  }
  /** v1.1: "You can't use your Long Bow: needs 40 Dexterity". */
  unusableHint(sl: EquipSlot) {
    const it = this.player.equip[sl];
    if (!it) return;
    const r = itemReqs(it);
    const st = this.stats();
    const need = st.str < r.str ? `${r.str} Strength` : st.dex < r.dex ? `${r.dex} Dexterity` : `level ${r.lvl}`;
    this.hint(`You can't use your ${itemName(it)}: needs ${need}`);
  }
  hasArrows(): boolean {
    const q = this.player.equip.off;
    return isQuiver(q) && (q!.qty ?? 0) > 0;
  }

  private startSwing(skill: string | null, d: Derived, melee = false) {
    const p = this.player;
    const th = melee || (skill && SPEAR_MELEE.has(skill)) ? null : this.throwHands(skill, d);
    if (th) return this.startThrow(skill, th, d);
    const target = this.nearestMonster(2.4 + this.reachBonus());
    if (target) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const l = Math.hypot(dx, dy) || 1;
      p.fx = dx / l;
      p.fy = dy / l;
    } else if (this.moveDir.active) {
      p.fx = this.moveDir.x;
      p.fy = this.moveDir.y;
    }
    let hands: number[];
    let dur: number;
    let hitAt: number[] | null = null;
    if (skill === "jab") {
      // three quick stabs
      hands = [0, 0, 0];
      dur = d.hands[0].speed * 1.2;
      hitAt = [0.25, 0.52, 0.8];
    } else if (skill === "impale") {
      hands = [0];
      dur = d.hands[0].speed * 1.5;
      hitAt = [0.62];
    } else if (skill && TWO_HIT.has(skill)) {
      // one hit with each weapon when dual wielding, otherwise two with the main hand
      hands = d.dual ? [0, 1] : [0, 0];
      dur = ((d.hands[hands[0]].speed + d.hands[hands[1]].speed) / 2) * (skill === "frenzy" ? 0.9 : 1.05);
    } else {
      const h = d.dual ? p.nextHand % 2 : 0;
      hands = [h];
      dur = d.hands[h].speed;
      if (d.dual) p.nextHand = 1 - h;
    }
    dur /= 1 + d.ias;
    p.action = { type: "swing", skill, t: 0, dur, hitAt: hitAt ?? (hands.length === 2 ? [0.32, 0.72] : [0.5]), hands, hitsDone: 0, target };
    p.moveTarget = null;
    this.events.sound("swing");
  }

  // ------------------------------------------------------------------ v1.0 bows and Amazon effects
  /** Extra melee reach: spears reach further, javelins a little. */
  reachBonus(): number {
    const it = this.player.equip.main;
    const b = it ? BASE_BY_ID[it.baseId] : null;
    return b?.reach ?? (b?.kind === "spear" ? 0.2 : 0);
  }
  private bowRange(): number {
    const it = this.player.equip.main;
    return (it && BASE_BY_ID[it.baseId].range) || 11;
  }
  /** Strafe: the monsters in range and in sight, nearest first. */
  strafeTargets(lvl: number): Monster[] {
    const p = this.player;
    const R = this.bowRange();
    const list = this.monsters
      .filter((m) => m.state !== "dead" && Math.hypot(m.x - p.x, m.y - p.y) < R && lineOfSight(this.level, p.x, p.y, m.x, m.y))
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    return list.slice(0, strafeArrows(lvl));
  }
  /** Draw and shoot (Strafe: one arrow per target in quick succession). */
  startShoot(skill: string | null, d: Derived) {
    const p = this.player;
    const h = d.hands[0];
    const amz = p.cls === "amazon" ? AMAZON_SPEED : 1;
    let dur = h.speed / (1 + d.ias) / amz;
    let releaseAt = [BOW_RELEASE];
    let targets: Monster[] = [];
    let target: Monster | null = null;
    if (skill === "strafe") {
      const lvl = this.skillLevel("strafe");
      targets = this.strafeTargets(lvl);
      const n = strafeArrows(lvl);
      dur = (h.speed * (0.5 + 0.28 * n)) / (1 + d.ias) / amz;
      releaseAt = Array.from({ length: n }, (_, i) => 0.15 + (0.78 * i) / (n - 1));
      target = targets[0] ?? null;
    } else target = this.nearestMonster(this.bowRange());
    if (target) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const l = Math.hypot(dx, dy) || 1;
      p.fx = dx / l;
      p.fy = dy / l;
    } else if (this.moveDir.active) {
      p.fx = this.moveDir.x;
      p.fy = this.moveDir.y;
    }
    p.action = { type: "shoot", skill, t: 0, dur, releaseAt, done: 0, target, targets };
    p.moveTarget = null;
  }
  /** Let an arrow (or a fan of them) fly. */
  private releaseArrow(a: Extract<Action, { type: "shoot" }>, i: number) {
    const p = this.player;
    const q = p.equip.off;
    const free = a.skill === "magic_arrow";
    if (!free) {
      if (!isQuiver(q) || (q!.qty ?? 0) <= 0) return;
      q!.qty = (q!.qty ?? 0) - 1;
    }
    let t: Monster | null = a.skill === "strafe" && a.targets.length ? a.targets[i % a.targets.length] : a.target;
    if (t && t.state === "dead") t = a.skill === "strafe" ? a.targets.find((m) => m.state !== "dead") ?? null : null;
    let ang = Math.atan2(p.fy, p.fx);
    if (t) {
      ang = Math.atan2(t.y - p.y, t.x - p.x);
      p.fx = Math.cos(ang);
      p.fy = Math.sin(ang);
    }
    const hand = this.handFor("main");
    const lvl = a.skill ? this.skillLevel(a.skill) : 0;
    const n = a.skill === "multiple_shot" ? multiShotArrows(lvl) : 1;
    const spread = n > 1 ? Math.min(1.1, 0.11 * (n - 1)) : 0;
    const elem: Elem | undefined =
      a.skill === "fire_arrow" || a.skill === "exploding_arrow" || a.skill === "immolation_arrow" ? "fire"
      : a.skill === "cold_arrow" || a.skill === "ice_arrow" || a.skill === "freezing_arrow" ? "cold"
      : undefined;
    for (let k = 0; k < n; k++) {
      const an = ang + (n > 1 ? -spread / 2 + (spread * k) / (n - 1) : 0);
      const sp = 17;
      this.projectiles.push({
        x: p.x + Math.cos(an) * 0.4, y: p.y + Math.sin(an) * 0.4, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, dist: 0, range: this.bowRange() + 1,
        hand, handIdx: 0, skill: a.skill, cls: a.skill === "magic_arrow" ? "magic_arrow" : "arrow", t: 0, kind: "arrow", elem, hits: [],
        homing: a.skill === "guided_arrow" ? t ?? this.guidedAim(an) : null,
        seek: a.skill === "guided_arrow",
        maxRange: a.skill === "guided_arrow" ? this.bowRange() * GUIDED_RANGE_MUL : undefined,
      });
    }
    this.hitLog.push({ hand: 0, skill: a.skill ?? "shoot", t: this.time });
    if (this.hitLog.length > 40) this.hitLog.shift();
    this.events.sound("shoot");
    if (!free && q!.qty === 0) this.events.toast("Out of arrows: your quiver refills in camp");
    this.events.changed();
  }
  /** Average hit of a hand, for the elemental parts of Amazon skills (they scale with the weapon). */
  private avgHit(h: Hand) {
    return ((h.min + h.max) / 2) * (1 + h.dmgPct / 100);
  }
  /** Elemental (non-weapon) damage: always hits; cold can slow or freeze. */
  elemHit(m: Monster, dmg: number, elem: Elem, o: { chill?: number; freeze?: number; quiet?: boolean } = {}) {
    if (m.state === "dead") return;
    if (m.state === "idle") this.aggroPack(m);
    const n = Math.max(1, Math.round(dmg));
    m.hp -= n;
    m.flash = 1;
    m.lastHurt = this.time;
    this.chillOrFreeze(m, o.chill, o.freeze);
    this.floatAt(m.x, m.y, `${n}`, ELEM_COLOR[elem], o.quiet ? 11 : 14);
    if (!o.quiet) for (let i = 0; i < 4; i++) this.spark(m.x, m.y, ELEM_COLOR[elem], 2.5);
    if (m.hp <= 0) this.kill(m);
  }
  private chillOrFreeze(m: Monster, chill?: number, freeze?: number) {
    const k = m.def.rank === "final" ? 1 / 3 : m.def.rank === "boss" ? 1 / 2 : 1;
    if (chill) m.chillT = Math.max(m.chillT ?? 0, chill * (k < 1 ? 0.6 : 1));
    if (freeze) {
      m.stunT = Math.max(m.stunT, freeze * k);
      m.frozenT = Math.max(m.frozenT ?? 0, freeze * k);
      m.chillT = Math.max(m.chillT ?? 0, freeze * k + 1);
      if (m.state === "attack") m.state = "chase";
    }
  }
  /** Fire/cold burst around a point (Exploding, Immolation, Freezing Arrow). */
  private burst(x: number, y: number, r: number, dmg: number, elem: Elem, o: { freeze?: number } = {}) {
    this.rings.push({ x, y, t: 0, life: 0.45, radius: r, color: elem === "cold" ? "rgba(150,210,255," : "rgba(255,140,50," });
    for (let k = 0; k < 18; k++) this.spark(x + rand(-r, r) * 0.6, y + rand(-r, r) * 0.6, ELEM_COLOR[elem], 3);
    for (const m of [...this.monsters]) if (m.state !== "dead" && Math.hypot(m.x - x, m.y - y) < r + m.def.radius) this.elemHit(m, dmg * rand(0.85, 1.15), elem, o);
    this.events.sound(elem === "cold" ? "chill" : "nova");
  }
  /** Chain or fan out lightning to nearby monsters (Lightning Strike, Lightning Fury). */
  private chain(from: Monster | { x: number; y: number }, count: number, dmg: number, radius: number, fan: boolean) {
    const hit = new Set<Monster>();
    if ("id" in from) hit.add(from);
    let cur = { x: from.x, y: from.y };
    for (let i = 0; i < count; i++) {
      let best: Monster | null = null;
      let bd = radius;
      const at = fan ? { x: from.x, y: from.y } : cur;
      for (const m of this.monsters) {
        if (m.state === "dead" || hit.has(m)) continue;
        const dd = Math.hypot(m.x - at.x, m.y - at.y);
        if (dd < bd) {
          bd = dd;
          best = m;
        }
      }
      if (!best) break;
      hit.add(best);
      this.zap(at.x, at.y, best.x, best.y);
      this.elemHit(best, dmg * rand(0.85, 1.15), "light");
      cur = { x: best.x, y: best.y };
    }
    this.events.sound("bolt");
  }
  private zap(x1: number, y1: number, x2: number, y2: number) {
    const pts = [{ x: x1, y: y1 }];
    const n = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) * 2));
    for (let i = 1; i < n; i++) pts.push({ x: x1 + ((x2 - x1) * i) / n + rand(-0.25, 0.25), y: y1 + ((y2 - y1) * i) / n + rand(-0.25, 0.25) });
    pts.push({ x: x2, y: y2 });
    this.zaps.push({ pts, t: 0, life: 0.28 });
  }
  /** Charged Strike: small bolts that wander outward. */
  private chargedBolts(x: number, y: number, n: number, hand: Hand, skill: string) {
    const base = Math.atan2(this.player.fy, this.player.fx);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.55 + rand(-0.2, 0.2);
      this.projectiles.push({ x, y, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, dist: 0, range: 6, hand, handIdx: 0, skill, cls: "cbolt", t: 0, kind: "cbolt", elem: "light", hits: [] });
    }
  }
  private addPatch(x: number, y: number, r: number, life: number, dps: number, elem: Elem) {
    this.patches.push({ x, y, r, t: 0, life, dps, elem, tick: 0 });
  }
  private updatePatches(dt: number) {
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const pa = this.patches[i];
      pa.t += dt;
      pa.tick -= dt;
      if (pa.tick <= 0) {
        pa.tick += 0.5;
        for (const m of [...this.monsters]) if (m.state !== "dead" && Math.hypot(m.x - pa.x, m.y - pa.y) < pa.r + m.def.radius) this.elemHit(m, pa.dps * 0.5, pa.elem, { quiet: true });
      }
      if (Math.random() < dt * 10) this.spark(pa.x + rand(-pa.r, pa.r) * 0.7, pa.y + rand(-pa.r, pa.r) * 0.7, ELEM_COLOR[pa.elem], 1.5);
      if (pa.t >= pa.life) this.patches.splice(i, 1);
    }
    for (const z of this.zaps) z.t += dt;
    if (this.zaps.length) this.zaps = this.zaps.filter((z) => z.t < z.life);
  }
  /** What a projectile does when it reaches a monster. Returns true if it keeps flying. */
  private projHit(q: Projectile, m: Monster): boolean {
    const sk = q.skill;
    const lvl = sk ? this.skillLevel(sk) : 0;
    const avg = this.avgHit(q.hand);
    const pierce = () => chance(pierceChance(this.skillLevel("pierce")) / 100);
    if (q.kind === "cbolt") {
      this.elemHit(m, avg * (chargedStrikeDmg(lvl) / 100), "light");
      return false;
    }
    if (q.kind === "bolt") {
      this.elemHit(m, avg * (lightningBoltDmg(lvl) / 100), "light");
      return true; // Lightning Bolt passes through everything
    }
    if (q.kind === "arrow") {
      switch (sk) {
        case "magic_arrow": this.playerHit(m, q.hand, { dmgPct: magicArrowDmg(lvl), magic: true, knock: 1 }); break;
        case "fire_arrow": this.playerHit(m, q.hand, { elem: { e: "fire", pct: fireArrowDmg(lvl) }, knock: 1 }); break;
        case "cold_arrow": this.playerHit(m, q.hand, { elem: { e: "cold", pct: coldArrowDmg(lvl) }, chill: coldArrowChill(lvl), knock: 1 }); break;
        case "ice_arrow": this.playerHit(m, q.hand, { elem: { e: "cold", pct: iceArrowDmg(lvl) }, freeze: iceArrowFreeze(lvl), knock: 1 }); break;
        case "multiple_shot": this.playerHit(m, q.hand, { mult: multiShotPer(lvl) / 100, knock: 1 }); break; // v1.2.1: volley total split per arrow
        case "guided_arrow": this.playerHit(m, q.hand, { dmgPct: guidedDmg(lvl), sure: true, knock: 1.5 }); break;
        case "strafe": this.playerHit(m, q.hand, { dmgPct: strafeDmg(lvl), knock: 1 }); break;
        case "exploding_arrow":
          this.playerHit(m, q.hand, { knock: 1 });
          this.burst(q.x, q.y, 1.6, avg * (explodingDmg(lvl) / 100), "fire");
          return false;
        case "immolation_arrow":
          this.playerHit(m, q.hand, { knock: 1 });
          this.burst(q.x, q.y, 1.6, avg * (immolationDmg(lvl) / 100), "fire");
          this.addPatch(q.x, q.y, 1.5, immolationDur(lvl), avg * (immolationDps(lvl) / 100), "fire");
          return false;
        case "freezing_arrow":
          this.playerHit(m, q.hand, { knock: 1 });
          this.burst(q.x, q.y, 2, avg * (freezingDmg(lvl) / 100), "cold", { freeze: freezingFreeze(lvl) });
          return false;
        default: this.playerHit(m, q.hand, { knock: 1.2 });
      }
      return sk !== "guided_arrow" && pierce();
    }
    // thrown weapons
    const dtl = sk === "double_throw" ? this.skillLevel("double_throw") : 0;
    if (sk === "plague_javelin") {
      this.playerHit(m, q.hand, { knock: 1 });
      this.plague(q.x, q.y, lvl, avg);
      return false;
    }
    if (sk === "lightning_fury") {
      this.playerHit(m, q.hand, { knock: 1 });
      this.chain({ x: q.x, y: q.y }, furyBolts(lvl), avg * (furyDmg(lvl) / 100), 6, true);
      return false;
    }
    this.playerHit(m, q.hand, { arPct: dtl ? doubleThrowAR(dtl) : 0, knock: 1.2 });
    return pierce();
  }
  private plague(x: number, y: number, lvl: number, avg: number) {
    this.addPatch(x, y, 2.2, 3, avg * (plagueDps(lvl) / 100), "poison");
    this.rings.push({ x, y, t: 0, life: 0.6, radius: 2.2, color: "rgba(140,224,74," });
    this.events.sound("poison");
  }
  /** Decoy and Valkyrie. */
  private updateAllies(dt: number) {
    const p = this.player;
    for (let i = this.allies.length - 1; i >= 0; i--) {
      const a = this.allies[i];
      a.t += dt;
      a.swingT = Math.max(0, a.swingT - dt);
      a.moving = false;
      if (a.hp <= 0 || a.t >= a.life) {
        for (let k = 0; k < 14; k++) this.spark(a.x, a.y, a.kind === "valkyrie" ? "#bcd8ff" : "#ffe8c0", 2.5);
        if (a.hp <= 0) this.floatAt(a.x, a.y, a.kind === "valkyrie" ? "The Valkyrie falls" : "Decoy destroyed", "#bcd8ff", 12);
        this.allies.splice(i, 1);
        continue;
      }
      if (a.kind !== "valkyrie") continue;
      // the Valkyrie fights the nearest monster near her (or near you), else follows you
      let tgt: Monster | null = null;
      let bd = 7;
      for (const m of this.monsters) {
        if (m.state === "dead") continue;
        const dd = Math.min(Math.hypot(m.x - a.x, m.y - a.y), Math.hypot(m.x - p.x, m.y - p.y) + 1);
        if (dd < bd) {
          bd = dd;
          tgt = m;
        }
      }
      const goTo = (x: number, y: number, stop: number) => {
        const dx = x - a.x;
        const dy = y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > stop) {
          const sp = 4.6 * dt;
          this.moveEntity(a, (dx / dist) * Math.min(sp, dist - stop), (dy / dist) * Math.min(sp, dist - stop), 0.25);
          a.fx = dx / dist;
          a.fy = dy / dist;
          a.moving = true;
          a.walkPhase += dt * 4.6 * 3.2;
        }
        return dist;
      };
      if (tgt) {
        const dist = goTo(tgt.x, tgt.y, tgt.def.radius + 0.75);
        a.atkT -= dt;
        if (dist <= tgt.def.radius + 0.95 && a.atkT <= 0) {
          a.atkT = 0.9;
          a.swingT = 0.4;
          const fx = tgt.x - a.x;
          const fy = tgt.y - a.y;
          const l = Math.hypot(fx, fy) || 1;
          a.fx = fx / l;
          a.fy = fy / l;
          const lvl = this.skillLevel("valkyrie") || 1;
          const [mn, mx] = itemDamage(makeItem("spear", p.level));
          const h = { ...this.handFor("main"), min: mn, max: mx, dmgPct: valkDmg(lvl) + p.level * 2, kind: "spear" as const, missile: false, crit: 0 };
          this.playerHit(tgt, h, { knock: 1.5, noLeech: true });
        }
      } else goTo(p.x - p.fx * 1.2, p.y - p.fy * 1.2, 0.6);
    }
  }
  /** v1.0: a Decoy pulls nearby normal monsters; the Valkyrie holds the monsters right next to her. */
  private lureFor(m: Monster): Ally | null {
    if (!this.allies.length) return null;
    const p = this.player;
    for (const a of this.allies) {
      const da = Math.hypot(m.x - a.x, m.y - a.y);
      if (a.kind === "decoy" && m.def.rank === "normal" && da < 8 && da < Math.hypot(m.x - p.x, m.y - p.y) + 2) return a;
      if (a.kind === "valkyrie" && m.def.rank !== "final" && da < 1.6 + m.def.radius) return a;
    }
    return null;
  }

  /** A short message over the hero, at most every 0.8 s (so a held button doesn't spam it). */
  private hintT = -99;
  hint(text: string) {
    if (this.time - this.hintT < 0.8) return;
    this.hintT = this.time;
    this.floatAt(this.player.x, this.player.y, text, "#ccc", 12);
  }

  castSkill(id: string, d: Derived): boolean {
    const p = this.player;
    if (isBasic(id)) return this.castBasic(id, d);
    const s = SKILL_BY_ID[id];
    const lvl = this.skillLevel(id);
    if (!s || !lvl || !s.implemented || s.kind !== "active") return false;
    // v1.0 Amazon weapon requirements (checked before mana, like D2's greyed-out skills)
    if (SPEAR_MELEE.has(id) && !isSpearLike(p.equip.main)) {
      this.hint("Needs a javelin or spear");
      return false;
    }
    if (JAV_THROWS.has(id) && !(isThrowing(p.equip.main) && isSpearLike(p.equip.main) && (p.equip.main!.qty ?? 0) > 0)) {
      this.hint(isThrowing(p.equip.main) && isSpearLike(p.equip.main) ? "Out of javelins (refill in camp)" : "Needs throwing javelins");
      return false;
    }
    if ((JAV_THROWS.has(id) || BOW_SKILLS.has(id) || SPEAR_MELEE.has(id)) && p.equip.main && !this.usable("main")) {
      this.unusableHint("main");
      return false;
    }
    if (BOW_SKILLS.has(id)) {
      if (!isBow(p.equip.main)) {
        this.hint("Needs a bow");
        return false;
      }
      if (id !== "magic_arrow" && !this.hasArrows()) {
        this.hint("No arrows: equip a quiver (refills in camp)");
        return false;
      }
    }
    const cost = s.mana ? s.mana(lvl) : 0;
    if (p.mana < cost) {
      this.floatAt(p.x, p.y, "Not enough mana", "#6aa6ff", 13);
      this.events.sound("nomana");
      // auto mana: a second, separate press within 1.5 s while still short drinks a mana potion
      if (this.castSlot >= 0) {
        const key = `${this.castSlot}:${this.pressSeq[this.castSlot]}`;
        if (key !== this.noMana.key) {
          const again = this.time - this.noMana.t < 1.5;
          this.noMana = { key, t: this.time };
          if (again && this.auto.mp && p.manaLeft <= 0 && (p.mpPots > 0 || p.bag.some((q) => BASE_BY_ID[q.item.baseId].potion === "mp"))) {
            this.usePotion("mp");
            this.floatAt(p.x, p.y - 0.4, "Auto mana potion", "#8ab8ff", 12);
          }
        }
      }
      // fall back to a normal attack for melee skills so holding the button still swings
      if (MELEE_SKILLS.has(id) || id === "double_throw" || JAV_THROWS.has(id)) {
        this.startSwing(null, d);
        return true;
      }
      if (BOW_SKILLS.has(id) && this.hasArrows()) {
        this.startShoot(null, d);
        return true;
      }
      return false;
    }
    if (JAV_THROWS.has(id)) {
      p.mana -= cost;
      this.startThrow(id, [0], d);
      return true;
    }
    if (BOW_SKILLS.has(id)) {
      if (id === "strafe" && !this.strafeTargets(lvl).length) {
        this.hint("No target");
        return false;
      }
      p.mana -= cost;
      this.startShoot(id, d);
      return true;
    }
    if (id === "double_throw") {
      const hands = this.throwHands(id, d);
      if (!hands) {
        this.floatAt(p.x, p.y, "Needs a throwing weapon in each hand", "#ccc", 12);
        return false;
      }
      p.mana -= cost;
      this.startThrow(id, hands, d);
      return true;
    }
    if (MELEE_SKILLS.has(id)) {
      p.mana -= cost;
      this.startSwing(id, d);
      const sw = p.action;
      if (id === "concentrate" && sw) p.buffs.conc = sw.dur + 0.3;
      if (id === "berserk") p.buffs.bers = BERSERK_DEF_T;
      return true;
    }
    switch (id) {
      case "inner_sight": {
        p.mana -= cost;
        let n = 0;
        for (const m of this.monsters) {
          if (m.state === "dead" || Math.hypot(m.x - p.x, m.y - p.y) > 9) continue;
          m.sight = { t: innerSightDur(lvl), def: innerSightDef(lvl) };
          n++;
        }
        this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.7, radius: 9, color: "rgba(255,240,160," });
        p.action = { type: "cry", t: 0, dur: 0.4 };
        this.floatAt(p.x, p.y, n ? `Inner Sight ×${n}` : "Inner Sight", "#fff0a0", 13);
        this.events.sound("shout");
        return true;
      }
      case "slow_missiles": {
        p.mana -= cost;
        p.buffs.slowm = slowMissilesDur(lvl);
        this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.7, radius: 10, color: "rgba(160,200,255," });
        p.action = { type: "cry", t: 0, dur: 0.4 };
        this.floatAt(p.x, p.y, "Slow Missiles", "#a0c8ff", 13);
        this.events.sound("shout");
        this.events.changed();
        return true;
      }
      case "decoy":
      case "valkyrie": {
        p.mana -= cost;
        const kind = id;
        this.allies = this.allies.filter((a) => a.kind !== kind); // one of each, like D2
        const ang = Math.atan2(p.fy, p.fx);
        let x = p.x + Math.cos(ang) * 1.4;
        let y = p.y + Math.sin(ang) * 1.4;
        if (this.blocked(x, y, 0.25)) {
          x = p.x;
          y = p.y;
        }
        const maxHp = Math.round(d.maxHp * (kind === "valkyrie" ? valkLife(lvl) / 100 : 0.6 + lvl * 0.1));
        this.allies.push({ kind, x, y, fx: p.fx, fy: p.fy, hp: maxHp, maxHp, t: 0, life: kind === "decoy" ? decoyDur(lvl) : Infinity, atkT: 0.5, swingT: 0, walkPhase: 0, moving: false });
        this.rings.push({ x, y, t: 0, life: 0.6, radius: 1.6, color: kind === "valkyrie" ? "rgba(170,210,255," : "rgba(255,230,180," });
        for (let i = 0; i < 14; i++) this.spark(x, y, kind === "valkyrie" ? "#bcd8ff" : "#ffe8c0", 2.5);
        p.action = { type: "cry", t: 0, dur: 0.45 };
        this.events.sound("summon");
        return true;
      }
      case "leap":
      case "leap_attack": {
        let tx: number;
        let ty: number;
        let target: Monster | null = null;
        if (id === "leap_attack") {
          target = this.nearestMonster(7);
          if (!target) {
            this.floatAt(p.x, p.y, "No target", "#ccc", 13);
            return false;
          }
          const dx = target.x - p.x;
          const dy = target.y - p.y;
          const l = Math.hypot(dx, dy) || 1;
          const stop = target.def.radius + p.r + 0.2;
          tx = target.x - (dx / l) * stop;
          ty = target.y - (dy / l) * stop;
          p.fx = dx / l;
          p.fy = dy / l;
        } else {
          const dir = this.moveDir.active ? this.moveDir : { x: p.fx, y: p.fy };
          const range = leapRange(lvl);
          tx = p.x;
          ty = p.y;
          for (let t = 0; t <= range; t += 0.1) {
            const nx = p.x + dir.x * t;
            const ny = p.y + dir.y * t;
            if (this.blocked(nx, ny, p.r)) break;
            tx = nx;
            ty = ny;
          }
          p.fx = dir.x;
          p.fy = dir.y;
        }
        p.mana -= cost;
        p.action = { type: "leap", skill: id, t: 0, dur: 0.55, fx: p.x, fy: p.y, tx, ty, target };
        p.moveTarget = null;
        this.events.sound("leap");
        return true;
      }
      case "howl": {
        p.mana -= cost;
        let n = 0;
        for (const m of this.monsters) {
          if (m.state === "dead") continue;
          if (Math.hypot(m.x - p.x, m.y - p.y) < 7) {
            m.fearT = m.def.rank !== "normal" ? howlDur(lvl) / (m.def.rank === "final" ? 4 : 2) : howlDur(lvl);
            m.flee = null;
            m.state = "chase";
            n++;
          }
        }
        this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.6, radius: 7, color: "rgba(230,200,120," });
        p.action = { type: "cry", t: 0, dur: 0.4 };
        this.events.sound("howl");
        if (!n) this.floatAt(p.x, p.y, "Howl", "#e8d9a0", 13);
        return true;
      }
      case "shout": {
        p.mana -= cost;
        p.buffs.shout = shoutDur(lvl, this.hardLevel("battle_orders") + this.hardLevel("battle_command"));
        this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.6, radius: 4, color: "rgba(150,190,255," });
        p.action = { type: "cry", t: 0, dur: 0.4 };
        this.floatAt(p.x, p.y, `Defense +${shoutDef(lvl)}%`, "#9cc0ff", 14);
        this.events.sound("shout");
        this.events.changed();
        return true;
      }
      case "battle_orders": {
        p.mana -= cost;
        const before = this.derived();
        p.buffs.bo = boDur(lvl, this.hardLevel("shout") + this.hardLevel("battle_command"));
        const after = this.derived();
        p.hp *= after.maxHp / before.maxHp;
        p.mana *= after.maxMana / before.maxMana;
        this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.6, radius: 4, color: "rgba(255,210,120," });
        p.action = { type: "cry", t: 0, dur: 0.4 };
        this.events.sound("shout");
        this.events.changed();
        return true;
      }
      case "whirlwind": {
        const dir = this.moveDir.active ? this.moveDir : { x: p.fx, y: p.fy };
        p.mana -= cost;
        p.action = { type: "whirl", t: 0, dur: WW_DUR, dx: dir.x, dy: dir.y, tick: 0, hand: 0, spin: Math.atan2(p.fy, p.fx) };
        p.moveTarget = null;
        this.events.sound("swing");
        return true;
      }
      case "taunt": {
        const m = this.nearestMonster(9);
        if (!m) {
          this.floatAt(p.x, p.y, "No target", "#ccc", 13);
          return false;
        }
        p.mana -= cost;
        m.taunt = { t: tauntDur(lvl), pct: tauntDmg(lvl) };
        m.fearT = 0;
        if (m.state === "idle") this.aggroPack(m);
        m.state = "chase";
        this.floatAt(m.x, m.y, "Taunted!", "#ff9a6a", 13);
        this.rings.push({ x: m.x, y: m.y, t: 0, life: 0.5, radius: 1.2, color: "rgba(255,120,80," });
        p.action = { type: "cry", t: 0, dur: 0.35 };
        this.events.sound("howl");
        return true;
      }
      case "battle_cry": {
        p.mana -= cost;
        let n = 0;
        for (const m of this.monsters) {
          if (m.state === "dead" || Math.hypot(m.x - p.x, m.y - p.y) > 6) continue;
          m.bcry = { t: bcDur(lvl), def: bcDef(lvl), dmg: BC_DMG };
          if (m.state === "idle") this.aggroPack(m);
          n++;
        }
        this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.6, radius: 6, color: "rgba(200,90,255," });
        p.action = { type: "cry", t: 0, dur: 0.4 };
        this.floatAt(p.x, p.y, n ? `Battle Cry ×${n}` : "Battle Cry", "#d8a0ff", 13);
        this.events.sound("howl");
        return true;
      }
      case "war_cry": {
        p.mana -= cost;
        const syn = this.hardLevel("howl") + this.hardLevel("taunt") + this.hardLevel("battle_cry") + this.hardLevel("battle_orders");
        const [lo, hi] = warCryDmg(lvl, syn);
        for (const m of [...this.monsters]) {
          if (m.state === "dead" || Math.hypot(m.x - p.x, m.y - p.y) > 4) continue;
          if (m.state === "idle") this.aggroPack(m);
          this.directHit(m, randInt(lo, hi), "#ffd070");
          if (m.hp > 0) m.stunT = Math.max(m.stunT, m.def.rank === "final" ? warCryStun(lvl) / 3 : m.def.rank === "boss" ? warCryStun(lvl) / 2 : warCryStun(lvl));
        }
        this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.5, radius: 4, color: "rgba(255,210,110," });
        for (let i = 0; i < 18; i++) this.spark(p.x, p.y, "#ffd070", 4);
        p.action = { type: "cry", t: 0, dur: 0.45 };
        this.events.shake(5);
        this.events.sound("shout");
        return true;
      }
      case "battle_command": {
        p.mana -= cost;
        p.buffs.bcmd = bcmdDur(lvl);
        this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.6, radius: 4, color: "rgba(255,240,170," });
        p.action = { type: "cry", t: 0, dur: 0.4 };
        this.floatAt(p.x, p.y, `+${bcmdBonus(lvl)} to all skills`, "#ffe9a0", 14);
        this.events.sound("shout");
        this.events.changed();
        return true;
      }
      case "find_item":
      case "grim_ward": {
        const best = this.nearCorpse();
        if (!best) {
          this.floatAt(p.x, p.y, "No corpse nearby", "#ccc", 13);
          return false;
        }
        p.mana -= cost;
        best.searched = true;
        p.action = { type: "cry", t: 0, dur: 0.35 };
        if (id === "grim_ward") {
          this.wards.push({ x: best.x, y: best.y, t: 0, life: grimDur(lvl), radius: grimRadius(lvl) });
          best.hidden = true; // the corpse becomes the totem
          this.rings.push({ x: best.x, y: best.y, t: 0, life: 0.6, radius: grimRadius(lvl), color: "rgba(160,255,160," });
          this.events.sound("howl");
        } else if (chance(findItemChance(lvl) / 100)) {
          const mf = this.derived().mf + (actDef(this.floor).n - 1) * 20;
          this.dropAt(best.x, best.y, { item: rollDrop(best.mlvl, mf, false, Math.random, this.player.cls) });
          this.events.sound("drop");
        } else this.floatAt(best.x, best.y, "Nothing", "#aaa", 13);
        return true;
      }
      case "find_potion": {
        const best = this.nearCorpse();
        if (!best) {
          this.floatAt(p.x, p.y, "No corpse nearby", "#ccc", 13);
          return false;
        }
        best.searched = true;
        p.action = { type: "cry", t: 0, dur: 0.35 };
        if (chance(findPotionChance(lvl) / 100)) {
          this.dropAt(best.x, best.y, { item: makeItem(chance(0.7) ? "hp_potion" : "mp_potion") });
          this.events.sound("drop");
        } else {
          this.floatAt(best.x, best.y, "Nothing", "#aaa", 13);
        }
        return true;
      }
    }
    return false;
  }

  private runAction(dt: number, d: Derived) {
    const p = this.player;
    const a = p.action!;
    a.t += dt;
    if (a.type === "swing") {
      while (a.hitsDone < a.hitAt.length && a.t >= a.hitAt[a.hitsDone] * a.dur) {
        const hand = a.hands[a.hitsDone] ?? 0;
        a.hitsDone++;
        this.resolveMelee(a.skill, a.target, d, hand);
      }
      if (a.t >= a.dur) p.action = null;
    } else if (a.type === "leap") {
      const k = Math.min(1, a.t / a.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      p.x = a.fx + (a.tx - a.fx) * e;
      p.y = a.fy + (a.ty - a.fy) * e;
      p.z = Math.sin(k * Math.PI) * 1.4;
      if (k >= 1) {
        p.z = 0;
        p.action = null;
        this.events.shake(6);
        this.events.sound("land");
        this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.4, radius: 1.8, color: "rgba(200,170,120," });
        for (let i = 0; i < 14; i++) this.spark(p.x, p.y, "#8a7a62", 2.5);
        const lvl = this.skillLevel(a.skill);
        if (a.skill === "leap_attack" && a.target && a.target.state !== "dead") {
          this.playerHit(a.target, d.hands[0], { dmgPct: leapAttackDmg(lvl), arPct: 100, knock: 5 });
        }
        for (const m of this.monsters) {
          if (m.state === "dead" || m === a.target) continue;
          const dx = m.x - p.x;
          const dy = m.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 1.8) {
            m.kx = (dx / (dist || 1)) * 7;
            m.ky = (dy / (dist || 1)) * 7;
            m.stunT = Math.max(m.stunT, 0.4);
            if (m.state === "idle") m.state = "chase";
          }
        }
      }
    } else if (a.type === "cry") {
      if (a.t >= a.dur) p.action = null;
    } else if (a.type === "whirl") {
      // steer with the joystick while spinning
      if (this.moveDir.active) {
        a.dx = this.moveDir.x;
        a.dy = this.moveDir.y;
      }
      const spd = d.speed * 1.1 * dt;
      this.moveEntity(p, a.dx * spd, a.dy * spd, p.r);
      a.spin += dt * 14;
      p.fx = Math.cos(a.spin);
      p.fy = Math.sin(a.spin);
      p.moving = true;
      a.tick -= dt;
      if (a.tick <= 0) {
        a.tick += WW_TICK;
        const lvl = this.skillLevel("whirlwind");
        const h = d.hands[a.hand % d.hands.length] ?? d.hands[0];
        a.hand++;
        let any = false;
        for (const m of [...this.monsters]) {
          if (m.state === "dead" || Math.hypot(m.x - p.x, m.y - p.y) > 1.25 + m.def.radius) continue;
          this.playerHit(m, h, { dmgPct: wwDmg(lvl), arPct: wwAR(lvl), knock: 1.2 });
          any = true;
        }
        if (!any) this.events.sound("swing");
      }
      if (a.t >= a.dur) {
        p.action = null;
        p.fx = a.dx;
        p.fy = a.dy;
      }
    } else if (a.type === "throw") {
      while (a.done < a.releaseAt.length && a.t >= a.releaseAt[a.done] * a.dur) {
        const h = a.hands[a.done] ?? 0;
        a.done++;
        this.release(a, h);
      }
      if (a.t >= a.dur) p.action = null;
    } else if (a.type === "shoot") {
      while (a.done < a.releaseAt.length && a.t >= a.releaseAt[a.done] * a.dur) {
        const i = a.done;
        a.done++;
        this.releaseArrow(a, i);
      }
      if (a.t >= a.dur) p.action = null;
    }
  }

  private resolveMelee(skill: string | null, preferred: Monster | null, d: Derived, hand = 0) {
    const p = this.player;
    const reach = 0.95 + this.reachBonus();
    let target: Monster | null = null;
    const inReach = (m: Monster) => {
      if (m.state === "dead") return false;
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > reach + m.def.radius + p.r) return false;
      // within ~75 degrees of facing
      return (dx * p.fx + dy * p.fy) / (dist || 1) > 0.25 || dist < m.def.radius + p.r + 0.1;
    };
    if (preferred && inReach(preferred)) target = preferred;
    else {
      let bd = Infinity;
      for (const m of this.monsters) {
        if (!inReach(m)) continue;
        const dist = Math.hypot(m.x - p.x, m.y - p.y);
        if (dist < bd) {
          bd = dist;
          target = m;
        }
      }
    }
    this.hitLog.push({ hand, skill, t: this.time });
    if (this.hitLog.length > 40) this.hitLog.shift();
    const lvl = skill ? this.skillLevel(skill) : 0;
    const h = d.hands[hand] ?? d.hands[0];
    if (skill === "fend") {
      // every monster in reach, all around
      let any = false;
      for (const m of [...this.monsters]) {
        if (m.state === "dead" || Math.hypot(m.x - p.x, m.y - p.y) > reach + m.def.radius + p.r) continue;
        this.playerHit(m, h, { dmgPct: fendDmg(lvl), arPct: fendAR(lvl), knock: 2 });
        any = true;
      }
      if (any) this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.3, radius: reach + 0.6, color: "rgba(230,230,240," });
      return;
    }
    if (!target) return;
    const avg = this.avgHit(h);
    if (skill === "jab") this.playerHit(target, h, { dmgPct: jabDmg(lvl), arPct: jabAR(lvl), knock: 0.8 });
    else if (skill === "power_strike") this.playerHit(target, h, { elem: { e: "light", pct: powerStrikeLight(lvl) }, knock: 2 });
    else if (skill === "impale") this.playerHit(target, h, { dmgPct: impaleDmg(lvl), arPct: impaleAR(lvl), knock: 4 });
    else if (skill === "charged_strike") {
      this.playerHit(target, h, { knock: 1.5 });
      this.chargedBolts(target.x, target.y, chargedStrikeBolts(lvl), h, "charged_strike");
      this.events.sound("bolt");
    } else if (skill === "lightning_strike") {
      if (this.playerHit(target, h, { knock: 1.5 })) {
        this.zap(p.x, p.y, target.x, target.y);
        this.elemHit(target, avg * (lightningStrikeDmg(lvl) / 100), "light");
        this.chain(target, lightningStrikeHits(lvl), avg * (lightningStrikeDmg(lvl) / 100), 3.5, false);
      }
    } else if (skill === "bash") this.playerHit(target, h, { dmgPct: bashDmg(lvl), arPct: bashAR(lvl), knock: 6 });
    else if (skill === "stun") this.playerHit(target, h, { arPct: stunAR(lvl), stun: stunDur(lvl), knock: 1.5 });
    else if (skill === "double_swing") this.playerHit(target, h, { arPct: doubleSwingAR(lvl), knock: 1.5 });
    else if (skill === "concentrate") this.playerHit(target, h, { dmgPct: concDmg(lvl), arPct: concAR(lvl), knock: 2 });
    else if (skill === "berserk") this.playerHit(target, h, { dmgPct: berserkDmg(lvl), arPct: berserkAR(lvl), knock: 3, magic: true });
    else if (skill === "frenzy") {
      if (this.playerHit(target, h, { dmgPct: frenzyDmg(lvl), arPct: frenzyAR(lvl), knock: 1 })) {
        const p = this.player;
        p.frenzy.stacks = Math.min(FRENZY_MAX_STACKS, p.frenzy.stacks + 1);
        p.frenzy.t = FRENZY_HOLD;
        p.frenzy.decay = 0;
      }
    } else this.playerHit(target, h, { knock: 1.8 });
  }

  private playerHit(
    m: Monster, d: Hand,
    o: { dmgPct?: number; mult?: number; arPct?: number; knock?: number; stun?: number; magic?: boolean; elem?: { e: Elem; pct: number }; sure?: boolean; chill?: number; freeze?: number; noLeech?: boolean },
  ): boolean {
    const p = this.player;
    const ar = d.ar * (1 + (o.arPct ?? 0) / 100);
    // Battle Cry and Inner Sight lower defense; Berserk and Magic Arrow (magic) ignore it
    const def = o.magic ? 0 : m.defense * (m.bcry.t > 0 ? 1 - m.bcry.def / 100 : 1) * (m.sight && m.sight.t > 0 ? 1 - m.sight.def / 100 : 1);
    const hitChance = Math.max(0.05, Math.min(0.95, 2 * (ar / (ar + def)) * (p.level / (p.level + m.mlvl))));
    if (m.state === "idle") this.aggroPack(m);
    if (!o.sure && !chance(hitChance)) {
      this.floatAt(m.x, m.y, "Miss", "#b8b8b8", 13);
      this.events.sound("miss");
      return false;
    }
    let dmg = randInt(d.min, d.max) * (1 + (d.dmgPct + (o.dmgPct ?? 0)) / 100);
    const crit = d.crit > 0 && chance(d.crit / 100);
    if (crit) dmg *= 2;
    // v1.0: elemental part (Fire/Cold/Ice Arrow, Power Strike): a share of the weapon's average hit, never doubled by crits
    const extra = o.elem ? Math.max(1, Math.round(((d.min + d.max) / 2) * (1 + d.dmgPct / 100) * (o.elem.pct / 100) * rand(0.85, 1.15))) : 0;
    // v1.2.1: a whole-hit multiplier (Multiple Shot's share of the volley), physical and elemental alike
    const k = o.mult ?? 1;
    dmg = Math.max(1, Math.round(dmg * k)) + (extra ? Math.max(1, Math.round(extra * k)) : 0);
    m.hp -= dmg;
    m.flash = 1;
    m.lastHurt = this.time;
    if (o.chill || o.freeze) this.chillOrFreeze(m, o.chill, o.freeze);
    // life / mana leech from gear
    const dv = this.derived();
    if (dv.ll > 0 && !o.noLeech) p.hp = Math.min(dv.maxHp, p.hp + (dmg * dv.ll) / 100);
    if (dv.ml > 0 && !o.noLeech) p.mana = Math.min(dv.maxMana, p.mana + (dmg * dv.ml) / 100);
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    const knock = (o.knock ?? 0) * (m.def.rank === "final" ? 0.12 : m.def.rank === "boss" ? 0.3 : 1);
    m.kx += (dx / l) * knock;
    m.ky += (dy / l) * knock;
    if (o.stun) m.stunT = Math.max(m.stunT, m.def.rank === "final" ? o.stun / 3 : m.def.rank === "boss" ? o.stun / 2 : o.stun);
    if (m.state === "attack" && (o.stun || knock > 3)) {
      m.state = "chase";
      m.atkT = Math.max(m.atkT, 0.4);
    }
    this.floatAt(m.x, m.y, crit ? `${dmg}!` : `${dmg}`, crit ? "#ffd84a" : o.elem ? ELEM_COLOR[o.elem.e] : o.magic ? "#c89aff" : "#fff", crit ? 20 : 15);
    for (let i = 0; i < (crit ? 12 : 7); i++) this.spark(m.x, m.y, m.def.blood, 3);
    this.events.sound(crit ? "crit" : "hit");
    if (crit || o.stun) this.events.shake(crit ? 4 : 2);
    if (m.hp <= 0) this.kill(m);
    return true;
  }

  private aggroPack(m: Monster) {
    for (const o of this.monsters) if (o.pack === m.pack && o.state === "idle") o.state = "chase";
  }

  private kill(m: Monster) {
    m.hp = 0;
    m.state = "dead";
    m.deadT = 0;
    m.kx *= 0.5;
    m.ky *= 0.5;
    const p = this.player;
    p.kills++;
    const small = m.def.radius < 0.27;
    this.events.sound(small ? "die_fallen" : "die_zombie");
    for (let i = 0; i < 16; i++) this.spark(m.x, m.y, m.def.blood, 4);
    m.fuse = -1;
    m.charging = 0;
    // v1.1: like Diablo II's Fallen, the rest of a Fallen pack scatters in fear for a moment when one of them dies
    if (m.def.species === "fallen") {
      for (const o of this.monsters) {
        if (o === m || o.state === "dead" || o.pack !== m.pack || o.def.species !== "fallen" || o.def.rank !== "normal") continue;
        if (Math.hypot(o.x - m.x, o.y - m.y) > FALLEN_SCATTER_R) continue;
        o.fearT = Math.max(o.fearT, FALLEN_SCATTER_S);
        o.flee = { x: m.x, y: m.y };
        if (o.state === "idle") o.state = "chase";
      }
    }
    this.gainXp(Math.max(1, Math.round(m.xp * xpPenalty(p.level, m.mlvl))));
    // loot: deeper acts add magic find, so blue/yellow drops get more common as you go
    const act = actDef(this.floor);
    const mf = this.derived().mf + (act.n - 1) * 20 + (levelInAct(this.floor) - 1);
    if (m.def.rank !== "normal") {
      const final = m.def.rank === "final";
      this.events.shake(final ? 14 : 10);
      for (let i = 0; i < (final ? 5 : 3); i++) this.dropAt(m.x, m.y, { item: rollDrop(m.mlvl, mf + (final ? 50 : 0), true, Math.random, this.player.cls) });
      this.dropAt(m.x, m.y, { gold: this.goldAmount(randInt(40, 90) * m.mlvl * (final ? 2 : 1)) });
      this.dropAt(m.x, m.y, { item: makeItem("hp_potion") });
      this.dropAt(m.x, m.y, { item: makeItem("mp_potion") });
      this.events.sound("boss");
      this.events.bossKilled?.();
      if (final) {
        const art = act.artifact;
        if (!this.player.artifacts.some((a) => a.id === art.id)) this.dropArtifact(m.x, m.y, art.id);
        else this.dropAt(m.x, m.y, { item: rollDrop(m.mlvl, mf + 100, true, Math.random, this.player.cls) });
      }
      // other monsters flee their dead boss's room
      for (const o of this.monsters) if (o.minion && o.state !== "dead") this.kill(o);
      if (this.floor < MAX_FLOOR) {
        this.stairs = { x: this.level.bossRoom.cx + 0.5, y: this.level.bossRoom.cy + 2.5 };
        if (!isFloor(this.level, Math.floor(this.stairs.x), Math.floor(this.stairs.y))) this.stairs = { x: m.x, y: m.y };
        const next = ACTS[act.n];
        this.events.toast(final ? `${m.def.name} is slain! The way to Act ${next.roman}, ${next.area}, is open.` : `${m.def.name} is slain! Stairs down have opened.`);
      } else {
        this.victory = true;
        this.events.toast(`${m.def.name} is slain! You have conquered the Burning Hells.`);
      }
    } else if (m.elite) {
      // champions and uniques: better loot (uniques always drop magic or better)
      const u = m.elite === 2;
      // v0.9.1: half as many items (uniques 2 -> 1, champions 1 -> a 50% chance); each item's quality roll is unchanged
      if (chance(u ? UNIQUE_ITEM_CHANCE : ELITE_ITEM_CHANCE)) this.dropAt(m.x, m.y, { item: rollDrop(m.mlvl, mf + (u ? 100 : 50), u, Math.random, this.player.cls) });
      this.dropAt(m.x, m.y, { gold: this.goldAmount(randInt(8, 20) * m.mlvl * (u ? 2 : 1)) });
      if (u) this.events.sound("boss");
    } else if (!m.minion || chance(0.3)) {
      const r = Math.random();
      // v0.9.1: items 8.5% (was 17%); gold 20% and potions 9% unchanged
      if (r < ITEM_DROP) this.dropAt(m.x, m.y, { item: rollDrop(m.mlvl, mf, false, Math.random, this.player.cls) });
      else if (r < ITEM_DROP + 0.2) this.dropAt(m.x, m.y, { gold: this.goldAmount(randInt(3, 12) * m.mlvl) });
      else if (r < ITEM_DROP + 0.29) this.dropAt(m.x, m.y, { item: makeItem(chance(0.7) ? "hp_potion" : "mp_potion") }); // v0.8: 9% (was 13%)
    }
    // Fire Enchanted monsters burst into flame when they die
    if (m.mods?.includes("fire"))
      this.novas.push({ x: m.x, y: m.y, t: 0, warn: 0.5, radius: 1.7, elem: "fire", dmgMin: m.dmgMin * 0.8, dmgMax: m.dmgMax, done: false });
  }

  /** Drop an act artifact where it can be reached. */
  dropArtifact(x: number, y: number, id: string) {
    this.ground.push({ id: this.nextId++, x, y, t: 0, artifact: id });
    this.rings.push({ x, y, t: 0, life: 1.4, radius: 3, color: "rgba(255,160,50," });
    this.events.sound("artifact");
  }

  /** Gold find from gear. */
  private goldAmount(n: number) {
    return Math.max(1, Math.round(n * (1 + this.derived().gf / 100)));
  }

  gainXp(n: number) {
    const p = this.player;
    p.xp += n;
    this.floatAt(p.x, p.y, `+${n} xp`, "#c9b37a", 12);
    let leveled = false;
    while (p.xp >= xpForLevel(p.level + 1) && p.level < 99) {
      p.level++;
      p.statPoints += 5;
      p.skillPoints += 1;
      leveled = true;
    }
    if (leveled) {
      const d = this.derived();
      p.hp = d.maxHp;
      p.mana = d.maxMana;
      this.rings.push({ x: p.x, y: p.y, t: 0, life: 1, radius: 2.5, color: "rgba(255,220,120," });
      this.events.levelUp(p.level);
      this.events.sound("levelup");
    }
    this.events.changed();
  }

  // ------------------------------------------------------------------ monsters
  private updateMonsters(dt: number, d: Derived) {
    const p = this.player;
    const ptx = Math.floor(p.x);
    const pty = Math.floor(p.y);
    const pi = idx(ptx, pty);
    if (pi !== this.flowFrom) {
      bfs(this.level, ptx, pty, this.flow);
      this.flowFrom = pi;
    }
    for (const m of this.monsters) {
      // v1.0: Cold Arrow slows a monster to half speed (all its timers too); freezes and Inner Sight wear off
      const mdt = m.chillT && m.chillT > 0 ? dt * 0.5 : dt;
      if (m.chillT) m.chillT = Math.max(0, m.chillT - dt);
      if (m.frozenT) m.frozenT = Math.max(0, m.frozenT - dt);
      if (m.sight && m.sight.t > 0) m.sight.t -= dt;
      m.flash = Math.max(0, m.flash - mdt * 5);
      if (m.state === "dead") {
        m.deadT += mdt;
        if (Math.abs(m.kx) + Math.abs(m.ky) > 0.05) {
          this.moveEntity(m, m.kx * mdt, m.ky * mdt, wallR(m) * 0.6);
          m.kx *= Math.exp(-8 * mdt);
          m.ky *= Math.exp(-8 * mdt);
        }
        continue;
      }
      // knockback
      if (Math.abs(m.kx) + Math.abs(m.ky) > 0.05) {
        this.moveEntity(m, m.kx * mdt, m.ky * mdt, wallR(m));
        m.kx *= Math.exp(-9 * mdt);
        m.ky *= Math.exp(-9 * mdt);
      }
      m.atkT = Math.max(0, m.atkT - mdt);
      if (m.stunT > 0) {
        m.stunT -= dt;
        if (m.state === "attack") m.state = "chase";
        continue;
      }
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      const dist = Math.hypot(dx, dy);
      if (p.dead) {
        if (m.state !== "idle") m.state = "idle";
      }
      if (m.taunt.t > 0) m.taunt.t -= mdt;
      if (m.bcry.t > 0) m.bcry.t -= mdt;
      // Grim Ward: monsters near a totem are frightened away from it (bosses ignore it)
      if (this.wards.length && m.def.rank === "normal") {
        for (const w of this.wards) {
          if (Math.hypot(m.x - w.x, m.y - w.y) < w.radius) {
            m.fearT = Math.max(m.fearT, 0.4);
            m.flee = { x: w.x, y: w.y };
          }
        }
      }
      if (m.fearT > 0) {
        m.fearT -= mdt;
        const fx = m.x - (m.flee ? m.flee.x : p.x);
        const fy = m.y - (m.flee ? m.flee.y : p.y);
        const fd = Math.hypot(fx, fy);
        if (fd > 0.01) {
          this.moveEntity(m, (fx / fd) * m.def.speed * 1.1 * mdt, (fy / fd) * m.def.speed * 1.1 * mdt, wallR(m));
          m.fx = fx / fd;
          m.fy = fy / fd;
          m.walkPhase += mdt * m.def.speed * 4;
        }
        if (m.state === "attack") m.state = "chase";
        if (m.fearT <= 0) m.flee = null;
        continue;
      }
      // v1.0: Decoy / Valkyrie draw this monster's attacks
      const lure = !p.dead ? this.lureFor(m) : null;
      if (lure) {
        if (m.state === "idle") this.aggroPack(m);
        m.state = "chase";
        const lx = lure.x - m.x;
        const ly = lure.y - m.y;
        const ld = Math.hypot(lx, ly) || 1;
        const lreach = (m.def.behavior === "ranged" ? Math.min(m.def.reach, 5) : m.def.reach + m.def.radius + 0.3);
        m.fx = lx / ld;
        m.fy = ly / ld;
        if (ld > lreach) {
          this.moveEntity(m, (lx / ld) * m.def.speed * mdt, (ly / ld) * m.def.speed * mdt, wallR(m));
          m.walkPhase += mdt * m.def.speed * 4;
        } else if (m.atkT <= 0) {
          m.atkT = m.def.atkInterval;
          lure.hp -= rand(m.dmgMin, m.dmgMax) * this.weaken(m);
          for (let k = 0; k < 3; k++) this.spark(lure.x, lure.y, lure.kind === "valkyrie" ? "#bcd8ff" : "#ffe8c0", 2);
        }
        continue;
      }
      if (m.state === "idle") {
        if (!p.dead && dist < m.def.aggro && !m.leashed && lineOfSight(this.level, m.x, m.y, p.x, p.y)) {
          this.aggroPack(m);
          if (m.def.rank !== "normal") this.events.sound("boss_aggro");
        } else if (m.leashed && m.homeFlow) {
          // v1.0.1: a leashed boss walks back to its room (around walls); v1.1: it heals only once it is home
          const step = this.flowStep(m, m.homeFlow);
          if (!step) {
            m.leashed = false;
            m.homeFlow = undefined;
            m.hp = m.maxHp;
          } else {
            this.moveEntity(m, step.x * m.def.speed * mdt, step.y * m.def.speed * mdt, wallR(m));
            m.fx = step.x;
            m.fy = step.y;
            m.walkPhase += mdt * m.def.speed * 4;
          }
          continue;
        } else {
          // wander near home
          m.wanderT -= mdt;
          if (m.wanderT <= 0) {
            m.wanderT = rand(2, 5);
            const nx = m.homeX + rand(-1.5, 1.5);
            const ny = m.homeY + rand(-1.5, 1.5);
            if (isFloor(this.level, Math.floor(nx), Math.floor(ny))) {
              m.wx = nx;
              m.wy = ny;
            }
          }
          const wdx = m.wx - m.x;
          const wdy = m.wy - m.y;
          const wd = Math.hypot(wdx, wdy);
          if (wd > 0.15) {
            const s = m.def.speed * 0.4;
            this.moveEntity(m, (wdx / wd) * s * mdt, (wdy / wd) * s * mdt, wallR(m));
            m.fx = wdx / wd;
            m.fy = wdy / wd;
            m.walkPhase += mdt * s * 4;
          }
          continue;
        }
      }
      if (m.def.rank !== "normal") {
        // v1.0.1: bosses chase you out of their room; they give up only when you are more than BOSS_LEASH steps
        // (walking distance) from their room, then walk home and heal back to full on the way
        // v1.1: ...and only after BOSS_GIVE_UP seconds without being hit and without seeing you
        const hd = this.flow[idx(Math.floor(m.homeX), Math.floor(m.homeY))];
        const unseen = hd > BOSS_LEASH && !lineOfSight(this.level, m.x, m.y, p.x, p.y);
        m.lostT = unseen ? (m.lostT ?? 0) + mdt : 0;
        if (m.lostT >= BOSS_GIVE_UP && this.time - m.lastHurt >= BOSS_GIVE_UP) {
          m.lostT = 0;
          m.state = "idle";
          m.wx = m.homeX;
          m.wy = m.homeY;
          if (!m.homeFlow) m.homeFlow = bfs(this.level, Math.floor(m.homeX), Math.floor(m.homeY));
          m.leashed = true;
          continue;
        }
        m.leashed = false;
      } else {
        // v1.1: monsters give up once you have been out of sight for CHASE_LOST_S seconds and are more than
        // CHASE_LOST_DIST tiles away (was: any time you were more than 20 tiles away)
        const far = dist > CHASE_LOST_DIST && this.time - m.lastHurt > 1 && !lineOfSight(this.level, m.x, m.y, p.x, p.y);
        m.lostT = far ? (m.lostT ?? 0) + mdt : 0;
        if (m.lostT >= CHASE_LOST_S) {
          m.lostT = 0;
          m.state = "idle";
          m.wx = m.homeX;
          m.wy = m.homeY;
          continue;
        }
      }
      const ranged = m.def.behavior === "ranged";
      const reach = ranged ? m.def.reach : m.def.reach + m.def.radius + p.r;
      m.cd = Math.max(0, m.cd - mdt);
      if (m.slamT && m.slamT > 0) {
        m.slamT -= mdt;
        continue;
      }
      // exploder: lit fuse, then burst
      if (m.fuse >= 0) {
        m.fuse -= mdt;
        m.flash = 0.6 + 0.4 * Math.sin(this.time * 40);
        if (m.fuse <= 0) this.explode(m);
        continue;
      }
      // charging (chargers and some final bosses)
      if (m.charging > 0) {
        m.charging -= mdt;
        const sp = m.def.speed * (m.def.rank === "final" ? 4 : 3.2);
        const ox = m.x;
        const oy = m.y;
        this.moveEntity(m, m.cdx * sp * mdt, m.cdy * sp * mdt, wallR(m));
        m.walkPhase += mdt * sp * 4;
        if (Math.random() < 0.6) this.spark(m.x, m.y, "#c8b080", 1.5);
        const hitR = m.def.reach + m.def.radius + p.r;
        if (dist <= hitR && !p.dead) {
          m.charging = 0;
          m.atkT = m.def.atkInterval;
          this.monsterHit(m, d, 1.3);
          const l = dist || 1;
          this.moveEntity(p, (dx / l) * 0.6, (dy / l) * 0.6, p.r);
        } else if (Math.hypot(m.x - ox, m.y - oy) < sp * mdt * 0.3) m.charging = 0;
        continue;
      }
      if (m.state !== "attack" && !p.dead) {
        const los = dist < 9 && lineOfSight(this.level, m.x, m.y, p.x, p.y);
        // final boss specials
        if (m.def.specials && m.cd <= 0 && los) {
          this.bossSpecial(m, dx, dy, dist);
          continue;
        }
        // v0.9.4: level bosses slam the ground when you're close (a red ring warns first)
        if (m.def.rank === "boss" && m.cd <= 0 && dist < 2.4 && los) {
          this.bossSlam(m);
          m.cd = slamEvery(this.floor);
          continue;
        }
        if (m.def.behavior === "charger" && m.cd <= 0 && dist > 2.5 && dist < 7 && los) {
          this.startCharge(m, dx, dy, dist);
          continue;
        }
        if (m.def.behavior === "exploder" && dist <= m.def.reach + m.def.radius + p.r) {
          m.fuse = m.def.windup;
          continue;
        }
      }
      if (m.state === "attack") {
        m.windT -= mdt;
        if (dist > 0.01) {
          m.fx = dx / dist;
          m.fy = dy / dist;
        }
        if (m.windT <= 0) {
          m.state = "chase";
          m.atkT = m.def.atkInterval;
          if (ranged) {
            if (!p.dead) this.fireShot(m, Math.atan2(dy, dx));
          } else if (dist <= reach + 0.35 && !p.dead) this.monsterHit(m, d);
        }
        continue;
      }
      // ranged: back off when you get close, shoot when in range and in sight
      if (ranged && dist < 3 && m.atkT > 0.3 && lineOfSight(this.level, m.x, m.y, p.x, p.y)) {
        const sp = m.def.speed * 0.85;
        this.moveEntity(m, (-dx / dist) * sp * mdt, (-dy / dist) * sp * mdt, wallR(m));
        m.fx = dx / dist;
        m.fy = dy / dist;
        m.walkPhase += mdt * sp * 4;
        continue;
      }
      if (ranged && dist <= reach && !lineOfSight(this.level, m.x, m.y, p.x, p.y)) {
        // no clear shot: walk closer
      } else if (dist <= reach) {
        if (m.atkT <= 0) {
          m.state = "attack";
          m.windT = m.def.windup;
        }
        if (dist > 0.01) {
          m.fx = dx / dist;
          m.fy = dy / dist;
        }
        continue;
      }
      let mx = 0;
      let my = 0;
      if (dist < 4 && lineOfSight(this.level, m.x, m.y, p.x, p.y)) {
        mx = dx / dist;
        my = dy / dist;
      } else {
        const tx = Math.floor(m.x);
        const ty = Math.floor(m.y);
        let best = this.flow[idx(tx, ty)];
        let bx = 0;
        let by = 0;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const nx = tx + ox;
            const ny = ty + oy;
            if (!isFloor(this.level, nx, ny)) continue;
            if (ox && oy && (!isFloor(this.level, tx + ox, ty) || !isFloor(this.level, tx, ty + oy))) continue;
            const v = this.flow[idx(nx, ny)];
            if (v < best) {
              best = v;
              bx = ox;
              by = oy;
            }
          }
        if (bx || by) {
          const gx = tx + bx + 0.5 - m.x;
          const gy = ty + by + 0.5 - m.y;
          const gl = Math.hypot(gx, gy) || 1;
          mx = gx / gl;
          my = gy / gl;
        } else {
          mx = dx / dist;
          my = dy / dist;
        }
      }
      // separation from other monsters
      for (const o of this.monsters) {
        if (o === m || o.state === "dead") continue;
        const sx = m.x - o.x;
        const sy = m.y - o.y;
        const sd = Math.hypot(sx, sy);
        const min = m.def.radius + o.def.radius + 0.05;
        if (sd < min && sd > 0.001) {
          mx += (sx / sd) * (min - sd) * 3;
          my += (sy / sd) * (min - sd) * 3;
        }
      }
      const ml = Math.hypot(mx, my) || 1;
      const sp = m.def.speed;
      this.moveEntity(m, (mx / ml) * sp * mdt, (my / ml) * sp * mdt, wallR(m));
      m.fx = mx / ml;
      m.fy = my / ml;
      m.walkPhase += mdt * sp * 4;
    }
  }

  private monsterHit(m: Monster, d: Derived, mult = 1) {
    const k = mult * this.weaken(m);
    const ar = m.ar * (m.taunt.t > 0 ? 1 - m.taunt.pct / 100 : 1);
    this.hurtPlayer({ ar, mlvl: m.mlvl, dmgMin: m.dmgMin * k, dmgMax: m.dmgMax * k, elem: m.def.elem, big: m.def.rank !== "normal" }, d, true);
  }

  /** Damage multiplier from Taunt and Battle Cry on a monster. */
  weaken(m: Monster): number {
    let k = 1;
    if (m.taunt.t > 0) k *= 1 - m.taunt.pct / 100;
    if (m.bcry.t > 0) k *= 1 - m.bcry.dmg / 100;
    return k;
  }

  /** Elemental damage left after resistance (resists cap at 75%). */
  static afterRes(dmg: number, elem: Elem, d: Pick<Derived, "res">): number {
    if (elem === "phys") return dmg;
    const r = Math.min(75, d.res[elem]);
    return dmg * (1 - r / 100);
  }

  /**
   * Damage the player. Physical damage rolls to hit against defense; elemental damage is cut by the
   * matching resist. Cold chills (slower movement), poison deals part of the damage over time.
   */
  hurtPlayer(src: { ar: number; mlvl: number; dmgMin: number; dmgMax: number; elem: Elem; big: boolean }, d: Derived, roll: boolean, how: "melee" | "missile" | "area" = "melee") {
    const p = this.player;
    if (p.dead || p.action?.type === "leap") return;
    // v1.0 Amazon: Dodge (melee, standing or attacking), Avoid (missiles), Evade (anything while moving)
    if (how !== "area") {
      const moving = p.moving;
      const word =
        how === "melee" && !moving && chance(dodgeChance(this.skillLevel("dodge")) / 100) ? "Dodge"
        : how === "missile" && chance(avoidChance(this.skillLevel("avoid")) / 100) ? "Avoid"
        : moving && chance(evadeChance(this.skillLevel("evade")) / 100) ? "Evade"
        : null;
      if (word) {
        this.floatAt(p.x, p.y, word, "#d8e8ff", 13);
        this.events.sound("whiff");
        return;
      }
    }
    if (roll) {
      // v0.9.4: bosses (big hits) aim with 3x attack rating and don't lose accuracy when you out-level them
      const hc = src.big
        ? Math.max(0.05, Math.min(0.95, (BOSS_AR * src.ar) / (BOSS_AR * src.ar + d.def)))
        : Math.max(0.05, Math.min(0.95, 2 * (src.ar / (src.ar + d.def)) * (src.mlvl / (src.mlvl + p.level))));
      if (!chance(hc)) {
        this.floatAt(p.x, p.y, "Miss", "#9a9a9a", 12);
        this.events.sound("whiff");
        return;
      }
    }
    let dmg = Math.max(1, Math.round(Game.afterRes(rand(src.dmgMin, src.dmgMax + 0.99), src.elem, d)));
    if (src.elem === "poison") {
      // a third now, the rest over 2.5 s
      const now = Math.max(1, Math.round(dmg / 3));
      p.poison = { t: 2.5, dps: Math.max(p.poison.t > 0 ? p.poison.dps : 0, (dmg - now) / 2.5) };
      dmg = now;
      this.events.sound("poison");
    } else if (src.elem === "cold") {
      p.chillT = 1.5;
      this.events.sound("chill");
    }
    p.hp -= dmg;
    p.flash = 1;
    this.floatAt(p.x, p.y, `-${dmg}`, ELEM_COLOR[src.elem], 15);
    for (let i = 0; i < 6; i++) this.spark(p.x, p.y, src.elem === "phys" ? "#9a1410" : ELEM_COLOR[src.elem], 2.5);
    this.events.sound("hurt");
    this.events.shake(src.big ? 6 : 3);
    if (p.hp <= 0) this.die();
  }

  /** Chill wears off; poison ticks. */
  private updateAilments(dt: number) {
    const p = this.player;
    p.chillT = Math.max(0, p.chillT - dt);
    if (p.poison.t > 0) {
      const step = Math.min(dt, p.poison.t);
      p.poison.t -= step;
      p.hp -= p.poison.dps * step;
      if (Math.random() < dt * 6) this.spark(p.x, p.y, ELEM_COLOR.poison, 1.2);
      if (p.hp <= 0) this.die();
    }
  }

  private fireShot(m: Monster, ang: number, spread = 0) {
    const s = m.def.shot ?? { speed: 8, range: 9, look: "bolt" as const, color: ELEM_COLOR[m.def.elem] };
    const a = ang + spread;
    const final = m.def.rank === "final";
    this.shots.push({
      x: m.x + Math.cos(a) * m.def.radius, y: m.y + Math.sin(a) * m.def.radius, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
      dist: 0, range: s.range, dmgMin: m.dmgMin * (final ? 0.9 : 1) * this.weaken(m), dmgMax: m.dmgMax * (final ? 0.9 : 1) * this.weaken(m), ar: m.ar, mlvl: m.mlvl,
      elem: m.def.elem, look: s.look, color: s.color, t: 0, big: final,
    });
    this.events.sound(s.look === "arrow" ? "shoot" : "bolt");
  }

  private updateShots(dt: number, d: Derived) {
    const p = this.player;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      // v1.0 Slow Missiles: a third of the speed near the hero
      const k = p.buffs.slowm && Math.hypot(s.x - p.x, s.y - p.y) < 10 ? 1 / 3 : 1;
      s.t += dt * k;
      s.x += s.vx * dt * k;
      s.y += s.vy * dt * k;
      s.dist += Math.hypot(s.vx, s.vy) * dt * k;
      let gone = s.dist > s.range || !isFloor(this.level, Math.floor(s.x), Math.floor(s.y));
      if (!gone && !p.dead && Math.hypot(s.x - p.x, s.y - p.y) < p.r + 0.22) {
        this.hurtPlayer(s, d, true, "missile");
        gone = true;
      }
      if (gone) {
        for (let k = 0; k < 4; k++) this.spark(s.x, s.y, s.color, 1.6);
        this.shots.splice(i, 1);
      }
    }
  }

  private updateNovas(dt: number, d: Derived) {
    const p = this.player;
    for (let i = this.novas.length - 1; i >= 0; i--) {
      const n = this.novas[i];
      n.t += dt;
      if (!n.done && n.t >= n.warn) {
        n.done = true;
        this.rings.push({ x: n.x, y: n.y, t: 0, life: 0.5, radius: n.radius, color: n.elem === "poison" ? "rgba(140,224,74," : "rgba(255,140,50," });
        for (let k = 0; k < 24; k++) this.spark(n.x + rand(-n.radius, n.radius) * 0.7, n.y + rand(-n.radius, n.radius) * 0.7, ELEM_COLOR[n.elem], 2.5);
        this.events.sound("nova");
        this.events.shake(5);
        if (!p.dead && Math.hypot(p.x - n.x, p.y - n.y) <= n.radius + p.r) this.hurtPlayer({ ar: 0, mlvl: 1, dmgMin: n.dmgMin, dmgMax: n.dmgMax, elem: n.elem, big: true }, d, false, "area");
      }
      if (n.t > n.warn + 0.5) this.novas.splice(i, 1);
    }
  }

  /** An exploder goes off: a short-warning burst around it, then it's gone (no loot when it blows itself up). */
  private explode(m: Monster) {
    this.novas.push({ x: m.x, y: m.y, t: 0.25, warn: 0.25, radius: 1.8, elem: m.def.elem, dmgMin: m.dmgMin, dmgMax: m.dmgMax, done: false });
    m.hp = 0;
    m.state = "dead";
    m.deadT = 0;
    m.fuse = -1;
    m.searched = true;
    this.events.sound("explode");
  }

  private startCharge(m: Monster, dx: number, dy: number, dist: number) {
    m.cdx = dx / dist;
    m.cdy = dy / dist;
    m.fx = m.cdx;
    m.fy = m.cdy;
    m.charging = Math.min(1.1, dist / (m.def.speed * (m.def.rank === "final" ? 4 : 3.2)) + 0.25);
    m.cd = m.def.rank === "final" ? 3 : 4;
    this.events.sound("charge");
  }

  /**
   * v0.9.4: a telegraphed ground slam. The boss stops and raises its weapon while a red ring grows on the floor
   * (about a second; a little shorter deeper into an act, 0.8 s for act bosses), then the ring bursts for a big hit
   * (~1.5x a normal hit). Step out of the ring to take nothing.
   */
  bossSlam(m: Monster) {
    const final = m.def.rank === "final";
    const warn = final ? 0.8 : Math.max(0.8, 1.1 - 0.3 * ((levelInAct(this.floor) - 1) / Math.max(1, LEVELS_PER_ACT - 2)));
    this.novas.push({ x: m.x, y: m.y, t: 0, warn, radius: final ? 2.4 : 2.0, elem: "phys", dmgMin: m.dmgMin * 1.4 * this.weaken(m), dmgMax: m.dmgMax * 1.6 * this.weaken(m), done: false });
    m.slamT = warn;
    m.atkT = Math.max(m.atkT, warn + 0.35);
    m.state = "chase";
    this.events.sound("nova_warn");
  }

  /** Final bosses take turns through their special attacks. */
  private bossSpecial(m: Monster, dx: number, dy: number, dist: number) {
    const sp = m.def.specials!;
    const kind = sp[m.spIdx++ % sp.length];
    m.cd = 3.0; // v0.9.4: was 3.6
    if (kind === "nova") {
      this.novas.push({ x: m.x, y: m.y, t: 0, warn: 1.0, radius: 3.2, elem: m.def.elem, dmgMin: m.dmgMin * 1.2, dmgMax: m.dmgMax * 1.3, done: false });
      this.events.sound("nova_warn");
    } else if (kind === "bolts") {
      const a = Math.atan2(dy, dx);
      for (let i = -2; i <= 2; i++) this.fireShot(m, a, i * 0.22);
    } else if (kind === "charge") {
      if (dist > 1.6) this.startCharge(m, dx, dy, dist);
      else m.cd = 0.5;
    } else if (kind === "slam") {
      if (dist < 2.6) this.bossSlam(m);
      else m.cd = 0.5;
    } else if (kind === "summon") {
      const alive = this.monsters.filter((o) => o.minion && o.state !== "dead").length;
      const kindOf: MonsterKind = actOf(this.floor) === 3 ? "flayer" : "imp";
      for (let i = 0; i < Math.min(3, 8 - alive); i++) {
        const a = (i / 3) * Math.PI * 2 + Math.random();
        const x = m.x + Math.cos(a) * 1.2;
        const y = m.y + Math.sin(a) * 1.2;
        if (this.blocked(x, y, 0.2)) continue;
        const o = this.spawn(kindOf, Math.max(1, m.mlvl - 3), x, y, m.pack);
        o.minion = true;
        o.state = "chase";
        for (let k = 0; k < 8; k++) this.spark(x, y, m.def.blood, 2);
      }
      this.events.sound("summon");
    }
  }

  private die() {
    const p = this.player;
    p.hp = 0;
    p.dead = true;
    p.action = null;
    p.moveTarget = null;
    this.events.sound("death");
    this.events.died();
  }

  /** After death you wake up in town, like Diablo II, minus 10% of the gold you carry (stash gold is safe). */
  respawn() {
    const p = this.player;
    const lost = Math.floor(p.gold * 0.1);
    p.gold -= lost;
    p.healLeft = 0;
    p.manaLeft = 0;
    this.goTown(true);
    this.events.toast(lost ? `You wake up in camp. You lost ${lost} gold.` : "You wake up in camp.");
    this.events.changed();
  }

  // ------------------------------------------------------------------ items
  dropAt(x: number, y: number, g: Omit<GroundItem, "id" | "x" | "y" | "t">) {
    let gx = x;
    let gy = y;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(0.3, 0.9);
      const nx = x + Math.cos(a) * r;
      const ny = y + Math.sin(a) * r;
      if (!this.blocked(nx, ny, 0.15)) {
        gx = nx;
        gy = ny;
        break;
      }
    }
    this.ground.push({ id: this.nextId++, x: gx, y: gy, t: 0, ...g });
    if (g.item) this.events.sound("drop");
  }

  /** Tap on a ground item: pick up if close, otherwise walk to it. */
  tapGround(g: GroundItem) {
    const p = this.player;
    if (p.dead) return;
    if (Math.hypot(g.x - p.x, g.y - p.y) < 1.6) this.pickUp(g);
    else p.moveTarget = g;
  }

  beltCap(): number {
    const b = this.player.equip.belt;
    return BASE_POTS + (b ? beltSlotsOf(b) : 0);
  }

  pickUp(g: GroundItem): boolean {
    const p = this.player;
    if (g.artifact) {
      const a = ARTIFACT_BY_ID[g.artifact];
      if (a && !p.artifacts.some((f) => f.id === a.id)) {
        p.artifacts.push({ id: a.id, at: Date.now(), level: p.level });
        this.floatAt(g.x, g.y, a.name, ARTIFACT_COLOR, 15);
        this.rings.push({ x: p.x, y: p.y, t: 0, life: 1.2, radius: 2.8, color: "rgba(255,170,60," });
        this.events.toast(`Artifact found: ${a.name} — see Artifacts`);
        this.events.sound("artifact");
      }
      this.ground.splice(this.ground.indexOf(g), 1);
      this.events.changed();
      return true;
    }
    if (g.gold) {
      p.gold += g.gold;
      this.floatAt(g.x, g.y, `+${g.gold} gold`, "#e8c547", 13);
      this.events.sound("gold");
    } else if (g.item) {
      const b = BASE_BY_ID[g.item.baseId];
      if (b.potion === "hp" && p.hpPots < this.beltCap()) p.hpPots++;
      else if (b.potion === "mp" && p.mpPots < this.beltCap()) p.mpPots++;
      else if (!addItem(p.bag, g.item)) {
        this.events.toast("Not enough room in your bag");
        this.events.sound("nomana");
        return false;
      }
      this.floatAt(g.x, g.y, itemName(g.item), QUALITY_COLOR[qualityOf(g.item)], 13);
      this.events.sound("pickup");
    }
    this.ground.splice(this.ground.indexOf(g), 1);
    this.events.changed();
    return true;
  }

  bagEntry(uid: number) {
    return this.player.bag.find((e) => e.item.uid === uid) ?? null;
  }

  /** Slots an item could go in. */
  slotsFor(it: Item): EquipSlot[] {
    const b = BASE_BY_ID[it.baseId];
    switch (b.slot) {
      case "weapon":
        return b.hands === 2 ? ["main"] : ["main", "off"];
      case "shield":
      case "quiver":
        return ["off"];
      case "armor":
        return ["chest"];
      case "helm":
        return ["head"];
      case "ring":
        return ["ring1", "ring2"];
      case "potion":
        return [];
      default:
        return [b.slot as EquipSlot];
    }
  }

  /** Why an item can't go in a slot, or null if it can. */
  equipError(it: Item, slot: EquipSlot): string | null {
    if (!this.slotsFor(it).includes(slot)) return "That doesn't go there";
    if (!this.meetsReq(it)) return "You don't meet the requirements";
    if (slot === "off" && offBlocked(this.player.equip.main, it)) return isBow(this.player.equip.main) ? "Your bow takes both hands (a quiver fits)" : "Your two-handed weapon needs both hands";
    return null;
  }

  defaultSlot(it: Item): EquipSlot | null {
    const e = this.player.equip;
    const b = BASE_BY_ID[it.baseId];
    const opts = this.slotsFor(it);
    if (!opts.length) return null;
    if (b.slot === "weapon" && b.hands === 1) {
      if (!e.main) return "main";
      if (!e.off && !isTwoHanded(e.main)) return "off";
      return "main";
    }
    if (b.slot === "ring") return !e.ring1 ? "ring1" : !e.ring2 ? "ring2" : "ring1";
    return opts[0];
  }

  /** Equip an item from the bag. Whatever it replaces goes back into the bag. */
  equipFromBag(uid: number, slot?: EquipSlot): string | null {
    const p = this.player;
    const entry = this.bagEntry(uid);
    if (!entry) return "Item not found";
    const it = entry.item;
    const target = slot ?? this.defaultSlot(it);
    if (!target) return "You can't equip that";
    const err = this.equipError(it, target);
    if (err) return err;
    const displaced: Item[] = [];
    if (p.equip[target]) displaced.push(p.equip[target]!);
    if (target === "main" && offBlocked(it, p.equip.off) && p.equip.off) displaced.push(p.equip.off);
    const bag = p.bag.filter((e) => e !== entry);
    const placed: BagEntry[] = [];
    for (const d of displaced) {
      const s = sizeOf(d);
      const spot = fits([...bag, ...placed], s.w, s.h, entry.x, entry.y) ? { x: entry.x, y: entry.y } : findSpot([...bag, ...placed], s.w, s.h);
      if (!spot) return "Not enough room in your bag";
      placed.push({ item: d, ...spot });
    }
    p.bag = [...bag, ...placed];
    p.equip[target] = it;
    if (target === "main" && offBlocked(it, p.equip.off)) delete p.equip.off;
    p.nextHand = 0;
    this.events.sound("equip");
    this.clampVitals();
    this.events.changed();
    return null;
  }

  /** Move an equipped item to another slot (e.g. main hand to off-hand), swapping if both fit. */
  swapEquip(a: EquipSlot, b: EquipSlot): string | null {
    const p = this.player;
    const ia = p.equip[a];
    const ib = p.equip[b];
    if (!ia || a === b) return null;
    if (!this.slotsFor(ia).includes(b)) return "That doesn't go there";
    if (ib && !this.slotsFor(ib).includes(a)) return "Those can't swap";
    if ((b === "off" && isTwoHanded(ia)) || (a === "off" && isTwoHanded(ib))) return "Two-handed weapons go in the main hand";
    if (ib) p.equip[a] = ib;
    else delete p.equip[a];
    p.equip[b] = ia;
    p.nextHand = 0;
    this.events.sound("equip");
    this.events.changed();
    return null;
  }

  /** Start the Return to Town channel (always available in the crypt). */
  startRecall(): boolean {
    const p = this.player;
    if (this.inTown || p.dead || this.recall) return false;
    p.action = null;
    p.moveTarget = null;
    this.recall = { t: 0, dur: RECALL_TIME };
    this.events.sound("shout");
    this.events.changed();
    return true;
  }

  private finishRecall() {
    const p = this.player;
    const snap: DungeonSnap = { level: this.level, monsters: this.monsters, ground: this.ground, stairs: this.stairs, boss: this.boss, px: p.x, py: p.y };
    const floor = this.floor;
    this.goTown(true);
    const wp = this.level.waypoint;
    // portal stands next to the waypoint
    let px = wp.x + 2.2;
    let py = wp.y + 0.6;
    if (this.blocked(px, py, 0.4)) {
      px = wp.x - 2;
      py = wp.y + 0.8;
    }
    this.portal = { x: px, y: py, floor, snap };
    this.events.sound("stairs");
    this.events.toast(`Back in Ember Camp. The blue portal returns you to Level ${floor}.`);
    this.events.changed();
  }

  nearPortal(): boolean {
    const q = this.portal;
    return !!q && this.inTown && !this.player.dead && Math.hypot(q.x - this.player.x, q.y - this.player.y) < 1.8;
  }

  /** Step through the camp portal: back to the same spot, with the level as you left it. */
  usePortal(): boolean {
    const q = this.portal;
    if (!q || !this.inTown) return false;
    const s = q.snap;
    this.portal = null;
    this.floorCache.delete(q.floor);
    this.inTown = false;
    this.floor = q.floor;
    this.level = s.level;
    this.monsters = s.monsters;
    this.ground = s.ground;
    this.stairs = s.stairs;
    this.boss = s.boss;
    this.floaters = [];
    this.particles = [];
    this.rings = [];
    this.flowFrom = -1;
    const p = this.player;
    p.x = s.px;
    p.y = s.py;
    p.action = null;
    p.moveTarget = null;
    // monsters that were chasing you lose interest while you were away
    for (const m of this.monsters) if (m.state !== "dead") { m.state = "idle"; }
    this.events.sound("stairs");
    this.events.toast(`Ember Crypt — Level ${this.floor}`);
    this.events.changed();
    return true;
  }

  /** Waypoint travel: 0 = camp, n = crypt level n (if reached before). */
  travel(floor: number) {
    if (floor <= 0) this.goTown();
    else if (floor <= this.maxFloor && floor <= MAX_FLOOR) this.goDungeon(floor);
  }

  /** Take off an item, optionally to a chosen bag cell. */
  unequip(slot: EquipSlot, x?: number, y?: number): string | null {
    const p = this.player;
    const it = p.equip[slot];
    if (!it) return null;
    const s = sizeOf(it);
    const spot = x !== undefined && y !== undefined && fits(p.bag, s.w, s.h, x, y) ? { x, y: y! } : x === undefined ? findSpot(p.bag, s.w, s.h) : null;
    if (!spot) return x === undefined ? "Not enough room in your bag" : "It doesn't fit there";
    p.bag.push({ item: it, ...spot });
    delete p.equip[slot];
    p.nextHand = 0;
    this.events.sound("equip");
    this.clampVitals();
    this.events.changed();
    return null;
  }

  // ------------------------------------------------------------------ camp stash
  stashEntry(uid: number) {
    return this.player.stash.find((e) => e.item.uid === uid);
  }

  nearStash(): boolean {
    const s = this.level.stash;
    return !!s && this.inTown && !this.player.dead && Math.hypot(s.x - this.player.x, s.y - this.player.y) < 1.9;
  }

  /** Bag → stash, at (x, y) or the first free spot. */
  toStash(uid: number, x?: number, y?: number): string | null {
    const p = this.player;
    if (!this.inTown) return "The stash is in Ember Camp";
    const e = this.bagEntry(uid);
    if (!e) return "Nothing to store";
    const { w, h } = sizeOf(e.item);
    let spot = x !== undefined && y !== undefined && fits(p.stash, w, h, x, y, -1, STASH_W, STASH_H) ? { x, y } : null;
    if (!spot && x === undefined) spot = findSpot(p.stash, w, h, STASH_W, STASH_H);
    if (!spot) return x === undefined ? "Your stash is full" : "It doesn't fit there";
    p.bag = p.bag.filter((q) => q !== e);
    p.stash.push({ item: e.item, ...spot });
    this.stashAt = Date.now();
    this.events.sound("equip");
    this.events.changed();
    return null;
  }

  /** Stash → bag, at (x, y) or the first free spot. */
  fromStash(uid: number, x?: number, y?: number): string | null {
    const p = this.player;
    if (!this.inTown) return "The stash is in Ember Camp";
    const e = this.stashEntry(uid);
    if (!e) return "Nothing to take";
    const { w, h } = sizeOf(e.item);
    let spot = x !== undefined && y !== undefined && fits(p.bag, w, h, x, y) ? { x, y } : null;
    if (!spot && x === undefined) spot = findSpot(p.bag, w, h);
    if (!spot) return x === undefined ? "Your backpack is full" : "It doesn't fit there";
    p.stash = p.stash.filter((q) => q !== e);
    p.bag.push({ item: e.item, ...spot });
    this.stashAt = Date.now();
    this.events.sound("equip");
    this.events.changed();
    return null;
  }

  moveInStash(uid: number, x: number, y: number): boolean {
    if (!this.inTown) return false;
    const ok = moveItem(this.player.stash, uid, x, y, STASH_W, STASH_H);
    if (ok) {
      this.stashAt = Date.now();
      this.events.sound("equip");
      this.events.changed();
    }
    return ok;
  }

  /** Move an item within the bag (swaps with a single overlapping item). */
  moveInBag(uid: number, x: number, y: number): boolean {
    const ok = moveItem(this.player.bag, uid, x, y);
    if (ok) {
      this.events.sound("equip");
      this.events.changed();
    }
    return ok;
  }

  dropFromBag(uid: number) {
    const p = this.player;
    const e = this.bagEntry(uid);
    if (!e) return;
    p.bag = p.bag.filter((q) => q !== e);
    this.dropAt(p.x, p.y, { item: e.item });
    this.events.changed();
  }

  /** v1.1: top the belt up with potions of this kind from the backpack (after drinking from the belt). */
  refillBelt(kind: "hp" | "mp") {
    const p = this.player;
    const cap = this.beltCap();
    while ((kind === "hp" ? p.hpPots : p.mpPots) < cap) {
      const e = p.bag.find((q) => BASE_BY_ID[q.item.baseId].potion === kind);
      if (!e) break;
      p.bag = p.bag.filter((q) => q !== e);
      if (kind === "hp") p.hpPots++;
      else p.mpPots++;
    }
  }

  /** v1.1: "To belt": move a potion from the backpack or stash onto the belt. */
  toBelt(uid: number): string | null {
    const p = this.player;
    const inBag = this.bagEntry(uid);
    const e = inBag ?? this.stashEntry(uid);
    if (!e) return "Not found";
    const pk = BASE_BY_ID[e.item.baseId].potion;
    if (!pk) return "Only potions go on the belt";
    if ((pk === "hp" ? p.hpPots : p.mpPots) >= this.beltCap()) return "Your belt is full";
    if (!inBag && !this.inTown) return "The stash is in Ember Camp";
    if (inBag) p.bag = p.bag.filter((q) => q !== e);
    else {
      p.stash = p.stash.filter((q) => q !== e);
      this.stashAt = Date.now();
    }
    if (pk === "hp") p.hpPots++;
    else p.mpPots++;
    this.events.changed();
    return null;
  }

  drinkFromBag(uid: number) {
    const p = this.player;
    const e = this.bagEntry(uid);
    if (!e) return;
    const pk = BASE_BY_ID[e.item.baseId].potion;
    if (!pk || this.potionWait(pk) > 0) return;
    p.bag = p.bag.filter((q) => q !== e);
    this.drink(pk);
  }

  /** Sell a bag item to the vendor. */
  sell(uid: number): number {
    const p = this.player;
    const e = this.bagEntry(uid);
    if (!e || !this.inTown) return 0;
    const price = sellPrice(e.item);
    p.bag = p.bag.filter((q) => q !== e);
    p.gold += price;
    if (!BASE_BY_ID[e.item.baseId].potion) {
      // v1.1: sold items go to their own buy-back row (the last 8, newest first) and never push out Hilde's wares
      this.buyback.unshift(e.item);
      this.buyback.length = Math.min(this.buyback.length, BUYBACK_MAX);
    }
    this.events.sound("gold");
    this.events.changed();
    return price;
  }

  /** v1.1: buy back something you sold, for what Hilde paid you. */
  buyBack(uid: number): string | null {
    const p = this.player;
    const it = this.buyback.find((q) => q.uid === uid);
    if (!it) return "Not for sale";
    const price = sellPrice(it);
    if (p.gold < price) return "Not enough gold";
    if (!addItem(p.bag, it)) return "Not enough room in your bag";
    this.buyback = this.buyback.filter((q) => q !== it);
    p.gold -= price;
    this.events.sound("gold");
    this.events.changed();
    return null;
  }

  /** Buy from the vendor. Potions are unlimited and go to the belt first. */
  buy(uid: number): string | null {
    const p = this.player;
    const e = this.vendorStock.find((q) => q.item.uid === uid);
    if (!e) return "Not for sale";
    const b = BASE_BY_ID[e.item.baseId];
    if (p.gold < itemPrice(e.item)) return "Not enough gold";
    if (b.potion) {
      if (b.potion === "hp" && p.hpPots < this.beltCap()) p.hpPots++;
      else if (b.potion === "mp" && p.mpPots < this.beltCap()) p.mpPots++;
      else if (!addItem(p.bag, makeItem(b.id))) return "Not enough room in your bag";
    } else {
      if (!addItem(p.bag, e.item)) return "Not enough room in your bag";
      this.vendorStock = this.vendorStock.filter((q) => q !== e);
    }
    p.gold -= itemPrice(e.item);
    this.events.sound("gold");
    this.events.changed();
    return null;
  }

  /** v1.1: put gold into (n > 0) or take it out of (n < 0) this hero's camp stash. Returns the amount moved. */
  moveStashGold(n: number): number {
    const p = this.player;
    if (!this.inTown) return 0;
    const amt = n > 0 ? Math.min(Math.floor(n), p.gold) : -Math.min(Math.floor(-n), p.stashGold);
    if (!amt) return 0;
    p.gold -= amt;
    p.stashGold += amt;
    this.events.sound("gold");
    this.events.changed();
    return amt;
  }

  /** Belt button: drink from the belt, or from the bag when the belt is empty. */
  usePotion(kind: "hp" | "mp") {
    const p = this.player;
    if (p.dead) return;
    if (this.potionWait(kind) > 0) return;
    if (kind === "hp" ? p.hpPots > 0 : p.mpPots > 0) {
      if (kind === "hp") p.hpPots--;
      else p.mpPots--;
      this.drink(kind);
      this.refillBelt(kind);
      return;
    }
    const e = p.bag.find((q) => BASE_BY_ID[q.item.baseId].potion === kind);
    if (e) return this.drinkFromBag(e.item.uid);
    this.events.toast(kind === "hp" ? "No healing potions" : "No mana potions");
  }

  /** Seconds until another potion of this kind can be drunk (v0.8: 1.5 s cooldown). */
  potionWait(kind: "hp" | "mp"): number {
    return Math.max(0, this.potCd[kind] - this.time);
  }

  private drink(kind: "hp" | "mp") {
    const p = this.player;
    const d = this.derived();
    this.potCd[kind] = this.time + POTION_CD;
    if (kind === "hp") p.healLeft += d.maxHp * 0.45;
    else p.manaLeft += d.maxMana * 0.6;
    this.events.sound("potion");
    this.events.changed();
  }

  addStat(k: keyof Stats) {
    const p = this.player;
    if (p.statPoints <= 0) return;
    p.statPoints--;
    const before = this.derived();
    p.base[k]++;
    const after = this.derived();
    p.hp += Math.max(0, after.maxHp - before.maxHp);
    p.mana += Math.max(0, after.maxMana - before.maxMana);
    this.events.changed();
  }

  private clampVitals() {
    const d = this.derived();
    const p = this.player;
    p.hp = Math.min(p.hp, d.maxHp);
    p.mana = Math.min(p.mana, d.maxMana);
  }

  descend() {
    if (this.floor >= MAX_FLOOR) return;
    this.goDungeon(this.floor + 1);
  }

  nearStairs(): boolean {
    if (!this.stairs || this.player.dead) return false;
    return Math.hypot(this.stairs.x - this.player.x, this.stairs.y - this.player.y) < 1.6;
  }

  /** v1.1: only camp and waypoint levels (level 1 and every 5th of an act) show a waypoint stone */
  waypointHere(): boolean {
    return this.inTown || hasWaypoint(this.floor);
  }

  nearWaypoint(): boolean {
    const w = this.level.waypoint;
    return !this.player.dead && this.waypointHere() && Math.hypot(w.x - this.player.x, w.y - this.player.y) < 1.7;
  }

  nearVendor(): boolean {
    const v = this.level.vendor;
    return !!v && this.inTown && Math.hypot(v.x - this.player.x, v.y - this.player.y) < 2.3;
  }

  /** The one context action shown above the controls. */
  contextAction(): "descend" | "waypoint" | "trade" | "stash" | "portal" | null {
    if (this.nearStairs()) return "descend";
    if (this.nearVendor()) return "trade";
    if (this.nearStash()) return "stash";
    if (this.nearPortal()) return "portal";
    if (this.nearWaypoint()) return "waypoint";
    return null;
  }

  /** v1.0.1: unit step toward the next lower cell of a distance field (null when already at its bottom). */
  private flowStep(m: { x: number; y: number }, field: Uint16Array): { x: number; y: number } | null {
    const tx = Math.floor(m.x);
    const ty = Math.floor(m.y);
    let best = field[idx(tx, ty)];
    if (best <= 1) return null;
    let bx = 0;
    let by = 0;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = tx + ox;
        const ny = ty + oy;
        if (!isFloor(this.level, nx, ny)) continue;
        if (ox && oy && (!isFloor(this.level, tx + ox, ty) || !isFloor(this.level, tx, ty + oy))) continue;
        const v = field[idx(nx, ny)];
        if (v < best) {
          best = v;
          bx = ox;
          by = oy;
        }
      }
    if (!bx && !by) return null;
    const gx = tx + bx + 0.5 - m.x;
    const gy = ty + by + 0.5 - m.y;
    const gl = Math.hypot(gx, gy) || 1;
    return { x: gx / gl, y: gy / gl };
  }

  // ------------------------------------------------------------------ physics helpers
  blocked(x: number, y: number, r: number): boolean {
    const L = this.level;
    return (
      !isFloor(L, Math.floor(x - r), Math.floor(y - r)) ||
      !isFloor(L, Math.floor(x + r), Math.floor(y - r)) ||
      !isFloor(L, Math.floor(x - r), Math.floor(y + r)) ||
      !isFloor(L, Math.floor(x + r), Math.floor(y + r))
    );
  }

  moveEntity(e: { x: number; y: number }, dx: number, dy: number, r: number) {
    const step = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
    for (let i = 0; i < step; i++) {
      const sx = dx / step;
      const sy = dy / step;
      if (!this.blocked(e.x + sx, e.y, r)) e.x += sx;
      if (!this.blocked(e.x, e.y + sy, r)) e.y += sy;
    }
  }

  private exploreAround(force: boolean) {
    const p = this.player;
    const R = 7;
    const L = this.level;
    for (let y = Math.floor(p.y - R); y <= p.y + R; y++)
      for (let x = Math.floor(p.x - R); x <= p.x + R; x++) {
        if (x < 0 || y < 0 || x >= L.w || y >= L.h) continue;
        if ((x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2 > R * R) continue;
        L.explored[idx(x, y)] = 1;
      }
    if (force) return;
  }

  // ------------------------------------------------------------------ fx
  floatAt(x: number, y: number, text: string, color: string, size: number) {
    this.floaters.push({ x: x + rand(-0.15, 0.15), y, text, color, t: 0, life: 1.0, size });
  }

  private spark(x: number, y: number, color: string, speed: number) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(0.3, 1) * speed;
    this.particles.push({ x, y, z: 0.6, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(1, 4), t: 0, life: rand(0.4, 0.8), color, size: rand(2, 4) });
  }

  private updateFx(dt: number) {
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.life);
    for (const q of this.particles) {
      q.t += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vz -= 14 * dt;
      q.z = Math.max(0, q.z + q.vz * dt);
      if (q.z === 0) {
        q.vx *= 0.8;
        q.vy *= 0.8;
      }
    }
    this.particles = this.particles.filter((q) => q.t < q.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    for (const g of this.ground) g.t += dt;
  }
}
