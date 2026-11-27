// v1.6.3: Charged Bolt 45° cone, D2-style +skills (an item grants a skill you have no points in), potion stacks that
// fill the belt by themselves.
import { describe, expect, it } from "vitest";
import { makeItem, type Item } from "../src/data/items";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import { Game, type GameEvents, type Monster, migrateSave } from "../src/game";
import { POT_STACK, potQty, stackPotions, type BagEntry } from "../src/inventory";
import { CB_CONE, CB_WANDER_MAX, type Missile } from "../src/spells";
import swSrc from "../public/sw.js?raw";
import spellsSrc from "../src/spells.ts?raw";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };
const deg = (r: number) => (r * 180) / Math.PI;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function trial(dist: number, lvl: number, withMonster = true) {
  const g = new Game(events, null, 7, { cls: "sorceress", name: "" });
  g.player.level = 30;
  g.player.skills = { charged_bolt: lvl };
  g.goDungeon(20);
  const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const proto = g.monsters.find((m) => m.def.rank === "normal")!;
  const p = g.player;
  p.x = R.cx + 0.5 - dist / 2; p.y = R.cy + 0.5; p.fx = 1; p.fy = 0;
  const m = { ...proto, id: 8e6, x: p.x + dist, y: p.y, state: "chase", kx: 0, ky: 0, stunT: 0, chillT: 0, frozenT: 0, hp: 1e6, maxHp: 1e6, fuse: -1 } as Monster;
  m.def = { ...proto.def, speed: 0, dmgMin: 0, dmgMax: 0, behavior: "melee", specials: undefined, shot: undefined } as Monster["def"];
  g.monsters = withMonster ? [m] : [];
  let hits = 0;
  const eh = g.elemHit.bind(g);
  g.elemHit = (mm, d, e, o) => { hits++; eh(mm, d, e, o); };
  p.mana = 1e5; p.action = null;
  const launch: number[] = [];
  const push = g.spells.push.bind(g.spells);
  g.spells.push = (...xs) => { for (const s of xs) if (s.k === "missile" && s.id === "charged_bolt") launch.push(Math.atan2(s.vy, s.vx)); return push(...xs); };
  g.castSkill("charged_bolt", g.derived());
  const devs: number[] = [];
  const inCone: boolean[] = [];
  const seen = new Set<Missile>();
  for (let t = 0; t < 2; t += 1 / 60) {
    p.hp = 1e4;
    g.update(1 / 60, idle);
    m.x = p.x + dist; m.y = p.y; m.kx = 0; m.ky = 0;
    for (const s of g.spells) {
      if (s.k !== "missile" || s.id !== "charged_bolt") continue;
      seen.add(s);
      devs.push(Math.abs(wrap(Math.atan2(s.vy, s.vx) - s.home!.ang)));
      if (Math.hypot(s.x - p.x, s.y - p.y) > 1.5) inCone.push(Math.abs(wrap(Math.atan2(s.y - p.y, s.x - p.x))) <= CB_CONE + 0.05);
    }
  }
  return { hits, launch, devs, inCone, n: seen.size };
}

function sorc(level = 30, skills: Record<string, number> = {}) {
  const g = new Game(events, null, 7, { cls: "sorceress", name: "" });
  g.player.level = level;
  g.player.skills = { ...skills };
  g.player.base.str = 60;
  g.player.slots = [null, null, null];
  g.player.mainAtk = null;
  return g;
}
const wand = (mods: Item["mods"], ilvl = 10): Item => ({ ...makeItem("wand", ilvl), q: "magic", mods });
function giveAndEquip(g: Game, it: Item, slot?: "main" | "head") {
  g.player.bag.push({ item: it, x: 9, y: 6 });
  const err = g.equipFromBag(it.uid, slot);
  expect(err).toBeNull();
}

describe("v1.6.3 release", () => {
  it("version, patch note, cache v36", () => {
    expect(GAME_VERSION).toBe("1.7");
    expect(PATCH_NOTES.some((q) => q.version === "1.6.3")).toBe(true);
    const t = PATCH_NOTES.find((q) => q.version === "1.6.3")!.notes.join(" ");
    expect(t).toMatch(/Charged Bolt/);
    expect(t).toMatch(/potion/i);
    expect(t).toMatch(/\+1 to Frozen Armor|grant/i);
    expect(swSrc).toMatch(/ember-crypt-shell-v\d+/);
  });
});

describe("v1.6.3 Charged Bolt: 45° cone", () => {
  it("every bolt leaves within ±22.5° of the aim; wander bound scaled (33°)", () => {
    expect(deg(CB_CONE)).toBeCloseTo(22.5, 6);
    expect(deg(CB_WANDER_MAX)).toBeCloseTo(33, 6);
    let widest = 0;
    for (let i = 0; i < 40; i++) {
      const r = trial(6, 10);
      expect(r.n).toBe(8);
      for (const a of r.launch) {
        expect(Math.abs(deg(a))).toBeLessThanOrEqual(23);
        widest = Math.max(widest, Math.abs(deg(a)));
      }
    }
    expect(widest).toBeGreaterThan(17); // the outer bolts really use the wider cone
  });
  it("still wanders, headings stay within cone + wander bound; mostly inside the cone", () => {
    let all: number[] = [], cone: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      const r = trial(6, 10, false);
      all = all.concat(r.devs);
      cone = cone.concat(r.inCone);
    }
    expect(Math.max(...all)).toBeLessThanOrEqual(CB_CONE + CB_WANDER_MAX + 1e-6);
    expect(all.filter((d) => d > 0.1).length / all.length).toBeGreaterThan(0.3);
    expect(cone.filter(Boolean).length / cone.length).toBeGreaterThan(0.8);
  });
  it("fewer bolts find one monster than with the 30° cone (v1.6.2: ~78% at 3 tiles, ~60% at 6)", () => {
    const avg = (d: number, lvl: number) => { let s = 0; for (let i = 0; i < 200; i++) s += trial(d, lvl).hits; return s / 200; };
    const a3 = avg(3, 10), a6 = avg(6, 10), b3 = avg(3, 1), b6 = avg(6, 1);
    console.log(`HITS lvl10 3t ${a3.toFixed(2)}/8 6t ${a6.toFixed(2)}/8; lvl1 3t ${b3.toFixed(2)}/3 6t ${b6.toFixed(2)}/3`);
    expect(a3 / 8).toBeGreaterThan(0.5);
    expect(a3 / 8).toBeLessThan(0.75);
    expect(a6 / 8).toBeGreaterThan(0.4);
    expect(a6 / 8).toBeLessThan(0.62);
    expect(b6 / 3).toBeGreaterThan(0.35);
    expect(b6 / 3).toBeLessThan(0.68);
  }, 120000);
  it("Spell DPS assumes half the bolts hit (was 0.6)", () => {
    expect(spellsSrc).toMatch(/chargedBoltN\(lvl\) \* 0\.5\) \/ per/);
  });
});

describe("v1.6.3 +skills like D2", () => {
  it("'+1 to Frozen Armor' grants the skill with no points; usable; goes on an empty button", () => {
    const g = sorc(10);
    expect(g.skillLevel("frozen_armor")).toBe(0);
    giveAndEquip(g, wand([{ s: "skill", v: 1, sk: "frozen_armor" }]));
    expect(g.hardLevel("frozen_armor")).toBe(0);
    expect(g.skillLevel("frozen_armor")).toBe(1);
    expect(g.player.slots).toContain("frozen_armor");
    g.player.mana = 100;
    expect(g.castSkill("frozen_armor", g.derived())).toBe(true);
  });
  it("needs the skill's level requirement and the hero's class", () => {
    const g = sorc(5);
    giveAndEquip(g, wand([{ s: "skill", v: 2, sk: "fire_ball" }, { s: "skill", v: 1, sk: "bash" }], 4)); // Fire Ball needs 12
    expect(g.skillLevel("fire_ball")).toBe(0);
    expect(g.skillLevel("bash")).toBe(0);
    g.player.level = 12;
    expect(g.skillLevel("fire_ball")).toBe(2);
  });
  it("+tree and +class levels only add to skills the hero has (points or a single-skill grant)", () => {
    const g = sorc(30, { fire_bolt: 1 });
    giveAndEquip(g, wand([{ s: "tabsk", v: 2, sk: "fire" }, { s: "clsk", v: 1, sk: "sorceress" }]));
    expect(g.skillLevel("fire_bolt")).toBe(4);
    expect(g.skillLevel("warmth")).toBe(0);
    expect(g.skillLevel("fire_ball")).toBe(0);
    expect(g.skillLevel("frozen_armor")).toBe(0);
    g.player.equip.head = { ...makeItem("helm", 10), q: "magic", mods: [{ s: "skill", v: 1, sk: "warmth" }] };
    expect(g.skillLevel("warmth")).toBe(4); // granted 1 + tree 2 + class 1
  });
  it("a granted skill doesn't open the skills after it", () => {
    const g = sorc(30);
    g.player.skillPoints = 5;
    giveAndEquip(g, wand([{ s: "skill", v: 3, sk: "fire_bolt" }]));
    expect(g.skillLevel("fire_bolt")).toBe(3);
    expect(g.canLearn("fire_ball").ok).toBe(false);
    expect(g.canLearn("fire_bolt").ok).toBe(true); // putting a real point in still works
  });
  it("taking the item off removes the skill from its button and from ⚔", () => {
    const g = sorc(10);
    const w = wand([{ s: "skill", v: 1, sk: "frozen_armor" }, { s: "skill", v: 1, sk: "fire_bolt" }]);
    giveAndEquip(g, w);
    g.setMainAtk("fire_bolt");
    expect(g.player.mainAtk).toBe("fire_bolt");
    expect(g.player.slots).toContain("frozen_armor");
    expect(g.unequip("main")).toBeNull();
    expect(g.skillLevel("frozen_armor")).toBe(0);
    expect(g.player.slots).not.toContain("frozen_armor");
    expect(g.player.mainAtk).toBeNull();
  });
  it("a learned skill keeps its button when a +skill item comes off", () => {
    const g = sorc(10, { frozen_armor: 1 });
    g.player.slots = ["frozen_armor", null, null];
    giveAndEquip(g, wand([{ s: "skill", v: 1, sk: "frozen_armor" }]));
    expect(g.skillLevel("frozen_armor")).toBe(2);
    g.unequip("main");
    expect(g.skillLevel("frozen_armor")).toBe(1);
    expect(g.player.slots[0]).toBe("frozen_armor");
  });
});

describe("v1.6.3 potions stack and fill the belt", () => {
  const pot = (k: "hp" | "mp", x: number, y: number, qty?: number): BagEntry => {
    const it = makeItem(k === "hp" ? "hp_potion" : "mp_potion");
    if (qty) it.qty = qty;
    return { item: it, x, y };
  };
  it("loose potions merge into stacks of up to 20 (count kept)", () => {
    const bag: BagEntry[] = [];
    for (let i = 0; i < 23; i++) bag.push(pot("hp", i % 10, Math.floor(i / 10)));
    bag.push(pot("mp", 5, 5), pot("mp", 6, 6, 3));
    stackPotions(bag);
    const hp = bag.filter((e) => e.item.baseId === "hp_potion");
    expect(hp.map((e) => potQty(e.item)).sort((a, b) => b - a)).toEqual([POT_STACK, 3]);
    expect(bag.filter((e) => e.item.baseId === "mp_potion").map((e) => potQty(e.item))).toEqual([4]);
  });
  it("old saves: loose bag and stash potions become stacks, nothing lost", () => {
    const g = sorc(10);
    g.player.hpPots = g.beltCap();
    g.player.bag = [pot("hp", 0, 0), pot("hp", 1, 0), pot("hp", 2, 0), pot("mp", 3, 0)];
    g.player.stash = [pot("mp", 0, 0), pot("mp", 0, 1)];
    const d = migrateSave(JSON.parse(JSON.stringify(g.toSave())))!;
    const bag = d.player.bag.filter((e) => e.item.baseId === "hp_potion");
    expect(bag.length).toBe(1);
    expect(potQty(bag[0].item)).toBe(3);
    expect((d.player.stash ?? []).filter((e) => e.item.baseId === "mp_potion").map((e) => potQty(e.item))).toEqual([2]);
  });
  it("picked-up potions go to the belt, then onto a stack (no new cell)", () => {
    const g = sorc(10);
    g.player.hpPots = g.beltCap() - 1;
    g.player.bag = [pot("hp", 0, 0, 5)];
    for (let i = 0; i < 3; i++) {
      g.dropAt(g.player.x, g.player.y, { item: makeItem("hp_potion") });
      g.pickUp(g.ground[g.ground.length - 1]);
    }
    expect(g.player.hpPots).toBe(g.beltCap());
    expect(g.player.bag.length).toBe(1);
    expect(potQty(g.player.bag[0].item)).toBe(7);
  });
  it("a stack picks up even with the backpack otherwise full", () => {
    const g = sorc(10);
    g.player.mpPots = g.beltCap();
    g.player.bag = [pot("mp", 0, 0, 2)];
    for (let x = 0; x < 10; x++) for (let y = 0; y < 8; y++) if (x || y) g.player.bag.push({ item: makeItem("ring", 5), x, y });
    g.dropAt(g.player.x, g.player.y, { item: makeItem("mp_potion") });
    expect(g.pickUp(g.ground[g.ground.length - 1])).toBe(true);
    expect(potQty(g.player.bag[0].item)).toBe(3);
  });
  it("drinking from the belt refills it from the stack; a bigger belt fills itself", () => {
    const g = sorc(10);
    g.player.hpPots = g.beltCap();
    g.player.bag = [pot("hp", 0, 0, 6)];
    g.usePotion("hp");
    expect(g.player.hpPots).toBe(g.beltCap());
    expect(potQty(g.player.bag[0].item)).toBe(5);
    const cap = g.beltCap();
    g.player.equip.belt = makeItem("belt", 30);
    expect(g.beltCap()).toBeGreaterThan(cap);
    g.update(1 / 60, idle);
    expect(g.player.hpPots).toBe(g.beltCap());
    expect(potQty(g.player.bag[0].item)).toBe(5 - (g.beltCap() - cap));
  });
  it("a stack sells whole", () => {
    const g = sorc(10);
    g.player.bag = [pot("hp", 0, 0, 4)];
    const gold = g.player.gold;
    const got = g.sell(g.player.bag[0].item.uid);
    expect(got).toBe(4 * Math.max(1, Math.floor(25 / 4)));
    expect(g.player.gold).toBe(gold + got);
    expect(g.player.bag.length).toBe(0);
  });
});
