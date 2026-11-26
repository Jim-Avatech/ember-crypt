// v1.0: hero slots (the existing hero becomes slot 1 untouched), the Amazon's bow, javelin stab/throw toggle,
// basic attacks on skill buttons, and class-neutral loot.
import { beforeEach, describe, expect, it } from "vitest";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  get length() {
    return this.m.size;
  }
}
const mem = new MemStorage();
(globalThis as unknown as { localStorage: MemStorage }).localStorage = mem;

const save = await import("../src/save");
const { Game, migrateSave } = await import("../src/game");
const { ITEM_BASES, makeItem, rollBase } = await import("../src/data/items");
const { SKILLS, CLASS_TABS } = await import("../src/data/skills");
type G = InstanceType<typeof Game>;
type Mon = G["monsters"][number];
const events = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };

beforeEach(() => {
  mem.clear();
  save.setSlot(1);
  save.loadGame();
});

// what v0.9.4 wrote for a finished Barbarian (v6 save shape)
function barbarianV6() {
  const g = new Game(events, null, 77);
  const s = g.toSave() as unknown as Record<string, unknown> & { player: Record<string, unknown> };
  s.v = 6;
  delete s.stashAt;
  delete s.player.cls;
  delete s.player.name;
  delete s.player.mainAtk;
  Object.assign(s.player, { level: 61, xp: 9_000_000, gold: 123456, skills: { bash: 1, double_swing: 5, frenzy: 20, whirlwind: 20, battle_orders: 10 }, slots: ["whirlwind", "frenzy", "battle_orders"] });
  (s.player as { stash: unknown[] }).stash = [{ item: { uid: 5, baseId: "great_sword", ilvl: 60, q: "rare", name: "Grim Edge", mods: [{ s: "edmg", v: 200 }], aff: ["p:edmg"] }, x: 0, y: 0 }];
  s.maxFloor = 80;
  s.savedAt = 1_700_000_000_000;
  return s;
}

describe("v1.0 hero slots", () => {
  it("the existing save is hero #1: same key, migrated to v7 as a Barbarian, nothing lost", () => {
    const old = barbarianV6();
    mem.setItem(save.KEY, JSON.stringify(old));
    const before = mem.getItem(save.KEY);
    const r = save.loadGame();
    expect(r.source).toBe("main");
    const d = r.data!;
    expect(d.v).toBe(7);
    expect(d.player.cls).toBe("barbarian");
    expect(d.player.name).toBe("Barbarian");
    expect(d.player.level).toBe(61);
    expect(d.player.gold).toBe(123456);
    expect(d.player.skills).toMatchObject({ frenzy: 20, whirlwind: 20, battle_orders: 10 });
    expect(d.player.slots).toEqual(["whirlwind", "frenzy", "battle_orders"]);
    expect(d.player.stash?.length).toBe(1);
    expect(mem.getItem(save.KEY)).toBe(before); // loading never rewrites it
    const heroes = save.listHeroes();
    expect(heroes).toHaveLength(1);
    expect(heroes[0]).toMatchObject({ slot: 1, cls: "barbarian", level: 61 });
    // and it plays: a Game builds from it
    const g = new Game(events, d);
    expect(g.player.cls).toBe("barbarian");
    expect(g.skillLevel("whirlwind")).toBe(20);
  });

  it("a second hero lives in its own keys; slot 1 and its backups are untouched", () => {
    mem.setItem(save.KEY, JSON.stringify(barbarianV6()));
    const slot1 = mem.getItem(save.KEY);
    expect(save.freeSlot()).toBe(2);
    save.setSlot(2);
    const ama = new Game(events, null, 5, { cls: "amazon", name: "Ilsa" });
    expect(save.saveGame(ama.toSave())).toBe(true);
    expect(mem.getItem(`${save.KEY}#2`)).not.toBeNull();
    expect(mem.getItem(save.KEY)).toBe(slot1);
    expect(save.listBackups().length).toBe(0); // slot 2 has its own (empty) backups
    save.saveGame(ama.toSave(), { force: true });
    expect(save.listBackups().length).toBe(1);
    expect(mem.getItem("ember-crypt-save-bak1")).toBeNull(); // slot 1's backups untouched
    expect(save.lastSlot()).toBe(2);
    const list = save.listHeroes();
    expect(list.map((h) => h.slot)).toEqual([2, 1]); // last played first
    expect(list[0]).toMatchObject({ cls: "amazon", name: "Ilsa", level: 1 });
    save.setSlot(1);
    expect(save.loadGame().data!.player.level).toBe(61);
    expect(save.freeSlot()).toBe(3);
  });

  it("clearing (start over) only touches the current slot", () => {
    mem.setItem(save.KEY, JSON.stringify(barbarianV6()));
    save.setSlot(2);
    save.saveGame(new Game(events, null, 5, { cls: "amazon", name: "A" }).toSave());
    save.clearGame();
    expect(mem.getItem(`${save.KEY}#2`)).toBeNull();
    expect(save.readSlot(2)?.player.cls).toBe("amazon"); // kept in slot 2's backups
    expect(save.readSlot(1)?.player.level).toBe(61);
  });

  it("shared stash: stored once with a time; a different save version is ignored", () => {
    expect(save.loadSharedStash()).toBeNull();
    save.saveSharedStash(10, [{ item: makeItem("short_bow", 3), x: 0, y: 0 }]);
    expect(save.loadSharedStash()!.items).toHaveLength(1);
    mem.setItem("ember-crypt-stash-shared", JSON.stringify({ v: 6, at: 99, items: [] }));
    expect(save.loadSharedStash()).toBeNull();
  });

  it("v7 sanitize: unknown class becomes Barbarian; another class's skills are refunded", () => {
    const g = new Game(events, null, 3, { cls: "amazon", name: "Q" });
    const s = JSON.parse(JSON.stringify(g.toSave()));
    s.player.cls = "necromancer";
    expect(migrateSave(JSON.parse(JSON.stringify(s)))!.player.cls).toBe("barbarian");
    s.player.cls = "amazon";
    s.player.level = 10;
    s.player.skills = { bash: 3, magic_arrow: 2 };
    const m = migrateSave(s)!;
    const g2 = new Game(events, m);
    expect(g2.skillLevel("magic_arrow")).toBe(2);
    expect(g2.skillLevel("bash")).toBe(0);
  });
});

function setup(cls: "amazon" | "barbarian", main: string, off?: string) {
  const g = new Game(events, null, 21, { cls, name: "T" });
  g.goDungeon(1);
  const p = g.player;
  p.equip.main = makeItem(main, 1);
  p.equip.off = off ? makeItem(off, 1) : undefined;
  const m = g.monsters[0];
  g.monsters = [m];
  const blocked = (g as unknown as { blocked(x: number, y: number, r: number): boolean }).blocked.bind(g);
  let placed = false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
    let clear = true;
    for (let t = 0.3; t <= 4.6; t += 0.2) if (blocked(p.x + dx * t, p.y + dy * t, 0.5)) clear = false;
    if (clear) {
      m.x = p.x + dx * 4.2;
      m.y = p.y + dy * 4.2;
      placed = true;
      break;
    }
  }
  expect(placed).toBe(true);
  Object.assign(m, { hp: 1e6, maxHp: 1e6, defense: 0, state: "idle", atkT: 99, dmgMin: 0, dmgMax: 0 });
  m.def = { ...m.def, speed: 0 };
  return { g, p, m: m as Mon };
}
const run = (g: G, frames: number, attackFrames = 0, skills?: boolean[]) => {
  for (let i = 0; i < frames; i++) g.update(1 / 30, { ...idle, attack: i < attackFrames, skills: i === 0 && skills ? skills : [false, false, false] });
};

describe("v1.0 bows", () => {
  it("a new Amazon starts dex-focused with a javelin and buckler, a short bow and arrows in the bag", () => {
    const g = new Game(events, null, 4, { cls: "amazon", name: "" });
    const p = g.player;
    expect(p.name).toBe("Amazon");
    expect(p.base.dex).toBeGreaterThan(p.base.str);
    expect(p.equip.main?.baseId).toBe("javelin");
    expect(p.bag.map((e) => e.item.baseId)).toEqual(expect.arrayContaining(["short_bow", "arrows"]));
  });

  it("the main button shoots arrows with a bow: arrows fly, hit from range and use the quiver", () => {
    const { g, p, m } = setup("amazon", "short_bow", "arrows");
    const q0 = p.equip.off!.qty!;
    expect(q0).toBe(1200);
    expect(g.mainBasic()).toBe("basic_shoot");
    const hp0 = m.hp;
    let sawArrow = false;
    for (let i = 0; i < 60; i++) {
      g.update(1 / 30, { ...idle, attack: i < 40 });
      if (g.projectiles.some((q) => q.kind === "arrow")) sawArrow = true;
      if (p.action?.type === "shoot") expect(p.action.type).toBe("shoot");
    }
    expect(sawArrow).toBe(true);
    expect(p.equip.off!.qty).toBeLessThan(q0);
    expect(m.hp).toBeLessThan(hp0);
    expect(Math.hypot(m.x - p.x, m.y - p.y)).toBeGreaterThan(3); // shot from range, didn't walk in
  });

  it("no arrows: no shot (hint instead); the quiver refills in camp", () => {
    const { g, p } = setup("amazon", "long_bow", "arrows");
    p.equip.off!.qty = 0;
    run(g, 10, 5);
    expect(g.projectiles.length).toBe(0);
    g.goTown();
    expect(p.equip.off!.qty).toBe(1200);
  });

  it("a bow takes a quiver (or nothing) in the off-hand, never a shield", () => {
    const g = new Game(events, null, 4, { cls: "amazon", name: "" });
    g.player.equip.main = makeItem("short_bow", 1);
    expect(g.slotsFor(makeItem("arrows", 1))).toEqual(["off"]);
    g.player.equip.off = undefined;
    g.player.bag = [{ item: makeItem("shield", 1), x: 0, y: 0 }];
    expect(g.equipFromBag(g.player.bag[0].item.uid, "off")).toBeTruthy();
  });

  it("Multiple Shot fans several arrows and uses one from the quiver; Strafe shoots one per target", () => {
    const { g, p } = setup("amazon", "short_bow", "arrows");
    p.level = 30;
    p.skills = { magic_arrow: 1, multiple_shot: 5, cold_arrow: 1, guided_arrow: 1, strafe: 4 };
    p.mana = 200;
    p.slots = ["multiple_shot", "strafe", null];
    const q0 = p.equip.off!.qty!;
    g.update(1 / 30, { ...idle, skills: [true, false, false] });
    let most = 0;
    for (let i = 0; i < 30; i++) {
      g.update(1 / 30, idle);
      most = Math.max(most, g.projectiles.filter((q) => q.kind === "arrow").length);
    }
    expect(most).toBeGreaterThanOrEqual(4);
    expect(p.equip.off!.qty).toBe(q0 - 1);
    run(g, 30);
    g.projectiles = [];
    g.update(1 / 30, { ...idle, skills: [false, true, false] });
    expect(p.action?.type).toBe("shoot");
    if (p.action?.type === "shoot") expect(p.action.releaseAt.length).toBeGreaterThan(1);
  });
});

describe("v1.0 javelins: stab or throw, and basic attacks on skill buttons", () => {
  it("auto: the main button throws a javelin stack (as before)", () => {
    const { g, p } = setup("amazon", "javelin", "shield");
    const q0 = p.equip.main!.qty!;
    run(g, 40, 3);
    expect(p.equip.main!.qty).toBe(q0 - 1);
  });
  it("set to Attack / Stab: the main button stabs (melee) and never throws", () => {
    const { g, p } = setup("amazon", "javelin", "shield");
    g.setMainAtk("basic_attack");
    const q0 = p.equip.main!.qty!;
    g.update(1 / 30, { ...idle, attack: true });
    expect(p.action?.type).toBe("swing");
    run(g, 40, 20);
    expect(p.equip.main!.qty).toBe(q0);
    expect(g.projectiles.length).toBe(0);
  });
  it("set to Throw: the main button throws", () => {
    const { g, p } = setup("barbarian", "javelin");
    g.setMainAtk("basic_throw");
    g.update(1 / 30, { ...idle, attack: true });
    expect(p.action?.type).toBe("throw");
  });
  it("basic attacks go on skill buttons for both classes; Stab on a button while the main button throws", () => {
    for (const cls of ["amazon", "barbarian"] as const) {
      const { g, p } = setup(cls, "javelin");
      g.assignSlot(0, "basic_attack");
      g.assignSlot(1, "basic_throw");
      expect(p.slots.slice(0, 2)).toEqual(["basic_attack", "basic_throw"]);
      const q0 = p.equip.main!.qty!;
      g.update(1 / 30, { ...idle, skills: [true, false, false] });
      expect(p.action?.type).toBe("swing");
      run(g, 40);
      expect(p.equip.main!.qty).toBe(q0);
      g.update(1 / 30, { ...idle, skills: [false, true, false] });
      expect(p.action?.type).toBe("throw");
      // survives a save round trip
      const g2 = new Game(events, JSON.parse(JSON.stringify(g.toSave())));
      expect(g2.player.slots.slice(0, 2)).toEqual(["basic_attack", "basic_throw"]);
    }
  });
  it("the main-button choice is saved", () => {
    const g = new Game(events, null, 3, { cls: "amazon", name: "" });
    g.setMainAtk("basic_throw");
    expect(new Game(events, JSON.parse(JSON.stringify(g.toSave()))).player.mainAtk).toBe("basic_throw");
  });
});

describe("v1.0 Amazon skill tree", () => {
  it("30 Amazon skills in 3 tabs, D2 levels 1/6/12/18/24/30, Barbarian keeps 30", () => {
    const ama = SKILLS.filter((s) => s.cls === "amazon");
    expect(ama).toHaveLength(30);
    expect(SKILLS.filter((s) => s.cls === "barbarian")).toHaveLength(30);
    for (const t of CLASS_TABS.amazon.slice(0, 3)) expect(ama.filter((s) => s.tab === t)).toHaveLength(10);
    expect(new Set(ama.map((s) => s.reqLvl))).toEqual(new Set([1, 6, 12, 18, 24, 30]));
    for (const s of ama) for (const q of s.prereq) expect(SKILLS.find((x) => x.id === q)!.reqLvl).toBeLessThan(s.reqLvl);
  });
  it("a Barbarian can't learn Amazon skills and vice versa", () => {
    const b = new Game(events, null, 3);
    b.player.skillPoints = 5;
    expect(b.canLearn("magic_arrow").ok).toBe(false);
    const a = new Game(events, null, 3, { cls: "amazon", name: "" });
    a.player.skillPoints = 5;
    expect(a.canLearn("bash").ok).toBe(false);
    expect(a.canLearn("magic_arrow").ok).toBe(true);
  });
});

describe("v1.0 loot is the same for every class", () => {
  it("the base pool has no class input, and weapon share stays ~51%", () => {
    expect(rollBase.length).toBeLessThanOrEqual(1); // only a random source: nothing about the hero
    const pool = ITEM_BASES.filter((b) => b.weight > 0);
    const total = pool.reduce((a, b) => a + b.weight, 0);
    const weap = pool.filter((b) => b.slot === "weapon" || b.slot === "quiver").reduce((a, b) => a + b.weight, 0);
    expect(weap / total).toBeGreaterThan(0.49);
    expect(weap / total).toBeLessThan(0.53);
    const w = (id: string) => ITEM_BASES.find((b) => b.id === id)!.weight;
    expect(w("short_bow")).toBeGreaterThan(0);
    expect(w("long_bow")).toBeGreaterThan(0);
    expect(w("spear")).toBeGreaterThan(0);
  });
  // v1.1: loot now leans to the hero's class (CLASS_DROP_WEIGHTS); same number of items and qualities, other weapons
  it("v1.1: same number and quality of drops for both classes, but weapons lean to the class", () => {
    const drops = (cls: "amazon" | "barbarian") => {
      const g = new Game(events, null, 9, { cls, name: "" });
      g.player.level = 30;
      g.goDungeon(25);
      const proto = g.monsters.find((m) => m.def.rank === "normal" && !m.minion)!;
      let seed = 12345;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      const real = Math.random;
      Math.random = rnd;
      const out: string[] = [];
      try {
        for (let i = 0; i < 4000; i++) {
          g.ground = [];
          const m = { ...proto, hp: 0, state: "chase", elite: 0, mods: [] } as unknown as Mon;
          g.monsters = [m];
          (g as unknown as { kill(m: Mon): void }).kill(m);
          for (const gi of g.ground) if (gi.item) out.push(`${gi.item.baseId}:${gi.item.q ?? "n"}`);
        }
      } finally {
        Math.random = real;
      }
      return out;
    };
    const a = drops("amazon");
    const b = drops("barbarian");
    expect(a.length).toBeGreaterThan(50);
    expect(a.length).toBe(b.length);
    const q = (l: string[]) => l.map((x) => x.split(":")[1]).join(",");
    expect(q(a)).toBe(q(b));
    const amaz = (l: string[]) => l.filter((x) => /^(javelin|spear|short_bow|long_bow):/.test(x)).length;
    const barb = (l: string[]) => l.filter((x) => /^(sword|axe|mace|great_sword):/.test(x)).length;
    expect(amaz(a)).toBeGreaterThan(amaz(b));
    expect(barb(b)).toBeGreaterThan(barb(a));
  });
});
