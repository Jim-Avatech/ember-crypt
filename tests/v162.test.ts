// v1.6.2: Charged Bolt launches inside a 30° cone and wanders within bounds, so it hits from range.
import { describe, expect, it } from "vitest";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import { Game, type GameEvents, type Monster } from "../src/game";
import { CB_CONE, CB_WANDER_MAX, type Missile } from "../src/spells";
import swSrc from "../public/sw.js?raw";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };
const deg = (r: number) => (r * 180) / Math.PI;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** one cast of Charged Bolt at a still monster `dist` tiles east (or none); per-frame bolt samples */
function trial(dist: number, lvl: number, withMonster = true) {
  const g = new Game(events, null, 7, { cls: "sorceress", name: "" });
  g.player.level = 30;
  g.player.skills = { charged_bolt: lvl };
  g.goDungeon(20);
  const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const proto = g.monsters.find((m) => m.def.rank === "normal")!;
  const p = g.player;
  p.x = R.cx + 0.5 - dist / 2; p.y = R.cy + 0.5; p.fx = 1; p.fy = 0;
  const m = { ...proto, id: 8e6, x: p.x + dist, y: p.y, state: "chase", kx: 0, ky: 0, stunT: 0, chillT: 0, frozenT: 0, hp: 1e6, maxHp: 1e6, fuse: -1 } as Monster;
  m.def = { ...proto.def, speed: 0, dmgMin: 0, dmgMax: 0, behavior: "melee", specials: undefined, shot: undefined } as Monster["def"];
  g.monsters = withMonster ? [m] : [];
  let hits = 0;
  const eh = g.elemHit.bind(g);
  g.elemHit = (mm, d, e, o) => { hits++; eh(mm, d, e, o); };
  p.mana = 1e5; p.action = null;
  g.castSkill("charged_bolt", g.derived());
  const launch: number[] = [];
  const push = g.spells.push.bind(g.spells);
  g.spells.push = (...xs) => { for (const s of xs) if (s.k === "missile" && s.id === "charged_bolt") launch.push(Math.atan2(s.vy, s.vx)); return push(...xs); };
  const devs: number[] = [];
  const inCone: boolean[] = [];
  const seen = new Set<Missile>();
  for (let t = 0; t < 2; t += 1 / 60) {
    p.hp = 1e4;
    g.update(1 / 60, idle);
    m.x = p.x + dist; m.y = p.y; m.kx = 0; m.ky = 0;
    for (const s of g.spells) {
      if (s.k !== "missile" || s.id !== "charged_bolt") continue;
      seen.add(s);
      devs.push(Math.abs(wrap(Math.atan2(s.vy, s.vx) - s.home!.ang)));
      if (Math.hypot(s.x - p.x, s.y - p.y) > 1.5) inCone.push(Math.abs(wrap(Math.atan2(s.y - p.y, s.x - p.x))) <= CB_CONE + 0.05);
    }
  }
  return { hits, launch, devs, inCone, n: seen.size };
}

describe("v1.6.2 Charged Bolt", () => {
  it("version, patch note (now second), cache bumped since", () => {
    expect(GAME_VERSION).toBe("1.7.1");
    const n = PATCH_NOTES.find((q) => q.version === "1.6.2")!;
    expect(n.notes.join(" ")).toMatch(/Charged Bolt/);
    expect(swSrc).toMatch(/ember-crypt-shell-v\d+/);
  });
  // v1.6.3: the cone is 45° now (CB_CONE 22.5°); the launch / wander / hit-share checks moved to v163.test.ts
  it("the bolt still wanders within cone + wander bound (any cone)", () => {
    let all: number[] = [];
    for (let i = 0; i < 20; i++) all = all.concat(trial(6, 10, false).devs);
    expect(Math.max(...all)).toBeLessThanOrEqual(CB_CONE + CB_WANDER_MAX + 1e-6);
    expect(trial(6, 10).launch.every((a) => Math.abs(deg(a)) <= deg(CB_CONE) + 0.5)).toBe(true);
  });
});
