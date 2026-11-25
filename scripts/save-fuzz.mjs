// Boot a list of saves (JSON array) one by one, open every panel, enter a dungeon, and report errors.
// usage: node scripts/save-fuzz.mjs url saves.json [chromium|webkit]
import pw from "@playwright/test";
import { readFileSync } from "node:fs";
const [url, file, eng = "chromium"] = process.argv.slice(2);
const saves = JSON.parse(readFileSync(file, "utf8"));
const b = await pw[eng].launch();
let bad = 0;
for (let i = 0; i < saves.length; i++) {
  const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: eng === "chromium" });
  await ctx.addInitScript((s) => { if (!location.href.startsWith("http") || sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); localStorage.setItem("ember-crypt-save-v1", s); localStorage.setItem("ember-crypt-settings-v1", '{"tutorialSeen":true}'); }, JSON.stringify(saves[i]));
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message + " @ " + (e.stack || "").split("\n")[1]));
  await page.goto(url + (url.includes("?") ? "&" : "?") + "debug");
  await page.waitForTimeout(900);
  const r = await page.evaluate(async () => {
    const out = { hud: document.querySelector("#hud")?.getAttribute("aria-label") ?? null };
    try {
      for (const t of ["char", "inv", "skills", "arts", "guide", "settings", "wp"]) { __ec.ui.open(t); await new Promise((r) => setTimeout(r, 60)); }
      __ec.ui.close();
      const g = __ec.game;
      g.goDungeon(Math.min(g.maxFloor, 80));
      await new Promise((r) => setTimeout(r, 400));
      out.floor = g.floor; out.lvl = g.player.level; out.v = JSON.parse(localStorage.getItem("ember-crypt-save-v1")).v;
    } catch (e) { out.err = String(e); }
    return out;
  });
  if (errs.length || r.err || !r.hud) { bad++; console.log(i, JSON.stringify(r), errs.slice(0, 3).join(" | ")); }
  await ctx.close();
}
console.log(`${saves.length - bad}/${saves.length} saves booted cleanly (${eng})`);
await b.close();
