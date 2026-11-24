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

export interface Level {
  w: number;
  h: number;
  /** 1 = floor, 0 = solid */
  tiles: Uint8Array;
  /** per-tile floor variant 0..3 */
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
