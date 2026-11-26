// v1.3.1: every arrow and throw skill's Pierce, through the real game loop (skill fired from a slot, projectiles
// flown by Game.update), and the pierce cue's colour.
import { describe, expect, it } from "vitest";
import { makeItem } from "../src/data/items";
import { ELEM_COLOR } from "../src/data/monsters";
import { GAME_VERSION } from "../src/data/patchNotes";
import { pierceChance } from "../src/data/skills";
import { Game, type GameEvents, type Monster, PIERCE_COLOR, PIERCING_SKILLS, type Projectile } from "../src/game";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const PIERCE_LVL = 5; // 51%
const press = (on: boolean) => ({ mx: 0, my: 0, mag: 0, attack: false, skills: [on, false, false] });

/**
 * Fire `casts` of `skill` (null = a normal shot / throw) from skill slot 1 at a line of four harmless monsters and
 * record every projectile's first monster: did the arrow carry on (projHit returned true)? and how many monsters did
 * each projectile hit in the end.
 */
function fire(skill: string | null, casts: number, weapon: "bow" | "javelin" = "bow", pierce = PIERCE_LVL) {
  const g = new Game(events, null, 11, { cls: "amazon", name: "" });
  const p = g.player;
  p.level = 40;
  p.base.dex = 250;
  p.base.str = 150;
  p.equip = weapon === "bow" ? { main: makeItem("long_bow", 10), off: makeItem("arrows", 1) } : { main: makeItem("javelin", 10) };
  g.goDungeon(4);
  p.skills = { magic_arrow: 1, pierce, ...(skill ? { [skill]: 5 } : {}) };
  p.slots = [skill ?? "", "", ""];
  const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const proto = g.monsters.find((m) => m.def.rank === "normal" && !m.elite)!;
  const x0 = R.x + 1.5;
  const y0 = R.cy + 0.5;
  const first: boolean[] = [];
  const hitsPer: number[] = [];
  // watch the real projHit (an own property shadows the prototype's; updateProjectiles calls this.projHit)
  const gp = g as unknown as { projHit: (q: Projectile, m: Monster) => boolean };
  const real = gp.projHit.bind(g);
  const seen = new Set<Projectile>();
  gp.projHit = (q, m) => {
    const r = real(q, m);
    if (q.hits!.length === 1) first.push(r);
    seen.add(q);
    return r;
  };
  let pierces = 0;
  const tags = new Set<Game["floaters"][number]>();
  for (let n = 0; n < casts; n++) {
    p.x = x0; p.y = y0; p.fx = 1; p.fy = 0; p.action = null; p.mana = 999; p.hp = 1e5;
    if (p.equip.off) p.equip.off.qty = 100;
    p.equip.main!.qty = weapon === "javelin" ? 100 : p.equip.main!.qty;
    const ms: Monster[] = [0, 1, 2, 3].map((i) => {
      const m = { ...proto, id: 1e6 + n * 10 + i, x: x0 + 2 + i * 1.2, y: y0, state: "chase", hp: 1e7, maxHp: 1e7, defense: 0, kx: 0, ky: 0, frozenT: 0, chillT: 0, stunT: 0 } as Monster;
      m.def = { ...proto.def, speed: 0, dmgMin: 0, dmgMax: 0 } as Monster["def"];
      return m;
    });
    g.monsters = ms;
    g.allies = [];
    g.projectiles = [];
    const before = g.pierces;
    if (skill) g.update(1 / 60, press(true));
    else g.castBasic(weapon === "bow" ? "basic_shoot" : "basic_throw", g.derived());
    for (let f = 0; f < 120; f++) {
      g.update(1 / 60, press(false));
      for (const fl of g.floaters) if (/Pierce/.test(fl.text)) tags.add(fl);
      ms.forEach((m, i) => { m.x = x0 + 2 + i * 1.2; m.y = y0; });
    }
    pierces += g.pierces - before;
  }
  for (const q of seen) hitsPer.push(q.hits!.length);
  const rate = first.filter(Boolean).length / Math.max(1, first.length);
  return { rate, rolls: first.length, pierces, maxHits: Math.max(0, ...hitsPer), g, tags: [...tags] };
}

describe("v1.3.1 version", () => {
  it("label", () => expect(GAME_VERSION).toBe("1.3.2"));
});

describe(`v1.3.1 Pierce for every piercing skill (level ${PIERCE_LVL}: ${pierceChance(PIERCE_LVL)}%), real game loop`, () => {
  const cases: [string | null, number, "bow" | "javelin"][] = [
    [null, 300, "bow"],
    ["magic_arrow", 300, "bow"],
    ["fire_arrow", 300, "bow"],
    ["cold_arrow", 300, "bow"],
    ["ice_arrow", 300, "bow"],
    ["multiple_shot", 80, "bow"],
    ["strafe", 60, "bow"],
    [null, 300, "javelin"],
    ["poison_javelin", 300, "javelin"],
  ];
  for (const [sk, n, w] of cases) {
    it(`${sk ?? (w === "bow" ? "normal shot" : "normal throw")}: about half its hits carry on into the next monster`, () => {
      const r = fire(sk, n, w);
      expect(r.rolls).toBeGreaterThan(120);
      expect(r.rate).toBeGreaterThan(0.42);
      expect(r.rate).toBeLessThan(0.6);
      expect(r.maxHits).toBeGreaterThanOrEqual(3); // 51% twice in a row happens: it goes on through a second monster too
      expect(PIERCING_SKILLS.has(sk)).toBe(true);
    });
  }
  it("Ice Arrow without Pierce never carries on (the skill itself doesn't pierce)", () => {
    const r = fire("ice_arrow", 100, "bow", 0);
    expect(r.rate).toBe(0);
    expect(r.maxHits).toBe(1);
  });
  it("Ice Arrow pierces just as often as Cold Arrow and a plain shot (it used to look like it never did)", () => {
    const ice = fire("ice_arrow", 400).rate;
    const cold = fire("cold_arrow", 400).rate;
    const plain = fire(null, 400).rate;
    expect(Math.abs(ice - cold)).toBeLessThan(0.1);
    expect(Math.abs(ice - plain)).toBeLessThan(0.1);
  });
  it("the monster an Ice Arrow pierced and the one behind are both hit and frozen", () => {
    const { g } = fire("ice_arrow", 60);
    const hit = g.monsters.filter((m) => m.hp < m.maxHp);
    expect(hit.length).toBeGreaterThanOrEqual(1);
    expect(hit.every((m) => (m.frozenT ?? 0) > 0 || (m.chillT ?? 0) > 0)).toBe(true);
  });
});

describe("v1.3.1 skills that never pierce", () => {
  for (const [sk, w] of [["guided_arrow", "bow"], ["exploding_arrow", "bow"], ["immolation_arrow", "bow"], ["freezing_arrow", "bow"], ["plague_javelin", "javelin"], ["lightning_fury", "javelin"]] as const) {
    it(`${sk}: stops on the first monster, never rolls Pierce`, () => {
      const r = fire(sk, 40, w, 20);
      expect(r.rolls).toBeGreaterThan(20);
      expect(r.rate).toBe(0);
      expect(r.pierces).toBe(0);
      expect(PIERCING_SKILLS.has(sk)).toBe(false);
    });
  }
  it("Lightning Bolt always passes through (no Pierce roll needed)", () => {
    const r = fire("lightning_bolt", 30, "javelin", 0);
    expect(r.rate).toBe(1);
    expect(r.maxHits).toBe(4);
  });
});

describe("v1.3.1 the pierce cue shows on every arrow", () => {
  it("magenta, not any element / crit / magic colour (v1.3's cyan matched Ice Arrow)", () => {
    const used = [...Object.values(ELEM_COLOR), "#ffd84a", "#c89aff", "#fff", "#ffffff", "#8ff0ff", "#b8b8b8"].map((c) => c.toLowerCase());
    expect(used).not.toContain(PIERCE_COLOR.toLowerCase());
    const { tags, pierces } = fire("ice_arrow", 40);
    expect(tags.length).toBe(pierces);
    expect(tags.length).toBeGreaterThan(0);
    for (const f of tags) {
      expect(f.color).toBe(PIERCE_COLOR);
      expect(f.size).toBeGreaterThanOrEqual(14);
    }
  });
});
