/**
 * Procedurally authored pixel-art characters. Each model is a small 3D skeleton posed per animation
 * frame, projected for one of 8 directions and rasterized with no anti-aliasing, then shaded and outlined.
 * Frames are generated lazily and cached.
 */
import { LOOK_BY_ID as BASE_BY_ID } from "../data/looks";
import { Mask, PB, type RGB, hex, mul, whiteOf } from "../pixel";

export type Model = "barb" | "zombie" | "fallen" | "boss" | "vendor";
export type Anim = "idle" | "walk" | "atk0" | "atk1" | "thr0" | "thr1" | "cry" | "leap" | "death";
export const FRAMES: Record<Anim, number> = { idle: 4, walk: 8, atk0: 6, atk1: 6, thr0: 6, thr1: 6, cry: 4, leap: 3, death: 6 };

export interface Look {
  main?: string;
  off?: string;
  head?: string;
  chest?: string;
  gloves?: string;
  boots?: string;
}

interface Arm {
  a: number;
  el: number;
  ab: number;
  wr: number;
}
interface Leg {
  th: number;
  kn: number;
}
interface Pose {
  lean: number;
  twist: number;
  bob: number;
  fall: number;
  head: number;
  spread: number;
  armL: Arm;
  armR: Arm;
  legL: Leg;
  legR: Leg;
}

interface Dims {
  hipZ: number;
  hipW: number;
  thigh: number;
  shin: number;
  torso: number;
  shW: number;
  upper: number;
  fore: number;
  neck: number;
  headR: number;
  limb: number;
}

const DIMS: Record<Model, Dims> = {
  barb: { hipZ: 13, hipW: 2.2, thigh: 6.5, shin: 6.5, torso: 8.5, shW: 4.6, upper: 5.4, fore: 5, neck: 2.6, headR: 3.2, limb: 1.45 },
  zombie: { hipZ: 12, hipW: 2, thigh: 6, shin: 6, torso: 8, shW: 4.1, upper: 5.4, fore: 5, neck: 2.4, headR: 3, limb: 1.3 },
  fallen: { hipZ: 6.4, hipW: 1.6, thigh: 3.3, shin: 3.3, torso: 5, shW: 3, upper: 3.4, fore: 3, neck: 1.6, headR: 3.4, limb: 1.1 },
  boss: { hipZ: 17.5, hipW: 3, thigh: 8.8, shin: 8.8, torso: 11.5, shW: 6.2, upper: 7.8, fore: 7, neck: 3.4, headR: 4.2, limb: 2 },
  vendor: { hipZ: 12, hipW: 1.8, thigh: 6, shin: 6, torso: 8, shW: 3.8, upper: 5, fore: 4.5, neck: 2.4, headR: 3, limb: 1.25 },
};

const SIZE: Record<Model, [number, number, number, number]> = {
  // w, h, anchorX, anchorY (feet)
  barb: [52, 58, 26, 52],
  zombie: [48, 50, 24, 45],
  fallen: [34, 34, 17, 30],
  boss: [78, 80, 39, 74],
  vendor: [40, 46, 20, 41],
};

// ------------------------------------------------------------------ pose helpers
const arm = (a: number, el: number, ab = 0.1, wr = 0): Arm => ({ a, el, ab, wr });
const leg = (th: number, kn: number): Leg => ({ th, kn });
const pose = (o: Partial<Pose>): Pose => ({
  lean: 0.06, twist: 0, bob: 0, fall: 0, head: 0, spread: 0.1,
  armL: arm(0.12, 0.3, 0.12), armR: arm(0.3, 0.55, 0.1, 1.25), legL: leg(0.08, 0.12), legR: leg(-0.06, 0.1),
  ...o,
});
function lerpObj<T>(a: T, b: T, t: number): T {
  if (typeof a === "number") return ((a as number) + ((b as number) - (a as number)) * t) as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(a as object)) out[k] = lerpObj((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], t);
  return out as T;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Interpolate along keyed poses [[t, pose], ...]. */
function keyed(keys: [number, Pose][], t: number): Pose {
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i];
    const [t1, p1] = keys[i + 1];
    if (t <= t1) return lerpObj(p0, p1, smooth((t - t0) / (t1 - t0 || 1)));
  }
  return keys[keys.length - 1][1];
}

// ------------------------------------------------------------------ animations
function barbPose(anim: Anim, f: number, look: Look): Pose {
  const offKind = look.off ? BASE_BY_ID[look.off].slot : null;
  const twoHanded = look.main ? BASE_BY_ID[look.main].hands === 2 : false;
  const restL = offKind === "shield" ? arm(0.55, 1.0, 0.15) : offKind === "weapon" ? arm(0.3, 0.55, 0.1, 1.25) : twoHanded ? arm(0.6, 0.9, 0.0, 1.2) : arm(0.12, 0.3, 0.12);
  const restR = arm(0.3, 0.55, 0.1, 1.25);
  const base = pose({ armL: restL, armR: restR });
  switch (anim) {
    case "idle": {
      const b = (1 - Math.cos((f / 4) * Math.PI * 2)) * 0.5;
      return { ...base, bob: -b * 0.7, armL: { ...restL, el: restL.el + b * 0.08 }, armR: { ...restR, el: restR.el + b * 0.08 } };
    }
    case "walk": {
      const ph = (f / 8) * Math.PI * 2;
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      const swingL = offKind ? restL : arm(0.12 - 0.5 * s, 0.35 + Math.max(0, -s) * 0.3, 0.1);
      return pose({
        lean: 0.12,
        twist: 0.08 * s,
        bob: 0.6 * (1 - Math.abs(s)) - 0.3,
        legL: leg(0.5 * s, 0.15 + Math.max(0, c) * 0.85),
        legR: leg(-0.5 * s, 0.15 + Math.max(0, -c) * 0.85),
        armL: offKind === "shield" ? { ...restL, a: restL.a - 0.1 * s } : offKind === "weapon" ? { ...restL, a: restL.a - 0.22 * s } : swingL,
        armR: { ...restR, a: restR.a + 0.22 * s },
      });
    }
    case "atk0":
    case "atk1": {
      const t = (f + 0.5) / 6;
      const left = anim === "atk1";
      const sign = left ? -1 : 1;
      const swingArm = (a: Arm): Partial<Pose> => (left ? { armL: a, armR: restR } : { armR: a, armL: twoHanded ? arm(a.a - 0.1, a.el + 0.4, 0.0, a.wr) : restL });
      const legs = (front: Leg, back: Leg) => (left ? { legL: back, legR: front } : { legL: front, legR: back });
      const wind = pose({ ...swingArm(arm(3.25, 0.35, 0.25, 0.35)), twist: 0.4 * sign, lean: -0.02, ...legs(leg(0.2, 0.2), leg(-0.2, 0.15)) });
      const strike = pose({ ...swingArm(arm(1.35, 0.05, 0.05, 0.25)), twist: -0.4 * sign, lean: 0.28, ...legs(leg(0.45, 0.3), leg(-0.35, 0.1)) });
      const follow = pose({ ...swingArm(arm(0.75, 0.25, 0.1, 0.6)), twist: -0.25 * sign, lean: 0.18, ...legs(leg(0.35, 0.25), leg(-0.25, 0.1)) });
      return keyed([[0, base], [0.28, wind], [0.5, strike], [0.72, follow], [1, base]], t);
    }
    case "thr0":
    case "thr1": {
      // overhand throw: cock the arm back behind the head, step in and release forward
      const t = (f + 0.5) / 6;
      const left = anim === "thr1";
      const sign = left ? -1 : 1;
      const one = (a: Arm): Partial<Pose> => (left ? { armL: a, armR: restR } : { armR: a, armL: arm(1.1, 0.5, 0.15) });
      const legs = (front: Leg, back: Leg) => (left ? { legL: back, legR: front } : { legL: front, legR: back });
      const cock = pose({ ...one(arm(3.0, 1.5, 0.35, 0.9)), twist: 0.55 * sign, lean: -0.12, ...legs(leg(0.25, 0.2), leg(-0.3, 0.2)) });
      const release = pose({ ...one(arm(1.75, 0.05, 0.1, 0.1)), twist: -0.45 * sign, lean: 0.3, ...legs(leg(0.5, 0.35), leg(-0.35, 0.1)) });
      const follow = pose({ ...one(arm(0.7, 0.15, 0.1, 0.3)), twist: -0.3 * sign, lean: 0.22, ...legs(leg(0.4, 0.3), leg(-0.25, 0.1)) });
      return keyed([[0, base], [0.35, cock], [0.55, release], [0.75, follow], [1, base]], t);
    }
    case "cry": {
      const t = smooth(Math.min(1, f / 2));
      const up = arm(0.3 + 2.55 * t, 0.25, 0.1 + 0.4 * t, 1.0);
      return pose({ armL: up, armR: up, lean: -0.1 * t, head: -0.6 * t, spread: 0.1 + 0.3 * t, legL: leg(0.2, 0.15), legR: leg(-0.2, 0.15) });
    }
    case "leap": {
      if (f === 0) return pose({ bob: -2.5, lean: 0.35, legL: leg(0.7, 1.3), legR: leg(0.5, 1.2), armL: arm(0.9, 0.4), armR: arm(0.9, 0.4, 0.1, 1.0) });
      if (f === 1) return pose({ bob: 0, lean: 0.1, legL: leg(1.0, 1.9), legR: leg(0.7, 1.8), armL: arm(2.6, 0.3, 0.3), armR: arm(2.7, 0.3, 0.3, 0.6) });
      return pose({ bob: -2, lean: 0.4, legL: leg(0.6, 1.0), legR: leg(0.2, 0.9), armL: arm(1.3, 0.3), armR: arm(1.5, 0.1, 0.1, 0.3) });
    }
    case "death": {
      const t = smooth(f / 5);
      return pose({ fall: -1.45 * t, bob: -1 * t, legL: leg(0.3 * t, 0.9 * t), legR: leg(-0.1 * t, 0.6 * t), armL: arm(0.3 + 1.8 * t, 0.4, 0.5 * t), armR: arm(0.3 + 1.6 * t, 0.5, 0.5 * t, 1.25), head: 0.4 * t });
    }
  }
}

function zombiePose(anim: Anim, f: number): Pose {
  const base = pose({ lean: 0.45, head: 0.6, armL: arm(1.45, 0.15, 0.12), armR: arm(1.45, 0.15, 0.12), legL: leg(0.12, 0.2), legR: leg(-0.08, 0.15) });
  switch (anim) {
    case "walk": {
      const ph = (f / 8) * Math.PI * 2;
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      return { ...base, twist: 0.12 * s, bob: 0.5 * (1 - Math.abs(s)) - 0.3, legL: leg(0.3 * s + 0.05, 0.15 + Math.max(0, c) * 0.5), legR: leg(-0.3 * s + 0.05, 0.15 + Math.max(0, -c) * 0.5), armL: arm(1.45 + 0.1 * s, 0.15, 0.12), armR: arm(1.45 - 0.1 * s, 0.15, 0.12) };
    }
    case "atk0":
    case "atk1": {
      const t = (f + 0.5) / 6;
      const up = { ...base, lean: 0.2, armL: arm(2.75, 0.2, 0.2), armR: arm(2.75, 0.2, 0.2) };
      const slam = { ...base, lean: 0.65, armL: arm(0.95, 0.05, 0.1), armR: arm(0.95, 0.05, 0.1), legL: leg(0.35, 0.3) };
      return keyed([[0, base], [0.45, up], [0.7, slam], [1, base]], t);
    }
    case "death": {
      const t = smooth(f / 5);
      return { ...base, fall: 1.4 * t, bob: -1.2 * t, legL: leg(0.2, 0.8 * t), legR: leg(0, 0.6 * t), armL: arm(1.45 + 1.2 * t, 0.2, 0.4 * t), armR: arm(1.45 + 1.0 * t, 0.2, 0.4 * t) };
    }
    default: {
      const s = Math.sin((f / 4) * Math.PI * 2);
      return { ...base, armL: arm(1.45 + 0.06 * s, 0.15, 0.12), armR: arm(1.45 - 0.06 * s, 0.15, 0.12), bob: -0.3 * (1 + s) };
    }
  }
}

function fallenPose(anim: Anim, f: number): Pose {
  const base = pose({ lean: 0.2, armR: arm(0.6, 0.9, 0.1, 0.8), armL: arm(0.3, 0.6, 0.2), legL: leg(0.15, 0.3), legR: leg(-0.1, 0.25) });
  switch (anim) {
    case "walk": {
      const ph = (f / 8) * Math.PI * 2;
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      return { ...base, lean: 0.3, bob: 1.3 * (1 - Math.abs(s)) - 0.2, legL: leg(0.7 * s, 0.2 + Math.max(0, c) * 1.1), legR: leg(-0.7 * s, 0.2 + Math.max(0, -c) * 1.1), armL: arm(0.3 - 0.6 * s, 0.6, 0.2), armR: arm(0.6 + 0.4 * s, 0.9, 0.1, 0.8) };
    }
    case "atk0":
    case "atk1": {
      const t = (f + 0.5) / 6;
      const wind = { ...base, twist: 0.4, armR: arm(0.2, 1.7, 0.2, 1.2) };
      const thrust = { ...base, twist: -0.35, lean: 0.45, armR: arm(1.55, 0.0, 0.05, 0.05), legL: leg(0.5, 0.3) };
      return keyed([[0, base], [0.4, wind], [0.62, thrust], [1, base]], t);
    }
    case "death": {
      const t = smooth(f / 5);
      return { ...base, fall: -1.45 * t, bob: -0.8 * t, armL: arm(0.3 + 2 * t, 0.4, 0.4 * t), armR: arm(0.6 + 1.6 * t, 0.6, 0.4 * t, 0.8) };
    }
    default: {
      const b = (1 - Math.cos((f / 4) * Math.PI * 2)) * 0.5;
      return { ...base, bob: -b * 0.6 };
    }
  }
}

function vendorPose(f: number): Pose {
  const s = Math.sin((f / 4) * Math.PI * 2);
  return pose({ lean: 0.04, twist: 0.05 * s, armL: arm(0.35, 1.1, 0.05), armR: arm(0.35, 1.1, 0.05), legL: leg(0, 0), legR: leg(0, 0), bob: -0.2 * (1 + s) });
}

// ------------------------------------------------------------------ skeleton
type V = [number, number, number]; // forward, right, up
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const twistV = (v: V, t: number): V => [v[0] * Math.cos(t) - v[1] * Math.sin(t), v[0] * Math.sin(t) + v[1] * Math.cos(t), v[2]];

interface Skel {
  P: V;
  C: V;
  head: V;
  hips: [V, V];
  knees: [V, V];
  feet: [V, V];
  toes: [V, V];
  sh: [V, V];
  el: [V, V];
  hand: [V, V];
  wdir: [V, V];
  side: V;
}

function solve(d: Dims, p: Pose): Skel {
  const P: V = [0, 0, d.hipZ + p.bob];
  const legs = [p.legL, p.legR];
  const hips: V[] = [];
  const knees: V[] = [];
  const feet: V[] = [];
  const toes: V[] = [];
  [-1, 1].forEach((s, i) => {
    const L = legs[i];
    const H: V = [0, s * d.hipW * (1 + p.spread), P[2]];
    const K = add(H, [Math.sin(L.th) * d.thigh, 0, -Math.cos(L.th) * d.thigh]);
    const a2 = L.th - L.kn;
    const F = add(K, [Math.sin(a2) * d.shin, 0, -Math.cos(a2) * d.shin]);
    hips.push(H);
    knees.push(K);
    feet.push(F);
    toes.push(add(F, [d.limb * 1.4, 0, 0]));
  });
  const C = add(P, [Math.sin(p.lean) * d.torso, 0, Math.cos(p.lean) * d.torso]);
  const side = twistV([0, 1, 0], p.twist);
  const sh: V[] = [];
  const el: V[] = [];
  const hand: V[] = [];
  const wdir: V[] = [];
  const arms = [p.armL, p.armR];
  [-1, 1].forEach((s, i) => {
    const A = arms[i];
    const S = add(C, add(scl(side, s * d.shW), [0, 0, -0.6]));
    const dir = (a: number, ab: number): V => twistV([Math.sin(a) * Math.cos(ab), s * Math.sin(ab), -Math.cos(a) * Math.cos(ab)], p.twist);
    const E = add(S, scl(dir(A.a, A.ab), d.upper));
    const Hd = add(E, scl(dir(A.a + A.el, A.ab * 0.4), d.fore));
    const w = A.a + A.el + A.wr;
    sh.push(S);
    el.push(E);
    hand.push(Hd);
    wdir.push(twistV([Math.sin(w), 0, -Math.cos(w)], p.twist));
  });
  const head = add(C, [Math.sin(p.lean) * d.neck + p.head * 1.2, 0, Math.cos(p.lean) * d.neck + d.headR * 0.9]);
  const sk: Skel = {
    P, C, head, side,
    hips: hips as [V, V], knees: knees as [V, V], feet: feet as [V, V], toes: toes as [V, V],
    sh: sh as [V, V], el: el as [V, V], hand: hand as [V, V], wdir: wdir as [V, V],
  };
  if (p.fall) {
    const c = Math.cos(p.fall);
    const sn = Math.sin(p.fall);
    const rot = (v: V): V => [v[0] * c + v[2] * sn, v[1], Math.max(0.3, v[2] * c - v[0] * sn)];
    const rotD = (v: V): V => [v[0] * c + v[2] * sn, v[1], v[2] * c - v[0] * sn];
    for (const k of ["P", "C", "head"] as const) sk[k] = rot(sk[k]);
    for (const k of ["hips", "knees", "feet", "toes", "sh", "el", "hand"] as const) sk[k] = [rot(sk[k][0]), rot(sk[k][1])];
    sk.wdir = [rotD(sk.wdir[0]), rotD(sk.wdir[1])];
  }
  return sk;
}

// ------------------------------------------------------------------ rasterize
interface Pt {
  x: number;
  y: number;
  d: number;
}
interface DrawPart {
  d: number;
  color: RGB;
  shape: (m: Mask) => void;
  pattern?: (x: number, y: number) => number;
  flat?: boolean;
}

const C = {
  skin: hex("#c98a5a"),
  hair: hex("#3a2214"),
  fur: hex("#7a5430"),
  furDark: hex("#5a3a1e"),
  bootFur: hex("#5e3e22"),
  steel: hex("#c4ccd4"),
  steelDark: hex("#8a929a"),
  wood: hex("#7a4e2a"),
  gold: hex("#c9a040"),
  eye: hex("#1a0e08"),
};

function armorColor(id?: string): { c: RGB; pat?: (x: number, y: number) => number } | null {
  if (!id) return null;
  switch (id) {
    case "quilted_armor":
      return { c: hex("#b8a47c"), pat: (x, y) => ((x + y) % 4 === 0 ? 0.85 : 1) };
    case "leather_armor":
      return { c: hex("#8a5a32") };
    case "hard_leather":
      return { c: hex("#6a4224"), pat: (_x, y) => (y % 3 === 0 ? 0.8 : 1) };
    case "studded_leather":
      return { c: hex("#74482a"), pat: (x, y) => ((x % 3 === 0 && y % 3 === 0) ? 1.7 : 1) };
    case "ring_mail":
      return { c: hex("#8c939b"), pat: (x, y) => ((x + (y % 2)) % 2 === 0 ? 0.82 : 1.05) };
    case "scale_mail":
      return { c: hex("#7e8a86"), pat: (x, y) => ((x + ((y >> 1) % 2)) % 3 === 0 ? 0.75 : 1) };
    case "chain_mail":
      return { c: hex("#a2aab2"), pat: (x, y) => ((x ^ y) & 1 ? 0.84 : 1.06) };
    default:
      return { c: hex("#8a6a4a") };
  }
}

const tierColor = (id: string | undefined, leather: string, metal: string, metalFrom = 7) =>
  id ? hex(BASE_BY_ID[id].qlvl >= metalFrom ? metal : leather) : null;

function render(model: Model, look: Look, anim: Anim, dir: number, f: number): HTMLCanvasElement {
  const [W, H, AX, AY] = SIZE[model];
  const d = DIMS[model];
  const pb = new PB(W, H);
  const p =
    model === "barb" ? barbPose(anim, f, look) : model === "fallen" ? fallenPose(anim, f) : model === "vendor" ? vendorPose(f) : zombiePose(anim, f);
  const sk = solve(d, p);
  const a = (dir * Math.PI) / 4;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const pr = (v: V): Pt => {
    const gx = v[0] * ca - v[1] * sa;
    const gy = v[0] * sa + v[1] * ca;
    return { x: AX + gx, y: AY + gy * 0.5 - v[2], d: gy };
  };
  const parts: DrawPart[] = [];
  const cap = (v0: V, v1: V, r: number, color: RGB, bias = 0, pattern?: (x: number, y: number) => number) => {
    const a0 = pr(v0);
    const a1 = pr(v1);
    parts.push({ d: (a0.d + a1.d) / 2 + bias, color, pattern, shape: (m) => m.capsule(a0.x, a0.y, a1.x, a1.y, r) });
  };
  const disc = (v: V, r: number, color: RGB, bias = 0, ry = r, pattern?: (x: number, y: number) => number) => {
    const q = pr(v);
    parts.push({ d: q.d + bias, color, pattern, shape: (m) => m.ellipse(q.x, q.y, r, ry) });
  };
  const fwd: V = twistV([1, 0, 0], p.twist);
  const faceVisible = Math.sin(a) > -0.25; // front of the head faces the camera
  const scale = d.limb;

  // palette per model
  let skin = C.skin;
  let legC = C.skin;
  let bootC = C.bootFur;
  let torsoC: RGB = C.skin;
  let torsoPat: ((x: number, y: number) => number) | undefined;
  let handC = C.skin;
  if (model === "zombie") {
    skin = hex("#879a64");
    legC = hex("#4c4236");
    bootC = hex("#3c342a");
    torsoC = hex("#5a4c3a");
    torsoPat = (x, y) => (hash2(x, y) < 0.18 ? 1.35 : 1);
    handC = skin;
  } else if (model === "boss") {
    skin = hex("#8a74a8");
    legC = hex("#3a2a44");
    bootC = hex("#2a1e30");
    torsoC = hex("#4a3458");
    torsoPat = (x, y) => (hash2(x, y) < 0.15 ? 1.4 : 1);
    handC = skin;
  } else if (model === "fallen") {
    skin = hex("#b8382a");
    legC = skin;
    bootC = hex("#7a2016");
    torsoC = skin;
    handC = skin;
  } else if (model === "vendor") {
    skin = hex("#d8a07a");
    legC = hex("#2f5a4c");
    bootC = hex("#3a2a1c");
    torsoC = hex("#3c7262");
    handC = skin;
  } else {
    const ar = armorColor(look.chest);
    if (ar) {
      torsoC = ar.c;
      torsoPat = ar.pat;
    }
    bootC = tierColor(look.boots, "#6a4628", "#8a929a", 12) ?? C.bootFur;
    handC = tierColor(look.gloves, "#7a5232", "#9aa2aa", 12) ?? C.skin;
  }

  // legs
  for (let i = 0; i < 2; i++) {
    cap(sk.hips[i], sk.knees[i], scale * 1.1, legC);
    cap(sk.knees[i], sk.feet[i], scale, legC);
    cap(sk.feet[i], sk.toes[i], scale * 0.95, bootC, 0.2);
    if (model === "barb") cap(add(sk.knees[i], [0, 0, -1.5]), sk.feet[i], scale * 1.05, bootC, 0.1);
  }
  // torso
  if (model === "vendor") {
    // long robe down to the ground
    const hem: V = [0.5, 0, 1.5];
    cap(hem, sk.C, 4.2, torsoC, 0, (_x, y) => (y % 5 === 0 ? 0.9 : 1));
    disc(hem, 5, mul(torsoC, 0.9), -0.5, 2.6);
    cap(add(sk.P, [0, -3, 1]), add(sk.P, [0, 3, 1]), 1, hex("#8a6a2a"), 4.4);
  } else {
    const belly = add(sk.P, [0, 0, 1]);
    const tw = model === "fallen" ? 2.6 : model === "boss" ? 5.2 : 3.6;
    cap(belly, sk.C, tw, torsoC, 0, torsoPat);
    cap(add(sk.C, scl(sk.side, -tw * 0.45)), add(sk.C, scl(sk.side, tw * 0.45)), tw * 0.95, torsoC, 0.05, torsoPat);
    if (model === "barb") {
      // fur loincloth and belt
      disc(add(sk.P, [0.3, 0, 0]), 3.1, C.fur, 0.3, 2.2, (x, y) => (hash2(x, y) < 0.25 ? 0.8 : 1));
      cap(add(sk.P, scl(sk.side, -2.8)), add(sk.P, scl(sk.side, 2.8)), 0.9, C.furDark, 2.2);
      if (!look.chest) cap(add(sk.sh[0], [0, 0, -0.5]), add(sk.P, scl(sk.side, 2.5)), 0.8, C.furDark, 3.4);
    }
  }
  // arms (shoulder pads for the barbarian)
  const handFront = [pr(sk.hand[0]).d, pr(sk.hand[1]).d];
  for (let i = 0; i < 2; i++) {
    const armC = model === "vendor" ? torsoC : skin;
    cap(sk.sh[i], sk.el[i], scale * 1.05, armC, 0.3);
    cap(sk.el[i], sk.hand[i], scale * 0.95, armC, 0.4);
    disc(sk.hand[i], scale * 0.95, i === 1 || model !== "barb" ? handC : handC, 0.5);
    if (model === "barb") disc(sk.sh[i], 1.9, look.chest && BASE_BY_ID[look.chest].qlvl >= 11 ? hex("#a2aab2") : C.fur, 0.6);
    if (model === "boss") cap(sk.sh[i], add(sk.sh[i], [0, i ? 1.5 : -1.5, 4]), 1, hex("#e2d6b8"), 0.7);
  }
  // head
  const hd = sk.head;
  const hr = d.headR;
  const headDepth = pr(hd).d;
  if (model === "vendor") {
    disc(hd, hr + 1.1, hex("#2c4a40"), 0.1);
    if (faceVisible) disc(add(hd, scl(fwd, 1.2)), hr * 0.62, skin, 0.4);
  } else {
    disc(hd, hr, skin, 0.1);
    if (model === "barb") {
      // hair at the back, beard in front
      disc(add(hd, add(scl(fwd, -1.2), [0, 0, 0.8])), hr * 0.85, C.hair, -0.1);
      if (faceVisible) cap(add(hd, add(scl(fwd, 1.8), [0, 0, -1.4])), add(hd, add(scl(fwd, 1.2), [0, 0, -3])), 1.2, C.hair, 0.3);
    }
    if (model === "fallen") {
      for (const s of [-1, 1]) cap(add(hd, add(scl(sk.side, s * 1.8), [0, 0, 2])), add(hd, add(scl(sk.side, s * 3.2), [0.5, 0, 4.5])), 0.7, hex("#e6dcc0"), 0.6);
    }
  }
  // helm
  if (model === "barb" && look.head) {
    const q = BASE_BY_ID[look.head].qlvl;
    const hc = q >= 11 ? hex("#a8b0b8") : q >= 5 ? hex("#8e7458") : hex("#7a5636");
    const top = add(hd, [0, 0, 1]);
    const tp = pr(top);
    parts.push({ d: headDepth + 0.25, color: hc, shape: (m) => { m.ellipse(tp.x, tp.y, hr + 0.6, hr * 0.75); m.rect(tp.x - hr - 0.6, tp.y, (hr + 0.6) * 2, 1.2); } });
    if (q >= 15) for (const s of [-1, 1]) cap(add(hd, add(scl(sk.side, s * 2.6), [0, 0, 1.5])), add(hd, add(scl(sk.side, s * 4.6), [0, 0, 4])), 0.7, hex("#e2d8c0"), 0.4);
  }
  // weapons and shield
  const drawWeapon = (i: number, id: string | undefined, small = false) => {
    if (!id) return;
    const b = BASE_BY_ID[id];
    const hnd = sk.hand[i];
    const w = sk.wdir[i];
    const perp: V = [w[2] !== 0 || w[0] !== 0 ? -w[2] : 0, 0, w[0]]; // in the swing plane, toward the edge
    const bias = 0.8;
    if (b.slot === "shield") {
      const q = b.qlvl;
      const r = id === "buckler" ? 2.8 : id === "small_shield" ? 3.4 : 4;
      const ry = id === "kite_shield" || id === "large_shield" ? r * 1.35 : r;
      const at = add(hnd, scl(fwd, 1.4));
      disc(at, r, q > 10 ? hex("#7a5a3a") : hex("#6e4a2a"), 1.2, ry, (x) => (x % 3 === 0 ? 0.85 : 1));
      disc(at, 1, C.steel, 1.3);
      return;
    }
    const two = b.hands === 2;
    if (b.kind === "sword") {
      const L = small ? 5 : two ? 16 : 10 + Math.min(4, b.qlvl / 5) + (b.w === 2 ? 1.5 : 0);
      cap(add(hnd, scl(w, -1.6)), hnd, 0.7, C.wood, bias);
      cap(add(hnd, scl(sk.side, -1.8)), add(hnd, scl(sk.side, 1.8)), 0.6, C.gold, bias + 0.05);
      cap(add(hnd, scl(w, 1)), add(hnd, scl(w, L)), two || b.w === 2 ? 0.95 : 0.7, small ? hex("#b0b0a8") : C.steel, bias + 0.1);
    } else if (b.kind === "axe") {
      const L = two ? 13 : b.w === 2 ? 10 : 8.5;
      cap(add(hnd, scl(w, -2)), add(hnd, scl(w, L)), 0.65, C.wood, bias);
      const tip = add(hnd, scl(w, L - 1.4));
      const big = b.qlvl >= 12 || two;
      cap(add(tip, scl(w, -1.6)), add(tip, scl(w, 1.0)), big ? 1.7 : 1.3, C.steel, bias + 0.1);
      disc(add(tip, scl(perp, big ? 2.4 : 1.8)), big ? 2.1 : 1.6, C.steel, bias + 0.15, big ? 2.6 : 2);
      if (big && (id === "double_axe" || id === "battle_axe" || id === "broad_axe")) disc(add(tip, scl(perp, -2.2)), 1.9, C.steel, bias + 0.15, 2.4);
    } else if (b.kind === "knife") {
      cap(add(hnd, scl(w, -1.2)), add(hnd, scl(w, 0.6)), 0.55, hex("#6a4426"), bias);
      cap(add(hnd, scl(w, 0.8)), add(hnd, scl(w, 4.2)), 0.6, C.steel, bias + 0.1);
    } else if (b.kind === "spear") {
      cap(add(hnd, scl(w, -6)), add(hnd, scl(w, 11)), 0.5, hex("#9a6a3a"), bias);
      cap(add(hnd, scl(w, 10.5)), add(hnd, scl(w, 14)), 0.9, C.steel, bias + 0.1);
    } else if (b.kind === "staff") {
      // held across the body: long both ways from the hand
      cap(add(hnd, scl(w, -9)), add(hnd, scl(w, 12)), 0.75, C.wood, bias);
      cap(add(hnd, scl(w, 10.5)), add(hnd, scl(w, 12.5)), 0.85, C.steelDark, bias + 0.05);
      cap(add(hnd, scl(w, -9)), add(hnd, scl(w, -7.5)), 0.85, C.steelDark, bias + 0.05);
    } else if (b.kind === "mace") {
      const L = two ? 12 : 8;
      const club = id === "club" || id === "spiked_club";
      cap(add(hnd, scl(w, -1.6)), add(hnd, scl(w, L - 2)), club ? 0.9 : 0.6, C.wood, bias);
      const tip = add(hnd, scl(w, L));
      if (club) cap(add(hnd, scl(w, L - 4)), tip, 1.6, hex("#8a5a30"), bias + 0.1);
      else if (id === "maul") cap(add(tip, scl(perp, -2.6)), add(tip, scl(perp, 2.6)), 2, C.steelDark, bias + 0.1);
      else disc(tip, 2, id === "morning_star" ? C.steelDark : C.steel, bias + 0.1);
      if (id === "spiked_club" || id === "morning_star" || id === "flail")
        for (const k of [-1, 1]) cap(tip, add(tip, add(scl(perp, 3 * k), scl(w, 1))), 0.45, C.steel, bias + 0.12);
    }
  };
  if (model === "barb") {
    drawWeapon(1, look.main);
    drawWeapon(0, look.off);
  } else if (model === "fallen") {
    const hnd = sk.hand[1];
    const w = sk.wdir[1];
    cap(add(hnd, scl(w, 0.5)), add(hnd, scl(w, 5)), 0.6, hex("#c8ccc8"), 0.9);
  }
  void handFront;

  // draw back to front
  parts.sort((x, y) => x.d - y.d);
  for (const part of parts) {
    const m = pb.mask();
    part.shape(m);
    pb.part(m, part.color, { edge: true, pattern: part.pattern });
  }
  // eyes on top
  if (faceVisible && model !== "vendor") {
    const e = pr(add(hd, add(scl(fwd, hr * 0.8), [0, 0, 0.3])));
    const eyeC: RGB = model === "boss" ? hex("#ff4a1a") : model === "fallen" ? hex("#ffe14a") : model === "zombie" ? hex("#e8f0a0") : C.eye;
    const sx = Math.round(e.x);
    const sy = Math.round(e.y);
    const sideOff = Math.round(Math.cos(a) * 0) || 0;
    pb.set(sx - 1 + sideOff, sy, eyeC);
    if (Math.abs(Math.cos(a)) < 0.8) pb.set(sx + 1 + sideOff, sy, eyeC);
  } else if (faceVisible) {
    const e = pr(add(hd, add(scl(fwd, hr * 0.9), [0, 0, 0.2])));
    pb.set(Math.round(e.x), Math.round(e.y), C.eye);
  }
  pb.outline(model === "boss" ? hex("#120818") : hex("#120c08"));
  return pb.canvas();
}

function hash2(x: number, y: number) {
  let h = (x * 73856093) ^ (y * 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ cache API
export interface Frame {
  c: HTMLCanvasElement;
  ax: number;
  ay: number;
}
const cache = new Map<string, HTMLCanvasElement>();
const whiteCache = new Map<string, HTMLCanvasElement>();

export const lookKey = (l: Look) => `${l.main ?? ""},${l.off ?? ""},${l.head ?? ""},${l.chest ?? ""},${l.gloves ?? ""},${l.boots ?? ""}`;

export function getFrame(model: Model, look: Look, key: string, anim: Anim, dir: number, f: number, white = false): Frame {
  const n = FRAMES[anim];
  const fi = ((f % n) + n) % n;
  const k = `${model}|${key}|${anim}|${dir}|${fi}`;
  let c = cache.get(k);
  if (!c) {
    c = render(model, look, anim, dir, fi);
    cache.set(k, c);
  }
  if (white) {
    let w = whiteCache.get(k);
    if (!w) {
      w = whiteOf(c);
      whiteCache.set(k, w);
    }
    c = w;
  }
  const [, , ax, ay] = SIZE[model];
  return { c, ax, ay };
}

/** 8-way direction index from a world-space facing (0 = screen right, 2 = screen down). */
export function dirOf(fx: number, fy: number): number {
  const a = Math.atan2(fx + fy, fx - fy);
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}

export function clearSpriteCache() {
  cache.clear();
  whiteCache.clear();
}
