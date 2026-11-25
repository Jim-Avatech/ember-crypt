import { describe, expect, it } from "vitest";
import { BASE_BY_ID, makeItem } from "../src/data/items";
import { SKILL_BY_ID, SKILLS } from "../src/data/skills";
import { Game, type GameEvents, type FrameInput, SAVE_VERSION, migrateSave, refundSkills } from "../src/game";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle: FrameInput = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };

describe("skill tree matches Diablo II LoD 1.10+", () => {
  // [id, required level, prerequisites, row, col]
  const D2: [string, number, string[], number, number][] = [
    ["bash", 1, [], 0, 0], ["leap", 6, [], 1, 1], ["double_swing", 6, ["bash"], 1, 2], ["stun", 12, ["bash"], 2, 0],
    ["double_throw", 12, ["double_swing"], 2, 2], ["leap_attack", 18, ["leap"], 3, 1], ["concentrate", 18, ["stun"], 3, 0],
    ["frenzy", 24, ["double_throw"], 4, 2], ["whirlwind", 30, ["leap_attack", "concentrate"], 5, 1], ["berserk", 30, ["concentrate"], 5, 0],
    ["sword_mastery", 1, [], 0, 0], ["axe_mastery", 1, [], 0, 1], ["mace_mastery", 1, [], 0, 2],
    ["polearm_mastery", 1, [], 1, 0], ["throwing_mastery", 1, [], 1, 1], ["spear_mastery", 1, [], 1, 2],
    ["increased_stamina", 12, [], 2, 0], ["iron_skin", 18, [], 3, 2], ["increased_speed", 24, ["increased_stamina"], 4, 0],
    ["natural_resistance", 30, ["iron_skin"], 5, 2],
    ["howl", 1, [], 0, 0], ["find_potion", 1, [], 0, 2], ["taunt", 6, ["howl"], 1, 0], ["shout", 6, ["howl"], 1, 1],
    ["find_item", 12, ["find_potion"], 2, 2], ["battle_cry", 18, ["taunt"], 3, 0], ["battle_orders", 24, ["shout"], 4, 1],
    ["grim_ward", 24, ["find_item"], 4, 2], ["war_cry", 30, ["battle_cry", "battle_orders"], 5, 0], ["battle_command", 30, ["battle_orders"], 5, 1],
  ];
  it("has all 30 Barbarian skills with D2 levels, prerequisites and placement", () => {
    expect(SKILLS.length).toBe(30);
    for (const [id, lvl, pre, row, col] of D2) {
      const s = SKILL_BY_ID[id];
      expect(s, id).toBeTruthy();
      expect([id, s.reqLvl, [...(s.prereq ?? [])].sort(), s.row, s.col]).toEqual([id, lvl, [...pre].sort(), row, col]);
    }
  });
  it("all six weapon masteries work from level 1", () => {
    for (const id of ["sword_mastery", "axe_mastery", "mace_mastery", "polearm_mastery", "throwing_mastery", "spear_mastery"]) {
      expect(SKILL_BY_ID[id].implemented).toBe(true);
      expect(SKILL_BY_ID[id].reqLvl).toBe(1);
    }
  });
});

describe("v4 migration refunds skills that no longer qualify", () => {
  const v3 = (level: number, skills: Record<string, number>, slots: (string | null)[]) => ({
    v: 3, seed: 1, floor: 2, maxFloor: 2,
    player: { level, xp: 0, base: { str: 30, dex: 20, vit: 25, ene: 10 }, statPoints: 0, skillPoints: 1, skills, slots, bag: [], equip: {}, gold: 0, hpPots: 0, mpPots: 0, kills: 0 },
  });
  it("Frenzy before level 24 is refunded and cleared from the hotbar", () => {
    const d = migrateSave(v3(18, { bash: 5, double_swing: 4, frenzy: 3 }, ["bash", "frenzy", null]))!;
    expect(d.v).toBe(SAVE_VERSION);
    expect(d.player.skills).toEqual({ bash: 5, double_swing: 4 });
    expect(d.player.skillPoints).toBe(4);
    expect(d.player.slots).toEqual(["bash", null, null]);
    expect(d.refundedSkills).toEqual(["Frenzy"]);
  });
  it("Frenzy at 24+ without Double Throw is refunded; with it, kept", () => {
    expect(migrateSave(v3(25, { bash: 1, double_swing: 1, frenzy: 5 }, []))!.player.skills.frenzy).toBeUndefined();
    const ok = migrateSave(v3(25, { bash: 1, double_swing: 1, double_throw: 1, frenzy: 5 }, []))!;
    expect(ok.player.skills.frenzy).toBe(5);
    expect(ok.refundedPoints).toBeUndefined();
  });
  it("cascades and keeps legal builds untouched", () => {
    const p = { level: 30, skills: { bash: 1, double_swing: 0, double_throw: 2, frenzy: 3, sword_mastery: 9 } as Record<string, number>, slots: ["frenzy"], skillPoints: 0 };
    const r = refundSkills(p);
    expect(r.points).toBe(5);
    expect(p.skills).toEqual({ bash: 1, double_swing: 0, sword_mastery: 9 });
    expect(p.slots).toEqual([null]);
  });
});

describe("throwing weapons and quarterstaff", () => {
  it("new classes have stacks, hands and sizes", () => {
    expect(makeItem("throwing_knife", 1).qty).toBe(40);
    expect(makeItem("throwing_axe", 1).qty).toBe(30);
    expect(makeItem("javelin", 1).qty).toBe(25);
    expect(BASE_BY_ID.quarterstaff.hands).toBe(2);
    expect(BASE_BY_ID.quarterstaff.speed!).toBeLessThan(BASE_BY_ID.sword.speed!);
    const g = new Game(events, null, 1);
    expect(g.slotsFor(makeItem("javelin", 1))).toEqual(["main", "off"]);
    expect(g.slotsFor(makeItem("quarterstaff", 1))).toEqual(["main"]);
  });

  function setup(withDouble = false) {
    const g = new Game(events, null, 21);
    g.goDungeon(1);
    const p = g.player;
    p.equip.main = makeItem("throwing_knife", 1);
    if (withDouble) {
      p.equip.off = makeItem("throwing_axe", 1);
      p.level = 12;
      p.skills = { bash: 1, double_swing: 1, double_throw: 1 };
      p.slots = ["double_throw", null, null];
      p.mana = 50;
    }
    const m = g.monsters[0];
    g.monsters = [m];
    const blocked = (g as unknown as { blocked(x: number, y: number, r: number): boolean }).blocked.bind(g);
    let placed = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      let clear = true;
      for (let t = 0.3; t <= 3.6; t += 0.2) if (blocked(p.x + dx * t, p.y + dy * t, 0.5)) clear = false;
      if (clear) {
        m.x = p.x + dx * 3.2;
        m.y = p.y + dy * 3.2;
        placed = true;
        break;
      }
    }
    expect(placed).toBe(true);
    Object.assign(m, { hp: 1e6, maxHp: 1e6, defense: 0, state: "idle", atkT: 99, dmgMin: 0, dmgMax: 0 });
    m.def = { ...m.def, speed: 0 };
    return { g, p, m };
  }

  it("the attack button throws from range, uses ammo and hits", () => {
    const { g, p, m } = setup();
    const hp0 = m.hp;
    for (let i = 0; i < 60; i++) g.update(1 / 30, { ...idle, attack: i < 40 });
    expect(p.equip.main!.qty).toBeLessThan(40);
    expect(m.hp).toBeLessThan(hp0);
    expect(Math.hypot(m.x - p.x, m.y - p.y)).toBeGreaterThan(1.5); // didn't walk into melee
  });

  it("Double Throw throws one weapon from each hand", () => {
    const { g, p } = setup(true);
    g.update(1 / 30, { ...idle, skills: [true, false, false] });
    for (let i = 0; i < 40; i++) g.update(1 / 30, idle);
    expect(p.equip.main!.qty).toBe(39);
    expect(p.equip.off!.qty).toBe(29);
  });

  it("empty stacks fall back to melee and refill in camp", () => {
    const { g, p } = setup();
    p.equip.main!.qty = 0;
    g.update(1 / 30, { ...idle, attack: true });
    expect(p.action?.type).toBe("swing");
    g.goTown();
    expect(p.equip.main!.qty).toBe(40);
  });

  it("thrown weapons use Throwing Mastery; staff uses Pole Arm; javelin melee uses Spear", () => {
    const g = new Game(events, null, 2);
    const p = g.player;
    p.skills = { throwing_mastery: 10, polearm_mastery: 5, spear_mastery: 3 };
    p.equip.main = makeItem("javelin", 5);
    const melee = g.handFor("main");
    const thrown = g.handFor("main", true);
    expect(thrown.crit).toBeGreaterThan(melee.crit);
    p.equip.main = makeItem("quarterstaff", 5);
    const staff = g.handFor("main");
    p.skills = {};
    expect(staff.crit).toBeGreaterThan(g.handFor("main").crit);
  });
});
