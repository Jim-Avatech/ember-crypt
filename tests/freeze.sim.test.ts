// v1.3: a cold Amazon (Freezing Arrow on ⚔, held) against each floor boss: time to kill, share of the fight the boss
// spends frozen, and the damage it lands (% of the hero's life per second). Prints a table; checks no freeze-lock.
import { expect, it } from "vitest";
declare const process: { env: Record<string, string | undefined> };
import { Game, type GameEvents, type Monster } from "../src/game";
import { makeItem } from "../src/data/items";
import { enchant } from "../src/data/affixes";
import { xpPenalty } from "../src/data/acts";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const hold = { mx: 0, my: 0, mag: 0, attack: true, skills: [false, false, false] };
const LV: Record<number, number> = {};
{
  const g = new Game(events, null, 5);
  for (let f = 1; f <= 80; f++) {
    g.goDungeon(f);
    for (const m of [...g.monsters]) if (m !== g.boss) g.gainXp(Math.max(1, Math.round(m.xp * xpPenalty(g.player.level, m.mlvl))));
    LV[f] = g.player.level;
    if (g.boss) g.gainXp(Math.max(1, Math.round(g.boss.xp * xpPenalty(g.player.level, g.boss.mlvl))));
  }
}
let seed = 1;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

export function coldFight(floor: number, cap = 180) {
  const g = new Game(events, null, 11, { cls: "amazon", name: "" });
  g.goDungeon(floor);
  const p = g.player;
  const L = LV[floor];
  p.level = L;
  // on-level cold bow Amazon: Dexterity first, then Strength for the bow, the rest Vitality
  p.base = { str: 25 + 1.5 * (L - 1), dex: 25 + 2.5 * (L - 1), vit: 20 + (L - 1), ene: 15 };
  const mg = (id: string) => enchant(makeItem(id, L), "magic", rng);
  p.equip = { main: mg("long_bow"), off: makeItem("arrows", 1), chest: mg("armor"), head: mg("helm"), gloves: mg("gloves"), boots: mg("boots"), belt: mg("belt"), ring1: mg("ring"), ring2: mg("ring"), amulet: mg("amulet") } as typeof p.equip;
  for (let i = 0; i < 60 && !g.usable("main"); i++) { p.base.str += 3; p.base.dex += 3; } // meet the bow's requirements
  // skill points: one per level, the cold line first
  const pts = Math.max(1, L - 1);
  const fa = Math.min(20, Math.max(1, Math.floor(pts * 0.45)));
  const ia = Math.min(20, Math.max(1, Math.floor(pts * 0.3)));
  p.skills = { magic_arrow: 1, cold_arrow: Math.max(1, Math.floor(pts * 0.15)), ice_arrow: ia, freezing_arrow: fa };
  // the best freezing skill the hero's level allows on ⚔ (Ice Arrow from 18, Freezing Arrow from 30)
  const skill = L >= 30 ? "freezing_arrow" : "ice_arrow";
  p.mainAtk = skill;
  const b = g.boss as Monster;
  g.monsters = [b];
  const R = g.level.bossRoom;
  p.x = R.cx + 0.5 - 2.5; p.y = R.cy + 0.5;
  Object.assign(b, { x: p.x + 5, y: p.y, homeX: p.x + 5, homeY: p.y, state: "chase", atkT: 0.5 });
  let frozen = 0, t = 0, taken = 0, longestFrozen = 0, run = 0;
  const orig = g.hurtPlayer.bind(g);
  g.hurtPlayer = (src, dd, roll) => {
    const before = p.hp;
    orig(src, dd, roll);
    taken += Math.max(0, before - p.hp + (src.elem === "poison" ? p.poison.dps * p.poison.t : 0));
    p.poison = { t: 0, dps: 0 };
  };
  const d = g.derived();
  const dt = 1 / 30;
  for (; t < cap && b.state !== "dead"; t += dt) {
    p.hp = d.maxHp; p.mana = d.maxMana; p.dead = false;
    (p.equip.off as { qty?: number }).qty = 500;
    const hx = p.x, hy = p.y;
    g.update(dt, hold);
    p.x = hx; p.y = hy;
    if ((b.frozenT ?? 0) > 0) { frozen += dt; run += dt; longestFrozen = Math.max(longestFrozen, run); } else run = 0;
  }
  if (process.env.DBG) console.log("dbg", floor, b.hp, b.maxHp, Math.hypot(b.x - p.x, b.y - p.y).toFixed(1), b.state, p.action?.type, g.skillLevel(skill), p.mainAtk, d.dps.toFixed(1));
  return { skill, floor, boss: b.def.name, rank: b.def.rank, heroLvl: L, fa, ttk: Math.round(t * 10) / 10, killed: b.state === "dead", frozenPct: Math.round((100 * frozen) / t), longestFrozen: Math.round(longestFrozen * 10) / 10, takenPctLifePerS: Math.round((1000 * taken) / t / d.maxHp) / 10 };
}

it("v1.3 freeze: a cold Amazon can't freeze-lock bosses but still kills them", () => {
  const floors = ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FLOORS ?? "10,20,30,40,50,60,70,80").split(",").map(Number);
  for (const f of floors) {
    seed = 500 + f;
    const rs = [0, 1, 2].map(() => coldFight(f));
    const med = <K extends "ttk" | "frozenPct" | "longestFrozen" | "takenPctLifePerS">(k: K) => rs.map((r) => r[k]).sort((a, b) => a - b)[1];
    const row = { skill: rs[0].skill, floor: f, boss: rs[0].boss, rank: rs[0].rank, heroLvl: rs[0].heroLvl, freezingArrowLvl: rs[0].fa, ttk: med("ttk"), killed: rs.filter((r) => r.killed).length, frozenPct: med("frozenPct"), longestFrozen: med("longestFrozen"), takenPctLifePerS: med("takenPctLifePerS") };
    console.log(`coldfight ${JSON.stringify(row)}`);
    expect(row.killed).toBe(3);
    if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.OLD_RULES) continue;
    expect(row.frozenPct).toBeLessThan(45); // never locked
    expect(row.longestFrozen).toBeLessThan(2);
  }
}, 120000);
