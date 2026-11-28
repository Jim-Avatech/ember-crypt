// v1.8.1: the Sanctum of the Four (past Act V's boss), Kharos the big boss summoned with the four artifacts, and the
// Endless Tower: a camp portal, floors that climb forever, a run that ends when its 5-minute camp portal closes.
import { describe, expect, it } from "vitest";
import { ARTIFACTS, MAX_FLOOR, SANCTUM_FLOOR, TOWER_MLVL0, actOf, hasWaypoint, isSanctum, isTower, levelInAct, mlvlOf, towerFloor, towerLevel, whereLabel } from "../src/data/acts";
import { MONSTERS } from "../src/data/monsters";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import {
  ALTAR_RISE, BIG_BOSS_HIT, FLOOR_KEEP_MS, Game, type GameEvents, LEECH_ACT_DRAIN, type Monster, TOWER_DMG_GROWTH, TOWER_HP_GROWTH, TOWER_PORTAL_AT, TOWER_PORTAL_MS,
  bossHitShare, curveDmg, curveHp, heroLifeRef, leechDrainFor, migrateSave,
} from "../src/game";
import swSrc from "../public/sw.js?raw";
import gameSrc from "../src/game.ts?raw";

const toasts: string[] = [];
const events: GameEvents = { sound() {}, toast: (t) => void toasts.push(t), changed() {}, died() {}, levelUp() {}, shake() {} };
const kill = (g: Game, m: Monster) => (g as unknown as { kill(m: Monster): void }).kill(m);
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };
const allFour = (g: Game) => (g.player.artifacts = ARTIFACTS.map((a, i) => ({ id: a.id, at: 1700000000000 + i, level: 20 * (i + 1) })));
/** a game with a fake clock */
function clockGame(seed = 7) {
  const g = new Game(events, null, seed);
  let t = 1_000_000;
  g.now = () => t;
  return { g, tick: (ms: number) => (t += ms) };
}
const step = (g: Game, s: number) => { for (let i = 0; i < Math.round(s * 30); i++) g.update(1 / 30, idle); };
function toAltar(g: Game) {
  g.startFloor(SANCTUM_FLOOR);
  const a = g.altar!;
  g.player.x = a.x - 1;
  g.player.y = a.y;
}
/** summon and slay Kharos */
function beatKharos(g: Game) {
  allFour(g);
  toAltar(g);
  expect(g.useAltar()).toBeNull();
  step(g, ALTAR_RISE + 0.2);
  const b = g.boss!;
  kill(g, b);
}

describe("v1.8.1 release", () => {
  it("version, patch note, cache v42+", () => {
    expect(GAME_VERSION).toMatch(/^1\.(8\.1|9)/);
    expect(PATCH_NOTES.find((n) => n.version === "1.8.1")!.notes.join(" ")).toMatch(/Endless Tower/);
    expect(swSrc).toMatch(/ember-crypt-shell-v4[2-9]/);
  });
});

describe("v1.8.1 floors past Act V", () => {
  it("floor 101 is the Sanctum; tower floor n is 101 + n; labels, no waypoints, Act V rules", () => {
    expect(SANCTUM_FLOOR).toBe(MAX_FLOOR + 1);
    expect(isSanctum(101) && !isTower(101) && isTower(102)).toBe(true);
    expect([towerLevel(102), towerLevel(150), towerFloor(1), towerFloor(7)]).toEqual([1, 49, 102, 108]);
    expect(whereLabel(101)).toBe("Sanctum of the Four");
    expect(whereLabel(towerFloor(12))).toBe("Tower · Floor 12");
    expect([101, 102, 106, 111].some(hasWaypoint)).toBe(false);
    expect(actOf(101)).toBe(5);
    expect(actOf(towerFloor(500))).toBe(5);
    expect(LEECH_ACT_DRAIN[actOf(towerFloor(3)) - 1]).toBe(0.25);
    expect(leechDrainFor("normal", 0, towerFloor(3))).toBeCloseTo(0.25);
    // the tower never has a final level; level-in-act cycles 1..19 for boss names / mods
    for (let n = 1; n <= 60; n++) expect(levelInAct(towerFloor(n))).toBeLessThan(20);
  });
});

describe("v1.8.1 Vorthak opens the way to the Sanctum", () => {
  it("killing Act V's boss opens stairs to the Sanctum (not a game end); the Sanctum then shows on the waypoint", () => {
    const g = new Game(events, null, 8);
    g.startFloor(MAX_FLOOR);
    kill(g, g.boss!);
    expect(g.stairs).not.toBeNull();
    expect(toasts.at(-1)).toMatch(/Sanctum of the Four is open/);
    g.descend();
    expect(g.floor).toBe(SANCTUM_FLOOR);
    expect(g.maxFloor).toBe(SANCTUM_FLOOR);
    expect(g.monsters.length).toBe(0);
    expect(g.boss).toBeNull();
    expect(g.altar).not.toBeNull();
    g.goTown();
    g.travel(SANCTUM_FLOOR);
    expect(g.floor).toBe(SANCTUM_FLOOR);
  });
});

describe("v1.8.1 the altar and Kharos", () => {
  it("the altar refuses without all four artifacts and says which are missing", () => {
    const g = new Game(events, null, 9);
    g.player.artifacts = [{ id: "ember_heart", at: 1, level: 10 }];
    toAltar(g);
    expect(g.contextAction()).toBe("altar");
    const msg = g.useAltar();
    expect(msg).toMatch(/Missing: The Sun Scarab, The Mire Pearl, The Cinder Crown/);
    expect(g.altar!.used).toBe(false);
    step(g, ALTAR_RISE + 1);
    expect(g.boss).toBeNull();
  });
  it("with all four: a telegraphed rise, then Kharos — tough, every special, fixed damage for the floor", () => {
    const g = new Game(events, null, 9);
    allFour(g);
    toAltar(g);
    expect(g.useAltar()).toBeNull();
    expect(g.player.artifacts.length).toBe(4); // kept, not consumed
    step(g, ALTAR_RISE - 0.5);
    expect(g.boss).toBeNull(); // still rising: time to step back
    step(g, 0.7);
    const b = g.boss!;
    expect(b.def.kind).toBe("kharos");
    expect(b.def.rank).toBe("final");
    for (const sp of ["nova", "bolts", "charge", "summon", "slam"]) expect(b.def.specials).toContain(sp);
    // tough: well over twice Vorthak's life
    const v = new Game(events, null, 9);
    v.startFloor(MAX_FLOOR);
    expect(b.maxHp).toBeGreaterThan(v.boss!.maxHp * 2.5);
    // damage: set per floor (Act V's last boss share x BIG_BOSS_HIT), independent of the hero
    const avg = (b.dmgMin + b.dmgMax) / 2;
    expect(avg).toBeCloseTo(bossHitShare(SANCTUM_FLOOR) * heroLifeRef(SANCTUM_FLOOR), -1);
    expect(bossHitShare(SANCTUM_FLOOR)).toBeCloseTo(0.38 * curveDmg(SANCTUM_FLOOR) * BIG_BOSS_HIT, 5);
    const g2 = new Game(events, null, 9);
    g2.player.level = 1;
    allFour(g2);
    toAltar(g2);
    g2.useAltar();
    step(g2, ALTAR_RISE + 0.2);
    expect([g2.boss!.dmgMin, g2.boss!.dmgMax]).toEqual([b.dmgMin, b.dmgMax]);
    expect(MONSTERS.kharos.windup).toBeGreaterThanOrEqual(0.7); // slower, readable swings
  });
  it("slaying Kharos opens the tower (saved), with no stairs", () => {
    const g = new Game(events, null, 10);
    beatKharos(g);
    expect(g.player.towerOpen).toBe(true);
    expect(g.stairs).toBeNull();
    expect(toasts.at(-1)).toMatch(/tower portal has opened/);
    const back = new Game(events, migrateSave(JSON.parse(JSON.stringify(g.toSave())))!);
    expect(back.player.towerOpen).toBe(true);
  });
});

describe("v1.8.1 the Endless Tower", () => {
  it("its portal stands in camp only once Kharos is beaten; it always starts a run on floor 1", () => {
    const { g } = clockGame();
    g.goTown();
    g.player.x = TOWER_PORTAL_AT.x;
    g.player.y = TOWER_PORTAL_AT.y + 0.5;
    expect(g.contextAction()).not.toBe("tower");
    expect(g.enterTower()).toBe(false);
    g.player.towerOpen = true;
    expect(g.contextAction()).toBe("tower");
    expect(g.enterTower()).toBe(true);
    expect(g.floor).toBe(towerFloor(1));
    expect(g.towerRun).not.toBeNull();
    expect(g.player.towerBest).toBe(1);
    expect(g.maxFloor).toBeLessThanOrEqual(SANCTUM_FLOOR);
  });
  it("floors climb forever: a boss on every floor, stairs up after it, the counter and best floor saved", () => {
    const { g } = clockGame();
    g.player.towerOpen = true;
    g.goTown();
    g.enterTower();
    for (let n = 1; n <= 25; n++) {
      expect(towerLevel(g.floor)).toBe(n);
      expect(g.boss).not.toBeNull();
      kill(g, g.boss!);
      expect(g.stairs).not.toBeNull();
      g.descend();
    }
    expect(towerLevel(g.floor)).toBe(26);
    expect(g.player.towerBest).toBe(26);
    const d = migrateSave(JSON.parse(JSON.stringify(g.toSave())))!;
    expect(d.player.towerBest).toBe(26);
    expect(d.floor).toBeLessThanOrEqual(SANCTUM_FLOOR); // tower floors aren't saved as a position
  });
  it("monster life, damage, monster level and loot all keep scaling with the floor", () => {
    expect(mlvlOf(towerFloor(1))).toBe(TOWER_MLVL0);
    expect(mlvlOf(towerFloor(51))).toBe(TOWER_MLVL0 + 50);
    expect(curveHp(towerFloor(10)) / curveHp(towerFloor(9))).toBeCloseTo(TOWER_HP_GROWTH);
    expect(curveDmg(towerFloor(10)) / curveDmg(towerFloor(9))).toBeCloseTo(TOWER_DMG_GROWTH);
    const life = (n: number) => {
      const g = new Game(events, null, 4);
      g.startFloor(towerFloor(n));
      const ms = g.monsters.filter((m) => m.def.rank === "normal" && !m.elite);
      return ms.reduce((a, m) => a + m.maxHp / m.def.hp, 0) / ms.length; // life per point of base life
    };
    console.log(`TOWER life per base point: F1 ${life(1).toFixed(0)}, F10 ${life(10).toFixed(0)}, F50 ${life(50).toFixed(0)}`);
    expect(life(10)).toBeGreaterThan(life(1) * 1.5);
    expect(life(50)).toBeGreaterThan(life(10) * 3);
    const boss = (n: number) => bossHitShare(towerFloor(n)) * heroLifeRef(towerFloor(n));
    // the level-boss share cycles 30%→35% every 19 floors (like an act), so a floor can dip a little; a cycle later it is always higher
    for (let n = 2; n <= 100; n++) expect(boss(n)).toBeGreaterThan(boss(n - 1) * 0.85);
    for (let n = 20; n <= 100; n++) expect(boss(n)).toBeGreaterThan(boss(n - 19) * 1.3);
    expect(boss(40)).toBeGreaterThan(boss(1) * 2);
    expect(gameSrc).toMatch(/TOWER_MF_PER_FLOOR \* towerLevel\(this\.floor\)/);
  });
  it("a camp portal opened in the tower lasts TOWER_PORTAL_MS (5 min); go back up while it's open", () => {
    const { g, tick } = clockGame();
    expect(TOWER_PORTAL_MS).toBe(5 * 60 * 1000);
    expect(TOWER_PORTAL_MS).toBe(FLOOR_KEEP_MS);
    g.player.towerOpen = true;
    g.goTown();
    g.enterTower();
    kill(g, g.boss!);
    g.descend();
    expect(towerLevel(g.floor)).toBe(2);
    g.startRecall();
    step(g, 1.5);
    expect(g.inTown).toBe(true);
    expect(g.portal!.floor).toBe(towerFloor(2));
    expect(g.portalLeft()).toBeCloseTo(300, 0);
    tick(4 * 60 * 1000);
    step(g, 0.1);
    expect(g.portal).not.toBeNull();
    expect(g.usePortal()).toBe(true);
    expect(towerLevel(g.floor)).toBe(2);
    expect(g.towerRun).not.toBeNull();
  });
  it("if it closes while you're away, the run is over and the next entry starts on floor 1", () => {
    const { g, tick } = clockGame();
    g.player.towerOpen = true;
    g.goTown();
    g.enterTower();
    for (let i = 0; i < 3; i++) { kill(g, g.boss!); g.descend(); }
    g.startRecall();
    step(g, 1.5);
    g.travel(1); // off to another level while the portal counts down
    tick(TOWER_PORTAL_MS + 1000);
    step(g, 0.1);
    expect(g.portal).toBeNull();
    expect(g.towerRun).toBeNull();
    expect(toasts.at(-1)).toMatch(/tower portal has closed.*run is over \(best: floor 4\)/);
    g.goTown();
    g.enterTower();
    expect(towerLevel(g.floor)).toBe(1);
    expect(g.player.towerBest).toBe(4);
  });
  it("portals from normal levels still never close; dying in the tower ends the run", () => {
    const { g, tick } = clockGame();
    g.startFloor(5);
    g.startRecall();
    step(g, 1.5);
    expect(g.portal!.expires).toBeUndefined();
    tick(60 * 60 * 1000);
    step(g, 0.1);
    expect(g.portal).not.toBeNull();
    g.player.towerOpen = true;
    g.enterTower();
    g.respawn();
    expect(g.towerRun).toBeNull();
    expect(g.inTown).toBe(true);
  });
});

describe("v1.8.1 saves", () => {
  it("old saves load unchanged (no tower fields); junk is cleaned; the Sanctum can be the deepest level", () => {
    const g = new Game(events, null, 5);
    const s = JSON.parse(JSON.stringify(g.toSave()));
    expect(s.player.towerOpen).toBeUndefined();
    const d = migrateSave({ ...s, maxFloor: 101, floor: 101, player: { ...s.player, towerOpen: "yes", towerBest: "12.7" } })!;
    expect(d.maxFloor).toBe(101);
    expect(d.player.towerOpen).toBe(false);
    expect(d.player.towerBest).toBe(12);
    expect(migrateSave({ ...s, maxFloor: 5000, floor: 5000 })!.maxFloor).toBe(SANCTUM_FLOOR);
  });
});
