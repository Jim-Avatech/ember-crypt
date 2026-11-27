// v1.4: Lightning Fury rebalanced to ~85-90% of Lightning Strike's DPS; Lightning Strike unchanged.
import { describe, expect, it } from "vitest";
import { PATCH_NOTES } from "../src/data/patchNotes";
import { FURY_JAV_HIT, furyBolts, furyDmg, lightningStrikeDmg, lightningStrikeHits, SKILL_BY_ID } from "../src/data/skills";
import { SIM_LEVELS, SIM_PACKS, simDps } from "./furySim";

describe("v1.4 Lightning Strike is unchanged", () => {
  it("chain targets and damage at levels 1, 5, 10, 20", () => {
    expect(SIM_LEVELS.map(lightningStrikeHits)).toEqual([2, 3, 5, 8]);
    expect(SIM_LEVELS.map(lightningStrikeDmg)).toEqual([80, 180, 305, 555]);
  });
});

describe("v1.4 Lightning Fury numbers and tooltip", () => {
  it("bolts reach as many enemies as Strike's chain (plus its target)", () => {
    for (let l = 1; l <= 30; l++) expect(furyBolts(l)).toBe(Math.min(9, lightningStrikeHits(l) + 1));
    expect(SIM_LEVELS.map(furyBolts)).toEqual([3, 4, 6, 9]);
  });
  it("bolt damage and the javelin's own hit", () => {
    expect(SIM_LEVELS.map(furyDmg)).toEqual([40, 82, 135, 265]);
    expect(FURY_JAV_HIT).toBe(0.5);
    for (let l = 2; l <= 30; l++) expect(furyDmg(l)).toBeGreaterThan(furyDmg(l - 1));
  });
  it("tooltip shows the new numbers", () => {
    const fx = SKILL_BY_ID.lightning_fury.effect!;
    expect(fx(1)).toBe("3 bolts, 40% of your hit each; the javelin itself hits for 50%");
    expect(fx(20)).toBe("9 bolts, 265% of your hit each; the javelin itself hits for 50%");
  });
  it("patch note", () => {
    const v = PATCH_NOTES.find((p) => p.version === "1.4")!;
    expect(v.notes.some((n) => /Lightning Fury/.test(n) && /Lightning Strike is unchanged/.test(n))).toBe(true);
  });
});

describe("v1.4 Fury vs Strike DPS through the real game loop", () => {
  it("Fury is 80-95% of Strike in every case (single target, packs of 3 and 5; skill 1, 5, 10, 20) and 85-90% on average", () => {
    const ratios: number[] = [];
    for (const l of SIM_LEVELS)
      for (const k of SIM_PACKS) {
        const s = simDps("lightning_strike", l, k, 900);
        const f = simDps("lightning_fury", l, k, 900);
        ratios.push(f / s);
        expect(f / s, `skill ${l}, pack ${k}`).toBeGreaterThan(0.8);
        expect(f / s, `skill ${l}, pack ${k}`).toBeLessThan(0.95);
      }
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    expect(mean).toBeGreaterThan(0.85);
    expect(mean).toBeLessThan(0.9);
  }, 120000);
});
