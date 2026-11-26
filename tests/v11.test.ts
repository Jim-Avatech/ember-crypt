// v1.1: difficulty curve, class-leaning loot, unusable (red) gear, class-locked +skills, buy-back, Character text,
// boss leash, Amazon speed, monsters giving up / Fallen scattering, potions to belt, 3-wide corridors, waypoint
// stones only on waypoint levels, per-hero stash gold.
import v101Monsters from "./fixtures/v101-monsters.json";
import { describe, expect, it } from "vitest";
import { enchant, skillPoolFor } from "../src/data/affixes";
import { hasWaypoint } from "../src/data/acts";
import { BASE_BY_ID, CLASS_DROP_WEIGHTS, ITEM_BASES, type Item, dropWeight, itemReqs, makeItem, sellPrice } from "../src/data/items";
import { SKILL_BY_ID } from "../src/data/skills";
import { GAME_VERSION } from "../src/data/patchNotes";
import {
  AMAZON_SPEED, BOSS_GIVE_UP, BOSS_LEASH, BOW_RELEASE, BUYBACK_MAX, CHASE_LOST_S, CLASS_WEAPONS, CURVE_END, FALLEN_SCATTER_S, Game, type GameEvents,
  curveDmg, curveHp,
} from "../src/game";
import { CORRIDOR_W, bfs, generateLevel, idx, isFloor, lineOfSight } from "../src/map";
import { monsterSnapshot, type Snap } from "./fixtures/monsnap";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };
type Mon = Game["monsters"][number];
const priv = (g: Game) => g as unknown as { kill(m: Mon): void; aggroPack(m: Mon): void; startThrow(s: string | null, h: number[], d: ReturnType<Game["derived"]>): void };

describe("v1.1 difficulty curve", () => {
  it("floor 1 is 80% life / 90% damage, rising in a straight line to 100% at floor 60 and after", () => {
    expect(GAME_VERSION).toBe("1.2.1");
    expect(CURVE_END).toBe(60);
    expect(curveHp(1)).toBeCloseTo(0.8);
    expect(curveDmg(1)).toBeCloseTo(0.9);
    expect(curveHp(60)).toBe(1);
    expect(curveDmg(60)).toBe(1);
    for (const f of [61, 70, 80]) expect([curveHp(f), curveDmg(f)]).toEqual([1, 1]);
    // linear
    expect(curveHp(30.5)).toBeCloseTo(0.9);
    expect(curveDmg(30.5)).toBeCloseTo(0.95);
    for (let f = 2; f <= 60; f++) expect(curveHp(f)).toBeGreaterThan(curveHp(f - 1));
  });

  const old = v101Monsters as unknown as Snap;
  const now = monsterSnapshot();
  it("floors 60–80 are exactly as in v1.0.1 (same monsters, life and damage, bosses included)", () => {
    for (let f = 60; f <= 80; f++) expect(now[f], `floor ${f}`).toEqual(old[f]);
  });
  it("boss damage is unchanged on every floor; boss life follows the curve", () => {
    for (let f = 1; f <= 80; f++) {
      const o = old[f].boss!;
      const n = now[f].boss!;
      expect([n[1], n[2]], `floor ${f}`).toEqual([o[1], o[2]]);
      expect(n[0] / o[0]).toBeCloseTo(curveHp(f), 2);
    }
  });
  it("below 60, the same monsters with life ×curveHp and damage ×curveDmg", () => {
    let n = 0;
    let floors = 0;
    for (let f = 1; f < 60; f++) {
      // 3-wide corridors shift where packs can stand on a few levels (same seed, other monsters): skip those
      if (JSON.stringify(now[f].mons.map((m) => m[0])) !== JSON.stringify(old[f].mons.map((m) => m[0]))) continue;
      floors++;
      for (let i = 0; i < old[f].mons.length; i++) {
        const [, oh, olo, ohi] = old[f].mons[i];
        const [, nh, nlo, nhi] = now[f].mons[i];
        expect(Math.abs(nh - oh * curveHp(f))).toBeLessThanOrEqual(1.5 + oh * 0.01);
        expect(Math.abs(nhi - ohi * curveDmg(f))).toBeLessThanOrEqual(2 + ohi * 0.01);
        expect(nlo).toBeLessThanOrEqual(olo);
        n++;
      }
    }
    expect(floors).toBeGreaterThan(50);
    expect(n).toBeGreaterThan(1000);
    // floor 1 monsters really are easier
    const life = (s: Snap, f: number) => s[f].mons.reduce((a, m) => a + m[1], 0);
    expect(life(now, 1) / life(old, 1)).toBeCloseTo(0.8, 1);
  });
});

describe("v1.1 class-leaning loot", () => {
  it("each class's own weapons weigh more; overall drop weights (weapon vs armor share) are unchanged", () => {
    const sum = (cls?: string) => ITEM_BASES.reduce((a, b) => a + dropWeight(b, cls), 0);
    const weapons = (cls?: string) => ITEM_BASES.filter((b) => b.slot === "weapon").reduce((a, b) => a + dropWeight(b, cls), 0);
    for (const cls of ["amazon", "barbarian"]) {
      expect(sum(cls)).toBeCloseTo(sum(), 6);
      expect(weapons(cls)).toBeCloseTo(weapons(), 6);
    }
    for (const id of CLASS_WEAPONS.amazon) expect(CLASS_DROP_WEIGHTS.amazon[id]).toBeGreaterThan(CLASS_DROP_WEIGHTS.barbarian[id]);
    for (const id of CLASS_WEAPONS.barbarian) expect(CLASS_DROP_WEIGHTS.barbarian[id]).toBeGreaterThan(CLASS_DROP_WEIGHTS.amazon[id]);
  });
  it("Hilde always has a magic weapon for your class", () => {
    for (const cls of ["amazon", "barbarian"] as const) {
      for (let s = 1; s <= 25; s++) {
        const g = new Game(events, null, s * 97, { cls, name: "" });
        g.maxFloor = 1 + (s % 40);
        g.time = s * 3.3;
        g.restock();
        const magic = g.vendorStock.filter((e) => e.item.q === "magic").map((e) => e.item.baseId);
        expect(magic.some((id) => CLASS_WEAPONS[cls].includes(id)), `${cls} seed ${s}: ${magic}`).toBe(true);
      }
    }
  });
});

describe("v1.1 +skill rolls match the item", () => {
  const tabOf = (ids: string[]) => new Set(ids.map((id) => SKILL_BY_ID[id].tab));
  const clsOf = (ids: string[]) => new Set(ids.map((id) => SKILL_BY_ID[id].cls));
  it("bows: Bow & Crossbow; javelins and spears: Javelin & Spear; other weapons and helms: Barbarian", () => {
    for (const id of ["short_bow", "long_bow"]) expect([...tabOf(skillPoolFor(id))]).toEqual(["bow"]);
    for (const id of ["javelin", "spear"]) expect([...tabOf(skillPoolFor(id))]).toEqual(["javelin"]);
    for (const id of ["sword", "axe", "mace", "great_sword", "quarterstaff", "throwing_axe", "throwing_knife", "helm"]) expect([...clsOf(skillPoolFor(id))]).toEqual(["barbarian"]);
  });
  it("amulets: mostly the finder's class, sometimes any class", () => {
    expect([...clsOf(skillPoolFor("amulet", () => 0, "amazon"))]).toEqual(["amazon"]);
    expect(clsOf(skillPoolFor("amulet", () => 0.99, "amazon")).size).toBe(2);
    expect(clsOf(skillPoolFor("amulet")).size).toBe(2);
  });
  it("dropped items follow the rule", () => {
    const g = new Game(events, null, 3, { cls: "amazon", name: "" });
    let checked = 0;
    for (let i = 0; i < 3000 && checked < 150; i++) {
      const it = makeItem(["long_bow", "javelin", "sword", "helm"][i % 4], 30);
      enchant(it, "rare", Math.random, g.player.cls);
      for (const m of it.mods ?? []) {
        if (m.s !== "skill") continue;
        const sd = SKILL_BY_ID[m.sk!];
        const b = BASE_BY_ID[it.baseId];
        if (b.kind === "bow") expect(sd.tab).toBe("bow");
        else if (b.kind === "spear") expect(sd.tab).toBe("javelin");
        else expect(sd.cls).toBe("barbarian");
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe("v1.1 gear you can't use stops working (red items)", () => {
  const dexRing = (v: number): Item => ({ ...makeItem("ring", 1), q: "magic", name: "Dex Ring", mods: [{ s: "dex", v }] });
  it("a bow worn thanks to a Dexterity ring stops working when the ring comes off, and works again with it", () => {
    const g = new Game(events, null, 21, { cls: "amazon", name: "" });
    const p = g.player;
    p.level = 30;
    const bow = makeItem("long_bow", 20);
    bow.mods = [{ s: "ll", v: 5 }];
    bow.q = "magic";
    const need = itemReqs(bow).dex;
    p.base.dex = need - 10;
    p.base.str = 200;
    p.equip = { main: bow, ring1: dexRing(10) };
    expect(g.usable("main")).toBe(true);
    expect(g.derived().ll).toBe(5);
    delete p.equip.ring1;
    expect(g.usable("main")).toBe(false);
    expect(g.derived().ll).toBe(0);
    expect(g.derived().hands[0].slot ?? null).toBe(null); // fists
    // shooting is refused with a hint
    const hints: string[] = [];
    g.hint = (t: string) => void hints.push(t);
    expect(g.castBasic("basic_shoot", g.derived())).toBe(false);
    expect(hints.join()).toMatch(/can't use your .*Dexterity/);
    p.equip.ring1 = dexRing(10);
    expect(g.usable("main")).toBe(true);
  });
  it("an item's own bonuses don't count toward its own requirements; armor and +skills vanish too", () => {
    const g = new Game(events, null, 22);
    const p = g.player;
    p.level = 40;
    const helm = makeItem("helm", 30);
    helm.q = "magic";
    const req = itemReqs(helm).str;
    helm.mods = [{ s: "str", v: 50 }, { s: "skill", v: 2, sk: "bash" }];
    p.skills = { bash: 1 };
    p.base.str = req - 5;
    const before = g.derived().def;
    p.equip.head = helm;
    expect(g.usable("head")).toBe(false);
    expect(g.derived().def).toBe(before);
    expect(g.skillLevel("bash")).toBe(1);
    p.base.str = req;
    expect(g.usable("head")).toBe(true);
    expect(g.derived().def).toBeGreaterThan(before);
    expect(g.skillLevel("bash")).toBe(3);
  });
  it("level requirements count too", () => {
    const g = new Game(events, null, 23);
    const amu: Item = { ...makeItem("amulet", 40), q: "magic", mods: [{ s: "life", v: 30 }] };
    g.player.equip.amulet = amu;
    expect(g.usable("amulet")).toBe(false);
    const hp = g.derived().maxHp;
    g.player.level = 40;
    expect(g.usable("amulet")).toBe(true);
    expect(g.derived().maxHp).toBeGreaterThan(hp + 29);
  });
});

describe("v1.1 buy-back", () => {
  it("sold items go to a buy-back row (last 8) and never push out Hilde's wares", () => {
    const g = new Game(events, null, 31);
    g.goTown(true);
    g.restock();
    const stock = g.vendorStock.map((e) => e.item.uid);
    const sold: Item[] = [];
    for (let i = 0; i < 10; i++) {
      const it = makeItem(["sword", "helm", "boots", "gloves", "great_sword"][i % 5], 5);
      g.player.bag = [{ item: it, x: 0, y: 0 }];
      expect(g.sell(it.uid)).toBeGreaterThan(0);
      sold.push(it);
    }
    expect(g.vendorStock.map((e) => e.item.uid)).toEqual(stock);
    expect(g.buyback.length).toBe(BUYBACK_MAX);
    expect(g.buyback[0]).toBe(sold[9]);
    expect(g.buyback.includes(sold[0])).toBe(false);
    const it = sold[8];
    g.player.gold = 1000;
    expect(g.buyBack(it.uid)).toBe(null);
    expect(g.player.gold).toBe(1000 - sellPrice(it));
    expect(g.player.bag.some((e) => e.item === it)).toBe(true);
    expect(g.buyback.includes(it)).toBe(false);
    g.player.gold = 0;
    expect(g.buyBack(g.buyback[0].uid)).toBe("Not enough gold");
  });
});

describe("v1.1 boss leash and monsters giving up", () => {
  const frozen = (m: Mon) => (m.def = { ...m.def, speed: 0 });
  it("a boss beyond the leash gives up only after 8 s unhit and unseen; a hit restarts the clock", () => {
    expect(BOSS_LEASH).toBe(45);
    let g!: Game;
    let at = [0, 0];
    for (let seed = 400; seed < 440; seed++) {
      g = new Game(events, null, seed);
      g.startFloor(6);
      const b = g.boss!;
      const home = bfs(g.level, Math.floor(b.homeX), Math.floor(b.homeY));
      let best = -1;
      for (let i = 0; i < home.length; i++) if (home[i] !== 65535 && home[i] > best) { best = home[i]; at = [i % g.level.w, Math.floor(i / g.level.w)]; }
      if (best > BOSS_LEASH + 2 && !lineOfSight(g.level, b.x, b.y, at[0] + 0.5, at[1] + 0.5)) break;
    }
    const b = g.boss!;
    g.monsters = [b];
    frozen(b);
    priv(g).aggroPack(b);
    const p = g.player;
    const run = (s: number) => {
      for (let t = 0; t < s * 30; t++) {
        p.x = at[0] + 0.5;
        p.y = at[1] + 0.5;
        p.hp = 1e6;
        g.update(1 / 30, idle);
      }
    };
    // (the boss is frozen in its room, so once it gives up it is home at once: idle, back to full life)
    b.hp = Math.round(b.maxHp / 2);
    run(BOSS_GIVE_UP - 1.5);
    expect(b.state).not.toBe("idle");
    b.lastHurt = g.time; // you hit it
    run(BOSS_GIVE_UP - 1.5);
    expect(b.state).not.toBe("idle");
    expect(b.hp).toBeLessThan(b.maxHp);
    run(2.5);
    expect(b.state).toBe("idle");
    expect(b.hp).toBe(b.maxHp);
  });
  it("normal monsters give up after 5 s out of sight and more than 12 tiles away, not while in sight", () => {
    const g = new Game(events, null, 51);
    g.startFloor(3);
    const m = g.monsters.find((q) => q.def.rank === "normal" && !q.minion && q.elite === 0)!;
    g.monsters = [m];
    frozen(m);
    const p = g.player;
    // a floor tile 13+ tiles away and out of sight, and one in sight
    let hidden: number[] | null = null;
    for (let y = 1; y < g.level.h && !hidden; y++)
      for (let x = 1; x < g.level.w; x++)
        if (isFloor(g.level, x, y) && Math.hypot(x + 0.5 - m.x, y + 0.5 - m.y) > 14 && !lineOfSight(g.level, m.x, m.y, x + 0.5, y + 0.5)) { hidden = [x + 0.5, y + 0.5]; break; }
    expect(hidden).not.toBe(null);
    priv(g).aggroPack(m);
    const run = (s: number, pos: number[]) => {
      for (let t = 0; t < s * 30; t++) {
        p.x = pos[0];
        p.y = pos[1];
        g.update(1 / 30, idle);
      }
    };
    run(CHASE_LOST_S - 1, hidden!);
    expect(m.state).not.toBe("idle");
    run(1.5, hidden!);
    expect(m.state).toBe("idle");
  });
  it("Fallen scatter for a moment when a packmate dies", () => {
    let done = false;
    for (let seed = 1; seed < 60 && !done; seed++) {
      const g = new Game(events, null, seed);
      g.startFloor(1 + (seed % 4));
      const fallen = g.monsters.filter((m) => m.def.species === "fallen" && m.def.rank === "normal");
      const a = fallen.find((m) => fallen.some((o) => o !== m && o.pack === m.pack && Math.hypot(o.x - m.x, o.y - m.y) < 6));
      if (!a) continue;
      const mates = fallen.filter((o) => o !== a && o.pack === a.pack && Math.hypot(o.x - a.x, o.y - a.y) < 6);
      priv(g).kill(a);
      for (const o of mates) {
        expect(o.fearT).toBeCloseTo(FALLEN_SCATTER_S);
        expect(o.flee).toEqual({ x: a.x, y: a.y });
      }
      done = true;
    }
    expect(done).toBe(true);
  });
});

describe("v1.1 Amazon speed", () => {
  it("Amazons shoot bows and throw javelins 15% faster; arrows leave sooner", () => {
    const shoot = (cls: "amazon" | "barbarian") => {
      const g = new Game(events, null, 61, { cls, name: "" });
      g.player.base.dex = 300;
      g.player.base.str = 300;
      g.player.equip = { main: makeItem("short_bow", 1), off: makeItem("arrows", 1) };
      g.startShoot(null, g.derived());
      const a = g.player.action as { dur: number; releaseAt: number[] };
      return a;
    };
    const am = shoot("amazon");
    const ba = shoot("barbarian");
    expect(ba.dur / am.dur).toBeCloseTo(AMAZON_SPEED);
    expect(am.releaseAt).toEqual([BOW_RELEASE]);
    expect(BOW_RELEASE).toBe(0.5);
    const thr = (cls: "amazon" | "barbarian") => {
      const g = new Game(events, null, 62, { cls, name: "" });
      g.player.base.dex = 300;
      g.player.base.str = 300;
      g.player.equip = { main: makeItem("javelin", 1) };
      priv(g).startThrow(null, [0], g.derived());
      return (g.player.action as { dur: number }).dur;
    };
    expect(thr("barbarian") / thr("amazon")).toBeCloseTo(AMAZON_SPEED);
  });
});

describe("v1.1 potions", () => {
  it("To belt moves a potion from the bag or stash; drinking from the belt refills it from the bag", () => {
    const g = new Game(events, null, 71);
    g.goTown(true);
    const p = g.player;
    const cap = g.beltCap();
    p.hpPots = cap - 2;
    const a = makeItem("hp_potion");
    const b = makeItem("hp_potion");
    p.bag = [{ item: a, x: 0, y: 0 }];
    p.stash = [{ item: b, x: 0, y: 0 }];
    expect(g.toBelt(a.uid)).toBe(null);
    expect(g.toBelt(b.uid)).toBe(null);
    expect(p.hpPots).toBe(cap);
    expect(p.bag.length + p.stash.length).toBe(0);
    const c = makeItem("hp_potion");
    p.bag = [{ item: c, x: 0, y: 0 }];
    expect(g.toBelt(c.uid)).toBe("Your belt is full");
    g.usePotion("hp");
    expect(p.hpPots).toBe(cap);
    expect(p.bag.length).toBe(0);
  });
});

describe("v1.1 maps and waypoints", () => {
  it("corridors are 3 tiles wide: every floor tile sits in a 3×3 block of floor", () => {
    expect(CORRIDOR_W).toBe(3);
    for (let s = 1; s <= 30; s++) {
      const L = generateLevel(s * 7919);
      const block = (x: number, y: number) => {
        for (let oy = -2; oy <= 0; oy++)
          for (let ox = -2; ox <= 0; ox++) {
            let ok = true;
            for (let dy = 0; dy < 3 && ok; dy++) for (let dx = 0; dx < 3 && ok; dx++) ok = isFloor(L, x + ox + dx, y + oy + dy);
            if (ok) return true;
          }
        return false;
      };
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.tiles[idx(x, y)] === 1) expect(block(x, y), `seed ${s} ${x},${y}`).toBe(true);
    }
  });
  it("only camp and waypoint levels have a waypoint stone", () => {
    const g = new Game(events, null, 81);
    g.goTown(true);
    expect(g.waypointHere()).toBe(true);
    for (const f of [1, 2, 4, 5, 6, 10, 19, 20, 21, 25]) {
      g.goTown(true);
      g.goDungeon(f);
      expect(g.waypointHere(), `floor ${f}`).toBe(hasWaypoint(f));
      g.player.x = g.level.waypoint.x;
      g.player.y = g.level.waypoint.y;
      expect(g.nearWaypoint()).toBe(hasWaypoint(f));
    }
  });
});

describe("v1.1 stash gold (per hero)", () => {
  it("deposit/withdraw in camp, kept on death (only carried gold loses 10%), saved with the hero", () => {
    const g = new Game(events, null, 91);
    g.goTown(true);
    const p = g.player;
    p.gold = 1000;
    expect(g.moveStashGold(600)).toBe(600);
    expect([p.gold, p.stashGold]).toEqual([400, 600]);
    expect(g.moveStashGold(-100)).toBe(-100);
    expect([p.gold, p.stashGold]).toEqual([500, 500]);
    expect(g.moveStashGold(10_000)).toBe(500);
    expect(g.moveStashGold(-500)).toBe(-500);
    g.moveStashGold(300);
    g.goDungeon(2);
    expect(g.moveStashGold(100)).toBe(0); // only in camp
    g.respawn();
    expect(p.gold).toBe(200 - 20);
    expect(p.stashGold).toBe(800);
    const save = JSON.parse(JSON.stringify(g.toSave()));
    expect(save.player.stashGold).toBe(800);
    const g2 = new Game(events, save);
    expect(g2.player.stashGold).toBe(800);
    // a save from before v1.1 has none
    delete save.player.stashGold;
    expect(new Game(events, save).player.stashGold).toBe(0);
    save.player.stashGold = "junk";
    expect(new Game(events, save).player.stashGold).toBe(0);
  });
});
