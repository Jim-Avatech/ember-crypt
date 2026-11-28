// v1.9.1: melee reach is a data-driven property of each weapon type, sized to the weapon, and a Great Sword
// reaches at least as far as the biggest non-boss melee monster.
import { describe, expect, it } from "vitest";
import { ITEM_BASES, UNARMED_REACH, meleeHitDist, weaponReachOf, makeItem } from "../src/data/items";
import { MONSTERS, type MonsterDef } from "../src/data/monsters";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import { Game, type GameEvents, type Monster } from "../src/game";
import gameSrc from "../src/game.ts?raw";
import swSrc from "../public/sw.js?raw";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const HERO_R = 0.28;
const reachOf = (id: string) => weaponReachOf(id);

/** non-boss monsters that swing or charge in melee (not shots, not suicides) */
const meleeMonsters = (): MonsterDef[] =>
  Object.values(MONSTERS).filter((d) => d.rank === "normal" && d.behavior !== "ranged" && d.behavior !== "exploder");

describe("v1.9.1 release", () => {
  it("version, patch note, cache v45+", () => {
    expect(GAME_VERSION).toBe("1.9.1");
    expect(PATCH_NOTES[0].notes.join(" ")).toMatch(/reach/i);
    expect(PATCH_NOTES[0].notes.join(" ")).toMatch(/Great Sword|greatsword|great sword/i);
    expect(swSrc).toMatch(/ember-crypt-shell-v4[5-9]/);
  });
});

describe("v1.9.1 weapon reach is data-driven and fits the weapon's size", () => {
  it("every weapon type declares a reach, and the values follow one size order for every class", () => {
    const weapons = ITEM_BASES.filter((b) => b.slot === "weapon");
    for (const b of weapons) expect(b.reach, b.id).toBeGreaterThan(0);
    // dagger / throwing knife short < wand / throwing axe < sword / axe / mace < javelin < staffs < great sword < spear
    expect(reachOf("throwing_knife")).toBeLessThan(reachOf("wand"));
    expect(reachOf("wand")).toBeLessThan(reachOf("throwing_axe"));
    expect(reachOf("throwing_axe")).toBeLessThan(reachOf("sword"));
    expect(reachOf("sword")).toBe(reachOf("axe"));
    expect(reachOf("axe")).toBe(reachOf("mace"));
    expect(reachOf("sword")).toBeLessThan(reachOf("javelin"));
    expect(reachOf("javelin")).toBeLessThan(reachOf("quarterstaff"));
    expect(reachOf("quarterstaff")).toBe(reachOf("battle_staff"));
    expect(reachOf("quarterstaff")).toBeLessThan(reachOf("great_sword"));
    expect(reachOf("great_sword")).toBeLessThan(reachOf("spear")); // the spear stays the longest reach weapon
    expect(reachOf("throwing_knife")).toBe(0.7);
    expect(reachOf("sword")).toBe(0.95);
    expect(reachOf("great_sword")).toBe(1.35);
    expect(reachOf("spear")).toBe(1.5);
    expect(weaponReachOf(undefined)).toBe(UNARMED_REACH);
  });

  it("a Great Sword reaches at least as far as the biggest non-boss melee monster", () => {
    const mons = meleeMonsters();
    expect(mons.length).toBeGreaterThan(5);
    const maxReach = Math.max(...mons.map((d) => d.reach));
    const biggest = mons.filter((d) => d.reach === maxReach).map((d) => `${d.name} (${d.reach})`);
    expect(reachOf("great_sword"), `GS ${reachOf("great_sword")} vs ${biggest.join(", ")}`).toBeGreaterThanOrEqual(maxReach);
    // a knight's landed swing includes a 0.35-tile grace; the greatsword must still reach that far
    const grace = 0.35;
    for (const d of mons) {
      const theyHit = meleeHitDist(d.reach, d.radius, HERO_R) + grace;
      const weHit = meleeHitDist(reachOf("great_sword"), d.radius, HERO_R);
      expect(weHit, `${d.name}: GS ${weHit} vs their landed reach ${theyHit}`).toBeGreaterThanOrEqual(theyHit);
    }
    expect(maxReach).toBe(0.9); // Doom Knight / Rime Revenant — lock the audit
  });

  it("skills and auto-approach use the active weapon's reach (no class hard-coding)", () => {
    const g = new Game(events, null, 4);
    g.player.level = 40;
    g.player.base = { str: 200, dex: 80, vit: 40, ene: 10 };
    g.player.equip.main = makeItem("great_sword", 20);
    expect(g.weaponReach()).toBe(1.35);
    g.player.equip.main = makeItem("sword", 10);
    expect(g.weaponReach()).toBe(0.95);
    g.player.equip.main = makeItem("spear", 10);
    expect(g.weaponReach()).toBe(1.5);
    expect(gameSrc).toMatch(/weaponReach\(\) \+ 1\.45/);
    expect(gameSrc).toMatch(/handReach\(d, hand\)/);
    expect(gameSrc).toMatch(/longestReach\(d\)/);
    expect(gameSrc).not.toMatch(/0\.95 \+ this\.reachBonus/);
    expect(gameSrc).toMatch(/meleeHitDist\(this\.longestReach\(d\), m\.def\.radius, p\.r\)/);
  });

  it("in the real loop a Great Sword hits a Doom Knight standing at the knight's own landed reach, a Sword does not", () => {
    const g = new Game(events, null, 4);
    g.startFloor(61);
    for (const mon of g.monsters) mon.state = "dead";
    g.boss = null;
    const m = g.monsters[0];
    m.state = "idle";
    m.hp = m.maxHp = 10_000;
    m.def = { ...m.def, kind: "knight", name: "Doom Knight", behavior: "charger", reach: 0.9, radius: 0.36, rank: "normal" };
    const theyLand = meleeHitDist(0.9, 0.36, HERO_R) + 0.35; // 1.89
    g.player.x = 10;
    g.player.y = 10;
    m.x = 10 + theyLand;
    m.y = 10;
    g.player.fx = 1;
    g.player.fy = 0;
    g.player.level = 40;
    g.player.base = { str: 200, dex: 80, vit: 80, ene: 10 };
    g.player.equip = { main: makeItem("sword", 30) };
    const swing = (g as unknown as { resolveMelee: (s: string | null, mon: Monster, d: ReturnType<Game["derived"]>, h: number) => void }).resolveMelee.bind(g);
    swing(null, m, g.derived(), 0);
    expect(m.hp).toBe(10_000); // sword missed
    g.player.equip = { main: makeItem("great_sword", 30) };
    swing(null, m, g.derived(), 0);
    expect(m.hp).toBeLessThan(10_000);
  });
});
