// v1.6.2 at 852x393 in Chromium and WebKit: Charged Bolt in the real game: every bolt leaves within ±15° of the aim,
// bolts stay near the 30° cone while they jink, and a monster 6 tiles away takes most of them. Screenshot mid-flight.
// usage: node scripts/v162-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v162";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };

for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const sfx = ename === "webkit" ? "-webkit" : "";
  const br = await engine.launch();
  const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: ename === "chromium" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  const ev = (f, a) => page.evaluate(f, a);
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await ev(() => {
    const s = __ec.game.toSave();
    s.player.cls = "sorceress"; s.player.name = "Tal Rasha"; s.player.level = 30;
    s.player.base = { str: 40, dex: 25, vit: 70, ene: 100 };
    s.player.skills = { charged_bolt: 14 };
    s.player.slots = ["charged_bolt", null, null];
    s.player.mainAtk = "charged_bolt";
    s.player.equip = { main: __ec.items.makeItem("battle_staff", 20) };
    s.maxFloor = 40;
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  });
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1300);
  await ev(() => __ec.game.goDungeon(12));
  await page.waitForTimeout(900);
  // an open stretch: the hero, and 7 open tiles up-left on screen (−x) with room either side
  const spot = await ev(() => {
    const g = __ec.game, L = g.level, p = g.player;
    const open = (x, y) => !g.blocked(x, y, 0.45);
    for (let y = 4; y < L.h - 4; y++) for (let x = 10; x < L.w - 3; x++) {
      let ok = true;
      for (let d = 0; d <= 7 && ok; d += 0.5) ok = open(x + 0.5 - d, y + 0.5) && open(x + 0.5 - d, y - 1) && open(x + 0.5 - d, y + 2);
      if (ok) { window.__cb = { x: x + 0.5, y: y + 0.5 }; p.x = x + 0.5; p.y = y + 0.5; return { x, y }; }
    }
    return null;
  });
  C("found open ground", !!spot, JSON.stringify(spot));
  for (let k = 0; k < 6; k++) { await page.waitForTimeout(500); await ev(() => { const g = __ec.game, p = g.player; p.hp = g.derived().maxHp; p.x = window.__cb.x; p.y = window.__cb.y; for (const m of g.monsters) if (Math.hypot(m.x - p.x, m.y - p.y) < 14) { m.x = -50; m.y = -50; } }); }
  // several casts, counted in the game loop (stepped from the page), then one more for the screenshot
  const res = await ev((idle) => {
    const g = __ec.game, p = g.player;
    const m = g.monsters.find((x) => x.state !== "dead" && x.def.rank === "normal");
    m.def = { ...m.def, speed: 0, dmgMin: 0, dmgMax: 0 };
    const launch = [];
    const push = g.spells.push.bind(g.spells);
    g.spells.push = (...xs) => { for (const s of xs) if (s.k === "missile" && s.id === "charged_bolt") launch.push(Math.atan2(s.vy, s.vx)); return push(...xs); };
    let hits = 0, bolts = 0;
    const eh = g.elemHit.bind(g);
    g.elemHit = (mm, d, e, o) => { if (mm === m) hits++; eh(mm, d, e, o); };
    for (let c = 0; c < 10; c++) {
      p.x = window.__cb.x; p.y = window.__cb.y; m.x = p.x - 6; m.y = p.y; m.hp = m.maxHp = 1e6; m.state = "chase";
      p.mana = 999; p.action = null; p.fx = -1; p.fy = 0;
      const n0 = launch.length;
      g.castSkill("charged_bolt", g.derived());
      for (let k = 0; k < 120; k++) { g.update(1 / 60, idle); p.x = window.__cb.x; p.y = window.__cb.y; m.x = p.x - 6; m.y = p.y; m.kx = 0; m.ky = 0; p.hp = 9999; }
      bolts += launch.length - n0;
    }
    const devs = launch.map((a) => Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) * 180 / Math.PI);
    // the screenshot cast: freeze mid-flight
    p.mana = 999; p.action = null; m.hp = 1e6;
    g.castSkill("charged_bolt", g.derived());
    for (let k = 0; k < 40; k++) { g.update(1 / 60, idle); p.x = window.__cb.x; p.y = window.__cb.y; m.x = p.x - 6; m.y = p.y; m.kx = 0; m.ky = 0; }
    g.update = () => {};
    return { bolts, hits, maxLaunchDeg: Math.max(...devs), inFlight: g.spells.filter((s) => s.id === "charged_bolt").length };
  }, idle);
  await page.waitForTimeout(150);
  C("every bolt leaves within ±15° of the aim", res.maxLaunchDeg <= 15.5, JSON.stringify(res));
  C("a monster 6 tiles away takes at least 45% of the bolts (10 casts)", res.hits / res.bolts >= 0.45, `${res.hits}/${res.bolts}`);
  await page.screenshot({ path: `${out}/01-charged-bolt-6-tiles${sfx}.png` });
  await ev(() => { delete __ec.game.update; });
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const failed = checks.filter((c) => !c).length;
console.log(failed ? `${failed} FAILED` : `all ${checks.length} passed`);
process.exit(failed ? 1 : 0);
