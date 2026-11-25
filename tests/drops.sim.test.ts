// Drop-rate simulation (prints numbers; asserts the v0.9.1 targets). Kills many monsters on an Act II floor.
import { expect, it } from "vitest";
import { Game, type GameEvents, type Monster } from "../src/game";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const kill = (g: Game, m: Monster) => (g as unknown as { kill(m: Monster): void }).kill(m);

export function simulate(kind: "normal" | "champion" | "unique", n: number) {
  const g = new Game(events, null, 9);
  g.player.level = 30;
  g.goDungeon(25);
  const proto = g.monsters.find((m) => m.def.rank === "normal" && !m.minion)!;
  const out = { items: 0, normal: 0, magic: 0, rare: 0, gold: 0, potions: 0 };
  for (let i = 0; i < n; i++) {
    g.ground = [];
    const m = { ...proto, hp: 0, state: "chase", elite: kind === "champion" ? 1 : kind === "unique" ? 2 : 0, mods: [] } as Monster;
    g.monsters = [m];
    kill(g, m);
    for (const gi of g.ground) {
      if (gi.gold) out.gold++;
      else if (gi.item?.baseId.endsWith("_potion")) out.potions++;
      else if (gi.item) {
        out.items++;
        out[(gi.item.q ?? "normal") as "normal" | "magic" | "rare"]++;
      }
    }
  }
  return out;
}

it("drop rates (v0.9.1: items halved, mix kept, gold and potions unchanged)", () => {
  const N = 40000;
  const nm = simulate("normal", N), ch = simulate("champion", N / 4), un = simulate("unique", N / 4);
  const pct = (x: number, n: number) => ((100 * x) / n).toFixed(1);
  console.log(`normal monster: items ${pct(nm.items, N)}% per kill (normal/magic/rare ${pct(nm.normal, nm.items)}/${pct(nm.magic, nm.items)}/${pct(nm.rare, nm.items)}%), gold ${pct(nm.gold, N)}%, potions ${pct(nm.potions, N)}%`);
  console.log(`champion: ${(ch.items / (N / 4)).toFixed(2)} items/kill (n/m/r ${pct(ch.normal, ch.items)}/${pct(ch.magic, ch.items)}/${pct(ch.rare, ch.items)}%)`);
  console.log(`unique: ${(un.items / (N / 4)).toFixed(2)} items/kill (n/m/r ${pct(un.normal, un.items)}/${pct(un.magic, un.items)}/${pct(un.rare, un.items)}%)`);
  expect(nm.items / N).toBeGreaterThan(0.075);
  expect(nm.items / N).toBeLessThan(0.095);
  expect(nm.gold / N).toBeGreaterThan(0.18);
  expect(nm.potions / N).toBeGreaterThan(0.08);
  expect(ch.items / (N / 4)).toBeGreaterThan(0.45);
  expect(ch.items / (N / 4)).toBeLessThan(0.55);
  expect(un.items / (N / 4)).toBe(1);
  // the normal/magic/rare mix of a normal monster's drops is unchanged (36/51/13 before)
  expect(Math.abs(nm.normal / nm.items - 0.364)).toBeLessThan(0.03);
  expect(Math.abs(nm.rare / nm.items - 0.127)).toBeLessThan(0.025);
});
