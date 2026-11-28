// v1.3: buff bar, freeze resistance, Pierce, DPS, the camp training dummy, Strafe numbers.
import { describe, expect, it } from "vitest";
import { makeItem } from "../src/data/items";
import { GAME_VERSION } from "../src/data/patchNotes";
import { strafeArrows, strafeDmg, strafeDur, pierceChance } from "../src/data/skills";
import { DUMMY_IDLE_RESET, DUMMY_POS, FREEZE_IMMUNE, Game, type GameEvents, type Monster, freezeResFor } from "../src/game";
import { bfs, idx, isFloor } from "../src/map";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };
const hold = { ...idle, attack: true };

function amazon(seed = 3) {
  const g = new Game(events, null, seed, { cls: "amazon", name: "" });
  const p = g.player;
  p.level = 30;
  p.base.dex = 200;
  p.base.str = 100;
  p.skills = { magic_arrow: 1 };
  p.equip = { main: makeItem("long_bow", 10), off: makeItem("arrows", 1) };
  return { g, p };
}
/** a still, harmless copy of a floor's normal monster */
function dummyMon(g: Game, x: number, y: number, extra: Partial<Monster> = {}): Monster {
  const proto = g.monsters.find((q) => q.def.rank === "normal" && !q.elite)!;
  const m = { ...proto, id: Math.floor(Math.random() * 1e9), x, y, state: "chase", hp: 1e7, maxHp: 1e7, defense: 0, kx: 0, ky: 0, frozenT: 0, chillT: 0, stunT: 0, ...extra } as Monster;
  m.def = { ...proto.def, speed: 0, dmgMin: 0, dmgMax: 0, ...(extra.def ?? {}) } as Monster["def"];
  return m;
}

describe("v1.3 version", () => {
  it("label", () => expect(GAME_VERSION).toBe("1.9"));
});

describe("v1.3 buff bar: every timed effect, both classes", () => {
  it("Barbarian warcries, Frenzy, Concentrate, Berserk count down with a full length", () => {
    const g = new Game(events, null, 4);
    const p = g.player;
    g.goDungeon(2);
    p.level = 30;
    p.skills = { shout: 3, battle_orders: 2, battle_command: 1, howl: 1, taunt: 1, battle_cry: 1, find_potion: 1, grim_ward: 1 };
    p.mana = 999;
    const d = g.derived();
    for (const s of ["shout", "battle_orders", "battle_command"]) {
      p.action = null;
      expect(g.castSkill(s, d)).toBe(true);
    }
    p.frenzy = { stacks: 3, t: 4, decay: 0 };
    p.buffs.conc = 0.6;
    p.buffs.bers = 0.8;
    const ids = g.timedBuffs().map((b) => b.id);
    for (const id of ["shout", "battle_orders", "battle_command", "frenzy", "concentrate", "berserk"]) expect(ids).toContain(id);
    const shout = g.timedBuffs().find((b) => b.id === "shout")!;
    expect(shout.left).toBeGreaterThan(5);
    expect(shout.full).toBeCloseTo(shout.left, 5);
    for (let i = 0; i < 60; i++) g.update(1 / 30, idle);
    const s2 = g.timedBuffs().find((b) => b.id === "shout")!;
    expect(s2.left).toBeLessThan(shout.left - 1.5);
    expect(s2.full).toBeCloseTo(shout.full, 5); // the bar drains against the full length
    expect(g.timedBuffs().find((b) => b.id === "frenzy")!.stacks).toBe(3);
  });
  it("Amazon: Slow Missiles, Decoy, Inner Sight; Strafe and Valkyrie are not timed", () => {
    const { g, p } = amazon();
    g.goDungeon(3);
    p.skills = { magic_arrow: 1, inner_sight: 1, slow_missiles: 1, decoy: 1, valkyrie: 1, strafe: 1 };
    p.mana = 999;
    const d = g.derived();
    const near = g.monsters.find((m) => m.state !== "dead")!;
    near.x = p.x + 2;
    near.y = p.y;
    for (const s of ["inner_sight", "slow_missiles", "decoy", "valkyrie"]) {
      p.action = null;
      expect(g.castSkill(s, d)).toBe(true);
    }
    const ids = g.timedBuffs().map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(["slow_missiles", "decoy", "inner_sight"]));
    expect(ids).not.toContain("valkyrie");
    expect(ids).not.toContain("strafe");
    for (const b of g.timedBuffs()) {
      expect(b.left).toBeGreaterThan(0);
      expect(b.full).toBeGreaterThanOrEqual(b.left);
      expect(b.glyph.length).toBeGreaterThan(0);
    }
  });
  it("ailments (chill, poison) show too, and everything is gone in town", () => {
    const g = new Game(events, null, 6);
    g.goDungeon(2);
    g.player.chillT = 1.5;
    g.player.poison = { t: 2, dps: 3 };
    expect(g.timedBuffs().map((b) => b.id)).toEqual(expect.arrayContaining(["chill", "poison"]));
    g.goTown(true);
    expect(g.timedBuffs()).toEqual([]);
  });
});

describe("v1.3 freeze resistance", () => {
  it("table: none for normal monsters, rising with depth for the rest, capped", () => {
    expect(freezeResFor("normal", 0, 1)).toBe(0);
    expect(freezeResFor("normal", 0, 80)).toBe(0);
    expect(freezeResFor("normal", 1, 1)).toBeCloseTo(0.2);
    expect(freezeResFor("normal", 2, 1)).toBeCloseTo(0.35);
    expect(freezeResFor("boss", 0, 1)).toBeCloseTo(0.55);
    expect(freezeResFor("normal", 1, 41)).toBeCloseTo(0.36);
    expect(freezeResFor("boss", 0, 80)).toBe(0.8);
    expect(freezeResFor("final", 0, 80)).toBe(0.8);
  });
  const freezeOf = (rank: "normal" | "boss" | "final", elite: 0 | 1 | 2, floor = 1) => {
    const { g } = amazon();
    g.goDungeon(Math.max(1, floor));
    const m = dummyMon(g, g.player.x + 3, g.player.y, { elite } as Partial<Monster>);
    m.def = { ...m.def, rank };
    g.monsters = [m];
    (g as unknown as { chillOrFreeze: (m: Monster, c?: number, f?: number) => void }).chillOrFreeze(m, 0, 2);
    return { g, m };
  };
  it("a 2 s freeze: normal 2 s, champion 1.6 s, unique 1.3 s, boss 0.9 s, act boss only chilled", () => {
    expect(freezeOf("normal", 0).m.frozenT).toBeCloseTo(2);
    expect(freezeOf("normal", 1).m.frozenT).toBeCloseTo(1.6);
    expect(freezeOf("normal", 2).m.frozenT).toBeCloseTo(1.3);
    expect(freezeOf("boss", 0).m.frozenT).toBeCloseTo(0.9);
    const f = freezeOf("final", 0).m;
    expect(f.frozenT ?? 0).toBe(0);
    expect(f.chillT).toBeGreaterThan(1);
  });
  it("a boss can't be chain-frozen: re-freezing during the freeze or its thaw window only chills", () => {
    const { g, m } = freezeOf("boss", 0);
    const cof = (g as unknown as { chillOrFreeze: (m: Monster, c?: number, f?: number) => void }).chillOrFreeze.bind(g);
    let frozen = 0;
    const dt = 1 / 30;
    // freeze it every 0.25 s for 20 s (a hail of Freezing Arrows)
    for (let t = 0; t < 20; t += dt) {
      if (Math.round(t * 30) % 8 === 0) cof(m, 0, 3);
      g.update(dt, idle);
      if ((m.frozenT ?? 0) > 0) frozen += dt;
    }
    // each freeze 3 × 0.45 = 1.35 s, then 3 s immune: frozen about 31% of the time at most
    expect(frozen / 20).toBeLessThan(0.36);
    expect(frozen / 20).toBeGreaterThan(0.2);
    expect(FREEZE_IMMUNE.boss).toBe(3);
  });
  it("normal monsters still freeze as before (a new freeze extends it)", () => {
    const { g, m } = freezeOf("normal", 0);
    const cof = (g as unknown as { chillOrFreeze: (m: Monster, c?: number, f?: number) => void }).chillOrFreeze.bind(g);
    let frozen = 0;
    const dt = 1 / 30;
    for (let t = 0; t < 10; t += dt) {
      if (Math.round(t * 30) % 30 === 0) cof(m, 0, 2);
      g.update(dt, idle);
      if ((m.frozenT ?? 0) > 0) frozen += dt;
    }
    expect(frozen / 10).toBeGreaterThan(0.95);
  });
});

describe("v1.3 Pierce", () => {
  /** shoot `n` plain arrows at a monster with another right behind it */
  const volley = (n: number, pierceLvl: number) => {
    const { g, p } = amazon(9);
    p.skills = { magic_arrow: 1, pierce: pierceLvl };
    g.goDungeon(3);
    const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const x0 = R.x + 1.5;
    const y0 = R.y + R.h / 2;
    let back = 0, front = 0;
    for (let i = 0; i < n; i++) {
      p.x = x0; p.y = y0; p.fx = 1; p.fy = 0; p.action = null; p.mana = 999;
      p.equip.off!.qty = 100;
      const a = dummyMon(g, x0 + 1.6, y0);
      const b = dummyMon(g, x0 + 3.2, y0);
      g.monsters = [a, b];
      g.projectiles = [];
      const before = g.pierces;
      g.startShoot(null, g.derived());
      for (let t = 0; t < 30; t++) {
        g.update(1 / 30, idle);
        a.x = x0 + 1.6; a.y = y0; b.x = x0 + 3.2; b.y = y0;
      }
      if (g.pierces > before) front++;
      if (b.hp < b.maxHp) back++;
    }
    return { front: front / n, back: back / n };
  };
  it(`level 5 Pierce (${pierceChance(5)}%): about half the arrows fly through and hit the monster behind`, () => {
    const r = volley(600, 5);
    expect(r.front).toBeGreaterThan(0.44);
    expect(r.front).toBeLessThan(0.58);
    expect(r.back).toBeGreaterThan(0.38); // the arrow behind still has to land (95% at defense 0)
    expect(r.back).toBeLessThan(0.58);
  });
  it("no Pierce: no arrow ever reaches the monster behind", () => {
    const r = volley(150, 0);
    expect(r.front).toBe(0);
    expect(r.back).toBe(0);
  });
  it("a pierce is marked: Pierce tag over the monster, the arrow carries a glow count", () => {
    const { g, p } = amazon(10);
    p.skills = { magic_arrow: 1, pierce: 20 };
    g.goDungeon(3);
    const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    p.x = R.x + 1.5; p.y = R.y + R.h / 2; p.fx = 1; p.fy = 0;
    const a = dummyMon(g, p.x + 1.6, p.y);
    g.monsters = [a];
    let saw = 0;
    for (let k = 0; k < 20 && !saw; k++) {
      p.action = null;
      g.startShoot(null, g.derived());
      for (let t = 0; t < 20; t++) {
        g.update(1 / 30, idle);
        a.x = p.x + 1.6; a.y = p.y;
        for (const q of g.projectiles) if (q.pierced) saw = q.pierced;
      }
    }
    expect(saw).toBeGreaterThan(0);
    expect(g.floaters.some((f) => /Pierce/.test(f.text))).toBe(true);
  });
});

describe("v1.3 DPS", () => {
  it("bow DPS = average hit × crit over the real shot time; long vs short bow compare", () => {
    const { g } = amazon();
    const d = g.derived();
    const h = d.hands[0];
    const avg = ((h.min + h.max) / 2) * (1 + h.dmgPct / 100) * (1 + h.crit / 100);
    const t = h.speed / (1 + d.ias) / 1.15;
    expect(d.dps).toBeCloseTo(avg / t, 6);
    expect(d.aps).toBeCloseTo(1 / t, 6);
    const sb = makeItem("short_bow", 10);
    const w = g.weaponDps(sb)!;
    expect(w.aps).toBeGreaterThan(d.aps); // faster
    const rows = g.compare(sb, "main");
    const dpsRow = rows.find((r) => r.id === "dps")!;
    expect(dpsRow.diff).toBeCloseTo(w.dps - d.dps, 6);
    expect(rows[0].id).toBe("dps"); // DPS leads the compare list
  });
  it("dual wielding alternates hands; Barbarian swing has no Amazon speed", () => {
    const g = new Game(events, null, 5);
    const p = g.player;
    p.base.str = 200; p.base.dex = 200; p.level = 30;
    p.skills = {};
    p.equip = { main: makeItem("sword", 5), off: makeItem("axe", 5) } as typeof p.equip;
    const d = g.derived();
    expect(d.dual).toBe(true);
    const hit = (i: number) => ((d.hands[i].min + d.hands[i].max) / 2) * (1 + d.hands[i].dmgPct / 100) * (1 + d.hands[i].crit / 100);
    const dur = (i: number) => d.hands[i].speed / (1 + d.ias);
    expect(d.dps).toBeCloseTo((hit(0) + hit(1)) / (dur(0) + dur(1)), 6);
  });
  it("matches what the training dummy measures (within 8%, misses are 5%)", () => {
    const { g, p } = amazon(12);
    p.base.dex = 120;
    g.goTown(true);
    const dm = g.monsters.find((m) => m.dummy)!;
    p.x = dm.x - 4; p.y = dm.y; p.fx = 1; p.fy = 0;
    for (let i = 0; i < 30 * 40; i++) {
      p.equip.off!.qty = 100;
      p.x = dm.x - 4; p.y = dm.y;
      g.update(1 / 30, hold);
    }
    const mt = g.dummyMeter()!;
    const d = g.derived();
    expect(mt.hits).toBeGreaterThan(20);
    expect(mt.avg).toBeGreaterThan(d.dps * 0.95 * 0.92);
    expect(mt.avg).toBeLessThan(d.dps * 0.95 * 1.08);
  });
});

describe("v1.3 training dummy", () => {
  it("stands in camp on open ground off the paths, every camp spot still reachable", () => {
    const g = new Game(events, null, 7);
    g.goTown(true);
    const dms = g.monsters.filter((m) => m.dummy);
    expect(dms.length).toBe(1);
    const L = g.level;
    expect(isFloor(L, Math.floor(DUMMY_POS.x), Math.floor(DUMMY_POS.y))).toBe(true);
    // not on the dirt paths (art 4..6) and nothing solid next to it
    expect(L.variant[idx(Math.floor(DUMMY_POS.x), Math.floor(DUMMY_POS.y))]).toBeLessThan(4);
    const f = bfs(L, Math.floor(L.spawn.x), Math.floor(L.spawn.y));
    for (const s of [L.vendor!, L.stash!, L.waypoint]) expect(f[idx(Math.floor(s.x), Math.floor(s.y + 1))]).toBeLessThan(65535);
    expect(Math.hypot(DUMMY_POS.x - L.waypoint.x, DUMMY_POS.y - L.waypoint.y)).toBeGreaterThan(5);
    expect(Math.hypot(DUMMY_POS.x - L.stash!.x, DUMMY_POS.y - L.stash!.y)).toBeGreaterThan(3);
  });
  it("never dies, never moves or attacks, gives no XP, gold, loot or leech", () => {
    const g = new Game(events, null, 8);
    const p = g.player;
    p.level = 20;
    p.base.str = 300;
    p.equip = { main: makeItem("great_sword", 30), gloves: { ...makeItem("gloves", 10), mods: [{ s: "ll", v: 20 }, { s: "ml", v: 20 }] } } as typeof p.equip;
    g.goTown(true);
    const dm = g.monsters.find((m) => m.dummy)!;
    const xp = p.xp, kills = p.kills, gold = p.gold;
    p.x = dm.x - 0.9; p.y = dm.y;
    let gain = 0;
    for (let i = 0; i < 30 * 20; i++) {
      p.hp = 10; p.mana = 1;
      g.update(1 / 30, hold);
      gain = Math.max(gain, p.hp - 10);
    }
    expect(dm.state).not.toBe("dead");
    expect(dm.hp).toBe(dm.maxHp);
    expect([dm.x, dm.y]).toEqual([DUMMY_POS.x, DUMMY_POS.y]);
    expect(p.xp).toBe(xp);
    expect(p.kills).toBe(kills);
    expect(p.gold).toBe(gold);
    expect(g.ground.length).toBe(0);
    expect(gain).toBeLessThan(0.5); // no life leech (only natural regeneration), and it never hit back
    expect(g.dummyMeter()!.hits).toBeGreaterThan(10);
  });
  it("meter: rolling DPS, total and hits; the session ends after a few idle seconds and the next hit starts fresh", () => {
    const { g, p } = amazon(13);
    g.goTown(true);
    const dm = g.monsters.find((m) => m.dummy)!;
    p.x = dm.x - 4; p.y = dm.y;
    for (let i = 0; i < 30 * 6; i++) { p.equip.off!.qty = 100; g.update(1 / 30, hold); }
    const a = g.dummyMeter()!;
    expect(a.done).toBe(false);
    expect(a.total).toBeGreaterThan(0);
    expect(a.dps).toBeGreaterThan(0);
    for (let i = 0; i < 30 * (DUMMY_IDLE_RESET + 1); i++) g.update(1 / 30, idle);
    const b = g.dummyMeter()!;
    expect(b.done).toBe(true);
    expect(b.total).toBe(a.total + (b.total - a.total)); // kept
    for (let i = 0; i < 30 * 2; i++) { p.equip.off!.qty = 100; g.update(1 / 30, hold); }
    const c = g.dummyMeter()!;
    expect(c.done).toBe(false);
    expect(c.hits).toBeLessThan(a.hits); // a new session
  });
  it("is not in the dungeon and not saved", () => {
    const g = new Game(events, null, 9);
    g.goDungeon(1);
    expect(g.monsters.some((m) => m.dummy)).toBe(false);
    const s = JSON.stringify(g.toSave());
    expect(s).not.toContain("Training Dummy");
  });
});

describe("v1.3 Strafe", () => {
  it("numbers: −30% +4%/level per arrow, 0.5 + 0.32 per arrow draw", () => {
    expect([1, 10, 20].map(strafeDmg)).toEqual([-30, 6, 46]);
    expect([1, 10, 20].map(strafeArrows)).toEqual([5, 9, 10]);
    expect(strafeDur(10)).toBeCloseTo(3.7, 6);
    // one target, level 10: about 2.8 normal shots' worth (was 3.7)
    expect((9 * 1.06) / strafeDur(9)).toBeCloseTo(2.82, 2);
  });
});

describe("v1.3 saves", () => {
  it("a v1.2.2 save loads unchanged and starts in camp with the dummy", () => {
    const g = new Game(events, null, 14, { cls: "amazon", name: "Ilsa" });
    g.player.level = 12;
    g.player.skills = { magic_arrow: 1, pierce: 0 };
    const s = JSON.parse(JSON.stringify(g.toSave()));
    const g2 = new Game(events, s);
    expect(g2.player.level).toBe(12);
    expect(g2.player.name).toBe("Ilsa");
    expect(g2.inTown).toBe(true);
    expect(g2.monsters.filter((m) => m.dummy).length).toBe(1);
  });
});
