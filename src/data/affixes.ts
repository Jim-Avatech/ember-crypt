/**
 * Item affixes. v1.4: one flat pool: any affix can roll in any of an item's affix slots (no prefix/suffix split, no
 * "at most N prefixes" limits), and no stat can appear twice on one item (affixes that grant the same stat exclude
 * each other, e.g. +Attack Rating and Enhanced Damage + Attack Rating). Each tier needs a minimum item level; the tier
 * names only build magic item names ("Jagged Axe of the Fox") and never decide what rolls.
 */
import { BASE_BY_ID, SORC_ITEM_BASES, type Item, type Mod, type Quality, type StatKey, makeItem, rollBase } from "./items";
import { CLASS_NAME, SKILLS, SKILL_BY_ID } from "./skills";

export type Cat = "weapon" | "armor" | "helm" | "shield" | "orb" | "gloves" | "boots" | "belt" | "ring" | "amulet";
type Range = [StatKey, number, number];
interface Tier {
  lvl: number;
  name: string;
  mods: Range[];
}
export interface AffixDef {
  id: string;
  cats: Cat[];
  tiers: Tier[];
}

const ARMORS: Cat[] = ["armor", "helm", "shield", "gloves", "boots", "belt"];
const JEWEL: Cat[] = ["ring", "amulet"];

const T = (lvl: number, name: string, ...mods: Range[]): Tier => ({ lvl, name, mods });
const A = (id: string, cats: Cat[], ...tiers: Tier[]): AffixDef => ({ id, cats, tiers });

export const AFFIXES: AffixDef[] = [
  A("edmg", ["weapon"],
    T(1, "Jagged", ["edmg", 10, 20]), T(5, "Deadly", ["edmg", 21, 30]), T(9, "Vicious", ["edmg", 31, 40]),
    T(14, "Brutal", ["edmg", 41, 50]), T(20, "Massive", ["edmg", 51, 65]), T(27, "Savage", ["edmg", 66, 80])),
  A("edmg_ar", ["weapon"],
    T(3, "Sharp", ["edmg", 10, 20], ["ar", 10, 20]), T(7, "Fine", ["edmg", 21, 30], ["ar", 21, 40]),
    T(12, "Warrior's", ["edmg", 31, 40], ["ar", 41, 60]), T(18, "Soldier's", ["edmg", 41, 50], ["ar", 61, 80]),
    T(25, "Knight's", ["edmg", 51, 65], ["ar", 81, 100])),
  A("ar", ["weapon", "gloves", ...JEWEL],
    T(1, "Bronze", ["ar", 10, 20]), T(4, "Iron", ["ar", 21, 40]), T(8, "Steel", ["ar", 41, 60]),
    T(12, "Silver", ["ar", 61, 80]), T(16, "Gold", ["ar", 81, 100]), T(20, "Platinum", ["ar", 101, 120])),
  A("edef", ARMORS,
    T(1, "Sturdy", ["edef", 10, 20]), T(4, "Strong", ["edef", 21, 30]), T(9, "Glorious", ["edef", 31, 40]),
    T(14, "Blessed", ["edef", 41, 50]), T(20, "Saintly", ["edef", 51, 65]), T(27, "Holy", ["edef", 66, 80])),
  A("def", ARMORS,
    T(1, "Stout", ["def", 2, 6]), T(6, "Burly", ["def", 7, 15]), T(13, "Rugged", ["def", 16, 30])),
  A("mana", ["orb", "helm", "belt", ...JEWEL],
    T(1, "Lizard's", ["mana", 1, 5]), T(5, "Snake's", ["mana", 6, 10]), T(12, "Serpent's", ["mana", 11, 15]),
    T(20, "Drake's", ["mana", 16, 20])),
  A("fres", ["orb", "armor", "helm", "shield", "boots", "belt", ...JEWEL],
    T(4, "Red", ["fres", 5, 10]), T(12, "Crimson", ["fres", 11, 20]), T(20, "Burgundy", ["fres", 21, 30])),
  A("cres", ["orb", "armor", "helm", "shield", "boots", "belt", ...JEWEL],
    T(4, "Azure", ["cres", 5, 10]), T(12, "Lapis", ["cres", 11, 20]), T(20, "Cobalt", ["cres", 21, 30])),
  A("lres", ["orb", "armor", "helm", "shield", "boots", "belt", ...JEWEL],
    T(4, "Ocher", ["lres", 5, 10]), T(12, "Tangerine", ["lres", 11, 20]), T(20, "Coral", ["lres", 21, 30])),
  A("pres", ["orb", "armor", "helm", "shield", "boots", "belt", ...JEWEL],
    T(4, "Beryl", ["pres", 5, 10]), T(12, "Jade", ["pres", 11, 20]), T(20, "Viridian", ["pres", 21, 30])),
  A("ares", ["orb", "shield", "armor", ...JEWEL],
    T(10, "Shimmering", ["ares", 5, 10]), T(20, "Rainbow", ["ares", 11, 15]), T(28, "Prismatic", ["ares", 16, 25])),
  A("skill", ["orb", "helm", "amulet", "weapon"],
    T(6, "Fervent", ["skill", 1, 1]), T(18, "Furious", ["skill", 2, 2])),
  // v1.4: one Magic Find affix (before, a magic-find prefix and a magic-find suffix could both roll: two MF rows)
  A("mf", ["helm", "boots", "gloves", "belt", ...JEWEL],
    T(4, "Felicitous", ["mf", 5, 10]), T(5, "of Chance", ["mf", 5, 15]), T(14, "Fortuitous", ["mf", 11, 20]), T(15, "of Fortune", ["mf", 16, 25])),
  A("str", ["weapon", "armor", "gloves", "belt", "boots", ...JEWEL],
    T(1, "of Strength", ["str", 1, 2]), T(7, "of Might", ["str", 3, 5]), T(16, "of the Ox", ["str", 6, 9]), T(26, "of the Giant", ["str", 10, 15])),
  A("dex", ["weapon", "armor", "gloves", "boots", ...JEWEL],
    T(1, "of Dexterity", ["dex", 1, 2]), T(7, "of Skill", ["dex", 3, 5]), T(16, "of Accuracy", ["dex", 6, 9]), T(26, "of Precision", ["dex", 10, 15])),
  A("vit", ["orb", "armor", "helm", "shield", "belt", ...JEWEL],
    T(1, "of Vitality", ["vit", 1, 2]), T(7, "of Vigor", ["vit", 3, 5]), T(16, "of Health", ["vit", 6, 9]), T(26, "of Life", ["vit", 10, 15])),
  A("ene", ["orb", "helm", "shield", ...JEWEL],
    T(1, "of Energy", ["ene", 1, 2]), T(7, "of the Mind", ["ene", 3, 5]), T(16, "of Brilliance", ["ene", 6, 9])),
  A("life", ["orb", "armor", "helm", "shield", "belt", "boots", ...JEWEL],
    T(1, "of the Jackal", ["life", 1, 5]), T(5, "of the Fox", ["life", 6, 10]), T(11, "of the Wolf", ["life", 11, 20]),
    T(18, "of the Tiger", ["life", 21, 30]), T(26, "of the Mammoth", ["life", 31, 40])),
  A("ll", ["weapon", "gloves", ...JEWEL],
    T(3, "of the Leech", ["ll", 3, 4]), T(10, "of the Locust", ["ll", 5, 7]), T(20, "of the Lamprey", ["ll", 8, 9])),
  A("ml", ["weapon", "gloves", ...JEWEL],
    T(3, "of the Bat", ["ml", 3, 4]), T(10, "of the Vampire", ["ml", 5, 7])),
  A("ias", ["weapon", "gloves"],
    T(3, "of Readiness", ["ias", 10, 10]), T(10, "of Alacrity", ["ias", 20, 20]), T(22, "of Swiftness", ["ias", 30, 30])),
  A("frw", ["boots"],
    T(1, "of Pacing", ["frw", 10, 10]), T(8, "of Haste", ["frw", 20, 20]), T(18, "of Speed", ["frw", 30, 30])),
  A("maxdmg", ["weapon"],
    T(1, "of Maiming", ["maxdmg", 1, 3]), T(7, "of Slaying", ["maxdmg", 4, 7]), T(14, "of Gore", ["maxdmg", 8, 12]), T(22, "of Carnage", ["maxdmg", 13, 20])),
  A("mindmg", ["weapon"],
    T(1, "of Worth", ["mindmg", 1, 2]), T(8, "of Measure", ["mindmg", 3, 5]), T(16, "of Excellence", ["mindmg", 6, 9])),
  A("gf", ["gloves", "boots", "belt", ...JEWEL],
    T(1, "of Greed", ["gf", 25, 40]), T(12, "of Wealth", ["gf", 41, 80])),
];
export const AFFIX_BY_ID: Record<string, AffixDef> = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));
/** v1.4: an affix by id; items from before v1.4 store "p:edmg" / "s:life" style keys */
export const affixDef = (key: string): AffixDef | undefined => AFFIX_BY_ID[key.replace(/^[ps]:/, "")];
/** v1.4: the stats an affix grants (any tier); two affixes sharing a stat never go on one item */
export const statsOf = (a: AffixDef): Set<StatKey> => new Set(a.tiers.flatMap((t) => t.mods.map(([s]) => s)));
/** v1.4: the most affixes an item can have (rolled or crafted) */
export const MAX_AFFIXES = 4;

export const catOf = (baseId: string): Cat | null => {
  if (BASE_BY_ID[baseId]?.kind === "orb") return "orb";
  const s = BASE_BY_ID[baseId]?.slot;
  return !s || s === "potion" ? null : (s as Cat);
};

type Rng = () => number;
const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

/** +skill rolls: any class skill (v1.0: Amazon skills too, so the loot pool stays the same for every class) */
const SKILLABLE = () => SKILLS.filter((s) => s.implemented && s.cls !== "any").map((s) => s.id);
/** v1.1: share of amulet +skill rolls that pick a skill of the finder's class (the rest pick any class). */
export const AMULET_OWN_CLASS = 0.7;
/**
 * v1.1: which skills a +skill roll may pick, by item (like Diablo II's class items): bows only Bow & Crossbow skills,
 * javelins and spears only Javelin & Spear skills, every other weapon and helms only Barbarian skills, amulets any
 * class (mostly the finder's class when known).
 */
export function skillPoolFor(baseId: string, r: Rng = Math.random, cls?: string): string[] {
  const b = BASE_BY_ID[baseId];
  const ok = (f: (s: (typeof SKILLS)[number]) => boolean) => SKILLS.filter((s) => s.implemented && s.cls !== "any" && f(s)).map((s) => s.id);
  // v1.6: Sorceress staves, wands and orbs: only Sorceress spells
  if (SORC_ITEM_BASES.has(baseId)) return ok((s) => s.cls === "sorceress");
  if (b?.slot === "weapon") {
    if (b.kind === "bow") return ok((s) => s.tab === "bow");
    if (b.kind === "spear") return ok((s) => s.tab === "javelin");
    return ok((s) => s.cls === "barbarian");
  }
  if (b?.slot === "helm") return ok((s) => s.cls === "barbarian");
  if (cls && r() < AMULET_OWN_CLASS) {
    const mine = ok((s) => s.cls === cls);
    if (mine.length) return mine;
  }
  return SKILLABLE();
}

interface Pick {
  def: AffixDef;
  tier: Tier;
}

/**
 * v1.4: every (affix, tier) that can still roll on an item: right item type, tier level ≤ item level, and none of its
 * stats already on the item. One flat pool, uniform over affix tiers (as before v1.4, minus the side split).
 */
function pool(cat: Cat, ilvl: number, taken: Set<StatKey>): Pick[] {
  const out: Pick[] = [];
  for (const a of AFFIXES) {
    if (!a.cats.includes(cat)) continue;
    if ([...statsOf(a)].some((st) => taken.has(st))) continue;
    for (const tier of a.tiers) if (tier.lvl <= ilvl) out.push({ def: a, tier });
  }
  return out;
}

export interface Rolled {
  mods: Mod[];
  /** affix ids, one per affix */
  aff: string[];
  /** the rolled tiers' names, for the item name only */
  names: string[];
}

/** How many affixes a rare gets (picked uniformly from this list). */
/** v0.8: rares roll 3–4 affixes (was 3–6). Rares found before keep theirs. */
export const RARE_COUNTS = [3, 3, 3, 4, 4];
/** v1.4: a magic item rolls 2 affixes this often, else 1 (same mix as the old prefix-only / suffix-only / both split) */
export const MAGIC_TWO = 0.5;

/**
 * Roll `n` more affixes onto an item that already has `existing` mods (v1.4: none of them may share a stat with an
 * existing mod or with each other). Returns fewer when the pool runs dry.
 */
export function rollMore(cat: Cat, ilvl: number, n: number, existing: Mod[], r: Rng = Math.random, skillPool?: () => string[]): Rolled {
  const res: Rolled = { mods: [], aff: [], names: [] };
  const taken = new Set<StatKey>(existing.map((m) => m.s));
  for (let i = 0; i < n; i++) {
    const pl = pool(cat, ilvl, taken);
    if (!pl.length) break;
    const pk = pl[Math.floor(r() * pl.length)];
    for (const st of statsOf(pk.def)) taken.add(st);
    res.aff.push(pk.def.id);
    res.names.push(pk.tier.name);
    for (const [s, a, b] of pk.tier.mods) {
      const m: Mod = { s, v: ri(r, a, b) };
      if (s === "skill") {
        const ids = skillPool ? skillPool() : SKILLABLE();
        m.sk = ids[Math.floor(r() * ids.length)];
      }
      res.mods.push(m);
    }
  }
  return res;
}

/** Roll a set of affixes from the one pool. Magic: 1–2. Rare: 3–4. Never the same stat twice. */
export function rollAffixes(cat: Cat, ilvl: number, q: Quality, r: Rng = Math.random, skillPool?: () => string[]): Rolled {
  if (q === "normal") return { mods: [], aff: [], names: [] };
  const n = q === "magic" ? (r() < MAGIC_TWO ? 2 : 1) : RARE_COUNTS[Math.floor(r() * RARE_COUNTS.length)];
  return rollMore(cat, ilvl, n, [], r, skillPool);
}

/** v1.4: a magic item's name from its affixes' tier names: an "of …" name goes after the class name, any other before */
export function magicName(baseName: string, names: string[]): string {
  const pre = names.find((n) => !n.startsWith("of "));
  const suf = names.find((n) => n.startsWith("of "));
  return [pre, baseName, suf].filter(Boolean).join(" ");
}

/** v1.4: the tier name an affix on an item has (from its value), for renaming crafted magic items */
export function tierNameOn(it: Item, key: string): string | null {
  const a = affixDef(key);
  if (!a) return null;
  const [s0] = a.tiers[0].mods[0];
  const v = (it.mods ?? []).find((m) => m.s === s0)?.v;
  if (v === undefined) return a.tiers[0].name;
  let best = a.tiers[0];
  for (const t of a.tiers) if (t.mods[0][1] <= v) best = t;
  return best.name;
}

/**
 * v1.4: how many affixes an item has: one per affix id it lists, plus one per stat not covered by those (hand-made or
 * very old items without ids).
 */
export function affixCount(it: Item): number {
  const left = new Set((it.mods ?? []).map((m) => m.s));
  let n = 0;
  for (const k of new Set((it.aff ?? []).map((x) => x.replace(/^[ps]:/, "")))) {
    const a = affixDef(k);
    if (!a) continue;
    n++;
    for (const st of statsOf(a)) left.delete(st);
  }
  return n + left.size;
}

/**
 * v1.4: old items could have the same stat twice (a magic-find prefix and suffix; +AR and Enhanced Damage + AR).
 * Merge each stat into one row keeping the higher value (+skills: per skill), and turn old "p:"/"s:" affix keys
 * into plain ids. Returns how many rows were merged away (0 = unchanged). Never removes the item.
 */
export function mergeDuplicateMods(it: Item): number {
  let merged = 0;
  if (it.mods?.length) {
    const out: Mod[] = [];
    for (const m of it.mods) {
      const same = out.find((o) => o.s === m.s && (m.s !== "skill" || o.sk === m.sk));
      if (same) {
        if (m.v > same.v) same.v = m.v;
        merged++;
      } else out.push({ ...m });
    }
    if (merged) it.mods = out;
  }
  if (it.aff?.length) {
    const ids = [...new Set(it.aff.map((k) => k.replace(/^[ps]:/, "")))];
    if (ids.length !== it.aff.length || ids.some((k, i) => k !== it.aff![i])) it.aff = ids;
  }
  return merged;
}

const RARE_A = ["Beast", "Eagle", "Raven", "Viper", "Ghoul", "Bone", "Doom", "Grim", "Blood", "Bramble", "Death", "Dread", "Gloom", "Havoc", "Pain", "Rune", "Shadow", "Skull", "Spirit", "Storm", "Wraith", "Stone", "Brimstone", "Plague", "Rift", "Ember", "Ash", "Hailstone", "Corpse", "Empyrian"];
const RARE_B: Record<Cat, string[]> = {
  weapon: ["Bite", "Scratch", "Thirst", "Edge", "Cleaver", "Mangler", "Gnash", "Song", "Spike", "Fang", "Razor", "Break", "Wrack"],
  armor: ["Shell", "Coat", "Carapace", "Hide", "Pelt", "Jack", "Wrap", "Suit", "Cloak", "Mantle"],
  helm: ["Brow", "Visage", "Crown", "Hood", "Mask", "Horn", "Veil", "Cowl"],
  orb: ["Eye", "Sphere", "Star", "Moon", "Globe", "Heart", "Glow", "Gaze"],
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
export function enchant(it: Item, q: Quality, r: Rng = Math.random, cls?: string): Item {
  const cat = catOf(it.baseId);
  if (!cat || q === "normal") return it;
  const rolled = rollAffixes(cat, it.ilvl ?? 1, q, r, () => skillPoolFor(it.baseId, r, cls));
  if (!rolled.mods.length) return it;
  it.q = q;
  it.mods = rolled.mods;
  it.aff = rolled.aff;
  it.name = q === "magic" ? magicName(BASE_BY_ID[it.baseId].name, rolled.names) : rareName(cat, r);
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
export function rollDrop(mlvl: number, mf: number, boss: boolean, r: Rng = Math.random, cls?: string): Item {
  let b = rollBase(r, cls);
  const ilvl = Math.max(1, mlvl + (boss ? 2 : 0));
  let q = rollQuality(mlvl, mf, boss, r);
  // v1.0: arrows are never magic; a magic/rare roll that lands on them picks another class, so the quality mix is unchanged
  for (let i = 0; i < 20 && q !== "normal" && !catHasAffixes(b.slot); i++) b = rollBase(r, cls);
  const it = makeItem(b.id, ilvl);
  if (q === "normal" && (b.slot === "ring" || b.slot === "amulet")) q = "magic";
  return enchant(it, q, r, cls);
}
export const catHasAffixes = (slot: string) => AFFIXES.some((a) => (a.cats as string[]).includes(slot));

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
      return sd && sd.cls !== "any" ? `+${m.v} to ${sd.name} (${CLASS_NAME[sd.cls]} Only)` : `+${m.v} to ${sd?.name ?? "a skill"}`;
    }
  }
}

// ------------------------------------------------------------------ v1.4 crafting (Brann the Runesmith)
/** v1.4: craft cost per affix count (0 → 1, 1 → 2, 2 → 3, 3 → 4): a base by item level times a steep step */
export const CRAFT_STEP = [1, 3, 8, 20];
export const craftCost = (ilvl: number, count: number) => Math.round(((50 + 20 * Math.max(1, ilvl)) * (CRAFT_STEP[count] ?? CRAFT_STEP[CRAFT_STEP.length - 1])) / 10) * 10;
/** v1.4: why an item can't take one more affix (null = it can) */
export function craftBlock(it: Item): string | null {
  const b = BASE_BY_ID[it.baseId];
  const cat = catOf(it.baseId);
  if (!b || b.potion) return "Potions can't be enchanted";
  if (!cat || !catHasAffixes(cat)) return `${b.name}s can't be enchanted`;
  const q = it.q ?? "normal";
  if (q !== "normal" && q !== "magic" && q !== "rare") return "Only normal, magic and rare items can be enchanted";
  if (affixCount(it) >= MAX_AFFIXES) return `This item already has ${MAX_AFFIXES} affixes, the most an item can hold`;
  if (!pool(cat, it.ilvl ?? 1, new Set((it.mods ?? []).map((m) => m.s))).length) return "No affix is left that can roll on this item at its level";
  return null;
}
/**
 * v1.4: add ONE random affix (same pool and rules as drops: item type, item level, no stat twice, +skill locks by item).
 * 1–2 affixes: magic (renamed from its affixes); 3–4: rare (a new rare name when it turns rare). Returns the new rows.
 */
export function craftAffix(it: Item, r: Rng = Math.random, cls?: string): { ok: boolean; why?: string; added: Mod[] } {
  const why = craftBlock(it);
  if (why) return { ok: false, why, added: [] };
  mergeDuplicateMods(it);
  const cat = catOf(it.baseId)!;
  const before = affixCount(it);
  const rolled = rollMore(cat, it.ilvl ?? 1, 1, it.mods ?? [], r, () => skillPoolFor(it.baseId, r, cls));
  if (!rolled.mods.length) return { ok: false, why: "No affix is left that can roll on this item at its level", added: [] };
  it.mods = [...(it.mods ?? []), ...rolled.mods];
  it.aff = [...(it.aff ?? []), ...rolled.aff];
  const n = before + 1;
  const wasRare = it.q === "rare";
  it.q = n >= 3 ? "rare" : "magic";
  if (it.q === "magic") it.name = magicName(BASE_BY_ID[it.baseId].name, it.aff.map((k) => tierNameOn(it, k) ?? "").filter(Boolean));
  else if (!wasRare || !it.name) it.name = rareName(cat, r);
  return { ok: true, added: rolled.mods };
}
