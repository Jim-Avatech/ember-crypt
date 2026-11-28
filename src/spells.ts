/**
 * v1.6 Sorceress spells: what each of her 30 skills does when cast, her spell entities (missiles, meteors, blizzards,
 * hydras, fire walls), her timed buffs and how her armors / Energy Shield react to hits. Damage never uses the weapon:
 * spellBase(character level) × the skill's multiple × (1 + her mastery for that element).
 *
 * The game calls in through a small host interface (castSorc, updateSorc, sorcOnHurt, spellDps) so game.ts keeps its
 * own private helpers (elemHit, chillOrFreeze, zap, ...).
 */
import type { GameEvents, Monster, Patch, Player, Ring, Zap } from "./game";
import type { Level } from "./map";
import { lineOfSight } from "./map";
import { type Elem, ELEM_COLOR } from "./data/monsters";
import { rand } from "./rng";
import {
  BLIZZARD_DUR, BLIZZARD_R, ES_MANA_PER_LIFE, FIRE_BALL_R, FIRE_WALL_DUR, FROST_NOVA_R, GLACIAL_R, HYDRA_DUR, HYDRA_MAX, HYDRA_RATE,
  INFERNO_RANGE, LIGHTNING_RANGE, METEOR_DELAY, METEOR_R, NOVA_R, SORC_COOLDOWN, SPELL_ELEM, STATIC_BOSS_FLOOR, THUNDER_R,
  armorDur, blazeDur, blazeK, blizzardK, chainHits, chainK, chargedBoltK, chargedBoltN, chillingDef, chillingK, coldMastery, enchantDur,
  enchantK, esAbsorb, esDur, fireBallK, fireBoltK, fireMastery, fireWallK, frostNovaK, frozenArmorDef, frozenArmorFreeze, frozenOrbK,
  glacialFreeze, glacialK, hydraK, iceBlastFreeze, iceBlastK, iceBoltChill, iceBoltK, infernoK, lightMastery, lightningK, meteorBurnK,
  meteorK, novaK, shiverDef, shiverK, type SpellBaseParts, staticPct, staticR, teleK, teleportRange, thunderDur, thunderK, thunderRate,
} from "./data/sorc";

export type SpellElem = "fire" | "cold" | "light";
export interface Missile {
  k: "missile";
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dist: number;
  range: number;
  dmg: number;
  elem: SpellElem;
  /** explodes for this radius on a hit (0 = hits one monster) */
  aoe: number;
  chill?: number;
  freeze?: number;
  pierce?: boolean;
  wander?: boolean;
  /** v1.6.2 Charged Bolt: the point the cast aimed at (the target's spot, or straight ahead) and the aim's angle;
   * the wander stays within CB_WANDER_MAX of the line toward it */
  home?: { x: number; y: number; ang: number };
  knock?: number;
  stun?: number;
  /** Frozen Orb: sheds ice shards as it flies */
  orb?: { acc: number; ang: number; shard: number };
  /** Frozen Orb: it hits nothing itself */
  ghost?: boolean;
  hits: number[];
  t: number;
  size: number;
}
export interface Meteor { k: "meteor"; x: number; y: number; t: number; delay: number; dmg: number; burn: number }
export interface Blizzard { k: "blizzard"; x: number; y: number; r: number; t: number; life: number; dps: number; tick: number }
export interface Hydra { k: "hydra"; x: number; y: number; t: number; life: number; cd: number; dmg: number; fx: number; fy: number }
export interface Wall { k: "wall"; x1: number; y1: number; x2: number; y2: number; t: number; life: number; dps: number; tick: number }
/** a short-lived picture: Inferno's cone, a Thunder Storm strike, a teleport flash */
export interface Flash { k: "cone" | "strike" | "blink"; x: number; y: number; ang: number; t: number; life: number; range: number }
export type Spell = Missile | Meteor | Blizzard | Hydra | Wall | Flash;

/** sorceress buffs (seconds left; armor = which of the three cold armors is up) */
export interface SorcBuffs {
  armor?: number;
  armorId?: string;
  es?: number;
  ench?: number;
  storm?: number;
  stormCd?: number;
  blaze?: number;
  blazeX?: number;
  blazeY?: number;
}

/** what spells need from the game (game.ts passes itself) */
export interface SorcHost {
  player: Player & { sb?: SorcBuffs };
  monsters: Monster[];
  level: Level;
  time: number;
  rings: Ring[];
  zaps: Zap[];
  patches: Patch[];
  spells: Spell[];
  sorcCd: Record<string, number>;
  events: GameEvents;
  elemHit(m: Monster, dmg: number, elem: Elem, o?: { chill?: number; freeze?: number; quiet?: boolean }): void;
  chillOrFreeze(m: Monster, chill?: number, freeze?: number): void;
  spark(x: number, y: number, color: string, speed: number): void;
  floatAt(x: number, y: number, text: string, color: string, size: number): void;
  blocked(x: number, y: number, r: number): boolean;
  zap(x1: number, y1: number, x2: number, y2: number): void;
  addPatch(x: number, y: number, r: number, life: number, dps: number, elem: Elem): void;
  nearestMonster(maxDist: number, requireLos?: boolean): Monster | null;
  skillLevel(id: string): number;
  /** v1.9.1: skill level a lasting effect was cast at (0 if none); see Game.buffLevel */
  buffLevel(id: string): number;
  noteCast(id: string, lvl?: number): number;
  hint(text: string): void;
  /** v1.6.1: seconds a cast takes now (faster cast rate from gear) */
  castTime(): number;
  /** v1.7: base spell damage now: character level + Energy + caster items */
  spellBaseParts(): SpellBaseParts;
}

const alive = (m: Monster) => m.state !== "dead";
/** Charged Bolt: half of the launch cone. v1.6.3: 22.5° each side, 45° in all (v1.6.2: 30° was too strong early) */
export const CB_CONE = (22.5 * Math.PI) / 180;
/** v1.6.2 Charged Bolt: the most a bolt's heading may wander off the line to its aimed point, and how much of a
 * random turn is kept (the rest pulls it back toward that line) */
export const CB_WANDER_MAX = (33 * Math.PI) / 180; // v1.6.3: scaled with the cone (×1.5; was 22°)
export const CB_WANDER_DAMP = 0.7;
export const sb = (p: Player & { sb?: SorcBuffs }): SorcBuffs => (p.sb ??= {});
/** v1.9.1: a running buff uses the level it was cast at; otherwise the current skill level */
const effectLvl = (g: Pick<SorcHost, "skillLevel" | "buffLevel">, id: string) => g.buffLevel(id) || g.skillLevel(id) || 1;

/** + % spell damage from the mastery of an element */
export function masteryPct(g: Pick<SorcHost, "skillLevel">, e: SpellElem): number {
  return e === "fire" ? fireMastery(g.skillLevel("fire_mastery")) : e === "cold" ? coldMastery(g.skillLevel("cold_mastery")) : lightMastery(g.skillLevel("lightning_mastery"));
}
/** average damage of a spell multiple k for this hero (before the ±15% roll) */
export function spellHit(g: Pick<SorcHost, "skillLevel" | "player" | "spellBaseParts">, e: SpellElem, k: number): number {
  return g.spellBaseParts().total * k * (1 + masteryPct(g, e) / 100);
}
const roll = (n: number) => n * rand(0.85, 1.15);

/** where a spell goes: the nearest monster in sight within range, else straight ahead */
export function aimOf(g: SorcHost, range: number): { tx: number; ty: number; ax: number; ay: number; target: Monster | null } {
  const p = g.player;
  const m = g.nearestMonster(range);
  if (m) {
    const l = Math.hypot(m.x - p.x, m.y - p.y) || 1;
    return { tx: m.x, ty: m.y, ax: (m.x - p.x) / l, ay: (m.y - p.y) / l, target: m };
  }
  const l = Math.hypot(p.fx, p.fy) || 1;
  const ax = p.fx / l;
  const ay = p.fy / l;
  return { tx: p.x + ax * Math.min(range, 5), ty: p.y + ay * Math.min(range, 5), ax, ay, target: null };
}

/** the furthest open point from the hero toward (ax, ay), up to `range` tiles, never through a wall */
export function rayEnd(g: Pick<SorcHost, "blocked" | "player">, ax: number, ay: number, range: number, r = 0.05): { x: number; y: number; d: number } {
  const p = g.player;
  let x = p.x;
  let y = p.y;
  let d = 0;
  for (let s = 0.1; s <= range + 1e-6; s += 0.1) {
    const nx = p.x + ax * s;
    const ny = p.y + ay * s;
    if (g.blocked(nx, ny, r)) break;
    x = nx;
    y = ny;
    d = s;
  }
  return { x, y, d };
}

function missile(g: SorcHost, id: string, ax: number, ay: number, speed: number, range: number, dmg: number, elem: SpellElem, extra: Partial<Missile> = {}) {
  const p = g.player;
  g.spells.push({ k: "missile", id, x: p.x + ax * 0.35, y: p.y + ay * 0.35, vx: ax * speed, vy: ay * speed, dist: 0, range, dmg, elem, aoe: 0, hits: [], t: 0, size: 1, ...extra });
}

/** a burst of spell damage around a point */
function blast(g: SorcHost, x: number, y: number, r: number, dmg: number, elem: SpellElem, o: { chill?: number; freeze?: number } = {}, ringColor?: string) {
  g.rings.push({ x, y, t: 0, life: 0.45, radius: r, color: ringColor ?? (elem === "cold" ? "rgba(150,210,255," : elem === "light" ? "rgba(240,240,140," : "rgba(255,140,50,") });
  for (let k = 0; k < 16; k++) g.spark(x + rand(-r, r) * 0.6, y + rand(-r, r) * 0.6, ELEM_COLOR[elem], 3);
  for (const m of [...g.monsters]) if (alive(m) && Math.hypot(m.x - x, m.y - y) < r + m.def.radius) g.elemHit(m, roll(dmg), elem, o);
}

/** may this spell be cast right now? (cooldown, a place to land); a reason when not */
export function sorcBlock(g: SorcHost, id: string): string | null | "" {
  if ((g.sorcCd[id] ?? 0) > g.time) return ""; // on cooldown: quietly wait (holding the button recasts when ready)
  if (id === "teleport") {
    const a = aimOf(g, 10);
    const e = rayEnd(g, a.ax, a.ay, teleportRange(g.skillLevel(id)), g.player.r);
    if (e.d < 0.6) return "No room to teleport";
  }
  return null;
}

/** the cast itself (at the release point of the cast animation) */
const LASTING_SORC = new Set(["blaze", "enchant", "frozen_armor", "shiver_armor", "chilling_armor", "thunder_storm", "energy_shield", "hydra"]);
export function castSorc(g: SorcHost, id: string, lvl: number) {
  const p = g.player;
  const b = sb(p);
  if (LASTING_SORC.has(id)) lvl = g.noteCast(id, lvl);
  const hit = (k: number) => spellHit(g, SPELL_ELEM[id] ?? "fire", k);
  const cd = SORC_COOLDOWN[id];
  if (cd) g.sorcCd[id] = g.time + cd;
  switch (id) {
    // ---------------- fire ----------------
    case "fire_bolt": {
      const a = aimOf(g, 10);
      missile(g, id, a.ax, a.ay, 11, 10, hit(fireBoltK(lvl)), "fire");
      g.events.sound("bolt");
      return;
    }
    case "inferno": {
      const a = aimOf(g, INFERNO_RANGE + 0.5);
      const ang = Math.atan2(a.ay, a.ax);
      g.spells.push({ k: "cone", x: p.x, y: p.y, ang, t: 0, life: 0.35, range: INFERNO_RANGE });
      const dmg = hit(infernoK(lvl));
      for (const m of [...g.monsters]) {
        if (!alive(m)) continue;
        const dx = m.x - p.x;
        const dy = m.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > INFERNO_RANGE + m.def.radius) continue;
        let da = Math.abs(Math.atan2(dy, dx) - ang);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da < 0.5 || d < 0.7) {
          if (lineOfSight(g.level, p.x, p.y, m.x, m.y)) g.elemHit(m, roll(dmg), "fire");
        }
      }
      g.events.sound("nova");
      return;
    }
    case "blaze": {
      b.blaze = blazeDur(lvl);
      b.blazeX = p.x;
      b.blazeY = p.y;
      g.rings.push({ x: p.x, y: p.y, t: 0, life: 0.5, radius: 1.4, color: "rgba(255,140,50," });
      g.floatAt(p.x, p.y, "Blaze", ELEM_COLOR.fire, 13);
      g.events.sound("nova");
      return;
    }
    case "fire_ball": {
      const a = aimOf(g, 10);
      missile(g, id, a.ax, a.ay, 10, 10, hit(fireBallK(lvl)), "fire", { aoe: FIRE_BALL_R, size: 1.6 });
      g.events.sound("bolt");
      return;
    }
    case "fire_wall": {
      const a = aimOf(g, 8);
      const e = rayEnd(g, a.ax, a.ay, Math.min(8, Math.hypot(a.tx - p.x, a.ty - p.y)));
      // a 5-tile wall across the aim line, cut short where it meets a wall
      const nx = -a.ay;
      const ny = a.ax;
      const side = (s: number) => {
        let last = 0;
        for (let t = 0.1; t <= 2.5; t += 0.1) {
          if (g.blocked(e.x + nx * t * s, e.y + ny * t * s, 0.05)) break;
          last = t;
        }
        return last;
      };
      const l1 = side(1);
      const l2 = side(-1);
      g.spells.push({ k: "wall", x1: e.x + nx * l1, y1: e.y + ny * l1, x2: e.x - nx * l2, y2: e.y - ny * l2, t: 0, life: FIRE_WALL_DUR, dps: hit(fireWallK(lvl)), tick: 0 });
      g.events.sound("nova");
      return;
    }
    case "enchant": {
      b.ench = enchantDur(lvl);
      g.rings.push({ x: p.x, y: p.y, t: 0, life: 0.5, radius: 1.2, color: "rgba(255,170,60," });
      g.floatAt(p.x, p.y, "Enchant", ELEM_COLOR.fire, 13);
      g.events.sound("shout");
      return;
    }
    case "meteor": {
      const a = aimOf(g, 10);
      g.spells.push({ k: "meteor", x: a.tx, y: a.ty, t: 0, delay: METEOR_DELAY, dmg: hit(meteorK(lvl)), burn: spellHit(g, "fire", meteorBurnK(lvl)) });
      return;
    }
    case "hydra": {
      const a = aimOf(g, 9);
      const e = rayEnd(g, a.ax, a.ay, 1.6, 0.3);
      const heads = g.spells.filter((s): s is Hydra => s.k === "hydra");
      if (heads.length >= HYDRA_MAX) g.spells.splice(g.spells.indexOf(heads[0]), 1);
      g.spells.push({ k: "hydra", x: e.x, y: e.y, t: 0, life: HYDRA_DUR, cd: 0.3, dmg: hit(hydraK(lvl)), fx: a.ax, fy: a.ay });
      g.rings.push({ x: e.x, y: e.y, t: 0, life: 0.5, radius: 0.9, color: "rgba(255,140,50," });
      g.events.sound("nova");
      return;
    }
    // ---------------- cold ----------------
    case "ice_bolt": {
      const a = aimOf(g, 10);
      missile(g, id, a.ax, a.ay, 10, 10, hit(iceBoltK(lvl)), "cold", { chill: iceBoltChill(lvl) });
      g.events.sound("bolt");
      return;
    }
    case "frozen_armor":
    case "shiver_armor":
    case "chilling_armor": {
      // like D2, one cold armor at a time: a new one replaces the old
      b.armor = armorDur(lvl);
      b.armorId = id;
      g.rings.push({ x: p.x, y: p.y, t: 0, life: 0.5, radius: 1.2, color: "rgba(150,210,255," });
      g.floatAt(p.x, p.y, id === "frozen_armor" ? "Frozen Armor" : id === "shiver_armor" ? "Shiver Armor" : "Chilling Armor", ELEM_COLOR.cold, 13);
      g.events.sound("chill");
      return;
    }
    case "frost_nova": {
      blast(g, p.x, p.y, FROST_NOVA_R, hit(frostNovaK(lvl)), "cold", { chill: 3 });
      g.events.sound("chill");
      return;
    }
    case "ice_blast": {
      const a = aimOf(g, 10);
      missile(g, id, a.ax, a.ay, 10, 10, hit(iceBlastK(lvl)), "cold", { freeze: iceBlastFreeze(lvl), size: 1.3 });
      g.events.sound("bolt");
      return;
    }
    case "glacial_spike": {
      const a = aimOf(g, 10);
      missile(g, id, a.ax, a.ay, 10, 10, hit(glacialK(lvl)), "cold", { aoe: GLACIAL_R, freeze: glacialFreeze(lvl), size: 1.5 });
      g.events.sound("bolt");
      return;
    }
    case "blizzard": {
      const a = aimOf(g, 10);
      g.spells.push({ k: "blizzard", x: a.tx, y: a.ty, r: BLIZZARD_R, t: 0, life: BLIZZARD_DUR, dps: hit(blizzardK(lvl)), tick: 0.25 });
      g.events.sound("chill");
      return;
    }
    case "frozen_orb": {
      const a = aimOf(g, 10);
      missile(g, id, a.ax, a.ay, 4.5, 8, 0, "cold", { ghost: true, size: 2, orb: { acc: 0, ang: Math.random() * 6.28, shard: hit(frozenOrbK(lvl)) } });
      g.events.sound("chill");
      return;
    }
    // ---------------- lightning ----------------
    case "charged_bolt": {
      // v1.6.3: every bolt leaves inside a 45° cone (±22.5°) around the aim (v1.6.2 ±15°, before ±41°), then wanders toward the aimed
      // point, erratically but never more than CB_WANDER_MAX off that line (the wander used to be an unbounded walk)
      const a = aimOf(g, 8);
      const n = chargedBoltN(lvl);
      const base = Math.atan2(a.ay, a.ax);
      const home = a.target ? { x: a.target.x, y: a.target.y, ang: base } : { x: p.x + a.ax * 7, y: p.y + a.ay * 7, ang: base };
      for (let i = 0; i < n; i++) {
        const off = (n > 1 ? (i / (n - 1) - 0.5) * 2 * CB_CONE * 0.85 : 0) + rand(-0.04, 0.04);
        const an = base + Math.max(-CB_CONE, Math.min(CB_CONE, off));
        missile(g, id, Math.cos(an), Math.sin(an), 6.5, 7.5, hit(chargedBoltK(lvl)), "light", { wander: true, size: 0.8, home });
      }
      g.events.sound("bolt");
      return;
    }
    case "static_field": {
      // v1.6.1: a bigger radius, drawn at its real size (the old ring grew from nothing and faded out, so its edge
      // never showed), and only what she can see (no hits through walls)
      const r = staticR(lvl);
      g.rings.push({ x: p.x, y: p.y, t: 0, life: 0.55, radius: r, color: "rgba(160,190,255,", full: true });
      let n = 0;
      for (const m of [...g.monsters]) {
        if (!alive(m) || Math.hypot(m.x - p.x, m.y - p.y) > r + m.def.radius) continue;
        if (!lineOfSight(g.level, p.x, p.y, m.x, m.y)) continue;
        if (m.dummy) {
          // the dummy has a million life: it would show a silly number, so it takes a quarter of a level-matched monster
          g.elemHit(m, g.spellBaseParts().total * 4 * (staticPct / 100), "light");
          continue;
        }
        const floor = m.def.rank === "boss" || m.def.rank === "final" ? m.maxHp * STATIC_BOSS_FLOOR : 1;
        // v1.6.1: at least 1 while the monster is above its floor (a 3-life monster used to take 0 and show nothing)
        const dmg = Math.floor(Math.min(Math.max(1, m.hp * (staticPct / 100)), m.hp - floor));
        if (dmg >= 1) {
          g.elemHit(m, dmg, "light");
          n++;
        }
      }
      if (!n) g.floatAt(p.x, p.y - 0.4, "Static Field", "#c8d8ff", 12);
      g.events.sound("bolt");
      return;
    }
    case "telekinesis": {
      const a = aimOf(g, 9);
      missile(g, id, a.ax, a.ay, 12, 9, hit(teleK(lvl)), "light", { knock: 3, stun: 0.6, size: 1.1 });
      return;
    }
    case "nova": {
      blast(g, p.x, p.y, NOVA_R, hit(novaK(lvl)), "light", {}, "rgba(240,240,140,");
      g.events.sound("bolt");
      return;
    }
    case "lightning": {
      const a = aimOf(g, LIGHTNING_RANGE);
      const e = rayEnd(g, a.ax, a.ay, LIGHTNING_RANGE);
      g.zap(p.x, p.y, e.x, e.y);
      g.zap(p.x, p.y, e.x, e.y);
      const dmg = hit(lightningK(lvl));
      for (const m of [...g.monsters]) {
        if (!alive(m)) continue;
        const t = (m.x - p.x) * a.ax + (m.y - p.y) * a.ay;
        if (t < 0 || t > e.d + m.def.radius) continue;
        const off = Math.abs((m.x - p.x) * a.ay - (m.y - p.y) * a.ax);
        if (off < 0.45 + m.def.radius) g.elemHit(m, roll(dmg), "light");
      }
      g.events.sound("bolt");
      return;
    }
    case "chain_lightning": {
      const a = aimOf(g, 9);
      const dmg = hit(chainK(lvl));
      let cur: { x: number; y: number } = { x: p.x, y: p.y };
      let next: Monster | null = a.target;
      const done = new Set<Monster>();
      if (!next) {
        const e = rayEnd(g, a.ax, a.ay, 5);
        g.zap(p.x, p.y, e.x, e.y);
      }
      for (let i = 0; i < chainHits(lvl) && next; i++) {
        g.zap(cur.x, cur.y, next.x, next.y);
        done.add(next);
        g.elemHit(next, roll(dmg), "light");
        cur = { x: next.x, y: next.y };
        let best: Monster | null = null;
        let bd = 5;
        for (const m of g.monsters) {
          if (!alive(m) || done.has(m)) continue;
          const d = Math.hypot(m.x - cur.x, m.y - cur.y);
          if (d < bd && lineOfSight(g.level, cur.x, cur.y, m.x, m.y)) {
            bd = d;
            best = m;
          }
        }
        next = best;
      }
      g.events.sound("bolt");
      return;
    }
    case "teleport": {
      const a = aimOf(g, 10);
      const e = rayEnd(g, a.ax, a.ay, teleportRange(lvl), p.r);
      g.spells.push({ k: "blink", x: p.x, y: p.y, ang: 0, t: 0, life: 0.4, range: 0 });
      p.x = e.x;
      p.y = e.y;
      p.moveTarget = null;
      g.spells.push({ k: "blink", x: p.x, y: p.y, ang: 0, t: 0, life: 0.4, range: 0 });
      for (let k = 0; k < 10; k++) g.spark(p.x, p.y, "#b8c8ff", 3);
      g.events.sound("bolt");
      return;
    }
    case "thunder_storm": {
      b.storm = thunderDur(lvl);
      b.stormCd = 0.6;
      g.floatAt(p.x, p.y, "Thunder Storm", ELEM_COLOR.light, 13);
      g.events.sound("shout");
      return;
    }
    case "energy_shield": {
      b.es = esDur(lvl);
      g.rings.push({ x: p.x, y: p.y, t: 0, life: 0.5, radius: 1.2, color: "rgba(120,160,255," });
      g.floatAt(p.x, p.y, "Energy Shield", "#8ab0ff", 13);
      g.events.sound("shout");
      return;
    }
  }
}

/** spell entities and sorceress buffs, every frame */
export function updateSorc(g: SorcHost, dt: number) {
  const p = g.player;
  const b = p.sb;
  if (b) {
    for (const k of ["armor", "es", "ench", "storm", "blaze"] as const) if (b[k]) b[k] = Math.max(0, b[k]! - dt);
    if (b.storm && b.storm > 0) {
      b.stormCd = (b.stormCd ?? 0) - dt;
      if (b.stormCd <= 0) {
        const lvl = effectLvl(g, "thunder_storm");
        const near = g.monsters.filter((m) => alive(m) && Math.hypot(m.x - p.x, m.y - p.y) < THUNDER_R && lineOfSight(g.level, p.x, p.y, m.x, m.y));
        if (near.length) {
          const m = near[Math.floor(Math.random() * near.length)];
          g.spells.push({ k: "strike", x: m.x, y: m.y, ang: 0, t: 0, life: 0.35, range: 0 });
          g.elemHit(m, roll(spellHit(g, "light", thunderK(lvl))), "light");
          g.events.sound("bolt");
          b.stormCd = thunderRate(lvl);
        } else b.stormCd = 0.25;
      }
    }
    if (b.blaze && b.blaze > 0 && !p.dead) {
      const d = Math.hypot(p.x - (b.blazeX ?? p.x), p.y - (b.blazeY ?? p.y));
      if (d > 0.85) {
        const lvl = effectLvl(g, "blaze");
        g.addPatch(p.x, p.y, 0.5, 3, spellHit(g, "fire", blazeK(lvl)), "fire");
        b.blazeX = p.x;
        b.blazeY = p.y;
      }
    }
  }
  for (let i = g.spells.length - 1; i >= 0; i--) {
    const s = g.spells[i];
    s.t += dt;
    let gone = false;
    switch (s.k) {
      case "missile":
        gone = stepMissile(g, s, dt);
        break;
      case "meteor":
        if (s.t >= s.delay) {
          blast(g, s.x, s.y, METEOR_R, s.dmg, "fire");
          g.addPatch(s.x, s.y, 1.5, 3, s.burn, "fire");
          g.events.shake(5);
          g.events.sound("nova");
          gone = true;
        }
        break;
      case "blizzard":
        s.tick -= dt;
        if (s.tick <= 0) {
          s.tick += 0.5;
          for (const m of [...g.monsters]) if (alive(m) && Math.hypot(m.x - s.x, m.y - s.y) < s.r + m.def.radius) g.elemHit(m, roll(s.dps * 0.5), "cold", { chill: 1.5, quiet: true });
        }
        if (Math.random() < dt * 30) g.spark(s.x + rand(-s.r, s.r), s.y + rand(-s.r, s.r), "#cfe8ff", 1.2);
        gone = s.t >= s.life;
        break;
      case "hydra": {
        s.cd -= dt;
        if (s.cd <= 0) {
          let best: Monster | null = null;
          let bd = 8;
          for (const m of g.monsters) {
            if (!alive(m)) continue;
            const d = Math.hypot(m.x - s.x, m.y - s.y);
            if (d < bd && lineOfSight(g.level, s.x, s.y, m.x, m.y)) {
              bd = d;
              best = m;
            }
          }
          if (best) {
            const l = bd || 1;
            s.fx = (best.x - s.x) / l;
            s.fy = (best.y - s.y) / l;
            g.spells.push({ k: "missile", id: "hydra", x: s.x + s.fx * 0.3, y: s.y + s.fy * 0.3, vx: s.fx * 11, vy: s.fy * 11, dist: 0, range: 9, dmg: s.dmg, elem: "fire", aoe: 0, hits: [], t: 0, size: 1 });
            s.cd = HYDRA_RATE;
          } else s.cd = 0.2;
        }
        gone = s.t >= s.life;
        break;
      }
      case "wall":
        s.tick -= dt;
        if (s.tick <= 0) {
          s.tick += 0.5;
          for (const m of [...g.monsters]) if (alive(m) && segDist(m.x, m.y, s) < 0.45 + m.def.radius) g.elemHit(m, roll(s.dps * 0.5), "fire", { quiet: true });
        }
        if (Math.random() < dt * 18) {
          const t = Math.random();
          g.spark(s.x1 + (s.x2 - s.x1) * t, s.y1 + (s.y2 - s.y1) * t, ELEM_COLOR.fire, 1.6);
        }
        gone = s.t >= s.life;
        break;
      default:
        gone = s.t >= s.life;
    }
    if (gone) g.spells.splice(i, 1);
  }
}

function segDist(x: number, y: number, s: Wall) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / l2));
  return Math.hypot(x - (s.x1 + dx * t), y - (s.y1 + dy * t));
}

function stepMissile(g: SorcHost, q: Missile, dt: number): boolean {
  if (q.wander && Math.random() < dt * 8) {
    let an = Math.atan2(q.vy, q.vx) + rand(-0.55, 0.55);
    if (q.home) {
      // v1.6.2: keep the jink, but bounded and damped around the line to the aimed point (past it: the aim's angle)
      const h = q.home;
      // (the line to the aimed point never strays more than the cone's half-angle from the aim)
      const fwd = (h.x - q.x) * Math.cos(h.ang) + (h.y - q.y) * Math.sin(h.ang);
      const toHome = Math.atan2(Math.sin(Math.atan2(h.y - q.y, h.x - q.x) - h.ang), Math.cos(Math.atan2(h.y - q.y, h.x - q.x) - h.ang));
      const want = h.ang + (fwd > 0.5 ? Math.max(-CB_CONE, Math.min(CB_CONE, toHome)) : 0);
      let dev = Math.atan2(Math.sin(an - want), Math.cos(an - want)) * CB_WANDER_DAMP;
      dev = Math.max(-CB_WANDER_MAX, Math.min(CB_WANDER_MAX, dev));
      an = want + dev;
    }
    const sp = Math.hypot(q.vx, q.vy);
    q.vx = Math.cos(an) * sp;
    q.vy = Math.sin(an) * sp;
  }
  if (q.orb) {
    // Frozen Orb: a shard every 0.06 s, spinning around; a ring of shards when it ends
    q.orb.acc += dt;
    while (q.orb.acc >= 0.06) {
      q.orb.acc -= 0.06;
      q.orb.ang += 2.4;
      shard(g, q, q.orb.ang);
    }
  }
  const steps = 3;
  for (let k = 0; k < steps; k++) {
    q.x += (q.vx * dt) / steps;
    q.y += (q.vy * dt) / steps;
    q.dist += (Math.hypot(q.vx, q.vy) * dt) / steps;
    if (g.blocked(q.x, q.y, 0.05) || q.dist > q.range) {
      const bx = q.x - q.vx * 0.02;
      const by = q.y - q.vy * 0.02;
      if (q.aoe) blast(g, bx, by, q.aoe, q.dmg, q.elem, { chill: q.chill, freeze: q.freeze });
      if (q.orb) for (let i = 0; i < 12; i++) shard(g, { ...q, x: bx, y: by }, (i / 12) * Math.PI * 2);
      for (let i = 0; i < 4; i++) g.spark(q.x, q.y, ELEM_COLOR[q.elem], 1.6);
      return true;
    }
    if (q.ghost) continue;
    for (const m of g.monsters) {
      if (!alive(m) || q.hits.includes(m.id)) continue;
      if (Math.hypot(m.x - q.x, m.y - q.y) < m.def.radius + 0.25 * q.size) {
        q.hits.push(m.id);
        if (q.aoe) {
          blast(g, q.x, q.y, q.aoe, q.dmg, q.elem, { chill: q.chill, freeze: q.freeze });
          return true;
        }
        g.elemHit(m, roll(q.dmg), q.elem, { chill: q.chill, freeze: q.freeze });
        if (q.knock && m.state !== "dead") {
          const l = Math.hypot(q.vx, q.vy) || 1;
          const kk = q.knock * (m.def.rank === "final" ? 0.12 : m.def.rank === "boss" ? 0.3 : 1);
          m.kx += (q.vx / l) * kk;
          m.ky += (q.vy / l) * kk;
          if (q.stun) m.stunT = Math.max(m.stunT, m.def.rank === "final" ? q.stun / 3 : m.def.rank === "boss" ? q.stun / 2 : q.stun);
        }
        if (!q.pierce) return true;
      }
    }
  }
  return false;
}
function shard(g: SorcHost, from: Missile, ang: number) {
  g.spells.push({ k: "missile", id: "orb_shard", x: from.x, y: from.y, vx: Math.cos(ang) * 7, vy: Math.sin(ang) * 7, dist: 0, range: 3.2, dmg: from.orb!.shard, elem: "cold", aoe: 0, chill: 1.5, hits: [], t: 0, size: 0.7 });
}

/** defense % from her cold armor */
export function sorcDefPct(g: SorcHost): number {
  const b = g.player.sb;
  if (!b?.armor || !b.armorId) return 0;
  const l = effectLvl(g, b.armorId);
  return b.armorId === "frozen_armor" ? frozenArmorDef(l) : b.armorId === "shiver_armor" ? shiverDef(l) : chillingDef(l);
}

/**
 * A hit landed on her (after misses and dodges): the cold armors strike back (Frozen freezes and Shiver chills and
 * hurts a melee attacker, Chilling fires an ice bolt back at a missile's shooter: the nearest monster in sight), and
 * Energy Shield takes its share from mana. Returns the damage that reaches her life.
 */
export function sorcOnHurt(g: SorcHost, dmg: number, how: "melee" | "missile" | "area", from?: Monster): number {
  const p = g.player;
  const b = p.sb;
  if (!b) return dmg;
  if (b.armor && b.armor > 0 && b.armorId) {
    const l = g.skillLevel(b.armorId) || 1;
    if (how === "melee" && from && alive(from)) {
      if (b.armorId === "frozen_armor") g.chillOrFreeze(from, 0, frozenArmorFreeze(l));
      else if (b.armorId === "shiver_armor") g.elemHit(from, roll(spellHit(g, "cold", shiverK(l))), "cold", { chill: 2 });
    }
    if (how === "missile" && b.armorId === "chilling_armor") {
      const m = g.nearestMonster(10);
      if (m) {
        const dx = m.x - p.x;
        const dy = m.y - p.y;
        const ll = Math.hypot(dx, dy) || 1;
        missile(g, "chilling_armor", dx / ll, dy / ll, 10, 10, spellHit(g, "cold", chillingK(l)), "cold", { chill: 2 });
      }
    }
  }
  if (b.es && b.es > 0 && p.mana > 0) {
    const share = esAbsorb(effectLvl(g, "energy_shield")) / 100;
    const absorb = Math.min(dmg * share, p.mana / ES_MANA_PER_LIFE);
    p.mana -= absorb * ES_MANA_PER_LIFE;
    if (absorb >= 1) g.floatAt(p.x + 0.3, p.y - 0.3, `◍${Math.round(absorb)}`, "#8ab0ff", 11);
    return Math.max(0, dmg - absorb);
  }
  return dmg;
}

/** fire added to each of her attacks while Enchant is up (0 otherwise) */
export function enchantBonus(g: Pick<SorcHost, "player" | "skillLevel" | "buffLevel" | "spellBaseParts">): number {
  const b = g.player.sb;
  if (!b?.ench || b.ench <= 0) return 0;
  return roll(spellHit(g, "fire", enchantK(effectLvl(g, "enchant"))));
}

/** skills that do damage on their own (for the character screen's spell DPS) */
export const DAMAGE_SPELLS = ["fire_bolt", "inferno", "blaze", "fire_ball", "fire_wall", "meteor", "hydra", "ice_bolt", "frost_nova", "ice_blast", "glacial_spike", "blizzard", "frozen_orb", "charged_bolt", "telekinesis", "nova", "lightning", "chain_lightning", "thunder_storm"];

/**
 * v1.6: single-target DPS of a spell at its current level, for the character screen: average damage that one monster
 * takes per cast ÷ the time between casts (the cast time, or the cooldown when longer). Timed effects count their whole
 * damage on a monster standing in them; Charged Bolt counts half its bolts, Frozen Orb five shards, Hydra three heads.
 */
export function spellDps(g: Pick<SorcHost, "player" | "skillLevel" | "castTime" | "spellBaseParts">, id: string, lvl = g.skillLevel(id)): number {
  if (!lvl) return 0;
  const e: SpellElem = SPELL_ELEM[id] ?? "fire";
  const h = (k: number) => spellHit(g, e, k);
  // v1.6.1: faster cast rate shortens the cast (cooldowns still hold the big spells back)
  const per = Math.max(g.castTime(), SORC_COOLDOWN[id] ?? 0);
  switch (id) {
    case "fire_bolt": return h(fireBoltK(lvl)) / per;
    case "inferno": return h(infernoK(lvl)) / per;
    case "blaze": return h(blazeK(lvl)) * 1;
    case "fire_ball": return h(fireBallK(lvl)) / per;
    case "fire_wall": return (h(fireWallK(lvl)) * FIRE_WALL_DUR) / per / 2; // a monster walks through it in about half its life
    case "meteor": return (h(meteorK(lvl)) + spellHit(g, "fire", meteorBurnK(lvl)) * 1.5) / per;
    case "hydra": return (HYDRA_MAX * h(hydraK(lvl))) / HYDRA_RATE;
    case "ice_bolt": return h(iceBoltK(lvl)) / per;
    case "frost_nova": return h(frostNovaK(lvl)) / per;
    case "ice_blast": return h(iceBlastK(lvl)) / per;
    case "glacial_spike": return h(glacialK(lvl)) / per;
    case "blizzard": return (h(blizzardK(lvl)) * BLIZZARD_DUR) / per;
    case "frozen_orb": return (h(frozenOrbK(lvl)) * 5) / per;
    case "charged_bolt": return (h(chargedBoltK(lvl)) * chargedBoltN(lvl) * 0.5) / per; // v1.6.3: ~50% of the bolts hit one target at 6 tiles with the 45° cone (v1.6.2 30° cone: 0.6)
    case "telekinesis": return h(teleK(lvl)) / per;
    case "nova": return h(novaK(lvl)) / per;
    case "lightning": return h(lightningK(lvl)) / per;
    case "chain_lightning": return h(chainK(lvl)) / per;
    case "thunder_storm": return h(thunderK(lvl)) / thunderRate(lvl);
  }
  return 0;
}

/**
 * v1.6.1 tooltips: the multiple of the spell base a skill's main hit uses at a skill level, and what it is per
 * (hit, second, shard...). Null for skills that don't deal spell-base damage (buffs, Static Field, Teleport).
 */
export const SPELL_K: Record<string, { k: (l: number) => number; per?: string }> = {
  fire_bolt: { k: fireBoltK }, inferno: { k: infernoK }, blaze: { k: blazeK, per: "/s" }, fire_ball: { k: fireBallK },
  fire_wall: { k: fireWallK, per: "/s" }, enchant: { k: enchantK, per: " per attack" }, meteor: { k: meteorK }, hydra: { k: hydraK, per: " per bolt" },
  ice_bolt: { k: iceBoltK }, frost_nova: { k: frostNovaK }, ice_blast: { k: iceBlastK }, shiver_armor: { k: shiverK, per: " per hit taken" },
  glacial_spike: { k: glacialK }, blizzard: { k: blizzardK, per: "/s" }, chilling_armor: { k: chillingK, per: " per bolt" },
  frozen_orb: { k: frozenOrbK, per: " per shard" }, charged_bolt: { k: chargedBoltK, per: " per bolt" }, telekinesis: { k: teleK },
  nova: { k: novaK }, lightning: { k: lightningK }, chain_lightning: { k: chainK, per: " per enemy" }, thunder_storm: { k: thunderK, per: " per strike" },
};
const ELEM_WORD: Record<SpellElem, string> = { fire: "fire", cold: "cold", light: "lightning" };
/** v1.6.1: the damage a skill level really does for this hero, e.g. "331–448 fire per shard" (±15% roll), or null */
export function spellDamageText(g: Pick<SorcHost, "player" | "skillLevel" | "spellBaseParts">, id: string, lvl: number): string | null {
  const s = SPELL_K[id];
  if (!s || lvl <= 0) return null;
  const e: SpellElem = SPELL_ELEM[id] ?? "fire";
  const avg = spellHit(g, e, s.k(lvl));
  const lo = Math.max(1, Math.round(avg * 0.85));
  const hi = Math.max(1, Math.round(avg * 1.15));
  return `${lo === hi ? lo : `${lo}–${hi}`} ${ELEM_WORD[e]}${s.per ?? ""}`;
}
