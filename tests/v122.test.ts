// v1.2.2: Guided Arrow homes like D2: locks onto what it is aimed at, otherwise acquires the nearest monster it can see
// in flight, re-acquires when its target dies, curves into rooms and around corners, and never flies through walls.
import { describe, expect, it } from "vitest";
import { makeItem } from "../src/data/items";
import { GAME_VERSION } from "../src/data/patchNotes";
import { Game, type GameEvents, type Monster} from "../src/game";
import { idx, lineOfSight } from "../src/map";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };

/** A 3-wide hall (y 29..31) running east from x=18 into a room x 31..35, y 20..40; the room's back wall is x=36. */
function hallRoom(seed = 5) {
  const g = new Game(events, null, seed, { cls: "amazon", name: "" });
  const p = g.player;
  p.level = 30;
  p.base.dex = 200;
  p.base.str = 100;
  p.skills = { magic_arrow: 1, guided_arrow: 1 };
  p.equip = { main: makeItem("long_bow", 10), off: makeItem("arrows", 1) };
  g.goDungeon(3);
  const L = g.level;
  L.tiles.fill(0);
  for (let y = 29; y <= 31; y++) for (let x = 18; x <= 30; x++) L.tiles[idx(x, y)] = 1;
  for (let y = 20; y <= 40; y++) for (let x = 31; x <= 35; x++) L.tiles[idx(x, y)] = 1;
  const proto = g.monsters.find((q) => q.def.rank === "normal")!;
  const mk = (x: number, y: number, hp = 1e6): Monster => {
    const m = { ...proto, id: proto.id * 1000 + Math.round(x * 100 + y), x, y, state: "idle", hp, maxHp: hp, defense: 0 } as Monster;
    m.def = { ...proto.def, speed: 0, dmgMin: 0, dmgMax: 0, radius: 0.5 } as Monster["def"];
    return m;
  };
  g.monsters = [];
  p.x = 24.5;
  p.y = 30.5;
  p.fx = 1;
  p.fy = 0;
  p.mana = 999;
  return { g, p, mk };
}

/** Shoot Guided Arrow east and play it out; returns the arrow's path and where it ended. */
function fly(g: Game, onFrame?: (t: number) => void) {
  const d = g.derived();
  expect(g.castSkill("guided_arrow", d)).toBe(true);
  const path: { x: number; y: number }[] = [];
  let seen = false;
  let firstHoming: unknown = "unset";
  for (let t = 0; t < 120; t++) {
    g.player.fx = 1; // keep aiming down the hall
    g.player.fy = 0;
    g.update(1 / 30, idle);
    onFrame?.(t);
    const q = g.projectiles.find((x) => x.skill === "guided_arrow");
    if (q) {
      if (!seen) firstHoming = q.homing ?? null;
      seen = true;
      path.push({ x: q.x, y: q.y });
    } else if (seen) break;
  }
  return { path, firstHoming };
}

describe("v1.2.2 Guided Arrow", () => {
  it("version label", () => expect(GAME_VERSION).toBe("1.6.3"));

  it("shot down a hall with no target in sight: acquires a monster in the room in flight and curves into it (not the back wall)", () => {
    const { g, mk } = hallRoom();
    const m = mk(33.5, 23.5);
    g.monsters = [m];
    const { path, firstHoming } = fly(g);
    expect(firstHoming).toBe(null); // nothing seen from the hall and nothing in the aim cone: the v1.2.1 arrow flew straight on
    expect(m.hp).toBeLessThan(m.maxHp);
    const end = path[path.length - 1];
    expect(end.x).toBeLessThan(35.5); // it did not reach the back wall
    expect(Math.min(...path.map((p) => p.y))).toBeLessThan(26); // it turned north into the room
    // never through a wall: every step of the path is in clear sight of the last
    for (let i = 1; i < path.length; i++) expect(lineOfSight(g.level, path[i - 1].x, path[i - 1].y, path[i].x, path[i].y)).toBe(true);
  });

  it("aimed at a monster around the corner: locks on at release and follows the way round", () => {
    const { g, mk } = hallRoom(6);
    const m = mk(34.5, 26.5); // about 21° off the aim line, hidden behind the hall's wall
    g.monsters = [m];
    expect(lineOfSight(g.level, g.player.x, g.player.y, m.x, m.y)).toBe(false);
    const { path, firstHoming } = fly(g);
    expect(firstHoming).toBe(m);
    expect(m.hp).toBeLessThan(m.maxHp);
    for (let i = 1; i < path.length; i++) expect(lineOfSight(g.level, path[i - 1].x, path[i - 1].y, path[i].x, path[i].y)).toBe(true);
  });

  it("re-acquires another monster when its target dies", () => {
    const { g, mk } = hallRoom(7);
    const a = mk(33.5, 23.5);
    const b = mk(33.5, 37.5);
    g.monsters = [a, b];
    let killed = false;
    fly(g, () => {
      const q = g.projectiles.find((x) => x.skill === "guided_arrow");
      if (!killed && q?.homing) {
        const tgt = q.homing;
        tgt.state = "dead"; // its target dies mid-flight (killed by someone else)
        tgt.hp = 0;
        killed = true;
      }
    });
    expect(killed).toBe(true);
    const other = a.state === "dead" ? b : a;
    expect(other.hp).toBeLessThan(other.maxHp);
  });

  it("with nothing to seek it flies straight and stops at the wall / its range", () => {
    const { g } = hallRoom(8);
    const { path } = fly(g);
    for (const p of path) expect(Math.abs(p.y - 30.5)).toBeLessThan(0.01);
    expect(path[path.length - 1].x).toBeLessThan(36.1);
  });

});
