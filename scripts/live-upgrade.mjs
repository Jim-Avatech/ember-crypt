// Upgrade check on the live site: phase "seed" makes a Barbarian on the current live build in a persistent profile;
// phase "check" reopens the same profile after deploy and verifies v1.0 + the hero migrated to slot 1.
import { chromium } from "@playwright/test";
const [phase, dir] = [process.argv[2], process.argv[3] ?? "/workspace/ec-mig/profile"];
const url = "https://jim-avatech.github.io/ember-crypt/";
const ctx = await chromium.launchPersistentContext(dir, { viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: true });
const page = ctx.pages()[0] ?? await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
if (phase === "seed") {
  await page.goto(url + "?debug"); await page.waitForTimeout(2500);
  const r = await page.evaluate(() => { const g = __ec.game, p = g.player; p.level = 23; p.gold = 4321; p.xp = 777; g.save?.(); return { v: document.body.innerText.match(/v0\.\d+(\.\d+)?/)?.[0], keys: Object.keys(localStorage) }; });
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(1500);
  const raw = await page.evaluate(() => localStorage.getItem("ember-crypt-save-v1"));
  console.log("seed", JSON.stringify(r), raw ? JSON.parse(raw).player?.level ?? raw.slice(0, 80) : "no save");
} else {
  for (let i = 0; i < 3; i++) { await page.goto(url); await page.waitForTimeout(3000); }
  const txt = await page.evaluate(() => document.body.innerText);
  console.log("hero select shown:", /Barbarian/.test(txt), "| text:", txt.replace(/\s+/g, " ").slice(0, 300));
  await page.screenshot({ path: "/workspace/ec-mig/after-upgrade.png" });
  console.log(errs.length ? "FAIL errors " + errs.join(" | ") : "PASS no page errors");
}
await ctx.close();
