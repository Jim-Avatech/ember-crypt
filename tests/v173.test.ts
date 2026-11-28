// v1.7.3: a gentler start. Biggest single hit (max roll, slams, charges, novas and bolts included) of every boss and
// elite on Act I's floors, as a share of a hero's max life. Generic rules for every class: boss damage is fixed per floor,
// the early curve is lower, and everything is back to parity at floor 60.
import { describe, expect, it } from "vitest";
import { mlvlOf } from "../src/data/acts";
import { makeItem } from "../src/data/items";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import type { HeroClass } from "../src/data/skills";
import { BOSS_EASE0, CURVE_END, Game, type GameEvents, type Monster, RESPEC_FREE, bossEase, bossHitShare, bossWindupMul, curveDmg, eliteDmgMul, finalBoltMul, floorTaper, heroLifeOld, heroLifeRef, heroLifeTyp, slamWarn } from "../src/game";
import swSrc from "../public/sw.js?raw";
import gameSrc from "../src/game.ts?raw";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const CLASSES: HeroClass[] = ["barbarian", "amazon", "sorceress"];
// points spent the way the class sims do; white class weapon, no armor, no life affixes (the conservative case)
function stats(cls: HeroClass, L: number) {
  const n = L - 1;
  if (cls === "barbarian") return { str: 30 + 3 * n, dex: 20 + n, vit: 25 + n, ene: 10 };
  if (cls === "amazon") return { str: 20 + Math.round(1.5 * n), dex: 25 + 3 * n, vit: 20 + Math.round(0.5 * n), ene: 15 };
  return { str: 10 + n, dex: 25, vit: 10 + 2 * n, ene: 35 + 2 * n };
}
const heroLvl = (f: number) => Math.max(1, Math.round(1.1 * mlvlOf(f) + 1.5));
function life(cls: HeroClass, L: number) {
  const g = new Game(events, null, 3, { cls, name: "" });
  g.player.level = L;
  g.player.base = stats(cls, L);
  g.player.equip = { main: makeItem(cls === "barbarian" ? "axe" : cls === "amazon" ? "javelin" : "battle_staff", L) };
  return g.derived().maxHp;
}
/** the biggest single hit each attack of a monster can do (max rolls), as game.ts applies the multipliers */
function hits(m: Monster, f: number) {
  const mx = m.dmgMax + 1;
  const r = m.def.rank;
  const o: Record<string, number> = { melee: mx };
  if (m.def.behavior === "ranged") o.shot = mx * (r === "final" ? finalBoltMul(f) : 1);
  if (m.def.behavior === "charger") o.charge = mx * 1.3;
  if (r === "boss" || r === "final") o.slam = m.dmgMax * 1.6 + 1;
  if (r === "final") {
    if (m.def.specials?.includes("nova")) o.nova = m.dmgMax * 1.3 + 1;
    if (m.def.specials?.includes("charge")) o.charge = mx * 1.3;
    if (m.def.specials?.includes("bolts")) o.bolt = mx * finalBoltMul(f);
  }
  return Math.max(...Object.values(o));
}
type Worst = { boss: number; unique: number; champion: number };
function worst(f: number): Worst {
  const w: Worst = { boss: 0, unique: 0, champion: 0 };
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    const g = new Game(events, null, seed, { cls: "barbarian", name: "" });
    g.goDungeon(f);
    for (const m of g.monsters) {
      if (m.state === "dead" || m.minion) continue;
      const h = hits(m, f);
      if (m.def.rank !== "normal") w.boss = Math.max(w.boss, h);
      else if (m.elite === 2) w.unique = Math.max(w.unique, h);
      else if (m.elite === 1) w.champion = Math.max(w.champion, h);
    }
  }
  return w;
}
const ACT1 = Array.from({ length: 20 }, (_, i) => i + 1);
const table = new Map(ACT1.map((f) => [f, worst(f)]));
// the biggest hit as a share of max life: Barbarian at most ~40% (the target), Amazon and Sorceress, who start with less life, about 50%
const CAP: Record<HeroClass, number> = { barbarian: 0.4, amazon: 0.52, sorceress: 0.5 };

describe("v1.7.3 release", () => {
  it("version, patch note, cache v41, free respec kept", () => {
    expect(GAME_VERSION).toBe("1.7.3");
    expect(PATCH_NOTES[0].version).toBe("1.7.3");
    expect(PATCH_NOTES[0].notes.join(" ")).toMatch(/1\.5 s/);
    expect(swSrc).toContain("ember-crypt-shell-v41");
    expect(RESPEC_FREE).toBe(true);
  });
});

describe("v1.7.3 Act I: no boss or elite hit takes more than ~40% of a hero's life (max rolls, unequipped)", () => {
  for (const cls of CLASSES) {
    it(`${cls}: bosses, act boss, uniques, champions on floors 1–20`, () => {
      const out: string[] = [];
      for (const f of ACT1) {
        const w = table.get(f)!;
        const hp = life(cls, heroLvl(f));
        for (const k of ["boss", "unique", "champion"] as const) {
          const pct = w[k] / hp;
          out.push(`F${f} ${k} ${Math.round(pct * 100)}%`);
          expect(pct, `${cls} F${f} ${k} (hero ${hp} hp)`).toBeLessThanOrEqual(CAP[cls]);
        }
      }
      console.log(`${cls}: ${out.join(", ")}`);
    });
  }
  it("a fresh level-1 Barbarian (55 life) survives any floor 1–5 boss or elite hit (max roll) with a hit taking under ~45% of their life", () => {
    const hp = life("barbarian", 1);
    expect(hp).toBe(55);
    for (const f of [1, 2, 3, 4, 5]) {
      const w = table.get(f)!;
      for (const k of ["boss", "unique", "champion"] as const) expect(w[k] / hp, `F${f} ${k}`).toBeLessThanOrEqual(0.45);
    }
  });
  it("the boss slam is the biggest hit but is never close to a one-shot on floor 1", () => {
    const g = new Game(events, null, 11, { cls: "barbarian", name: "" });
    g.goDungeon(1);
    const b = g.boss as Monster;
    expect(b.dmgMax * 1.6 + 1).toBeLessThan(0.4 * life("barbarian", 1));
  });
});

describe("v1.7.3 generic rules", () => {
  it("monster damage starts at 65% and is convex to parity at floor 60 (life still 80% → 100%)", () => {
    expect(curveDmg(1)).toBeCloseTo(0.65);
    expect(curveDmg(60)).toBe(1);
    expect(curveDmg(80)).toBe(1);
    expect(curveDmg(10)).toBeLessThan(0.65 + 0.35 * (9 / 59)); // below the straight line
    for (let f = 2; f <= 60; f++) expect(curveDmg(f)).toBeGreaterThan(curveDmg(f - 1));
  });
  it("boss damage is fixed per floor, whoever the hero is, and never above the old value (equal from floor 60)", () => {
    for (const f of [1, 5, 10, 20, 40, 59, 60, 80]) {
      const dmg = (cls: HeroClass, lvl: number) => {
        const g = new Game(events, null, 11, { cls, name: "" });
        g.player.level = lvl;
        g.goDungeon(f);
        return [(g.boss as Monster).dmgMin, (g.boss as Monster).dmgMax];
      };
      expect(dmg("barbarian", 1)).toEqual(dmg("sorceress", 40));
    }
    expect(bossHitShare(60)).toBeCloseTo(0.38);
    expect(heroLifeRef(60)).toBeCloseTo(heroLifeOld(60));
    expect(bossEase(60)).toBe(1);
    expect(bossEase(1)).toBe(BOSS_EASE0);
    expect(bossEase(20)).toBe(BOSS_EASE0);
    for (let f = 2; f <= 80; f++) expect(bossHitShare(f) * heroLifeRef(f)).toBeLessThanOrEqual(bossHitShare(f - 1) * heroLifeRef(f - 1) * 1.2 + 1e-9);
  });
  it("later acts are not trivialized: boss hits ≥ 50% of the old size by floor 40 and exactly the old size at 60", () => {
    expect(heroLifeTyp(1)).toBeLessThan(heroLifeOld(1));
    expect(bossEase(40) * heroLifeRef(40) / heroLifeOld(40)).toBeGreaterThan(0.5);
    expect(bossEase(60) * heroLifeRef(60)).toBeCloseTo(heroLifeOld(60));
    expect(eliteDmgMul(2, true, 60)).toBeCloseTo(2.25);
    expect(eliteDmgMul(1, false, 60)).toBeCloseTo(1.3);
    expect(eliteDmgMul(2, true, 80)).toBeCloseTo(2.25);
  });
  it("elites start softer: a strong unique is under 1.5x a normal monster on floor 1, and it only goes up", () => {
    expect(eliteDmgMul(2, true, 1)).toBeLessThan(1.5);
    expect(eliteDmgMul(2, false, 1)).toBeCloseTo(1.2);
    expect(eliteDmgMul(1, false, 1)).toBeCloseTo(1.1);
    for (let f = 2; f <= 60; f++) expect(eliteDmgMul(2, true, f)).toBeGreaterThan(eliteDmgMul(2, true, f - 1));
  });
  it("telegraphs: slam warning 1.5 s on floor 1 (was ≈1 s) easing to 0.8 s; wind-up +40% early; bolt fan 0.5x early", () => {
    expect(slamWarn(1)).toBeCloseTo(1.5);
    expect(slamWarn(CURVE_END)).toBeCloseTo(0.8);
    for (let f = 1; f <= 20; f++) expect(slamWarn(f)).toBeGreaterThan(1.25);
    expect(bossWindupMul(1)).toBeCloseTo(1.4);
    expect(bossWindupMul(CURVE_END)).toBe(1);
    expect(finalBoltMul(1)).toBeCloseTo(0.5);
    expect(finalBoltMul(CURVE_END)).toBeCloseTo(0.9);
    expect(floorTaper(30, 1, 60)).toBeCloseTo(29 / 59);
  });
  it("the slam warning really uses slamWarn and the shared rules have no class key", () => {
    expect(gameSrc).toMatch(/warn = slamWarn\(this\.floor\)/);
    expect(gameSrc).not.toMatch(/(bossEase|slamWarn|bossWindupMul|finalBoltMul|eliteDmgMul)[^\n]*cls ===/);
  });
});
