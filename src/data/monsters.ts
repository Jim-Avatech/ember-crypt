/**
 * Monsters for all four acts. Each act has 3-4 regular types with distinct behaviors, a level boss
 * (renamed and stronger on each level of the act), and a final act boss with special attacks.
 */
export type Elem = "phys" | "fire" | "cold" | "light" | "poison";
export type Behavior = "melee" | "ranged" | "charger" | "exploder";
export type Special = "nova" | "bolts" | "charge" | "summon";

export type MonsterKind =
  | "zombie" | "fallen" | "skeleton" | "boss" | "lich"
  | "mummy" | "raider" | "priest" | "boss2" | "sekhet"
  | "lurker" | "flayer" | "spitter" | "bloater" | "boss3" | "mire"
  | "imp" | "knight" | "conjurer" | "soul" | "boss4" | "malakar";

/** Sprite species (see sprites/puppet.ts). */
export type Species =
  | "zombie" | "fallen" | "skeleton" | "boss" | "lich"
  | "mummy" | "raider" | "priest" | "boss2" | "sekhet"
  | "lurker" | "flayer" | "spitter" | "bloater" | "boss3" | "mire"
  | "imp" | "knight" | "conjurer" | "soul" | "boss4" | "malakar";

export interface Shot {
  speed: number;
  range: number;
  /** look of the projectile */
  look: "arrow" | "bolt" | "spit";
  color: string;
}

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  /** normal monster, a level boss, or an act's final boss */
  rank: "normal" | "boss" | "final";
  behavior: Behavior;
  elem: Elem;
  species: Species;
  /** one line for the Item Guide */
  blurb: string;
  hp: number;
  dmgMin: number;
  dmgMax: number;
  /** tiles per second (v0.3: ×1.27 to match the v0.1 on-screen speed after the pixel-art rescale) */
  speed: number;
  /** seconds between attacks */
  atkInterval: number;
  windup: number;
  reach: number;
  radius: number;
  xp: number;
  ar: number;
  def: number;
  aggro: number;
  pack: [number, number];
  shot?: Shot;
  /** final bosses: special attacks used in turn */
  specials?: Special[];
  /** blood / spark color */
  blood: string;
  /** pixel height above the feet for the health bar */
  barY: number;
}

type Base = Omit<MonsterDef, "kind" | "rank" | "pack" | "blood" | "barY" | "blurb" | "elem" | "behavior"> &
  Partial<Pick<MonsterDef, "rank" | "pack" | "blood" | "barY" | "blurb" | "elem" | "behavior">>;
const M = (kind: MonsterKind, d: Base): MonsterDef => ({
  kind, rank: "normal", behavior: "melee", elem: "phys", pack: [2, 4], blood: "#6e8a2a", barY: 46, blurb: "", ...d,
});

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  // ---------------------------------------------------------------- Act I: Ember Crypt
  zombie: M("zombie", { name: "Zombie", species: "zombie", hp: 15, dmgMin: 2, dmgMax: 5, speed: 1.2, atkInterval: 1.5, windup: 0.45, reach: 0.75, radius: 0.32, xp: 14, ar: 22, def: 3, aggro: 7, blurb: "Slow, sturdy melee." }),
  fallen: M("fallen", { name: "Fallen", species: "fallen", hp: 7, dmgMin: 1, dmgMax: 3, speed: 3.05, atkInterval: 0.95, windup: 0.25, reach: 0.6, radius: 0.24, xp: 8, ar: 28, def: 2, aggro: 8, pack: [3, 5], blood: "#a01a14", barY: 30, blurb: "Fast, weak, comes in packs." }),
  skeleton: M("skeleton", { name: "Skeleton Archer", species: "skeleton", behavior: "ranged", hp: 10, dmgMin: 2, dmgMax: 4, speed: 1.6, atkInterval: 2.0, windup: 0.55, reach: 6.5, radius: 0.28, xp: 13, ar: 26, def: 2, aggro: 9, pack: [2, 3], blood: "#d6ccb0", blurb: "Keeps its distance and shoots arrows.", shot: { speed: 8, range: 9, look: "arrow", color: "#d8c8a0" } }),
  boss: M("boss", { name: "Gravelord", rank: "boss", species: "boss", hp: 110, dmgMin: 4, dmgMax: 9, speed: 1.45, atkInterval: 1.3, windup: 0.5, reach: 0.95, radius: 0.5, xp: 160, ar: 40, def: 8, aggro: 7, pack: [1, 1], blood: "#6a3a8a", barY: 70, blurb: "Guards the stairs on each level of the crypt." }),
  lich: M("lich", { name: "The Ember Lich", rank: "final", species: "lich", elem: "fire", behavior: "ranged", hp: 240, dmgMin: 6, dmgMax: 12, speed: 1.3, atkInterval: 1.6, windup: 0.6, reach: 6, radius: 0.5, xp: 600, ar: 55, def: 12, aggro: 9, pack: [1, 1], blood: "#ff7a2a", barY: 78, blurb: "Act I final boss. Hurls fire bolts and erupts in a ring of flame.", shot: { speed: 7.5, range: 10, look: "bolt", color: "#ff8a2a" }, specials: ["bolts", "nova"] }),

  // ---------------------------------------------------------------- Act II: Sunken Tombs
  mummy: M("mummy", { name: "Tomb Mummy", species: "mummy", elem: "poison", hp: 22, dmgMin: 2, dmgMax: 5, speed: 1.15, atkInterval: 1.6, windup: 0.5, reach: 0.8, radius: 0.33, xp: 16, ar: 24, def: 5, aggro: 7, pack: [2, 3], blood: "#8a7a50", blurb: "Tough and slow; its touch poisons." }),
  raider: M("raider", { name: "Sand Raider", species: "raider", behavior: "charger", hp: 12, dmgMin: 2, dmgMax: 5, speed: 2.4, atkInterval: 1.1, windup: 0.3, reach: 0.8, radius: 0.27, xp: 12, ar: 30, def: 3, aggro: 9, pack: [3, 5], blood: "#a03a1a", blurb: "Fast packs that charge across the room at you." }),
  priest: M("priest", { name: "Serpent Priest", species: "priest", behavior: "ranged", elem: "light", hp: 11, dmgMin: 2, dmgMax: 6, speed: 1.5, atkInterval: 2.2, windup: 0.6, reach: 6.5, radius: 0.28, xp: 15, ar: 28, def: 2, aggro: 9, pack: [1, 2], blood: "#4a8a5a", blurb: "Caster: crackling lightning bolts. Lightning resist helps.", shot: { speed: 9, range: 10, look: "bolt", color: "#f0f080" } }),
  boss2: M("boss2", { name: "Tomb Warden", rank: "boss", species: "boss2", hp: 120, dmgMin: 4, dmgMax: 9, speed: 1.5, atkInterval: 1.25, windup: 0.5, reach: 0.95, radius: 0.5, xp: 170, ar: 42, def: 9, aggro: 7, pack: [1, 1], blood: "#8a6a2a", barY: 70, blurb: "Guards the stairs on each level of the tombs." }),
  sekhet: M("sekhet", { name: "Queen Sekhet", rank: "final", species: "sekhet", elem: "light", hp: 300, dmgMin: 7, dmgMax: 13, speed: 1.6, atkInterval: 1.3, windup: 0.5, reach: 1.0, radius: 0.5, xp: 700, ar: 60, def: 14, aggro: 9, pack: [1, 1], blood: "#e0b040", barY: 78, blurb: "Act II final boss. Charges across the hall and fans out lightning.", shot: { speed: 9, range: 10, look: "bolt", color: "#f8f070" }, specials: ["charge", "bolts"] }),

  // ---------------------------------------------------------------- Act III: Drowned Jungle
  lurker: M("lurker", { name: "Bog Lurker", species: "lurker", elem: "cold", hp: 26, dmgMin: 3, dmgMax: 6, speed: 1.3, atkInterval: 1.5, windup: 0.5, reach: 0.85, radius: 0.36, xp: 17, ar: 26, def: 5, aggro: 7, pack: [2, 3], blood: "#3a6a7a", blurb: "Hulking melee; its icy grip chills (slows) you." }),
  flayer: M("flayer", { name: "Flayer", species: "flayer", hp: 9, dmgMin: 2, dmgMax: 4, speed: 3.1, atkInterval: 0.9, windup: 0.22, reach: 0.6, radius: 0.24, xp: 9, ar: 32, def: 2, aggro: 9, pack: [4, 6], blood: "#3a8a2a", barY: 30, blurb: "Tiny, very fast jungle packs." }),
  spitter: M("spitter", { name: "Thorn Spitter", species: "spitter", behavior: "ranged", elem: "poison", hp: 12, dmgMin: 2, dmgMax: 5, speed: 1.3, atkInterval: 1.9, windup: 0.5, reach: 6, radius: 0.3, xp: 14, ar: 28, def: 3, aggro: 9, pack: [1, 3], blood: "#7aa02a", blurb: "Spits poison from range. Poison resist helps.", shot: { speed: 7, range: 9, look: "spit", color: "#9ad040" } }),
  bloater: M("bloater", { name: "Swamp Bloater", species: "bloater", behavior: "exploder", elem: "poison", hp: 14, dmgMin: 7, dmgMax: 12, speed: 2.2, atkInterval: 1, windup: 0.55, reach: 0.9, radius: 0.32, xp: 14, ar: 999, def: 2, aggro: 8, pack: [1, 2], blood: "#6a9a2a", blurb: "Waddles up and bursts in a poison cloud. Kill it first or step away." }),
  boss3: M("boss3", { name: "Mire Brute", rank: "boss", species: "boss3", elem: "cold", hp: 130, dmgMin: 5, dmgMax: 10, speed: 1.5, atkInterval: 1.25, windup: 0.5, reach: 0.95, radius: 0.5, xp: 180, ar: 44, def: 10, aggro: 7, pack: [1, 1], blood: "#2a6a5a", barY: 70, blurb: "Guards the stairs on each level of the jungle." }),
  mire: M("mire", { name: "Mother Mire", rank: "final", species: "mire", elem: "poison", hp: 330, dmgMin: 7, dmgMax: 14, speed: 1.2, atkInterval: 1.5, windup: 0.55, reach: 1.1, radius: 0.6, xp: 800, ar: 62, def: 15, aggro: 9, pack: [1, 1], blood: "#5a8a2a", barY: 76, blurb: "Act III final boss. Bursts in poison novas and calls her brood.", specials: ["nova", "summon"] }),

  // ---------------------------------------------------------------- Act IV: Burning Hells
  imp: M("imp", { name: "Hell Imp", species: "imp", elem: "fire", hp: 11, dmgMin: 2, dmgMax: 5, speed: 3.0, atkInterval: 0.9, windup: 0.22, reach: 0.6, radius: 0.25, xp: 10, ar: 34, def: 3, aggro: 9, pack: [4, 6], blood: "#c03a10", barY: 32, blurb: "Fast fiery packs." }),
  knight: M("knight", { name: "Doom Knight", species: "knight", behavior: "charger", hp: 30, dmgMin: 4, dmgMax: 8, speed: 1.5, atkInterval: 1.4, windup: 0.45, reach: 0.9, radius: 0.36, xp: 20, ar: 34, def: 8, aggro: 8, pack: [1, 3], blood: "#5a1a1a", blurb: "Armored; charges and hits hard." }),
  conjurer: M("conjurer", { name: "Pit Conjurer", species: "conjurer", behavior: "ranged", elem: "fire", hp: 13, dmgMin: 3, dmgMax: 7, speed: 1.4, atkInterval: 2.0, windup: 0.55, reach: 6.5, radius: 0.28, xp: 16, ar: 30, def: 3, aggro: 9, pack: [1, 2], blood: "#8a2a6a", blurb: "Caster: hurls fire bolts. Fire resist helps.", shot: { speed: 8, range: 10, look: "bolt", color: "#ff6a1a" } }),
  soul: M("soul", { name: "Burning Soul", species: "soul", behavior: "exploder", elem: "fire", hp: 12, dmgMin: 8, dmgMax: 14, speed: 2.6, atkInterval: 1, windup: 0.5, reach: 0.9, radius: 0.28, xp: 14, ar: 999, def: 2, aggro: 9, pack: [1, 2], blood: "#ff8a2a", barY: 36, blurb: "Rushes in and explodes in fire." }),
  boss4: M("boss4", { name: "Pit Lord", rank: "boss", species: "boss4", elem: "fire", hp: 140, dmgMin: 5, dmgMax: 11, speed: 1.55, atkInterval: 1.2, windup: 0.5, reach: 1.0, radius: 0.5, xp: 190, ar: 46, def: 11, aggro: 7, pack: [1, 1], blood: "#8a1a0a", barY: 70, blurb: "Guards the stairs on each level of the hells." }),
  malakar: M("malakar", { name: "Malakar, Lord of Embers", rank: "final", species: "malakar", elem: "fire", hp: 380, dmgMin: 7, dmgMax: 13, speed: 1.5, atkInterval: 1.3, windup: 0.5, reach: 1.2, radius: 0.65, xp: 1000, ar: 70, def: 18, aggro: 10, pack: [1, 1], blood: "#ff5a1a", barY: 88, blurb: "Act IV final boss. Fire nova, a burning charge, and summoned imps.", shot: { speed: 8, range: 10, look: "bolt", color: "#ff5a1a" }, specials: ["nova", "charge", "summon"] }),
};

/** Scale a stat by monster level. */
// v0.8 difficulty: steeper life/damage/AR/defense growth per monster level (was 0.38 / 0.28 / 9 / 4)
export const scaleHp = (base: number, mlvl: number) => Math.round(base * (1 + 0.48 * (mlvl - 1)));
export const scaleDmg = (base: number, mlvl: number) => Math.max(1, Math.round(base * (1 + 0.32 * (mlvl - 1))));
export const scaleAR = (base: number, mlvl: number) => Math.round(base + 10 * (mlvl - 1));
export const scaleDef = (base: number, mlvl: number) => Math.round(base + 5 * (mlvl - 1));
export const scaleXp = (base: number, mlvl: number) => Math.round(base * (1 + 0.5 * (mlvl - 1)));

export const ELEM_COLOR: Record<Elem, string> = { phys: "#ff5a4a", fire: "#ff9a3a", cold: "#8ad0ff", light: "#f8f070", poison: "#8ae04a" };
export const ELEM_NAME: Record<Elem, string> = { phys: "physical", fire: "fire", cold: "cold", light: "lightning", poison: "poison" };

/** Champion and unique (elite) monster modifiers, like Diablo II's. */
export type EliteMod = "strong" | "fast" | "stone" | "fire" | "cold";
export const ELITE_MODS: Record<EliteMod, string> = {
  strong: "Extra Strong", fast: "Extra Fast", stone: "Stone Skin", fire: "Fire Enchanted", cold: "Cold Enchanted",
};
const NAME_A = ["Grim", "Rot", "Bone", "Ash", "Blood", "Gore", "Dread", "Bile", "Pit", "Doom", "Gut", "Skull", "Blight", "Venom", "Storm"];
const NAME_B = ["maw", "fang", "hide", "spine", "gash", "claw", "rend", "brand", "crusher", "eater", "wart", "fist", "ripper", "howl"];
const NAME_C = ["the Hungry", "the Cruel", "the Wretched", "the Defiler", "the Unclean", "the Mad", "the Black", "the Grim", "the Savage", "the Rotten"];
/** A unique monster's name, e.g. "Gorefang the Cruel". */
export const uniqueName = (r: () => number) =>
  `${NAME_A[Math.floor(r() * NAME_A.length)]}${NAME_B[Math.floor(r() * NAME_B.length)]} ${NAME_C[Math.floor(r() * NAME_C.length)]}`;
