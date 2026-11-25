/**
 * The v0.1/v0.2 Diablo II base items. Since v0.3 these are art only: each item class picks one of
 * these looks by item level (a level-14 Armor is drawn as Scale Mail), and old saves use this table
 * to convert their items to the new classes.
 */
import type { Kind, Slot } from "./items";

export interface LookBase {
  id: string;
  name: string;
  slot: Slot;
  kind: Kind;
  /** quality level: the lowest monster level that can drop it */
  qlvl: number;
  reqStr: number;
  reqDex: number;
  reqLvl: number;
  /** inventory grid size */
  w: number;
  h: number;
  hands?: 1 | 2;
  min?: number;
  max?: number;
  /** seconds per swing */
  speed?: number;
  speedLabel?: string;
  defMin?: number;
  defMax?: number;
  /** extra potions of each type the belt holds */
  beltSlots?: number;
  bonus?: { ar?: number; life?: number; mana?: number };
  potion?: "hp" | "mp";
  /** vendor buy price */
  price: number;
  /** relative drop weight */
  weight: number;
}

const speedLabel = (s: number) => (s <= 0.46 ? "Fast" : s <= 0.56 ? "Normal" : "Slow");

const W = (
  id: string, name: string, kind: Kind, qlvl: number, min: number, max: number,
  reqStr: number, reqDex: number, speed: number, w: number, h: number, hands: 1 | 2 = 1,
): LookBase => ({
  id, name, kind, slot: "weapon", qlvl, min, max, reqStr, reqDex, reqLvl: 0, speed, speedLabel: speedLabel(speed),
  w, h, hands, price: Math.round(40 + qlvl * 22 + max * 6 + (hands === 2 ? 40 : 0)), weight: 1.4,
});
const A = (
  id: string, name: string, kind: Kind, slot: Slot, qlvl: number, defMin: number, defMax: number, reqStr: number,
  w: number, h: number, extra: Partial<LookBase> = {},
): LookBase => ({
  id, name, kind, slot, qlvl, defMin, defMax, reqStr, reqDex: 0, reqLvl: 0, w, h,
  price: Math.round(25 + qlvl * 24 + defMax * 4), weight: 1, ...extra,
});
const J = (id: string, name: string, kind: Kind, qlvl: number, bonus: LookBase["bonus"], price: number): LookBase => ({
  id, name, kind, slot: kind as Slot, qlvl, reqStr: 0, reqDex: 0, reqLvl: Math.max(0, qlvl - 2), w: 1, h: 1, bonus, price, weight: 0.25,
});

export const LOOK_BASES: LookBase[] = [
  // v0.6 classes (art for the new item classes)
  W("quarterstaff", "Quarterstaff", "staff", 1, 7, 9, 12, 10, 0.42, 1, 4, 2),
  W("throwing_knife", "Throwing Knife", "knife", 1, 2, 4, 0, 12, 0.4, 1, 2),
  W("throwing_axe", "Throwing Axe", "axe", 1, 3, 5, 10, 10, 0.48, 1, 2),
  W("javelin", "Javelin", "spear", 1, 4, 7, 8, 14, 0.54, 1, 4),
  // v1.0 classes (art only)
  W("spear", "Spear", "spear", 1, 3, 15, 38, 25, 0.56, 2, 4, 2),
  W("pike", "Pike", "spear", 12, 14, 63, 60, 45, 0.6, 2, 4, 2),
  W("short_bow", "Short Bow", "bow", 1, 1, 4, 0, 15, 0.42, 2, 3, 2),
  W("short_battle_bow", "Short Battle Bow", "bow", 12, 5, 11, 40, 50, 0.44, 2, 3, 2),
  W("long_bow", "Long Bow", "bow", 1, 3, 10, 22, 19, 0.56, 2, 4, 2),
  W("long_battle_bow", "Long Battle Bow", "bow", 12, 3, 18, 40, 50, 0.56, 2, 4, 2),
  { id: "arrows", name: "Arrows", slot: "quiver", kind: "quiver", qlvl: 1, reqStr: 0, reqDex: 0, reqLvl: 0, w: 1, h: 3, price: 20, weight: 0 },
  // Swords
  W("short_sword", "Short Sword", "sword", 1, 2, 7, 0, 0, 0.48, 1, 3),
  W("scimitar", "Scimitar", "sword", 5, 2, 6, 0, 21, 0.42, 1, 3),
  W("sabre", "Sabre", "sword", 8, 3, 8, 25, 25, 0.46, 1, 3),
  W("falchion", "Falchion", "sword", 11, 9, 17, 33, 0, 0.52, 1, 3),
  W("broad_sword", "Broad Sword", "sword", 15, 7, 14, 48, 0, 0.5, 2, 3),
  W("long_sword", "Long Sword", "sword", 20, 3, 19, 55, 39, 0.52, 2, 3),
  W("two_handed_sword", "Two-Handed Sword", "sword", 10, 8, 17, 35, 27, 0.6, 2, 4, 2),
  W("claymore", "Claymore", "sword", 17, 13, 30, 47, 0, 0.58, 2, 4, 2),
  // Axes
  W("hand_axe", "Hand Axe", "axe", 1, 3, 6, 0, 0, 0.46, 1, 3),
  W("axe", "Axe", "axe", 7, 4, 11, 32, 0, 0.52, 2, 3),
  W("double_axe", "Double Axe", "axe", 13, 5, 13, 43, 0, 0.55, 2, 3),
  W("military_pick", "Military Pick", "axe", 19, 7, 11, 49, 33, 0.52, 2, 3),
  W("war_axe", "War Axe", "axe", 25, 10, 18, 67, 0, 0.56, 2, 3),
  W("large_axe", "Large Axe", "axe", 6, 6, 13, 35, 0, 0.6, 2, 3, 2),
  W("broad_axe", "Broad Axe", "axe", 12, 10, 18, 48, 0, 0.6, 2, 3, 2),
  W("battle_axe", "Battle Axe", "axe", 17, 12, 32, 54, 0, 0.62, 2, 3, 2),
  // Maces
  W("club", "Club", "mace", 1, 1, 6, 0, 0, 0.5, 1, 3),
  W("spiked_club", "Spiked Club", "mace", 4, 5, 8, 0, 0, 0.5, 1, 3),
  W("mace", "Mace", "mace", 3, 3, 10, 27, 0, 0.52, 1, 3),
  W("morning_star", "Morning Star", "mace", 10, 7, 16, 36, 0, 0.52, 1, 3),
  W("flail", "Flail", "mace", 19, 1, 24, 41, 35, 0.58, 2, 3),
  W("maul", "Maul", "mace", 21, 6, 21, 69, 0, 0.66, 2, 4, 2),
  // Body armor
  A("quilted_armor", "Quilted Armor", "armor", "armor", 1, 8, 11, 12, 2, 3),
  A("leather_armor", "Leather Armor", "armor", "armor", 3, 14, 17, 15, 2, 3),
  A("hard_leather", "Hard Leather Armor", "armor", "armor", 5, 21, 24, 20, 2, 3),
  A("studded_leather", "Studded Leather", "armor", "armor", 8, 32, 35, 27, 2, 3),
  A("ring_mail", "Ring Mail", "armor", "armor", 11, 45, 48, 36, 2, 3),
  A("scale_mail", "Scale Mail", "armor", "armor", 13, 57, 60, 44, 2, 3),
  A("chain_mail", "Chain Mail", "armor", "armor", 15, 72, 75, 48, 2, 3),
  // Helms
  A("cap", "Cap", "helm", "helm", 1, 3, 5, 0, 2, 2),
  A("skull_cap", "Skull Cap", "helm", "helm", 5, 8, 11, 15, 2, 2),
  A("helm", "Helm", "helm", "helm", 11, 15, 18, 26, 2, 2),
  A("full_helm", "Full Helm", "helm", "helm", 15, 23, 26, 41, 2, 2),
  // Shields
  A("buckler", "Buckler", "shield", "shield", 1, 4, 6, 12, 2, 2),
  A("small_shield", "Small Shield", "shield", "shield", 5, 8, 10, 22, 2, 2),
  A("large_shield", "Large Shield", "shield", "shield", 11, 12, 14, 34, 2, 3),
  A("kite_shield", "Kite Shield", "shield", "shield", 15, 16, 18, 47, 2, 3),
  // Gloves, boots, belts
  A("leather_gloves", "Leather Gloves", "gloves", "gloves", 3, 2, 3, 0, 2, 2),
  A("heavy_gloves", "Heavy Gloves", "gloves", "gloves", 7, 5, 6, 0, 2, 2),
  A("chain_gloves", "Chain Gloves", "gloves", "gloves", 12, 8, 9, 25, 2, 2),
  A("boots", "Boots", "boots", "boots", 3, 2, 3, 0, 2, 2),
  A("heavy_boots", "Heavy Boots", "boots", "boots", 7, 5, 6, 18, 2, 2),
  A("chain_boots", "Chain Boots", "boots", "boots", 12, 8, 9, 30, 2, 2),
  A("sash", "Sash", "belt", "belt", 1, 2, 2, 0, 2, 1, { beltSlots: 1 }),
  A("light_belt", "Light Belt", "belt", "belt", 6, 3, 3, 0, 2, 1, { beltSlots: 2 }),
  A("belt", "Belt", "belt", "belt", 12, 5, 5, 25, 2, 1, { beltSlots: 3 }),
  A("heavy_belt", "Heavy Belt", "belt", "belt", 18, 6, 6, 45, 2, 1, { beltSlots: 4 }),
  // Rings and amulets: plain "normal" pieces with a small fixed bonus (D2 has no white jewelry; this is a v0.2 stand-in)
  J("copper_ring", "Copper Ring", "ring", 1, { ar: 15 }, 180),
  J("silver_ring", "Silver Ring", "ring", 8, { mana: 8 }, 300),
  J("gold_ring", "Gold Ring", "ring", 16, { life: 12 }, 450),
  J("bone_amulet", "Bone Amulet", "amulet", 3, { life: 8 }, 260),
  J("jade_amulet", "Jade Amulet", "amulet", 12, { mana: 10, ar: 20 }, 420),
  // Potions
  { id: "hp_potion", name: "Healing Potion", slot: "potion", kind: "potion", qlvl: 1, reqStr: 0, reqDex: 0, reqLvl: 0, w: 1, h: 1, potion: "hp", price: 25, weight: 0 },
  { id: "mp_potion", name: "Mana Potion", slot: "potion", kind: "potion", qlvl: 1, reqStr: 0, reqDex: 0, reqLvl: 0, w: 1, h: 1, potion: "mp", price: 30, weight: 0 },
];

export const LOOK_BY_ID: Record<string, LookBase> = Object.fromEntries(LOOK_BASES.map((b) => [b.id, b]));
