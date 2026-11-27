import { BASE_BY_ID, type Item } from "./data/items";

/** Backpack: 10×8 (v0.7, was 10×4; old positions stay valid since the grid only grew downward). */
export const GRID_W = 10;
export const GRID_H = 8;
/** Camp stash: 10×10. */
export const STASH_W = 10;
export const STASH_H = 10;

export interface BagEntry {
  item: Item;
  x: number;
  y: number;
}

export const sizeOf = (it: Item) => {
  const b = BASE_BY_ID[it.baseId];
  return { w: b.w, h: b.h };
};

/** Does a w×h item fit at (x,y), ignoring the item with uid `ignore`? */
export function fits(bag: BagEntry[], w: number, h: number, x: number, y: number, ignore = -1, gw = GRID_W, gh = GRID_H): boolean {
  if (x < 0 || y < 0 || x + w > gw || y + h > gh) return false;
  for (const e of bag) {
    if (e.item.uid === ignore) continue;
    const s = sizeOf(e.item);
    if (x < e.x + s.w && x + w > e.x && y < e.y + s.h && y + h > e.y) return false;
  }
  return true;
}

/** Items overlapping a w×h rectangle at (x,y). */
export function overlapping(bag: BagEntry[], w: number, h: number, x: number, y: number, ignore = -1): BagEntry[] {
  return bag.filter((e) => {
    if (e.item.uid === ignore) return false;
    const s = sizeOf(e.item);
    return x < e.x + s.w && x + w > e.x && y < e.y + s.h && y + h > e.y;
  });
}

/** First free spot, scanning columns left to right like Diablo II. */
export function findSpot(bag: BagEntry[], w: number, h: number, gw = GRID_W, gh = GRID_H): { x: number; y: number } | null {
  for (let x = 0; x + w <= gw; x++) for (let y = 0; y + h <= gh; y++) if (fits(bag, w, h, x, y, -1, gw, gh)) return { x, y };
  return null;
}

export function occupantAt(bag: BagEntry[], cx: number, cy: number): BagEntry | null {
  for (const e of bag) {
    const s = sizeOf(e.item);
    if (cx >= e.x && cx < e.x + s.w && cy >= e.y && cy < e.y + s.h) return e;
  }
  return null;
}

/** Add an item at the first free spot. Returns false if there's no room. */
export function addItem(bag: BagEntry[], it: Item, gw = GRID_W, gh = GRID_H): boolean {
  const s = sizeOf(it);
  const spot = findSpot(bag, s.w, s.h, gw, gh);
  if (!spot) return false;
  bag.push({ item: it, ...spot });
  return true;
}

/**
 * Move an item already in the bag so its top-left is at (x,y).
 * If it overlaps exactly one other item, the two trade places when the other fits somewhere.
 */
export function moveItem(bag: BagEntry[], uid: number, x: number, y: number, gw = GRID_W, gh = GRID_H): boolean {
  const e = bag.find((q) => q.item.uid === uid);
  if (!e) return false;
  const s = sizeOf(e.item);
  if (x < 0 || y < 0 || x + s.w > gw || y + s.h > gh) return false;
  if (fits(bag, s.w, s.h, x, y, uid, gw, gh)) {
    e.x = x;
    e.y = y;
    return true;
  }
  const over = overlapping(bag, s.w, s.h, x, y, uid);
  if (over.length !== 1) return false;
  const other = over[0];
  const os = sizeOf(other.item);
  const ox = e.x;
  const oy = e.y;
  // tentatively place the moved item, then find the other a home (prefer the moved item's old corner)
  const rest = bag.filter((q) => q !== e && q !== other);
  const placed = [...rest, { item: e.item, x, y }];
  let spot: { x: number; y: number } | null = fits(placed, os.w, os.h, ox, oy, -1, gw, gh) ? { x: ox, y: oy } : null;
  if (!spot) spot = findSpot(placed, os.w, os.h, gw, gh);
  if (!spot) return false;
  e.x = x;
  e.y = y;
  other.x = spot.x;
  other.y = spot.y;
  return true;
}

// ------------------------------------------------------------------ v1.6.3 potion stacks
/** Healing and mana potions stack in the backpack and stash, up to this many in one cell. */
export const POT_STACK = 20;
export const isPotion = (it: Item | undefined | null) => !!it && !!BASE_BY_ID[it.baseId]?.potion;
/** Potions in one stack (old saves: a potion without qty is one potion). */
export const potQty = (it: Item) => (isPotion(it) ? Math.max(1, Math.floor(it.qty ?? 1)) : 1);

/**
 * Merge loose potions of the same kind into full stacks (first ones in D2 column order keep their cell; emptied
 * cells are freed). Never loses a potion: the total per kind is unchanged. Returns true if anything changed.
 */
export function stackPotions(list: BagEntry[]): boolean {
  let changed = false;
  for (const kind of ["hp_potion", "mp_potion"]) {
    const es = list.filter((e) => e.item.baseId === kind).sort((a, b) => a.x - b.x || a.y - b.y);
    if (!es.length) continue;
    let total = 0;
    for (const e of es) total += potQty(e.item);
    const need = Math.ceil(total / POT_STACK);
    for (let i = 0; i < es.length; i++) {
      const want = i < need ? Math.min(POT_STACK, total - i * POT_STACK) : 0;
      if (want <= 0) {
        list.splice(list.indexOf(es[i]), 1);
        changed = true;
      } else if (es[i].item.qty !== want && !(want === 1 && es[i].item.qty === undefined)) {
        es[i].item.qty = want;
        changed = true;
      }
    }
  }
  return changed;
}

/** Take one potion out of a stack entry (the entry goes when it was the last one). */
export function takeOnePotion(list: BagEntry[], e: BagEntry) {
  const n = potQty(e.item);
  if (n > 1) e.item.qty = n - 1;
  else list.splice(list.indexOf(e), 1);
}

/** Put n potions of baseId into the list: topping up existing stacks, then new cells. Returns how many didn't fit. */
export function addPotions(list: BagEntry[], baseId: string, n: number, make: (baseId: string) => Item, gw = GRID_W, gh = GRID_H): number {
  for (const e of list) {
    if (n <= 0) break;
    if (e.item.baseId !== baseId) continue;
    const room = POT_STACK - potQty(e.item);
    if (room <= 0) continue;
    const k = Math.min(room, n);
    e.item.qty = potQty(e.item) + k;
    n -= k;
  }
  while (n > 0) {
    const spot = findSpot(list, 1, 1, gw, gh);
    if (!spot) break;
    const it = make(baseId);
    const k = Math.min(POT_STACK, n);
    it.qty = k;
    list.push({ item: it, ...spot });
    n -= k;
  }
  return n;
}
