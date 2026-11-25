import { describe, expect, it } from "vitest";
import { makeItem } from "../src/data/items";
import { Game, type GameEvents, SAVE_VERSION, migrateSave } from "../src/game";
import { GRID_H, GRID_W, STASH_H, STASH_W, addItem, fits, moveItem } from "../src/inventory";
import * as save from "../src/save";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };

const v4 = {
  v: 4, seed: 9, floor: 3, maxFloor: 3,
  player: {
    level: 9, xp: 5000, base: { str: 40, dex: 25, vit: 30, ene: 10 }, statPoints: 0, skillPoints: 0, skills: { bash: 3 }, slots: ["bash", null, null],
    gold: 777, hpPots: 2, mpPots: 1, kills: 120, equip: { main: { uid: 1, baseId: "axe", ilvl: 8 } },
    bag: [
      { item: { uid: 2, baseId: "sword", ilvl: 5 }, x: 0, y: 1 },
      { item: { uid: 3, baseId: "ring", ilvl: 6, q: "magic", name: "Ring of Life", mods: [{ s: "life", v: 9 }] }, x: 9, y: 3 },
      { item: { uid: 4, baseId: "armor", ilvl: 7 }, x: 4, y: 0 },
    ],
  },
};

describe("bigger backpack (10×8)", () => {
  it("is 80 cells and a full old 10×4 bag still has room for 40 more", () => {
    expect(GRID_W * GRID_H).toBe(80);
    const bag: { item: ReturnType<typeof makeItem>; x: number; y: number }[] = [];
    let n = 0;
    while (addItem(bag, makeItem("ring", 1))) n++;
    expect(n).toBe(80);
  });
  it("tall items can go in the new rows; drag/move rules still apply", () => {
    const bag: { item: ReturnType<typeof makeItem>; x: number; y: number }[] = [];
    const jav = makeItem("javelin", 1); // 1×4
    bag.push({ item: jav, x: 0, y: 0 });
    expect(moveItem(bag, jav.uid, 0, 4)).toBe(true);
    expect(moveItem(bag, jav.uid, 0, 5)).toBe(false); // would hang off the bottom
    expect(fits(bag, 1, 4, 0, 4)).toBe(false);
    expect(fits(bag, 1, 4, 1, 4)).toBe(true);
  });
  it("migrating a v4 save keeps every item exactly where it was and adds an empty stash", () => {
    const d = migrateSave(JSON.parse(JSON.stringify(v4)))!;
    expect(d.v).toBe(SAVE_VERSION);
    expect(d.player.bag.map((e) => [e.item.uid, e.x, e.y])).toEqual([[2, 0, 1], [3, 9, 3], [4, 4, 0]]);
    expect(d.player.stash).toEqual([]);
    expect(d.player.bag[1].item.mods![0].v).toBe(9);
  });
});

describe("camp stash", () => {
  it("is 10×10 and moves items both ways, only in town", () => {
    expect(STASH_W * STASH_H).toBe(100);
    const g = new Game(events, migrateSave(JSON.parse(JSON.stringify(v4))));
    expect(g.inTown).toBe(true);
    expect(g.toStash(4, 3, 2)).toBeNull();
    expect(g.player.stash).toEqual([expect.objectContaining({ x: 3, y: 2 })]);
    expect(g.player.bag.some((e) => e.item.uid === 4)).toBe(false);
    expect(g.toStash(2, 3, 2)).toBe("It doesn't fit there"); // overlaps the armor
    expect(g.toStash(2)).toBeNull(); // first free spot
    expect(g.moveInStash(2, 9, 7)).toBe(true);
    expect(g.moveInStash(2, 9, 8)).toBe(false); // 1×3 sword would hang off
    expect(g.fromStash(4, 6, 4)).toBeNull();
    expect(g.player.bag.find((e) => e.item.uid === 4)).toMatchObject({ x: 6, y: 4 });
    g.goDungeon(1);
    expect(g.toStash(4)).toBe("The stash is in Ember Camp");
    expect(g.fromStash(2)).toBe("The stash is in Ember Camp");
    expect(g.moveInStash(2, 0, 0)).toBe(false);
  });
  it("is saved with the hero, survives export/import, and the chest is in camp", () => {
    const g = new Game(events, null, 3);
    g.player.stash.push({ item: makeItem("great_sword", 12), x: 2, y: 3 });
    const code = save.exportCode(g.toSave());
    const back = save.importCode(code)!;
    expect(back.player.stash![0]).toMatchObject({ x: 2, y: 3, item: expect.objectContaining({ baseId: "great_sword" }) });
    const g2 = new Game(events, back);
    expect(g2.player.stash.length).toBe(1);
    expect(g2.level.stash).toBeTruthy();
    expect(g2.level.props.some((p) => p.kind === "chest")).toBe(true);
    // walking up offers the stash
    g2.player.x = g2.level.stash!.x + 1.1;
    g2.player.y = g2.level.stash!.y;
    expect(g2.contextAction()).toBe("stash");
  });
});
