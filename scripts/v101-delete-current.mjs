// v1.0.1: delete the hero being played (opened from Settings → Change hero): you must pick another hero, and
// leaving the page must not write the deleted hero back. usage: node scripts/v101-delete-current.mjs [baseUrl]
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const br = await chromium.launch();
const page = await (await br.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: true })).newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto(`${base}?debug&new&seed=4`); await page.waitForTimeout(800);
await page.goto(`${base}?debug&select`); await page.waitForTimeout(800);
await page.click("#heroes .hcard.new"); await page.click('#heroes .hcls[data-cls="amazon"]'); await page.fill("#hero-name", "Zed"); await page.click('#heroes [data-hact="create"]'); await page.waitForTimeout(800);
await page.evaluate(() => __ec.ui.close());
await page.locator('.mbtn[data-tab="settings"]').tap(); await page.waitForTimeout(300);
await page.locator('[data-act="heroes"]').tap(); await page.waitForTimeout(600);
await page.locator('#heroes .hdelb[data-slot="2"]').tap(); await page.fill("#hero-del-name", "zed"); await page.locator('[data-hact="del-yes"]').tap(); await page.waitForTimeout(400);
const r = await page.evaluate(() => ({ names: [...document.querySelectorAll("#heroes .hcard:not(.new) .hinfo b")].map((b) => b.textContent), cancel: !!document.querySelector('#heroes [data-hact="close"]'), keys: Object.keys(localStorage).filter((k) => k.endsWith("#2")), last: localStorage.getItem("ember-crypt-last-slot") }));
console.log("after delete", JSON.stringify(r));
await page.goto(`${base}?debug&select`); await page.waitForTimeout(800);
const r2 = await page.evaluate(() => ({ names: [...document.querySelectorAll("#heroes .hcard:not(.new) .hinfo b")].map((b) => b.textContent), keys: Object.keys(localStorage).filter((k) => k.endsWith("#2")), playing: __ec.game.player.name }));
console.log("after reload", JSON.stringify(r2), errs);
const ok = r.names.join() === "Barbarian" && !r.cancel && !r.keys.length && r.last === "1" && r2.names.join() === "Barbarian" && !r2.keys.length && !errs.length;
console.log(ok ? "PASS" : "FAIL", "delete the current hero: select stays open without Cancel, the hero stays deleted after leaving the page");
await br.close();
process.exit(ok ? 0 : 1);
