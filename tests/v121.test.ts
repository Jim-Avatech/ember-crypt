// v1.2.1: Multiple Shot's whole volley = (125% + 5% per level after 1) of a normal hit, split evenly over its arrows.
import { describe, expect, it } from "vitest";
import { makeItem } from "../src/data/items";
import { GAME_VERSION } from "../src/data/patchNotes";
import { SKILL_BY_ID, multiShotArrows, multiShotPer, multiShotTotal } from "../src/data/skills";
import { Game, type GameEvents } from "../src/game";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };

describe("v1.2.1 Multiple Shot formula", () => {
  it("levels 1 / 10 / 20: arrows, per-arrow %, volley total", () => {
    expect(GAME_VERSION).toBe("1.8");
    expect([1, 10, 20].map(multiShotTotal)).toEqual([125, 170, 220]);
    expect([1, 10, 20].map(multiShotArrows)).toEqual([3, 12, 12]);
    expect(multiShotPer(1)).toBeCloseTo(125 / 3, 6);
    expect(multiShotPer(10)).toBeCloseTo(170 / 12, 6);
    expect(multiShotPer(20)).toBeCloseTo(220 / 12, 6);
    for (let l = 1; l <= 20; l++) expect(multiShotPer(l) * multiShotArrows(l)).toBeCloseTo(multiShotTotal(l), 6);
  });
  it("tooltip shows per-arrow % and the volley total", () => {
    const fx = SKILL_BY_ID.multiple_shot.effect!;
    expect(fx(1)).toBe("3 arrows, 41.7% damage each (volley total 125%)");
    expect(fx(10)).toBe("12 arrows, 14.2% damage each (volley total 170%)");
    expect(fx(20)).toBe("12 arrows, 18.3% damage each (volley total 220%)");
  });
});

describe("v1.2.1 Multiple Shot in play", () => {
  // every arrow into one big monster point-blank vs one normal arrow: ~1.25× at level 1
  const volley = (skill: string | null, lvl: number) => {
    const real = Math.random;
    Math.random = () => 0.5; // every arrow hits, mid damage roll
    try {
      const g = new Game(events, null, 7, { cls: "amazon", name: "" });
      const p = g.player;
      p.level = 30;
      p.base.dex = 200;
      p.base.str = 100;
      p.skills = { magic_arrow: 1, multiple_shot: lvl };
      p.equip = { main: makeItem("long_bow", 10), off: makeItem("arrows", 1) };
      g.goDungeon(3);
      const m = g.monsters.find((q) => q.def.rank === "normal")!;
      g.monsters = [m];
      m.def = { ...m.def, speed: 0, radius: 1.6, dmgMin: 0, dmgMax: 0 } as typeof m.def;
      m.hp = m.maxHp = 1e7;
      m.defense = 0;
      m.x = p.x + 1.2;
      m.y = p.y;
      p.fx = 1;
      p.fy = 0;
      p.mana = 999;
      const d = g.derived();
      if (skill) expect(g.castSkill(skill, d)).toBe(true);
      else g.startShoot(null, d);
      for (let t = 0; t < 90; t++) {
        m.kx = m.ky = 0;
        m.x = p.x + 1.2;
        m.y = p.y;
        g.update(1 / 30, idle);
      }
      return 1e7 - m.hp;
    } finally {
      Math.random = real;
    }
  };
  it("point-blank, all arrows on one monster: total ≈ 125% (level 1) and 170% (level 10) of a normal shot", () => {
    const one = volley(null, 1);
    expect(one).toBeGreaterThan(10);
    expect(volley("multiple_shot", 1) / one).toBeCloseTo(1.25, 1);
    expect(volley("multiple_shot", 10) / one).toBeCloseTo(1.7, 1);
  });
});
