// v1.9: "+skill" bonuses only roll on items that fit the skill's tree (TREE_FIT), and a second weapon set with swap.
import { describe, expect, it } from "vitest";
import { ITEM_BASES, BASE_BY_ID, makeItem, type Item, type Mod } from "../src/data/items";
import { classesFor, craftAffix, enchant, itemClassFor, modFitsBase, rollDrop, skillPoolFor } from "../src/data/affixes";
import { CLASS_TABS, HERO_CLASSES, SKILL_BY_ID, TAB_NAMES, TREE_FIT, type Tab, treeFitsBase } from "../src/data/skills";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import { Game, type GameEvents, migrateSave } from "../src/game";
import swSrc from "../public/sw.js?raw";

const toasts: string[] = [];
const events: GameEvents = { sound() {}, toast: (t) => void toasts.push(t), changed() {}, died() {}, levelUp() {}, shake() {} };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const skillMods = (it: Item): Mod[] => (it.mods ?? []).filter((m) => m.s === "skill" || m.s === "clsk" || m.s === "tabsk");
const equippable = ITEM_BASES.filter((b) => b.slot !== "potion" && b.slot !== "quiver" && b.slot !== "ring" || b.id === "ring");

describe("v1.9 release", () => {
  it("version, patch note, cache v44+", () => {
    expect(GAME_VERSION).toBe("1.9");
    expect(PATCH_NOTES[0].notes.join(" ")).toMatch(/weapon swap/i);
    expect(PATCH_NOTES[0].notes.join(" ")).toMatch(/skill/i);
    expect(swSrc).toMatch(/ember-crypt-shell-v4[4-9]/);
  });
});

describe("v1.9 one rule: a skill tree declares the items it can roll on", () => {
  it("every tree but Basic has an item, every weapon and orb base fits a tree, and the tree table is the only declaration", () => {
    for (const t of Object.keys(TAB_NAMES) as Tab[]) if (t !== "basic") expect(TREE_FIT[t].bases.length + TREE_FIT[t].slots.length).toBeGreaterThan(0);
    for (const b of ITEM_BASES.filter((x) => x.slot === "weapon" || x.kind === "orb")) expect(classesFor(b.id).length, b.id).toBeGreaterThan(0);
    for (const id of Object.values(TREE_FIT).flatMap((f) => f.bases)) expect(BASE_BY_ID[id], id).toBeTruthy();
  });

  it("the mapping: bows Bow & Crossbow, javelins/spears Javelin & Spear, Barbarian weapons and helms Barbarian trees, Sorceress items fire/cold/lightning, amulets all", () => {
    for (const id of ["short_bow", "long_bow"]) expect(HERO_CLASSES.flatMap((c) => CLASS_TABS[c]).filter((t) => treeFitsBase(t, id)), id).toEqual(["bow"]);
    for (const id of ["javelin", "spear"]) expect(HERO_CLASSES.flatMap((c) => CLASS_TABS[c]).filter((t) => treeFitsBase(t, id)), id).toEqual(["javelin"]);
    for (const id of ["sword", "axe", "mace", "great_sword", "quarterstaff", "throwing_knife", "throwing_axe", "helm"])
      expect(HERO_CLASSES.flatMap((c) => CLASS_TABS[c]).filter((t) => treeFitsBase(t, id, BASE_BY_ID[id].slot)), id).toEqual(["combat", "masteries", "warcries"]);
    for (const id of ["battle_staff", "wand", "orb"]) expect(HERO_CLASSES.flatMap((c) => CLASS_TABS[c]).filter((t) => treeFitsBase(t, id)), id).toEqual(["fire", "cold", "lightning"]);
    expect(HERO_CLASSES.flatMap((c) => CLASS_TABS[c]).filter((t) => t !== "basic" && treeFitsBase(t, "amulet", "amulet")).length).toBe(9);
    expect(classesFor("javelin")).toEqual(["amazon"]);
    expect(classesFor("amulet").length).toBe(3);
    expect(itemClassFor("spear", rnd, "sorceress")).toBe("amazon");
  });

  it("2 million skill rolls across drops, enchants and crafting: every +skill, +Class and +Tree fits its item", () => {
    let seen = { skill: 0, clsk: 0, tabsk: 0 };
    const check = (it: Item) => {
      for (const m of skillMods(it)) {
        seen[m.s as "skill"]++;
        expect(modFitsBase(m, it.baseId), `${it.baseId} ${m.s} ${m.sk}`).toBe(true);
      }
    };
    for (let i = 0; i < 20000; i++) {
      check(rollDrop(10 + Math.floor(rnd() * 90), 300, i % 3 === 0, rnd, HERO_CLASSES[i % 3]));
    }
    for (const b of equippable) {
      for (let i = 0; i < 400; i++) {
        const it = enchant(makeItem(b.id, 40 + (i % 40)), i % 2 ? "rare" : "magic", rnd, HERO_CLASSES[i % 3]);
        check(it);
        // crafting more onto it follows the same rule
        const c = makeItem(b.id, 60);
        for (let k = 0; k < 4; k++) if (craftAffix(c, rnd, HERO_CLASSES[(i + k) % 3]).ok) check(c);
      }
    }
    expect(seen.skill).toBeGreaterThan(200);
    expect(seen.clsk).toBeGreaterThan(100);
    expect(seen.tabsk).toBeGreaterThan(100);
  });

  it("the reported case: a javelin never rolls +Bow & Crossbow, a bow never rolls +Javelin & Spear", () => {
    let jav = 0, bow = 0;
    for (let i = 0; i < 3000; i++) {
      for (const m of skillMods(enchant(makeItem("javelin", 70), "rare", rnd, "amazon"))) if (m.s === "tabsk") { jav++; expect(m.sk).toBe("javelin"); }
      for (const m of skillMods(enchant(makeItem("long_bow", 70), "rare", rnd, "amazon"))) if (m.s === "tabsk") { bow++; expect(m.sk).toBe("bow"); }
    }
    expect(jav).toBeGreaterThan(20);
    expect(bow).toBeGreaterThan(20);
    for (const id of skillPoolFor("javelin")) expect(SKILL_BY_ID[id].tab).toBe("javelin");
  });

  it("old items keep an incompatible bonus (grandfathered): they load and are untouched, and are flagged by modFitsBase", () => {
    const old = makeItem("javelin", 50);
    old.q = "magic";
    old.mods = [{ s: "tabsk", v: 3, sk: "bow" }];
    old.aff = ["tabsk"];
    expect(modFitsBase(old.mods[0], "javelin")).toBe(false);
    const g = new Game(events, null, 3);
    g.player.bag = [{ item: old, x: 0, y: 0 }];
    const back = new Game(events, JSON.parse(JSON.stringify(g.toSave())), 3);
    expect(back.player.bag[0].item.mods).toEqual([{ s: "tabsk", v: 3, sk: "bow" }]);
  });
});

/** a hero with set I = axe + shield, set II = a bow and quiver */
function swapHero(cls: "barbarian" | "amazon" = "amazon") {
  const g = new Game(events, null, 9, { cls, name: "Swapper" });
  g.player.level = 30;
  g.player.base = { str: 120, dex: 120, vit: 60, ene: 20 };
  g.player.equip = cls === "amazon" ? { main: makeItem("javelin", 20), off: makeItem("shield", 5) } : { main: makeItem("axe", 20), off: makeItem("shield", 5) };
  g.player.altSet = { main: makeItem("long_bow", 20), off: makeItem("arrows", 1) };
  return g;
}
const swapNow = (g: Game) => { g.time += Game.SWAP_CD + 0.01; return g.swapWeapons(); };

describe("v1.9 weapon swap", () => {
  it("swap exchanges main hand and off-hand with the other set, and back", () => {
    const g = swapHero();
    const [jav, shield, bow, quiver] = [g.player.equip.main!, g.player.equip.off!, g.player.altSet!.main!, g.player.altSet!.off!];
    expect(g.swapWeapons()).toBeNull();
    expect(g.player.equip.main).toBe(bow);
    expect(g.player.equip.off).toBe(quiver);
    expect(g.player.altSet).toEqual({ main: jav, off: shield });
    expect(g.player.weaponSet).toBe(1);
    expect(swapNow(g)).toBeNull();
    expect(g.player.equip.main).toBe(jav);
    expect(g.player.equip.off).toBe(shield);
    expect(g.player.weaponSet ?? 0).toBe(0);
  });

  it("a short cooldown, then it works again; not while dead", () => {
    const g = swapHero();
    expect(g.swapWeapons()).toBeNull();
    expect(g.swapWait()).toBeGreaterThan(0.9);
    const m = g.player.equip.main;
    expect(g.swapWeapons()).toBe("Swapping…");
    expect(g.player.equip.main).toBe(m);
    step(g, Game.SWAP_CD + 0.1);
    expect(g.swapWait()).toBe(0);
    expect(g.swapWeapons()).toBeNull();
    g.player.dead = true;
    g.time += 5;
    expect(g.swapWeapons()).toBe("You can't swap now");
  });

  it("stats, damage and the main attack follow the active set (a bow shoots, a javelin throws)", () => {
    const g = swapHero();
    const dJav = g.derived();
    expect(g.mainBasic()).not.toBe("basic_shoot");
    swapNow(g);
    const dBow = g.derived();
    expect(g.mainBasic()).toBe("basic_shoot");
    expect(dBow.weaponKind).toBe("bow");
    expect(dJav.weaponKind).toBe("spear");
    expect(dBow.dps).not.toBe(dJav.dps);
    expect(dBow.def).toBeLessThan(dJav.def); // the shield stays in set I
  });

  it("+skills and strength from gear in the other set only count once it is active", () => {
    const g = swapHero("barbarian");
    const bash = makeItem("great_sword", 20);
    bash.q = "magic";
    bash.mods = [{ s: "str", v: 9 }, { s: "skill", v: 2, sk: "bash" }];
    g.player.altSet = { main: bash };
    const s0 = g.stats().str;
    expect(g.grantedLevel("bash")).toBe(0);
    swapNow(g);
    expect(g.stats().str).toBe(s0 + 9);
    expect(g.grantedLevel("bash")).toBe(2);
    swapNow(g);
    expect(g.stats().str).toBe(s0);
    expect(g.grantedLevel("bash")).toBe(0);
  });

  it("saved per hero: both sets and the active one survive a save, and old saves without sets load", () => {
    const g = swapHero();
    swapNow(g);
    const save = JSON.parse(JSON.stringify(g.toSave()));
    expect(save.player.weaponSet).toBe(1);
    expect(save.player.altSet.main.baseId).toBe("javelin");
    const h = new Game(events, save, 9);
    expect(h.player.equip.main!.baseId).toBe("long_bow");
    expect(h.player.altSet!.main!.baseId).toBe("javelin");
    expect(h.player.weaponSet).toBe(1);
    // a hero who never used it saves nothing new
    const plain = new Game(events, null, 4);
    const ps = JSON.parse(JSON.stringify(plain.toSave()));
    expect(ps.player.altSet).toBeUndefined();
    expect(ps.player.weaponSet).toBeUndefined();
    expect(new Game(events, migrateSave(ps)!, 4).hasAltSet()).toBe(false);
  });

  it("a damaged save: unknown items in set II are dropped, bad weaponSet ignored", () => {
    const save = JSON.parse(JSON.stringify(new Game(events, null, 4).toSave()));
    save.player.altSet = { main: { uid: 1, baseId: "nonsense" }, off: { uid: 2, baseId: "shield", ilvl: 3 } };
    save.player.weaponSet = 7;
    const d = migrateSave(save)!;
    expect(d.player.altSet).toEqual({ off: { uid: 2, baseId: "shield", ilvl: 3 } });
    expect(d.player.weaponSet).toBeUndefined();
    save.player.altSet = "junk";
    expect(migrateSave(save)!.player.altSet).toBeUndefined();
  });

  it("an Amazon's off-hand weapon in set II moves to the bag on load, a 2-hander's off-hand too (never deleted)", () => {
    const save = JSON.parse(JSON.stringify(swapHero().toSave()));
    save.player.altSet = { main: makeItem("great_sword", 5), off: makeItem("sword", 5) };
    const h = new Game(events, migrateSave(save)!, 9);
    expect(h.player.altSet!.off).toBeUndefined();
    expect(h.player.bag.some((e) => e.item.baseId === "sword")).toBe(true);
  });

  it("editing the other set through the bag (withAlt): equip into set II, nothing else moves, vitals and hotbar untouched, saves hold the real hands", () => {
    const g = swapHero("barbarian");
    const hp = g.player.hp;
    const mace = makeItem("mace", 10);
    g.player.bag.push({ item: mace, x: 0, y: 7 });
    const real = { main: g.player.equip.main, off: g.player.equip.off };
    g.withAlt(() => {
      expect(g.player.equip.main!.baseId).toBe("long_bow");
      expect(g.toSave().player.equip.main!.baseId).toBe("axe"); // saved while viewing: still the real hands
      expect(g.equipFromBag(mace.uid, "main")).toBeNull();
    });
    expect(g.player.equip.main).toBe(real.main);
    expect(g.player.equip.off).toBe(real.off);
    expect(g.player.altSet!.main).toBe(mace);
    expect(g.player.hp).toBe(hp);
    expect(g.player.bag.some((e) => e.item.baseId === "long_bow")).toBe(true); // the bow it replaced went to the bag
    expect(g.viewing).toBe(false);
  });

  it("an exception inside withAlt still puts the hands back", () => {
    const g = swapHero();
    const m = g.player.equip.main;
    expect(() => g.withAlt(() => { throw new Error("x"); })).toThrow();
    expect(g.player.equip.main).toBe(m);
    expect(g.viewing).toBe(false);
  });

  it("an attack in progress is cut off by a swap, and the next frames run on the new weapon without errors", () => {
    const g = swapHero();
    g.player.action = { type: "swing", skill: null, t: 0, dur: 1, hitAt: [0.5], hands: [0], hitsDone: 0, target: null } as never;
    swapNow(g);
    expect(g.player.action).toBeNull();
    for (let i = 0; i < 60; i++) g.update(1 / 30, { ...idle, attack: true });
  });
});

function step(g: Game, s: number) { for (let i = 0; i < Math.round(s * 30); i++) g.update(1 / 30, idle); }
