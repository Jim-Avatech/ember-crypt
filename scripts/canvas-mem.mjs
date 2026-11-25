import pw from "@playwright/test";
const url = process.argv[2];
const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => {
  window.__canv = [];
  const orig = Document.prototype.createElement;
  Document.prototype.createElement = function (t, o) { const el = orig.call(this, t, o); if (String(t).toLowerCase() === "canvas") window.__canv.push(el); return el; };
  if (window.OffscreenCanvas) { const O = window.OffscreenCanvas; window.OffscreenCanvas = function (w, h) { const c = new O(w, h); window.__canv.push(c); return c; }; }
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("ERR", e.message));
await page.goto(url + "?debug&new&seed=5");
await page.waitForTimeout(2500);
const mem = () => page.evaluate(() => { let px = 0, n = 0; for (const c of window.__canv) { if (c.width * c.height > 0) { n++; px += c.width * c.height; } } return { n, MB: Math.round(px * 4 / 1e6) }; });
console.log("boot", JSON.stringify(await mem()));
for (const f of [1, 21, 41, 61, 20, 40, 60, 80]) {
  await page.evaluate((f) => { const g = __ec.game; g.maxFloor = 80; g.goDungeon(f); for (const m of g.monsters) { g.player.x = m.x; g.player.y = m.y; } }, f);
  await page.waitForTimeout(1200);
  console.log("floor", f, JSON.stringify(await mem()));
}
await b.close();
