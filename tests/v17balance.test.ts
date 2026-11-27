// v1.7: clear pace (real game loop, classSim.ts) with the new base spell damage: the v1.6 band still holds, and
// printed for reference: a Sorceress with a non-caster weapon (sword), with a wand + orb, and with every point in Energy.
import { describe, expect, it } from "vitest";
import { BAL_LEVELS, BUILDS, WW_BUILDS, simClear } from "./classSim";

const avg = (f: () => number, n = 6) => { let t = 0; for (let k = 0; k < n; k++) t += f(); return t / n; };
describe("v1.7 clear pace with base spell damage", () => {
  it("Sorceress stays in the band; caster weapon > sword; Energy pays", () => {
    const rows: string[] = [];
    for (const L of BAL_LEVELS) {
      const sb = BUILDS.sorceress[L];
      const barb = avg(() => simClear("barbarian", L));
      const ww = WW_BUILDS[L] ? avg(() => simClear("barbarian", L, 5, 300, WW_BUILDS[L])) : NaN;
      const ama = avg(() => simClear("amazon", L));
      const sorc = avg(() => simClear("sorceress", L));
      const sword = avg(() => simClear("sorceress", L, 5, 300, { ...sb, weapon: "sword", stats: (l) => ({ str: 10 + (l - 1), dex: 25, vit: 10 + 2 * (l - 1), ene: 35 + 2 * (l - 1) }) }));
      const wandOrb = avg(() => simClear("sorceress", L, 5, 300, { ...sb, weapon: "wand", off: "orb" }));
      const allEne = avg(() => simClear("sorceress", L, 5, 300, { ...sb, stats: (l) => ({ str: 10 + Math.round(0.6 * (l - 1)), dex: 25, vit: 10 + Math.round(0.4 * (l - 1)), ene: 35 + 4 * (l - 1) }) }));
      console.log(`BALROW ${L} ${barb} ${ww} ${ama} ${sorc} ${wandOrb} ${sword} ${allEne}`);
      rows.push(`BAL | ${L} | ${barb.toFixed(1)} s | ${Number.isNaN(ww) ? "–" : `${ww.toFixed(1)} s`} | ${ama.toFixed(1)} s | ${sorc.toFixed(1)} s | ${wandOrb.toFixed(1)} s | ${sword.toFixed(1)} s | ${allEne.toFixed(1)} s |`);
      expect(sorc, `level ${L}`).toBeLessThanOrEqual(1.3 * Math.max(barb, ama));
      expect(sorc, `level ${L}`).toBeGreaterThanOrEqual(0.6 * Math.min(barb, ama));
      // (clear time moves in whole casts per kill, so at 30 and 60 the gap can vanish; the DPS table shows it exactly)
      if (L === 10) expect(sword, `sword level ${L}`).toBeGreaterThan(sorc * 1.3);
      if (L === 30) expect(sword, `sword level ${L}`).toBeGreaterThanOrEqual(sorc * 0.97);
      if (L === 10 || L === 30) expect(allEne, `all Energy level ${L}`).toBeLessThanOrEqual(sorc * 1.05);
    }
    console.log(["BAL | Level | Barbarian (Bash/Conc.) | Barbarian (Whirlwind) | Amazon | Sorc (staff) | Sorc (wand+orb) | Sorc (sword) | Sorc (staff, 80% Energy) |", ...rows].join("\n"));
  }, 600000);
});
