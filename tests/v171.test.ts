// v1.7.1: class audit. Leech depends only on the damage source (weapon hit / skill effect / minion), never on class;
// Character-screen spell rows have no class check.
import { describe, expect, it } from "vitest";
import gameSrc from "../src/game.ts?raw";
import uiSrc from "../src/ui.ts?raw";
import { makeItem, type Item } from "../src/data/items";
import { GAME_VERSION, PATCH_NOTES } from "../src/data/patchNotes";
import { Game, type GameEvents, type Monster, SPELL_LEECH_PCT, leechDrainFor } from "../src/game";
import swSrc from "../public/sw.js?raw";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const ring = (ll: number): Item => ({ ...makeItem("ring", 20), q: "magic", mods: [{ s: "ll", v: ll }] });

function barb(lvl = 30) {
  const g = new Game(events, null, 11, { cls: "barbarian", name: "" });
  const p = g.player;
  p.level = lvl;
  p.base = { str: 120, dex: 60, vit: 80, ene: 30 };
  p.skills = { howl: 1, shout: 1, taunt: 1, battle_cry: 1, battle_orders: 1, war_cry: 20 };
  p.equip = { ring1: ring(6) };
  g.goDungeon(20);
  const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const proto = g.monsters.find((m) => m.def.rank === "normal")!;
  p.x = R.cx + 0.5; p.y = R.cy + 0.5;
  g.monsters = Array.from({ length: 6 }, (_, i) => {
    const m = { ...proto, id: 9e6 + i, x: p.x + Math.cos(i) * 1.5, y: p.y + Math.sin(i) * 1.5, state: "chase", kx: 0, ky: 0, stunT: 0, hp: 1e6, maxHp: 1e6, fuse: -1, elite: 0 } as Monster;
    m.def = { ...proto.def, speed: 0, dmgMin: 0, dmgMax: 0, specials: undefined, shot: undefined } as Monster["def"];
    return m;
  });
  return g;
}

describe("v1.7.1 release", () => {
  it("version, patch note, cache", () => {
    expect(GAME_VERSION).toBe("1.7.2");
    expect(PATCH_NOTES.find((n) => n.version === "1.7.1")!.notes.join(" ")).toMatch(/every hero/i);
    expect(swSrc).toMatch(/ember-crypt-shell-v\d+/);
  });
});

describe("v1.7.1 leech by damage source, not class", () => {
  it("War Cry (a skill effect) leeches at the skill-effect rate", () => {
    const g = barb();
    const p = g.player;
    const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };
    for (let i = 0; i < 70; i++) g.update(1 / 60, idle);
    g.spellLeechGot = { hp: 0, mp: 0 }; g.atkLeechGot = { hp: 0, mp: 0 };
    p.hp = 1;
    p.mana = 500;
    const d = g.derived();
    let dealt = 0;
    const before = g.monsters.map((m) => m.hp);
    expect(g.castSkill("war_cry", d)).toBe(true);
    g.monsters.forEach((m, i) => (dealt += before[i] - m.hp));
    expect(dealt).toBeGreaterThan(0);
    // healed through the skill-effect reserve, nothing through weapon leech
    expect(g.atkLeechGot.hp).toBe(0);
    const drain = leechDrainFor("normal", 0, g.floor);
    const want = (dealt * 6 * SPELL_LEECH_PCT * drain) / 10000;
    expect(g.spellLeechGot.hp).toBeGreaterThan(0);
    expect(g.spellLeechGot.hp).toBeCloseTo(Math.min(want, d.maxHp - 1), 4);
    console.log("WARCRY", JSON.stringify({ dealt, got: +g.spellLeechGot.hp.toFixed(2), want: +want.toFixed(2) }));
  });
  it("leech code has no class checks", () => {
    const src = gameSrc;
    for (const fn of ["private spellLeech(", "private directHit(", "elemHit(", "private playerHit("]) {
      const i = src.indexOf(fn);
      expect(i).toBeGreaterThan(0);
      const body = src.slice(i, src.indexOf("\n  }\n", i));
      expect(body, fn).not.toMatch(/\.cls\b|sorceress|barbarian|amazon|SORC_IDS/);
    }
  });
});

describe("v1.7.1 spell rows are class-agnostic", () => {
  it("mainSpell has no class check; null without a damaging spell", () => {
    const src = gameSrc;
    const i = src.indexOf("  mainSpell()");
    expect(src.slice(i, src.indexOf("\n  }\n", i))).not.toMatch(/cls/);
    expect(new Game(events, null, 7, { cls: "amazon", name: "" }).mainSpell()).toBeNull();
    expect(new Game(events, null, 7, { cls: "barbarian", name: "" }).mainSpell()).toBeNull();
    const ui = uiSrc;
    const j = ui.indexOf('class="kv casttime"');
    expect(ui.slice(j - 80, j)).not.toMatch(/sorceress/);
  });
});
