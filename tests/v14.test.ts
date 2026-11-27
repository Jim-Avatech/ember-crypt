// v1.4: no stat twice on an item (any source), one flat affix pool, merging old doubled stats, Brann's crafting.
import { describe, expect, it } from "vitest";
import {
  AFFIXES, AFFIX_BY_ID, CRAFT_STEP, MAX_AFFIXES, affixCount, catOf, craftAffix, craftBlock, craftCost, enchant,
  mergeDuplicateMods, rollAffixes, rollDrop, skillPoolFor, statsOf, type Cat,
} from "../src/data/affixes";
import { type Item, makeItem } from "../src/data/items";
import { GAME_VERSION } from "../src/data/patchNotes";
import { SKILL_BY_ID } from "../src/data/skills";
import { Game, type GameEvents } from "../src/game";
import { addItem } from "../src/inventory";
import { bfs, idx, isFloor } from "../src/map";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const CATS: Cat[] = ["weapon", "armor", "helm", "shield", "gloves", "boots", "belt", "ring", "amulet"];
/** no stat appears twice (+skills: no skill twice) */
const noDupes = (it: Item) => {
  const keys = (it.mods ?? []).map((m) => (m.s === "skill" ? `skill` : m.s));
  return new Set(keys).size === keys.length && new Set(it.aff ?? []).size === (it.aff ?? []).length;
};

describe("v1.4 version", () => {
  it("label", () => expect(GAME_VERSION).toBe("1.7.1"));
});

describe("v1.4 no affix or stat twice, from any source", () => {
  it("drops (normal and boss, every level, both classes): 20,000 items, never a doubled stat", () => {
    const r = rng(11);
    let magic = 0, rare = 0;
    for (let i = 0; i < 20000; i++) {
      const it = rollDrop(1 + (i % 80), i % 3 ? 0 : 200, i % 7 === 0, r, i % 2 ? "amazon" : "barbarian");
      expect(noDupes(it), JSON.stringify(it)).toBe(true);
      if (it.q === "magic") magic++;
      if (it.q === "rare") rare++;
      expect(affixCount(it)).toBeLessThanOrEqual(MAX_AFFIXES);
    }
    expect(magic).toBeGreaterThan(1000);
    expect(rare).toBeGreaterThan(300);
  });
  it("affixes sharing a stat exclude each other: ED vs ED+AR, AR vs ED+AR, one Magic Find", () => {
    const r = rng(12);
    for (let i = 0; i < 6000; i++) {
      const cat = CATS[i % CATS.length];
      const res = rollAffixes(cat, 1 + (i % 40), "rare", r);
      expect(new Set(res.mods.map((m) => m.s)).size).toBe(res.mods.length);
      const a = new Set(res.aff);
      expect(a.has("edmg") && a.has("edmg_ar")).toBe(false);
      expect(a.has("ar") && a.has("edmg_ar")).toBe(false);
      expect(res.mods.filter((m) => m.s === "mf").length).toBeLessThanOrEqual(1);
    }
    expect(AFFIXES.filter((a) => statsOf(a).has("mf")).length).toBe(1);
  });
  it("Hilde's magic items never double a stat", () => {
    const g = new Game(events, null, 7, { cls: "amazon", name: "" });
    for (let k = 0; k < 60; k++) {
      g.player.level = 1 + k;
      g.restock();
      for (const e of g.vendorStock) expect(noDupes(e.item), JSON.stringify(e.item)).toBe(true);
    }
  });
  it("crafting never doubles a stat: 3,000 items crafted up to 4 affixes", () => {
    const r = rng(13);
    const bases = ["sword", "axe", "long_bow", "javelin", "armor", "helm", "shield", "gloves", "boots", "belt", "ring", "amulet"];
    for (let i = 0; i < 3000; i++) {
      const it = makeItem(bases[i % bases.length], 1 + (i % 40));
      for (let k = 0; k < 4; k++) {
        const res = craftAffix(it, r, i % 2 ? "amazon" : "barbarian");
        if (!res.ok) break;
      }
      expect(noDupes(it), JSON.stringify(it)).toBe(true);
    }
  });
});

describe("v1.4 one flat pool (no prefix/suffix split)", () => {
  it("affixes have no side; any can fill any slot", () => {
    for (const a of AFFIXES) expect((a as unknown as { side?: string }).side).toBeUndefined();
    expect(AFFIX_BY_ID.life).toBeTruthy();
    // before v1.4 a rare had at most 3 "of …" (suffix) affixes and a magic item at most one of each kind; now 4 "of"
    // affixes on a rare and two non-"of" affixes on a magic item both happen
    const r = rng(14);
    let fourOf = 0, twoPre = 0;
    for (let i = 0; i < 20000; i++) {
      const rare = rollAffixes("ring", 30, "rare", r);
      if (rare.names.length === 4 && rare.names.every((n) => n.startsWith("of "))) fourOf++;
      const mg = rollAffixes("armor", 30, "magic", r);
      if (mg.names.length === 2 && mg.names.every((n) => !n.startsWith("of "))) twoPre++;
    }
    expect(fourOf).toBeGreaterThan(0);
    expect(twoPre).toBeGreaterThan(0);
  });
  it("magic 1–2 affixes (about half each), rare 3–4", () => {
    const r = rng(15);
    const n = [0, 0, 0];
    for (let i = 0; i < 4000; i++) n[rollAffixes(CATS[i % 9], 25, "magic", r).aff.length]++;
    expect(n[0]).toBe(0);
    expect(n[1] / 4000).toBeGreaterThan(0.42);
    expect(n[2] / 4000).toBeGreaterThan(0.42);
    for (let i = 0; i < 2000; i++) {
      const k = rollAffixes(CATS[i % 9], 25, "rare", r).aff.length;
      expect(k).toBeGreaterThanOrEqual(3);
      expect(k).toBeLessThanOrEqual(4);
    }
  });
  it("magic names still come from what rolled (\"Jagged Axe of the Fox\" style)", () => {
    const r = rng(16);
    for (let i = 0; i < 200; i++) {
      const it = enchant(makeItem("axe", 20), "magic", r);
      expect(it.name).toContain("Axe");
    }
  });
});

describe("v1.4 old items with a doubled stat are merged, keeping the higher value", () => {
  const doubled = () => {
    const it = makeItem("ring", 20);
    it.q = "rare";
    it.name = "Grim Band";
    it.mods = [{ s: "mf", v: 10 }, { s: "ar", v: 30 }, { s: "mf", v: 22 }, { s: "ar", v: 55 }, { s: "life", v: 12 }];
    it.aff = ["p:mf", "p:ar", "s:mf", "p:edmg_ar", "s:life"];
    return it;
  };
  it("mergeDuplicateMods: one row per stat, higher value, plain affix ids", () => {
    const it = doubled();
    expect(mergeDuplicateMods(it)).toBe(2);
    expect(it.mods).toEqual([{ s: "mf", v: 22 }, { s: "ar", v: 55 }, { s: "life", v: 12 }]);
    expect(it.aff).toEqual(["mf", "ar", "edmg_ar", "life"]);
    expect(it.q).toBe("rare");
    expect(it.name).toBe("Grim Band");
    expect(mergeDuplicateMods(it)).toBe(0); // idempotent
    // different +skills are different stats and both stay
    const h = makeItem("helm", 20);
    h.mods = [{ s: "skill", v: 1, sk: "bash" }, { s: "skill", v: 2, sk: "leap" }];
    expect(mergeDuplicateMods(h)).toBe(0);
    expect(h.mods.length).toBe(2);
  });
  it("on load: equipped, bag, stash and unclaimed items are merged; nothing is removed", () => {
    const g = new Game(events, null, 3, { cls: "barbarian", name: "" });
    g.player.level = 40;
    const a = doubled(), b = doubled(), c = doubled(), d = doubled();
    g.player.equip.ring1 = a;
    addItem(g.player.bag, b);
    addItem(g.player.stash, c, 10, 10);
    g.player.unclaimed = [d];
    const nBag = g.player.bag.length, nStash = g.player.stash.length;
    const g2 = new Game(events, JSON.parse(JSON.stringify(g.toSave())));
    expect(g2.mergedItems).toBe(4);
    expect(g2.player.bag.length).toBe(nBag);
    expect(g2.player.stash.length).toBe(nStash);
    for (const it of [g2.player.equip.ring1!, g2.player.bag.find((e) => e.item.uid === b.uid)!.item, g2.player.stash.find((e) => e.item.uid === c.uid)!.item, g2.player.unclaimed![0]]) {
      expect(it.mods!.filter((m) => m.s === "mf")).toEqual([{ s: "mf", v: 22 }]);
      expect(it.mods!.filter((m) => m.s === "ar")).toEqual([{ s: "ar", v: 55 }]);
    }
    expect(g2.derived().mf).toBeGreaterThanOrEqual(22);
    const g3 = new Game(events, JSON.parse(JSON.stringify(g2.toSave())));
    expect(g3.mergedItems).toBe(0);
  });
});

describe("v1.4 crafting (Brann the Runesmith)", () => {
  const camp = (gold = 1e6) => {
    const g = new Game(events, null, 21, { cls: "barbarian", name: "" });
    g.player.level = 40;
    g.player.gold = gold;
    return g;
  };
  it("cost table: (50 + 20 × item level) × 1 / 3 / 8 / 20, rounded to 10", () => {
    expect(CRAFT_STEP).toEqual([1, 3, 8, 20]);
    expect([0, 1, 2, 3].map((n) => craftCost(1, n))).toEqual([70, 210, 560, 1400]);
    expect([0, 1, 2, 3].map((n) => craftCost(10, n))).toEqual([250, 750, 2000, 5000]);
    expect([0, 1, 2, 3].map((n) => craftCost(30, n))).toEqual([650, 1950, 5200, 13000]);
    expect([0, 1, 2, 3].map((n) => craftCost(60, n))).toEqual([1250, 3750, 10000, 25000]);
  });
  it("normal → magic 1 → magic 2 → rare 3 → rare 4, then refused; gold taken each step", () => {
    const g = camp();
    const it = makeItem("sword", 20);
    addItem(g.player.bag, it);
    const qs: string[] = [];
    const names: string[] = [];
    let gold = g.player.gold;
    for (let n = 0; n < 4; n++) {
      const qt = g.craftQuote(it);
      expect(qt.ok).toBe(true);
      expect(qt.cost).toBe(craftCost(20, n));
      expect(g.craft({ uid: it.uid })).toBeNull();
      expect(g.player.gold).toBe(gold - qt.cost);
      gold = g.player.gold;
      expect(affixCount(it)).toBe(n + 1);
      qs.push(it.q!);
      names.push(it.name!);
      expect(g.lastCraft!.added.length).toBeGreaterThan(0);
      expect(noDupes(it)).toBe(true);
    }
    expect(qs).toEqual(["magic", "magic", "rare", "rare"]);
    expect(names[0]).toContain("Sword");
    expect(names[1]).toContain("Sword");
    expect(names[2]).toMatch(/^\S+ \S+$/); // a rare name
    expect(names[3]).toBe(names[2]); // stays the same rare
    const q5 = g.craftQuote(it);
    expect(q5.ok).toBe(false);
    expect(q5.why).toMatch(/already has 4 affixes/);
    expect(g.craft({ uid: it.uid })).toMatch(/already has 4 affixes/);
    expect(g.player.gold).toBe(gold);
    expect(affixCount(it)).toBe(4);
  });
  it("a magic item from a drop with 2 affixes goes to rare with 3", () => {
    const r = rng(17);
    let it: Item;
    do it = enchant(makeItem("helm", 25), "magic", r); while (affixCount(it) !== 2);
    expect(craftAffix(it, r).ok).toBe(true);
    expect(it.q).toBe("rare");
    expect(affixCount(it)).toBe(3);
  });
  it("pays carried gold first, then stash gold (in camp only); not enough gold changes nothing", () => {
    const g = camp(100);
    g.player.stashGold = 1000;
    const it = makeItem("armor", 10); // 250 gold
    addItem(g.player.bag, it);
    expect(g.craft({ uid: it.uid })).toBeNull();
    expect(g.player.gold).toBe(0);
    expect(g.player.stashGold).toBe(850);
    g.player.stashGold = 100;
    const before = JSON.stringify(it);
    expect(g.craft({ uid: it.uid })).toMatch(/Not enough gold/);
    expect(JSON.stringify(it)).toBe(before);
    expect(g.player.stashGold).toBe(100);
    g.goDungeon(1);
    g.player.gold = 1e6;
    expect(g.craft({ uid: it.uid })).toMatch(/Ember Camp/);
  });
  it("works on what you wear (stats update at once)", () => {
    const g = camp();
    const a = makeItem("armor", 20);
    g.player.equip.chest = a;
    const life = g.derived().maxHp, def = g.derived().def;
    for (let k = 0; k < 4; k++) expect(g.craft({ slot: "chest" })).toBeNull();
    expect(affixCount(g.player.equip.chest!)).toBe(4);
    const d = g.derived();
    expect(d.maxHp !== life || d.def !== def || d.mf > 0 || d.ar >= 0).toBe(true);
  });
  it("refuses potions, arrows and anything at 4; only normal/magic/rare", () => {
    expect(craftBlock(makeItem("hp_potion"))).toMatch(/Potions/);
    expect(craftBlock(makeItem("arrows", 5))).toMatch(/can't be enchanted/);
    const odd = makeItem("sword", 5);
    (odd as unknown as { q: string }).q = "unique";
    expect(craftBlock(odd)).toMatch(/Only normal, magic and rare/);
  });
  it("level-appropriate tiers and +skill locks by item (bows: Bow skills; helms: Barbarian skills)", () => {
    const r = rng(18);
    for (let i = 0; i < 400; i++) {
      const h = makeItem("helm", 1);
      for (let k = 0; k < 4; k++) craftAffix(h, r, "amazon");
      expect((h.mods ?? []).some((m) => m.s === "skill")).toBe(false); // +skill tiers need item level 6
    }
    let seen = 0;
    for (let i = 0; i < 600; i++) {
      const bow = makeItem("long_bow", 30);
      for (let k = 0; k < 4; k++) craftAffix(bow, r, "barbarian");
      for (const m of bow.mods ?? []) if (m.s === "skill") {
        seen++;
        expect(SKILL_BY_ID[m.sk!].tab).toBe("bow");
      }
      const helm = makeItem("helm", 30);
      for (let k = 0; k < 4; k++) craftAffix(helm, r, "amazon");
      for (const m of helm.mods ?? []) if (m.s === "skill") expect(SKILL_BY_ID[m.sk!].cls).toBe("barbarian");
    }
    expect(seen).toBeGreaterThan(10);
    expect(skillPoolFor("long_bow").every((id) => SKILL_BY_ID[id].tab === "bow")).toBe(true);
    // every crafted affix fits the item type
    const ring = makeItem("ring", 30);
    for (let k = 0; k < 4; k++) craftAffix(ring, r);
    for (const k of ring.aff!) expect(AFFIX_BY_ID[k].cats).toContain(catOf("ring"));
  });
  it("Brann stands in camp on open ground, reachable, and blocks no path", () => {
    const g = camp();
    const c = g.level.crafter!;
    expect(c).toBeTruthy();
    expect(isFloor(g.level, Math.floor(c.x), Math.floor(c.y))).toBe(true);
    const field = bfs(g.level, Math.floor(g.level.spawn.x), Math.floor(g.level.spawn.y));
    for (const pt of [c, g.level.vendor!, { x: g.level.stash!.x, y: g.level.stash!.y + 1 }, g.level.waypoint, { x: c.x + 1, y: c.y + 1 }])
      expect(field[idx(Math.floor(pt.x), Math.floor(pt.y))], JSON.stringify(pt)).toBeLessThan(0xffff);
    // the crafter isn't a solid prop: every camp tile reachable without him is still reachable
    expect(g.level.props.some((pr) => Math.floor(pr.x) === Math.floor(c.x) && Math.floor(pr.y) === Math.floor(c.y))).toBe(false);
    g.player.x = c.x + 1;
    g.player.y = c.y + 0.5;
    expect(g.nearCrafter()).toBe(true);
    expect(g.contextAction()).toBe("craft");
    g.goDungeon(1);
    expect(g.nearCrafter()).toBe(false);
  });
});
