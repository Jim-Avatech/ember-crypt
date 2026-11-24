import { BASE_BY_ID, type Item } from "./data/items";

export const GRID_W = 10;
export const GRID_H = 4;

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
export function moveItem(bag: BagEntry[], uid: number, x: number, y: number): boolean {
  const e = bag.find((q) => q.item.uid === uid);
  if (!e) return false;
  const s = sizeOf(e.item);
  if (x < 0 || y < 0 || x + s.w > GRID_W || y + s.h > GRID_H) return false;
  if (fits(bag, s.w, s.h, x, y, uid)) {
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
  let spot: { x: number; y: number } | null = fits(placed, os.w, os.h, ox, oy) ? { x: ox, y: oy } : null;
  if (!spot) spot = findSpot(placed, os.w, os.h);
  if (!spot) return false;
  e.x = x;
  e.y = y;
  other.x = spot.x;
  other.y = spot.y;
  return true;
}
