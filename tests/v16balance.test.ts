// v1.6: the Sorceress clears at a similar pace to the Barbarian and the Amazon at levels 1, 10, 30 and 60 (real game
// loop, see classSim.ts): never more than 30% slower than the slower of the two, never faster than 0.6× the faster one.
import { describe, expect, it } from "vitest";
import { BAL_LEVELS, WW_BUILDS, simClear } from "./classSim";

describe("v1.6 Sorceress clear pace vs Barbarian and Amazon (real game loop)", () => {
  it("is in the same band at levels 1, 10, 30 and 60", () => {
    const rows: string[] = [];
    for (const L of BAL_LEVELS) {
      const r = { barbarian: 0, amazon: 0, sorceress: 0 };
      for (const c of ["barbarian", "amazon", "sorceress"] as const) {
        let t = 0;
        for (let k = 0; k < 5; k++) t += simClear(c, L);
        r[c] = t / 5;
      }
      // v1.6.1: Barbarian with Whirlwind (level 30+), printed for reference only (not part of the band)
      const ww = WW_BUILDS[L];
      let wt = 0;
      if (ww) for (let k = 0; k < 5; k++) wt += simClear("barbarian", L, 5, 300, ww);
      rows.push(`| ${L} | ${r.barbarian.toFixed(1)} s | ${ww ? `${(wt / 5).toFixed(1)} s` : "–"} | ${r.amazon.toFixed(1)} s | ${r.sorceress.toFixed(1)} s |`);
      expect(r.sorceress, `level ${L}`).toBeLessThanOrEqual(1.3 * Math.max(r.barbarian, r.amazon));
      expect(r.sorceress, `level ${L}`).toBeGreaterThanOrEqual(0.6 * Math.min(r.barbarian, r.amazon));
    }
    console.log(["| Level | Barbarian (Bash/Concentrate) | Barbarian (Whirlwind) | Amazon | Sorceress |", ...rows].join("\n"));
  }, 300000);
});
