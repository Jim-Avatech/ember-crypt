// Time to first painted frame at 852x393 with CPU throttling (simulates a phone).
// usage: node scripts/boot-time.mjs url [throttleRate] [save.json]
import pw from "@playwright/test";
import { readFileSync } from "node:fs";
const url = process.argv[2];
const rate = Number(process.argv[3] ?? 4);
const save = process.argv[4] ? readFileSync(process.argv[4], "utf8") : null;
const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
if (save) await ctx.addInitScript((s) => { if (!location.href.startsWith("http") || sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); localStorage.setItem("ember-crypt-save-v1", s); localStorage.setItem("ember-crypt-settings-v1", '{"tutorialSeen":true}'); }, save);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate });
const t0 = Date.now();
await page.goto(url, { waitUntil: "commit" });
await page.waitForFunction(() => !!document.querySelector("#floor-label")?.textContent, null, { timeout: 120000, polling: 50 });
const tHud = Date.now() - t0;
const prof = await page.evaluate(() => performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd | 0);
console.log(`throttle ${rate}x: HUD after ${tHud} ms (DOMContentLoaded ${prof} ms)`);
await b.close();
