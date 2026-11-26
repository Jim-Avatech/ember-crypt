// Monster life/damage snapshot for every floor, from a fixed seed (used to prove v1.1's difficulty curve leaves
// floors 60–80 and boss damage exactly as they were in v1.0.1). Run against v1.0.1 to make v101-monsters.json.
import { Game, type GameEvents } from "../../src/game";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
export type Snap = Record<number, { mons: [string, number, number, number][]; boss: [number, number, number] | null }>;

export function monsterSnapshot(): Snap {
  let seed = 4242;
  const real = Math.random;
  Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Snap = {};
  try {
    const g = new Game(events, null, 4242);
    const gg = g as unknown as { floorCache?: Map<number, unknown> };
    for (let f = 1; f <= 80; f++) {
      g.goTown(true);
      gg.floorCache?.clear();
      g.goDungeon(f);
      const mons = g.monsters
        .filter((m) => m !== g.boss && !m.minion)
        .map((m) => [m.def.name, m.maxHp, m.dmgMin, m.dmgMax] as [string, number, number, number])
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1] || a[2] - b[2] || a[3] - b[3]));
      const b = g.boss;
      out[f] = { mons, boss: b ? [b.maxHp, b.dmgMin, b.dmgMax] : null };
    }
  } finally {
    Math.random = real;
  }
  return out;
}
