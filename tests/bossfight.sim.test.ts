// v0.9.4: how hard do bosses hit an on-level hero who stands still? Prints hit rate and damage as % of life.
// On-level hero: the level a full clear of every floor before the boss gives (≈ monster level +1..7); 5 stat points
// a level (+2 str, +1 dex, +2 vit); magic gear in every slot rolled at that level (great sword, armor, helm, gloves,
// boots, belt, 2 rings, amulet); no buffs, no skills. Numbers are the median over 25 gear rolls.
import { expect, it } from "vitest";
import { Game, type GameEvents, type Monster } from "../src/game";
import { makeItem } from "../src/data/items";
import { enchant } from "../src/data/affixes";
import { xpPenalty } from "../src/data/acts";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };

const LV: Record<number, number> = {};
{
  const g = new Game(events, null, 5);
  for (let f = 1; f <= 80; f++) {
    g.goDungeon(f);
    for (const m of [...g.monsters]) if (m !== g.boss) g.gainXp(Math.max(1, Math.round(m.xp * xpPenalty(g.player.level, m.mlvl))));
    LV[f] = g.player.level; // level when you reach the boss
    if (g.boss) g.gainXp(Math.max(1, Math.round(g.boss.xp * xpPenalty(g.player.level, g.boss.mlvl))));
  }
}
let seed = 1;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export function hero(g: Game, floor: number) {
  const p = g.player;
  const L = LV[floor];
  p.level = L;
  p.base = { str: 30 + 2 * (L - 1), dex: 20 + (L - 1), vit: 25 + 2 * (L - 1), ene: 10 };
  const mg = (id: string) => enchant(makeItem(id, L), "magic", rng);
  p.equip = { main: mg("great_sword"), chest: mg("armor"), head: mg("helm"), gloves: mg("gloves"), boots: mg("boots"), belt: mg("belt"), ring1: mg("ring"), ring2: mg("ring"), amulet: mg("amulet") } as typeof p.equip;
  p.skills = {};
  for (const k of Object.keys(p.buffs)) (p.buffs as Record<string, number>)[k] = 0;
}

export function bossFight(floor: number, seconds = 60) {
  const g = new Game(events, null, 11);
  g.goDungeon(floor);
  hero(g, floor);
  const p = g.player;
  const d = g.derived();
  const b = g.boss as Monster;
  g.monsters = [b];
  Object.assign(b, { x: p.x + 0.9, y: p.y, homeX: p.x + 0.9, homeY: p.y, state: "chase", atkT: 0.5 }); // v1.0.1: home moved too (bosses leash to their room)
  let swings = 0, rolls = 0, hits = 0, dmg = 0, total = 0, slams = 0, slamDmg = 0;
  const orig = g.hurtPlayer.bind(g);
  g.hurtPlayer = (src, dd, roll) => {
    const before = p.hp;
    if (roll && src.big) rolls++;
    orig(src, dd, roll);
    // poison: count the part that ticks over the next 2.5 s too
    const lost = before - p.hp + (src.elem === "poison" ? p.poison.dps * p.poison.t : 0);
    p.poison = { t: 0, dps: 0 };
    total += Math.max(0, lost);
    if (lost > 0 && roll && src.big) { hits++; dmg += lost; }
    if (lost > 0 && !roll && src.big) { slams++; slamDmg += lost; }
  };
  let prev = b.state;
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) {
    p.hp = d.maxHp; p.dead = false; p.poison = { t: 0, dps: 0 };
    const hx = p.x, hy = p.y;
    g.update(dt, idle);
    p.x = hx; p.y = hy;
    if (b.state === "attack" && prev !== "attack") swings++;
    prev = b.state;
  }
  const hc = Math.max(0.05, Math.min(0.95, 2 * (b.ar / (b.ar + d.def)) * (b.mlvl / (b.mlvl + p.level))));
  const bossHc = Math.max(0.05, Math.min(0.95, (3 * b.ar) / (3 * b.ar + d.def)));
  return { boss: b.def.name, mods: (b.mods ?? []).join("+"), heroLvl: p.level, life: d.maxHp, def: d.def, bossAR: b.ar, formulaHit: Math.round(hc * 100), newFormulaHit: Math.round(bossHc * 100), swings, rolls, hits, avgHitPct: Math.round((100 * dmg) / Math.max(1, hits) / d.maxHp), slamPct: slams ? Math.round((100 * slamDmg) / slams / d.maxHp) : 0, dpsPct: Math.round((1000 * total) / seconds / d.maxHp) / 10 };
}

export function bossTable(f: number, n = 25) {
  seed = 1000 + f;
  const rs = Array.from({ length: n }, () => bossFight(f));
  const med = (k: "life" | "def" | "formulaHit" | "avgHitPct" | "slamPct" | "dpsPct") => rs.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(n / 2)];
  // hit rate of the boss's own swings/shots (rolls), novas etc. not included
  const hitRate = Math.round((100 * rs.reduce((s, r) => s + r.hits, 0)) / rs.reduce((s, r) => s + r.rolls, 0));
  return { floor: f, boss: rs[0].boss, heroLvl: rs[0].heroLvl, life: med("life"), def: med("def"), bossAR: rs[0].bossAR, hitRate, avgHitPct: med("avgHitPct"), slamPct: med("slamPct"), dpsPct: med("dpsPct"), mods: rs[0].mods };
}

it("v0.9.4 bosses: hit a stationary on-level hero ~75-85% of the time for 5-25% of life in Act I, 25-35% from floor 60; act bosses carry both mods", () => {
  const floors = ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FLOORS ?? "1,19,20,39,40,79,80").split(",").map(Number);
  for (const f of floors) {
    const r = bossTable(f);
    console.log(`bossfight ${JSON.stringify(r)}`);
    expect(r.hitRate).toBeGreaterThanOrEqual(70);
    expect(r.hitRate).toBeLessThanOrEqual(90);
    // v1.7.3: Act I bosses average 5-25% of a typical geared hero's life, easing back up to the old 22-40% by floor 60
    expect(r.avgHitPct).toBeGreaterThanOrEqual(f >= 60 ? 22 : f <= 20 ? 5 : 10);
    expect(r.avgHitPct).toBeLessThanOrEqual(f >= 60 ? 40 : f <= 20 ? 25 : 40);
    expect(r.slamPct).toBeGreaterThan(r.avgHitPct); // the telegraphed slam is the big hit
    if (f % 20 === 0) expect(r.mods).toBe("fast+stone");
  }
  expect(bossTable(1).mods).toBe("");
});
