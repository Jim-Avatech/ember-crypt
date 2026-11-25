/**
 * Itemization (v0.3): one base per item class.
 *  - the class sets size, hands, attack speed, damage spread and how requirements grow
 *  - the item level sets the damage / defense numbers (and which art is used)
 *  - the rarity sets how many random affixes it has (normal 0, magic 1–2, rare 3–4)
 */
import { LOOK_BY_ID } from "./looks";

export type Slot = "weapon" | "shield" | "quiver" | "armor" | "helm" | "gloves" | "boots" | "belt" | "ring" | "amulet" | "potion";
export type Kind = "sword" | "axe" | "mace" | "knife" | "spear" | "staff" | "bow" | "quiver" | "armor" | "helm" | "shield" | "gloves" | "boots" | "belt" | "ring" | "amulet" | "potion";
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
  /** throwing weapon: stack size and throw range (tiles) */
  thrown?: { max: number; range: number };
  /** v1.0 bows: arrow range (tiles) */
  range?: number;
  /** v1.0 quiver: arrows in a full quiver (refilled free in camp) */
  ammo?: number;
  /** v1.0 melee reach bonus (tiles), e.g. spears */
  reach?: number;
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

/**
 * v1.0 drop weights: bows, a spear and arrows joined the pool. The weapon classes were scaled down so the
 * whole weapon share stays where it was (6.4 of ~12.5) and armor/jewelry keep their share; the drop chance
 * itself (ITEM_DROP) is separate and unchanged. The pool is the same for every class.
 */
export const ITEM_BASES: ItemBase[] = [
  { ...W("sword", "Sword", "sword", 1, 3, 0.46, [0.55, 1.45], 1.0, [10, 1.5], [8, 1.2]), weight: 0.85 },
  { ...W("axe", "Axe", "axe", 2, 3, 0.52, [0.4, 1.6], 1.15, [12, 2], undefined), weight: 0.85 },
  { ...W("mace", "Mace", "mace", 1, 3, 0.5, [0.8, 1.2], 1.05, [12, 1.8], undefined), weight: 0.85 },
  { ...W("great_sword", "Great Sword", "sword", 2, 4, 0.6, [0.5, 1.5], 1.9, [18, 2.3], [10, 1.2], 2), weight: 0.5 },
  // v0.6: a fast, steady two-hander (not in D2; uses Pole Arm Mastery)
  { ...W("quarterstaff", "Quarterstaff", "staff", 1, 4, 0.42, [0.85, 1.15], 1.45, [12, 1.6], [10, 1.4], 2), price: 60, weight: 0.4 },
  // v0.6: throwing weapons (stacks; thrown with the attack button, refilled in camp)
  { ...W("throwing_knife", "Throwing Knife", "knife", 1, 2, 0.4, [0.7, 1.3], 0.75, [0, 0.4], [12, 1.6]), thrown: { max: 160, range: 9 }, price: 35, weight: 0.35 },
  { ...W("throwing_axe", "Throwing Axe", "axe", 1, 2, 0.48, [0.55, 1.45], 0.9, [10, 1.2], [10, 1.2]), thrown: { max: 120, range: 8 }, price: 35, weight: 0.35 },
  { ...W("javelin", "Javelin", "spear", 1, 4, 0.54, [0.6, 1.4], 1.05, [8, 1], [14, 1.6]), thrown: { max: 100, range: 10 }, price: 40, weight: 0.35 },
  // v1.0: Amazon weapons (they drop for every class)
  { ...W("spear", "Spear", "spear", 2, 4, 0.56, [0.45, 1.55], 1.8, [14, 1.8], [12, 1.6], 2), reach: 0.55, price: 65, weight: 0.45 },
  { ...W("short_bow", "Short Bow", "bow", 2, 3, 0.42, [0.55, 1.45], 1.05, [0, 0.6], [14, 1.9], 2), range: 11, price: 55, weight: 0.45 },
  { ...W("long_bow", "Long Bow", "bow", 2, 4, 0.56, [0.5, 1.5], 1.55, [12, 1.2], [16, 2.1], 2), range: 12, price: 70, weight: 0.4 },
  { id: "arrows", name: "Arrows", slot: "quiver", kind: "quiver", w: 1, h: 3, ammo: 600, price: 20, weight: 0.25 },
  A("armor", "Armor", "armor", 2, 3, 1, [8, 1.6], 40, 1.1),
  A("helm", "Helm", "helm", 2, 2, 0.45, [0, 1.2], 30, 0.95),
  A("shield", "Shield", "shield", 2, 2, 0.6, [8, 1.5], 35, 0.95),
  A("gloves", "Gloves", "gloves", 2, 2, 0.25, undefined, 25, 0.75),
  A("boots", "Boots", "boots", 2, 2, 0.25, undefined, 25, 0.75),
  A("belt", "Belt", "belt", 2, 1, 0.2, undefined, 25, 0.65),
  A("ring", "Ring", "ring", 1, 1, 0, undefined, 120, 0.35),
  A("amulet", "Amulet", "amulet", 1, 1, 0, undefined, 160, 0.25),
  { id: "hp_potion", name: "Healing Potion", slot: "potion", kind: "potion", w: 1, h: 1, potion: "hp", price: 25, weight: 0 },
  { id: "mp_potion", name: "Mana Potion", slot: "potion", kind: "potion", w: 1, h: 1, potion: "mp", price: 30, weight: 0 },
];
/** What each class is for (shown in the Item Guide). */
export const CLASS_USE: Record<string, string> = {
  sword: "Fast and balanced. Good all-rounder; the only one-hander with a Dexterity requirement.",
  axe: "Big swings: the widest damage spread and highest one-hand average. Normal speed.",
  mace: "Steady: tight damage spread, so every hit lands close to the average.",
  great_sword: "Two-handed. Slow, very high damage; takes both hands (no shield or second weapon).",
  quarterstaff: "Two-handed, fast and steady: tight damage spread at the quickest swing of any weapon. Uses Pole Arm Mastery (not in Diablo II).",
  throwing_knife: "Thrown with the attack button (stack of 40). Fastest throw, lowest damage. Throwing Mastery; Dex-heavy. Refilled free in camp.",
  throwing_axe: "Thrown (stack of 30). Swingy damage. Throwing Mastery when thrown, Axe Mastery in melee. Refilled free in camp.",
  javelin: "Thrown (stack of 100) or used to stab in melee: pick Throw or Stab as your basic attack. Throwing Mastery when thrown, Spear Mastery in melee. Amazon javelin skills use it.",
  spear: "Two-handed reach weapon: stabs from further away than any other melee weapon. Spear Mastery; Amazon spear skills use it.",
  short_bow: "Two-handed bow, the faster of the two. Shoots arrows from a quiver in the off-hand (Shoot basic attack). Damage grows with Dexterity.",
  long_bow: "Two-handed bow: slower, more damage and range than the Short Bow. Needs a quiver of arrows. Damage grows with Dexterity.",
  arrows: "A quiver of 600 arrows for the off-hand. Bows need it to shoot. Refilled free in camp.",
  armor: "Most defense of any slot.",
  helm: "Defense. Can roll +skills, mana and magic find.",
  shield: "Off-hand defense for one-handed fighters. Can roll all resistances.",
  gloves: "Light defense. Attack rating, attack speed and leech rolls.",
  boots: "Light defense. The place for Faster Run/Walk.",
  belt: "Holds more potions of each kind as its level rises (+1 per 6 levels, max +4).",
  ring: "No defense; always magic or rare. Two ring slots.",
  amulet: "No defense; always magic or rare. Can roll +skills.",
  hp_potion: "Restores 45% life over a few seconds. Fills belt slots automatically.",
  mp_potion: "Restores 60% mana over a few seconds.",
};

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
  /** throwing weapons: how many are left in the stack */
  qty?: number;
  /** v0.2 field, no longer used */
  def?: number;
}

let nextUid = (Date.now() % 1000000) * 10;
export const newUid = () => nextUid++;

export function makeItem(baseId: string, ilvl = 1): Item {
  const it: Item = { uid: nextUid++, baseId };
  if (!BASE_BY_ID[baseId].potion) it.ilvl = Math.max(1, Math.round(ilvl));
  const t = BASE_BY_ID[baseId].thrown?.max ?? BASE_BY_ID[baseId].ammo;
  if (t) it.qty = t;
  return it;
}

export const ilvlOf = (it: Item) => it.ilvl ?? 1;
/** Stack size of a throwing weapon (0 for everything else). */
export const qtyMax = (it: Item | undefined | null) => (it ? BASE_BY_ID[it.baseId]?.thrown?.max ?? BASE_BY_ID[it.baseId]?.ammo ?? 0 : 0);
export const isThrowing = (it: Item | undefined | null) => !!it && !!BASE_BY_ID[it.baseId]?.thrown;
/** v1.0 */
export const isBow = (it: Item | undefined | null) => !!it && BASE_BY_ID[it.baseId]?.kind === "bow";
export const isQuiver = (it: Item | undefined | null) => !!it && BASE_BY_ID[it.baseId]?.slot === "quiver";
/** Javelins and spears (Amazon spear skills). */
export const isSpearLike = (it: Item | undefined | null) => !!it && BASE_BY_ID[it.baseId]?.kind === "spear";
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
  // v0.8: requirements climb 35% faster with item level, so stat points matter
  const r = (p?: [number, number]) => (p ? Math.round(p[0] + p[1] * L * 1.35) : 0);
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
    case "long_bow": return pick([[11, "long_bow"], [99, "long_battle_bow"]]);
    case "short_bow": return pick([[11, "short_bow"], [99, "short_battle_bow"]]);
    case "spear": return pick([[11, "spear"], [99, "pike"]]);
    case "arrows":
    case "quarterstaff":
    case "throwing_knife":
    case "throwing_axe":
    case "javelin": return it.baseId;
    default: return LOOK_BY_ID[it.baseId] ? it.baseId : undefined;
  }
}

export const SLOT_LABEL: Record<Slot, string> = {
  weapon: "Weapon", shield: "Shield", quiver: "Quiver", armor: "Body Armor", helm: "Helm", gloves: "Gloves", boots: "Boots",
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
/** v1.0: does the main-hand item keep this off-hand item out? (Bows take both hands but leave room for a quiver.) */
export function offBlocked(main: Item | undefined | null, off: Item | undefined | null) {
  if (!isTwoHanded(main)) return false;
  return !(isBow(main) && (!off || isQuiver(off)));
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
    : old.kind === "bow" ? (old.h >= 4 ? "long_bow" : "short_bow")
    : old.kind === "quiver" ? "arrows"
    : old.kind === "spear" ? (old.hands === 2 ? "spear" : "javelin")
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
