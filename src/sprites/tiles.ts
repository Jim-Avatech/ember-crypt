/** Pixel-art tiles and props for the crypt and the camp. Tiles are 32×16 iso diamonds. */
import type { Theme } from "../data/acts";
import { PB, type RGB, hash, hex, mul } from "../pixel";

export const TW = 32;
export const TH = 16;
export const WALL_H = 24;
export const LOW_H = 5;

const inDiamond = (x: number, y: number) => {
  if (y < 0 || y >= 16) return false;
  const hw = y < 8 ? 2 * (y + 1) : 2 * (16 - y);
  return x >= 16 - hw && x < 16 + hw;
};
const iso = (x: number, y: number) => ({ u: (x - 15.5) / 32 + (y + 0.5) / 16, v: (y + 0.5) / 16 - (x - 15.5) / 32 });

function diamond(pb: PB, oy: number, color: (x: number, y: number) => RGB | null) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 32; x++) {
      if (!inDiamond(x, y)) continue;
      const c = color(x, y);
      if (c) pb.set(x, y + oy, c);
    }
}

// ------------------------------------------------------------------ crypt
/** Dungeon floor; `th` sets the act's palette and detail (Act I crypt slabs by default). */
export function cryptFloor(v: number, th?: Theme): HTMLCanvasElement {
  const pb = new PB(32, 16);
  const base = hex((th?.floor ?? ["#3d362e", "#3a332b", "#3f372e", "#383128"])[v & 3]);
  const feat = th?.feature ?? "slabs";
  diamond(pb, 0, (x, y) => {
    const { u, v: vv } = iso(x, y);
    const fu = (u * 2) % 1;
    const fv = (vv * 2) % 1;
    const su = Math.floor(u * 2);
    const sv = Math.floor(vv * 2);
    if (fu < 0.07 || fv < 0.07 || u > 0.965 || vv > 0.965) return mul(base, 0.55);
    let k = 0.9 + 0.2 * hash(su, sv, v + 3);
    k *= 0.93 + 0.14 * hash(x, y, v);
    if (fu < 0.16 || fv < 0.16) k *= 1.12;
    let c = mul(base, k);
    if (feat === "slabs") {
      if (v === 2 && hash(Math.floor(x / 3), Math.floor(y / 2), 9) < 0.35) c = [c[0] * 0.85, c[1] * 1.05, c[2] * 0.8];
      if (v === 3 && hash(x, y, 77) < 0.06) c = mul(base, 1.45);
    } else if (feat === "sand") {
      // drifted sand over the slabs
      const dune = Math.sin(x * 0.45 + y * 1.3 + v * 2);
      if (v !== 1 && hash(Math.floor(x / 4), Math.floor(y / 2), v + 31) < 0.45) c = mul(hex("#b89868"), 0.92 + 0.1 * dune);
      if (hash(x, y, 55) < 0.05) c = mul(base, 1.3);
    } else if (feat === "moss") {
      if (hash(Math.floor(x / 3), Math.floor(y / 2), v + 12) < 0.4) c = mul(hex("#3e5a2a"), 0.85 + 0.25 * hash(x, y, 4));
      if (v === 3 && Math.hypot((x - 16) / 2, y - 8) < 4) c = mul(hex("#1e3a3a"), 0.9 + 0.2 * hash(x, y, 8));
    } else if (feat === "lava") {
      if (hash(x, y, 66) < 0.04) c = mul(base, 1.6);
    }
    return c;
  });
  if (feat === "lava" && v !== 0) {
    // glowing cracks
    let x = 5 + v * 3;
    let y = 4 + v;
    for (let i = 0; i < 16; i++) {
      if (inDiamond(x, y)) pb.set(x, y, i % 3 === 0 ? hex("#ffb040") : hex("#e0400c"));
      x += hash(i, 1, v + 9) < 0.7 ? 1 : 0;
      y += hash(i, 2, v + 9) < 0.45 ? 1 : 0;
    }
    return pb.canvas();
  }
  if (v === 1) {
    let x = 9;
    let y = 6;
    for (let i = 0; i < 12; i++) {
      if (inDiamond(x, y)) pb.set(x, y, mul(base, 0.5));
      x += hash(i, 1, 5) < 0.6 ? 1 : 0;
      y += hash(i, 2, 5) < 0.5 ? 1 : 0;
    }
  }
  return pb.canvas();
}

function block(h: number, top: (x: number, y: number) => RGB, left: (x: number, y: number, r: number) => RGB, right: (x: number, y: number, r: number) => RGB): HTMLCanvasElement {
  const pb = new PB(32, 16 + h);
  for (let x = 0; x < 32; x++) {
    const yb = x < 16 ? 8 + Math.floor(x / 2) : 8 + Math.floor((31 - x) / 2);
    for (let y = yb; y < yb + h; y++) {
      const r = y - yb;
      pb.set(x, y, x < 16 ? left(x, y, r) : right(x, y, r));
    }
  }
  diamond(pb, 0, top);
  // rim highlight along the top's front edges
  for (let x = 0; x < 32; x++) {
    const yb = x < 16 ? 8 + Math.floor(x / 2) : 8 + Math.floor((31 - x) / 2);
    if (yb - 1 >= 0) pb.set(x, yb - 1, mul(pb.get(x, yb - 1), 1.15));
  }
  return pb.canvas();
}

export function cryptWall(tall: boolean, th?: Theme): HTMLCanvasElement {
  const h = tall ? WALL_H : LOW_H;
  const topC = hex(th?.wallTop ?? "#544a3e");
  const lc = hex(th?.wallLeft ?? "#2c2620");
  const rc = hex(th?.wallRight ?? "#40362c");
  const brick = (c: RGB) => (x: number, _y: number, r: number) => {
    const row = Math.floor(r / 4);
    if (r % 4 === 3) return mul(c, 0.6);
    if ((x + (row % 2) * 3) % 6 === 0) return mul(c, 0.7);
    return mul(c, 0.9 + 0.2 * hash(Math.floor((x + (row % 2) * 3) / 6), row, 4));
  };
  const feat = th?.feature ?? "slabs";
  const deco = (f: (x: number, y: number, r: number) => RGB) => (x: number, y: number, r: number): RGB => {
    const c = f(x, y, r);
    if (feat === "moss" && hash(x, Math.floor(r / 2), 21) < 0.22 - r * 0.006) return mul(hex("#3a5a26"), 0.8 + 0.3 * hash(x, r, 2));
    if (feat === "lava" && r > h - 4 && hash(x, r, 5) < 0.3) return hex(r === h - 1 ? "#ff7a20" : "#a02a08");
    if (feat === "sand" && r > h - 3 && hash(x, r, 7) < 0.6) return mul(hex("#b89868"), 0.9);
    return c;
  };
  return block(h, (x, y) => {
    const { u, v } = iso(x, y);
    if (u < 0.06 || v < 0.06 || u > 0.94 || v > 0.94) return mul(topC, 0.75);
    return mul(topC, 0.92 + 0.16 * hash(x, y, 11));
  }, deco(brick(lc)), deco(brick(rc)));
}

// ------------------------------------------------------------------ camp
export function grassTile(v: number): HTMLCanvasElement {
  const pb = new PB(32, 16);
  const base = hex(["#4b6a2f", "#47652c", "#4f6e31", "#4a682e"][v & 3]);
  diamond(pb, 0, (x, y) => {
    const n = hash(x, y, v + 20);
    let c = mul(base, 0.9 + 0.18 * hash(Math.floor(x / 3), Math.floor(y / 2), v));
    if (n < 0.1) c = mul(base, 1.3);
    else if (n < 0.18) c = mul(base, 0.75);
    if (v === 3 && n > 0.985) c = hash(x, y, 3) < 0.5 ? hex("#e8d860") : hex("#e8e8e0");
    return c;
  });
  return pb.canvas();
}

export function dirtTile(v: number): HTMLCanvasElement {
  const pb = new PB(32, 16);
  const base = hex(["#6e5536", "#6a5134", "#735a3a"][v % 3]);
  diamond(pb, 0, (x, y) => {
    const n = hash(x, y, v + 40);
    let c = mul(base, 0.92 + 0.14 * hash(Math.floor(x / 2), y, v + 1));
    if (n < 0.05) c = hex("#8c7656");
    else if (n < 0.12) c = mul(base, 0.75);
    return c;
  });
  return pb.canvas();
}

export function fenceWall(tall: boolean): HTMLCanvasElement {
  const h = tall ? WALL_H + 2 : LOW_H + 1;
  const wood = hex("#6e4c2c");
  const log = (x: number, y: number, r: number) => {
    const k = x % 4 === 0 ? 0.55 : x % 4 === 1 ? 1.15 : 0.95;
    const rope = r === Math.floor(h * 0.3) || r === Math.floor(h * 0.75) ? 0.75 : 1;
    return mul(wood, k * rope * (0.95 + 0.1 * hash(x, y, 2)));
  };
  return block(h, (x, y) => (hash(Math.floor(x / 4), y, 8) < 0.5 ? hex("#9a7a52") : hex("#8a6a44")), (x, y, r) => mul(log(x, y, r), 0.8), log);
}

export function treeSprite(v: number): HTMLCanvasElement {
  const pb = new PB(38, 56);
  const m = () => pb.mask();
  pb.part(m().capsule(19, 52, 19, 32, 2.2), hex("#5a3a20"), { edge: true });
  const g = [hex("#2f5a26"), hex("#2a5222"), hex("#36622a")][v % 3];
  const blobs: [number, number, number][] = [[19, 26, 10], [11, 30, 7], [27, 30, 7], [19, 16, 8], [13, 20, 6], [25, 20, 6]];
  for (const [x, y, r] of blobs) pb.part(m().disc(x + (v % 2), y, r), g, { edge: true, pattern: (xx, yy) => (hash(xx, yy, v) < 0.15 ? 1.25 : hash(xx, yy, v + 1) < 0.1 ? 0.8 : 1) });
  pb.outline(hex("#10180c"));
  return pb.canvas();
}

/** A 3×3-tile tent. Anchor at the bottom vertex of its footprint. */
export function tentSprite(v: number): HTMLCanvasElement {
  const W = 100;
  const H = 84;
  const pb = new PB(W, H);
  const B: [number, number] = [50, 80];
  const L: [number, number] = [2, 56];
  const R: [number, number] = [98, 56];
  const A: [number, number] = [50, 10];
  const cloth = v % 2 ? hex("#b8955e") : hex("#a8845a");
  const stripe = v % 2 ? hex("#8a2e22") : hex("#3e5a7a");
  pb.part(pb.mask().poly([L, B, A]), cloth, { shade: false, pattern: (x) => (Math.floor((x - 2) / 8) % 2 ? 1 : 0.92) });
  pb.part(pb.mask().poly([B, R, A]), mul(cloth, 0.78), { shade: false, pattern: (x) => (Math.floor((x - 50) / 8) % 2 ? 1 : 0.9) });
  // stripes along the hem
  pb.fill(pb.mask().poly([[2, 56], [50, 80], [50, 74], [8, 53]]), stripe);
  pb.fill(pb.mask().poly([[50, 80], [98, 56], [92, 53], [50, 74]]), mul(stripe, 0.8));
  // door flap
  pb.fill(pb.mask().poly([[24, 68], [38, 75], [33, 38]]), hex("#1c120a"));
  // seams
  for (let i = 0; i < 40; i++) {
    pb.set(50, 10 + i * 1.75, mul(cloth, 0.6));
  }
  pb.part(pb.mask().capsule(50, 12, 50, 4, 1), hex("#5a3a20"));
  pb.outline(hex("#140c08"));
  return pb.canvas();
}

export function campfireFrames(): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (let f = 0; f < 4; f++) {
    const pb = new PB(22, 26);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      pb.part(pb.mask().disc(11 + Math.cos(a) * 7, 21 + Math.sin(a) * 3.2, 1.6), hex("#7a7670"), { edge: true });
    }
    pb.part(pb.mask().capsule(5, 22, 17, 19, 1.3), hex("#5a3a20"), { edge: true });
    pb.part(pb.mask().capsule(6, 19, 16, 22, 1.3), hex("#4a2e18"), { edge: true });
    const fl = [0, 1.5, 0.5, 2][f];
    pb.fill(pb.mask().poly([[6, 21], [11, 4 + fl], [16, 21]]), hex("#e8501a"));
    pb.fill(pb.mask().poly([[8, 21], [11 + (f % 2 ? 1 : -1), 9 + fl], [14, 21]]), hex("#ffa02a"));
    pb.fill(pb.mask().poly([[9.5, 21], [11, 14 + fl / 2], [12.5, 21]]), hex("#fff0a0"));
    out.push(pb.canvas());
  }
  return out;
}

export function crateSprite(): HTMLCanvasElement {
  const pb = new PB(18, 18);
  const c = hex("#8a6438");
  pb.part(pb.mask().poly([[1, 5], [9, 9], [9, 17], [1, 13]]), mul(c, 0.75), { shade: false, pattern: (_x, y) => (y % 4 === 0 ? 0.8 : 1) });
  pb.part(pb.mask().poly([[9, 9], [17, 5], [17, 13], [9, 17]]), c, { shade: false, pattern: (_x, y) => (y % 4 === 0 ? 0.8 : 1) });
  pb.part(pb.mask().poly([[1, 5], [9, 1], [17, 5], [9, 9]]), mul(c, 1.2), { shade: false });
  pb.outline();
  return pb.canvas();
}

/** The camp stash: an iron-bound chest with a brass lock. */
export function chestSprite(): HTMLCanvasElement {
  const pb = new PB(24, 22);
  const wood = hex("#7a4a26");
  const iron = hex("#4a4a52");
  const grain = (_x: number, y: number) => (y % 3 === 0 ? 0.82 : 1);
  // body: left face, right face
  pb.part(pb.mask().poly([[1, 9], [11, 14], [11, 21], [1, 16]]), mul(wood, 0.72), { shade: false, pattern: grain });
  pb.part(pb.mask().poly([[11, 14], [23, 8], [23, 15], [11, 21]]), wood, { shade: false, pattern: grain });
  // domed lid
  pb.part(pb.mask().poly([[1, 9], [1, 6], [4, 3], [14, 0], [20, 2], [23, 5], [23, 8], [11, 14]]), mul(wood, 1.18), { shade: false, pattern: (x) => (x % 4 === 0 ? 0.85 : 1) });
  // iron bands
  pb.part(pb.mask().poly([[4, 4], [6, 3], [6, 17.5], [4, 16.5]]), iron, { shade: false });
  pb.part(pb.mask().poly([[17, 1], [19, 2], [19, 17], [17, 18]]), iron, { shade: false });
  pb.part(pb.mask().poly([[1, 9], [11, 14], [23, 8], [23, 9.5], [11, 15.5], [1, 10.5]]), mul(iron, 1.2), { shade: false });
  // brass lock
  pb.part(pb.mask().rect(12, 14, 3, 4), hex("#e0b040"), { shade: false });
  pb.outline();
  return pb.canvas();
}

export function barrelSprite(): HTMLCanvasElement {
  const pb = new PB(14, 18);
  const c = hex("#7a5430");
  pb.part(pb.mask().rect(2, 4, 10, 11).ellipse(7, 15, 5, 2), c, { pattern: (x, y) => (y === 6 || y === 12 ? 0.6 : x % 3 === 0 ? 0.85 : 1) });
  pb.part(pb.mask().ellipse(7, 4, 5, 2), mul(c, 1.25));
  pb.outline();
  return pb.canvas();
}

export function stumpSprite(): HTMLCanvasElement {
  const pb = new PB(16, 12);
  pb.part(pb.mask().rect(3, 4, 10, 5).ellipse(8, 9, 5, 2), hex("#5e3e22"));
  pb.part(pb.mask().ellipse(8, 4, 5, 2), hex("#a07a4e"), { pattern: (x, y) => ((x + y) % 3 === 0 ? 0.8 : 1) });
  pb.outline();
  return pb.canvas();
}

/** Waypoint platform; frame index pulses the runes. */
export function waypointFrames(): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (let f = 0; f < 4; f++) {
    const pb = new PB(32, 20);
    const stone = hex("#7a7a80");
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 32; x++) {
        if (!inDiamond(x, y)) continue;
        const { u, v } = iso(x, y);
        if (u < 0.1 || v < 0.1 || u > 0.9 || v > 0.9) continue;
        const edge = u < 0.17 || v < 0.17 || u > 0.83 || v > 0.83;
        pb.set(x, y + 1, mul(stone, edge ? 1.15 : 0.85 + 0.15 * hash(x, y, 6)));
      }
    // side lip
    for (let x = 4; x < 28; x++) {
      const yb = x < 16 ? 9 + Math.floor((x - 4) / 2) : 9 + Math.floor((27 - x) / 2);
      pb.set(x, yb + 2, mul(stone, 0.55));
    }
    const glow = 0.7 + 0.3 * Math.sin((f / 4) * Math.PI * 2);
    const rune = mul(hex("#5aa8ff"), glow + 0.3);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pb.set(16 + Math.cos(a) * 7, 9 + Math.sin(a) * 3.5, rune);
    }
    pb.set(16, 9, mul(hex("#bfe0ff"), glow + 0.2));
    pb.set(15, 9, rune);
    pb.set(17, 9, rune);
    out.push(pb.canvas());
  }
  return out;
}

export function stairsSprite(): HTMLCanvasElement {
  const pb = new PB(32, 16);
  diamond(pb, 0, (x, y) => {
    const { u, v } = iso(x, y);
    if (u < 0.08 || v < 0.08 || u > 0.92 || v > 0.92) return hex("#6a5a44");
    const depth = Math.min(u, v);
    const step = Math.floor(depth * 10);
    return mul(hex("#3a3028"), Math.max(0.15, 1 - depth * 2.2) * (step % 2 ? 0.8 : 1));
  });
  return pb.canvas();
}

export function torchFrames(flame = "#ff8a1a", core = "#ffe08a"): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (let f = 0; f < 3; f++) {
    const pb = new PB(8, 14);
    pb.part(pb.mask().rect(3, 7, 2, 6), hex("#3a2614"));
    const fl = [0, 1, 0.5][f];
    pb.fill(pb.mask().poly([[1, 8], [4, 1 + fl], [7, 8]]), hex(flame));
    pb.fill(pb.mask().poly([[2.5, 8], [4, 3.5 + fl], [5.5, 8]]), hex(core));
    out.push(pb.canvas());
  }
  return out;
}

export function decalSprite(kind: string): HTMLCanvasElement {
  const pb = new PB(14, 8);
  const bone = hex("#d6ccb0");
  if (kind === "bones") {
    pb.part(pb.mask().capsule(2, 5, 11, 3, 0.7), bone, { shade: false });
    pb.part(pb.mask().capsule(5, 1, 8, 7, 0.7), mul(bone, 0.9), { shade: false });
  } else if (kind === "skull") {
    pb.part(pb.mask().disc(7, 4, 2.6), bone);
    pb.set(6, 4, hex("#1a1410"));
    pb.set(8, 4, hex("#1a1410"));
  } else if (kind === "blood") {
    pb.fill(pb.mask().ellipse(7, 4, 5.5, 2.5).ellipse(11, 5, 2, 1.2), hex("#5a0c06"), 190);
  } else if (kind === "urn") {
    pb.part(pb.mask().ellipse(7, 4.5, 3, 2.6).rect(5.5, 1, 3, 2), hex("#a8643a"));
    pb.set(7, 4, hex("#e0b040"));
  } else if (kind === "sand") {
    pb.fill(pb.mask().ellipse(7, 4, 6, 2.6), hex("#b89868"), 200);
    pb.fill(pb.mask().ellipse(5, 3.5, 2, 1), hex("#d0b080"), 200);
  } else if (kind === "vine") {
    for (let i = 0; i < 12; i++) pb.set(1 + i, 4 + Math.round(Math.sin(i * 0.9) * 2), hex(i % 3 ? "#3a6a2a" : "#5a8a3a"));
    pb.set(4, 2, hex("#c0405a"));
  } else if (kind === "puddle") {
    pb.fill(pb.mask().ellipse(7, 4, 5.5, 2.4), hex("#1e3a40"), 220);
    pb.set(5, 3, hex("#6a9aa0"));
  } else if (kind === "lava") {
    pb.fill(pb.mask().ellipse(7, 4, 5, 2.2), hex("#c03008"), 230);
    pb.fill(pb.mask().ellipse(7, 4, 3, 1.2), hex("#ffa030"), 240);
  } else {
    for (let i = 0; i < 10; i++) pb.set(2 + i, 4 + Math.round(Math.sin(i * 1.7) * 1.2), hex("#1e1a16"), 200);
  }
  return pb.canvas();
}
