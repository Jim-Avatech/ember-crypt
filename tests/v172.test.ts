// v1.7.2: D2-style leech — no per-second cap, skill effects at SPELL_LEECH_PCT 20%, and leechDrainFor
// (monster tier × act) on all leech for every class. Respec is temporarily free (RESPEC_FREE).
import { describe, expect, it } from "vitest";
import { makeItem, type Item } from "../src/data/items";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import { CLASS_DEF, Game, type GameEvents, type Monster, LEECH_ACT_DRAIN, LEECH_TIER_DRAIN, RESPEC_FREE, RESPEC_GOLD_PER_LEVEL, SPELL_LEECH_PCT, leechDrainFor, respecCharge, respecCost } from "../src/game";
import gameSrc from "../src/game.ts?raw";
import uiSrc from "../src/ui.ts?raw";
import swSrc from "../public/sw.js?raw";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const ring = (ll: number, ml = 0): Item => ({ ...makeItem("ring", 20), q: "magic", mods: ml ? [{ s: "ll", v: ll }, { s: "ml", v: ml }] : [{ s: "ll", v: ll }] });

describe("v1.7.2 release", () => {
  it("version, patch note, cache v40", () => {
    expect(GAME_VERSION).toBe("1.7.2");
    expect(PATCH_NOTES[0].version).toBe("1.7.2");
    expect(PATCH_NOTES[0].notes.join(" ")).toMatch(/20%/);
    expect(PATCH_NOTES[0].notes.join(" ")).toMatch(/free/i);
    expect(swSrc).toContain("ember-crypt-shell-v40");
    expect(SPELL_LEECH_PCT).toBe(20);
    expect(gameSrc).not.toMatch(/SPELL_LEECH_CAP|spellLeechCap|slLeft/);
  });
});

describe("v1.7.2 leech drain (one rule, no class key)", () => {
  it("tier × act, D2-like", () => {
    expect(leechDrainFor("normal", 0, 1)).toBe(1);
    expect(leechDrainFor("normal", 0, 20)).toBe(1);
    expect(leechDrainFor("normal", 0, 21)).toBe(0.75);
    expect(leechDrainFor("normal", 0, 40)).toBe(0.75);
    expect(leechDrainFor("normal", 0, 41)).toBe(0.5);
    expect(leechDrainFor("normal", 0, 80)).toBeCloseTo(1 / 3, 10);
    expect(leechDrainFor("normal", 1, 1)).toBe(0.75); // champion
    expect(leechDrainFor("normal", 2, 1)).toBe(0.5); // unique
    expect(leechDrainFor("boss", 0, 1)).toBeCloseTo(1 / 3, 10);
    expect(leechDrainFor("final", 0, 1)).toBe(0.2);
    expect(leechDrainFor("final", 0, 80)).toBeCloseTo(0.2 / 3, 10);
    expect(LEECH_TIER_DRAIN.boss).toBeCloseTo(1 / 3, 10);
    expect(LEECH_ACT_DRAIN[3]).toBeCloseTo(1 / 3, 10);
  });
  it("elemHit and playerHit apply drain; dummy and noLeech still don't leech", () => {
    const g = new Game(events, null, 11, { cls: "barbarian", name: "" });
    g.player.level = 30;
    g.player.equip = { ring1: ring(10, 10) };
    g.goDungeon(5);
    for (let i = 0; i < 5; i++) g.update(1 / 60, { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] });
    const m = g.monsters.find((x) => x.def.rank === "normal")!;
    m.hp = 1e6; m.x = g.player.x + 30;
    const p = g.player;
    p.hp = 1; p.mana = 0;
    g.elemHit(m, 100, "fire");
    expect(p.hp).toBeCloseTo(1 + 100 * 0.1 * 0.2, 6); // 20% of 10% life leech
    const afterSpell = p.hp;
    m.def = { ...m.def, rank: "boss" };
    p.hp = 1;
    g.elemHit(m, 100, "fire");
    expect(p.hp).toBeCloseTo(1 + 100 * 0.1 * 0.2 * (1 / 3), 6);
    p.hp = afterSpell;
    g.elemHit(m, 100, "fire", { noLeech: true });
    expect(p.hp).toBe(afterSpell);
    m.def = { ...m.def, rank: "normal" };
    m.dummy = true;
    p.hp = 1;
    g.elemHit(m, 100, "fire");
    expect(p.hp).toBe(1);
  });
  it("leech code has no class checks", () => {
    for (const fn of ["private spellLeech(", "elemHit(", "private playerHit(", "export function leechDrainFor("]) {
      const i = gameSrc.indexOf(fn);
      expect(i, fn).toBeGreaterThan(0);
      const body = gameSrc.slice(i, gameSrc.indexOf("\n  }\n", i) === -1 || fn.startsWith("export") ? gameSrc.indexOf("\n}\n", i) : gameSrc.indexOf("\n  }\n", i));
      expect(body, fn).not.toMatch(/sorceress|barbarian|amazon|SORC_IDS|\.cls\b/);
    }
    expect(uiSrc).toMatch(/Spells &amp; skill effects leech at \$\{SPELL_LEECH_PCT\}% of your leech/);
    expect(uiSrc).toMatch(/no cap/);
    expect(uiSrc).not.toMatch(/up to \$\{SPELL_LEECH_CAP\}/);
  });
});

describe("v1.7.2 respec is temporarily free", () => {
  it("RESPEC_FREE leaves the old formula in respecCost; charge is 0", () => {
    expect(RESPEC_FREE).toBe(true);
    expect(RESPEC_GOLD_PER_LEVEL).toBe(50);
    expect([1, 20, 80].map(respecCost)).toEqual([50, 1000, 4000]);
    expect([1, 20, 80].map(respecCharge)).toEqual([0, 0, 0]);
    expect(uiSrc).toMatch(/Remove for free/);
    expect(uiSrc).toMatch(/Free for now/);
  });
  it("a point comes out with no gold and nothing is charged", () => {
    const g = new Game(events, null, 5, { cls: "barbarian", name: "" });
    const p = g.player;
    p.level = 20;
    p.gold = 0;
    p.stashGold = 0;
    p.base.vit = CLASS_DEF.barbarian.stats.vit + 2;
    expect(g.canUnstat("vit")).toEqual({ ok: true, cost: 0 });
    expect(g.unstat("vit")).toBe(null);
    expect(p.gold).toBe(0);
    expect(p.statPoints).toBe(1);
    p.skills = { bash: 2 };
    expect(g.unlearn("bash")).toBe(null);
    expect(p.skills.bash).toBe(1);
    expect(p.gold).toBe(0);
    expect(p.skillPoints).toBeGreaterThanOrEqual(1);
  });
});

type Rank = "normal" | "boss" | "final";
type Kind = "hold" | "cast";
function sustain(opts: {
  cls: "barbarian" | "amazon" | "sorceress"; skill: string; skills: Record<string, number>;
  n: number; rank: Rank; kind: Kind; secs?: number; floor?: number; weapon?: string; off?: string;
}) {
  const { cls, skill, skills, n, rank, kind, secs = 20, floor = 20 } = opts;
  const g = new Game(events, null, 11, { cls, name: "" });
  const p = g.player;
  p.level = 30;
  p.base = { str: 120, dex: 120, vit: 80, ene: 80 };
  p.skills = { ...skills };
  p.equip = { ring1: ring(6) };
  if (opts.weapon) p.equip.main = makeItem(opts.weapon as "axe", 30);
  if (opts.off) p.equip.off = makeItem(opts.off as "arrows", 1);
  if (p.equip.main && p.equip.main.qty !== undefined) p.equip.main.qty = 500;
  if (p.equip.off && p.equip.off.qty !== undefined) p.equip.off.qty = 500;
  p.mainAtk = kind === "hold" ? skill : (cls === "barbarian" ? null : skill);
  g.goDungeon(floor);
  const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const proto = g.monsters.find((m) => m.def.rank === "normal") ?? g.monsters[0];
  const close = skill === "whirlwind" || skill === "war_cry" || skill === "nova";
  const cx = R.cx + 0.5, cy = R.cy + 0.5;
  const px = close ? cx : cx - 2.5, py = cy;
  const ox = close ? 0 : 5;
  const spots = Array.from({ length: n }, (_, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const r = close ? 0.95 : 0.7;
    return { x: px + ox + Math.cos(a) * r, y: py + Math.sin(a) * r };
  });
  g.monsters = spots.map((s, i) => {
    const m = { ...proto, id: 9e6 + i, x: s.x, y: s.y, state: "chase" as const, kx: 0, ky: 0, stunT: 0, chillT: 0, frozenT: 0, freezeImmuneUntil: -1, hp: 1e7, maxHp: 1e7, fuse: -1, elite: 0 as const, defense: 0, mlvl: 1, dmgMin: 0, dmgMax: 0 } as Monster;
    m.def = { ...proto.def, rank, speed: 0, dmgMin: 0, dmgMax: 0, behavior: "melee", specials: undefined, shot: undefined } as Monster["def"];
    return m;
  });
  const d0 = g.derived();
  const hold = { mx: 0, my: 0, mag: 0, attack: kind === "hold", skills: [false, false, false] };
  for (let t = 0; t < secs; t += 1 / 60) {
    p.x = px; p.y = py; p.fx = 1; p.fy = 0;
    p.hp = 1; p.mana = Math.max(p.mana, d0.maxMana / 2); p.healLeft = 0; p.manaLeft = 0;
    if (p.equip.main?.qty !== undefined) p.equip.main.qty = 500;
    if (p.equip.off?.qty !== undefined) p.equip.off.qty = 500;
    g.monsters.forEach((m, i) => { m.x = spots[i].x; m.y = spots[i].y; m.kx = 0; m.ky = 0; m.stunT = 0; m.fearT = 0; m.state = "chase"; m.hp = 1e7; });
    if (kind === "cast" && !p.action) g.castSkill(skill, g.derived());
    g.update(1 / 60, hold);
  }
  return {
    life: (g.atkLeechGot.hp + g.spellLeechGot.hp) / secs,
    atk: g.atkLeechGot.hp / secs,
    spell: g.spellLeechGot.hp / secs,
    maxHp: d0.maxHp,
    drain: leechDrainFor(rank, 0, floor),
  };
}

describe("v1.7.2 sustain at level 30, 6% life leech", () => {
  it("prints life/s for each skill on a 10-pack, a single, a boss and an act boss", () => {
    const WW = { bash: 1, leap: 1, double_swing: 1, stun: 1, leap_attack: 1, concentrate: 1, whirlwind: 12, axe_mastery: 12 };
    const WC = { howl: 1, shout: 1, taunt: 1, battle_cry: 1, battle_orders: 1, war_cry: 20 };
    const SORC = { frost_nova: 1, ice_bolt: 1, ice_blast: 1, blizzard: 20, frozen_orb: 20, static_field: 1, nova: 20, cold_mastery: 10 };
    const LF = { jab: 1, power_strike: 1, poison_javelin: 1, lightning_bolt: 1, charged_strike: 1, plague_javelin: 1, lightning_fury: 20 };
    const MS = { magic_arrow: 1, multiple_shot: 20 };
    const jobs: [string, Parameters<typeof sustain>[0]][] = [
      ["Whirlwind", { cls: "barbarian", skill: "whirlwind", skills: WW, kind: "hold", weapon: "axe", n: 1, rank: "normal" }],
      ["Multishot", { cls: "amazon", skill: "multiple_shot", skills: MS, kind: "hold", weapon: "long_bow", off: "arrows", n: 1, rank: "normal" }],
      ["Blizzard", { cls: "sorceress", skill: "blizzard", skills: SORC, kind: "cast", weapon: "wand", n: 1, rank: "normal" }],
      ["Frozen Orb", { cls: "sorceress", skill: "frozen_orb", skills: SORC, kind: "cast", weapon: "wand", n: 1, rank: "normal" }],
      ["Nova", { cls: "sorceress", skill: "nova", skills: SORC, kind: "cast", weapon: "wand", n: 1, rank: "normal" }],
      ["Lightning Fury", { cls: "amazon", skill: "lightning_fury", skills: LF, kind: "cast", weapon: "javelin", n: 1, rank: "normal" }],
      ["War Cry", { cls: "barbarian", skill: "war_cry", skills: WC, kind: "cast", n: 1, rank: "normal" }],
    ];
    const f = (x: number) => x.toFixed(1);
    for (const [name, base] of jobs) {
      for (const n of [1, 10]) {
        for (const rank of ["normal", "boss", "final"] as Rank[]) {
          if (n === 10 && rank !== "normal") continue;
          const r = sustain({ ...base, n, rank });
          console.log(`LEECH ${name} n=${n} ${rank}: life/s ${f(r.life)} (atk ${f(r.atk)} spell ${f(r.spell)}) drain ${r.drain} maxHp ${r.maxHp}`);
          expect(r.life, `${name} ${n} ${rank}`).toBeGreaterThan(0);
          if (n === 1 && rank === "boss") {
            const nrm = sustain({ ...base, n: 1, rank: "normal" });
            expect(r.life / nrm.life).toBeGreaterThan(0.25);
            expect(r.life / nrm.life).toBeLessThan(0.42);
          }
          if (n === 1 && rank === "final") {
            const nrm = sustain({ ...base, n: 1, rank: "normal" });
            expect(r.life / nrm.life).toBeGreaterThan(0.14);
            expect(r.life / nrm.life).toBeLessThan(0.28);
          }
        }
      }
    }
    // Act IV (Hell-like 33%) cuts a normal pack to a third
    const pack = sustain({ cls: "sorceress", skill: "blizzard", skills: SORC, kind: "cast", weapon: "wand", n: 10, rank: "normal", floor: 80 });
    const early = sustain({ cls: "sorceress", skill: "blizzard", skills: SORC, kind: "cast", weapon: "wand", n: 10, rank: "normal", floor: 20 });
    console.log(`LEECH Blizzard pack10 Act IV: life/s ${f(pack.life)} (Act I ${f(early.life)}, ratio ${(pack.life / early.life).toFixed(2)})`);
    expect(pack.life / early.life).toBeGreaterThan(0.28);
    expect(pack.life / early.life).toBeLessThan(0.4);
  }, 180000);
});
