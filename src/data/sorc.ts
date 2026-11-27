/**
 * v1.6 Diablo II Sorceress: her three spell trees (names, required levels and prerequisites from D2, mapped onto our
 * rows: row 0 = level 1, 1 = 6, 2 = 12, 3 = 18, 4 = 24, 5 = 30) and every number the game and the tooltips share.
 *
 * Spell damage never uses the weapon: it is the sorceress spell base for her character level (spellBase) × the
 * skill's own multiple at its skill level × (1 + her mastery for that element). No synergies (kept simple for mobile).
 */
import type { SkillDef } from "./skills";

/** the sorceress spell base: what a 100% spell hits for at a character level (grows like weapon damage does) */
export const spellBase = (clvl: number) => 7 + 1.2 * Math.max(1, clvl) + 0.012 * Math.max(1, clvl) ** 2;
/** a spell's multiple of the base at skill level l: k at level 1, +g of that per level after */
const grow = (k: number, g: number) => (l: number) => Math.max(0, k * (1 + g * (Math.max(1, l) - 1)));

// ---- Fire ----
export const fireBoltK = grow(1.05, 0.2);
export const warmthRegen = (l: number) => (l <= 0 ? 0 : 30 + (l - 1) * 12); // % faster mana regeneration
export const infernoK = grow(0.85, 0.2);
export const INFERNO_RANGE = 3.6;
export const blazeK = grow(0.55, 0.18); // per second, per flame
export const blazeDur = (l: number) => 6 + l;
export const fireBallK = grow(1.35, 0.21);
export const FIRE_BALL_R = 1.4;
export const fireWallK = grow(1.15, 0.2); // per second
export const FIRE_WALL_DUR = 3.6;
export const enchantK = grow(0.45, 0.16); // fire added to each of your attacks
export const enchantDur = (l: number) => 120 + l * 24;
export const meteorK = grow(2.7, 0.21);
export const meteorBurnK = grow(0.6, 0.16); // per second, the burning ground
export const METEOR_DELAY = 0.9;
export const METEOR_R = 2;
export const fireMastery = (l: number) => (l <= 0 ? 0 : 30 + (l - 1) * 7);
export const hydraK = grow(0.75, 0.19);
export const HYDRA_DUR = 10;
export const HYDRA_MAX = 3;
export const HYDRA_RATE = 1.0; // seconds between bolts
// ---- Cold ----
export const iceBoltK = grow(0.85, 0.2);
export const iceBoltChill = (l: number) => 2 + l * 0.3;
export const frozenArmorDef = (l: number) => 45 + (l - 1) * 5;
export const frozenArmorFreeze = (l: number) => Math.min(3, 1 + l * 0.1);
export const armorDur = (l: number) => 120 + l * 12;
export const frostNovaK = grow(0.8, 0.18);
export const FROST_NOVA_R = 4;
export const iceBlastK = grow(1.45, 0.21);
export const iceBlastFreeze = (l: number) => Math.min(3.5, 1.2 + l * 0.1);
export const shiverDef = (l: number) => 45 + (l - 1) * 6;
export const shiverK = grow(0.9, 0.18);
export const glacialK = grow(1.8, 0.21);
export const glacialFreeze = (l: number) => Math.min(3, 1.1 + l * 0.08);
export const GLACIAL_R = 1.3;
export const blizzardK = grow(1.7, 0.21); // per second
export const BLIZZARD_DUR = 4;
export const BLIZZARD_R = 2.6;
export const chillingDef = (l: number) => 45 + (l - 1) * 5;
export const chillingK = grow(1.0, 0.18);
export const frozenOrbK = grow(0.55, 0.2); // per shard
export const coldMastery = (l: number) => (l <= 0 ? 0 : 25 + (l - 1) * 5);
// ---- Lightning ----
export const chargedBoltN = (l: number) => Math.min(10, 3 + Math.floor(l / 2));
export const chargedBoltK = grow(0.42, 0.17);
export const staticPct = 25; // of current life
export const staticR = (l: number) => Math.min(8, 3.5 + l * 0.35);
/** Static Field never takes a boss or act boss below this share of its life */
export const STATIC_BOSS_FLOOR = 0.5;
export const teleK = grow(0.5, 0.15);
export const novaK = grow(0.95, 0.19);
export const NOVA_R = 4.5;
export const lightningK = grow(1.55, 0.21);
export const LIGHTNING_RANGE = 9;
export const chainK = grow(1.15, 0.19);
export const chainHits = (l: number) => Math.min(7, 3 + Math.floor(l / 4));
export const teleportRange = (l: number) => Math.min(10, 6 + l * 0.2);
export const thunderK = grow(2.1, 0.2);
export const thunderDur = (l: number) => 32 + l * 8;
export const thunderRate = (l: number) => Math.max(1, 1.8 - l * 0.04);
export const THUNDER_R = 7;
export const esAbsorb = (l: number) => (l <= 0 ? 0 : Math.min(80, 20 + (l - 1) * 4)); // % of damage taken goes to mana
export const ES_MANA_PER_LIFE = 1.5;
export const esDur = (l: number) => 144 + l * 16;
export const lightMastery = (l: number) => (l <= 0 ? 0 : 50 + (l - 1) * 12);
/** cooldowns in seconds (D2 has them on the big area spells) */
export const SORC_COOLDOWN: Record<string, number> = { meteor: 1.2, blizzard: 1.8, fire_wall: 1.4, frozen_orb: 1.0, hydra: 0.6 };
/** seconds a spell cast takes (D2 sorceress at 0% faster cast rate is about 0.55 s) */
export const SORC_CAST = 0.5;

const pct = (n: number) => `${Math.round(n * 100)}%`;
type Def = Omit<SkillDef, "cls" | "implemented" | "kind" | "prereq"> & Partial<Pick<SkillDef, "kind" | "prereq">>;
const D = (d: Def): SkillDef => ({ prereq: [], kind: "active", implemented: true, cls: "sorceress", ...d });

export const SORC_SKILLS: SkillDef[] = [
  // ================= Fire Spells =================
  D({ id: "fire_bolt", name: "Fire Bolt", tab: "fire", reqLvl: 1, row: 0, col: 1, glyph: "☄", mana: () => 2,
    blurb: "Casts a small bolt of fire at an enemy.", effect: (l) => `Fire damage ${pct(fireBoltK(l))} of your spell base` }),
  D({ id: "warmth", name: "Warmth", tab: "fire", reqLvl: 1, row: 0, col: 2, glyph: "♨", kind: "passive",
    blurb: "Passive: your mana comes back faster.", effect: (l) => `+${warmthRegen(l)}% mana regeneration` }),
  D({ id: "inferno", name: "Inferno", tab: "fire", reqLvl: 6, row: 1, col: 0, glyph: "🜂", prereq: ["fire_bolt"], mana: (l) => 5 + Math.floor(l / 4),
    blurb: "A jet of flame bursts from your hands, burning everything in front of you.", effect: (l) => `Cone of fire, ${INFERNO_RANGE} tiles, ${pct(infernoK(l))} of your spell base` }),
  D({ id: "blaze", name: "Blaze", tab: "fire", reqLvl: 12, row: 2, col: 0, glyph: "ᛉ", prereq: ["inferno"], mana: () => 11,
    blurb: "For a while, you leave a trail of fire wherever you walk.", effect: (l) => `${blazeDur(l)} s, flames burn for ${pct(blazeK(l))}/s` }),
  D({ id: "fire_ball", name: "Fire Ball", tab: "fire", reqLvl: 12, row: 2, col: 1, glyph: "◉", prereq: ["fire_bolt"], mana: (l) => 6 + Math.floor(l / 3),
    blurb: "An exploding ball of fire that burns everything near where it lands.", effect: (l) => `Explodes for ${pct(fireBallK(l))} of your spell base` }),
  D({ id: "fire_wall", name: "Fire Wall", tab: "fire", reqLvl: 18, row: 3, col: 0, glyph: "▥", prereq: ["blaze"], mana: (l) => 16 + Math.floor(l / 2),
    blurb: "Raises a wall of flame across the path of your enemies.", effect: (l) => `${FIRE_WALL_DUR} s, burns for ${pct(fireWallK(l))}/s · 1.4 s cooldown` }),
  D({ id: "enchant", name: "Enchant", tab: "fire", reqLvl: 18, row: 3, col: 2, glyph: "✷", prereq: ["fire_ball", "warmth"], mana: (l) => 18 + l,
    blurb: "Sets your weapon aflame: your attacks deal extra fire damage for a long time.", effect: (l) => `+${pct(enchantK(l))} of your spell base as fire on each attack · ${enchantDur(l)} s` }),
  D({ id: "meteor", name: "Meteor", tab: "fire", reqLvl: 24, row: 4, col: 1, glyph: "☀", prereq: ["fire_wall", "fire_ball"], mana: (l) => 17 + Math.floor(l / 2),
    blurb: "Calls a meteor down on your enemies; the ground keeps burning.", effect: (l) => `${pct(meteorK(l))} of your spell base, then burning ground ${pct(meteorBurnK(l))}/s · 1.2 s cooldown` }),
  D({ id: "fire_mastery", name: "Fire Mastery", tab: "fire", reqLvl: 30, row: 5, col: 1, glyph: "♆", kind: "passive",
    blurb: "Passive: all your fire spells deal more damage.", effect: (l) => `+${fireMastery(l)}% fire spell damage` }),
  D({ id: "hydra", name: "Hydra", tab: "fire", reqLvl: 30, row: 5, col: 2, glyph: "⚚", prereq: ["enchant"], mana: (l) => 20 + Math.floor(l / 2),
    blurb: "Summons a fire-breathing hydra head that spits fire bolts at your enemies.", effect: (l) => `${HYDRA_DUR} s, a bolt every ${HYDRA_RATE} s for ${pct(hydraK(l))} · up to ${HYDRA_MAX} heads` }),
  // ================= Cold Spells =================
  D({ id: "ice_bolt", name: "Ice Bolt", tab: "cold", reqLvl: 1, row: 0, col: 1, glyph: "❅", mana: () => 2,
    blurb: "A shard of ice that damages and slows an enemy.", effect: (l) => `Cold damage ${pct(iceBoltK(l))} of your spell base, chills ${iceBoltChill(l).toFixed(1)} s` }),
  D({ id: "frozen_armor", name: "Frozen Armor", tab: "cold", reqLvl: 1, row: 0, col: 2, glyph: "⛨", mana: () => 7,
    blurb: "Ice armor that raises your defense and freezes enemies that hit you in melee.", effect: (l) => `+${frozenArmorDef(l)}% defense, freezes attackers ${frozenArmorFreeze(l).toFixed(1)} s · ${armorDur(l)} s` }),
  D({ id: "frost_nova", name: "Frost Nova", tab: "cold", reqLvl: 6, row: 1, col: 0, glyph: "✻", mana: (l) => 9 + Math.floor(l / 2),
    blurb: "A ring of frost that damages and slows everything around you.", effect: (l) => `${FROST_NOVA_R} tile ring, ${pct(frostNovaK(l))} of your spell base, chills` }),
  D({ id: "ice_blast", name: "Ice Blast", tab: "cold", reqLvl: 6, row: 1, col: 1, glyph: "❄", prereq: ["ice_bolt"], mana: (l) => 6 + Math.floor(l / 3),
    blurb: "A bolt of ice that freezes the enemy it hits.", effect: (l) => `${pct(iceBlastK(l))} of your spell base, freezes ${iceBlastFreeze(l).toFixed(1)} s` }),
  D({ id: "shiver_armor", name: "Shiver Armor", tab: "cold", reqLvl: 12, row: 2, col: 2, glyph: "⛉", prereq: ["ice_blast", "frozen_armor"], mana: () => 11,
    blurb: "Ice armor that raises your defense and blasts melee attackers with cold.", effect: (l) => `+${shiverDef(l)}% defense, attackers take ${pct(shiverK(l))} cold and are chilled · ${armorDur(l)} s` }),
  D({ id: "glacial_spike", name: "Glacial Spike", tab: "cold", reqLvl: 18, row: 3, col: 1, glyph: "⟡", prereq: ["ice_blast"], mana: (l) => 10 + Math.floor(l / 3),
    blurb: "A spike of ice that explodes and freezes everything near where it hits.", effect: (l) => `${pct(glacialK(l))} of your spell base, freezes ${glacialFreeze(l).toFixed(1)} s` }),
  D({ id: "blizzard", name: "Blizzard", tab: "cold", reqLvl: 24, row: 4, col: 0, glyph: "☃", prereq: ["frost_nova", "glacial_spike"], mana: (l) => 23 + Math.floor(l / 2),
    blurb: "Summons a storm of ice shards that hammers an area.", effect: (l) => `${BLIZZARD_DUR} s storm, ${pct(blizzardK(l))}/s, chills · 1.8 s cooldown` }),
  D({ id: "chilling_armor", name: "Chilling Armor", tab: "cold", reqLvl: 24, row: 4, col: 2, glyph: "⛊", prereq: ["shiver_armor"], mana: () => 17,
    blurb: "Ice armor that raises your defense and fires an ice bolt back when a missile hits you.", effect: (l) => `+${chillingDef(l)}% defense, ice bolt back for ${pct(chillingK(l))} · ${armorDur(l)} s` }),
  D({ id: "frozen_orb", name: "Frozen Orb", tab: "cold", reqLvl: 30, row: 5, col: 0, glyph: "✺", prereq: ["blizzard"], mana: (l) => 25 + Math.floor(l / 2),
    blurb: "A slow orb that sprays ice shards in every direction as it flies.", effect: (l) => `Shards for ${pct(frozenOrbK(l))} each, chill · 1 s cooldown` }),
  D({ id: "cold_mastery", name: "Cold Mastery", tab: "cold", reqLvl: 30, row: 5, col: 1, glyph: "♒", kind: "passive",
    blurb: "Passive: all your cold spells deal more damage.", effect: (l) => `+${coldMastery(l)}% cold spell damage` }),
  // ================= Lightning Spells =================
  D({ id: "charged_bolt", name: "Charged Bolt", tab: "lightning", reqLvl: 1, row: 0, col: 1, glyph: "⚡", mana: (l) => 2 + Math.floor(l / 3),
    blurb: "A spray of small bolts of electricity that wander toward enemies.", effect: (l) => `${chargedBoltN(l)} bolts, ${pct(chargedBoltK(l))} of your spell base each` }),
  D({ id: "static_field", name: "Static Field", tab: "lightning", reqLvl: 6, row: 1, col: 0, glyph: "⌁", mana: () => 9,
    blurb: "Takes a quarter of the current life of every enemy around you. Never kills; bosses never drop below half.", effect: (l) => `${staticPct}% of current life, ${staticR(l).toFixed(1)} tile radius` }),
  D({ id: "telekinesis", name: "Telekinesis", tab: "lightning", reqLvl: 6, row: 1, col: 2, glyph: "✋", mana: () => 7,
    blurb: "A bolt of force that knocks an enemy back and stuns it.", effect: (l) => `${pct(teleK(l))} lightning, knockback and a short stun` }),
  D({ id: "nova", name: "Nova", tab: "lightning", reqLvl: 12, row: 2, col: 0, glyph: "✹", prereq: ["static_field"], mana: (l) => 14 + Math.floor(l / 2),
    blurb: "A ring of lightning bursts out from you in every direction.", effect: (l) => `${NOVA_R} tile ring, ${pct(novaK(l))} of your spell base` }),
  D({ id: "lightning", name: "Lightning", tab: "lightning", reqLvl: 12, row: 2, col: 1, glyph: "ϟ", prereq: ["charged_bolt"], mana: (l) => 9 + Math.floor(l / 3),
    blurb: "A bolt of lightning that passes through every enemy in a line.", effect: (l) => `${LIGHTNING_RANGE} tiles, ${pct(lightningK(l))} of your spell base` }),
  D({ id: "chain_lightning", name: "Chain Lightning", tab: "lightning", reqLvl: 18, row: 3, col: 1, glyph: "⛓", prereq: ["lightning"], mana: (l) => 12 + Math.floor(l / 3),
    blurb: "Lightning that leaps from enemy to enemy.", effect: (l) => `Hits ${chainHits(l)} enemies, ${pct(chainK(l))} of your spell base each` }),
  D({ id: "teleport", name: "Teleport", tab: "lightning", reqLvl: 18, row: 3, col: 2, glyph: "⤳", prereq: ["telekinesis"], mana: (l) => Math.max(10, 24 - l),
    blurb: "Blink in the direction you aim. Never passes through walls.", effect: (l) => `Up to ${teleportRange(l).toFixed(1)} tiles` }),
  D({ id: "thunder_storm", name: "Thunder Storm", tab: "lightning", reqLvl: 24, row: 4, col: 0, glyph: "☈", prereq: ["chain_lightning", "nova"], mana: () => 19,
    blurb: "A storm follows you; lightning strikes nearby enemies on its own.", effect: (l) => `${thunderDur(l)} s, a strike every ${thunderRate(l).toFixed(1)} s for ${pct(thunderK(l))}` }),
  D({ id: "energy_shield", name: "Energy Shield", tab: "lightning", reqLvl: 24, row: 4, col: 2, glyph: "◍", prereq: ["chain_lightning", "teleport"], mana: () => 5,
    blurb: "A shield that takes part of every hit from your mana instead of your life.", effect: (l) => `${esAbsorb(l)}% of damage from mana (${ES_MANA_PER_LIFE} mana each) · ${esDur(l)} s` }),
  D({ id: "lightning_mastery", name: "Lightning Mastery", tab: "lightning", reqLvl: 30, row: 5, col: 1, glyph: "♃", kind: "passive",
    blurb: "Passive: all your lightning spells deal more damage.", effect: (l) => `+${lightMastery(l)}% lightning spell damage` }),
];

/** which element each damaging spell is (for the masteries) */
export const SPELL_ELEM: Record<string, "fire" | "cold" | "light"> = Object.fromEntries(
  SORC_SKILLS.map((s) => [s.id, s.tab === "fire" ? "fire" : s.tab === "cold" ? "cold" : "light"] as const),
);
export const SORC_IDS = new Set(SORC_SKILLS.map((s) => s.id));
