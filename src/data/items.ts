/** Normal (white) item bases, using Diablo II base values where possible. */
export type Slot = "weapon" | "shield" | "armor" | "helm" | "gloves" | "boots";
export type Kind = "sword" | "axe" | "mace" | "armor" | "helm" | "shield" | "gloves" | "boots";

export interface ItemBase {
  id: string;
  name: string;
  slot: Slot;
  kind: Kind;
  /** quality level: the lowest monster level that can drop it */
  qlvl: number;
  reqStr: number;
  reqDex: number;
  reqLvl: number;
  min?: number;
  max?: number;
  /** seconds per swing */
  speed?: number;
  speedLabel?: string;
  defMin?: number;
  defMax?: number;
}

const W = (
  id: string, name: string, kind: Kind, qlvl: number, min: number, max: number,
  reqStr: number, reqDex: number, speed: number,
): ItemBase => ({
  id, name, kind, slot: "weapon", qlvl, min, max, reqStr, reqDex, reqLvl: 0, speed,
  speedLabel: speed <= 0.46 ? "Fast" : speed <= 0.56 ? "Normal" : "Slow",
});
const A = (
  id: string, name: string, kind: Kind, slot: Slot, qlvl: number, defMin: number, defMax: number, reqStr: number,
): ItemBase => ({ id, name, kind, slot, qlvl, defMin, defMax, reqStr, reqDex: 0, reqLvl: 0 });

export const ITEM_BASES: ItemBase[] = [
  // Swords
  W("short_sword", "Short Sword", "sword", 1, 2, 7, 0, 0, 0.48),
  W("scimitar", "Scimitar", "sword", 5, 2, 6, 0, 21, 0.42),
  W("sabre", "Sabre", "sword", 8, 3, 8, 25, 25, 0.46),
  W("falchion", "Falchion", "sword", 11, 9, 17, 33, 0, 0.52),
  W("broad_sword", "Broad Sword", "sword", 15, 7, 14, 48, 0, 0.5),
  W("long_sword", "Long Sword", "sword", 20, 3, 19, 55, 39, 0.52),
  // Axes
  W("hand_axe", "Hand Axe", "axe", 1, 3, 6, 0, 0, 0.46),
  W("axe", "Axe", "axe", 7, 4, 11, 32, 0, 0.52),
  W("double_axe", "Double Axe", "axe", 13, 5, 13, 43, 0, 0.55),
  W("military_pick", "Military Pick", "axe", 19, 7, 11, 49, 33, 0.52),
  W("war_axe", "War Axe", "axe", 25, 10, 18, 67, 0, 0.56),
  // Maces
  W("club", "Club", "mace", 1, 1, 6, 0, 0, 0.5),
  W("spiked_club", "Spiked Club", "mace", 4, 5, 8, 0, 0, 0.5),
  W("mace", "Mace", "mace", 3, 3, 10, 27, 0, 0.52),
  W("morning_star", "Morning Star", "mace", 10, 7, 16, 36, 0, 0.52),
  W("flail", "Flail", "mace", 19, 1, 24, 41, 35, 0.58),
  // Body armor
  A("quilted_armor", "Quilted Armor", "armor", "armor", 1, 8, 11, 12),
  A("leather_armor", "Leather Armor", "armor", "armor", 3, 14, 17, 15),
  A("hard_leather", "Hard Leather Armor", "armor", "armor", 5, 21, 24, 20),
  A("studded_leather", "Studded Leather", "armor", "armor", 8, 32, 35, 27),
  A("ring_mail", "Ring Mail", "armor", "armor", 11, 45, 48, 36),
  A("scale_mail", "Scale Mail", "armor", "armor", 13, 57, 60, 44),
  A("chain_mail", "Chain Mail", "armor", "armor", 15, 72, 75, 48),
  // Helms
  A("cap", "Cap", "helm", "helm", 1, 3, 5, 0),
  A("skull_cap", "Skull Cap", "helm", "helm", 5, 8, 11, 15),
  A("helm", "Helm", "helm", "helm", 11, 15, 18, 26),
  A("full_helm", "Full Helm", "helm", "helm", 15, 23, 26, 41),
  // Shields
  A("buckler", "Buckler", "shield", "shield", 1, 4, 6, 12),
  A("small_shield", "Small Shield", "shield", "shield", 5, 8, 10, 22),
  A("large_shield", "Large Shield", "shield", "shield", 11, 12, 14, 34),
  // Gloves & boots
  A("leather_gloves", "Leather Gloves", "gloves", "gloves", 3, 2, 3, 0),
  A("heavy_gloves", "Heavy Gloves", "gloves", "gloves", 7, 5, 6, 0),
  A("boots", "Boots", "boots", "boots", 3, 2, 3, 0),
  A("heavy_boots", "Heavy Boots", "boots", "boots", 7, 5, 6, 18),
];

export const BASE_BY_ID: Record<string, ItemBase> = Object.fromEntries(ITEM_BASES.map((b) => [b.id, b]));

export interface Item {
  uid: number;
  baseId: string;
  /** rolled defense for armor pieces */
  def?: number;
}

let nextUid = Date.now() % 100000;
export function makeItem(baseId: string, roll = Math.random): Item {
  const b = BASE_BY_ID[baseId];
  const it: Item = { uid: nextUid++, baseId };
  if (b.defMin !== undefined && b.defMax !== undefined) {
    it.def = b.defMin + Math.floor(roll() * (b.defMax - b.defMin + 1));
  }
  return it;
}

/** Pick a random base that a monster of this level can drop. */
export function rollBase(mlvl: number, roll = Math.random): ItemBase {
  const pool = ITEM_BASES.filter((b) => b.qlvl <= mlvl + 1);
  // weight toward bases near the monster level, weapons a bit more common
  const weights = pool.map((b) => (b.slot === "weapon" ? 1.4 : 1) * (1 + b.qlvl / (mlvl + 2)));
  const total = weights.reduce((a, c) => a + c, 0);
  let r = roll() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export const SLOT_LABEL: Record<Slot, string> = {
  weapon: "Weapon",
  shield: "Shield",
  armor: "Armor",
  helm: "Helm",
  gloves: "Gloves",
  boots: "Boots",
};
