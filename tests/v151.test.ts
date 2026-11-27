// v1.5.1: every level number the player sees counts 1-20 within the act; floors stay 1-80 inside the game.
import { describe, expect, it } from "vitest";
import { LEVELS_PER_ACT, MAX_FLOOR, actOf, floorName, levelInAct, whereLabel } from "../src/data/acts";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import { Game, type GameEvents } from "../src/game";
import uiSrc from "../src/ui.ts?raw";

describe("v1.5.1 version", () => {
  it("label and patch note", () => {
    expect(GAME_VERSION).toBe("1.6.2");
    expect(PATCH_NOTES.find((n) => n.version === "1.5.1")!.notes.join(" ")).toMatch(/Act 4 · Level 7/);
  });
  it("no patch note quotes an overall level number (21-80) as a level", () => {
    for (const n of PATCH_NOTES) for (const t of n.notes) expect(t.replace(/not “[^”]*”/g, ""), `v${n.version}`).not.toMatch(/\b[Ll]evels? (2[1-9]|[3-8][0-9])\b/);
  });
});

describe("v1.5.1 the map label: Act N · Level 1-20", () => {
  it("every floor 1-80", () => {
    for (let f = 1; f <= MAX_FLOOR; f++) {
      const l = whereLabel(f);
      expect(l).toBe(`Act ${actOf(f)} · Level ${((f - 1) % LEVELS_PER_ACT) + 1}`);
      const n = Number(l.split("Level ")[1]);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(20);
    }
    expect(whereLabel(67)).toBe("Act 4 · Level 7");
    expect(whereLabel(0)).toBe("Ember Camp");
  });
  it("internal floor math unchanged", () => {
    expect([actOf(67), levelInAct(67), MAX_FLOOR]).toEqual([4, 7, 80]);
  });
});

describe("v1.5.1 messages and screens", () => {
  it("Return to Town: the portal message names the act area and level within it", () => {
    const toasts: string[] = [];
    const ev: GameEvents = { sound() {}, toast: (t: string) => void toasts.push(t), changed() {}, died() {}, levelUp() {}, shake() {} };
    const g = new Game(ev, null, 3, { cls: "barbarian", name: "" });
    g.maxFloor = 80;
    g.goDungeon(67);
    expect(toasts.at(-1)).toMatch(/Level 7\/20/);
    expect(g.startRecall()).toBe(true);
    for (let i = 0; i < 600 && !g.inTown; i++) g.update(1 / 60, { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] });
    expect(g.inTown).toBe(true);
    const back = toasts.find((t) => /portal returns you/.test(t))!;
    expect(back).toContain(floorName(67));
    expect(back).toMatch(/Level 7\./);
    expect(back).not.toMatch(/67/);
    // and the way back
    const p = g.player;
    p.x = g.portal!.x;
    p.y = g.portal!.y;
    expect(g.usePortal()).toBe(true);
    expect(toasts.at(-1)).toBe(floorName(67));
    expect(g.floor).toBe(67);
  });
  it("Character screen and save import show the deepest level per act (no raw maxFloor)", () => {
    expect(uiSrc).toContain("${p.kills} · ${whereLabel(g.maxFloor)}");
    expect(uiSrc).toContain("deepest ${whereLabel(pend.maxFloor)}");
    expect(uiSrc).not.toMatch(/\$\{g\.maxFloor\}/);
  });
});
