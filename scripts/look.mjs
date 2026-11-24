// quick visual check: node scripts/look.mjs <out-prefix> [js to run before shot]
import { chromium } from "@playwright/test";
const [, , out = "/tmp/look", js = ""] = process.argv;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.stack));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto(`${process.env.URL || "http://127.0.0.1:5174/ember-crypt/"}?debug&new&seed=7`);
await p.waitForFunction(() => window.__ec?.game, null, { timeout: 15000 });
await p.waitForTimeout(800);
if (js) {
  const r = await p.evaluate(js);
  if (r !== undefined) console.log("eval:", JSON.stringify(r));
}
await p.waitForTimeout(700);
await p.screenshot({ path: `${out}.png` });
console.log("errors:", errs);
await b.close();
