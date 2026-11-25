import { describe, expect, it } from "vitest";
import { SKILLS, SKILL_SLOTS } from "../src/data/skills";
import { makeItem } from "../src/data/items";
import { Game, type FrameInput, type GameEvents, type Monster, migrateSave } from "../src/game";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle: FrameInput = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };
const kill = (g: Game, m: Monster) => (g as unknown as { kill(m: Monster): void }).kill(m);

/** A level 30 Barbarian in the crypt with `n` sturdy, harmless monsters right next to him. */
function setup(skills: Record<string, number>, n = 3) {
  const g = new Game(events, null, 31);
  g.goDungeon(1);
  const p = g.player;
  p.level = 30;
  p.base.str = 120;
  p.base.dex = 80;
  p.equip.main = makeItem("sword", 10);
  p.equip.off = makeItem("sword", 10);
  p.skills = { ...skills };
  p.mana = 999;
  const ms = g.monsters.filter((m) => m.def.rank === "normal").slice(0, n);
  g.monsters = ms;
  ms.forEach((m, i) => {
    const a = (i / n) * Math.PI * 2;
    Object.assign(m, { x: p.x + Math.cos(a) * 0.9, y: p.y + Math.sin(a) * 0.9, hp: 1e6, maxHp: 1e6, defense: 50, ar: 50, state: "idle", atkT: 99, dmgMin: 1, dmgMax: 2 });
    m.def = { ...m.def, speed: 0 };
  });
  return { g, p, ms };
}
function cast(g: Game, id: string, frames = 45) {
  g.player.slots = [id, null, null];
  g.update(1 / 30, { ...idle, skills: [true, false, false] });
  for (let i = 0; i < frames; i++) g.update(1 / 30, idle);
}

describe("v0.9: every Barbarian skill is playable", () => {
  it("no skill is 'coming soon' any more, and there are 3 skill buttons (v0.9.2)", () => {
    expect(SKILLS.filter((s) => !s.implemented).map((s) => s.id)).toEqual([]);
    expect(SKILL_SLOTS).toBe(3);
    for (const s of SKILLS) {
      expect(s.blurb.length).toBeGreaterThan(10);
      if (s.effect) expect(s.effect(1).length).toBeGreaterThan(3);
    }
  });

  it("every active skill casts without errors on a fresh hero", () => {
    for (const s of SKILLS.filter((s) => s.kind === "active")) {
      const prereq: Record<string, number> = {};
      const add = (id: string) => {
        prereq[id] = 1;
        for (const q of SKILLS.find((x) => x.id === id)!.prereq) add(q);
      };
      add(s.id);
      const { g } = setup(prereq);
      // a corpse for the corpse skills
      const extra = g.monsters[2];
      kill(g, extra);
      for (let i = 0; i < 30; i++) g.update(1 / 30, idle);
      expect(() => cast(g, s.id)).not.toThrow();
    }
  });

  it("Whirlwind spins for about a second and hits every monster around", () => {
    const { g, p, ms } = setup({ bash: 1, leap: 1, double_swing: 1, stun: 1, leap_attack: 1, concentrate: 1, double_throw: 1, frenzy: 1, whirlwind: 5 }, 4);
    p.slots = ["whirlwind", null, null];
    g.update(1 / 30, { ...idle, skills: [true, false, false] });
    expect(p.action?.type).toBe("whirl");
    let spun = 0;
    for (let i = 0; i < 60; i++) {
      if (p.action?.type === "whirl") spun++;
      g.update(1 / 30, idle);
    }
    expect(spun).toBeGreaterThan(20);
    expect(spun).toBeLessThan(40);
    expect(ms.filter((m) => m.hp < m.maxHp).length).toBeGreaterThanOrEqual(3);
  });

  it("War Cry damages and stuns; synergies raise its damage", () => {
    const base = { howl: 1, find_potion: 1, taunt: 1, shout: 1, battle_cry: 1, battle_orders: 1, war_cry: 1 };
    const a = setup(base, 3);
    cast(a.g, "war_cry", 1);
    expect(a.ms.some((m) => m.stunT > 0)).toBe(true);
    const lossA = a.ms.reduce((s, m) => s + (m.maxHp - m.hp), 0);
    expect(lossA).toBeGreaterThan(0);
    const b = setup({ ...base, howl: 10, taunt: 10, battle_cry: 10, battle_orders: 10 }, 3);
    cast(b.g, "war_cry", 1);
    const lossB = b.ms.reduce((s, m) => s + (m.maxHp - m.hp), 0);
    expect(lossB).toBeGreaterThan(lossA * 1.5);
  });

  it("Taunt and Battle Cry weaken monsters; Howl makes them flee", () => {
    const { g, ms } = setup({ howl: 1, taunt: 3, shout: 1, battle_cry: 3 }, 3);
    cast(g, "taunt", 15);
    expect(ms.some((m) => m.taunt.t > 0)).toBe(true);
    cast(g, "battle_cry", 15);
    expect(ms.every((m) => m.bcry.t > 0 && m.bcry.def > 0)).toBe(true);
    cast(g, "howl", 5);
    expect(ms.every((m) => m.fearT > 0)).toBe(true);
  });

  it("Find Item searches a corpse once; Grim Ward turns a corpse into a totem that scares monsters", () => {
    const { g, p, ms } = setup({ howl: 1, find_potion: 1, find_item: 20, shout: 1, battle_cry: 1, grim_ward: 5 }, 3);
    kill(g, ms[0]);
    kill(g, ms[1]);
    for (let i = 0; i < 30; i++) g.update(1 / 30, idle);
    const before = g.ground.length;
    let found = false;
    for (let k = 0; k < 1 && !found; k++) {
      cast(g, "find_item", 20);
      found = g.ground.length > before || ms[0].searched || ms[1].searched;
    }
    expect(ms.filter((m) => m.searched).length).toBe(1);
    cast(g, "grim_ward", 20);
    expect(g.wards.length).toBe(1);
    expect(ms.filter((m) => m.hidden).length).toBe(1);
    // the live monster next to the ward runs from it
    const live = ms[2];
    live.x = g.wards[0].x + 0.5;
    live.y = g.wards[0].y;
    live.def = { ...live.def, speed: 2 };
    for (let i = 0; i < 20; i++) g.update(1 / 30, idle);
    expect(live.flee).not.toBeNull();
    expect(p.dead).toBeFalsy();
  });

  it("Concentrate raises defense while swinging; Berserk drops it to zero", () => {
    const { g, p } = setup({ bash: 1, leap: 1, double_swing: 1, stun: 1, concentrate: 5, leap_attack: 1, double_throw: 1, frenzy: 1, whirlwind: 1, berserk: 1 }, 1);
    const def0 = g.derived().def;
    p.slots = ["concentrate", null, null];
    g.update(1 / 30, { ...idle, skills: [true, false, false] });
    expect(p.buffs.conc).toBeGreaterThan(0);
    expect(g.derived().def).toBeGreaterThan(def0);
    for (let i = 0; i < 40; i++) g.update(1 / 30, idle);
    p.slots = ["berserk", null, null];
    g.update(1 / 30, { ...idle, skills: [true, false, false] });
    expect(p.buffs.bers).toBeGreaterThan(0);
    expect(g.derived().def).toBe(0);
  });

  it("Battle Command adds to skills you've put points in", () => {
    const { g } = setup({ howl: 1, find_potion: 1, taunt: 1, shout: 1, battle_cry: 1, battle_orders: 1, war_cry: 1, find_item: 1, grim_ward: 1, battle_command: 1 }, 1);
    const before = g.skillLevel("war_cry");
    cast(g, "battle_command", 15);
    expect(g.skillLevel("war_cry")).toBe(before + 1);
    expect(g.skillLevel("whirlwind")).toBe(0); // unlearned skills stay unlearned
  });

  it("passives: Natural Resistance and Increased Stamina", () => {
    const a = setup({}, 1);
    const r0 = a.g.derived().res.fire;
    const hp0 = a.g.derived().maxHp;
    a.p.skills = { natural_resistance: 5, increased_stamina: 5, iron_skin: 1 };
    expect(a.g.derived().res.fire).toBeGreaterThan(r0);
    expect(a.g.derived().maxHp).toBeGreaterThan(hp0);
  });

  it("hard points stay capped at 1 + (level − skill level)", () => {
    const g = new Game(events, null, 5);
    const p = g.player;
    p.level = 30;
    p.skillPoints = 50;
    for (const id of ["bash", "leap", "double_swing", "stun", "leap_attack", "concentrate", "double_throw", "frenzy"]) g.learn(id);
    let n = 0;
    while (g.learn("whirlwind")) n++;
    expect(n).toBe(1); // whirlwind (level 30) caps at 1 for a level 30 hero
    p.level = 36;
    while (g.learn("whirlwind")) n++;
    expect(n).toBe(7);
  });

  it("3-button saves load unchanged; a v0.9 4-button save drops the 4th skill but keeps it learned", () => {
    const g = new Game(events, null, 2);
    const s = g.toSave();
    s.player.slots = ["bash", "frenzy", null] as (string | null)[];
    s.player.skills = { bash: 3, double_swing: 1, frenzy: 2 } as Record<string, number>;
    s.player.level = 12;
    const g2 = new Game(events, migrateSave(JSON.parse(JSON.stringify(s)))!);
    expect(g2.player.slots).toEqual(["bash", "frenzy", null]);
    expect(g2.player.skills.frenzy).toBe(2);
    const s4 = g.toSave();
    s4.player.level = 30;
    s4.player.skills = { bash: 3, double_swing: 1, frenzy: 2, howl: 1, shout: 1, battle_orders: 2 } as Record<string, number>;
    s4.player.slots = ["bash", "frenzy", "shout", "battle_orders"] as (string | null)[];
    const g3 = new Game(events, migrateSave(JSON.parse(JSON.stringify(s4)))!);
    expect(g3.player.slots).toEqual(["bash", "frenzy", "shout"]);
    expect(g3.player.skills.battle_orders).toBe(2);
    expect(g3.toSave().player.slots.length).toBe(3);
  });
});
