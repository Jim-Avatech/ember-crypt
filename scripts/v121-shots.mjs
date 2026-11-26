// v1.2.1 at 852x393 in Chromium and WebKit: the Multiple Shot tooltip shows damage per arrow and the volley total.
// usage: node scripts/v121-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v121";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const sfx = ename === "webkit" ? "-webkit" : "";
  const br = await engine.launch();
  const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: ename === "chromium" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const s = __ec.game.toSave();
    s.player.cls = "amazon"; s.player.name = "Ilsa"; s.player.level = 30;
    s.player.skills = { magic_arrow: 1, multiple_shot: 10 };
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  });
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1200);
  await page.evaluate(() => __ec.ui.open("skills"));
  await page.waitForTimeout(300);
  await page.locator('.stab[data-tree="bow"]').first().tap();
  await page.waitForTimeout(200);
  await page.locator('.snode[data-id="multiple_shot"]').first().tap();
  await page.waitForTimeout(300);
  const t = await page.evaluate(() => [...document.querySelectorAll(".sdetail .seff")].map((e) => e.textContent));
  C("tooltip: level 10 now, level 11 next, per arrow + volley total", t[0] === "Now: 12 arrows, 14.2% damage each (volley total 170%)" && t[1] === "Next: 12 arrows, 14.6% damage each (volley total 175%)", JSON.stringify(t));
  await page.screenshot({ path: `${out}/01-multishot-tooltip${sfx}.png` });
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const ok = checks.filter(Boolean).length;
console.log(`${ok}/${checks.length} checks passed`);
process.exit(ok === checks.length ? 0 : 1);
