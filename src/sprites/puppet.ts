/**
 * Procedurally authored pixel-art characters. Each model is a small 3D skeleton posed per animation
 * frame, projected for one of 8 directions and rasterized with no anti-aliasing, then shaded and outlined.
 * Frames are generated lazily and cached.
 */
import { LOOK_BY_ID as BASE_BY_ID } from "../data/looks";
import { Mask, PB, type RGB, hex, mul, whiteOf } from "../pixel";

import type { Species } from "../data/monsters";

export type Model = "barb" | "amazon" | "vendor" | Species;
/** Body families: each species borrows one family's skeleton, scaled. */
type Fam = "barb" | "zombie" | "fallen" | "boss" | "vendor";
type Acc =
  | "horns" | "bigHorns" | "spikes" | "crown" | "robe" | "headdress" | "hood" | "bow" | "staff" | "spear" | "blade" | "sword"
  | "shield" | "helm" | "wings" | "tail" | "belly" | "tusks" | "flames" | "mask" | "mane" | "petals" | "wraps";
interface SpeciesDef {
  fam: Fam;
  pose: "barb" | "zombie" | "fallen" | "vendor" | "upright" | "float";
  scale: number;
  /** limb thickness multiplier */
  thin?: number;
  /** head size multiplier */
  head?: number;
  pal?: { skin: string; leg: string; boot: string; torso: string; pat?: "rot" | "ribs" | "wrap" | "scale" | "plate" };
  eye: string;
  outline?: string;
  acc: Acc[];
  /** accessory colors */
  a1?: string;
  a2?: string;
  /** extra headroom (wings, horns, staffs) */
  pad?: number;
}
const SPECIES: Record<Model, SpeciesDef> = {
  barb: { fam: "barb", pose: "barb", scale: 1, eye: "#1a0e08", acc: [] },
  // v1.0: slimmer frame, ponytail, light armor (see AMA_DIMS and the "amazon" branches in render)
  amazon: { fam: "barb", pose: "barb", scale: 1, eye: "#1a2a3a", acc: [] },
  vendor: { fam: "vendor", pose: "vendor", scale: 1, eye: "#1a0e08", acc: [] },
  zombie: { fam: "zombie", pose: "zombie", scale: 1, eye: "#e8f0a0", acc: [] },
  fallen: { fam: "fallen", pose: "fallen", scale: 1, eye: "#ffe14a", acc: ["horns", "blade"] },
  boss: { fam: "boss", pose: "zombie", scale: 1, eye: "#ff4a1a", outline: "#120818", acc: ["spikes"] },
  // Act I
  skeleton: { fam: "zombie", pose: "upright", scale: 0.95, thin: 0.72, eye: "#ff5a1a", pal: { skin: "#d8d0b4", leg: "#cfc6a8", boot: "#a89e80", torso: "#d8d0b4", pat: "ribs" }, acc: ["bow"], a1: "#6a4426" },
  lich: { fam: "boss", pose: "upright", scale: 0.95, thin: 0.8, eye: "#ff8a1a", outline: "#140808", pal: { skin: "#d6ccb0", leg: "#2a1820", boot: "#1a1014", torso: "#3a2030", pat: "ribs" }, acc: ["robe", "crown", "staff", "flames"], a1: "#e0a030", a2: "#ff7a1a", pad: 1.2 },
  // Act II
  mummy: { fam: "zombie", pose: "zombie", scale: 1.02, eye: "#8ae04a", pal: { skin: "#c8b88e", leg: "#b8a87c", boot: "#988a64", torso: "#c0b088", pat: "wrap" }, acc: ["wraps"] },
  raider: { fam: "barb", pose: "upright", scale: 0.9, eye: "#1a0e08", pal: { skin: "#a86a40", leg: "#c8a870", boot: "#6a4a2a", torso: "#b0402a", pat: "wrap" }, acc: ["hood", "blade"], a1: "#d8c090" },
  priest: { fam: "barb", pose: "upright", scale: 0.92, eye: "#f8f070", pal: { skin: "#4a8a5a", leg: "#2a4a6a", boot: "#1a2a3a", torso: "#2a4a7a", pat: "scale" }, acc: ["robe", "headdress", "staff"], a1: "#d0a840", a2: "#f8f070", pad: 1.1 },
  boss2: { fam: "boss", pose: "zombie", scale: 1, eye: "#f8f070", outline: "#140e04", pal: { skin: "#c0a070", leg: "#9a8058", boot: "#6a5a3a", torso: "#a88a58", pat: "wrap" }, acc: ["headdress", "wraps", "spikes"], a1: "#d0a840", a2: "#2a4a8a" },
  sekhet: { fam: "boss", pose: "upright", scale: 0.95, thin: 0.85, eye: "#f8f070", outline: "#140e04", pal: { skin: "#b07a48", leg: "#e8e0c8", boot: "#d0a840", torso: "#d0a840", pat: "plate" }, acc: ["robe", "headdress", "spear", "tail"], a1: "#d0a840", a2: "#2a4a9a", pad: 1.15 },
  // Act III
  lurker: { fam: "boss", pose: "zombie", scale: 0.72, eye: "#bff4ff", pal: { skin: "#4a7a8a", leg: "#3a5a6a", boot: "#2a4a5a", torso: "#3e6a7a", pat: "scale" }, acc: ["tusks", "spikes"], a1: "#d8ecf0" },
  flayer: { fam: "fallen", pose: "fallen", scale: 0.95, eye: "#ffe14a", pal: { skin: "#5a8a3a", leg: "#4a7a2a", boot: "#3a5a1a", torso: "#5a8a3a" }, acc: ["mask", "spear"], a1: "#e6dcc0" },
  spitter: { fam: "fallen", pose: "zombie", scale: 1.2, head: 1.3, eye: "#e0ff40", pal: { skin: "#7aa03a", leg: "#5a7a2a", boot: "#3a5a1a", torso: "#6a9030", pat: "scale" }, acc: ["petals"], a1: "#c0405a" },
  bloater: { fam: "zombie", pose: "zombie", scale: 1, eye: "#e0ff60", pal: { skin: "#8aa850", leg: "#5a6a3a", boot: "#3a4a2a", torso: "#7a9848", pat: "rot" }, acc: ["belly"], a1: "#c8d870" },
  boss3: { fam: "boss", pose: "zombie", scale: 1.02, eye: "#bff4ff", outline: "#06140e", pal: { skin: "#3a6a5a", leg: "#2a4a3a", boot: "#1a3a2a", torso: "#2e5a4a", pat: "scale" }, acc: ["tusks", "mane", "spikes"], a1: "#d8ecd8", a2: "#3a6a2a" },
  mire: { fam: "boss", pose: "zombie", scale: 1.12, head: 1.1, eye: "#e0ff40", outline: "#081406", pal: { skin: "#5a7a3a", leg: "#3a5a2a", boot: "#2a3a1a", torso: "#4a6a2a", pat: "rot" }, acc: ["belly", "bigHorns", "mane"], a1: "#8a9a6a", a2: "#3a6a2a", pad: 1.1 },
  // Act IV
  imp: { fam: "fallen", pose: "fallen", scale: 1, eye: "#ffe14a", pal: { skin: "#c03a18", leg: "#a02a10", boot: "#5a1408", torso: "#b03214" }, acc: ["horns", "wings", "tail"], a1: "#5a1a14", pad: 1.15 },
  knight: { fam: "barb", pose: "upright", scale: 1.1, eye: "#ff3a1a", pal: { skin: "#3a2a2a", leg: "#4a4048", boot: "#2a2228", torso: "#4a4048", pat: "plate" }, acc: ["helm", "shield", "sword"], a1: "#5a4a50", a2: "#8a1a10", pad: 1.1 },
  conjurer: { fam: "barb", pose: "upright", scale: 0.92, eye: "#ff6a1a", pal: { skin: "#8a3a6a", leg: "#2a1218", boot: "#1a0a10", torso: "#3a1420" }, acc: ["robe", "hood", "flames", "horns"], a1: "#2a1218", a2: "#ff6a1a" },
  soul: { fam: "fallen", pose: "float", scale: 1.05, eye: "#fff8e0", outline: "#3a0a00", pal: { skin: "#ff8a2a", leg: "#ff6a1a", boot: "#ff4a10", torso: "#ffa040" }, acc: ["flames"], a2: "#ffd060" },
  boss4: { fam: "boss", pose: "zombie", scale: 1.04, eye: "#ffe040", outline: "#140404", pal: { skin: "#7a2a1a", leg: "#4a1a10", boot: "#2a0e08", torso: "#5a1e12", pat: "plate" }, acc: ["bigHorns", "spikes"], a1: "#2a1a14", pad: 1.1 },
  malakar: { fam: "boss", pose: "upright", scale: 1.2, eye: "#ffe040", outline: "#140202", pal: { skin: "#b02a14", leg: "#4a2420", boot: "#2a1210", torso: "#5a2a22", pat: "plate" }, acc: ["bigHorns", "wings", "sword", "flames", "tail"], a1: "#3a1410", a2: "#ff6a1a", pad: 1.2 },
};
export type Anim = "idle" | "walk" | "atk0" | "atk1" | "thr0" | "thr1" | "cry" | "leap" | "death" | "shoot" | "cast";
export const FRAMES: Record<Anim, number> = { idle: 4, walk: 8, atk0: 6, atk1: 6, thr0: 6, thr1: 6, cry: 4, leap: 3, death: 6, shoot: 6, cast: 4 };

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

const DIMS: Record<Fam, Dims> = {
  barb: { hipZ: 13, hipW: 2.2, thigh: 6.5, shin: 6.5, torso: 8.5, shW: 4.6, upper: 5.4, fore: 5, neck: 2.6, headR: 3.2, limb: 1.45 },
  zombie: { hipZ: 12, hipW: 2, thigh: 6, shin: 6, torso: 8, shW: 4.1, upper: 5.4, fore: 5, neck: 2.4, headR: 3, limb: 1.3 },
  fallen: { hipZ: 6.4, hipW: 1.6, thigh: 3.3, shin: 3.3, torso: 5, shW: 3, upper: 3.4, fore: 3, neck: 1.6, headR: 3.4, limb: 1.1 },
  boss: { hipZ: 17.5, hipW: 3, thigh: 8.8, shin: 8.8, torso: 11.5, shW: 6.2, upper: 7.8, fore: 7, neck: 3.4, headR: 4.2, limb: 2 },
  vendor: { hipZ: 12, hipW: 1.8, thigh: 6, shin: 6, torso: 8, shW: 3.8, upper: 5, fore: 4.5, neck: 2.4, headR: 3, limb: 1.25 },
};

/** v1.0 Amazon: narrower shoulders, slightly wider hips, slimmer limbs, a touch shorter than the Barbarian. */
const AMA_DIMS: Dims = { hipZ: 12.8, hipW: 2.3, thigh: 6.4, shin: 6.4, torso: 8.1, shW: 3.85, upper: 5.2, fore: 4.9, neck: 2.5, headR: 3.0, limb: 1.18 };

const SIZE: Record<Fam, [number, number, number, number]> = {
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
  const mainB = look.main ? BASE_BY_ID[look.main] : null;
  const bow = mainB?.kind === "bow";
  const twoHanded = !!mainB && mainB.hands === 2 && !bow;
  const spear2 = twoHanded && mainB?.kind === "spear";
  const restL =
    bow ? arm(0.55, 0.45, 0.14, 0)
    : offKind === "shield" ? arm(0.55, 1.0, 0.15)
    : offKind === "weapon" ? arm(0.3, 0.55, 0.1, 1.25)
    : twoHanded ? arm(0.6, 0.9, 0.0, 1.2)
    : look.main === "javelin" ? arm(0.6, 0.7, 0.12) // v1.0: free hand forward for balance under the overhead javelin
    : arm(0.12, 0.3, 0.12);
  const restR =
    bow ? arm(0.5, 0.9, 0.02, 0)
    : spear2 ? arm(0.7, 0.55, 0.1, 0.75) // spear point up and forward
    : twoHanded ? arm(0.45, 0.6, 0.1, 1.55) // two-handers: blade raised in a guard
    : arm(0.3, 0.55, 0.1, 1.25);
  const base = pose({ armL: restL, armR: restR });
  if (anim === "shoot") {
    // v1.0: archer stance, bow side forward (the arms themselves are placed by bowArms in render)
    return pose({ armL: arm(1.5, 0.05, 0.1), armR: arm(1.4, 1.6, 0.0), twist: 0.55, lean: 0.04, head: -0.1, legL: leg(0.32, 0.18), legR: leg(-0.28, 0.12), spread: 0.25 });
  }
  if (anim === "cast") {
    // v1.0 Amazon spellcast: free hand thrust forward, palm out, the weapon hand back
    const t = smooth(Math.min(1, (f + 1) / 3));
    return pose({ armL: arm(0.5 + 1.0 * t, 0.5 - 0.4 * t, 0.15), armR: bow ? restR : arm(0.3 + 0.9 * t, 0.9, 0.25 * t, 1.0), lean: 0.12 * t, head: -0.2 * t, legL: leg(0.3, 0.2), legR: leg(-0.25, 0.12) });
  }
  if (spear2 && (anim === "atk0" || anim === "atk1")) {
    // v1.0 spear: pull back, then a straight two-handed thrust (gripTwoHanded puts the other hand on the shaft)
    const t = (f + 0.5) / 6;
    const legs2 = (fr: Leg, bk: Leg) => ({ legL: fr, legR: bk });
    const wind = pose({ armR: arm(0.95, 0.95, 0.1, -0.35), twist: 0.35, lean: -0.05, ...legs2(leg(0.2, 0.2), leg(-0.3, 0.2)) });
    const thrust = pose({ armR: arm(1.5, 0.02, 0.06, 0.0), twist: -0.15, lean: 0.34, ...legs2(leg(0.55, 0.35), leg(-0.4, 0.1)) });
    const hold = pose({ armR: arm(1.4, 0.15, 0.06, 0.0), twist: -0.1, lean: 0.28, ...legs2(leg(0.45, 0.3), leg(-0.3, 0.1)) });
    return keyed([[0, base], [0.3, wind], [0.52, thrust], [0.72, hold], [1, base]], t);
  }
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
      if (twoHanded) {
        // v0.9.1: both hands on the weapon (see gripTwoHanded). atk0 = overhead chop, atk1 = horizontal sweep.
        const legs2 = (fr: Leg, bk: Leg) => ({ legL: fr, legR: bk });
        if (anim === "atk0") {
          const wind = pose({ armR: arm(3.3, 0.3, 0.1, 0.45), twist: 0.15, lean: -0.12, head: -0.2, ...legs2(leg(0.2, 0.2), leg(-0.25, 0.15)) });
          const strike = pose({ armR: arm(1.25, 0.05, 0.05, 0.1), twist: -0.05, lean: 0.32, ...legs2(leg(0.5, 0.35), leg(-0.35, 0.1)) });
          const follow = pose({ armR: arm(0.55, 0.15, 0.05, 0.15), twist: -0.1, lean: 0.3, ...legs2(leg(0.42, 0.3), leg(-0.3, 0.1)) });
          return keyed([[0, base], [0.3, wind], [0.52, strike], [0.74, follow], [1, base]], t);
        }
        const wind = pose({ armR: arm(1.5, 0.1, 0.35, 0.05), twist: 1.05, lean: 0.0, ...legs2(leg(0.15, 0.2), leg(-0.3, 0.2)) });
        const strike = pose({ armR: arm(1.45, 0.05, 0.1, 0.05), twist: -0.55, lean: 0.22, ...legs2(leg(0.45, 0.3), leg(-0.3, 0.1)) });
        const follow = pose({ armR: arm(1.3, 0.15, 0.05, 0.1), twist: -1.0, lean: 0.18, ...legs2(leg(0.38, 0.25), leg(-0.25, 0.1)) });
        return keyed([[0, base], [0.3, wind], [0.52, strike], [0.74, follow], [1, base]], t);
      }
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

// ------------------------------------------------------------------ two-handed grip (v0.9.1)
/** Distance between the two hands along the shaft. */
const GRIP = 2.2;
export const isTwoHanded = (id?: string) => !!id && BASE_BY_ID[id]?.hands === 2;
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
/** Two-bone IK: shoulder S reaching for T. Returns elbow and hand (clamped to reach); `pole` says where the elbow points. */
export function reach(S: V, T: V, up: number, fore: number, pole: V): [V, V] {
  const D = sub(T, S);
  const dist0 = len(D) || 1e-6;
  const u = scl(D, 1 / dist0);
  const dist = Math.min(up + fore - 0.05, Math.max(Math.abs(up - fore) + 0.05, dist0));
  const x = (up * up - fore * fore + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, up * up - x * x));
  let n = sub(pole, scl(u, dot(pole, u)));
  const nl = len(n);
  n = nl > 1e-6 ? scl(n, 1 / nl) : [0, 0, -1];
  return [add(S, add(scl(u, x), scl(n, h))), add(S, scl(u, dist))];
}
/**
 * Put both hands on a two-handed weapon. The pose's right arm decides where the weapon is and where it points;
 * the grip is pulled toward the middle of the chest, the main hand holds the top of the grip and the other hand
 * sits GRIP lower on the shaft. Both arms are re-solved with IK, elbows out and down.
 */
function gripTwoHanded(sk: Skel, d: Dims) {
  const w = sk.wdir[1];
  const G0 = sk.hand[1];
  const lat = dot(sub(G0, sk.C), sk.side);
  let G = sub(G0, scl(sk.side, lat * 0.6)); // toward the midline
  // keep the grip in front of the chest so the arms don't clip through the body
  const fwd: V = [sk.side[1], -sk.side[0], 0];
  const ahead = dot(sub(G, sk.C), fwd);
  if (ahead < 3) G = add(G, scl(fwd, 3 - ahead));
  // if either hand can't reach, slide the grip toward a point just in front of the chest until both can
  const mid = add(scl(add(sk.sh[0], sk.sh[1]), 0.5), add(scl(fwd, 3), [0, 0, -1.5]));
  const maxR = d.upper + d.fore - 0.25;
  for (let k = 0; k < 24; k++) {
    const t0 = add(G, scl(w, GRIP * 0.5));
    const l0 = add(G, scl(w, -GRIP * 0.5));
    if (len(sub(t0, sk.sh[1])) <= maxR && len(sub(l0, sk.sh[0])) <= maxR) break;
    G = add(G, scl(sub(mid, G), 0.2));
  }
  const top = add(G, scl(w, GRIP * 0.5));
  const low = add(G, scl(w, -GRIP * 0.5));
  for (const i of [0, 1]) {
    const s = i ? 1 : -1;
    const [E, Hd] = reach(sk.sh[i], i ? top : low, d.upper, d.fore, add(scl(sk.side, s * 3), [0, 0, -2]));
    sk.el[i] = E;
    sk.hand[i] = Hd;
  }
  sk.wdir[0] = w;
  // grip distance between the two hands actually reached (used by tests)
  lastGrip = len(sub(sk.hand[1], sk.hand[0]));
  lastGripErr = Math.max(len(sub(sk.hand[1], top)), len(sub(sk.hand[0], low)));
}
/** Debug/test: how far the hands ended up from the shaft in the last two-handed frame. */
export let lastGrip = 0;
export let lastGripErr = 0;

const norm = (v: V): V => scl(v, 1 / (len(v) || 1));
const lerpV = (a: V, b: V, t: number): V => add(a, scl(sub(b, a), t));
const X: V = [1, 0, 0]; // the true facing (aim) direction, independent of torso twist
const UP: V = [0, 0, 1];

/** Keyframed hand target + weapon direction, eased between keys. */
function keyedIK(keys: [number, V, V][], t: number): [V, V] {
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, p0, w0] = keys[i - 1];
      const [t1, p1, w1] = keys[i];
      const u = smooth((t - t0) / (t1 - t0));
      return [lerpV(p0, p1, u), norm(lerpV(w0, w1, u))];
    }
  }
  const k = keys[keys.length - 1];
  return [k[1], k[2]];
}

/**
 * v1.0 overhead javelin grip (D2 style), for the Barbarian and the Amazon: the throwing hand is held up beside
 * the head with the shaft level above the shoulder, point forward. The melee stab thrusts forward from there and
 * the throw cocks back and releases from the same grip. Re-solves the right arm with IK; true facing is +X.
 */
function javArms(sk: Skel, d: Dims, anim: Anim, f: number, walkPh: number) {
  const S = sk.sh[1];
  const sd = sk.side;
  const at = (fw: number, out: number, up: number): V => add(S, add(scl(X, fw), add(scl(sd, out), scl(UP, up))));
  const restW = norm([1, 0, -0.12]);
  const rest = at(0.6 + 0.25 * Math.sin(walkPh), 1.1, 3.4);
  let T = rest;
  let w = restW;
  const n = FRAMES[anim];
  const t = (f + 0.5) / n;
  if (anim === "atk0") {
    [T, w] = keyedIK([
      [0, rest, restW],
      [0.28, at(-0.9, 1.1, 3.9), norm([1, 0, -0.05])],
      [0.5, at(d.upper + d.fore - 1.4, 0.3, 2.4), norm([1, 0, -0.1])],
      [0.72, at(d.upper + d.fore - 2.4, 0.4, 2.6), norm([1, 0, -0.1])],
      [1, rest, restW],
    ], t);
  } else if (anim === "thr0") {
    [T, w] = keyedIK([
      [0, rest, restW],
      [0.35, at(-2.6, 1.3, 3.6), norm([1, 0, 0.2])],
      [0.55, at(6, 0.4, 3.0), norm([1, 0, -0.05])],
      [0.78, at(5, 0.2, -1.5), norm([1, 0, -0.6])],
      [1, rest, restW],
    ], t);
  }
  const [E, Hd] = reach(S, T, d.upper, d.fore, add(scl(sd, 3), [0, 0, -2]));
  sk.el[1] = E;
  sk.hand[1] = Hd;
  sk.wdir[1] = w;
}
export let lastJavHand: V = [0, 0, 0];

interface BowState {
  /** where the string is pulled to (null = string at rest) */
  nock: V | null;
  arrow: boolean;
}
/**
 * v1.0 bow hold: the bow is held in the LEFT hand (vertical), the right hand sits on the string. In the shoot
 * animation the bow arm extends toward the target and the right hand draws the string back to the chin, then
 * releases. Both arms are re-solved with IK so the hands are always on the bow and the string.
 */
function bowArms(sk: Skel, d: Dims, anim: Anim, f: number): BowState {
  const sd = sk.side;
  if (anim === "shoot") {
    const ext = [0.7, 0.95, 1, 1, 0.95, 0.8][f] ?? 1;
    const draw = [0.3, 0.75, 1, 0, 0, 0][f] ?? 0;
    const released = f >= 3;
    const G = add(sk.sh[0], add(scl(X, (d.upper + d.fore - 0.6) * ext), [0, 0, 0.4 - (1 - ext) * 3]));
    const chin = add(sk.head, add(scl(X, 0.8), add(scl(sd, 0.9), [0, 0, -2.4])));
    const N = released ? add(chin, add(scl(X, -1.6 + f * 0.3), add(scl(sd, 1.4), [0, 0, -0.4 * (f - 3)]))) : lerpV(add(G, scl(X, -1.2)), chin, draw);
    const [E0, H0] = reach(sk.sh[0], G, d.upper, d.fore, add(scl(sd, -3), [0, 0, -2]));
    const [E1, H1] = reach(sk.sh[1], N, d.upper, d.fore, add(scl(sd, 3), [0, 0, 0.5]));
    sk.el[0] = E0;
    sk.hand[0] = H0;
    sk.el[1] = E1;
    sk.hand[1] = H1;
    sk.wdir[0] = UP;
    return { nock: released ? null : H1, arrow: !released };
  }
  // idle / walk / cast / leap: bow low in front, right hand resting near the grip on the string
  const G = sk.hand[0];
  const R = add(G, add(scl(X, -1.3), add(scl(sd, 0.9), [0, 0, 1.6])));
  const [E1, H1] = reach(sk.sh[1], R, d.upper, d.fore, add(scl(sd, 3), [0, 0, -2]));
  if (anim !== "cast" && anim !== "cry") {
    sk.el[1] = E1;
    sk.hand[1] = H1;
  }
  // canted across the body so it reads from the front as well as the side
  sk.wdir[0] = norm(add(add(UP, scl(sd, -0.55)), scl(X, 0.3)));
  return { nock: null, arrow: false };
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

/** v1.0 Amazon take on the same armor items: cloth, leathers and bronze-toned scales, never grey plate. */
function amaArmor(id?: string): { c: RGB; pat?: (x: number, y: number) => number } {
  switch (id) {
    case undefined:
      return { c: hex("#d9a274") };
    case "quilted_armor":
      return { c: hex("#d4ccb4"), pat: (x, y) => ((x + y) % 4 === 0 ? 0.85 : 1) };
    case "leather_armor":
      return { c: hex("#74401f") };
    case "hard_leather":
      return { c: hex("#683a1c"), pat: (_x, y) => (y % 3 === 0 ? 0.8 : 1) };
    case "studded_leather":
      return { c: hex("#6a3c22"), pat: (x, y) => ((x % 3 === 0 && y % 3 === 0) ? 1.8 : 1) };
    case "ring_mail":
      return { c: hex("#a08a5a"), pat: (x, y) => ((x + (y % 2)) % 2 === 0 ? 0.85 : 1.05) };
    case "scale_mail":
      return { c: hex("#b0904e"), pat: (x, y) => ((x + ((y >> 1) % 2)) % 3 === 0 ? 0.74 : 1.06) };
    case "chain_mail":
      return { c: hex("#b8aa86"), pat: (x, y) => ((x ^ y) & 1 ? 0.86 : 1.05) };
    default:
      return { c: hex("#9a6e44") };
  }
}

const tierColor = (id: string | undefined, leather: string, metal: string, metalFrom = 7) =>
  id ? hex(BASE_BY_ID[id].qlvl >= metalFrom ? metal : leather) : null;

/** Sprite size [w, h, anchorX, anchorY] for any model. */
function sizeOf(model: Model): [number, number, number, number] {
  const sp = SPECIES[model];
  const [bw, bh, , bay] = SIZE[sp.fam];
  if (sp.scale === 1 && !sp.pad) return SIZE[sp.fam];
  const W = Math.ceil(bw * sp.scale * (sp.pad ?? 1));
  const H = Math.ceil(bh * sp.scale * (sp.pad ?? 1));
  return [W, H, Math.floor(W / 2), H - Math.ceil((bh - bay) * sp.scale)];
}
function dimsOf(model: Model): Dims {
  if (model === "amazon") return AMA_DIMS;
  const sp = SPECIES[model];
  const b = DIMS[sp.fam];
  if (sp.scale === 1 && !sp.thin && !sp.head) return b;
  const o = { ...b };
  for (const k of Object.keys(o) as (keyof Dims)[]) o[k] *= sp.scale;
  o.limb *= sp.thin ?? 1;
  o.headR *= sp.head ?? 1;
  return o;
}
/** Height of the top of the head above the feet, in sprite pixels (for health bars). */
export function spriteTop(model: Model): number {
  const d = dimsOf(model);
  return d.hipZ + d.torso + d.neck + d.headR * 1.9;
}

function render(model: Model, look: Look, anim: Anim, dir: number, f: number): HTMLCanvasElement {
  const [W, H, AX, AY] = sizeOf(model);
  const sp = SPECIES[model];
  const acc = new Set(sp.acc);
  const d = dimsOf(model);
  const pb = new PB(W, H);
  let p =
    sp.pose === "barb" ? barbPose(anim, f, look) : sp.pose === "upright" ? barbPose(anim, f, {}) : sp.pose === "fallen" || sp.pose === "float" ? fallenPose(anim, f) : sp.pose === "vendor" ? vendorPose(f) : zombiePose(anim, f);
  if (sp.pose === "float") p = { ...p, bob: p.bob + 3 + Math.sin((f / 4) * Math.PI) * 0.8, legL: leg(0.9, 1.6), legR: leg(0.7, 1.5) };
  const fam = sp.fam;
  const sk = solve(d, p);
  const hero = model === "barb" || model === "amazon";
  const ama = model === "amazon";
  const mainKind = look.main ? BASE_BY_ID[look.main]?.kind : undefined;
  let bowSt: BowState = { nock: null, arrow: false };
  if (sp.pose === "barb" && anim !== "death") {
    if (mainKind === "bow") bowSt = bowArms(sk, d, anim, f);
    else if (look.main === "javelin" && (anim === "idle" || anim === "walk" || anim === "atk0" || anim === "thr0")) {
      javArms(sk, d, anim, f, anim === "walk" ? (f / FRAMES.walk) * Math.PI * 2 : 0);
      lastJavHand = sk.hand[1];
    } else if (isTwoHanded(look.main)) gripTwoHanded(sk, d);
  }
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
  } else if (ama) {
    // v1.0: same armor items, lighter look: leather and bronze scale instead of steel plates
    skin = hex("#d9a274");
    legC = skin;
    const ar = amaArmor(look.chest);
    torsoC = ar.c;
    torsoPat = ar.pat;
    bootC = tierColor(look.boots, "#5a3418", "#9a7a4a", 12) ?? hex("#5a3418");
    handC = tierColor(look.gloves, "#8a6040", "#a88a58", 12) ?? skin;
  } else if (model !== "barb") {
    // set from the species palette below
  } else {
    const ar = armorColor(look.chest);
    if (ar) {
      torsoC = ar.c;
      torsoPat = ar.pat;
    }
    bootC = tierColor(look.boots, "#6a4628", "#8a929a", 12) ?? C.bootFur;
    handC = tierColor(look.gloves, "#7a5232", "#9aa2aa", 12) ?? C.skin;
  }

  if (sp.pal) {
    skin = hex(sp.pal.skin);
    legC = hex(sp.pal.leg);
    bootC = hex(sp.pal.boot);
    torsoC = hex(sp.pal.torso);
    handC = skin;
    const pt = sp.pal.pat;
    torsoPat =
      pt === "rot" ? (x, y) => (hash2(x, y) < 0.18 ? 1.35 : 1)
      : pt === "ribs" ? (_x, y) => (y % 2 === 0 ? 0.62 : 1.05)
      : pt === "wrap" ? (x, y) => ((y + (x >> 2)) % 3 === 0 ? 0.78 : 1)
      : pt === "scale" ? (x, y) => ((x + ((y >> 1) % 2)) % 3 === 0 ? 0.8 : 1.05)
      : pt === "plate" ? (x, y) => (y % 4 === 0 ? 0.7 : x % 5 === 0 ? 1.25 : 1)
      : undefined;
  }
  const A1 = hex(sp.a1 ?? "#e6dcc0");
  const A2 = hex(sp.a2 ?? "#ff8a2a");

  // legs
  for (let i = 0; i < 2; i++) {
    cap(sk.hips[i], sk.knees[i], scale * 1.1, legC);
    cap(sk.knees[i], sk.feet[i], scale, legC);
    cap(sk.feet[i], sk.toes[i], scale * 0.95, bootC, 0.2);
    if (model === "barb") cap(add(sk.knees[i], [0, 0, -1.5]), sk.feet[i], scale * 1.05, bootC, 0.1);
    if (ama) cap(add(sk.knees[i], [0, 0, -0.8]), sk.feet[i], scale * 1.0, bootC, 0.1, (_x, y) => (y % 3 === 0 ? 0.78 : 1));
  }
  // torso
  if (acc.has("robe")) {
    const hem: V = [0.4, 0, 1.2 * d.limb];
    cap(hem, sk.C, d.shW * 0.95, legC, -0.1, (_x, y) => (y % 5 === 0 ? 0.85 : 1));
    disc(hem, d.shW * 1.1, mul(legC, 0.85), -0.4, d.shW * 0.55);
  }
  if (model === "vendor") {
    // long robe down to the ground
    const hem: V = [0.5, 0, 1.5];
    cap(hem, sk.C, 4.2, torsoC, 0, (_x, y) => (y % 5 === 0 ? 0.9 : 1));
    disc(hem, 5, mul(torsoC, 0.9), -0.5, 2.6);
    cap(add(sk.P, [0, -3, 1]), add(sk.P, [0, 3, 1]), 1, hex("#8a6a2a"), 4.4);
  } else {
    const belly = add(sk.P, [0, 0, 1]);
    const tw = ama ? 2.85 : (fam === "fallen" ? 2.6 : fam === "boss" ? 5.2 : 3.6) * sp.scale * (sp.thin ? Math.max(0.8, sp.thin) : 1);
    cap(ama ? add(sk.P, [0, 0, 2.2]) : belly, sk.C, tw, torsoC, 0, torsoPat);
    if (acc.has("belly")) {
      // swollen gut, drawn as a sphere around the lower torso so it shows from every side
      const c = add(sk.P, add(scl(fwd, tw * 0.35), [0, 0, d.torso * 0.4]));
      parts.push({ d: pr(c).d + 0.6, color: A1, pattern: (x, y) => (hash2(x, y) < 0.2 ? 1.25 : (x + y) % 7 === 0 ? 0.85 : 1), shape: (m) => { const q = pr(c); m.ellipse(q.x, q.y, tw * 1.45, tw * 1.25); } });
    }
    cap(add(sk.C, scl(sk.side, -tw * 0.45)), add(sk.C, scl(sk.side, tw * 0.45)), tw * 0.95, torsoC, 0.05, torsoPat);
    if (ama) {
      // leather strip skirt (pteruges) and belt; bare midriff only without armor
      const skirt = mul(torsoC, 0.82);
      disc(add(sk.P, [0.2, 0, -0.6]), 3.0, look.chest ? skirt : hex("#8a5a32"), 0.3, 2.6, (x) => (x % 2 === 0 ? 0.78 : 1));
      cap(add(sk.P, add(scl(sk.side, -2.4), [0, 0, 1])), add(sk.P, add(scl(sk.side, 2.4), [0, 0, 1])), 0.8, hex("#5a3a1e"), 2.2);
      if (!look.chest) cap(add(sk.C, scl(sk.side, -2)), add(sk.C, scl(sk.side, 2)), 1.6, hex("#8a3a2a"), 2.4);
    }
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
    if (ama && look.chest && BASE_BY_ID[look.chest].qlvl >= 7) disc(sk.sh[i], 1.35, BASE_BY_ID[look.chest].qlvl >= 11 ? hex("#b89a5a") : mul(torsoC, 0.85), 0.6, 1.1);
    if (ama && look.gloves) cap(add(sk.el[i], scl(sub(sk.hand[i], sk.el[i]), 0.45)), sk.hand[i], scale * 1.02, handC, 0.45);
    if (acc.has("spikes")) cap(sk.sh[i], add(sk.sh[i], [0, i ? 1.5 * sp.scale : -1.5 * sp.scale, 4 * sp.scale]), 1, model === "boss" ? hex("#e2d6b8") : A1, 0.7);
    if (acc.has("flames")) disc(add(sk.hand[i], [0, 0, 1.2]), d.limb * 1.5, A2, 0.7, d.limb * 2);
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
    if (ama) {
      // blonde hair with a ponytail; no beard
      const hairC = hex("#d8a84a");
      disc(add(hd, add(scl(fwd, -1.0), [0, 0, 0.9])), hr * 0.92, hairC, -0.1);
      const tie = add(hd, add(scl(fwd, -hr * 0.95), [0, 0, 0.6]));
      const t1 = add(tie, add(scl(fwd, -1.6), [0, 0, -2.6]));
      const t2 = add(t1, add(scl(fwd, -0.4), [0, 0, -2.6]));
      cap(tie, t1, 1.05, hairC, -0.3);
      cap(t1, t2, 0.8, mul(hairC, 0.9), -0.3);
      if (faceVisible) disc(add(hd, add(scl(fwd, 0.9), [0, 0, 1.9])), hr * 0.62, hairC, 0.2, hr * 0.32); // fringe
    }
    if (model === "barb") {
      // hair at the back, beard in front
      disc(add(hd, add(scl(fwd, -1.2), [0, 0, 0.8])), hr * 0.85, C.hair, -0.1);
      if (faceVisible) cap(add(hd, add(scl(fwd, 1.8), [0, 0, -1.4])), add(hd, add(scl(fwd, 1.2), [0, 0, -3])), 1.2, C.hair, 0.3);
    }
    if (acc.has("horns")) {
      const k = hr / 3.4;
      for (const s of [-1, 1]) cap(add(hd, add(scl(sk.side, s * 1.8 * k), [0, 0, 2 * k])), add(hd, add(scl(sk.side, s * 3.2 * k), [0.5, 0, 4.5 * k])), 0.7, model === "fallen" ? hex("#e6dcc0") : model === "conjurer" ? hex("#c8b8a0") : hex("#2a1a14"), 0.6);
    }
  }
  // species accessories on the head
  if (acc.has("bigHorns"))
    for (const s of [-1, 1]) {
      const b0 = add(hd, add(scl(sk.side, s * hr * 0.7), [0, 0, hr * 0.5]));
      const b1 = add(hd, add(scl(sk.side, s * hr * 1.7), [0, 0, hr * 1.1]));
      const b2 = add(hd, add(scl(sk.side, s * hr * 1.9), [hr * 0.3, 0, hr * 2.2]));
      cap(b0, b1, hr * 0.32, hex("#2a1e18"), 0.5);
      cap(b1, b2, hr * 0.22, hex("#c8b8a0"), 0.55);
    }
  if (acc.has("crown")) {
    const top = add(hd, [0, 0, hr * 0.8]);
    cap(add(top, scl(sk.side, -hr * 0.8)), add(top, scl(sk.side, hr * 0.8)), 0.8, A1, 0.6);
    for (const s of [-1, 0, 1]) cap(add(top, scl(sk.side, s * hr * 0.6)), add(top, add(scl(sk.side, s * hr * 0.7), [0, 0, 2.4])), 0.5, A1, 0.62);
  }
  if (acc.has("headdress")) {
    disc(add(hd, add(scl(fwd, -0.8), [0, 0, 0.6])), hr * 1.25, A2, 0.05, hr * 1.2, (_x, y) => (y % 2 === 0 ? 1.5 : 1));
    for (const s of [-1, 1]) cap(add(hd, scl(sk.side, s * hr * 0.9)), add(sk.sh[s < 0 ? 0 : 1], [0, 0, 0.5]), hr * 0.4, A1, 0.15, (_x, y) => (y % 2 === 0 ? 0.7 : 1));
  }
  if (acc.has("hood")) {
    disc(add(hd, add(scl(fwd, -0.6), [0, 0, 0.5])), hr * 1.22, A1, 0.15, hr * 1.25);
    if (faceVisible) disc(add(hd, scl(fwd, hr * 0.5)), hr * 0.6, mul(skin, 0.5), 0.3);
  }
  if (acc.has("helm")) {
    const top = pr(add(hd, [0, 0, 0.6]));
    parts.push({ d: headDepth + 0.25, color: A1, shape: (m) => { m.ellipse(top.x, top.y, hr + 0.8, hr * 0.85); m.rect(top.x - hr - 0.8, top.y, (hr + 0.8) * 2, hr * 0.9); } });
    for (const s of [-1, 1]) cap(add(hd, add(scl(sk.side, s * hr), [0, 0, hr * 0.6])), add(hd, add(scl(sk.side, s * hr * 1.7), [0, 0, hr * 1.8])), 0.7, hex("#c8b8a0"), 0.4);
  }
  if (acc.has("tusks") && faceVisible)
    for (const s of [-1, 1]) cap(add(hd, add(scl(fwd, hr * 0.8), add(scl(sk.side, s * hr * 0.5), [0, 0, -hr * 0.5]))), add(hd, add(scl(fwd, hr * 1.3), add(scl(sk.side, s * hr * 0.6), [0, 0, hr * 0.3]))), 0.6, A1, 0.5);
  if (acc.has("mask") && faceVisible) disc(add(hd, scl(fwd, hr * 0.6)), hr * 0.75, A1, 0.35, hr * 0.9);
  if (acc.has("mane")) for (const s of [-1, -0.4, 0.4, 1]) cap(add(hd, add(scl(fwd, -hr * 0.6), scl(sk.side, s * hr * 0.8))), add(hd, add(scl(fwd, -hr * 0.9), add(scl(sk.side, s * hr), [0, 0, -hr * 2.6]))), 0.7, A2, -0.2);
  if (acc.has("petals")) for (let i = 0; i < 5; i++) {
    const an = (i / 5) * Math.PI * 2;
    cap(add(hd, [0, 0, hr * 0.4]), add(hd, add(scl(fwd, Math.cos(an) * hr * 1.5), add(scl(sk.side, Math.sin(an) * hr * 1.5), [0, 0, hr * 0.9]))), hr * 0.35, A1, Math.cos(an) * 0.4);
  }
  if (acc.has("wraps")) for (const k of [0.3, 0.6]) cap(add(sk.C, add(scl(sk.side, -2), [1, 0, -d.torso * k])), add(sk.C, add(scl(sk.side, 2.5), [1, 0, -d.torso * k - 1.5])), 0.5, mul(torsoC, 0.75), 0.3);
  if (acc.has("wings"))
    for (const s of [-1, 1]) {
      const root = add(sk.C, add(scl(fwd, -d.shW * 0.4), scl(sk.side, s * d.shW * 0.4)));
      const tip = add(root, add(scl(sk.side, s * d.shW * 2.2), add(scl(fwd, -d.shW * 0.4), [0, 0, d.torso * 0.9])));
      const low = add(root, add(scl(sk.side, s * d.shW * 1.8), [0, 0, -d.torso * 0.6]));
      cap(root, tip, d.limb * 0.7, A1, -1.2);
      cap(tip, low, d.limb * 1.4, A1, -1.3);
      cap(root, low, d.limb * 1.8, mul(A1, 1.2), -1.4);
    }
  if (acc.has("tail")) {
    const t0 = add(sk.P, scl(fwd, -d.hipW));
    const t1 = add(t0, add(scl(fwd, -d.thigh * 0.9), [0, 0, -d.hipZ * 0.5]));
    const t2 = add(t1, add(scl(fwd, -d.thigh * 0.6), add(scl(sk.side, d.hipW), [0, 0, -d.hipZ * 0.3])));
    cap(t0, t1, d.limb * 0.8, model === "sekhet" ? hex("#3a7a4a") : skin, -0.8);
    cap(t1, t2, d.limb * 0.55, model === "sekhet" ? hex("#3a7a4a") : skin, -0.8);
  }
  if (model === "soul") disc(add(hd, [0, 0, hr * 0.9]), hr * 0.9, A2, 0.5, hr * 1.4);
  // helm
  if (ama && look.head) {
    // light headgear: headband -> leather cap -> winged circlet; the hair and ponytail stay visible
    const q = BASE_BY_ID[look.head].qlvl;
    const hc = q >= 11 ? hex("#c8b070") : q >= 5 ? hex("#9a7a52") : hex("#7a5636");
    if (q >= 5 && q < 11) {
      const top = pr(add(hd, [0, 0, 1.3]));
      parts.push({ d: headDepth + 0.25, color: hc, shape: (m) => { m.ellipse(top.x, top.y, hr + 0.3, hr * 0.62); } });
    }
    const band = add(hd, [0, 0, 1.2]);
    for (const s of [-1, 1]) cap(add(band, scl(fwd, hr * 0.9)), add(band, add(scl(sk.side, s * hr * 0.95), scl(fwd, -hr * 0.2))), 0.55, hc, 0.3);
    if (q >= 11) for (const s of [-1, 1]) cap(add(hd, add(scl(sk.side, s * hr), [0, 0, 1.4])), add(hd, add(scl(sk.side, s * hr * 1.5), add(scl(fwd, -1.2), [0, 0, 3.2]))), 0.55, hex("#e8e0d0"), 0.4);
  }
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
    if (b.kind === "quiver") {
      // on the back, diagonal, fletchings poking out over the right shoulder
      const back = scl(fwd, -1);
      const top = add(sk.C, add(scl(back, 2.4), add(scl(sk.side, 1.6), [0, 0, 1.6])));
      const bot = add(sk.P, add(scl(back, 2.2), add(scl(sk.side, -1.2), [0, 0, 1])));
      cap(top, bot, 1.15, hex("#6a4224"), 0, (_x, y) => (y % 4 === 0 ? 0.75 : 1));
      const dirQ = norm(sub(top, bot));
      for (const k of [-0.6, 0, 0.6]) {
        const base = add(top, scl(sk.side, k));
        cap(base, add(base, scl(dirQ, 2.2)), 0.45, k === 0 ? hex("#e8e0d0") : hex("#b83a2a"), 0.05);
      }
      return;
    }
    if (b.kind === "bow") {
      const L = b.h >= 4 ? 10.5 : 8.2; // long bows are taller
      const g = sk.hand[0];
      const u: V = norm(sk.wdir[0]);
      const out = norm(sub(X, scl(u, dot(X, u))));
      const pts: V[] = [];
      for (const t of [-1, -0.62, -0.28, 0, 0.28, 0.62, 1]) pts.push(add(g, add(scl(u, L * t), scl(out, -1.9 * t * t + 0.3))));
      const limb = id.includes("battle") ? hex("#3e2614") : hex("#5a3418");
      for (let k = 0; k < pts.length - 1; k++) cap(pts[k], pts[k + 1], k === 2 || k === 3 ? 0.62 : 0.5, limb, bias + 0.2);
      disc(g, 0.75, hex("#3a2616"), bias + 0.3);
      if (id.includes("battle")) for (const e of [pts[0], pts[6]]) disc(e, 0.55, C.steel, bias + 0.25);
      const s0 = pts[0];
      const s1 = pts[6];
      const sc = hex("#e8e0d0");
      if (bowSt.nock) {
        cap(s0, bowSt.nock, 0.18, sc, bias + 0.35);
        cap(bowSt.nock, s1, 0.18, sc, bias + 0.35);
        if (bowSt.arrow) {
          const tip = add(g, scl(X, 2.6));
          cap(bowSt.nock, tip, 0.3, hex("#b08a5a"), bias + 0.4);
          disc(tip, 0.5, C.steel, bias + 0.45);
          disc(add(bowSt.nock, scl(X, 0.6)), 0.5, hex("#b83a2a"), bias + 0.42);
        }
      } else cap(s0, s1, 0.18, sc, bias + 0.15);
      return;
    }
    if (b.kind === "spear" && two) {
      // two-handed spear / pike: long shaft past both hands, leaf blade
      const L = id === "pike" ? 18 : 15.5;
      cap(add(hnd, scl(w, -(GRIP + 5))), add(hnd, scl(w, L)), 0.55, hex("#8a5e34"), bias);
      cap(add(hnd, scl(w, L - 0.5)), add(hnd, scl(w, L + 4)), 1.0, C.steel, bias + 0.1);
      cap(add(hnd, add(scl(w, L - 0.4), scl(perp, -1.2))), add(hnd, add(scl(w, L - 0.4), scl(perp, 1.2))), 0.4, C.steelDark, bias + 0.12);
      return;
    }
    if (b.kind === "sword") {
      const L = small ? 5 : two ? 16 : 10 + Math.min(4, b.qlvl / 5) + (b.w === 2 ? 1.5 : 0);
      cap(add(hnd, scl(w, two ? -(GRIP + 1.4) : -1.6)), hnd, 0.7, C.wood, bias);
      cap(add(hnd, scl(sk.side, -1.8)), add(hnd, scl(sk.side, 1.8)), 0.6, C.gold, bias + 0.05);
      cap(add(hnd, scl(w, 1)), add(hnd, scl(w, L)), two || b.w === 2 ? 0.95 : 0.7, small ? hex("#b0b0a8") : C.steel, bias + 0.1);
    } else if (b.kind === "axe") {
      const L = two ? 13 : b.w === 2 ? 10 : 8.5;
      cap(add(hnd, scl(w, two ? -(GRIP + 1.6) : -2)), add(hnd, scl(w, L)), 0.65, C.wood, bias);
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
      cap(add(hnd, scl(w, two ? -(GRIP + 1.4) : -1.6)), add(hnd, scl(w, L - 2)), club ? 0.9 : 0.6, C.wood, bias);
      const tip = add(hnd, scl(w, L));
      if (club) cap(add(hnd, scl(w, L - 4)), tip, 1.6, hex("#8a5a30"), bias + 0.1);
      else if (id === "maul") cap(add(tip, scl(perp, -2.6)), add(tip, scl(perp, 2.6)), 2, C.steelDark, bias + 0.1);
      else disc(tip, 2, id === "morning_star" ? C.steelDark : C.steel, bias + 0.1);
      if (id === "spiked_club" || id === "morning_star" || id === "flail")
        for (const k of [-1, 1]) cap(tip, add(tip, add(scl(perp, 3 * k), scl(w, 1))), 0.45, C.steel, bias + 0.12);
    }
  };
  if (hero) {
    drawWeapon(1, look.main);
    drawWeapon(0, look.off);
  }
  {
    const k = d.thigh / 6;
    const hnd = sk.hand[1];
    const w = sk.wdir[1];
    if (acc.has("blade")) cap(add(hnd, scl(w, 0.5)), add(hnd, scl(w, model === "fallen" ? 5 : 8 * k)), 0.6, hex("#c8ccc8"), 0.9);
    if (acc.has("sword")) {
      cap(add(hnd, scl(w, -1.5)), hnd, 0.7, hex("#3a2a20"), 0.8);
      cap(add(hnd, scl(sk.side, -2)), add(hnd, scl(sk.side, 2)), 0.6, A2, 0.85);
      cap(add(hnd, scl(w, 1)), add(hnd, scl(w, 13 * k)), 1.1, hex("#3a3438"), 0.9);
      cap(add(hnd, scl(w, 2)), add(hnd, scl(w, 12 * k)), 0.45, A2, 0.95);
    }
    if (acc.has("spear")) {
      cap(add(hnd, scl(w, -5 * k)), add(hnd, scl(w, 10 * k)), 0.5, model === "sekhet" ? A1 : hex("#9a6a3a"), 0.8);
      cap(add(hnd, scl(w, 9.5 * k)), add(hnd, scl(w, 12.5 * k)), 0.85, model === "sekhet" ? A2 : hex("#c8ccc8"), 0.9);
    }
    if (acc.has("staff")) {
      const top = add(hnd, [0, 0, 9 * k]);
      cap(add(hnd, [0, 0, -9 * k]), top, 0.6, hex("#4a3020"), 0.8);
      disc(top, 1.6 * Math.max(1, k), A2, 0.95);
    }
    if (acc.has("bow")) {
      const h0 = sk.hand[0];
      const up: V = [0, 0, 6 * k];
      const bend = scl(fwd, 1.5);
      cap(add(h0, up), add(h0, bend), 0.5, A1, 0.9);
      cap(add(h0, bend), add(h0, scl(up, -1)), 0.5, A1, 0.9);
      cap(add(h0, up), add(h0, scl(up, -1)), 0.2, hex("#e8e0d0"), 0.85);
    }
    if (acc.has("shield")) {
      const at = add(sk.hand[0], scl(fwd, 1.4));
      disc(at, 4.2 * k, A1, 1.2, 5.4 * k, (x) => (x % 3 === 0 ? 0.8 : 1));
      disc(at, 1.2 * k, A2, 1.3);
    }
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
    const eyeC: RGB = hex(sp.eye);
    const sx = Math.round(e.x);
    const sy = Math.round(e.y);
    const sideOff = Math.round(Math.cos(a) * 0) || 0;
    pb.set(sx - 1 + sideOff, sy, eyeC);
    if (Math.abs(Math.cos(a)) < 0.8) pb.set(sx + 1 + sideOff, sy, eyeC);
  } else if (faceVisible) {
    const e = pr(add(hd, add(scl(fwd, hr * 0.9), [0, 0, 0.2])));
    pb.set(Math.round(e.x), Math.round(e.y), C.eye);
  }
  pb.outline(hex(sp.outline ?? "#120c08"));
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
  const [, , ax, ay] = sizeOf(model);
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
