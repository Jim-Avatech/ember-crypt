import { describe, expect, it } from "vitest";
import { AFFIX_BY_ID, catOf, enchant, rollAffixes, rollDrop, rollQuality, type Cat } from "../src/data/affixes";
import {
  BASE_BY_ID, ITEM_BASES, type Item, baseDamage, baseDefense, itemDamage, itemDefense, itemName, itemPrice, itemReqs,
  makeItem, migrateItem, sellPrice,
} from "../src/data/items";
import { BASE_RUN, Game, type GameEvents, SAVE_VERSION, migrateSave } from "../src/game";

/** Small deterministic RNG so failures reproduce. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const CATS: Cat[] = ["weapon", "armor", "helm", "shield", "gloves", "boots", "belt", "ring", "amulet"];
const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };

describe("item classes", () => {
  it("has one base per class", () => {
    const ids = ITEM_BASES.map((b) => b.id).sort();
    expect(ids).toEqual(["amulet", "armor", "arrows", "axe", "belt", "boots", "gloves", "great_sword", "helm", "hp_potion", "javelin", "long_bow", "mace", "mp_potion", "quarterstaff", "ring", "shield", "short_bow", "spear", "sword", "throwing_axe", "throwing_knife"]);
  });

  it("class sets spread and speed, level sets the numbers", () => {
    const [sl, sh] = baseDamage(BASE_BY_ID.sword, 10);
    const [al, ah] = baseDamage(BASE_BY_ID.axe, 10);
    const [ml, mh] = baseDamage(BASE_BY_ID.mace, 10);
    expect(ah - al).toBeGreaterThan(mh - ml); // axe swingier than mace
    expect(sh - sl).toBeGreaterThan(mh - ml);
    expect(BASE_BY_ID.sword.speed!).toBeLessThan(BASE_BY_ID.axe.speed!); // sword fastest
    for (const id of ["sword", "axe", "mace", "great_sword"]) {
      const lo = baseDamage(BASE_BY_ID[id], 1);
      const hi = baseDamage(BASE_BY_ID[id], 20);
      expect(hi[0] + hi[1]).toBeGreaterThan((lo[0] + lo[1]) * 3);
    }
    expect(baseDefense(BASE_BY_ID.armor, 15)).toBeGreaterThan(baseDefense(BASE_BY_ID.armor, 1) * 4);
    expect(baseDefense(BASE_BY_ID.armor, 5)).toBeGreaterThan(baseDefense(BASE_BY_ID.gloves, 5));
  });

  it("white items have no affixes and a plain name", () => {
    const w = makeItem("mace", 7);
    expect(w.mods ?? []).toHaveLength(0);
    expect(itemName(w)).toBe(BASE_BY_ID.mace.name);
    expect(itemReqs(w).lvl).toBe(0);
  });
});

describe("affix rolling", () => {
  it("magic items get 1–2 affixes, at most one per side, with a prefix/suffix name", () => {
    const r = rng(1);
    for (let i = 0; i < 400; i++) {
      const cat = CATS[i % CATS.length];
      const ilvl = 1 + (i % 30);
      const res = rollAffixes(cat, ilvl, "magic", r);
      expect(res.aff.length).toBeGreaterThanOrEqual(1);
      expect(res.aff.length).toBeLessThanOrEqual(2);
      expect(res.prefixes.length).toBeLessThanOrEqual(1);
      expect(res.suffixes.length).toBeLessThanOrEqual(1);
    }
    const it2 = enchant(makeItem("axe", 12), "magic", rng(7));
    expect(it2.q).toBe("magic");
    expect(it2.name).toContain("Axe");
  });

  it("rare items get 3–4 affixes, at most 3 prefixes and 3 suffixes, no duplicate groups", () => {
    const r = rng(2);
    for (let i = 0; i < 600; i++) {
      const cat = CATS[i % CATS.length];
      const ilvl = 1 + (i % 30);
      const res = rollAffixes(cat, ilvl, "rare", r);
      expect(res.aff.length, `${cat} ilvl ${ilvl}`).toBeGreaterThanOrEqual(3);
      expect(res.aff.length).toBeLessThanOrEqual(4);
      expect(res.prefixes.length).toBeLessThanOrEqual(3);
      expect(res.suffixes.length).toBeLessThanOrEqual(3);
      expect(new Set(res.aff).size).toBe(res.aff.length);
      expect(res.aff.includes("p:edmg") && res.aff.includes("p:edmg_ar")).toBe(false);
    }
    const rare = enchant(makeItem("sword", 15), "rare", rng(3));
    expect(rare.name).toMatch(/^\S+ \S+$/); // two-word name
  });

  it("tiers respect item level and values stay in range", () => {
    const r = rng(4);
    for (let i = 0; i < 500; i++) {
      const ilvl = 1 + (i % 25);
      const it = enchant(makeItem(ITEM_BASES.filter((b) => !b.potion && b.slot !== "quiver")[i % 12].id, ilvl), i % 2 ? "rare" : "magic", r);
      for (const key of it.aff ?? []) {
        const def = AFFIX_BY_ID[key];
        expect(def, key).toBeTruthy();
        expect(def.cats).toContain(catOf(it.baseId));
      }
      for (const m of it.mods ?? []) expect(m.v).toBeGreaterThan(0);
      // the best tier available at this level must be legal
      const names = it.name!.split(" ");
      for (const key of it.aff ?? []) {
        const def = AFFIX_BY_ID[key];
        const tier = def.tiers.find((t) => names.includes(t.name.split(" ").pop()!) || it.name!.includes(t.name));
        if (tier && it.q === "magic") expect(tier.lvl).toBeLessThanOrEqual(ilvl);
      }
    }
    // level 1 items can't roll +skills (tier needs 6)
    for (let i = 0; i < 200; i++) {
      const it = enchant(makeItem("helm", 1), "rare", r);
      expect((it.mods ?? []).some((m) => m.s === "skill")).toBe(false);
    }
  });

  it("magic find raises magic and rare odds; boss drops are better", () => {
    const count = (mf: number, boss: boolean) => {
      const r = rng(9);
      const c = { normal: 0, magic: 0, rare: 0 };
      for (let i = 0; i < 20000; i++) c[rollQuality(5, mf, boss, r)]++;
      return c;
    };
    const base = count(0, false);
    const mf = count(200, false);
    const boss = count(0, true);
    expect(mf.rare).toBeGreaterThan(base.rare * 1.5);
    expect(mf.magic + mf.rare).toBeGreaterThan(base.magic + base.rare);
    expect(boss.normal).toBe(0);
    expect(boss.rare).toBeGreaterThan(base.rare * 3);
    // rings and amulets never drop white
    const r = rng(5);
    for (let i = 0; i < 2000; i++) {
      const it = rollDrop(3, 0, false, r);
      if (BASE_BY_ID[it.baseId].slot === "ring" || BASE_BY_ID[it.baseId].slot === "amulet") expect(it.q).toBeTruthy();
    }
  });
});

describe("stat application", () => {
  it("damage and defense mods change item numbers", () => {
    const sw: Item = { ...makeItem("sword", 10), q: "magic", mods: [{ s: "edmg", v: 50 }, { s: "maxdmg", v: 3 }] };
    const [bl, bh] = baseDamage(BASE_BY_ID.sword, 10);
    const [l, h] = itemDamage(sw);
    expect(l).toBe(Math.floor(bl * 1.5));
    expect(h).toBe(Math.floor(bh * 1.5) + 3);
    const ar: Item = { ...makeItem("armor", 10), q: "magic", mods: [{ s: "edef", v: 100 }, { s: "def", v: 5 }] };
    expect(itemDefense(ar)).toBe(baseDefense(BASE_BY_ID.armor, 10) * 2 + 5);
    expect(itemPrice(ar)).toBeGreaterThan(itemPrice(makeItem("armor", 10)));
    expect(sellPrice(ar)).toBe(Math.floor(itemPrice(ar) / 4));
  });

  it("gear stats flow into the character", () => {
    const g = new Game(events, null, 123);
    g.player.level = 10; // v1.1: the rare ring needs level 3 to work
    const before = g.derived();
    expect(before.speed).toBeCloseTo(BASE_RUN);
    g.player.equip.ring1 = { ...makeItem("ring", 5), q: "rare", name: "Test Band", mods: [
      { s: "str", v: 10 }, { s: "vit", v: 5 }, { s: "life", v: 20 }, { s: "ias", v: 20 }, { s: "frw", v: 10 },
      { s: "ll", v: 6 }, { s: "fres", v: 30 }, { s: "ares", v: 10 }, { s: "mf", v: 25 }, { s: "gf", v: 40 }, { s: "ar", v: 50 },
    ] };
    const d = g.derived();
    expect(d.stats.str).toBe(g.player.base.str + 10);
    expect(d.maxHp).toBe(before.maxHp + 5 * 4 + 20);
    expect(d.hands[0].dmgPct).toBe(before.hands[0].dmgPct + 10);
    expect(d.hands[0].ar).toBeGreaterThan(before.hands[0].ar + 49);
    expect(d.swing).toBeLessThan(before.swing);
    expect(d.speed).toBeCloseTo(BASE_RUN * 1.1);
    expect(d.ll).toBe(6);
    expect(d.res.fire).toBe(40);
    expect(d.res.cold).toBe(10);
    expect(d.mf).toBe(25);
    expect(d.gf).toBe(40);
  });

  it("+skill gear raises learned skills only", () => {
    const g = new Game(events, null, 5);
    g.player.level = 10; // v1.1: the magic helm needs level 7 to work
    g.player.equip.head = { ...makeItem("helm", 10), q: "magic", mods: [{ s: "skill", v: 2, sk: "bash" }] };
    expect(g.skillLevel("bash")).toBe(0);
    g.player.skills.bash = 1;
    expect(g.skillLevel("bash")).toBe(3);
    expect(g.hardLevel("bash")).toBe(1);
  });

  it("requirements count gear stats", () => {
    const g = new Game(events, null, 6);
    const big = makeItem("great_sword", 30);
    expect(g.meetsReq(big)).toBe(false);
    g.player.level = 30;
    g.player.equip.amulet = { ...makeItem("amulet", 5), q: "magic", mods: [{ s: "str", v: 100 }, { s: "dex", v: 100 }] };
    expect(g.meetsReq(big)).toBe(true);
  });
});

describe("migration", () => {
  it("maps old D2 bases onto the new classes", () => {
    expect(migrateItem({ uid: 1, baseId: "war_axe" })!.baseId).toBe("axe");
    expect(migrateItem({ uid: 2, baseId: "morning_star" })!.baseId).toBe("mace");
    expect(migrateItem({ uid: 3, baseId: "two_handed_sword" })!.baseId).toBe("great_sword");
    expect(migrateItem({ uid: 4, baseId: "chain_mail" })!.baseId).toBe("armor");
    expect(migrateItem({ uid: 5, baseId: "chain_mail" })!.ilvl).toBeGreaterThan(5);
    const ring = migrateItem({ uid: 6, baseId: "gold_ring" })!;
    expect(ring.baseId).toBe("ring");
    expect(ring.q).toBe("magic");
    expect((ring.mods ?? []).length).toBeGreaterThan(0);
    expect(migrateItem({ uid: 7, baseId: "sword", ilvl: 4 })).toEqual({ uid: 7, baseId: "sword", ilvl: 4 });
  });

  it("converts a v2 save to v3 and keeps gear", () => {
    const v2 = {
      v: 2, seed: 9, floor: 2, maxFloor: 3,
      player: {
        level: 6, xp: 100, base: { str: 40, dex: 25, vit: 30, ene: 10 }, statPoints: 0, skillPoints: 0, skills: { bash: 2 },
        slots: ["bash", null, null], gold: 50, hpPots: 2, mpPots: 1, kills: 40,
        equip: { main: { uid: 1, baseId: "war_axe" }, chest: { uid: 2, baseId: "chain_mail", def: 30 }, ring1: { uid: 3, baseId: "silver_ring" } },
        bag: [{ item: { uid: 4, baseId: "scimitar" }, x: 0, y: 0 }, { item: { uid: 5, baseId: "hp_potion" }, x: 1, y: 0 }],
      },
    };
    const s = migrateSave(v2)!;
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.player.equip.main!.baseId).toBe("axe");
    expect(s.player.equip.chest!.baseId).toBe("armor");
    expect(s.player.equip.ring1!.q).toBe("magic");
    expect(s.player.bag.map((e) => e.item.baseId).sort()).toEqual(["hp_potion", "sword"]);
    const g = new Game(events, s);
    expect(g.derived().def).toBeGreaterThan(0);
  });
});
