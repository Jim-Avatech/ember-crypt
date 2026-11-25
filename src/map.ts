import { Rng } from "./rng";

export const MAP_W = 60;
export const MAP_H = 60;

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface Decal {
  x: number;
  y: number;
  kind: "bones" | "crack" | "skull" | "blood";
  rot: number;
}

export interface Torch {
  /** wall tile */
  x: number;
  y: number;
}

export type PropKind = "tree" | "tent" | "campfire" | "crate" | "barrel" | "stump" | "chest";

export interface Prop {
  kind: PropKind;
  /** tile of the prop's anchor (front-most tile for big props) */
  x: number;
  y: number;
  /** footprint size in tiles */
  w: number;
  h: number;
  v: number;
}

export interface Level {
  kind: "dungeon" | "town";
  w: number;
  h: number;
  /** 1 = solid tile drawn by a prop, not as a wall */
  solidKind: Uint8Array;
  props: Prop[];
  waypoint: { x: number; y: number };
  vendor: { x: number; y: number } | null;
  /** camp stash chest (town only) */
  stash: { x: number; y: number } | null;
  spawn: { x: number; y: number };
  /** 1 = floor, 0 = solid */
  tiles: Uint8Array;
  /** per-tile floor art: dungeon 0..3, town grass 0..3, dirt 4..6 */
  variant: Uint8Array;
  explored: Uint8Array;
  rooms: Room[];
  start: Room;
  bossRoom: Room;
  decals: Decal[];
  torches: Torch[];
}

export function idx(x: number, y: number) {
  return y * MAP_W + x;
}

export function isFloor(level: Level, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.w || y >= level.h) return false;
  return level.tiles[idx(x, y)] === 1;
}

export function generateLevel(seed: number): Level {
  const rng = new Rng(seed);
  const tiles = new Uint8Array(MAP_W * MAP_H);
  const rooms: Room[] = [];
  const target = rng.int(8, 10);
  for (let tries = 0; tries < 400 && rooms.length < target; tries++) {
    const w = rng.int(6, 11);
    const h = rng.int(6, 11);
    const x = rng.int(2, MAP_W - w - 3);
    const y = rng.int(2, MAP_H - h - 3);
    const overlaps = rooms.some((r) => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y);
    if (overlaps) continue;
    rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) });
  }
  for (const r of rooms) {
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) tiles[idx(xx, yy)] = 1;
  }
  // connect each room to the nearest already-connected room with a 2-wide L corridor
  const carve = (x: number, y: number) => {
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx > 0 && yy > 0 && xx < MAP_W - 1 && yy < MAP_H - 1) tiles[idx(xx, yy)] = 1;
      }
  };
  const connected = [rooms[0]];
  const rest = rooms.slice(1);
  while (rest.length) {
    let best = 0;
    let bestFrom = connected[0];
    let bestD = Infinity;
    rest.forEach((r, i) => {
      for (const c of connected) {
        const d = Math.abs(r.cx - c.cx) + Math.abs(r.cy - c.cy);
        if (d < bestD) {
          bestD = d;
          best = i;
          bestFrom = c;
        }
      }
    });
    const r = rest.splice(best, 1)[0];
    let x = bestFrom.cx;
    let y = bestFrom.cy;
    const horizFirst = rng.chance(0.5);
    const stepX = () => {
      while (x !== r.cx) {
        carve(x, y);
        x += Math.sign(r.cx - x);
      }
    };
    const stepY = () => {
      while (y !== r.cy) {
        carve(x, y);
        y += Math.sign(r.cy - y);
      }
    };
    if (horizFirst) {
      stepX();
      stepY();
    } else {
      stepY();
      stepX();
    }
    carve(x, y);
    connected.push(r);
  }

  const level: Level = {
    kind: "dungeon",
    solidKind: new Uint8Array(MAP_W * MAP_H),
    props: [],
    waypoint: { x: rooms[0].cx + 0.5, y: rooms[0].cy + 0.5 },
    vendor: null,
    stash: null,
    spawn: { x: rooms[0].cx + 1.5, y: rooms[0].cy + 1.5 },
    w: MAP_W,
    h: MAP_H,
    tiles,
    variant: new Uint8Array(MAP_W * MAP_H).map(() => (rng.chance(0.75) ? 0 : rng.int(1, 3))),
    explored: new Uint8Array(MAP_W * MAP_H),
    rooms,
    start: rooms[0],
    bossRoom: rooms[0],
    decals: [],
    torches: [],
  };

  // boss room = farthest room by walking distance from start
  const dist = bfs(level, rooms[0].cx, rooms[0].cy);
  let far = rooms[0];
  let farD = -1;
  for (const r of rooms) {
    const d = dist[idx(r.cx, r.cy)];
    if (d > farD) {
      farD = d;
      far = r;
    }
  }
  level.bossRoom = far;

  // decals
  for (let i = 0; i < 70; i++) {
    const x = rng.int(1, MAP_W - 2);
    const y = rng.int(1, MAP_H - 2);
    if (!isFloor(level, x, y)) continue;
    level.decals.push({
      x: x + rng.range(0.2, 0.8),
      y: y + rng.range(0.2, 0.8),
      kind: rng.pick(["bones", "crack", "crack", "skull", "blood"] as const),
      rot: rng.range(0, Math.PI * 2),
    });
  }
  // torches on north/west walls of rooms (walls the camera can see)
  for (const r of rooms) {
    for (let k = 0; k < 2; k++) {
      if (rng.chance(0.5)) {
        const tx = rng.int(r.x + 1, r.x + r.w - 2);
        if (!isFloor(level, tx, r.y - 1)) level.torches.push({ x: tx, y: r.y - 1 });
      } else {
        const ty = rng.int(r.y + 1, r.y + r.h - 2);
        if (!isFloor(level, r.x - 1, ty)) level.torches.push({ x: r.x - 1, y: ty });
      }
    }
  }
  return level;
}

/** Breadth-first distance field (8-way, no corner cutting). Unreachable = 65535. */
export function bfs(level: Level, sx: number, sy: number, out?: Uint16Array): Uint16Array {
  const dist = out ?? new Uint16Array(level.w * level.h);
  dist.fill(65535);
  if (!isFloor(level, sx, sy)) return dist;
  const q = new Int32Array(level.w * level.h);
  let head = 0;
  let tail = 0;
  dist[idx(sx, sy)] = 0;
  q[tail++] = idx(sx, sy);
  while (head < tail) {
    const cur = q[head++];
    const cx = cur % level.w;
    const cy = (cur / level.w) | 0;
    const d = dist[cur] + 1;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!isFloor(level, nx, ny)) continue;
        if (dx && dy && (!isFloor(level, cx + dx, cy) || !isFloor(level, cx, cy + dy))) continue;
        const ni = idx(nx, ny);
        if (dist[ni] <= d) continue;
        dist[ni] = d;
        q[tail++] = ni;
      }
  }
  return dist;
}

/** Grid line-of-sight check between two world points. */
export function lineOfSight(level: Level, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.ceil(Math.hypot(dx, dy) * 3);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!isFloor(level, Math.floor(x0 + dx * t), Math.floor(y0 + dy * t))) return false;
  }
  return true;
}

export const TOWN_W = 34;
export const TOWN_H = 28;

/** The Rogue-camp style hub: a palisade, dirt paths, tents, a campfire, a trader and a waypoint. */
export function generateTown(): Level {
  const rng = new Rng(20261124);
  const N = MAP_W * MAP_H;
  const tiles = new Uint8Array(N);
  const art = new Uint8Array(N);
  const solidKind = new Uint8Array(N);
  for (let y = 1; y < TOWN_H - 1; y++)
    for (let x = 1; x < TOWN_W - 1; x++) {
      tiles[idx(x, y)] = 1;
      art[idx(x, y)] = rng.chance(0.7) ? 0 : rng.int(1, 3);
    }
  const dirt = (x: number, y: number) => {
    if (tiles[idx(x, y)]) art[idx(x, y)] = rng.int(4, 6);
  };
  for (let x = 1; x < TOWN_W - 1; x++) for (const y of [13, 14]) dirt(x, y);
  for (let y = 1; y < TOWN_H - 1; y++) for (const x of [16, 17]) dirt(x, y);
  for (let y = 10; y <= 17; y++) for (let x = 13; x <= 20; x++) dirt(x, y);
  const props: Prop[] = [];
  const solid = (x: number, y: number) => {
    tiles[idx(x, y)] = 0;
    solidKind[idx(x, y)] = 1;
  };
  const place = (kind: PropKind, x: number, y: number, w = 1, h = 1) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) solid(xx, yy);
    props.push({ kind, x: x + w - 1, y: y + h - 1, w, h, v: rng.int(0, 3) });
  };
  place("campfire", 16, 13);
  place("chest", 14, 17);
  place("tent", 4, 4, 3, 3);
  place("tent", 24, 4, 3, 3);
  place("tent", 4, 20, 3, 3);
  place("tent", 25, 20, 3, 3);
  for (const [x, y, k] of [[23, 7, "crate"], [27, 7, "barrel"], [7, 6, "barrel"], [7, 23, "crate"], [24, 22, "barrel"], [11, 12, "stump"]] as const)
    place(k, x, y);
  // trees along the palisade
  let n = 0;
  for (let tries = 0; tries < 400 && n < 26; tries++) {
    const x = rng.int(1, TOWN_W - 2);
    const y = rng.int(1, TOWN_H - 2);
    const nearEdge = x < 3 || y < 3 || x > TOWN_W - 4 || y > TOWN_H - 4;
    if (!nearEdge || !tiles[idx(x, y)] || art[idx(x, y)] >= 4) continue;
    if (Math.abs(x - 16.5) < 3 || Math.abs(y - 13.5) < 3) continue;
    place("tree", x, y);
    n++;
  }
  return {
    kind: "town",
    w: MAP_W,
    h: MAP_H,
    tiles,
    variant: art,
    explored: new Uint8Array(N).fill(1),
    solidKind,
    props,
    rooms: [],
    start: { x: 1, y: 1, w: TOWN_W - 2, h: TOWN_H - 2, cx: 19, cy: 18 },
    bossRoom: { x: 1, y: 1, w: 1, h: 1, cx: 1, cy: 1 },
    decals: [],
    torches: [],
    waypoint: { x: 21.5, y: 18.5 },
    vendor: { x: 25.5, y: 8.6 },
    stash: { x: 14.5, y: 17.5 },
    spawn: { x: 19.5, y: 17.5 },
  };
}
