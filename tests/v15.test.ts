// v1.5: act/level label, DPS with just-enough stats for missing requirements, no Amazon off-hand notes, resistance and
// leech colours.
import { describe, expect, it } from "vitest";
import { whereLabel } from "../src/data/acts";
import { type Item, itemReqs, makeItem } from "../src/data/items";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import { AMAZON_OFFHAND_MSG, Game, type GameEvents } from "../src/game";
import { MOD_TINT, RES_ORDER, modLine } from "../src/tints";
import uiSrc from "../src/ui.ts?raw";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const hero = (cls: "amazon" | "barbarian", str: number, dex: number, level = 30) => {
  const g = new Game(events, null, 5, { cls, name: "" });
  g.player.level = level;
  g.player.base.str = str;
  g.player.base.dex = dex;
  g.player.equip = {};
  return g;
};
/** DPS with the weapon really worn by a hero who has these stats. */
const realDps = (cls: "amazon" | "barbarian", str: number, dex: number, level: number, it: Item) => {
  const g = hero(cls, str, dex, level);
  g.player.equip.main = it;
  expect(g.usable("main")).toBe(true);
  return g.derived().dps;
};

describe("v1.5 version", () => {
  it("label and patch note", () => {
    expect(GAME_VERSION).toBe("1.6.3");
    expect(PATCH_NOTES.find((n) => n.version === "1.5")!.notes.length).toBe(4);
  });
});

describe("v1.5 act and level above the minimap", () => {
  it("Act N · Level within the act (v1.5.1); camp", () => {
    expect(whereLabel(0)).toBe("Ember Camp");
    expect(whereLabel(1)).toBe("Act 1 · Level 1");
    expect(whereLabel(20)).toBe("Act 1 · Level 20");
    expect(whereLabel(21)).toBe("Act 2 · Level 1");
    expect(whereLabel(42)).toBe("Act 3 · Level 2");
    expect(whereLabel(67)).toBe("Act 4 · Level 7");
    expect(whereLabel(80)).toBe("Act 4 · Level 20");
  });
});

describe("v1.5 DPS for gear you lack the stats for", () => {
  it("80 Dexterity with 90 required counts as 90 (bow, Amazon)", () => {
    const bow = makeItem("long_bow", 30);
    const r = itemReqs(bow);
    expect(r.dex).toBeGreaterThan(40);
    const g = hero("amazon", r.str + 50, r.dex - 10, 60);
    expect(g.meetsReq(bow)).toBe(false);
    const shown = g.weaponDps(bow)!.dps;
    expect(shown).toBeCloseTo(realDps("amazon", r.str + 50, r.dex, 60, bow), 6);
    // not the fists' DPS it used to show
    expect(shown).toBeGreaterThan(g.derived().dps * 2);
    // still unusable, and the hero's stats are untouched
    expect(g.meetsReq(bow)).toBe(false);
    expect(g.player.base.dex).toBe(r.dex - 10);
    expect(g.player.equip.main).toBeUndefined();
  });
  it("only the missing stat is raised: Strength already above its requirement keeps its real (higher) value", () => {
    const sw = makeItem("great_sword", 30);
    const r = itemReqs(sw);
    expect(r.str).toBeGreaterThan(30);
    expect(r.dex).toBeGreaterThan(10);
    // enough Strength (well above), short on Dexterity
    const g = hero("barbarian", r.str + 120, r.dex - 15, 60);
    const shown = g.weaponDps(sw)!.dps;
    expect(shown).toBeCloseTo(realDps("barbarian", r.str + 120, r.dex, 60, sw), 6);
    // and it is NOT the DPS at exactly the required Strength (that would be lower)
    expect(shown).toBeGreaterThan(realDps("barbarian", r.str, r.dex, 60, sw) + 1);
  });
  it("both stats and the level short: each raised to exactly its requirement", () => {
    const sw = makeItem("great_sword", 40);
    sw.mods = [{ s: "edmg", v: 50 }];
    sw.q = "magic";
    const r = itemReqs(sw);
    expect(r.lvl).toBeGreaterThan(20);
    const g = hero("barbarian", r.str - 20, r.dex - 5, r.lvl - 4);
    expect(g.weaponDps(sw)!.dps).toBeCloseTo(realDps("barbarian", r.str, r.dex, r.lvl, sw), 6);
    expect([g.player.base.str, g.player.base.dex, g.player.level]).toEqual([r.str - 20, r.dex - 5, r.lvl - 4]);
  });
  it("a weapon you can use is unchanged (real stats)", () => {
    const sw = makeItem("sword", 5);
    const g = hero("barbarian", 200, 200, 40);
    expect(g.weaponDps(sw)!.dps).toBeCloseTo(g.previewEquip(sw, "main").dps, 6);
  });
  it("gear Strength from other worn items counts toward the requirement (only the real shortfall is added)", () => {
    const sw = makeItem("great_sword", 30);
    const r = itemReqs(sw);
    const g = hero("barbarian", r.str - 10, r.dex + 30, 60);
    const ring = makeItem("ring", 10);
    ring.mods = [{ s: "str", v: 6 }];
    g.player.equip.ring1 = ring;
    // 4 short with the ring: shown as base Strength + 4
    const ref = hero("barbarian", r.str - 6, r.dex + 30, 60);
    ref.player.equip.ring1 = ring;
    ref.player.equip.main = sw;
    expect(ref.usable("main")).toBe(true);
    expect(g.weaponDps(sw)!.dps).toBeCloseTo(ref.derived().dps, 6);
  });
  it("compare uses it for the DPS rows (shop and bag alike) and the hero's other rows stay real", () => {
    const bow = makeItem("long_bow", 30);
    const r = itemReqs(bow);
    const g = hero("amazon", r.str + 20, r.dex - 10, 60);
    const rows = g.compare(bow, "main");
    const dps = rows.find((x) => x.id === "dps")!;
    expect(dps.diff).toBeCloseTo(g.weaponDps(bow)!.dps - g.derived().dps, 4);
    expect(rows.find((x) => x.id === "dex")).toBeUndefined(); // no pretend Dexterity in the stat diff
  });
  it("a worn weapon you no longer meet: still red (unusable), DPS shown as if just met", () => {
    const bow = makeItem("long_bow", 30);
    const r = itemReqs(bow);
    const g = hero("amazon", r.str + 20, r.dex - 10, 60);
    g.player.equip.main = bow;
    expect(g.usable("main")).toBe(false);
    expect(g.weaponDps(bow)!.dps).toBeCloseTo(realDps("amazon", r.str + 20, r.dex, 60, bow), 6);
    expect(g.player.equip.main).toBe(bow);
  });
});

describe("v1.5 Amazon off-hand: no red notes, the block stays", () => {
  const ui = uiSrc;
  it("no 'Main hand only' / off-hand card note in the UI source", () => {
    expect(ui).not.toMatch(/Main hand only/);
    expect(ui).not.toMatch(/class="offno|class="offnol|Can't go in the off-hand/);
  });
  it("equipping a weapon in her off-hand is still refused, with a short reason", () => {
    const g = hero("amazon", 200, 200, 30);
    const sw = makeItem("sword", 5);
    expect(g.equipError(sw, "off")).toBe(AMAZON_OFFHAND_MSG);
    expect(AMAZON_OFFHAND_MSG.length).toBeLessThan(40);
    expect(g.compareSlots(sw)).toEqual(["main"]);
  });
});

describe("v1.5 resistance and leech colours", () => {
  it("each resistance and leech stat has its class; Character row order poison, lightning, fire, cold", () => {
    expect(MOD_TINT).toMatchObject({ pres: "r-poison", lres: "r-light", fres: "r-fire", cres: "r-cold", ll: "lleech", ml: "mleech" });
    expect([...RES_ORDER]).toEqual(["poison", "light", "fire", "cold"]);
    expect(modLine({ s: "fres", v: 10 })).toBe('<span class="mod r-fire">Fire Resist +10%</span>');
    expect(modLine({ s: "ll", v: 4 })).toContain('class="mod lleech"');
    expect(modLine({ s: "ml", v: 4 })).toContain('class="mod mleech"');
    expect(modLine({ s: "str", v: 4 })).toBe('<span class="mod">+4 to Strength</span>');
    expect(modLine({ s: "ares", v: 8 })).toMatch(/r-poison.*r-light.*r-fire.*r-cold/);
  });
  // the colours themselves (computed in the browser) are checked in scripts/v15-shots.mjs
});
