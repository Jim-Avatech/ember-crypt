// Simulate an installed PWA upgrading: load the old build (SW installs), swap the server dir to the new build, reopen.
// usage: node scripts/sw-upgrade.mjs url oldDir newDir servedDir [webkit|chromium]
import pw from "@playwright/test";
import { cpSync, rmSync, readFileSync } from "node:fs";
const [url, oldDir, newDir, served, eng = "chromium"] = process.argv.slice(2);
const swap = (d) => { rmSync(served, { recursive: true, force: true }); cpSync(d, served, { recursive: true }); };
swap(oldDir);
const b = await pw[eng].launch();
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true, serviceWorkers: "allow" });
const errs = [];
const watch = (page, tag) => {
  page.on("pageerror", (e) => errs.push(`${tag} pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errs.push(`${tag} console ${m.text()}`));
  page.on("response", (r) => r.status() >= 400 && errs.push(`${tag} http ${r.status()} ${r.url()}`));
};
const state = (page) => page.evaluate(() => ({ hud: document.querySelector("#hud")?.getAttribute("aria-label") ?? null, boot: (() => { const b = document.getElementById("boot"); return b ? (getComputedStyle(b).display === "none" ? "hidden" : b.textContent.slice(0, 80)) : "none"; })(), ver: [...document.querySelectorAll("script[src]")].map((s) => s.src.split("/").pop()).join(), sw: !!navigator.serviceWorker.controller, lvl: (() => { try { return JSON.parse(localStorage.getItem("ember-crypt-save-v1")).player.level; } catch { return null; } })() }));
let page = await ctx.newPage();
watch(page, "old1");
await page.goto(url);
await page.waitForTimeout(2500);
await page.reload();
await page.waitForTimeout(2000);
console.log("old build:", JSON.stringify(await state(page)));
await page.close();
swap(newDir);
for (let i = 1; i <= Number(process.env.OPENS ?? 3); i++) {
  page = await ctx.newPage();
  watch(page, `new${i}`);
  await page.goto(url);
  await page.waitForTimeout(2500);
  console.log(`new open ${i}:`, JSON.stringify(await state(page)));
  await page.close();
}
// then the phone goes offline (or the network is flaky) and the app is opened again
await ctx.setOffline(true);
for (let i = 1; i <= 2; i++) {
  page = await ctx.newPage();
  watch(page, `offline${i}`);
  await page.goto(url).catch((e) => errs.push("goto " + e.message));
  await page.waitForTimeout(2500);
  console.log(`offline open ${i}:`, JSON.stringify(await state(page).catch((e) => String(e))));
  await page.close();
}
console.log(errs.join("\n") || "no errors");
await b.close();
