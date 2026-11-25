import { afterEach, describe, expect, it, vi } from "vitest";
import { makeItem } from "../src/data/items";
import { Game, type FrameInput, type GameEvents } from "../src/game";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle: FrameInput = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false, false] };

function setup(weapon: string) {
  const g = new Game(events, null, 31);
  g.goDungeon(1);
  const p = g.player;
  p.level = 20;
  p.base.str = 120;
  p.base.dex = 80;
  p.equip.main = makeItem(weapon, 10);
  p.equip.off = undefined;
  p.skills = { bash: 1, double_swing: 3, frenzy: 3 };
  p.mana = 999;
  const m = g.monsters.find((x) => x.def.rank === "normal")!;
  g.monsters = [m];
  Object.assign(m, { x: p.x + 0.9, y: p.y, hp: 1e6, maxHp: 1e6, defense: 0, state: "idle", atkT: 99, dmgMin: 0, dmgMax: 0 });
  m.def = { ...m.def, speed: 0 };
  p.fx = 1;
  p.fy = 0;
  return { g, p, m };
}

afterEach(() => vi.restoreAllMocks());

describe("v0.9.1: Frenzy and Double Swing still work with a two-handed weapon (James likes this)", () => {
  for (const weapon of ["great_sword", "quarterstaff"]) {
    for (const skill of ["double_swing", "frenzy"]) {
      it(`${skill} with a ${weapon}: casts, swings twice with the same weapon and hits`, () => {
        const { g, p, m } = setup(weapon);
        vi.spyOn(Math, "random").mockReturnValue(0.02); // every swing connects (no miss rolls)
        expect(p.equip.main && p.equip.off).toBeFalsy();
        p.slots = [skill, null, null, null];
        g.update(1 / 30, { ...idle, skills: [true, false, false, false] });
        const a = p.action;
        expect(a?.type).toBe("swing");
        if (a?.type === "swing") expect(a.hands).toEqual([0, 0]); // two hits, both from the two-hander
        const hp0 = m.hp;
        let hits = 0;
        let last = m.hp;
        for (let i = 0; i < 60; i++) {
          g.update(1 / 30, idle);
          if (m.hp < last) hits++;
          last = m.hp;
        }
        expect(m.hp).toBeLessThan(hp0);
        expect(hits).toBeGreaterThanOrEqual(2);
        if (skill === "frenzy") expect(p.frenzy.stacks).toBeGreaterThan(0);
      });
    }
  }
});
