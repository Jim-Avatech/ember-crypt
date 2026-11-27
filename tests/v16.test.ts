// v1.6: the Diablo II Sorceress: class, three spell trees, spells through the real game loop, items and drops,
// buffs, Spell DPS, the dummy, saves, respec and crafting.
import { describe, expect, it } from "vitest";
import { craftAffix, skillPoolFor } from "../src/data/affixes";
import { BASE_BY_ID, CLASS_DROP_WEIGHTS, ITEM_BASES, type Item, dropWeight, makeItem } from "../src/data/items";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import { CLASS_TABS, SKILLS, SKILL_BY_ID } from "../src/data/skills";
import { SORC_SKILLS, spellBase } from "../src/data/sorc";
import { CLASS_DEF, CLASS_WEAPONS, Game, type GameEvents, type Monster, NO_DUAL_MSG, mainAtkOk } from "../src/game";
import { DAMAGE_SPELLS, spellDps } from "../src/spells";
import swSrc from "../public/sw.js?raw";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };
const ROW_LVL = [1, 6, 12, 18, 24, 30];

function sorc(level = 30, skills: Record<string, number> = {}) {
  const g = new Game(events, null, 7, { cls: "sorceress", name: "" });
  g.player.level = level;
  g.player.skills = { ...skills };
  return g;
}
/** a sorceress in the biggest room of a level with one harmless, still monster `dist` tiles east */
function arena(g: Game, opts: { dist?: number; rank?: "normal" | "boss" | "final"; elite?: 0 | 1 | 2; n?: number; floor?: number } = {}) {
  g.goDungeon(opts.floor ?? 20);
  const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const proto = g.monsters.find((m) => m.def.rank === (opts.rank ?? "normal")) ?? g.monsters.find((m) => m.def.rank === "normal")!;
  const p = g.player;
  p.x = R.cx + 0.5 - 2;
  p.y = R.cy + 0.5;
  p.fx = 1;
  p.fy = 0;
  const ms: Monster[] = [];
  for (let i = 0; i < (opts.n ?? 1); i++) {
    const m = { ...proto, id: 8e6 + i, x: p.x + (opts.dist ?? 3) + (i % 2) * 0.7, y: p.y + (i - (opts.n ?? 1) / 2) * 0.6, state: "chase", kx: 0, ky: 0, stunT: 0, chillT: 0, frozenT: 0, freezeImmuneUntil: -1, elite: opts.elite ?? proto.elite, hp: proto.maxHp, fuse: -1 } as Monster;
    m.def = { ...proto.def, speed: 0, dmgMin: 0, dmgMax: 0, behavior: "melee", specials: undefined, shot: undefined } as Monster["def"];
    ms.push(m);
  }
  g.monsters = ms;
  return ms;
}
function run(g: Game, secs: number, pin?: Monster[]) {
  const p = g.player;
  const sx = p.x;
  const sy = p.y;
  const pos = pin?.map((m) => [m.x, m.y]);
  for (let t = 0; t < secs; t += 1 / 60) {
    p.hp = Math.max(p.hp, 1e4);
    g.update(1 / 60, idle);
    pin?.forEach((m, i) => { if (m.state !== "dead") { m.x = pos![i][0]; m.y = pos![i][1]; m.kx = 0; m.ky = 0; } });
    if (!pin) { p.x = sx; p.y = sy; }
  }
}
function cast(g: Game, id: string) {
  const p = g.player;
  p.mana = 1e5;
  p.action = null;
  return g.castSkill(id, g.derived());
}

describe("v1.6 version and cache", () => {
  it("label, patch note on top, SW cache v34 (v1.6.1)", () => {
    expect(GAME_VERSION).toBe("1.6.2");
    expect(PATCH_NOTES.find((n) => n.version === "1.6")?.title).toMatch(/Sorceress/);
    expect(PATCH_NOTES.findIndex((n) => n.version === "1.5.1")).toBe(PATCH_NOTES.findIndex((n) => n.version === "1.6") + 1);
    expect(swSrc).toContain("ember-crypt-shell-v35");
  });
});

describe("v1.6 Sorceress class", () => {
  it("D2 attributes, frail with deep mana, D2 per-level gains", () => {
    const cd = CLASS_DEF.sorceress;
    expect(cd.stats).toEqual({ str: 10, dex: 25, vit: 10, ene: 35 });
    const g = sorc(1);
    const d1 = g.derived();
    expect(d1.maxHp).toBe(40);
    expect(d1.maxMana).toBe(35);
    g.player.level = 11;
    const d11 = g.derived();
    expect(d11.maxHp).toBe(50); // +1 a level
    expect(d11.maxMana).toBe(55); // +2 a level
    g.player.base.ene += 10;
    expect(g.derived().maxMana).toBe(75); // +2 per Energy
    g.player.base.vit += 10;
    expect(g.derived().maxHp).toBe(70); // +2 per Vitality
    const b = new Game(events, null, 7, { cls: "barbarian", name: "" });
    expect(b.derived().maxHp).toBeGreaterThan(d1.maxHp);
  });
  it("mana comes back 2× as fast (v1.6.1, was 1.5×), more with Warmth", () => {
    const regen = (cls: "sorceress" | "barbarian", warmth = 0) => {
      const g = new Game(events, null, 7, { cls, name: "" });
      g.player.level = 20;
      if (warmth) g.player.skills = { warmth };
      g.player.mana = 0;
      g.update(1, idle);
      return g.player.mana / g.derived().maxMana;
    };
    expect(regen("sorceress") / regen("barbarian")).toBeCloseTo(2, 1);
    expect(regen("sorceress", 5) / regen("sorceress")).toBeCloseTo(1 + (60 + 4 * 20) / 100, 1);
  });
  it("starts with a battle staff and armor, a wand in the bag, three tabs", () => {
    const g = new Game(events, null, 7, { cls: "sorceress", name: "" });
    expect(g.player.equip.main?.baseId).toBe("battle_staff");
    expect(g.player.equip.off).toBeUndefined();
    expect(g.player.bag.some((e) => e.item.baseId === "wand")).toBe(true);
    expect(CLASS_TABS.sorceress).toEqual(["fire", "cold", "lightning", "basic"]);
    expect(g.usable("main")).toBe(true);
  });
});

describe("v1.6 spell trees", () => {
  it("30 skills, 10 per tree, D2 levels on our rows, every one playable", () => {
    expect(SORC_SKILLS.length).toBe(30);
    for (const t of ["fire", "cold", "lightning"]) expect(SORC_SKILLS.filter((s) => s.tab === t).length).toBe(10);
    for (const s of SORC_SKILLS) {
      expect(s.cls).toBe("sorceress");
      expect(s.implemented).toBe(true);
      expect(ROW_LVL[s.row]).toBe(s.reqLvl);
      expect(SKILL_BY_ID[s.id]).toBe(s);
      for (const q of s.prereq) expect(SKILL_BY_ID[q].reqLvl).toBeLessThan(s.reqLvl);
    }
    // no two skills share a spot in a tree
    for (const t of ["fire", "cold", "lightning"]) {
      const spots = SORC_SKILLS.filter((s) => s.tab === t).map((s) => `${s.row},${s.col}`);
      expect(new Set(spots).size).toBe(10);
    }
    expect(SKILLS.filter((s) => s.cls === "sorceress").length).toBe(30);
  });
  it("D2 prerequisites", () => {
    const pre = (id: string) => [...SKILL_BY_ID[id].prereq].sort();
    expect(pre("inferno")).toEqual(["fire_bolt"]);
    expect(pre("blaze")).toEqual(["inferno"]);
    expect(pre("fire_ball")).toEqual(["fire_bolt"]);
    expect(pre("fire_wall")).toEqual(["blaze"]);
    expect(pre("enchant")).toEqual(["fire_ball", "warmth"]);
    expect(pre("meteor")).toEqual(["fire_ball", "fire_wall"]);
    expect(pre("hydra")).toEqual(["enchant"]);
    expect(pre("fire_mastery")).toEqual([]);
    expect(pre("ice_blast")).toEqual(["ice_bolt"]);
    expect(pre("shiver_armor")).toEqual(["frozen_armor", "ice_blast"]);
    expect(pre("glacial_spike")).toEqual(["ice_blast"]);
    expect(pre("blizzard")).toEqual(["frost_nova", "glacial_spike"]);
    expect(pre("chilling_armor")).toEqual(["shiver_armor"]);
    expect(pre("frozen_orb")).toEqual(["blizzard"]);
    expect(pre("nova")).toEqual(["static_field"]);
    expect(pre("lightning")).toEqual(["charged_bolt"]);
    expect(pre("chain_lightning")).toEqual(["lightning"]);
    expect(pre("teleport")).toEqual(["telekinesis"]);
    expect(pre("thunder_storm")).toEqual(["chain_lightning", "nova"]);
    expect(pre("energy_shield")).toEqual(["chain_lightning", "teleport"]);
  });
  it("only she can learn them; prerequisites and level caps apply; any active spell can go on ⚔", () => {
    const g = sorc(1);
    g.player.skillPoints = 5;
    expect(g.canLearn("fire_bolt").ok).toBe(true);
    expect(g.canLearn("inferno").ok).toBe(false);
    expect(g.canLearn("bash").ok).toBe(false);
    g.player.level = 6;
    expect(g.canLearn("inferno").why).toMatch(/Fire Bolt/);
    g.learn("fire_bolt");
    expect(g.canLearn("inferno").ok).toBe(true);
    const b = new Game(events, null, 7, { cls: "barbarian", name: "" });
    b.player.skillPoints = 5;
    expect(b.canLearn("fire_bolt").ok).toBe(false);
    for (const s of SORC_SKILLS) if (s.kind === "active") expect(mainAtkOk(s.id, "sorceress")).toBe(true);
    expect(mainAtkOk("fire_bolt", "amazon")).toBe(false);
  });
});

describe("v1.6 spells in the real game loop", () => {
  it("every damaging spell hurts a monster, from spell base (not the weapon)", () => {
    for (const id of DAMAGE_SPELLS) {
      const g = sorc(30, { [id]: 5 });
      g.player.equip.main = makeItem("battle_staff", 1);
      const [m] = arena(g, { dist: id === "inferno" || id === "charged_bolt" ? 2 : id === "nova" || id === "frost_nova" ? 2.5 : 3 });
      m.hp = m.maxHp = 1e6;
      // random spells (charged bolts wander) get up to three casts
      for (let tries = 0; tries < 3 && m.hp >= 1e6; tries++) {
        const px = g.player.x;
        g.sorcCd = {};
        expect(cast(g, id), id).toBe(true);
        run(g, id === "thunder_storm" || id === "hydra" ? 3 : id === "blaze" ? 0.1 : 2, [m]);
        if (id === "blaze") {
          // Blaze burns where she walks: walk her through the monster
          g.player.x = m.x - 1;
          for (let k = 0; k < 40; k++) { g.player.x += 0.05; g.update(1 / 30, idle); }
          run(g, 1.5, [m]);
          g.player.x = px;
        }
      }
      expect(m.hp, id).toBeLessThan(1e6);
    }
  });
  it("spell damage scales with skill level and mastery, never with the weapon", () => {
    const hit = (lvl: number, mastery: number, weapon: string, ilvl: number) => {
      const g = sorc(30, { fire_bolt: lvl, fire_mastery: mastery });
      g.player.equip.main = makeItem(weapon, ilvl);
      return spellDps(g as never, "fire_bolt");
    };
    expect(hit(10, 0, "battle_staff", 1)).toBeCloseTo(hit(10, 0, "battle_staff", 60), 6);
    expect(hit(10, 0, "battle_staff", 1)).toBeGreaterThan(hit(1, 0, "battle_staff", 1) * 2);
    expect(hit(10, 5, "wand", 1) / hit(10, 0, "wand", 1)).toBeCloseTo(1 + (30 + 4 * 7) / 100, 5);
    expect(spellBase(60)).toBeGreaterThan(spellBase(30));
  });
  it("Static Field never kills, and never takes a boss or act boss below half", () => {
    const g = sorc(30, { static_field: 10 });
    const [m] = arena(g, { dist: 2 });
    m.hp = 2;
    for (let i = 0; i < 6; i++) { cast(g, "static_field"); run(g, 0.6, [m]); }
    expect(m.hp).toBeGreaterThanOrEqual(1);
    expect(m.state).not.toBe("dead");
    for (const rank of ["boss", "final"] as const) {
      const b = sorc(30, { static_field: 20 });
      const [bm] = arena(b, { dist: 2 });
      bm.def = { ...bm.def, rank };
      bm.hp = bm.maxHp = 10000;
      for (let i = 0; i < 12; i++) { cast(b, "static_field"); run(b, 0.6, [bm]); }
      expect(bm.hp, rank).toBeGreaterThanOrEqual(5000);
      expect(bm.hp, rank).toBeLessThan(5100);
    }
  });
  it("cold follows the v1.3 freeze rules: act bosses never freeze, champions freeze shorter and not twice in a row", () => {
    const g = sorc(30, { ice_blast: 10 });
    const [m] = arena(g, { dist: 2.5 });
    m.def = { ...m.def, rank: "final" };
    m.hp = m.maxHp = 1e6;
    cast(g, "ice_blast");
    run(g, 0.8, [m]);
    expect(m.frozenT ?? 0).toBe(0);
    expect(m.chillT ?? 0).toBeGreaterThan(0);
    const c = sorc(30, { ice_blast: 10 });
    const [cm] = arena(c, { dist: 2.5, elite: 1 });
    cm.hp = cm.maxHp = 1e6;
    const n = sorc(30, { ice_blast: 10 });
    const [nm] = arena(n, { dist: 2.5, elite: 0 });
    nm.hp = nm.maxHp = 1e6;
    cast(c, "ice_blast");
    cast(n, "ice_blast");
    run(c, 0.8, [cm]);
    run(n, 0.8, [nm]);
    expect(nm.frozenT).toBeGreaterThan(0);
    expect(cm.frozenT).toBeGreaterThan(0);
    expect(cm.frozenT!).toBeLessThan(nm.frozenT!);
    const first = cm.freezeImmuneUntil!;
    expect(first).toBeGreaterThan(c.time);
  });
  it("Teleport goes the way she aims and never through a wall", () => {
    for (let s = 0; s < 8; s++) {
      const g = sorc(30, { teleport: 10 });
      g.goDungeon(10 + s);
      g.monsters = [];
      const p = g.player;
      const a = (s / 8) * Math.PI * 2;
      p.fx = Math.cos(a);
      p.fy = Math.sin(a);
      const x0 = p.x;
      const y0 = p.y;
      if (!cast(g, "teleport")) continue; // a wall right there: refused
      run(g, 0.6);
      expect(g.blocked(p.x, p.y, p.r * 0.9)).toBe(false);
      // every step along the way was open floor
      const d = Math.hypot(p.x - x0, p.y - y0);
      for (let t = 0; t <= d; t += 0.1) expect(g.blocked(x0 + ((p.x - x0) * t) / (d || 1), y0 + ((p.y - y0) * t) / (d || 1), 0.05)).toBe(false);
      if (d > 0.1) expect(((p.x - x0) * p.fx + (p.y - y0) * p.fy) / d).toBeGreaterThan(0.99);
    }
  });
  it("cooldowns on the big area spells; a spell on cooldown just waits", () => {
    const g = sorc(40, { meteor: 5 });
    arena(g);
    expect(cast(g, "meteor")).toBe(true);
    run(g, 0.55);
    expect(cast(g, "meteor")).toBe(false);
    run(g, 1);
    expect(cast(g, "meteor")).toBe(true);
  });
  it("Hydras: up to three at once", () => {
    const g = sorc(40, { hydra: 5 });
    arena(g, { dist: 4 });
    for (let i = 0; i < 5; i++) { cast(g, "hydra"); run(g, 0.7); }
    expect(g.spells.filter((s) => s.k === "hydra").length).toBe(3);
  });
});

describe("v1.6 buffs and defences", () => {
  it("armors, Energy Shield, Enchant, Thunder Storm, Blaze show on the buff bar; one armor at a time", () => {
    const g = sorc(40, { frozen_armor: 5, shiver_armor: 3, energy_shield: 3, enchant: 3, thunder_storm: 3, blaze: 3 });
    arena(g, { dist: 20 });
    for (const id of ["frozen_armor", "energy_shield", "enchant", "thunder_storm", "blaze"]) { cast(g, id); run(g, 0.55); }
    const ids = g.timedBuffs().map((b) => b.id);
    for (const id of ["frozen_armor", "energy_shield", "enchant", "thunder_storm", "blaze"]) expect(ids).toContain(id);
    const def0 = g.derived().def;
    cast(g, "shiver_armor");
    run(g, 0.55);
    const ids2 = g.timedBuffs().map((b) => b.id);
    expect(ids2).toContain("shiver_armor");
    expect(ids2).not.toContain("frozen_armor");
    expect(g.derived().def).toBeGreaterThan(0);
    expect(def0).toBeGreaterThan(0);
  });
  it("cold armor raises defense", () => {
    const g = sorc(30, { frozen_armor: 10 });
    g.player.equip.chest = makeItem("armor", 20);
    const before = g.derived().def;
    cast(g, "frozen_armor");
    run(g, 0.55);
    expect(g.derived().def).toBeGreaterThanOrEqual(Math.floor(before * (1 + (45 + 9 * 5) / 100)) - 1);
  });
  it("Energy Shield takes its share of a hit from mana", () => {
    const g = sorc(30, { energy_shield: 6 });
    arena(g, { dist: 20 });
    cast(g, "energy_shield");
    run(g, 0.55);
    const p = g.player;
    p.hp = 1000;
    p.mana = 1000;
    g.hurtPlayer({ ar: 0, mlvl: 1, dmgMin: 100, dmgMax: 100, elem: "phys", big: false }, g.derived(), false, "area");
    const share = (20 + 5 * 4) / 100;
    expect(1000 - p.hp).toBeCloseTo(Math.round(100 * (1 - share)), -1);
    expect(p.mana).toBeLessThan(1000 - 100 * share * 1.4);
  });
  it("Frozen Armor freezes a melee attacker", () => {
    const g = sorc(30, { frozen_armor: 5 });
    const [m] = arena(g, { dist: 1 });
    cast(g, "frozen_armor");
    run(g, 0.55, [m]);
    g.hurtPlayer({ ar: 0, mlvl: 1, dmgMin: 1, dmgMax: 1, elem: "phys", big: false }, g.derived(), false, "melee", m);
    expect(m.frozenT).toBeGreaterThan(0);
  });
  it("Enchant adds fire to her attacks", () => {
    const g = sorc(30, { enchant: 10 });
    const [m] = arena(g, { dist: 1 });
    m.hp = m.maxHp = 1e6;
    m.defense = 0;
    const p = g.player;
    p.equip.main = makeItem("battle_staff", 1);
    const swing = (secs: number) => {
      const start = m.hp;
      for (let t = 0; t < secs; t += 1 / 60) { p.x = m.x - 1; p.y = m.y; p.mana = 1e5; p.hp = 1e5; g.update(1 / 60, { ...idle, attack: true }); m.x = p.x + 1; }
      return start - m.hp;
    };
    p.mainAtk = "basic_attack";
    const plain = swing(6);
    p.mainAtk = "enchant";
    run(g, 0.6, [m]); // let go of ⚔ (Enchant goes off once per press)
    g.update(1 / 60, { ...idle, attack: true });
    const act = p.action?.type;
    run(g, 0.6, [m]);
    p.mainAtk = "basic_attack";
    expect(act).toBe("spell");
    expect(g.timedBuffs().map((b) => b.id)).toContain("enchant");
    const hot = swing(6);
    expect(hot).toBeGreaterThan(plain * 1.3);
  });
});

describe("v1.6 Spell DPS and the training dummy", () => {
  it("the Character screen's main spell: ⚔ first, then the buttons, then her strongest", () => {
    const g = sorc(30, { fire_bolt: 5, frozen_armor: 1, glacial_spike: 3 });
    expect(new Game(events, null, 7, { cls: "amazon", name: "" }).mainSpell()).toBeNull();
    g.player.mainAtk = "fire_bolt";
    expect(g.mainSpell()?.id).toBe("fire_bolt");
    g.player.mainAtk = "frozen_armor";
    g.player.slots = ["frozen_armor", "glacial_spike", null];
    expect(g.mainSpell()?.id).toBe("glacial_spike");
    g.player.slots = [null, null, null];
    expect(g.mainSpell()?.dps).toBeGreaterThan(0);
  });
  it("the dummy registers spell damage", () => {
    const g = sorc(20, { fire_bolt: 5, chain_lightning: 1, static_field: 1 });
    g.goTown(true);
    const dummy = g.monsters.find((m) => m.dummy)!;
    const p = g.player;
    p.x = dummy.x - 4;
    p.y = dummy.y;
    for (const id of ["fire_bolt", "chain_lightning", "static_field"]) {
      if (id === "static_field") p.x = dummy.x - 2;
      const before = g.dummyMeter()?.total ?? 0;
      cast(g, id);
      run(g, 1.2);
      expect(g.dummyMeter()!.total, id).toBeGreaterThan(before);
      expect(dummy.hp).toBe(dummy.maxHp);
    }
  });
});

describe("v1.6 items and drops", () => {
  it("staves (two-handed), wands and orbs (off-hand)", () => {
    expect(BASE_BY_ID.battle_staff.hands).toBe(2);
    expect(BASE_BY_ID.battle_staff.slot).toBe("weapon");
    expect(BASE_BY_ID.wand.hands).toBe(1);
    expect(BASE_BY_ID.orb.slot).toBe("shield");
    expect(CLASS_WEAPONS.sorceress).toEqual(["battle_staff", "wand"]);
  });
  it("+skill rolls: Sorceress spells only on staves, wands and orbs; the quarterstaff stays Barbarian", () => {
    for (const id of ["battle_staff", "wand", "orb"]) expect(new Set(skillPoolFor(id).map((s) => SKILL_BY_ID[s].cls))).toEqual(new Set(["sorceress"]));
    expect(new Set(skillPoolFor("quarterstaff").map((s) => SKILL_BY_ID[s].cls))).toEqual(new Set(["barbarian"]));
    expect(new Set(skillPoolFor("shield").map((s) => SKILL_BY_ID[s].cls)).size).toBe(3); // a shield has no skill rolls: any-class pool unused
  });
  it("drops lean to her items; overall drop weights and the weapon / armor share are unchanged", () => {
    const sum = (cls?: string) => ITEM_BASES.reduce((a, b) => a + dropWeight(b, cls), 0);
    const weapons = (cls?: string) => ITEM_BASES.filter((b) => b.slot === "weapon").reduce((a, b) => a + dropWeight(b, cls), 0);
    const armor = (cls?: string) => ITEM_BASES.filter((b) => !["weapon", "quiver", "ring", "amulet", "potion"].includes(b.slot)).reduce((a, b) => a + dropWeight(b, cls), 0);
    for (const cls of ["amazon", "barbarian", "sorceress"]) {
      expect(sum(cls)).toBeCloseTo(sum(), 6);
      expect(weapons(cls)).toBeCloseTo(weapons(), 6);
      expect(armor(cls)).toBeCloseTo(armor(), 6);
    }
    // the v1.0 weapon total (5.8 of the base pool) is unchanged with the staff and wand in it
    expect(weapons()).toBeCloseTo(5.8, 6);
    for (const id of [...CLASS_WEAPONS.sorceress, "orb"]) {
      expect(CLASS_DROP_WEIGHTS.sorceress[id]).toBeGreaterThan(CLASS_DROP_WEIGHTS.barbarian[id]);
      expect(CLASS_DROP_WEIGHTS.sorceress[id]).toBeGreaterThan(CLASS_DROP_WEIGHTS.amazon[id]);
    }
    for (const id of CLASS_WEAPONS.barbarian) expect(CLASS_DROP_WEIGHTS.barbarian[id]).toBeGreaterThan(CLASS_DROP_WEIGHTS.sorceress[id]);
    for (const id of CLASS_WEAPONS.amazon) expect(CLASS_DROP_WEIGHTS.amazon[id]).toBeGreaterThan(CLASS_DROP_WEIGHTS.sorceress[id]);
  });
  it("Hilde always has a magic Sorceress weapon for a Sorceress", () => {
    for (let s = 1; s <= 25; s++) {
      const g = new Game(events, null, s * 97, { cls: "sorceress", name: "" });
      g.maxFloor = 1 + (s % 40);
      g.time = s * 3.3;
      g.restock();
      const magic = g.vendorStock.filter((e) => e.item.q === "magic").map((e) => e.item.baseId);
      expect(magic.some((id) => CLASS_WEAPONS.sorceress.includes(id)), `seed ${s}: ${magic}`).toBe(true);
    }
  });
  it("she can't dual wield: a wand never goes in the off-hand; a shield or an orb does; a staff takes both hands", () => {
    const g = sorc(30);
    const p = g.player;
    p.base.str = 100;
    const wand: Item = makeItem("wand", 5);
    p.equip = { main: makeItem("wand", 5) };
    expect(g.slotsFor(wand)).toEqual(["main"]);
    expect(g.equipError(wand, "off")).toBe(NO_DUAL_MSG.sorceress);
    expect(g.canDualWield()).toBe(false);
    expect(g.equipError(makeItem("orb", 5), "off")).toBeNull();
    expect(g.equipError(makeItem("shield", 5), "off")).toBeNull();
    p.equip.main = makeItem("battle_staff", 5);
    expect(g.equipError(makeItem("orb", 5), "off")).toMatch(/both hands/);
    expect(new Game(events, null, 7, { cls: "barbarian", name: "" }).canDualWield()).toBe(true);
  });
  it("Brann can craft an orb (Sorceress +skills only)", () => {
    for (let i = 0; i < 30; i++) {
      const it = makeItem("orb", 30);
      for (let k = 0; k < 4; k++) expect(craftAffix(it, Math.random, "sorceress").ok).toBe(true);
      for (const m of it.mods ?? []) if (m.s === "skill") expect(SKILL_BY_ID[m.sk!].cls).toBe("sorceress");
    }
  });
});

describe("v1.6 saves and respec", () => {
  it("a Sorceress saves and loads (timed buffs and spells reset to camp)", () => {
    const g = sorc(30, { fire_bolt: 5, energy_shield: 2 });
    g.player.slots = ["fire_bolt", null, null];
    g.player.mainAtk = "fire_bolt";
    arena(g, { dist: 20 });
    cast(g, "energy_shield");
    run(g, 0.6);
    const s = JSON.parse(JSON.stringify(g.toSave()));
    const h = new Game(events, s);
    expect(h.player.cls).toBe("sorceress");
    expect(h.player.skills.fire_bolt).toBe(5);
    expect(h.player.mainAtk).toBe("fire_bolt");
    expect(h.player.sb?.es ?? 0).toBe(0);
    expect(h.spells.length).toBe(0);
  });
  it("older Barbarian and Amazon saves load unchanged", () => {
    for (const cls of ["barbarian", "amazon"] as const) {
      const g = new Game(events, null, 3, { cls, name: "" });
      const s = JSON.parse(JSON.stringify(g.toSave()));
      delete s.player.sb;
      const h = new Game(events, s);
      expect(h.player.cls).toBe(cls);
      expect(h.player.equip.main?.baseId).toBe(g.player.equip.main?.baseId);
    }
  });
  it("respec: a spell point comes back", () => {
    const g = sorc(10, { fire_bolt: 3 });
    g.player.gold = 1e6;
    g.goTown(true);
    expect(g.unlearn("fire_bolt")).toBeNull();
    expect(g.player.skills.fire_bolt).toBe(2);
  });
});
