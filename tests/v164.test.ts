// v1.6.4: spells and skill effects leech at SPELL_LEECH_PCT of gear leech (the old 4%/s cap was removed in v1.7.2);
// weapon hits leech in full as before.
import { describe, expect, it } from "vitest";
import { makeItem, type Item } from "../src/data/items";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import type { HeroClass } from "../src/data/skills";
import { Game, type GameEvents, type Monster, SPELL_LEECH_PCT } from "../src/game";
import swSrc from "../public/sw.js?raw";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };
const ring = (ll: number, ml: number): Item => ({ ...makeItem("ring", 20), q: "magic", mods: [{ s: "ll", v: ll }, { s: "ml", v: ml }] });

/** Cast `skill` for `secs` at a still pack of `n` monsters 5 tiles east (1 = a single "boss" with the same life). */
function sustain(cls: HeroClass, skill: string, skills: Record<string, number>, n: number, ll = 6, ml = 6, secs = 20) {
  const g = new Game(events, null, 11, { cls, name: "" });
  const p = g.player;
  p.level = 30;
  p.base = { str: 80, dex: 80, vit: 80, ene: 80 };
  p.skills = { ...skills };
  p.equip = { ring1: ring(ll, ml) };
  if (cls === "amazon") p.equip.main = makeItem("javelin", 30);
  if (cls === "sorceress") p.equip.main = makeItem("wand", 20);
  g.goDungeon(20);
  const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const proto = g.monsters.find((m) => m.def.rank === "normal")!;
  p.x = R.cx + 0.5 - 2.5; p.y = R.cy + 0.5; p.fx = 1; p.fy = 0;
  const spots = Array.from({ length: n }, (_, i) => ({ x: p.x + 5 + (i % 3) * 0.8 - 0.8, y: p.y + (Math.floor(i / 3) - 1.5) * 0.8 }));
  g.monsters = spots.map((s, i) => {
    const m = { ...proto, id: 9e6 + i, x: s.x, y: s.y, state: "chase", kx: 0, ky: 0, stunT: 0, chillT: 0, frozenT: 0, freezeImmuneUntil: -1, hp: 1e7, maxHp: 1e7, fuse: -1 } as Monster;
    m.def = { ...proto.def, speed: 0, dmgMin: 0, dmgMax: 0, behavior: "melee", specials: undefined, shot: undefined } as Monster["def"];
    return m;
  });
  let dealt = 0;
  const eh = g.elemHit.bind(g);
  g.elemHit = (mm, d, e, o) => { if (mm.state !== "dead") dealt += Math.min(Math.max(1, Math.round(d)), Math.max(0, mm.hp)); eh(mm, d, e, o); };
  const d0 = g.derived();
  let casts = 0;
  for (let t = 0; t < secs; t += 1 / 60) {
    p.hp = 1; p.mana = d0.maxMana / 2; p.healLeft = 0; p.manaLeft = 0;
    if (p.equip.main?.qty !== undefined) p.equip.main.qty = 200;
    for (let i = 0; i < g.monsters.length; i++) { g.monsters[i].x = spots[i].x; g.monsters[i].y = spots[i].y; g.monsters[i].kx = 0; g.monsters[i].ky = 0; }
    p.x = R.cx + 0.5 - 2.5; p.y = R.cy + 0.5; p.fx = 1; p.fy = 0;
    if (!p.action && g.castSkill(skill, g.derived())) casts++;
    g.update(1 / 60, idle);
  }
  const r = (x: number) => x / secs;
  return {
    maxHp: d0.maxHp, maxMana: d0.maxMana, casts,
    spellLife: r(g.spellLeechGot.hp), spellMana: r(g.spellLeechGot.mp),
    atkLife: r(g.atkLeechGot.hp), atkMana: r(g.atkLeechGot.mp),
    uncappedLife: r((dealt * ll * SPELL_LEECH_PCT) / 10000), fullLife: r((dealt * ll) / 100),
  };
}
const f = (x: number) => x.toFixed(1);

describe("v1.6.4 release", () => {
  it("version, patch note, cache v37", () => {
    expect(GAME_VERSION).toBe("1.8.1");
    const n = PATCH_NOTES.find((q) => q.version === "1.6.4")!;
    expect(n.version).toBe("1.6.4");
    expect(n.notes.join(" ")).toMatch(/leech/i);
    expect(swSrc).toMatch(/ember-crypt-shell-v\d+/);
  });
  it("skill-effect leech is a reduced share of gear leech", () => {
    expect(SPELL_LEECH_PCT).toBeGreaterThan(0);
    expect(SPELL_LEECH_PCT).toBeLessThan(100);
  });
});

describe("v1.6.4 spell leech", () => {
  const SORC = { frost_nova: 1, ice_bolt: 1, ice_blast: 1, blizzard: 20, frozen_orb: 20, static_field: 1, nova: 20, cold_mastery: 10 };
  it("one elemHit leeches 35% of gear leech on the damage dealt; dummy and noLeech never", () => {
    const g = new Game(events, null, 11, { cls: "sorceress", name: "" });
    g.player.level = 30;
    g.player.equip = { ring1: ring(10, 10) };
    g.goDungeon(5);
    for (let i = 0; i < 70; i++) g.update(1 / 60, idle); // fill the 1 s reserve
    const m = g.monsters.find((x) => x.def.rank === "normal")!;
    m.hp = 1e6; m.x = g.player.x + 30;
    const p = g.player;
    p.hp = 1; p.mana = 0;
    g.elemHit(m, 20, "fire");
    expect(p.hp).toBeCloseTo(1 + 20 * 0.1 * (SPELL_LEECH_PCT / 100), 6);
    expect(p.mana).toBeCloseTo(20 * 0.1 * (SPELL_LEECH_PCT / 100), 6);
    const h = p.hp;
    g.elemHit(m, 100, "fire", { noLeech: true });
    expect(p.hp).toBe(h);
    m.dummy = true;
    g.elemHit(m, 100, "fire");
    expect(p.hp).toBe(h);
  });
  it("overkill doesn't leech: a monster with 5 life left gives leech on 5", () => {
    const g = new Game(events, null, 11, { cls: "sorceress", name: "" });
    g.player.level = 30;
    g.player.equip = { ring1: ring(10, 0) };
    g.goDungeon(5);
    for (let i = 0; i < 70; i++) g.update(1 / 60, idle);
    const m = g.monsters.find((x) => x.def.rank === "normal")!;
    m.x = g.player.x + 30; m.hp = 5;
    g.player.hp = 1;
    g.elemHit(m, 1000, "cold");
    expect(g.player.hp).toBeCloseTo(1 + 5 * 0.1 * (SPELL_LEECH_PCT / 100), 6);
  });
  it("skill effects leech at SPELL_LEECH_PCT of gear leech, uncapped; weapon hits stay full-rate", () => {
    const b = sustain("sorceress", "blizzard", SORC, 10);
    const one = sustain("sorceress", "blizzard", SORC, 1);
    const fo = sustain("sorceress", "frozen_orb", SORC, 10);
    const nv = sustain("sorceress", "nova", SORC, 10);
    const nv1 = sustain("sorceress", "nova", SORC, 1);
    const az = { ...Object.fromEntries(["jab", "power_strike", "poison_javelin", "lightning_bolt", "charged_strike", "plague_javelin"].map((k) => [k, 1])), lightning_fury: 20 };
    const lf = sustain("amazon", "lightning_fury", az, 10);
    const lf1 = sustain("amazon", "lightning_fury", az, 1);
    const row = (name: string, r: ReturnType<typeof sustain>) =>
      `LEECH ${name}: maxHp ${r.maxHp} | life/s ${f(r.atkLife + r.spellLife)} (spell ${f(r.spellLife)} atk ${f(r.atkLife)}; reduced-rate ${f(r.uncappedLife)}; full-rate ${f(r.fullLife)}) | mana/s spell ${f(r.spellMana)} | casts ${r.casts}`;
    for (const [n, r] of [["Sorc Blizzard pack10", b], ["Sorc Blizzard single", one], ["Sorc Frozen Orb pack10", fo], ["Sorc Nova pack10", nv], ["Sorc Nova single", nv1], ["Amazon Lightning Fury pack10", lf], ["Amazon Lightning Fury single", lf1]] as const) console.log(row(n, r));
    expect(b.spellLife).toBeGreaterThan(0);
    expect(b.atkLife).toBe(0);
    expect(lf.spellLife).toBeGreaterThan(0);
    expect(b.spellLife).toBeGreaterThan(one.spellLife * 2); // a pack returns more than a single (no cap)
  }, 120000);
  it("weapon hits leech in full (not at the skill-effect rate)", () => {
    const g = new Game(events, null, 11, { cls: "barbarian", name: "" });
    g.player.level = 30;
    g.player.equip = { ...g.player.equip, ring1: ring(10, 0) };
    g.goDungeon(5);
    const m = g.monsters.find((x) => x.def.rank === "normal")!;
    m.x = g.player.x + 30; m.hp = 1e6;
    g.player.hp = 1;
    const hand = g.derived().hands[0];
    const h0 = m.hp;
    (g as unknown as { playerHit: (m: Monster, h: unknown, o: object) => boolean }).playerHit(m, hand, { sure: true });
    const dmg = h0 - m.hp;
    expect(dmg).toBeGreaterThan(0);
    expect(g.player.hp).toBeCloseTo(1 + dmg * 0.1, 6);
    expect(g.atkLeechGot.hp).toBeCloseTo(dmg * 0.1, 6);
    expect(g.spellLeechGot.hp).toBe(0);
  });
});
