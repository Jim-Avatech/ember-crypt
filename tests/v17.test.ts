// v1.7: base spell damage = character level + Energy + caster items; spell multiples ÷ SPELL_NORM.
import { describe, expect, it } from "vitest";
import { makeItem, type Item } from "../src/data/items";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import type { HeroClass } from "../src/data/skills";
import { CASTER_SPELL_SHARE, SPELL_ENE_HALF, SPELL_LEVEL_SHARE, SPELL_NORM, casterSpellDmg, spellBase, spellBaseParts } from "../src/data/sorc";
import { Game, type GameEvents } from "../src/game";
import { spellDps } from "../src/spells";
import swSrc from "../public/sw.js?raw";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };

type Gear = "staff" | "wand_orb" | "wand" | "sword" | "none";
interface Cfg { L: number; ene: number; gear: Gear; ilvl?: number; skills: Record<string, number>; extra?: Item["mods"] }
function hero(c: Cfg, cls: HeroClass = "sorceress") {
  const g = new Game(events, null, 3, { cls, name: "" });
  const p = g.player;
  p.level = c.L;
  p.base = { str: 300, dex: 300, vit: 10, ene: c.ene };
  p.skills = { ...c.skills };
  const il = c.ilvl ?? c.L;
  const eq: Record<string, Item> = {};
  if (c.gear === "staff") eq.main = makeItem("battle_staff", il);
  if (c.gear === "wand_orb" || c.gear === "wand") eq.main = makeItem("wand", il);
  if (c.gear === "wand_orb") eq.off = makeItem("orb", il);
  if (c.gear === "sword") eq.main = makeItem("sword", il);
  if (c.extra) eq.amulet = { ...makeItem("amulet", il), q: "rare", mods: c.extra };
  p.equip = eq;
  return g;
}
const dps = (g: Game, id: string) => spellDps(g, id);
/** what the same hero did in v1.6.4 (base = spellBase(level), old multiples = new × SPELL_NORM) */
const oldDps = (g: Game, id: string) => (dps(g, id) * spellBase(g.player.level) * SPELL_NORM) / g.spellBaseParts().total;
const typicalEne = (L: number) => 35 + 2 * (L - 1);
const allEne = (L: number) => 35 + 5 * (L - 1);
const SK30 = { fire_bolt: 10, fire_ball: 20, warmth: 1 };
const SK60 = { ice_bolt: 1, ice_blast: 1, frost_nova: 1, glacial_spike: 1, blizzard: 1, frozen_armor: 1, frozen_orb: 20, cold_mastery: 20, warmth: 14 };

describe("v1.7 release", () => {
  it("version, patch note, cache", () => {
    expect(GAME_VERSION).toBe("1.7.2");
    expect(PATCH_NOTES.find((n) => n.version === "1.7")!.notes.join(" ")).toMatch(/spell damage/i);
    expect(swSrc).toMatch(/ember-crypt-shell-v\d+/);
  });
});

describe("v1.7 base spell damage parts", () => {
  it("level part, Energy (diminishing), caster items by type and item level", () => {
    const b = spellBase(30);
    const pr = spellBaseParts(30, 100, [{ baseId: "battle_staff", ilvl: 30 }, { baseId: "sword", ilvl: 30 }]);
    expect(pr.level).toBeCloseTo(b * SPELL_LEVEL_SHARE, 6);
    expect(pr.energy).toBeCloseTo((b * 100) / (100 + SPELL_ENE_HALF), 6);
    expect(pr.items).toBe(Math.round(spellBase(30) * CASTER_SPELL_SHARE.battle_staff));
    expect(pr.total).toBeCloseTo(pr.level + pr.energy + pr.items, 6);
    expect(casterSpellDmg("sword", 30)).toBe(0);
    expect(casterSpellDmg("wand", 30) + casterSpellDmg("orb", 30)).toBeCloseTo(casterSpellDmg("battle_staff", 30), -0.5);
    expect(casterSpellDmg("wand", 60)).toBeGreaterThan(casterSpellDmg("wand", 20));
    // more Energy always helps, each point a bit less
    const e = (n: number) => spellBaseParts(30, n, []).energy;
    expect(e(100) - e(50)).toBeGreaterThan(e(150) - e(100));
  });
  it("every class has one (Barbarian with an axe: level + Energy only)", () => {
    const g = hero({ L: 30, ene: 10, gear: "none", skills: {} }, "barbarian");
    g.player.equip = { main: makeItem("axe", 30) };
    const pr = g.spellBaseParts();
    expect(pr.items).toBe(0);
    expect(pr.total).toBeGreaterThan(0);
  });
  it("gear on the hero counts only while usable (an unmet requirement gives nothing)", () => {
    const g = hero({ L: 30, ene: 50, gear: "staff", skills: {} });
    const withStaff = g.spellBaseParts().items;
    g.player.base.str = 1;
    expect(withStaff).toBeGreaterThan(0);
    expect(g.spellBaseParts().items).toBe(0);
  });
});

describe("v1.7 compare", () => {
  it("a sword instead of a worn battle staff: compare row 'base spell damage' −N", () => {
    const g = hero({ L: 30, ene: 60, gear: "staff", skills: {} });
    const rows = g.compare(makeItem("sword", 30), "main");
    const r = rows.find((x) => x.id === "sbase")!;
    expect(r).toBeTruthy();
    expect(Math.round(-r.diff)).toBe(Math.round(spellBase(30) * CASTER_SPELL_SHARE.battle_staff));
    expect(r.good).toBe(false);
  });
});

describe("v1.7 spell DPS comparisons", () => {
  it("caster weapon > non-caster; Energy pays; the stacking worst case stays bounded", () => {
    const rows: string[] = [];
    const out: Record<string, number> = {};
    for (const [L, id, sk] of [[30, "fire_ball", SK30], [60, "frozen_orb", SK60]] as const) {
      const cfgs: [string, Cfg][] = [
        ["staff, typical Energy", { L, ene: typicalEne(L), gear: "staff", skills: sk }],
        ["wand + orb, typical Energy", { L, ene: typicalEne(L), gear: "wand_orb", skills: sk }],
        ["wand only, typical Energy", { L, ene: typicalEne(L), gear: "wand", skills: sk }],
        ["sword, typical Energy", { L, ene: typicalEne(L), gear: "sword", skills: sk }],
        ["staff, base Energy (35)", { L, ene: 35, gear: "staff", skills: sk }],
        ["staff, all points in Energy", { L, ene: allEne(L), gear: "staff", skills: sk }],
        ["staff 10 levels behind, typical Energy", { L, ene: typicalEne(L), gear: "staff", ilvl: L - 10, skills: sk }],
        ["WORST: all Energy + staff + +3 skills + 100% FCR", { L, ene: allEne(L), gear: "staff", skills: sk, extra: [{ s: "clsk", v: 2, sk: "sorceress" }, { s: "skill", v: 1, sk: id }, { s: "fcr", v: 100 }] }],
      ];
      for (const [name, c] of cfgs) {
        const g = hero(c);
        const pr = g.spellBaseParts();
        const now = dps(g, id), old = oldDps(g, id);
        out[`${L} ${name}`] = now;
        out[`${L} ${name} old`] = old;
        rows.push(`| ${L} | ${id} | ${name} | ${Math.round(pr.level)} + ${Math.round(pr.energy)} + ${Math.round(pr.items)} = ${Math.round(pr.total)} | ${Math.round(old)} | ${Math.round(now)} | ${((now / old - 1) * 100).toFixed(0)}% |`);
      }
    }
    console.log(["SPELLDPS | Lvl | Spell | Build | base: level + Energy + items | v1.6.4 DPS | v1.7 DPS | change |", ...rows.map((r) => `SPELLDPS ${r}`)].join("\n"));
    for (const L of [30, 60]) {
      const typ = out[`${L} staff, typical Energy`];
      expect(out[`${L} sword, typical Energy`]).toBeLessThan(typ * 0.75);
      expect(out[`${L} sword, typical Energy`]).toBeLessThan(out[`${L} sword, typical Energy old`]); // less than before
      expect(typ).toBeGreaterThan(out[`${L} staff, typical Energy old`] * 0.9); // a caster weapon: about as before or more
      expect(typ).toBeLessThan(out[`${L} staff, typical Energy old`] * 1.2);
      expect(Math.abs(out[`${L} wand + orb, typical Energy`] / typ - 1)).toBeLessThan(0.03);
      expect(out[`${L} staff, all points in Energy`]).toBeGreaterThan(typ * 1.08); // Energy pays
      expect(out[`${L} staff, base Energy (35)`]).toBeLessThan(typ * 0.95);
      expect(out[`${L} WORST: all Energy + staff + +3 skills + 100% FCR`]).toBeLessThan(out[`${L} WORST: all Energy + staff + +3 skills + 100% FCR old`] * 1.35);
    }
  });
});
