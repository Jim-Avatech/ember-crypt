import { describe, expect, it } from "vitest";
import { ACTS, ARTIFACTS, LEVELS_PER_ACT, MAX_FLOOR, actOf, bossName, floorName, hasWaypoint, isFinalLevel, levelInAct, mlvlOf, xpPenalty } from "../src/data/acts";
import { makeItem } from "../src/data/items";
import { MONSTERS } from "../src/data/monsters";
import { Game, type GameEvents, type Monster, SAVE_VERSION, migrateSave, xpForLevel } from "../src/game";
import * as save from "../src/save";

const toasts: string[] = [];
const events: GameEvents = { sound() {}, toast(t) { toasts.push(t); }, changed() {}, died() {}, levelUp() {}, shake() {} };
// biome-ignore lint: test access to private kill()
const kill = (g: Game, m: Monster) => (g as unknown as { kill(m: Monster): void }).kill(m);

const v5 = {
  v: 5, seed: 77, floor: 8, maxFloor: 9,
  player: {
    level: 14, xp: 30000, base: { str: 50, dex: 30, vit: 40, ene: 10 }, statPoints: 0, skillPoints: 0, skills: { bash: 3 }, slots: ["bash", null, null],
    gold: 1234, hpPots: 2, mpPots: 1, kills: 400, equip: { main: { uid: 1, baseId: "axe", ilvl: 8 } },
    bag: [{ item: { uid: 2, baseId: "sword", ilvl: 5 }, x: 3, y: 6 }],
    stash: [{ item: { uid: 3, baseId: "ring", ilvl: 6 }, x: 9, y: 9 }],
  },
};

describe("acts", () => {
  it("4 acts × 20 levels, floors map to act and level; waypoints every 5 levels", () => {
    expect(ACTS.length).toBe(4);
    expect(LEVELS_PER_ACT).toBe(20);
    expect(MAX_FLOOR).toBe(80);
    expect([1, 20, 21, 40, 41, 80].map(actOf)).toEqual([1, 1, 2, 2, 3, 4]);
    expect([1, 20, 21, 40, 61].map(levelInAct)).toEqual([1, 20, 1, 20, 1]);
    expect(floorName(22)).toBe("Sunken Tombs — Level 2");
    expect(isFinalLevel(60)).toBe(true);
    expect(isFinalLevel(59)).toBe(false);
    expect([1, 2, 5, 7, 10, 15, 20, 21, 25].filter(hasWaypoint)).toEqual([1, 5, 10, 15, 20, 21, 25]);
  });
  it("each act has 3-4 distinct monster types, a level boss, a final boss with a special, and its own artifact", () => {
    const seen = new Set<string>();
    for (const a of ACTS) {
      expect(a.monsters.length).toBeGreaterThanOrEqual(3);
      expect(a.monsters.length).toBeLessThanOrEqual(4);
      for (const k of a.monsters) {
        expect(seen.has(k)).toBe(false);
        seen.add(k);
        expect(MONSTERS[k].rank).toBe("normal");
      }
      expect(MONSTERS[a.levelBoss].rank).toBe("boss");
      expect(MONSTERS[a.finalBoss].rank).toBe("final");
      expect(MONSTERS[a.finalBoss].specials!.length).toBeGreaterThan(0);
      const names = Array.from({ length: LEVELS_PER_ACT - 1 }, (_, i) => bossName(a, i + 1));
      expect(new Set(names).size).toBe(LEVELS_PER_ACT - 1);
      // every act after the first mixes behaviors and has elemental damage
      const kinds = new Set(a.monsters.map((k) => MONSTERS[k].behavior));
      expect(kinds.size).toBeGreaterThanOrEqual(2);
      if (a.n > 1) expect(a.monsters.some((k) => MONSTERS[k].elem !== "phys")).toBe(true);
    }
    expect(new Set(ARTIFACTS.map((a) => a.id)).size).toBe(4);
  });
  it("monster level climbs through every level and act", () => {
    for (let f = 2; f <= MAX_FLOOR; f++) expect(mlvlOf(f)).toBeGreaterThanOrEqual(mlvlOf(f - 1));
    for (let f = 6; f <= MAX_FLOOR; f++) expect(mlvlOf(f)).toBeGreaterThan(mlvlOf(f - 5));
    expect(mlvlOf(1)).toBe(1);
    expect([20, 40, 60, 80].map(mlvlOf)).toEqual([12, 24, 36, 49]);
  });
  it("levels spawn only their act's monsters, and level bosses get harder through the act", () => {
    const g = new Game(events, null, 5);
    for (const a of ACTS) {
      let lastHp = 0;
      let lastLvl = 0;
      for (let l = 1; l <= LEVELS_PER_ACT; l++) {
        const f = (a.n - 1) * LEVELS_PER_ACT + l;
        g.startFloor(f);
        for (const m of g.monsters) if (m !== g.boss) expect(a.monsters).toContain(m.def.kind);
        const b = g.boss!;
        expect(b.def.kind).toBe(l === LEVELS_PER_ACT ? a.finalBoss : a.levelBoss);
        if (l < LEVELS_PER_ACT) expect(b.def.name).toBe(bossName(a, l));
        expect(b.maxHp).toBeGreaterThan(lastHp);
        expect(b.mlvl).toBeGreaterThanOrEqual(lastLvl);
        lastHp = b.maxHp;
        lastLvl = b.mlvl;
      }
    }
  });
  it("pacing: a full clear of every level gives about 10-15 hero levels per act, a few above the monsters", () => {
    const g = new Game(events, null, 42);
    const p = g.player;
    const ends: number[] = [];
    for (let f = 1; f <= MAX_FLOOR; f++) {
      g.startFloor(f);
      for (const m of g.monsters) {
        p.xp += Math.max(1, Math.round(m.xp * xpPenalty(p.level, m.mlvl)));
        while (p.xp >= xpForLevel(p.level + 1)) p.level++;
      }
      expect(p.level - mlvlOf(f)).toBeGreaterThanOrEqual(-1);
      expect(p.level - mlvlOf(f)).toBeLessThanOrEqual(8);
      if (isFinalLevel(f)) ends.push(p.level);
    }
    const gains = ends.map((l, i) => l - (i ? ends[i - 1] : 1));
    for (const gn of gains) {
      expect(gn).toBeGreaterThanOrEqual(10);
      expect(gn).toBeLessThanOrEqual(16);
    }
  });
});

describe("final boss → artifact → next act", () => {
  it("killing the Act I final boss drops the Ember Heart and opens stairs to Act II", () => {
    const g = new Game(events, null, 11);
    g.startFloor(20);
    const b = g.boss!;
    expect(b.def.kind).toBe("lich");
    kill(g, b);
    const art = g.ground.find((x) => x.artifact);
    expect(art?.artifact).toBe("ember_heart");
    expect(g.stairs).not.toBeNull();
    expect(g.pickUp(art!)).toBe(true);
    expect(g.player.artifacts.map((a) => a.id)).toEqual(["ember_heart"]);
    expect(g.player.bag.some((e) => (e.item as { baseId: string }).baseId === "ember_heart")).toBe(false);
    g.descend();
    expect(g.floor).toBe(21);
    expect(actOf(g.floor)).toBe(2);
    expect(g.maxFloor).toBe(21);
    // a second kill doesn't drop a duplicate
    g.startFloor(20);
    kill(g, g.boss!);
    expect(g.ground.some((x) => x.artifact)).toBe(false);
  });
  it("artifacts are saved, exported and loaded", () => {
    const g = new Game(events, null, 3);
    g.player.artifacts.push({ id: "sun_scarab", at: 1700000000000, level: 22 });
    const code = save.exportCode(g.toSave());
    const back = migrateSave(save.importCode(code))!;
    expect(back.player.artifacts).toEqual([{ id: "sun_scarab", at: 1700000000000, level: 22 }]);
    const g2 = new Game(events, back);
    expect(g2.player.artifacts.length).toBe(1);
  });
  it("Malakar on the last level ends the game: no stairs, a victory", () => {
    const g = new Game(events, null, 8);
    g.startFloor(80);
    expect(g.boss!.def.kind).toBe("malakar");
    kill(g, g.boss!);
    expect(g.stairs).toBeNull();
    expect(g.victory).toBe(true);
    expect(g.ground.find((x) => x.artifact)?.artifact).toBe("cinder_crown");
  });
});

describe("save v6 migration", () => {
  it("a v5 hero deep in the old endless crypt keeps everything and stays in Act I", () => {
    const d = migrateSave(JSON.parse(JSON.stringify(v5)))!;
    expect(d.v).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(6);
    expect(d.floor).toBe(8); // old levels 1-20 are Act I levels 1-20
    expect(d.maxFloor).toBe(9);
    expect(d.player.artifacts).toEqual([]);
    expect(d.player.level).toBe(14);
    expect(d.player.gold).toBe(1234);
    expect(d.player.bag[0]).toMatchObject({ x: 3, y: 6 });
    expect(d.player.stash![0]).toMatchObject({ x: 9, y: 9 });
    const g = new Game(events, d);
    expect(g.maxFloor).toBe(9);
    g.travel(21);
    expect(g.inTown).toBe(true); // Act II isn't unlocked yet
    g.travel(5);
    expect(g.floor).toBe(5);
    // a hero from level 30 of the old crypt is held at Act I level 20 (the Ember Lich)
    const deep = migrateSave({ ...JSON.parse(JSON.stringify(v5)), floor: 30, maxFloor: 33 })!;
    expect([deep.floor, deep.maxFloor]).toEqual([20, 20]);
  });
  it("a v6 save with junk artifacts or floors is cleaned", () => {
    const d = migrateSave({ ...JSON.parse(JSON.stringify(v5)), v: 6, floor: 99, maxFloor: 99, player: { ...v5.player, artifacts: [{ id: "nope", at: 1, level: 1 }, { id: "mire_pearl", at: 2, level: 30 }, { id: "mire_pearl", at: 3, level: 31 }] } })!;
    expect(d.floor).toBe(80);
    expect(d.player.artifacts!.map((a) => a.id)).toEqual(["mire_pearl"]);
  });
});

describe("elemental damage", () => {
  it("resists cut elemental damage (capped at 75%), not physical", () => {
    const d = { res: { fire: 50, cold: 90, light: 0, poison: 0 } };
    expect(Game.afterRes(100, "fire", d)).toBe(50);
    expect(Game.afterRes(100, "cold", d)).toBe(25);
    expect(Game.afterRes(100, "phys", d)).toBe(100);
  });
  it("cold chills (slower run), poison deals damage over time", () => {
    const g = new Game(events, null, 2);
    g.startFloor(41);
    const d = g.derived();
    const before = d.speed;
    g.hurtPlayer({ ar: 1, mlvl: 1, dmgMin: 2, dmgMax: 2, elem: "cold", big: false }, d, false);
    expect(g.player.chillT).toBeGreaterThan(0);
    expect(g.derived().speed).toBeCloseTo(before * 0.65, 5);
    const hp0 = g.player.hp;
    g.hurtPlayer({ ar: 1, mlvl: 1, dmgMin: 30, dmgMax: 30, elem: "poison", big: false }, g.derived(), false);
    expect(g.player.poison.t).toBeGreaterThan(0);
    const hp1 = g.player.hp;
    expect(hp0 - hp1).toBe(10); // a third now
    for (let i = 0; i < 30; i++) g.update(0.1, { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] });
    expect(g.player.poison.t).toBe(0);
    void makeItem;
  });
});

describe("D2 skill level cap and rare affixes", () => {
  it("max hard points = 1 + (character level − required level)", async () => {
    const { skillCap, SKILL_BY_ID } = await import("../src/data/skills");
    expect(SKILL_BY_ID.frenzy.reqLvl).toBe(24);
    expect(skillCap(23, 24)).toBe(0);
    expect(skillCap(24, 24)).toBe(1);
    expect(skillCap(25, 24)).toBe(2);
    expect(skillCap(99, 1)).toBe(20);
    const g = new Game(events, null, 4);
    const p = g.player;
    p.level = 3;
    p.skillPoints = 10;
    expect(g.learn("bash")).toBe(true);
    expect(g.learn("bash")).toBe(true);
    expect(g.learn("bash")).toBe(true);
    expect(g.learn("bash")).toBe(false); // bash (level 1) caps at 3 for a level 3 hero
    expect(g.canLearn("bash").why).toMatch(/level 4/);
    p.level = 4;
    expect(g.learn("bash")).toBe(true);
  });
  it("migration refunds points above the cap", () => {
    const d = migrateSave({ ...JSON.parse(JSON.stringify(v5)), player: { ...v5.player, level: 5, skillPoints: 0, skills: { bash: 9 } } })!;
    expect(d.player.skills.bash).toBe(5);
    expect(d.player.skillPoints).toBe(4);
    expect(d.cappedPoints).toBe(4);
  });
  it("rares roll 3-4 affixes", async () => {
    const { rollAffixes } = await import("../src/data/affixes");
    for (let i = 0; i < 300; i++) {
      const n = rollAffixes("weapon", 20, "rare").aff.length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(4);
    }
  });
});

describe("v0.8 difficulty", () => {
  it("levels have champions and uniques with modifiers, more in later acts", () => {
    const g = new Game(events, null, 9);
    let early = 0, late = 0, uniq = 0;
    for (let f = 1; f <= 20; f++) { g.startFloor(f); early += g.monsters.filter((m) => m.elite).length; }
    for (let f = 61; f <= 80; f++) {
      g.startFloor(f);
      late += g.monsters.filter((m) => m.elite).length;
      for (const m of g.monsters.filter((x) => x.elite === 2)) {
        uniq++;
        expect(m.mods.length).toBe(3);
        expect(m.def.name).toMatch(/ the /);
      }
    }
    expect(early).toBeGreaterThan(10);
    expect(late).toBeGreaterThan(early);
    expect(uniq).toBeGreaterThan(10);
    g.startFloor(1);
    expect(g.monsters.some((m) => m.elite === 2)).toBe(false); // none on the very first levels
  });
  it("a unique is much tougher than its pack and drops better loot", () => {
    const g = new Game(events, null, 9);
    g.startFloor(45);
    const u = g.monsters.find((m) => m.elite === 2)!;
    const plain = g.monsters.find((m) => !m.elite && m.def.kind === u.def.kind && m.pack === u.pack);
    if (plain) expect(u.maxHp).toBeGreaterThan(plain.maxHp * 3.5);
    const before = g.ground.length;
    kill(g, u);
    const items = g.ground.slice(before).filter((x) => x.item);
    expect(items.length).toBe(1); // v0.9.1: one item (was 2), always magic or better
    expect(items.every((x) => x.item!.q === "magic" || x.item!.q === "rare")).toBe(true);
  });
  it("potions heal over time with a cooldown", () => {
    const g = new Game(events, null, 9);
    g.startFloor(2);
    const p = g.player;
    p.hpPots = 3;
    g.usePotion("hp");
    g.usePotion("hp");
    expect(p.hpPots).toBe(2);
    expect(g.potionWait("hp")).toBeGreaterThan(1);
  });
});
