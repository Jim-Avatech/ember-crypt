// v1.0: cast every Amazon skill in a real dungeon (rendered), check no errors and that each does something.
// usage: node scripts/v10-skills-smoke.mjs [baseUrl]
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const br = await chromium.launch();
const page = await (await br.newContext({ viewport: { width: 852, height: 393 } })).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto(`${base}?debug&new&seed=3`);
await page.waitForTimeout(800);
const res = await page.evaluate(async () => {
  const S = __ec.data.SKILLS.filter((s) => s.cls === "amazon" && s.kind === "active");
  const out = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const s of S) {
    const g = __ec.game;
    const mk = __ec.items.makeItem;
    g.player.cls = "amazon";
    g.goTown(true); g.floorCache.clear(); // v1.0.1: fresh level
    g.goDungeon(8);
    const p = g.player;
    p.level = 40;
    p.base.str = Math.max(p.base.str, 150); p.base.dex = Math.max(p.base.dex, 150); // v1.1: gear needs its requirements met to work
    p.skills = {};
    for (const x of S) p.skills[x.id] = 5;
    const bow = s.tab === "bow" || ["inner_sight", "slow_missiles", "decoy", "valkyrie"].includes(s.id);
    p.equip.main = mk(bow ? "long_bow" : "javelin", 30);
    p.equip.off = bow ? mk("arrows", 1) : mk("shield", 30);
    p.mana = 999; p.hp = g.derived().maxHp; p.action = null;
    p.slots = [s.id, null, null];
    const ms = g.monsters.filter((m) => m.state !== "dead").sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 4);
    let k = 0;
    for (const m of ms) { const a = -0.8 + k++ * 0.4; m.x = p.x + Math.cos(a) * (bow || s.id.includes("bolt") || s.id.includes("fury") || s.id.includes("plague") || s.id.includes("poison") ? 4 : 1.3); m.y = p.y + Math.sin(a) * (bow ? 4 : 1.3); m.hp = m.maxHp = 5000; m.defense = 0; m.dmgMin = 0; m.dmgMax = 0; m.def = { ...m.def, speed: 0 }; }
    g.monsters = ms;
    const hp0 = ms.reduce((a, m) => a + m.hp, 0);
    const mana0 = p.mana;
    g.update(1 / 30, { mx: 0, my: 0, mag: 0, attack: false, skills: [true, false, false] });
    const act = p.action?.type ?? null;
    await wait(1600);
    const hp1 = g.monsters.reduce((a, m) => a + Math.max(0, m.hp), 0);
    out[s.id] = { act, dmg: Math.round(hp0 - hp1), mana: Math.round(mana0 - p.mana), allies: g.allies.length, patches: g.patches.length, zaps: g.zaps.length, sight: g.monsters.some((m) => m.sight?.t > 0), slowm: p.buffs.slowm > 0 };
  }
  return out;
});
let bad = 0;
for (const [id, r] of Object.entries(res)) {
  const ok = r.mana > 0 && (r.dmg > 0 || r.allies > 0 || r.sight || r.slowm);
  if (!ok) bad++;
  console.log(ok ? "PASS" : "FAIL", id, JSON.stringify(r));
}
console.log(errs.length ? `FAIL page errors: ${errs.join(" | ")}` : "PASS no page errors");
await br.close();
process.exit(bad || errs.length ? 1 : 0);
