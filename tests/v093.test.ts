import { describe, expect, it } from "vitest";
import { SKILL_SLOTS } from "../src/data/skills";
import { BOSS_HP_EXTRA, Game, type GameEvents, MON_DMG, MON_HP, migrateSave } from "../src/game";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };

describe("v0.9.3: only three skill buttons anywhere", () => {
  it("assigning to a 4th button is refused and never grows the slot list", () => {
    const g = new Game(events, null, 3);
    g.player.skills = { bash: 1 };
    g.assignSlot(3, "bash");
    g.assignSlot(7, "bash");
    g.assignSlot(-1, "bash");
    expect(g.player.slots.length).toBe(3);
    expect(g.player.slots.includes("bash")).toBe(false);
    g.assignSlot(2, "bash");
    expect(g.player.slots).toEqual([null, null, "bash"]);
    expect(g.toSave().player.slots.length).toBe(SKILL_SLOTS);
  });
  it("a save holding a 4th button value is cleaned on load and on save, the skill stays learned", () => {
    const g = new Game(events, null, 3);
    const s = g.toSave();
    s.player.level = 20;
    s.player.skills = { bash: 2, double_swing: 1, frenzy: 1, howl: 1 } as Record<string, number>;
    s.player.slots = ["bash", null, "frenzy", "howl"] as (string | null)[];
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.player.slots).toEqual(["bash", null, "frenzy"]);
    const g2 = new Game(events, m);
    expect(g2.player.skills.howl).toBe(1);
    expect(g2.toSave().player.slots).toEqual(["bash", null, "frenzy"]);
  });
});

describe("v0.9.3 difficulty", () => {
  it("monsters: life x1.69 and damage x1.875 vs v0.9.1; bosses 1.9x v0.9.2 life", () => {
    expect(MON_HP).toBeCloseTo(1.3 * 1.3);
    expect(MON_DMG).toBeCloseTo(1.25 * 1.5);
    expect(1.3 * BOSS_HP_EXTRA).toBeCloseTo(1.9);
  });
});
