// v1.0.1: bigger ammo stacks, levels kept for FLOOR_KEEP_MS, delete hero + 12 slots, bosses that leave their room,
// patch notes.
import { beforeEach, describe, expect, it } from "vitest";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  get length() {
    return this.m.size;
  }
}
const mem = new MemStorage();
(globalThis as unknown as { localStorage: MemStorage }).localStorage = mem;

const save = await import("../src/save");
const { Game, FLOOR_KEEP_MS, BOSS_LEASH } = await import("../src/game");
const { makeItem, qtyMax } = await import("../src/data/items");
const { bfs, idx, isFloor, lineOfSight } = await import("../src/map");
const { PATCH_NOTES, GAME_VERSION } = await import("../src/data/patchNotes");
type G = InstanceType<typeof Game>;
const events = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };

beforeEach(() => {
  mem.clear();
  save.setSlot(1);
  save.loadGame();
});

describe("v1.0.1 ammo stacks", () => {
  it("arrows 1200, javelins 200, axes 240, knives 320", () => {
    expect(makeItem("arrows", 1).qty).toBe(1200);
    expect(makeItem("javelin", 1).qty).toBe(200);
    expect(makeItem("throwing_axe", 1).qty).toBe(240);
    expect(makeItem("throwing_knife", 1).qty).toBe(320);
  });
  it("an old full stack from a save tops up to the new max in camp", () => {
    const g = new Game(events, null, 5, { cls: "amazon", name: "A" });
    const s = g.toSave();
    const e = s.player.equip as Record<string, unknown>;
    e.main = makeItem("long_bow", 1);
    e.off = { ...makeItem("arrows", 1), qty: 600 }; // a full v1.0 quiver
    s.player.bag.push({ item: { ...makeItem("javelin", 3), qty: 100 }, x: 0, y: 0 } as never);
    const g2 = new Game(events, s);
    g2.goTown(true);
    expect(g2.player.equip.off!.qty).toBe(1200);
    const jav = g2.player.bag.find((b) => b.item.baseId === "javelin")!.item;
    expect(jav.qty).toBe(qtyMax(jav));
    expect(jav.qty).toBe(200);
  });
});

function killAll(g: G, f: (m: G["monsters"][number]) => boolean) {
  for (const m of g.monsters) if (f(m) && m.state !== "dead") (g as unknown as { kill(m: unknown): void }).kill(m);
}

describe("v1.0.1 levels stay as you left them", () => {
  it("timer is one constant: 5 minutes", () => expect(FLOOR_KEEP_MS).toBe(300_000));
  it("town and back within 5 min keeps kills, loot and the dead boss; after 5 min the level is fresh", () => {
    let now = 1_000_000;
    const g = new Game(events, null, 9);
    g.now = () => now;
    g.goDungeon(3);
    const total = g.monsters.length;
    const layout = g.level.tiles.slice();
    killAll(g, (m) => m === g.boss || m.x < g.level.w / 2);
    const dead = g.monsters.filter((m) => m.state === "dead").length;
    expect(dead).toBeGreaterThan(1);
    expect(g.stairs).not.toBeNull();
    g.ground.push({ ...g.ground[0], item: makeItem("sword", 3), x: g.player.x, y: g.player.y } as never);
    const groundN = g.ground.length;
    const alive = g.monsters.find((m) => m.state !== "dead")!;
    alive.hp = 1;
    g.travel(0); // waypoint to camp
    now += FLOOR_KEEP_MS - 1000;
    g.travel(3); // waypoint back
    expect(g.monsters.length).toBe(total);
    expect(g.monsters.filter((m) => m.state === "dead").length).toBe(dead);
    expect(g.boss!.state).toBe("dead");
    expect(g.stairs).not.toBeNull();
    expect(g.ground.length).toBe(groundN);
    expect(alive.hp).toBe(alive.maxHp); // survivors heal while you're away
    expect(g.player.x).toBe(g.level.spawn.x);
    // stairs down and waypoint back also keep it
    g.descend?.();
    g.travel(3);
    expect(g.boss!.state).toBe("dead");
    // away 5 minutes: fresh level, same layout
    g.travel(0);
    now += FLOOR_KEEP_MS;
    g.travel(3);
    expect(g.boss!.state).not.toBe("dead");
    expect(g.monsters.every((m) => m.state !== "dead")).toBe(true);
    expect(g.stairs).toBeNull();
    expect([...g.level.tiles]).toEqual([...layout]);
  });
  it("Return to Town + portal still works, and the waypoint then gives the same level", () => {
    let now = 5_000_000;
    const g = new Game(events, null, 11);
    g.now = () => now;
    g.goDungeon(2);
    killAll(g, (m) => m === g.boss);
    g.startRecall();
    for (let i = 0; i < 60; i++) g.update(1 / 30, idle);
    expect(g.inTown).toBe(true);
    expect(g.portal?.floor).toBe(2);
    now += 60_000;
    g.travel(2);
    expect(g.boss!.state).toBe("dead");
  });
});

describe("v1.0.1 bosses leave their room", () => {
  it("a boss follows the hero out of its room through corridors (48 levels)", () => {
    let stuck = 0;
    let tot = 0;
    for (let seed = 1; seed <= 12; seed++)
      for (const floor of [2, 4, 5, 9]) {
        const g = new Game(events, null, seed * 101);
        g.startFloor(floor);
        const b = g.boss!;
        const L = g.level;
        const R = L.bossRoom;
        const dist = bfs(L, Math.floor(b.x), Math.floor(b.y));
        let spot: [number, number] | null = null;
        for (let y = 0; y < L.h && !spot; y++)
          for (let x = 0; x < L.w; x++) {
            const inRoom = x >= R.x - 1 && x <= R.x + R.w && y >= R.y - 1 && y <= R.y + R.h;
            if (!inRoom && isFloor(L, x, y) && dist[idx(x, y)] >= 7 && dist[idx(x, y)] <= 9) {
              spot = [x, y];
              break;
            }
          }
        if (!spot) continue;
        g.monsters = [b];
        const p = g.player;
        p.level = 60; // survives the slams while we watch the boss walk
        p.x = spot[0] + 0.5;
        p.y = spot[1] + 0.5;
        (g as unknown as { aggroPack(m: unknown): void }).aggroPack(b);
        let reached = false;
        for (let t = 0; t < 30 * 15 && !reached; t++) {
          p.hp = 1e6;
          g.update(1 / 30, idle);
          reached = Math.hypot(b.x - p.x, b.y - p.y) < 2;
          if (p.dead) break;
        }
        tot++;
        if (!reached) stuck++;
      }
    expect(tot).toBeGreaterThan(40);
    expect(stuck).toBe(0);
  });
  it("past the leash (and, v1.1, 8 s unseen and unhurt) the boss walks home, healing only once it's there", () => {
    let g!: InstanceType<typeof Game>;
    let best = -1;
    let at = [0, 0];
    for (const seed of [303, 304, 305, 306, 307, 308, 309, 310]) {
      g = new Game(events, null, seed);
      g.startFloor(4);
      const bb = g.boss!;
      const home = bfs(g.level, Math.floor(bb.homeX), Math.floor(bb.homeY));
      best = -1;
      for (let i = 0; i < home.length; i++) if (home[i] !== 65535 && home[i] > best) { best = home[i]; at = [i % g.level.w, Math.floor(i / g.level.w)]; }
      if (best > BOSS_LEASH + 4 && !lineOfSight(g.level, bb.homeX, bb.homeY, at[0] + 0.5, at[1] + 0.5)) break;
    }
    const b = g.boss!;
    g.monsters = [b];
    expect(best).toBeGreaterThan(BOSS_LEASH);
    const p = g.player;
    b.hp = Math.round(b.maxHp * 0.3);
    (g as unknown as { aggroPack(m: unknown): void }).aggroPack(b);
    let gaveUpAt = -1;
    let hpWhenGaveUp = 0;
    let healedOnWay = false;
    for (let t = 0; t < 30 * 90; t++) {
      p.hp = 1e6;
      p.x = at[0] + 0.5; // hero stays far away, out of sight
      p.y = at[1] + 0.5;
      g.update(1 / 30, idle);
      if (gaveUpAt < 0 && b.leashed) {
        gaveUpAt = t / 30;
        hpWhenGaveUp = b.hp;
      } else if (gaveUpAt >= 0 && b.leashed && b.hp > hpWhenGaveUp) healedOnWay = true;
      if (gaveUpAt >= 0 && !b.leashed && Math.hypot(b.x - b.homeX, b.y - b.homeY) < 2) break;
    }
    expect(gaveUpAt).toBeGreaterThanOrEqual(8);
    expect(healedOnWay).toBe(false);
    expect(Math.hypot(b.x - b.homeX, b.y - b.homeY)).toBeLessThan(2);
    expect(b.hp).toBe(b.maxHp);
  });
});

describe("v1.0.1 delete hero, 12 slots", () => {
  function make(n: number, cls: "barbarian" | "amazon", name: string) {
    save.setSlot(n);
    const g = new Game(events, null, n, { cls, name });
    expect(save.saveGame(g.toSave(), { backup: true, force: true })).toBe(true);
    expect(save.saveGame({ ...g.toSave(), savedAt: Date.now() + 1 }, { backup: true, force: true })).toBe(true);
  }
  it("12 slots", () => {
    expect(save.MAX_HEROES).toBe(12);
    for (let n = 1; n <= 12; n++) make(n, n % 2 ? "barbarian" : "amazon", `H${n}`);
    expect(save.listHeroes()).toHaveLength(12);
    expect(save.freeSlot()).toBeNull();
    save.setSlot(13);
    expect(save.currentSlot()).toBe(12);
  });
  it("deletes every key of one slot only; other heroes and the shared stash untouched; slot is reusable", () => {
    make(1, "barbarian", "Conan");
    make(2, "amazon", "Hippo");
    make(3, "amazon", "Penta");
    save.saveSharedStash(123, [{ item: makeItem("sword", 1), x: 0, y: 0 }]);
    const stashBefore = mem.getItem("ember-crypt-stash-shared");
    const others = [1, 3].map((n) => [...mem.m.entries()].filter(([k]) => (n === 1 ? !k.includes("#") : k.endsWith(`#${n}`)) && k.startsWith("ember-crypt-save")));
    save.setSlot(2);
    expect(save.deleteHero(2)).toBe(true);
    expect([...mem.m.keys()].filter((k) => k.endsWith("#2"))).toEqual([]);
    expect(save.readSlot(2)).toBeNull();
    expect(mem.getItem("ember-crypt-stash-shared")).toBe(stashBefore);
    for (const list of others) for (const [k, v] of list) expect(mem.getItem(k)).toBe(v);
    expect(save.listHeroes().map((h) => h.name).sort()).toEqual(["Conan", "Penta"]);
    expect(save.lastSlot()).not.toBe(2);
    expect(save.freeSlot()).toBe(2);
    expect(save.deletedAt(2)).toBeGreaterThan(0);
    expect(save.deletedAt(1)).toBe(0);
    expect(save.deleteHero(2)).toBe(false); // already gone
  });
  it("deleting the original hero (slot 1) leaves slot 2 alone", () => {
    make(1, "barbarian", "Old");
    make(2, "amazon", "New");
    save.deleteHero(1);
    expect(save.readSlot(1)).toBeNull();
    expect(save.readSlot(2)?.player.name).toBe("New");
    expect(save.lastSlot()).toBe(2);
  });
});

describe("v1.0.1 patch notes", () => {
  it("newest first, version label from the first entry", () => {
    expect(GAME_VERSION).toBe("1.6.1");
    const vs = PATCH_NOTES.map((n) => n.version);
    for (const v of ["1.0.1", "1.0", "0.9.4", "0.9.3", "0.9.2", "0.9.1", "0.9", "0.8.3", "0.8.2", "0.8.1"]) expect(vs).toContain(v);
    const num = (v: string) => v.split(".").map(Number).reduce((a, x, i) => a + x * 1000 ** (2 - i), 0);
    for (let i = 1; i < vs.length; i++) expect(num(vs[i - 1])).toBeGreaterThan(num(vs[i]));
    for (const n of PATCH_NOTES) expect(n.notes.length).toBeGreaterThan(0);
  });
});
