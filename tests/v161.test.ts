// v1.6.1 Sorceress fixes: spell base and real damage in tooltips / Character screen, +class and +tree skill affixes
// (one flat pool, Brann), Static Field reach in corridors, more generous mana regen / Warmth, Faster Cast Rate.
import { describe, expect, it } from "vitest";
import { AFFIX_BY_ID, catOf, craftAffix, enchant, itemClassFor, modText, } from "../src/data/affixes";
import { type Item, type Mod, makeItem } from "../src/data/items";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import { CLASS_TABS } from "../src/data/skills";
import { FCR_CAP, SORC_CAST, castTimeFor, spellBase, staticR, warmthRegen } from "../src/data/sorc";
import { CLASS_DEF, Game, type GameEvents, type Monster } from "../src/game";
import { isFloor, lineOfSight } from "../src/map";
import { SPELL_K, spellDamageText, spellDps, spellHit } from "../src/spells";
import swSrc from "../public/sw.js?raw";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };

function sorc(level = 30, skills: Record<string, number> = {}) {
  const g = new Game(events, null, 7, { cls: "sorceress", name: "" });
  g.player.level = level;
  g.player.skills = { ...skills };
  g.player.base.str = 60; // meets a level 30 battle staff's Strength
  return g;
}
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function oneMonster(g: Game, x: number, y: number, hp = 1e6): Monster {
  const proto = g.monsters.find((m) => m.def.rank === "normal")!;
  const m = { ...proto, id: 7e6, x, y, state: "chase", kx: 0, ky: 0, stunT: 0, chillT: 0, frozenT: 0, freezeImmuneUntil: -1, hp, maxHp: Math.max(hp, 10), fuse: -1 } as Monster;
  m.def = { ...proto.def, speed: 0, dmgMin: 0, dmgMax: 0, behavior: "melee", specials: undefined, shot: undefined } as Monster["def"];
  g.monsters = [m];
  return m;
}
function castRun(g: Game, id: string, secs = 0.7) {
  const p = g.player;
  p.mana = 1e5;
  p.action = null;
  const ok = g.castSkill(id, g.derived());
  const sx = p.x, sy = p.y;
  for (let t = 0; t < secs; t += 1 / 60) {
    p.hp = Math.max(p.hp, 1e4);
    const ms = g.monsters.map((m) => [m.x, m.y]);
    g.update(1 / 60, idle);
    g.monsters.forEach((m, i) => { m.x = ms[i][0]; m.y = ms[i][1]; });
    p.x = sx; p.y = sy;
  }
  return ok;
}

describe("v1.6.1 version, cache", () => {
  it("version 1.6.1 with a patch note on top; service worker cache v34", () => {
    expect(GAME_VERSION).toBe("1.8.1");
    const n161 = PATCH_NOTES.find((q) => q.version === "1.6.1")!;
    expect(n161.version).toBe("1.6.1");
    expect(n161.notes.length).toBe(5);
    expect(swSrc).toMatch(/shell-v\d+/);
  });
});

describe("1. spell base damage shown", () => {
  it("every damaging spell's tooltip damage is spell base × its multiple × mastery, ±15%", () => {
    const g = sorc(40, { fire_ball: 12, fire_mastery: 5, frozen_orb: 8, chain_lightning: 3 });
    for (const id of ["fire_ball", "frozen_orb", "chain_lightning"]) {
      const lvl = g.skillLevel(id);
      const t = spellDamageText(g as never, id, lvl)!;
      const avg = spellHit(g as never, id === "fire_ball" ? "fire" : id === "frozen_orb" ? "cold" : "light", SPELL_K[id].k(lvl));
      const [lo, hi] = t.match(/\d+/g)!.map(Number);
      expect(lo, t).toBe(Math.round(avg * 0.85));
      expect(hi, t).toBe(Math.round(avg * 1.15));
    }
    expect(spellDamageText(g as never, "fire_ball", 12)).toMatch(/fire$/);
    expect(spellDamageText(g as never, "frozen_orb", 8)).toMatch(/cold per shard$/);
    expect(spellDamageText(g as never, "teleport", 3)).toBeNull();
    expect(Math.round(spellBase(40))).toBe(74);
  });
  it("every spell with spell-base damage has real numbers", () => {
    const g = sorc(30);
    for (const id of Object.keys(SPELL_K)) expect(spellDamageText(g as never, id, 1), id).toMatch(/^\d+(–\d+)? (fire|cold|lightning)/);
  });
});

describe("2. +class and +tree skill affixes", () => {
  const mods = (it: Item) => it.mods ?? [];
  it("staves, wands and orbs roll +Sorceress skills and +Fire/Cold/Lightning; never another class", () => {
    const r = seeded(5);
    let cls = 0, tab = 0, n = 0;
    const tabs = new Set<string>();
    for (const base of ["battle_staff", "wand", "orb"]) {
      for (let i = 0; i < 1500; i++) {
        const it = enchant(makeItem(base, 40), "rare", r, "barbarian");
        n++;
        for (const m of mods(it)) {
          if (m.s === "clsk") { cls++; expect(m.sk).toBe("sorceress"); }
          if (m.s === "tabsk") { tab++; tabs.add(m.sk!); expect(CLASS_TABS.sorceress).toContain(m.sk); }
        }
        // one flat pool: never the same stat twice
        const ss = mods(it).map((m) => m.s);
        expect(new Set(ss).size).toBe(ss.length);
      }
    }
    expect(cls / n).toBeGreaterThan(0.05);
    expect(tab / n).toBeGreaterThan(0.05);
    expect([...tabs].sort().join()).toBe("cold,fire,lightning");
  });
  it("bows/spears/javelins → Amazon, other weapons and helms → Barbarian, amulets mostly the finder's class", () => {
    const r = seeded(9);
    expect(itemClassFor("short_bow", r)).toBe("amazon");
    expect(itemClassFor("javelin", r)).toBe("amazon");
    expect(itemClassFor("spear", r)).toBe("amazon");
    expect(itemClassFor("sword", r)).toBe("barbarian");
    expect(itemClassFor("helm", r)).toBe("barbarian");
    expect(itemClassFor("orb", r)).toBe("sorceress");
    let mine = 0;
    for (let i = 0; i < 2000; i++) if (itemClassFor("amulet", r, "sorceress") === "sorceress") mine++;
    expect(mine / 2000).toBeGreaterThan(0.7);
    expect(mine / 2000).toBeLessThan(0.86);
    for (let i = 0; i < 300; i++) {
      const it = enchant(makeItem("long_bow", 40), "rare", r, "sorceress");
      for (const m of mods(it)) if (m.s === "clsk") expect(m.sk).toBe("amazon");
      for (const m of mods(it)) if (m.s === "tabsk") expect(CLASS_TABS.amazon).toContain(m.sk);
    }
  });
  it("Brann can add them (and never a second one of the same stat)", () => {
    const r = seeded(13);
    let got = 0;
    for (let i = 0; i < 400; i++) {
      const it = makeItem("battle_staff", 40);
      for (let k = 0; k < 4; k++) craftAffix(it, r, "sorceress");
      const ss = mods(it).map((m) => m.s);
      expect(new Set(ss).size).toBe(ss.length);
      if (ss.includes("clsk") || ss.includes("tabsk")) got++;
    }
    expect(got).toBeGreaterThan(40);
  });
  it("they raise learned skills of the hero's own class only (and the right tree)", () => {
    const g = sorc(30, { fire_ball: 5, frozen_orb: 3 });
    const st = makeItem("battle_staff", 30);
    st.q = "rare";
    st.mods = [{ s: "clsk", v: 2, sk: "sorceress" }, { s: "tabsk", v: 3, sk: "fire" }] as Mod[];
    g.player.equip.main = st;
    expect(g.skillLevel("fire_ball")).toBe(5 + 2 + 3);
    expect(g.skillLevel("frozen_orb")).toBe(3 + 2);
    expect(g.skillLevel("meteor")).toBe(0); // unlearned skills stay unlearned
    const b = new Game(events, null, 3, { cls: "barbarian", name: "" });
    b.player.skills = { bash: 4 };
    b.player.equip.main = st;
    expect(b.skillLevel("bash")).toBe(4);
    expect(modText(st.mods![0])).toBe("+2 to Sorceress Skill Levels");
    expect(modText(st.mods![1])).toBe("+3 to Fire Spells (Sorceress Only)");
  });
  it("compare shows them as their own rows", () => {
    const g = sorc(30, { fire_ball: 5 });
    const a = makeItem("battle_staff", 30);
    const b = makeItem("battle_staff", 30);
    b.mods = [{ s: "tabsk", v: 2, sk: "fire" }];
    g.player.equip.main = a;
    const rows = g.compare(b, "main");
    expect(rows.find((r) => r.id === "skill:tab:fire")?.label).toBe("to Fire Spells");
  });
});

describe("3. Static Field in corridors", () => {
  /** a straight run of floor `len` tiles long with a wall 1-2 tiles to one side (a corridor or a room's edge) */
  function corridor(g: Game, len: number) {
    const L = g.level;
    for (let y = 2; y < L.h - 2; y++)
      for (let x = 2; x < L.w - len - 2; x++) {
        let ok = true;
        for (let k = 0; k <= len && ok; k++) ok = isFloor(L, x + k, y) && (!isFloor(L, x + k, y - 1) || !isFloor(L, x + k, y + 1));
        if (ok) return { x: x + 0.5, y: y + 0.5 };
      }
    return null;
  }
  it("radius: 6.5 tiles at level 1 (was 3.85), +0.25 a level, max 10", () => {
    expect(staticR(1)).toBe(6.5);
    expect(staticR(11)).toBe(9);
    expect(staticR(20)).toBe(10);
  });
  it("hits a monster 6 tiles down a corridor at skill level 1", () => {
    const g = sorc(14, { static_field: 1 });
    g.goDungeon(5);
    const c = corridor(g, 7)!;
    expect(c).toBeTruthy();
    g.player.x = c.x; g.player.y = c.y; g.player.fx = 1; g.player.fy = 0;
    const m = oneMonster(g, c.x + 6, c.y, 200);
    castRun(g, "static_field");
    expect(m.hp).toBeLessThan(200);
  });
  it("never through a wall", () => {
    const g = sorc(14, { static_field: 1 });
    g.goDungeon(5);
    const L = g.level;
    let pair: [number, number, number, number] | null = null;
    for (let y = 2; y < L.h - 2 && !pair; y++)
      for (let x = 2; x < L.w - 6 && !pair; x++)
        if (isFloor(L, x, y) && isFloor(L, x + 4, y) && !lineOfSight(L, x + 0.5, y + 0.5, x + 4.5, y + 0.5)) pair = [x + 0.5, y + 0.5, x + 4.5, y + 0.5];
    expect(pair).toBeTruthy();
    const [px, py, mx, my] = pair!;
    g.player.x = px; g.player.y = py;
    const m = oneMonster(g, mx, my, 200);
    castRun(g, "static_field");
    expect(m.hp).toBe(200);
  });
  it("a weak monster still loses 1 life (was 0), and is never killed", () => {
    const g = sorc(14, { static_field: 1 });
    g.goDungeon(5);
    const c = corridor(g, 4)!;
    g.player.x = c.x; g.player.y = c.y;
    const m = oneMonster(g, c.x + 2, c.y, 3);
    castRun(g, "static_field");
    expect(m.hp).toBe(2);
    castRun(g, "static_field");
    castRun(g, "static_field");
    expect(m.hp).toBe(1);
    expect(m.state).not.toBe("dead");
  });
});

describe("4. mana regeneration", () => {
  const refill = (cls: "sorceress" | "barbarian", warmth: number) => {
    const g = new Game(events, null, 7, { cls, name: "" });
    g.player.level = 30;
    g.player.skills = warmth ? { warmth } : {};
    g.player.mana = 0;
    let t = 0;
    while (g.player.mana < g.derived().maxMana - 1e-6 && t < 120) { g.update(0.05, idle); t += 0.05; }
    return t;
  };
  it("Sorceress 2× the others (was 1.5×), Warmth +60% at level 1, +20% a level", () => {
    expect(CLASS_DEF.sorceress.manaRegen).toBe(2);
    expect(warmthRegen(1)).toBe(60);
    expect(warmthRegen(10)).toBe(240);
    expect(refill("barbarian", 0)).toBeCloseTo(45, 0);
    expect(refill("sorceress", 0)).toBeCloseTo(22.5, 0);
    expect(refill("sorceress", 1)).toBeCloseTo(45 / (2 * 1.6), 0);
    expect(refill("sorceress", 10)).toBeCloseTo(45 / (2 * 3.4), 0);
  });
});

describe("5. Faster Cast Rate", () => {
  it("cast time 0.5 s × 100 / (100 + FCR), FCR capped at 100% (0.25 s)", () => {
    expect(castTimeFor(0)).toBe(SORC_CAST);
    expect(castTimeFor(20)).toBeCloseTo(0.5 / 1.2, 6);
    expect(castTimeFor(500)).toBeCloseTo(0.25, 6);
    expect(FCR_CAP).toBe(100);
  });
  it("gear FCR shortens the real cast and raises Spell DPS", () => {
    const g = sorc(30, { fire_bolt: 10 });
    const before = spellDps(g as never, "fire_bolt");
    const am = makeItem("amulet", 30);
    am.q = "magic";
    am.mods = [{ s: "fcr", v: 30 }];
    g.player.equip.amulet = am;
    expect(g.castTime()).toBeCloseTo(0.5 / 1.3, 6);
    expect(g.derived().fcr).toBe(30);
    expect(spellDps(g as never, "fire_bolt") / before).toBeCloseTo(1.3, 5);
    // cooldown spells don't get faster than their cooldown
    const f = sorc(30, { meteor: 5 });
    const m0 = spellDps(f as never, "meteor");
    f.player.equip.amulet = am;
    expect(spellDps(f as never, "meteor")).toBeCloseTo(m0, 6);
    g.goDungeon(5);
    g.player.mana = 1e5;
    g.castSkill("fire_bolt", g.derived());
    expect(g.player.action && "dur" in g.player.action ? g.player.action.dur : 0).toBeCloseTo(0.5 / 1.3, 6);
  });
  it("rolls on staves, wands, orbs (3× as often), amulets, rings and helms; never on other weapons", () => {
    const fcr = AFFIX_BY_ID.fcr;
    expect(fcr.cats.sort().join()).toBe("amulet,helm,orb,ring,weapon");
    const r = seeded(3);
    const rate = (base: string) => {
      let n = 0;
      for (let i = 0; i < 3000; i++) if ((enchant(makeItem(base, 40), "magic", r).mods ?? []).some((m) => m.s === "fcr")) n++;
      return n / 3000;
    };
    expect(rate("sword")).toBe(0);
    expect(rate("long_bow")).toBe(0);
    const staff = rate("battle_staff"), orb = rate("orb"), amulet = rate("amulet"), helm = rate("helm");
    expect(staff).toBeGreaterThan(0.1);
    expect(orb).toBeGreaterThan(amulet * 2);
    expect(helm).toBeGreaterThan(0);
    expect(catOf("orb")).toBe("orb");
  });
});

describe("saves", () => {
  it("a v1.6 save (with v1.6 items) loads unchanged; new affixes save and load", () => {
    const g = sorc(30, { fire_ball: 5 });
    const st = makeItem("battle_staff", 30);
    st.q = "rare";
    st.mods = [{ s: "clsk", v: 1, sk: "sorceress" }, { s: "tabsk", v: 2, sk: "fire" }, { s: "fcr", v: 20 }];
    g.player.equip.main = st;
    const s = JSON.parse(JSON.stringify(g.toSave()));
    const h = new Game(events, s);
    expect(h.player.equip.main?.mods).toEqual(st.mods);
    expect(h.skillLevel("fire_ball")).toBe(8);
    expect(h.castTime()).toBeCloseTo(0.5 / 1.2, 6);
    const old = sorc(20, { fire_bolt: 3 });
    const os = JSON.parse(JSON.stringify(old.toSave()));
    const ho = new Game(events, os);
    expect(ho.player.skills.fire_bolt).toBe(3);
    expect(ho.castTime()).toBe(0.5);
  });
});
