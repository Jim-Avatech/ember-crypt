// v1.3.2: the Amazon doesn't dual wield (Diablo II rule); the Barbarian still does. Save migration never loses the item.
import { describe, expect, it } from "vitest";
import { makeItem } from "../src/data/items";
import { GAME_VERSION } from "../src/data/patchNotes";
import { AMAZON_OFFHAND_MSG, Game, type GameEvents } from "../src/game";
import { addItem } from "../src/inventory";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const hero = (cls: "amazon" | "barbarian") => {
  const g = new Game(events, null, 5, { cls, name: "" });
  g.player.level = 30;
  g.player.base.str = 200;
  g.player.base.dex = 200;
  return g;
};
const uidsOf = (es: { item: { uid: number } }[]) => es.map((e) => e.item.uid);
/** fill a bag or stash grid with small items (gems/rings) until nothing more fits */
const fill = (grid: Parameters<typeof addItem>[0], w?: number, h?: number) => {
  while (addItem(grid, makeItem("ring", 1), w, h));
};

describe("v1.3.2 version", () => {
  it("label", () => expect(GAME_VERSION).toBe("1.6"));
});

describe("v1.3.2 Amazon: one one-handed weapon, off-hand is a shield or quiver", () => {
  it("a one-hander only fits the main hand; the off-hand says why", () => {
    const g = hero("amazon");
    const sword = makeItem("sword", 5);
    expect(g.canDualWield()).toBe(false);
    expect(g.slotsFor(sword)).toEqual(["main"]);
    expect(g.equipError(sword, "off")).toBe(AMAZON_OFFHAND_MSG);
    expect(g.equipError(makeItem("javelin", 5), "off")).toBe(AMAZON_OFFHAND_MSG);
    expect(g.equipError(makeItem("throwing_knife", 5), "off")).toBe(AMAZON_OFFHAND_MSG);
    expect(g.equipError(makeItem("shield", 5), "off")).toBeNull();
    expect(g.compareSlots(sword)).toEqual(["main"]);
  });
  it("equip from the bag: refused in the off-hand, and Equip with no slot replaces the main hand", () => {
    const g = hero("amazon");
    const p = g.player;
    const shield = p.equip.off;
    const a = makeItem("sword", 5);
    addItem(p.bag, a);
    expect(g.equipFromBag(a.uid, "off")).toBe(AMAZON_OFFHAND_MSG);
    expect(p.equip.off).toBe(shield);
    expect(uidsOf(p.bag)).toContain(a.uid);
    delete p.equip.off; // even with an empty off-hand the default slot is the main hand
    expect(g.defaultSlot(a)).toBe("main");
    const oldMain = p.equip.main!;
    expect(g.equipFromBag(a.uid)).toBeNull();
    expect(p.equip.main).toBe(a);
    expect(p.equip.off).toBeUndefined();
    expect(uidsOf(p.bag)).toContain(oldMain.uid);
    expect(g.derived().dual).toBe(false);
  });
  it("moving the main-hand weapon to the off-hand (drag on the doll) is refused", () => {
    const g = hero("amazon");
    const p = g.player;
    delete p.equip.off;
    expect(g.swapEquip("main", "off")).toBe(AMAZON_OFFHAND_MSG);
    expect(p.equip.off).toBeUndefined();
    expect(p.equip.main).toBeTruthy();
  });
  it("a bow with a quiver, and a javelin with a shield, still work", () => {
    const g = hero("amazon");
    const p = g.player;
    const bow = makeItem("long_bow", 5);
    const q = makeItem("arrows", 1);
    addItem(p.bag, bow);
    addItem(p.bag, q);
    expect(g.equipFromBag(bow.uid)).toBeNull();
    expect(g.equipFromBag(q.uid)).toBeNull();
    expect(p.equip.off).toBe(q);
    expect(g.derived().hands.length).toBe(1);
  });
  it("DPS: never dual-wield math, even if an off-hand weapon slipped in (shield-hand weapon is ignored)", () => {
    const g = hero("amazon");
    const p = g.player;
    p.equip.main = makeItem("sword", 5);
    delete p.equip.off;
    const one = g.derived();
    p.equip.off = makeItem("sword", 5); // impossible through the game; derived() must still ignore it
    const d = g.derived();
    expect(d.dual).toBe(false);
    expect(d.hands.length).toBe(1);
    expect(d.dps).toBeCloseTo(one.dps, 6);
    expect(g.previewEquip(makeItem("axe", 5), "off").dual).toBe(false);
    expect(g.weaponDps(makeItem("axe", 5))!.dps).toBeGreaterThan(0);
  });
  it("attacks and skills use one hand: swings, Jab and throws never touch the off-hand", () => {
    const g = hero("amazon");
    const p = g.player;
    g.goDungeon(2);
    p.equip.main = makeItem("javelin", 5);
    p.equip.off = makeItem("javelin", 5); // stale data: still never thrown or swung
    p.skills = { jab: 3, poison_javelin: 1 };
    p.mana = 999;
    const d = g.derived();
    for (let i = 0; i < 4; i++) {
      p.action = null;
      g.castBasic("basic_attack", d);
      const a = p.action as { hands?: number[] } | null;
      if (a?.hands) expect(a.hands.every((h) => h === 0)).toBe(true);
      p.action = null;
      g.castBasic("basic_throw", d);
      const t = p.action as { hands?: number[] } | null;
      if (t?.hands) expect(t.hands).toEqual([0]);
    }
    p.action = null;
    expect(g.castSkill("jab", d)).toBe(true);
    expect((p.action as unknown as { hands: number[] }).hands.every((h) => h === 0)).toBe(true);
  });
});

describe("v1.3.2 Barbarian keeps dual wield", () => {
  it("a one-hander goes in the off-hand and both hands attack", () => {
    const g = hero("barbarian");
    const p = g.player;
    expect(g.canDualWield()).toBe(true);
    const s = makeItem("sword", 5);
    addItem(p.bag, s);
    expect(g.slotsFor(s)).toEqual(["main", "off"]);
    expect(g.compareSlots(s)).toEqual(["main", "off"]);
    expect(g.equipFromBag(s.uid, "off")).toBeNull();
    expect(p.equip.off).toBe(s);
    expect(g.derived().dual).toBe(true);
    expect(g.swapEquip("off", "main")).toBeNull();
  });
});

describe("v1.3.2 save migration: an Amazon's off-hand weapon is moved, never deleted", () => {
  const amazonSave = (prep?: (g: Game) => void) => {
    const g = hero("amazon");
    g.player.equip.main = makeItem("javelin", 5);
    const off = makeItem("sword", 7);
    off.name = "Zach's Blade";
    g.player.equip.off = off;
    prep?.(g);
    return { save: JSON.parse(JSON.stringify(g.toSave())), off };
  };
  it("to the bag when there is room; a note says where", () => {
    const { save, off } = amazonSave();
    const g = new Game(events, save);
    expect(g.player.equip.off).toBeUndefined();
    expect(g.player.equip.main?.baseId).toBe("javelin");
    expect(uidsOf(g.player.bag)).toContain(off.uid);
    expect(g.placeUnclaimed()).toBe(false);
    const note = g.takeOffhandNote()!;
    expect(note).toMatch(/bag/);
    expect(note).toMatch(/dual wield/);
    expect(g.takeOffhandNote()).toBeNull(); // once
    // and it stays fixed after saving and loading again
    const g2 = new Game(events, JSON.parse(JSON.stringify(g.toSave())));
    expect(g2.player.equip.off).toBeUndefined();
    expect(uidsOf(g2.player.bag)).toContain(off.uid);
    expect(g2.takeOffhandNote()).toBeNull();
  });
  it("bag full: into the camp stash (the shared stash is marked changed)", () => {
    const { save, off } = amazonSave((g) => fill(g.player.bag));
    const g = new Game(events, save);
    expect(g.player.equip.off).toBeUndefined();
    expect(uidsOf(g.player.bag)).not.toContain(off.uid);
    expect(g.player.unclaimed!.map((i) => i.uid)).toEqual([off.uid]);
    const before = g.stashAt;
    expect(g.placeUnclaimed()).toBe(true);
    expect(uidsOf(g.player.stash)).toContain(off.uid);
    expect(g.player.unclaimed).toEqual([]);
    expect(g.stashAt).toBeGreaterThan(before);
    expect(g.ground.some((x) => x.item?.uid === off.uid)).toBe(false);
    expect(g.takeOffhandNote()).toMatch(/stash/);
  });
  it("bag and stash full: on the ground in camp, kept in the save until picked up", () => {
    const { save, off } = amazonSave((g) => {
      fill(g.player.bag);
      fill(g.player.stash, 10, 10);
    });
    const g = new Game(events, save);
    expect(g.placeUnclaimed()).toBe(false);
    const onGround = () => g.ground.filter((x) => x.item?.uid === off.uid);
    expect(onGround().length).toBe(1);
    expect(g.takeOffhandNote()).toMatch(/ground/);
    expect(g.toSave().player.unclaimed!.map((i) => i.uid)).toEqual([off.uid]);
    // leave and come back: it's on the ground again (once), and a reload keeps it too
    g.goDungeon(1);
    g.goTown(true);
    expect(onGround().length).toBe(1);
    g.placeUnclaimed();
    expect(onGround().length).toBe(1);
    const g2 = new Game(events, JSON.parse(JSON.stringify(g.toSave())));
    g2.placeUnclaimed();
    expect(g2.ground.filter((x) => x.item?.uid === off.uid).length).toBe(1);
    // make room and pick it up: it is hers again and no longer unclaimed
    g2.player.bag = [];
    expect(g2.pickUp(g2.ground.find((x) => x.item?.uid === off.uid)!)).toBe(true);
    expect(uidsOf(g2.player.bag)).toContain(off.uid);
    expect(g2.player.unclaimed).toEqual([]);
    expect(g2.toSave().player.unclaimed).toBeUndefined();
    const g3 = new Game(events, JSON.parse(JSON.stringify(g2.toSave())));
    g3.placeUnclaimed();
    expect(g3.ground.some((x) => x.item?.uid === off.uid)).toBe(false);
  });
  it("a shield or a quiver stays where it is; a Barbarian's off-hand weapon stays too", () => {
    const g = hero("amazon");
    const sh = g.player.equip.off!;
    const a = new Game(events, JSON.parse(JSON.stringify(g.toSave())));
    expect(a.player.equip.off?.uid).toBe(sh.uid);
    expect(a.takeOffhandNote()).toBeNull();
    const b = hero("barbarian");
    b.player.equip.main = makeItem("sword", 5);
    b.player.equip.off = makeItem("axe", 5);
    const bb = new Game(events, JSON.parse(JSON.stringify(b.toSave())));
    expect(bb.player.equip.off?.baseId).toBe("axe");
    expect(bb.derived().dual).toBe(true);
    expect(bb.takeOffhandNote()).toBeNull();
  });
  it("a thrown weapon (throwing knives) in an Amazon's off-hand is moved as well", () => {
    const g = hero("amazon");
    g.player.equip.main = makeItem("javelin", 5);
    const kn = makeItem("throwing_knife", 5);
    g.player.equip.off = kn;
    const a = new Game(events, JSON.parse(JSON.stringify(g.toSave())));
    expect(a.player.equip.off).toBeUndefined();
    expect(uidsOf(a.player.bag)).toContain(kn.uid);
  });
});
