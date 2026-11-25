/** Diablo II–style prefixes and suffixes. Each tier needs a minimum item level. */
import { BASE_BY_ID, type Item, type Mod, type Quality, type StatKey, makeItem, rollBase } from "./items";
import { CLASS_NAME, SKILLS, SKILL_BY_ID } from "./skills";

export type Cat = "weapon" | "armor" | "helm" | "shield" | "gloves" | "boots" | "belt" | "ring" | "amulet";
type Range = [StatKey, number, number];
interface Tier {
  lvl: number;
  name: string;
  mods: Range[];
}
export interface AffixDef {
  id: string;
  side: "p" | "s";
  cats: Cat[];
  tiers: Tier[];
}

const ARMORS: Cat[] = ["armor", "helm", "shield", "gloves", "boots", "belt"];
const JEWEL: Cat[] = ["ring", "amulet"];

const T = (lvl: number, name: string, ...mods: Range[]): Tier => ({ lvl, name, mods });
const P = (id: string, cats: Cat[], ...tiers: Tier[]): AffixDef => ({ id, side: "p", cats, tiers });
const S = (id: string, cats: Cat[], ...tiers: Tier[]): AffixDef => ({ id, side: "s", cats, tiers });

export const AFFIXES: AffixDef[] = [
  // ---------------------------------------------------------------- prefixes
  P("edmg", ["weapon"],
    T(1, "Jagged", ["edmg", 10, 20]), T(5, "Deadly", ["edmg", 21, 30]), T(9, "Vicious", ["edmg", 31, 40]),
    T(14, "Brutal", ["edmg", 41, 50]), T(20, "Massive", ["edmg", 51, 65]), T(27, "Savage", ["edmg", 66, 80])),
  P("edmg_ar", ["weapon"],
    T(3, "Sharp", ["edmg", 10, 20], ["ar", 10, 20]), T(7, "Fine", ["edmg", 21, 30], ["ar", 21, 40]),
    T(12, "Warrior's", ["edmg", 31, 40], ["ar", 41, 60]), T(18, "Soldier's", ["edmg", 41, 50], ["ar", 61, 80]),
    T(25, "Knight's", ["edmg", 51, 65], ["ar", 81, 100])),
  P("ar", ["weapon", "gloves", ...JEWEL],
    T(1, "Bronze", ["ar", 10, 20]), T(4, "Iron", ["ar", 21, 40]), T(8, "Steel", ["ar", 41, 60]),
    T(12, "Silver", ["ar", 61, 80]), T(16, "Gold", ["ar", 81, 100]), T(20, "Platinum", ["ar", 101, 120])),
  P("edef", ARMORS,
    T(1, "Sturdy", ["edef", 10, 20]), T(4, "Strong", ["edef", 21, 30]), T(9, "Glorious", ["edef", 31, 40]),
    T(14, "Blessed", ["edef", 41, 50]), T(20, "Saintly", ["edef", 51, 65]), T(27, "Holy", ["edef", 66, 80])),
  P("def", ARMORS,
    T(1, "Stout", ["def", 2, 6]), T(6, "Burly", ["def", 7, 15]), T(13, "Rugged", ["def", 16, 30])),
  P("mana", ["helm", "belt", ...JEWEL],
    T(1, "Lizard's", ["mana", 1, 5]), T(5, "Snake's", ["mana", 6, 10]), T(12, "Serpent's", ["mana", 11, 15]),
    T(20, "Drake's", ["mana", 16, 20])),
  P("fres", ["armor", "helm", "shield", "boots", "belt", ...JEWEL],
    T(4, "Red", ["fres", 5, 10]), T(12, "Crimson", ["fres", 11, 20]), T(20, "Burgundy", ["fres", 21, 30])),
  P("cres", ["armor", "helm", "shield", "boots", "belt", ...JEWEL],
    T(4, "Azure", ["cres", 5, 10]), T(12, "Lapis", ["cres", 11, 20]), T(20, "Cobalt", ["cres", 21, 30])),
  P("lres", ["armor", "helm", "shield", "boots", "belt", ...JEWEL],
    T(4, "Ocher", ["lres", 5, 10]), T(12, "Tangerine", ["lres", 11, 20]), T(20, "Coral", ["lres", 21, 30])),
  P("pres", ["armor", "helm", "shield", "boots", "belt", ...JEWEL],
    T(4, "Beryl", ["pres", 5, 10]), T(12, "Jade", ["pres", 11, 20]), T(20, "Viridian", ["pres", 21, 30])),
  P("ares", ["shield", "armor", ...JEWEL],
    T(10, "Shimmering", ["ares", 5, 10]), T(20, "Rainbow", ["ares", 11, 15]), T(28, "Prismatic", ["ares", 16, 25])),
  P("skill", ["helm", "amulet", "weapon"],
    T(6, "Fervent", ["skill", 1, 1]), T(18, "Furious", ["skill", 2, 2])),
  P("mf", ["helm", "boots", "gloves", ...JEWEL],
    T(4, "Felicitous", ["mf", 5, 10]), T(14, "Fortuitous", ["mf", 11, 20])),
  // ---------------------------------------------------------------- suffixes
  S("str", ["weapon", "armor", "gloves", "belt", "boots", ...JEWEL],
    T(1, "of Strength", ["str", 1, 2]), T(7, "of Might", ["str", 3, 5]), T(16, "of the Ox", ["str", 6, 9]), T(26, "of the Giant", ["str", 10, 15])),
  S("dex", ["weapon", "armor", "gloves", "boots", ...JEWEL],
    T(1, "of Dexterity", ["dex", 1, 2]), T(7, "of Skill", ["dex", 3, 5]), T(16, "of Accuracy", ["dex", 6, 9]), T(26, "of Precision", ["dex", 10, 15])),
  S("vit", ["armor", "helm", "shield", "belt", ...JEWEL],
    T(1, "of Vitality", ["vit", 1, 2]), T(7, "of Vigor", ["vit", 3, 5]), T(16, "of Health", ["vit", 6, 9]), T(26, "of Life", ["vit", 10, 15])),
  S("ene", ["helm", "shield", ...JEWEL],
    T(1, "of Energy", ["ene", 1, 2]), T(7, "of the Mind", ["ene", 3, 5]), T(16, "of Brilliance", ["ene", 6, 9])),
  S("life", ["armor", "helm", "shield", "belt", "boots", ...JEWEL],
    T(1, "of the Jackal", ["life", 1, 5]), T(5, "of the Fox", ["life", 6, 10]), T(11, "of the Wolf", ["life", 11, 20]),
    T(18, "of the Tiger", ["life", 21, 30]), T(26, "of the Mammoth", ["life", 31, 40])),
  S("ll", ["weapon", "gloves", ...JEWEL],
    T(3, "of the Leech", ["ll", 3, 4]), T(10, "of the Locust", ["ll", 5, 7]), T(20, "of the Lamprey", ["ll", 8, 9])),
  S("ml", ["weapon", "gloves", ...JEWEL],
    T(3, "of the Bat", ["ml", 3, 4]), T(10, "of the Vampire", ["ml", 5, 7])),
  S("ias", ["weapon", "gloves"],
    T(3, "of Readiness", ["ias", 10, 10]), T(10, "of Alacrity", ["ias", 20, 20]), T(22, "of Swiftness", ["ias", 30, 30])),
  S("frw", ["boots"],
    T(1, "of Pacing", ["frw", 10, 10]), T(8, "of Haste", ["frw", 20, 20]), T(18, "of Speed", ["frw", 30, 30])),
  S("maxdmg", ["weapon"],
    T(1, "of Maiming", ["maxdmg", 1, 3]), T(7, "of Slaying", ["maxdmg", 4, 7]), T(14, "of Gore", ["maxdmg", 8, 12]), T(22, "of Carnage", ["maxdmg", 13, 20])),
  S("mindmg", ["weapon"],
    T(1, "of Worth", ["mindmg", 1, 2]), T(8, "of Measure", ["mindmg", 3, 5]), T(16, "of Excellence", ["mindmg", 6, 9])),
  S("gf", ["gloves", "boots", "belt", ...JEWEL],
    T(1, "of Greed", ["gf", 25, 40]), T(12, "of Wealth", ["gf", 41, 80])),
  S("mf", ["boots", "gloves", "belt", ...JEWEL],
    T(5, "of Chance", ["mf", 5, 15]), T(15, "of Fortune", ["mf", 16, 25])),
];
export const AFFIX_BY_ID: Record<string, AffixDef> = Object.fromEntries(AFFIXES.map((a) => [`${a.side}:${a.id}`, a]));

export const catOf = (baseId: string): Cat | null => {
  const s = BASE_BY_ID[baseId]?.slot;
  return !s || s === "potion" ? null : (s as Cat);
};

type Rng = () => number;
const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

/** +skill rolls: any class skill (v1.0: Amazon skills too, so the loot pool stays the same for every class) */
const SKILLABLE = () => SKILLS.filter((s) => s.implemented && s.cls !== "any").map((s) => s.id);

interface Pick {
  key: string;
  def: AffixDef;
  tier: Tier;
}

function pool(cat: Cat, ilvl: number, side: "p" | "s", used: Set<string>): Pick[] {
  const out: Pick[] = [];
  for (const a of AFFIXES) {
    if (a.side !== side || !a.cats.includes(cat)) continue;
    const key = `${a.side}:${a.id}`;
    if (used.has(key)) continue;
    // the two damage-% prefixes don't stack on one item, like D2's affix groups
    if (side === "p" && ((a.id === "edmg" && used.has("p:edmg_ar")) || (a.id === "edmg_ar" && used.has("p:edmg")))) continue;
    for (const tier of a.tiers) if (tier.lvl <= ilvl) out.push({ key, def: a, tier });
  }
  return out;
}

export interface Rolled {
  mods: Mod[];
  aff: string[];
  prefixes: string[];
  suffixes: string[];
}

/** How many affixes a rare gets (picked uniformly from this list). */
/** v0.8: rares roll 3–4 affixes (was 3–6). Rares found before keep theirs. */
export const RARE_COUNTS = [3, 3, 3, 4, 4];
/** Magic: chance of prefix only / suffix only (the rest get both). */
export const MAGIC_SPLIT = { prefixOnly: 0.25, suffixOnly: 0.25 };

/** Roll a set of affixes. Magic: 1 prefix and/or 1 suffix. Rare: 3–4, at most 3 of each side. */
export function rollAffixes(cat: Cat, ilvl: number, q: Quality, r: Rng = Math.random): Rolled {
  const res: Rolled = { mods: [], aff: [], prefixes: [], suffixes: [] };
  if (q === "normal") return res;
  const used = new Set<string>();
  const take = (side: "p" | "s") => {
    const pl = pool(cat, ilvl, side, used);
    if (!pl.length) return false;
    const pk = pl[Math.floor(r() * pl.length)];
    used.add(pk.key);
    res.aff.push(pk.key);
    (side === "p" ? res.prefixes : res.suffixes).push(pk.tier.name);
    for (const [s, a, b] of pk.tier.mods) {
      const m: Mod = { s, v: ri(r, a, b) };
      if (s === "skill") {
        const ids = SKILLABLE();
        m.sk = ids[Math.floor(r() * ids.length)];
      }
      res.mods.push(m);
    }
    return true;
  };
  if (q === "magic") {
    const x = r();
    const sides: ("p" | "s")[] = x < MAGIC_SPLIT.prefixOnly ? ["p"] : x < MAGIC_SPLIT.prefixOnly + MAGIC_SPLIT.suffixOnly ? ["s"] : ["p", "s"];
    for (const s of sides) take(s);
    if (!res.aff.length) take(sides[0] === "p" ? "s" : "p");
    return res;
  }
  const n = RARE_COUNTS[Math.floor(r() * RARE_COUNTS.length)];
  let np = 0;
  let ns = 0;
  for (let i = 0; i < n; i++) {
    const sides: ("p" | "s")[] = [];
    if (np < 3) sides.push("p");
    if (ns < 3) sides.push("s");
    if (!sides.length) break;
    let side = sides[Math.floor(r() * sides.length)];
    if (!take(side)) {
      side = side === "p" ? "s" : "p";
      if ((side === "p" ? np : ns) >= 3 || !take(side)) break;
    }
    if (side === "p") np++;
    else ns++;
  }
  return res;
}

const RARE_A = ["Beast", "Eagle", "Raven", "Viper", "Ghoul", "Bone", "Doom", "Grim", "Blood", "Bramble", "Death", "Dread", "Gloom", "Havoc", "Pain", "Rune", "Shadow", "Skull", "Spirit", "Storm", "Wraith", "Stone", "Brimstone", "Plague", "Rift", "Ember", "Ash", "Hailstone", "Corpse", "Empyrian"];
const RARE_B: Record<Cat, string[]> = {
  weapon: ["Bite", "Scratch", "Thirst", "Edge", "Cleaver", "Mangler", "Gnash", "Song", "Spike", "Fang", "Razor", "Break", "Wrack"],
  armor: ["Shell", "Coat", "Carapace", "Hide", "Pelt", "Jack", "Wrap", "Suit", "Cloak", "Mantle"],
  helm: ["Brow", "Visage", "Crown", "Hood", "Mask", "Horn", "Veil", "Cowl"],
  shield: ["Ward", "Wing", "Badge", "Emblem", "Guard", "Mark", "Tower", "Rock", "Aegis"],
  gloves: ["Hand", "Fist", "Grip", "Clutch", "Claw", "Knuckle", "Hold", "Touch"],
  boots: ["Track", "Road", "Trample", "Spur", "Stalker", "Blazer", "Nails", "Slippers"],
  belt: ["Lock", "Strap", "Buckle", "Clasp", "Harness", "Chain", "Fringe", "Winding"],
  ring: ["Band", "Circle", "Coil", "Eye", "Grasp", "Loop", "Knot", "Whorl", "Spiral", "Finger"],
  amulet: ["Beads", "Collar", "Gorget", "Heart", "Noose", "Talisman", "Torc", "Scarab", "Necklace"],
};

export function rareName(cat: Cat, r: Rng = Math.random) {
  const b = RARE_B[cat];
  return `${RARE_A[Math.floor(r() * RARE_A.length)]} ${b[Math.floor(r() * b.length)]}`;
}

/** Turn an item into a magic or rare one (rolls its affixes and name). */
export function enchant(it: Item, q: Quality, r: Rng = Math.random): Item {
  const cat = catOf(it.baseId);
  if (!cat || q === "normal") return it;
  const rolled = rollAffixes(cat, it.ilvl ?? 1, q, r);
  if (!rolled.mods.length) return it;
  it.q = q;
  it.mods = rolled.mods;
  it.aff = rolled.aff;
  const base = BASE_BY_ID[it.baseId].name;
  it.name = q === "magic" ? [rolled.prefixes[0], base, rolled.suffixes[0]].filter(Boolean).join(" ") : rareName(cat, r);
  return it;
}

/** Drop quality. Magic find raises the odds (rare odds with D2-style diminishing returns). */
/** Chance that a dropped item is rare / magic (before rings and amulets are bumped to magic). */
export function qualityOdds(mlvl: number, mf: number, boss: boolean): { rare: number; magic: number } {
  const rareMf = (mf * 600) / (mf + 600);
  const rare = Math.min(1, (boss ? 0.3 : 0.035 + 0.004 * mlvl) * (1 + rareMf / 100));
  const magic = Math.min(1 - rare, (boss ? 1 : Math.min(0.42, 0.2 + 0.012 * mlvl)) * (1 + mf / 100));
  return { rare, magic };
}

export function rollQuality(mlvl: number, mf: number, boss: boolean, r: Rng = Math.random): Quality {
  const { rare, magic } = qualityOdds(mlvl, mf, boss);
  const x = r();
  if (x < rare) return "rare";
  if (x < rare + magic) return "magic";
  return "normal";
}

/** A random dropped item for a monster level. Rings and amulets are never plain. */
export function rollDrop(mlvl: number, mf: number, boss: boolean, r: Rng = Math.random): Item {
  let b = rollBase(r);
  const ilvl = Math.max(1, mlvl + (boss ? 2 : 0));
  let q = rollQuality(mlvl, mf, boss, r);
  // v1.0: arrows are never magic; a magic/rare roll that lands on them picks another class, so the quality mix is unchanged
  for (let i = 0; i < 20 && q !== "normal" && !catHasAffixes(b.slot); i++) b = rollBase(r);
  const it = makeItem(b.id, ilvl);
  if (q === "normal" && (b.slot === "ring" || b.slot === "amulet")) q = "magic";
  return enchant(it, q, r);
}
const catHasAffixes = (slot: string) => AFFIXES.some((a) => (a.cats as string[]).includes(slot));

/** Tooltip text for one mod. */
export function modText(m: Mod): string {
  switch (m.s) {
    case "edmg": return `+${m.v}% Enhanced Damage`;
    case "mindmg": return `+${m.v} to Minimum Damage`;
    case "maxdmg": return `+${m.v} to Maximum Damage`;
    case "ar": return `+${m.v} to Attack Rating`;
    case "str": return `+${m.v} to Strength`;
    case "dex": return `+${m.v} to Dexterity`;
    case "vit": return `+${m.v} to Vitality`;
    case "ene": return `+${m.v} to Energy`;
    case "life": return `+${m.v} to Life`;
    case "mana": return `+${m.v} to Mana`;
    case "ll": return `${m.v}% Life Stolen per Hit`;
    case "ml": return `${m.v}% Mana Stolen per Hit`;
    case "frw": return `+${m.v}% Faster Run/Walk`;
    case "ias": return `+${m.v}% Increased Attack Speed`;
    case "fres": return `Fire Resist +${m.v}%`;
    case "cres": return `Cold Resist +${m.v}%`;
    case "lres": return `Lightning Resist +${m.v}%`;
    case "pres": return `Poison Resist +${m.v}%`;
    case "ares": return `All Resistances +${m.v}`;
    case "edef": return `+${m.v}% Enhanced Defense`;
    case "def": return `+${m.v} Defense`;
    case "gf": return `${m.v}% Extra Gold from Monsters`;
    case "mf": return `${m.v}% Better Chance of Getting Magic Items`;
    case "skill": {
      const sd = SKILL_BY_ID[m.sk ?? ""];
      return `+${m.v} to ${sd?.name ?? "a skill"} (${sd && sd.cls !== "any" ? CLASS_NAME[sd.cls] : "Barbarian"} Only)`;
    }
  }
}
