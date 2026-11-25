// Boot check: load a URL at 852x393 (touch), optionally with a save file pre-loaded, and report errors.
// usage: node scripts/boot-check.mjs [chromium|webkit] [url] [save.json]
import pw from "@playwright/test";
import { readFileSync } from "node:fs";
const name = process.argv[2] || "chromium";
const url = process.argv[3] || "https://jim-avatech.github.io/ember-crypt/";
const save = process.argv[4] ? readFileSync(process.argv[4], "utf8") : null;
const b = await pw[name].launch();
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: name === "chromium" });
if (save) await ctx.addInitScript((s) => {
  if (!location.href.startsWith("http")) return;
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  localStorage.setItem("ember-crypt-save-v1", s);
  localStorage.setItem("ember-crypt-settings-v1", '{"tutorialSeen":true}');
}, save);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message + "\n" + e.stack));
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errs.push(m.type() + ": " + m.text()));
page.on("requestfailed", (r) => errs.push("reqfail: " + r.url() + " " + r.failure()?.errorText));
page.on("response", (r) => r.status() >= 400 && errs.push("http " + r.status() + " " + r.url()));
for (let round = 0; round < 2; round++) {
  if (round) await page.reload();
  else await page.goto(url);
  await page.waitForTimeout(3000);
  const st = await page.evaluate(() => ({
    canvas: document.querySelectorAll("canvas").length,
    hud: document.querySelector("#hud")?.getAttribute("aria-label") ?? null,
    bootErr: document.querySelector("#boot-error")?.textContent ?? null,
    saved: (() => { try { const s = JSON.parse(localStorage.getItem("ember-crypt-save-v1")); return { v: s.v, lvl: s.player.level, gold: s.player.gold, max: s.maxFloor }; } catch (e) { return String(e); } })(),
    sw: !!navigator.serviceWorker?.controller,
  }));
  console.log("url", page.url());
  console.log(name, `load ${round + 1}:`, JSON.stringify(st));
}
console.log(errs.join("\n") || "no errors");
await page.screenshot({ path: `/tmp/boot-${name}.png` });
await b.close();
