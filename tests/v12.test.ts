// v1.2: respec one point at a time for gold; any learned active skill on the main ⚔ button.
import { describe, expect, it } from "vitest";
import { type Item, itemReqs, makeItem } from "../src/data/items";
import { GAME_VERSION } from "../src/data/patchNotes";
import { CLASS_DEF, Game, type GameEvents, ONCE_PER_PRESS, RESPEC_FREE, RESPEC_GOLD_PER_LEVEL, respecCost } from "../src/game";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const input = (attack: boolean) => ({ mx: 0, my: 0, mag: 0, attack, skills: [false, false, false] });

function hero(cls: "barbarian" | "amazon" = "barbarian", level = 20) {
  const g = new Game(events, null, 5, { cls, name: "" });
  g.player.level = level;
  return g;
}

describe("v1.2 respec costs", () => {
  it("50 gold × level per point", () => {
    expect(GAME_VERSION).toBe("1.7.3");
    expect(RESPEC_GOLD_PER_LEVEL).toBe(50);
    expect([1, 10, 20, 40, 60, 80].map(respecCost)).toEqual([50, 500, 1000, 2000, 3000, 4000]);
  });
});

describe("v1.2 respec a stat point", () => {
  it("refunds the point, charges carried gold, never goes below the class's starting stats", () => {
    const g = hero();
    const p = g.player;
    const min = CLASS_DEF.barbarian.stats;
    p.base.vit = min.vit + 2;
    p.gold = 2500;
    const charge = RESPEC_FREE ? 0 : respecCost(20);
    expect(g.unstat("vit")).toBe(null);
    expect([p.base.vit, p.statPoints, p.gold]).toEqual([min.vit + 1, 1, 2500 - charge]);
    expect(g.unstat("vit")).toBe(null);
    expect(g.canUnstat("vit").ok).toBe(false);
    expect(g.unstat("vit")).toMatch(/Starts at/);
    expect([p.base.vit, p.statPoints, p.gold]).toEqual([min.vit, 2, 2500 - 2 * charge]);
    // life never stays above the new maximum
    expect(p.hp).toBeLessThanOrEqual(g.derived().maxHp);
  });
  it("not enough gold: refused, nothing changes (or free, nothing charged)", () => {
    const g = hero();
    const p = g.player;
    p.base.str += 3;
    p.gold = 999;
    if (RESPEC_FREE) {
      expect(g.unstat("str")).toBe(null);
      expect(p.statPoints).toBe(1);
      expect(p.gold).toBe(999);
    } else {
      expect(g.unstat("str")).toMatch(/Needs 1,000 gold/);
      expect(p.statPoints).toBe(0);
      expect(p.gold).toBe(999);
    }
  });
  it("stash gold tops it up in camp only", () => {
    const g = hero();
    const p = g.player;
    p.base.str += 3;
    p.gold = 400;
    p.stashGold = 5000;
    g.goDungeon(2);
    if (!RESPEC_FREE) expect(g.canUnstat("str").ok).toBe(false);
    g.goTown(true);
    expect(g.unstat("str")).toBe(null);
    expect([p.gold, p.stashGold]).toEqual(RESPEC_FREE ? [400, 5000] : [0, 4400]);
  });
  it("won't drop Strength or Dexterity below what worn gear needs (no surprise red items)", () => {
    const g = hero("amazon", 30);
    const p = g.player;
    const bow: Item = makeItem("long_bow", 18);
    const need = itemReqs(bow).dex;
    p.base.dex = need;
    p.base.str = 200;
    p.equip = { main: bow, off: makeItem("arrows", 1) };
    p.gold = 1e6;
    const c = g.canUnstat("dex");
    expect(c.ok).toBe(false);
    expect(c.why).toMatch(/Long Bow needs it/);
    expect(g.usable("main")).toBe(true);
    p.base.dex = need + 1;
    expect(g.unstat("dex")).toBe(null);
    expect(g.usable("main")).toBe(true);
    // a Dexterity ring covering the gap makes it fine
    p.equip.ring1 = { ...makeItem("ring", 1), q: "magic", mods: [{ s: "dex", v: 10 }] };
    expect(g.unstat("dex")).toBe(null);
    expect(g.usable("main")).toBe(true);
  });
});

describe("v1.2 respec a skill point", () => {
  it("refunds one point; can't remove the last point of a skill a learned skill needs", () => {
    const g = hero();
    const p = g.player;
    p.gold = 1e6;
    p.skills = { bash: 3, double_swing: 1 };
    p.slots = ["bash", "double_swing", null];
    expect(g.unlearn("bash")).toBe(null);
    expect(g.unlearn("bash")).toBe(null);
    expect(p.skills.bash).toBe(1);
    expect(g.canUnlearn("bash").why).toMatch(/Double Swing needs it/);
    expect(g.unlearn("double_swing")).toBe(null);
    expect(p.skills.double_swing).toBeUndefined();
    expect(p.slots).toEqual(["bash", null, null]);
    expect(g.unlearn("bash")).toBe(null);
    expect(p.skills.bash).toBeUndefined();
    expect(p.slots).toEqual([null, null, null]);
    expect(p.skillPoints).toBe(1 + 4); // a new hero starts with 1
    expect(p.gold).toBe(1e6 - (RESPEC_FREE ? 0 : 4 * 1000));
    expect(g.canUnlearn("bash").ok).toBe(false);
  });
  it("a fully removed skill comes off ⚔ (back to Auto)", () => {
    const g = hero();
    const p = g.player;
    p.gold = 5000;
    p.skills = { bash: 1 };
    g.setMainAtk("bash");
    expect(p.mainAtk).toBe("bash");
    g.unlearn("bash");
    expect(p.mainAtk).toBe(null);
  });
});

describe("v1.2 any skill on ⚔", () => {
  it("only learned active skills of your class (or basic attacks / Auto)", () => {
    const g = hero();
    const p = g.player;
    g.setMainAtk("bash");
    expect(p.mainAtk).toBe(null); // not learned
    p.skills = { bash: 1, sword_mastery: 2 };
    g.setMainAtk("sword_mastery");
    expect(p.mainAtk).toBe(null); // passive
    g.setMainAtk("jab");
    expect(p.mainAtk).toBe(null); // Amazon skill
    g.setMainAtk("bash");
    expect(p.mainAtk).toBe("bash");
    g.setMainAtk("basic_throw");
    expect(p.mainAtk).toBe("basic_throw");
    g.setMainAtk(null);
    expect(p.mainAtk).toBe(null);
  });
  it("saves and loads; a bad id in a save goes back to Auto", () => {
    const g = hero();
    g.player.skills = { bash: 1 };
    g.setMainAtk("bash");
    const s = JSON.parse(JSON.stringify(g.toSave()));
    expect(new Game(events, s).player.mainAtk).toBe("bash");
    s.player.mainAtk = "jab";
    expect(new Game(events, s).player.mainAtk).toBe(null);
    s.player.mainAtk = "nonsense";
    expect(new Game(events, s).player.mainAtk).toBe(null);
  });
  const arena = (g: Game) => {
    g.goTown(true);
    (g as unknown as { floorCache: Map<number, unknown> }).floorCache.clear();
    g.goDungeon(3);
    const p = g.player;
    const m = g.monsters.find((q) => q.def.rank === "normal")!;
    g.monsters = [m];
    m.x = p.x + 0.9;
    m.y = p.y;
    m.hp = m.maxHp = 1e6;
    m.def = { ...m.def, speed: 0, dmgMin: 0, dmgMax: 0 } as typeof m.def;
    m.dmgMin = m.dmgMax = 0;
    return m;
  };
  it("an attack skill on ⚔ is used while held (mana spent); out of mana it swings normally", () => {
    const g = hero();
    const p = g.player;
    p.skills = { bash: 5 };
    g.setMainAtk("bash");
    arena(g);
    p.mana = 50;
    const used: (string | null)[] = [];
    for (let t = 0; t < 60; t++) {
      g.update(1 / 30, input(true));
      const a = p.action as { type: string; skill?: string | null } | null;
      if (a && t % 3 === 0) used.push(a.skill ?? null);
    }
    expect(used).toContain("bash");
    expect(p.mana).toBeLessThan(50);
    p.mana = 0;
    p.action = null;
    g.update(1 / 30, input(true));
    const a = p.action as { type: string; skill?: string | null } | null;
    expect(a?.type).toBe("swing");
    expect(a?.skill ?? null).toBe(null);
  });
  it("a warcry on ⚔ fires once per press; holding then keeps attacking; no mana → a normal attack", () => {
    const g = hero();
    const p = g.player;
    p.skills = { howl: 1, shout: 1 };
    g.setMainAtk("shout");
    expect(ONCE_PER_PRESS.has("shout")).toBe(true);
    arena(g);
    p.mana = 100;
    let casts = 0;
    const orig = g.castSkill.bind(g);
    g.castSkill = (id, d) => {
      const ok = orig(id, d);
      if (ok && id === "shout") casts++;
      return ok;
    };
    for (let t = 0; t < 90; t++) g.update(1 / 30, input(true));
    expect(casts).toBe(1);
    expect(p.buffs.shout).toBeGreaterThan(0);
    expect((p.action as { type: string } | null)?.type).toBe("swing");
    // release and press again: casts again
    g.update(1 / 30, input(false));
    p.action = null;
    for (let t = 0; t < 20; t++) g.update(1 / 30, input(true));
    expect(casts).toBe(2);
    // out of mana: ⚔ still attacks
    g.update(1 / 30, input(false));
    p.action = null;
    p.mana = 0;
    g.update(1 / 30, input(true));
    expect((p.action as { type: string } | null)?.type).toBe("swing");
  });
  it("a skill that is no longer learned falls back to Auto", () => {
    const g = hero();
    const p = g.player;
    p.skills = { bash: 1 };
    g.setMainAtk("bash");
    expect(p.mainAtk).toBe("bash");
    arena(g);
    p.skills = {};
    g.update(1 / 30, input(true));
    expect(p.mainAtk).toBe(null);
    expect((p.action as { type: string } | null)?.type).toBe("swing");
  });
});
