// Prints representative monster life/damage per act (normal, champion, unique, level boss, final boss).
import { expect, it } from "vitest";
import { Game, type GameEvents } from "../src/game";
const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
export function sample(floor: number) {
  const g = new Game(events, null, 7);
  g.startFloor(floor);
  const avg = (ms: typeof g.monsters) => ms.length ? { hp: Math.round(ms.reduce((s, m) => s + m.maxHp, 0) / ms.length), dmg: Math.round(ms.reduce((s, m) => s + (m.dmgMin + m.dmgMax) / 2, 0) / ms.length) } : null;
  return {
    normal: avg(g.monsters.filter((m) => m.def.rank === "normal" && !m.elite && !m.minion)),
    champion: avg(g.monsters.filter((m) => m.elite === 1)),
    unique: avg(g.monsters.filter((m) => m.elite === 2)),
    boss: g.boss ? { hp: g.boss.maxHp, dmg: Math.round((g.boss.dmgMin + g.boss.dmgMax) / 2) } : null,
  };
}
it("monster stats table", () => {
  for (const f of [1, 10, 20, 30, 40, 60, 80]) console.log(`floor ${f}: ${JSON.stringify(sample(f))}`);
  expect(sample(1).normal!.hp).toBeGreaterThan(0);
});
