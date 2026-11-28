// v1.8: Act V, Rimefrost Citadel. A fifth act of 20 levels after Act IV: frozen (tinted) variants of earlier monsters,
// its own level boss and final boss, an "ice" tileset, more monsters, a post-parity difficulty step and leech drain 25%.
import { describe, expect, it } from "vitest";
import { ACTS, ARTIFACTS, LEVELS_PER_ACT, MAX_FLOOR, actOf, firstFloorOf, hasWaypoint, isFinalLevel, levelInAct, mlvlOf, whereLabel } from "../src/data/acts";
import { MONSTERS } from "../src/data/monsters";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import { ACT_MONSTER_MULT, ACT5_DMG, ACT5_HP, Game, type GameEvents, LEECH_ACT_DRAIN, type Monster, bossHitShare, curveDmg, curveHp, heroLifeRef, leechDrainFor, migrateSave } from "../src/game";
import swSrc from "../public/sw.js?raw";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const kill = (g: Game, m: Monster) => (g as unknown as { kill(m: Monster): void }).kill(m);
const A5 = ACTS[4];

/** average over floors and seeds of the level's normal monsters: count, total life, mean max damage */
function survey(floors: number[]) {
  let n = 0, life = 0, dmg = 0, levels = 0;
  for (const seed of [3, 4, 5]) {
    const g = new Game(events, null, seed);
    for (const f of floors) {
      g.startFloor(f);
      levels++;
      for (const m of g.monsters) {
        if (m.def.rank !== "normal" || m.elite) continue;
        n++;
        life += m.maxHp;
        dmg += m.dmgMax;
      }
    }
  }
  return { count: n / levels, life: life / levels, dmg: dmg / n };
}

describe("v1.8 release", () => {
  it("version, patch note, cache v42", () => {
    expect(GAME_VERSION).toMatch(/^1\.(8|9)/);
    expect(PATCH_NOTES.find((n) => n.version === "1.8")!.notes.join(" ")).toMatch(/Act V/);
    expect(swSrc).toMatch(/ember-crypt-shell-v4[2-9]/);
  });
});

describe("v1.8 Act V: Rimefrost Citadel", () => {
  it("five acts of 20 levels; floors 81-100 are Act V with waypoints on 1 and every 5th level", () => {
    expect(ACTS.length).toBe(5);
    expect(MAX_FLOOR).toBe(100);
    expect(firstFloorOf(5)).toBe(81);
    expect([81, 100].map(actOf)).toEqual([5, 5]);
    expect(isFinalLevel(100)).toBe(true);
    expect([81, 82, 85, 90, 95, 100].filter(hasWaypoint)).toEqual([81, 85, 90, 95, 100]);
    expect(whereLabel(87)).toBe("Act 5 · Level 7");
    expect(A5.area).toBe("Rimefrost Citadel");
    expect(A5.theme.feature).toBe("ice");
  });
  it("its own monsters (tinted variants of existing art), level boss and final boss with specials; no fifth artifact", () => {
    const earlier = new Set(ACTS.slice(0, 4).flatMap((a) => a.monsters));
    expect(A5.monsters.length).toBe(4);
    for (const k of A5.monsters) {
      expect(earlier.has(k)).toBe(false);
      expect(MONSTERS[k].tint).toMatch(/^#/);
      expect(MONSTERS[k].rank).toBe("normal");
    }
    expect(MONSTERS[A5.levelBoss].rank).toBe("boss");
    expect(MONSTERS[A5.finalBoss].rank).toBe("final");
    expect(MONSTERS[A5.finalBoss].specials!.length).toBeGreaterThanOrEqual(3);
    expect(A5.artifact).toBeUndefined();
    expect(ARTIFACTS.length).toBe(4);
    expect(A5.mlvl0).toBeGreaterThan(mlvlOf(80));
  });
  it("a meaningful step up: more monsters, more life and damage than Act IV, and bosses hit harder", () => {
    expect(ACT_MONSTER_MULT.length).toBe(5);
    expect(curveHp(80)).toBe(1);
    expect(curveDmg(80)).toBe(1);
    expect(curveHp(81)).toBeCloseTo(ACT5_HP[0]);
    expect(curveHp(100)).toBeCloseTo(ACT5_HP[1]);
    expect(curveDmg(81)).toBeCloseTo(ACT5_DMG[0]);
    expect(curveDmg(100)).toBeCloseTo(ACT5_DMG[1]);
    const iv = survey([61, 65, 70, 75, 79]);
    const v = survey([81, 85, 90, 95, 99]);
    console.log(`ACT4 vs ACT5 per level: monsters ${iv.count.toFixed(1)} → ${v.count.toFixed(1)}, life ${Math.round(iv.life)} → ${Math.round(v.life)}, mean max hit ${iv.dmg.toFixed(1)} → ${v.dmg.toFixed(1)}`);
    // Act III → IV was about ×2.1 life and ×1.95 hits per level; Act V is a bigger step, but not a wall
    expect(v.count).toBeGreaterThan(iv.count * 1.15);
    expect(v.life).toBeGreaterThan(iv.life * 2.3);
    expect(v.life).toBeLessThan(iv.life * 4);
    expect(v.dmg).toBeGreaterThan(iv.dmg * 1.9);
    expect(v.dmg).toBeLessThan(iv.dmg * 2.8);
    const bossHit = (f: number) => bossHitShare(f) * heroLifeRef(f);
    expect(bossHit(81)).toBeGreaterThan(bossHit(61) * 1.4); // like every act, the share restarts on level 1
    expect(bossHit(100)).toBeGreaterThan(bossHit(80) * 1.3);
  });
  it("boss damage is still fixed per floor (independent of the hero)", () => {
    for (const f of [81, 90, 100]) {
      const dmg = (lvl: number) => {
        const g = new Game(events, null, 9);
        g.player.level = lvl;
        g.startFloor(f);
        return [g.boss!.dmgMin, g.boss!.dmgMax];
      };
      expect(dmg(1)).toEqual(dmg(80));
    }
  });
  it("leech drain continues the act pattern: Act V keeps 25%, for every class", () => {
    expect(LEECH_ACT_DRAIN[4]).toBe(0.25);
    expect(leechDrainFor("normal", 0, 90)).toBeCloseTo(0.25);
  });
  it("Malakar opens the stairs to Act V; Act V levels spawn its monsters and boss; Vorthak ends the game", () => {
    const g = new Game(events, null, 8);
    g.startFloor(80);
    kill(g, g.boss!);
    expect(g.stairs).not.toBeNull();
    g.descend();
    expect(g.floor).toBe(81);
    const kinds = new Set(g.monsters.filter((m) => m.def.rank === "normal").map((m) => m.def.kind));
    for (const k of kinds) expect(A5.monsters).toContain(k);
    expect(g.boss!.def.kind).toBe(A5.levelBoss);
    g.startFloor(100);
    expect(g.boss!.def.kind).toBe("frostking");
    expect(levelInAct(100)).toBe(LEVELS_PER_ACT);
  });
});

describe("v1.8 save migration", () => {
  const base = (artifacts: string[], maxFloor: number) => {
    const g = new Game(events, null, 5);
    const s = g.toSave();
    s.maxFloor = maxFloor;
    s.floor = Math.min(maxFloor, 20);
    s.player.artifacts = artifacts.map((id, i) => ({ id, at: 1700000000000 + i, level: 50 }));
    return migrateSave(JSON.parse(JSON.stringify(s)))!;
  };
  it("a hero who already beat Malakar (Cinder Crown) gets Act V's first waypoint", () => {
    const d = base(["ember_heart", "sun_scarab", "mire_pearl", "cinder_crown"], 80);
    expect(d.maxFloor).toBe(81);
    const g = new Game(events, d);
    g.travel(81);
    expect(g.floor).toBe(81);
  });
  it("other heroes are unchanged and still load", () => {
    expect(base(["ember_heart"], 60).maxFloor).toBe(60);
    expect(base([], 3).maxFloor).toBe(3);
  });
});
