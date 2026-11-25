import { beforeEach, describe, expect, it } from "vitest";
import { Game, type GameEvents, SAVE_VERSION } from "../src/game";

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
const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const KEY = save.KEY;

// ---- fixtures: what each released version actually wrote
const V01 = {
  v: 1, seed: 1234, floor: 3,
  player: {
    level: 7, xp: 2500, base: { str: 40, dex: 25, vit: 30, ene: 10 }, statPoints: 0, skillPoints: 1, skills: { bash: 2 }, slots: ["bash", null, null],
    inventory: [{ uid: 100, baseId: "war_axe" }, { uid: 101, baseId: "cap", def: 3 }, null, { uid: 102, baseId: "hp_potion" }, ...Array(16).fill(null)],
    equip: { weapon: { uid: 1, baseId: "scimitar" }, shield: { uid: 2, baseId: "small_shield", def: 9 }, armor: { uid: 3, baseId: "leather_armor", def: 15 } },
    gold: 100, hpPots: 3, mpPots: 2, kills: 40,
  },
};
const V02 = {
  v: 2, seed: 99, floor: 2, maxFloor: 4,
  player: {
    level: 11, xp: 9000, base: { str: 55, dex: 30, vit: 40, ene: 10 }, statPoints: 2, skillPoints: 0, skills: { bash: 3, double_swing: 1, frenzy: 1 },
    slots: ["bash", "frenzy", null], gold: 777, hpPots: 2, mpPots: 1, kills: 210,
    equip: { main: { uid: 1, baseId: "war_axe" }, off: { uid: 2, baseId: "scimitar" }, chest: { uid: 3, baseId: "chain_mail", def: 30 }, belt: { uid: 4, baseId: "belt" }, ring1: { uid: 5, baseId: "gold_ring" } },
    bag: [{ item: { uid: 6, baseId: "long_sword" }, x: 0, y: 0 }, { item: { uid: 7, baseId: "hp_potion" }, x: 1, y: 0 }],
  },
};
const V03 = {
  v: 3, seed: 5, floor: 5, maxFloor: 6,
  player: {
    level: 18, xp: 60000, base: { str: 80, dex: 40, vit: 60, ene: 15 }, statPoints: 0, skillPoints: 3, skills: { bash: 5, double_swing: 4, frenzy: 3 },
    slots: ["bash", "double_swing", "frenzy"], gold: 4321, hpPots: 4, mpPots: 4, kills: 900,
    equip: {
      main: { uid: 1, baseId: "axe", ilvl: 14, q: "rare", name: "Doom Bite", mods: [{ s: "edmg", v: 40 }, { s: "ll", v: 5 }, { s: "str", v: 8 }], aff: ["p:edmg", "s:ll", "s:str"] },
      chest: { uid: 2, baseId: "armor", ilvl: 12, q: "magic", name: "Sturdy Armor", mods: [{ s: "edef", v: 15 }], aff: ["p:edef"] },
    },
    bag: [{ item: { uid: 3, baseId: "sword", ilvl: 9 }, x: 0, y: 0 }, { item: { uid: 4, baseId: "nonexistent_thing", ilvl: 2 }, x: 3, y: 0 }],
  },
};

beforeEach(() => {
  mem.clear();
  save.loadGame(); // resets the "newer save on device" lock between tests
});

describe("migrations from every released version", () => {
  for (const [name, fx] of [["v0.1", V01], ["v0.2", V02], ["v0.3", V03]] as const) {
    it(`${name} save loads and plays`, () => {
      mem.setItem(KEY, JSON.stringify(fx));
      const r = save.loadGame();
      expect(r.source).toBe("main");
      expect(r.data).toBeTruthy();
      const d = r.data!;
      expect(d.v).toBe(SAVE_VERSION);
      expect(d.player.level).toBe(fx.player.level);
      expect(d.player.gold).toBeGreaterThanOrEqual(fx.player.gold);
      const g = new Game(events, d);
      expect(g.derived().maxHp).toBeGreaterThan(0);
      expect(g.player.equip.main).toBeTruthy();
      for (const e of g.player.bag) expect(e.item.baseId).not.toBe("nonexistent_thing");
      // and it round-trips through a save
      expect(save.saveGame(g.toSave())).toBe(true);
      expect(save.loadGame().data!.player.level).toBe(fx.player.level);
    });
  }
  it("keeps v0.3 affixes", () => {
    mem.setItem(KEY, JSON.stringify(V03));
    const d = save.loadGame().data!;
    expect(d.player.equip.main!.q).toBe("rare");
    expect(d.player.equip.main!.mods!.length).toBe(3);
  });
});

describe("damage and recovery", () => {
  const good = () => new Game(events, null, 11).toSave();

  it("writes main, rotates backups, clears the temp key", () => {
    const g = new Game(events, null, 1);
    g.player.gold = 7;
    save.saveGame(g.toSave());
    g.player.gold = 50;
    save.saveGame(g.toSave(), { backup: true }); // first backup: the gold-7 state
    g.player.gold = 99;
    save.saveGame(g.toSave(), { backup: true }); // <30 s later: no near-duplicate backup
    expect(mem.getItem("ember-crypt-save-tmp")).toBeNull();
    expect(JSON.parse(mem.getItem(KEY)!).player.gold).toBe(99);
    expect(JSON.parse(mem.getItem("ember-crypt-save-bak1")!).player.gold).toBe(7);
    expect(save.listBackups().length).toBe(1);
    // an older backup does rotate
    const b1 = JSON.parse(mem.getItem("ember-crypt-save-bak1")!);
    b1.savedAt -= 10 * 60 * 1000;
    mem.setItem("ember-crypt-save-bak1", JSON.stringify(b1));
    save.saveGame(g.toSave());
    expect(save.listBackups().length).toBe(2);
    expect(save.lastSavedAt()).toBeGreaterThan(0);
  });

  it("falls back to the newest backup when the main save is damaged, and keeps the damaged copy", () => {
    const g = new Game(events, null, 2);
    g.player.level = 9;
    save.saveGame(g.toSave());
    g.player.level = 10;
    save.saveGame(g.toSave(), { backup: true });
    mem.setItem(KEY, '{"v":3,"seed":1,"player":{"level":'); // cut off mid-write
    const r = save.loadGame();
    expect(r.recovered).toBe(true);
    expect(r.source).toBe("bak1");
    expect(r.data!.player.level).toBe(9);
    expect(mem.getItem("ember-crypt-save-damaged")).toContain('"seed":1');
  });

  it("uses the temp copy if the swap was interrupted", () => {
    mem.setItem("ember-crypt-save-tmp", JSON.stringify(good()));
    mem.setItem(KEY, "garbage{{");
    const r = save.loadGame();
    expect(r.source).toBe("tmp");
    expect(r.data).toBeTruthy();
  });

  it("rejects structurally broken saves instead of crashing", () => {
    mem.setItem(KEY, JSON.stringify({ v: 3, seed: 1, floor: 1, maxFloor: 1, player: { level: "x" } }));
    expect(save.loadGame().data).toBeNull();
  });

  it("never overwrites a save from a newer version", () => {
    const future = JSON.stringify({ ...good(), v: SAVE_VERSION + 1 });
    mem.setItem(KEY, future);
    const r = save.loadGame();
    expect(r.newer).toBe(true);
    expect(save.saveGame(good())).toBe(false);
    expect(mem.getItem(KEY)).toBe(future);
  });
});

describe("export / import", () => {
  it("round-trips a save code and accepts raw JSON files", () => {
    const g = new Game(events, null, 3);
    g.player.gold = 1234;
    const code = save.exportCode(g.toSave());
    expect(code.startsWith("EMBERCRYPT1:")).toBe(true);
    expect(save.importCode(code)!.player.gold).toBe(1234);
    expect(save.importCode(`  ${code.slice(0, 40)}\\n${code.slice(40)}  `.replace("\\n", "\n"))!.player.gold).toBe(1234);
    expect(save.importCode(JSON.stringify(V02))!.player.level).toBe(11);
    expect(save.importCode("hello")).toBeNull();
    expect(save.importCode("EMBERCRYPT1:!!!")).toBeNull();
  });

  it("a v0.3 save exports cleanly and imports on another device", () => {
    mem.setItem(KEY, JSON.stringify(V03));
    const d = save.loadGame().data!;
    const code = save.exportCode(d);
    mem.clear(); // the Home Screen app has its own, empty storage
    const back = save.importCode(code)!;
    expect(back.player.level).toBe(18);
    expect(back.player.equip.main!.name).toBe("Doom Bite");
    expect(back.player.gold).toBe(4321);
    expect(save.saveGame(back)).toBe(true);
    expect(save.loadGame().data!.player.level).toBe(18);
  });

  it("starting a new character keeps the old hero in the backups", () => {
    const g = new Game(events, null, 4);
    g.player.level = 15;
    save.saveGame(g.toSave());
    save.clearGame();
    expect(mem.getItem(KEY)).toBeNull();
    expect(save.listBackups()[0].level).toBe(15);
  });
});

describe("auto potions", () => {
  it("auto health drinks once at 10% life, with a cooldown", () => {
    const g = new Game(events, null, 8);
    g.goDungeon(1);
    g.monsters = [];
    const max = g.derived().maxHp;
    g.player.hpPots = 3;
    g.player.hp = max * 0.09;
    const inp = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };
    g.update(0.05, inp);
    expect(g.player.hpPots).toBe(2);
    g.player.healLeft = 0;
    g.player.hp = max * 0.05;
    g.update(0.05, inp);
    expect(g.player.hpPots).toBe(2); // cooldown
    g.auto.hp = false;
    g.update(3, inp);
    expect(g.player.hpPots).toBe(2);
  });

  it("auto mana: second separate press within 1.5 s drinks a mana potion", () => {
    const g = new Game(events, null, 9);
    g.goDungeon(1);
    g.monsters = [];
    g.player.skills.howl = 1;
    g.player.slots = ["howl", null, null];
    g.player.mana = 0;
    g.player.mpPots = 2;
    const up = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };
    const down = { ...up, skills: [true, false, false] };
    g.update(0.02, down); // first press: "not enough mana"
    g.player.mana = 0;
    g.update(0.6, down); // still holding: no drink
    expect(g.player.mpPots).toBe(2);
    g.update(0.02, up);
    g.player.mana = 0;
    g.update(0.3, down); // second press
    expect(g.player.mpPots).toBe(1);
  });
});
