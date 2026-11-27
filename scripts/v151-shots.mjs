// v1.5.1 at 852x393 in Chromium and WebKit: level numbers count 1-20 within the act (map label, waypoint list,
// portal message, Character screen deepest level).
// usage: node scripts/v151-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v151";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const sfx = ename === "webkit" ? "-webkit" : "";
  const br = await engine.launch();
  const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  const ev = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await ev(() => {
    const s = __ec.game.toSave();
    s.player.cls = "barbarian"; s.player.name = "Grom"; s.player.level = 60; s.player.base.vit = 300; s.player.skills = { bash: 1 }; s.maxFloor = 67;
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  });
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1400);
  // waypoint list (in camp)
  await ev(() => __ec.ui.open("wp"));
  await page.waitForTimeout(400);
  const wp = await ev(() => [...document.querySelectorAll(".wprow, .wpnext")].map((e) => e.textContent.trim()));
  const nums = wp.flatMap((t) => [...t.matchAll(/Level (\d+)/g)].map((m) => Number(m[1])));
  C("waypoint list: every level number is 1-20", nums.length > 5 && nums.every((n) => n >= 1 && n <= 20), JSON.stringify(wp));
  await page.screenshot({ path: `${out}/02-waypoints-per-act${sfx}.png` });
  await ev(() => __ec.ui.close());
  // level 67 = Act 4, level 7
  await ev(() => { __ec.game.goDungeon(67); __ec.game.events.changed(); });
  await page.waitForTimeout(900);
  const lab = await ev(() => ({ t: document.getElementById("where").textContent, toast: document.getElementById("toast").textContent }));
  C("map label: Act 4 · Level 7 (overall level 67)", lab.t === "Act 4 · Level 7", JSON.stringify(lab));
  C("arrival message: Level 7/20", /Level 7\/20/.test(lab.toast) && !/67/.test(lab.toast), lab.toast);
  await page.screenshot({ path: `${out}/01-map-label-act4-level7${sfx}.png` });
  // Return to Town: the portal message
  await ev(() => { const g = __ec.game; for (const m of g.monsters) m.state = "dead"; g.startRecall(); });
  await page.waitForFunction(() => /portal returns you/.test(document.getElementById("toast").textContent), null, { timeout: 9000 }).catch(() => {});
  const tt = await ev(() => document.getElementById("toast").textContent);
  C("portal message: level within the act, no 67", /Level 7\./.test(tt) && !/67/.test(tt), tt);
  // Character screen: deepest level
  await ev(() => __ec.ui.open("char"));
  await page.waitForTimeout(400);
  const deep = await ev(() => [...document.querySelectorAll(".kv")].map((e) => e.textContent).find((t) => /deepest/.test(t)) ?? "");
  C("Character screen: deepest level Act 4 · Level 7", /Act 4 · Level 7/.test(deep) && !/67/.test(deep), deep);
  await page.screenshot({ path: `${out}/03-character-deepest${sfx}.png` });
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const ok = checks.filter(Boolean).length;
console.log(`${ok}/${checks.length} passed`);
process.exit(ok === checks.length ? 0 : 1);
