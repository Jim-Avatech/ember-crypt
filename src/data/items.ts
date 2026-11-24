/**
 * Itemization (v0.3): one base per item class.
 *  - the class sets size, hands, attack speed, damage spread and how requirements grow
 *  - the item level sets the damage / defense numbers (and which art is used)
 *  - the rarity sets how many random affixes it has (normal 0, magic 1–2, rare 3–6)
 */
import { LOOK_BY_ID } from "./looks";

export type Slot = "weapon" | "shield" | "armor" | "helm" | "gloves" | "boots" | "belt" | "ring" | "amulet" | "potion";
export type Kind = "sword" | "axe" | "mace" | "armor" | "helm" | "shield" | "gloves" | "boots" | "belt" | "ring" | "amulet" | "potion";
export type EquipSlot = "head" | "chest" | "gloves" | "boots" | "belt" | "ring1" | "ring2" | "amulet" | "main" | "off";
export type Quality = "normal" | "magic" | "rare";

export type StatKey =
  | "edmg" | "mindmg" | "maxdmg" | "ar" | "str" | "dex" | "vit" | "ene" | "life" | "mana" | "ll" | "ml"
  | "frw" | "ias" | "fres" | "cres" | "lres" | "pres" | "ares" | "edef" | "def" | "gf" | "mf" | "skill";

export interface Mod {
  s: StatKey;
  v: number;
  /** skill id for "+N to <skill>" */
  sk?: string;
}

export interface ItemBase {
  id: string;
  name: string;
  slot: Slot;
  kind: Kind;
  w: number;
  h: number;
  hands?: 1 | 2;
  /** seconds per swing */
  speed?: number;
  speedLabel?: string;
  /** min and max damage as a fraction of the level's average */
  spread?: [number, number];
  dmgMul?: number;
  defMul?: number;
  /** requirement = a + b × item level */
  str?: [number, number];
  dex?: [number, number];
  potion?: "hp" | "mp";
  /** price of a level-1 normal one */
  price: number;
  /** relative drop weight */
  weight: number;
}

const speedLabel = (s: number) => (s <= 0.46 ? "Fast" : s <= 0.53 ? "Normal" : "Slow");
const W = (id: string, name: string, kind: Kind, w: number, h: number, speed: number, spread: [number, number], dmgMul: number, str: [number, number], dex: [number, number] | undefined, hands: 1 | 2 = 1): ItemBase => ({
  id, name, kind, slot: "weapon", w, h, hands, speed, speedLabel: speedLabel(speed), spread, dmgMul, str, dex, price: hands === 2 ? 70 : 45, weight: hands === 2 ? 0.7 : 1.2,
});
const A = (id: string, name: string, kind: Kind, w: number, h: number, defMul: number, str: [number, number] | undefined, price: number, weight = 1): ItemBase => ({
  id, name, kind, slot: kind as Slot, w, h, defMul, str, price, weight,
});

export const ITEM_BASES: ItemBase[] = [
  W("sword", "Sword", "sword", 1, 3, 0.46, [0.55, 1.45], 1.0, [10, 1.5], [8, 1.2]),
  W("axe", "Axe", "axe", 2, 3, 0.52, [0.4, 1.6], 1.15, [12, 2], undefined),
  W("mace", "Mace", "mace", 1, 3, 0.5, [0.8, 1.2], 1.05, [12, 1.8], undefined),
  W("great_sword", "Great Sword", "sword", 2, 4, 0.6, [0.5, 1.5], 1.9, [18, 2.3], [10, 1.2], 2),
  A("armor", "Armor", "armor", 2, 3, 1, [8, 1.6], 40, 1.2),
  A("helm", "Helm", "helm", 2, 2, 0.45, [0, 1.2], 30),
  A("shield", "Shield", "shield", 2, 2, 0.6, [8, 1.5], 35),
  A("gloves", "Gloves", "gloves", 2, 2, 0.25, undefined, 25, 0.8),
  A("boots", "Boots", "boots", 2, 2, 0.25, undefined, 25, 0.8),
  A("belt", "Belt", "belt", 2, 1, 0.2, undefined, 25, 0.7),
  A("ring", "Ring", "ring", 1, 1, 0, undefined, 120, 0.35),
  A("amulet", "Amulet", "amulet", 1, 1, 0, undefined, 160, 0.25),
  { id: "hp_potion", name: "Healing Potion", slot: "potion", kind: "potion", w: 1, h: 1, potion: "hp", price: 25, weight: 0 },
  { id: "mp_potion", name: "Mana Potion", slot: "potion", kind: "potion", w: 1, h: 1, potion: "mp", price: 30, weight: 0 },
];
export const BASE_BY_ID: Record<string, ItemBase> = Object.fromEntries(ITEM_BASES.map((b) => [b.id, b]));

export interface Item {
  uid: number;
  /** item class id */
  baseId: string;
  /** item level: sets base damage/defense and which affix tiers can roll */
  ilvl?: number;
  q?: Quality;
  /** magic: full name; rare: the two-word name */
  name?: string;
  mods?: Mod[];
  /** affix ids (one per group), for tooltips and tests */
  aff?: string[];
  /** v0.2 field, no longer used */
  def?: number;
}

let nextUid = (Date.now() % 1000000) * 10;
export const newUid = () => nextUid++;

export function makeItem(baseId: string, ilvl = 1): Item {
  const it: Item = { uid: nextUid++, baseId };
  if (!BASE_BY_ID[baseId].potion) it.ilvl = Math.max(1, Math.round(ilvl));
  return it;
}

export const ilvlOf = (it: Item) => it.ilvl ?? 1;
export const qualityOf = (it: Item): Quality => it.q ?? "normal";
export const modTotal = (it: Item | undefined | null, s: StatKey) => (it?.mods ?? []).reduce((a, m) => (m.s === s ? a + m.v : a), 0);

/** Base (white) weapon damage for a class at an item level. */
export function baseDamage(b: ItemBase, ilvl: number): [number, number] {
  const avg = (3 + 1.15 * ilvl) * (b.dmgMul ?? 1);
  const [lo, hi] = b.spread ?? [0.6, 1.4];
  const min = Math.max(1, Math.round(avg * lo));
  return [min, Math.max(min + 1, Math.round(avg * hi))];
}

/** Weapon damage after the item's own +damage% and +min/+max mods. */
export function itemDamage(it: Item): [number, number] {
  const b = BASE_BY_ID[it.baseId];
  const [mn, mx] = baseDamage(b, ilvlOf(it));
  const ed = 1 + modTotal(it, "edmg") / 100;
  const min = Math.floor(mn * ed) + modTotal(it, "mindmg");
  return [min, Math.max(min + 1, Math.floor(mx * ed) + modTotal(it, "maxdmg"))];
}

export function baseDefense(b: ItemBase, ilvl: number): number {
  return b.defMul ? Math.max(1, Math.round((5 + 3.2 * ilvl) * b.defMul)) : 0;
}

/** Defense after the item's own +defense% and +defense mods. */
export function itemDefense(it: Item): number {
  const b = BASE_BY_ID[it.baseId];
  const d = baseDefense(b, ilvlOf(it));
  if (!d) return 0;
  return Math.floor(d * (1 + modTotal(it, "edef") / 100)) + modTotal(it, "def");
}

export const beltSlotsOf = (it: Item) => Math.min(4, 1 + Math.floor((ilvlOf(it) - 1) / 6));

export interface Reqs {
  str: number;
  dex: number;
  lvl: number;
}
export function itemReqs(it: Item): Reqs {
  const b = BASE_BY_ID[it.baseId];
  const L = ilvlOf(it);
  const r = (p?: [number, number]) => (p ? Math.round(p[0] + p[1] * L) : 0);
  const q = qualityOf(it);
  return { str: r(b.str), dex: r(b.dex), lvl: q === "normal" || b.potion ? 0 : Math.max(1, Math.floor(L * 0.75)) };
}

export function itemPrice(it: Item): number {
  const b = BASE_BY_ID[it.baseId];
  if (b.potion) return b.price;
  const L = ilvlOf(it);
  const q = qualityOf(it);
  const n = it.mods?.length ?? 0;
  const mul = q === "rare" ? 4 + n * 0.5 : q === "magic" ? 2 + n * 0.5 : 1;
  return Math.round(b.price * (1 + 0.3 * L) * mul);
}
export const sellPrice = (it: Item) => Math.max(1, Math.floor(itemPrice(it) / 4));

/** Display name. Rare items also show the class name under it. */
export function itemName(it: Item): string {
  return it.name ?? BASE_BY_ID[it.baseId].name;
}

export const QUALITY_COLOR: Record<Quality, string> = { normal: "#ffffff", magic: "#7a7aff", rare: "#ffff64" };
export const QUALITY_LABEL: Record<Quality, string> = { normal: "Normal", magic: "Magic", rare: "Rare" };

/** Pick a random item class for a drop. */
export function rollBase(roll = Math.random): ItemBase {
  const pool = ITEM_BASES.filter((b) => b.weight > 0);
  const total = pool.reduce((a, b) => a + b.weight, 0);
  let r = roll() * total;
  for (const b of pool) {
    r -= b.weight;
    if (r <= 0) return b;
  }
  return pool[pool.length - 1];
}

/** Which D2 art to draw for an item (by class and level). */
export function lookOf(it: Item | undefined | null): string | undefined {
  if (!it) return undefined;
  const L = ilvlOf(it);
  const pick = (steps: [number, string][]) => steps.find(([max]) => L <= max)?.[1] ?? steps[steps.length - 1][1];
  switch (it.baseId) {
    case "sword": return pick([[4, "short_sword"], [9, "scimitar"], [15, "sabre"], [99, "falchion"]]);
    case "axe": return pick([[6, "axe"], [12, "double_axe"], [99, "war_axe"]]);
    case "mace": return pick([[3, "club"], [7, "spiked_club"], [12, "mace"], [99, "morning_star"]]);
    case "great_sword": return pick([[12, "two_handed_sword"], [99, "claymore"]]);
    case "armor": return pick([[2, "quilted_armor"], [4, "leather_armor"], [7, "hard_leather"], [10, "studded_leather"], [13, "ring_mail"], [16, "scale_mail"], [99, "chain_mail"]]);
    case "helm": return pick([[4, "cap"], [9, "skull_cap"], [14, "helm"], [99, "full_helm"]]);
    case "shield": return pick([[4, "buckler"], [9, "small_shield"], [14, "large_shield"], [99, "kite_shield"]]);
    case "gloves": return pick([[6, "leather_gloves"], [11, "heavy_gloves"], [99, "chain_gloves"]]);
    case "boots": return pick([[6, "boots"], [11, "heavy_boots"], [99, "chain_boots"]]);
    case "belt": return pick([[5, "sash"], [11, "light_belt"], [17, "belt"], [99, "heavy_belt"]]);
    case "ring": return ["copper_ring", "silver_ring", "gold_ring"][it.uid % 3];
    case "amulet": return ["bone_amulet", "jade_amulet"][it.uid % 2];
    default: return LOOK_BY_ID[it.baseId] ? it.baseId : undefined;
  }
}

export const SLOT_LABEL: Record<Slot, string> = {
  weapon: "Weapon", shield: "Shield", armor: "Body Armor", helm: "Helm", gloves: "Gloves", boots: "Boots",
  belt: "Belt", ring: "Ring", amulet: "Amulet", potion: "Potion",
};

export const EQUIP_LABEL: Record<EquipSlot, string> = {
  head: "Head", chest: "Chest", gloves: "Gloves", boots: "Boots", belt: "Belt", ring1: "Ring", ring2: "Ring",
  amulet: "Amulet", main: "Main hand", off: "Off-hand",
};

/** Equipment slot sizes, in grid units, for the paper doll. */
export const EQUIP_SIZE: Record<EquipSlot, [number, number]> = {
  head: [2, 2], chest: [2, 3], gloves: [2, 2], boots: [2, 2], belt: [2, 1], ring1: [1, 1], ring2: [1, 1],
  amulet: [1, 1], main: [2, 4], off: [2, 4],
};

export function isTwoHanded(it: Item | undefined | null) {
  return !!it && BASE_BY_ID[it.baseId]?.hands === 2;
}

/** Convert a v0.1/v0.2 item (a D2 base like "war_axe") to the class system. */
export function migrateItem(raw: Item): Item | null {
  if (BASE_BY_ID[raw.baseId]) return raw;
  const old = LOOK_BY_ID[raw.baseId];
  if (!old) return null;
  const cls =
    old.kind === "sword" ? (old.hands === 2 ? "great_sword" : "sword")
    : old.kind === "axe" ? "axe"
    : old.kind === "mace" ? "mace"
    : old.kind;
  const it: Item = { uid: raw.uid, baseId: cls };
  if (!BASE_BY_ID[cls].potion) it.ilvl = Math.max(1, old.qlvl);
  // old plain jewelry had a fixed bonus: keep it as a magic item
  if (old.bonus) {
    it.q = "magic";
    it.name = old.name;
    it.mods = [];
    if (old.bonus.ar) it.mods.push({ s: "ar", v: old.bonus.ar });
    if (old.bonus.life) it.mods.push({ s: "life", v: old.bonus.life });
    if (old.bonus.mana) it.mods.push({ s: "mana", v: old.bonus.mana });
  }
  return it;
}
