import { describe, expect, it } from "vitest";
import { AFFIXES, type Cat } from "../src/data/affixes";
import { type Item, type StatKey, makeItem } from "../src/data/items";
import { Game, type GameEvents, STAT_COMPARE } from "../src/game";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const BASE_FOR: Record<Cat, string> = { weapon: "sword", armor: "armor", helm: "helm", shield: "shield", orb: "orb", gloves: "gloves", boots: "boots", belt: "belt", ring: "ring", amulet: "amulet" };
const SLOT_FOR: Record<Cat, string> = { weapon: "main", armor: "chest", helm: "head", shield: "off", orb: "off", gloves: "gloves", boots: "boots", belt: "belt", ring: "ring1", amulet: "amulet" };

function setup() {
  const g = new Game(events, null, 7);
  g.player.level = 30;
  // v1.1: gear whose requirements you don't meet stops working, so this hero can wear anything here
  g.player.base.str = 200;
  g.player.base.dex = 200;
  g.player.skills = { bash: 1 };
  return g;
}
const plain = (id: string) => {
  const it = makeItem(id, 10);
  it.mods = [];
  return it;
};

describe("item comparison covers every stat", () => {
  // every stat any affix can roll, with a category it rolls on
  const stats = new Map<StatKey, Cat>();
  for (const a of AFFIXES) for (const t of a.tiers) for (const [k] of t.mods) if (!stats.has(k)) stats.set(k, a.cats[0]);

  it("every affix stat is mapped (a Record over all stats, so new ones must be added)", () => {
    for (const k of stats.keys()) expect(STAT_COMPARE[k], k).toBeTruthy();
  });

  for (const [k, cat] of stats) {
    it(`${k}: a gain when the new item has it, a loss when it lacks it`, () => {
      const g = setup();
      const slot = SLOT_FOR[cat] as keyof typeof g.player.equip;
      if (cat !== "weapon") g.player.equip.main = plain("sword");
      g.player.equip[slot] = plain(BASE_FOR[cat]);
      const withMod: Item = plain(BASE_FOR[cat]);
      withMod.mods = [k === "skill" ? { s: "skill", v: 2, sk: "bash" } : { s: k, v: 8 }];
      const want = STAT_COMPARE[k].map((id) => (id === "skill:*" ? "skill:bash" : id));
      const gain = g.compare(withMod, slot);
      for (const id of want) {
        const r = gain.find((x) => x.id === id);
        expect(r, `${k} → ${id} in ${JSON.stringify(gain)}`).toBeTruthy();
        expect(r!.good).toBe(true);
      }
      // now wear the one with the stat and look at a plain one: it lacks the stat → a loss
      g.player.equip[slot] = withMod;
      const loss = g.compare(plain(BASE_FOR[cat]), slot);
      for (const id of want) {
        const r = loss.find((x) => x.id === id);
        expect(r, `${k} loss → ${id}`).toBeTruthy();
        expect(r!.good).toBe(false);
        expect(r!.diff).toBeLessThan(0);
      }
    });
  }

  it("one-hand weapons compare in both hands (dual wield vs shield); rings against both rings", () => {
    const g = setup();
    g.player.equip.main = plain("sword");
    g.player.equip.off = plain("shield");
    const axe = plain("axe");
    expect(g.compareSlots(axe)).toEqual(["main", "off"]);
    const off = g.compare(axe, "off");
    expect(off.find((r) => r.id === "def")!.good).toBe(false); // loses the shield's defense
    expect(off.find((r) => r.id === "dmg2")!.good).toBe(true); // gains an off-hand weapon
    g.player.equip.ring1 = plain("ring");
    g.player.equip.ring2 = plain("ring");
    expect(g.compareSlots(plain("ring"))).toEqual(["ring1", "ring2"]);
    delete g.player.equip.ring2;
    expect(g.compareSlots(plain("ring"))).toEqual(["ring1", "ring2"]); // v0.8: the sheet always shows both rings
  });

  it("mana leech shows up (the bug James saw) along with requirements", () => {
    const g = setup();
    g.player.equip.main = plain("sword");
    const leech = plain("sword");
    leech.mods = [{ s: "ml", v: 5 }];
    const rows = g.compare(leech, "main");
    expect(rows.map((r) => r.id)).toContain("ml");
    const gs = plain("great_sword");
    const req = g.compare(gs, "main").find((r) => r.id === "req:str");
    expect(req && req.diff > 0 && !req.good).toBe(true);
  });
});
