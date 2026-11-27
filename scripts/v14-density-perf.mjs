// v1.4 monster density: frame time at 852x393 on the densest level of the densest act (Act IV), every monster awake
// and swarming the hero, compared with Act I's densest level. Chromium runs with 4x CPU throttling (a phone-class CPU),
// WebKit unthrottled. Per frame: rAF interval, and the game's own work (Game.update + Renderer.render).
// usage: node scripts/v14-density-perf.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v14";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const sfx = ename === "webkit" ? "-webkit" : "";
  const br = await engine.launch();
  const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(`${base}?debug&new&seed=5`);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const s = __ec.game.toSave();
    s.player.cls = "barbarian"; s.player.name = "Perf"; s.player.level = 75; s.player.base.str = 200; s.player.base.dex = 150; s.player.base.vit = 400;
    s.player.skills = { bash: 1 }; s.maxFloor = 80;
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  });
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1400);
  if (ename === "chromium") {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  const results = {};
  for (const act of [1, 4]) {
    const info = await page.evaluate((act) => {
      const g = __ec.game;
      let best = 0, bestN = -1;
      for (let l = 1; l <= 19; l++) {
        const f = (act - 1) * 20 + l;
        g.startFloor(f);
        const n = g.monsters.filter((m) => m.def.rank === "normal").length;
        if (n > bestN) { bestN = n; best = f; }
      }
      g.goDungeon(best);
      return { floor: best, monsters: g.monsters.length };
    }, act);
    await page.waitForTimeout(600);
    const r = await page.evaluate(async () => {
      const g = __ec.game, R = __ec.renderer;
      const work = [];
      let acc = 0;
      const u0 = g.update, r0 = R.render;
      g.update = function (...a) { const t = performance.now(); const v = u0.apply(this, a); acc += performance.now() - t; return v; };
      R.render = function (...a) { const t = performance.now(); const v = r0.apply(this, a); acc += performance.now() - t; work.push(acc); acc = 0; return v; };
      // every monster wakes and comes for the hero, who can't die
      for (const m of g.monsters) if (m.state === "idle") m.state = "chase";
      const keep = setInterval(() => { g.player.hp = g.derived().maxHp; for (const m of g.monsters) if (m.state === "idle") m.state = "chase"; }, 100);
      const iv = [];
      let last = performance.now();
      await new Promise((res) => {
        const t0 = last;
        const tick = (now) => { iv.push(now - last); last = now; if (now - t0 < 8000) requestAnimationFrame(tick); else res(); };
        requestAnimationFrame(tick);
      });
      clearInterval(keep);
      g.update = u0; R.render = r0;
      const near = g.monsters.filter((m) => m.state !== "dead" && Math.hypot(m.x - g.player.x, m.y - g.player.y) < 8).length;
      const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
      const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      return { frames: iv.length, fps: (iv.length / 8).toFixed(1), ivAvg: avg(iv).toFixed(1), ivP95: q(iv, 0.95).toFixed(1), workAvg: avg(work).toFixed(2), workP95: q(work, 0.95).toFixed(2), alive: g.monsters.filter((m) => m.state !== "dead").length, near };
    });
    results[act] = { ...info, ...r };
    console.log(`[${ename}${ename === "chromium" ? " 4x CPU throttle" : ""}] Act ${act} floor ${info.floor}: ${info.monsters} monsters (${r.alive} alive, ${r.near} within 8 tiles) fps ${r.fps}, frame avg ${r.ivAvg} ms p95 ${r.ivP95} ms, game work avg ${r.workAvg} ms p95 ${r.workP95} ms`);
    if (act === 4) await page.screenshot({ path: `${out}/06-act4-density${sfx}.png` });
  }
  const a4 = results[4];
  check(`[${ename}] Act IV densest level holds 30 fps or better at 852x393`, Number(a4.fps) >= 30, `${a4.fps} fps`);
  check(`[${ename}] Act IV game work (update + render) p95 under 25 ms, inside a 33 ms (30 fps) frame even at 4x CPU throttle`, Number(a4.workP95) < 25, `${a4.workP95} ms`);
  check(`[${ename}] no page errors`, errs.length === 0, errs.join(" | "));
  await br.close();
}
const ok = checks.filter(Boolean).length;
console.log(`${ok}/${checks.length} passed`);
process.exit(ok === checks.length ? 0 : 1);
