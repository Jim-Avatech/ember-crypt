// v1.6: clear pace by class, through the real game loop (Game.update with the build's main skill held on the attack
// button): each class at character level 1 / 10 / 30 / 60 with a typical build (points and attributes spent as that
// class usually would), a white class weapon of its level, against a pack of 5 real monsters of the floor matching its
// level (their real life, defense and level, so misses count), standing still and harmless. Mana is topped up (potions).
// Ranged builds cast from 5 tiles; melee builds are put next to the next living monster (walking time not counted).
// Result: seconds to kill the whole pack.
import { MAX_FLOOR, mlvlOf } from "../src/data/acts";
import { makeItem } from "../src/data/items";
import type { HeroClass } from "../src/data/skills";
import { Game, type GameEvents, type Monster } from "../src/game";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
export const BAL_LEVELS = [1, 10, 30, 60] as const;
export type BalLevel = (typeof BAL_LEVELS)[number];

export interface Build { main: string; skills: Record<string, number>; weapon: string; ranged: boolean; center?: boolean }
export const BUILDS: Record<HeroClass, Record<BalLevel, Build>> = {
  barbarian: {
    1: { main: "bash", skills: { bash: 1 }, weapon: "axe", ranged: false },
    10: { main: "bash", skills: { bash: 5, axe_mastery: 5 }, weapon: "axe", ranged: false },
    30: { main: "concentrate", skills: { bash: 1, stun: 1, concentrate: 13, axe_mastery: 15 }, weapon: "axe", ranged: false },
    60: { main: "concentrate", skills: { bash: 1, stun: 1, concentrate: 20, axe_mastery: 20, shout: 1, howl: 1, battle_orders: 16 }, weapon: "axe", ranged: false },
  },
  amazon: {
    1: { main: "jab", skills: { jab: 1 }, weapon: "javelin", ranged: false },
    10: { main: "power_strike", skills: { jab: 1, power_strike: 9 }, weapon: "javelin", ranged: false },
    30: { main: "charged_strike", skills: { jab: 1, power_strike: 10, poison_javelin: 1, lightning_bolt: 5, charged_strike: 13 }, weapon: "javelin", ranged: false },
    60: { main: "lightning_fury", skills: { jab: 1, power_strike: 10, poison_javelin: 1, lightning_bolt: 10, plague_javelin: 1, charged_strike: 17, lightning_fury: 20 }, weapon: "javelin", ranged: true },
  },
  sorceress: {
    1: { main: "fire_bolt", skills: { fire_bolt: 1 }, weapon: "battle_staff", ranged: true },
    10: { main: "fire_bolt", skills: { fire_bolt: 10 }, weapon: "battle_staff", ranged: true },
    30: { main: "fire_ball", skills: { fire_bolt: 10, fire_ball: 19, warmth: 1 }, weapon: "battle_staff", ranged: true },
    60: { main: "frozen_orb", skills: { ice_bolt: 1, ice_blast: 1, frost_nova: 1, glacial_spike: 1, blizzard: 1, frozen_armor: 1, frozen_orb: 20, cold_mastery: 20, warmth: 14 }, weapon: "battle_staff", ranged: true },
  },
};

function stats(cls: HeroClass, L: number) {
  const n = L - 1;
  if (cls === "barbarian") return { str: 30 + 3 * n, dex: 20 + n, vit: 25 + n, ene: 10 };
  if (cls === "amazon") return { str: 20 + Math.round(1.5 * n), dex: 25 + 3 * n, vit: 20 + Math.round(0.5 * n), ene: 15 };
  return { str: 10 + n, dex: 25, vit: 10 + 2 * n, ene: 35 + 2 * n };
}

/**
 * v1.6.1: Whirlwind Barbarian builds (not part of the balance band; v1.6's Barbarian rows are Bash / Concentrate).
 * Whirlwind hits everything within 1.25 tiles each tick, so the hero is put in the middle of the pack every frame.
 */
export const WW_BUILDS: Partial<Record<BalLevel, Build>> = {
  30: { main: "whirlwind", skills: { bash: 1, leap: 1, double_swing: 1, stun: 1, leap_attack: 1, concentrate: 1, whirlwind: 12, axe_mastery: 12 }, weapon: "axe", ranged: false, center: true },
  60: { main: "whirlwind", skills: { bash: 1, leap: 1, double_swing: 1, stun: 1, leap_attack: 1, concentrate: 1, whirlwind: 20, axe_mastery: 20, shout: 1, howl: 1, battle_orders: 11 }, weapon: "axe", ranged: false, center: true },
};

export function simClear(cls: HeroClass, L: BalLevel, pack = 5, cap = 300, build?: Build): number {
  const b = build ?? BUILDS[cls][L];
  const g = new Game(events, null, 11, { cls, name: "" });
  const p = g.player;
  let floor = 1;
  while (floor < MAX_FLOOR && mlvlOf(floor) < L) floor++;
  p.level = L;
  p.base = stats(cls, L);
  p.equip = { main: makeItem(b.weapon, L) };
  g.goDungeon(floor);
  p.skills = { ...b.skills };
  p.mainAtk = b.main;
  p.slots = [null, null, null];
  const R = [...g.level.rooms].sort((a, c) => c.w * c.h - a.w * a.h)[0];
  const proto = g.monsters.find((m) => m.def.rank === "normal" && !m.elite && m.def.behavior === "melee") ?? g.monsters.find((m) => m.def.rank === "normal" && !m.elite)!;
  const cx = R.cx + 0.5;
  const cy = R.cy + 0.5;
  const spots = [{ x: cx, y: cy }, ...Array.from({ length: 6 }, (_, i) => ({ x: cx + Math.cos(i * 1.05 + 0.4) * 1.1, y: cy + Math.sin(i * 1.05 + 0.4) * 1.1 }))];
  const ms: Monster[] = spots.slice(0, pack).map((s, i) => {
    const m = { ...proto, id: 9e6 + i, fuse: -1, x: s.x, y: s.y, state: "chase", hp: proto.maxHp, maxHp: proto.maxHp, kx: 0, ky: 0, frozenT: 0, chillT: 0, stunT: 0, bcry: { t: 0, def: 0, dmg: 0 }, taunt: { t: 0, pct: 0 } } as Monster;
    m.def = { ...proto.def, speed: 0, dmgMin: 0, dmgMax: 0, behavior: "melee", specials: undefined, shot: undefined } as Monster["def"];
    return m;
  });
  g.monsters = ms;
  g.allies = [];
  g.projectiles = [];
  const px = b.ranged ? cx - 5 : cx - 1.25;
  const dt = 1 / 60;
  const hold = { mx: 0, my: 0, mag: 0, attack: true, skills: [false, false, false] };
  for (let f = 0; f * dt < cap; f++) {
    // ranged builds stand 5 tiles off; melee builds step up to the next monster (walking time not counted)
    const next = b.ranged || b.center ? null : ms.find((m) => m.state !== "dead");
    p.x = b.center ? cx : next ? next.x - 1.1 : px;
    p.y = b.center ? cy : next ? next.y : cy;
    p.fx = 1; p.fy = 0; p.mana = 1e6; p.hp = 1e6; p.moveTarget = null;
    if (p.equip.main?.qty !== undefined) p.equip.main.qty = 150;
    g.update(dt, hold);
    ms.forEach((m, i) => { if (m.state !== "dead") { m.x = spots[i].x; m.y = spots[i].y; m.kx = 0; m.ky = 0; m.state = "chase"; m.fuse = -1; } });
    if (ms.every((m) => m.state === "dead" || m.hp <= 0)) return (f + 1) * dt;
  }
  return cap;
}
