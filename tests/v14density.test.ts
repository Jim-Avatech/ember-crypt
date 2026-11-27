// v1.4: monsters per level grow 25% act by act (Act I untouched), bosses stay single, added packs don't crowd rooms
// or stand in corridors.
import { describe, expect, it } from "vitest";
import { ACT_COUNT, LEVELS_PER_ACT } from "../src/data/acts";
import { PATCH_NOTES } from "../src/data/patchNotes";
import { ACT_MONSTER_MULT, Game, type GameEvents, ROOM_CROWD } from "../src/game";
import { isFloor } from "../src/map";

const ev: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const SEEDS = 20;

function survey(act: number) {
  let total = 0;
  let floors = 0;
  const levels: { g: Pick<Game, "monsters" | "level"> }[] = [];
  for (let s = 1; s <= SEEDS; s++) {
    const g = new Game(ev, null, s * 7919, { cls: "barbarian", name: "" });
    for (let l = 1; l <= LEVELS_PER_ACT; l++) {
      g.startFloor((act - 1) * LEVELS_PER_ACT + l);
      const normal = g.monsters.filter((m) => m.def.rank === "normal").length;
      total += normal;
      floors++;
      if (s <= 3) levels.push({ g: { monsters: [...g.monsters], level: g.level } });
    }
  }
  return { avg: total / floors, levels };
}
/** The same survey with the v1.4 act multiplier switched off: the rolls as they were before. */
function surveyBefore(act: number) {
  const keep = [...ACT_MONSTER_MULT];
  ACT_MONSTER_MULT.fill(1);
  try {
    return survey(act).avg;
  } finally {
    keep.forEach((v, i) => (ACT_MONSTER_MULT[i] = v));
  }
}

describe("v1.4 monsters per level by act", () => {
  const after = Array.from({ length: ACT_COUNT }, (_, i) => survey(i + 1));
  const before = Array.from({ length: ACT_COUNT }, (_, i) => surveyBefore(i + 1));
  it("Act I is unchanged", () => {
    expect(ACT_MONSTER_MULT[0]).toBe(1);
    expect(after[0].avg).toBe(before[0]);
  });
  it("each later act averages 25% more than the act before (Act I × 1.25^(act-1)), within 3%", () => {
    for (let a = 2; a <= ACT_COUNT; a++) {
      const want = after[0].avg * 1.25 ** (a - 1);
      expect(Math.abs(after[a - 1].avg / want - 1), `Act ${a}: ${after[a - 1].avg.toFixed(1)} vs ${want.toFixed(1)}`).toBeLessThan(0.03);
      expect(after[a - 1].avg / after[a - 2].avg).toBeGreaterThan(1.2);
      expect(after[a - 1].avg / after[a - 2].avg).toBeLessThan(1.3);
    }
    console.log("monsters/level before", before.map((v) => v.toFixed(1)).join(" / "), "after", after.map((v) => v.avg.toFixed(1)).join(" / "));
  });
  it("bosses stay single: one level boss or act boss per level, in every act", () => {
    for (const { levels } of after)
      for (const { g } of levels) expect(g.monsters.filter((m) => m.def.rank === "boss" || m.def.rank === "final").length).toBe(1);
  });
  it("every monster starts on an open room tile inside a room (never a corridor or a room's doorway edge)", () => {
    for (const { levels } of after)
      for (const { g } of levels)
        for (const m of g.monsters) {
          expect(isFloor(g.level, Math.floor(m.x), Math.floor(m.y))).toBe(true);
          const r = g.level.rooms.find((r) => m.x >= r.x + 1 && m.x < r.x + r.w - 1 && m.y >= r.y + 1 && m.y < r.y + r.h - 1);
          expect(r).toBeTruthy();
        }
  });
  it("the added packs never go in the start room or the boss room and never fill a room past ROOM_CROWD per tile", () => {
    for (let a = 2; a <= ACT_COUNT; a++) {
      for (let s = 1; s <= 5; s++)
        for (const l of [1, 10, 19]) {
          const g0 = new Game(ev, null, s * 104729, { cls: "barbarian", name: "" });
          const floor = (a - 1) * LEVELS_PER_ACT + l;
          const keep = [...ACT_MONSTER_MULT];
          ACT_MONSTER_MULT.fill(1);
          g0.startFloor(floor);
          const maxPack = Math.max(...g0.monsters.map((m) => m.pack));
          const g = new Game(ev, null, s * 104729, { cls: "barbarian", name: "" });
          keep.forEach((v, i) => (ACT_MONSTER_MULT[i] = v));
          g.startFloor(floor);
          const added = g.monsters.filter((m) => m.pack > maxPack);
          expect(added.length).toBeGreaterThan(0);
          for (const r of g.level.rooms) {
            const inR = (m: { x: number; y: number }) => m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h;
            const addedHere = added.filter(inR).length;
            if (!addedHere) continue;
            expect(r).not.toBe(g.level.start);
            expect(r).not.toBe(g.level.bossRoom);
            expect(g.monsters.filter(inR).length).toBeLessThanOrEqual(Math.floor((r.w - 2) * (r.h - 2) * ROOM_CROWD));
          }
        }
    }
  });
  it("patch note", () => {
    const v = PATCH_NOTES.find((p) => p.version === "1.4")!;
    expect(v.notes.some((n) => /25% more monsters/.test(n))).toBe(true);
  });
});
