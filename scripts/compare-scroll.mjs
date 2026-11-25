// v0.8.2: compare-sheet cards scroll by touch at 852x393 and the last affix of a 4-affix rare is reachable.
// usage: node scripts/compare-scroll.mjs [baseUrl] [shotPath]
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const shot = process.argv[3];
const H = Number(process.argv[4] ?? 393); // a shorter height forces the cards to overflow, to test scrolling
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 852, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}?debug&new&seed=7`);
await page.waitForTimeout(800);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
await page.evaluate(() => {
  __ec.settings.tutorialSeen = true;
  __ec.ui.showTutorial(false);
  const g = __ec.game;
  const p = g.player;
  p.level = 40; p.base.str = 200; p.base.dex = 150;
  const mk = (uid, id, l, name, mods) => Object.assign(__ec.items.makeItem(id, l), { uid, q: "rare", name, mods, aff: [] });
  const long = [{ s: "skill", v: 2, sk: "double_swing" }, { s: "ml", v: 6 }, { s: "ll", v: 7 }, { s: "fres", v: 30 }];
  p.equip.main = mk(9101, "sword", 30, "Grim Edge", [{ s: "edmg", v: 120 }, { s: "ias", v: 20 }, { s: "skill", v: 3, sk: "bash" }, { s: "lres", v: 25 }]);
  p.equip.off = mk(9102, "sword", 28, "Doom Fang", [{ s: "edmg", v: 80 }, { s: "life", v: 40 }, { s: "cres", v: 25 }, { s: "skill", v: 1, sk: "frenzy" }]);
  p.bag = [{ item: mk(9110, "great_sword", 32, "Storm Cleaver", long.concat([])), x: 0, y: 0 }];
  // a 4-affix rare whose lines don't all fit in the card
  p.bag[0].item.mods = [{ s: "edmg", v: 150 }, { s: "skill", v: 2, sk: "double_swing" }, { s: "ml", v: 6 }, { s: "pres", v: 30 }];
  p.bag.push({ item: mk(9111, "axe", 30, "Bone Bite", [{ s: "skill", v: 2, sk: "double_throw" }, { s: "ml", v: 6 }, { s: "ll", v: 7 }, { s: "fres", v: 30 }]), x: 3, y: 0 });
  g.events.changed();
});
await page.locator('.mbtn[data-tab="inv"]').tap();
await page.waitForTimeout(300);
await page.locator('[data-src="bag"][data-uid="9111"]').tap();
await page.waitForTimeout(300);
if (process.env.SHOT_BEFORE) await page.screenshot({ path: process.env.SHOT_BEFORE });
const res = [];
for (const sel of [".ccard.selc", ".ccard.eqc >> nth=0", ".ccard.eqc >> nth=1"]) {
  const card = page.locator(`.cmpsheet ${sel}`);
  const before = await card.evaluate((c) => ({ overflow: c.scrollHeight > c.clientHeight + 2, more: c.classList.contains("more"), top: c.scrollTop }));
  const b = await card.boundingBox();
  // swipe up inside the card with real touch events
  const x = b.x + b.width / 2;
  for (let k = 0; k < 2; k++) {
    await touch("touchStart", [{ x, y: b.y + b.height - 12, id: 1 }]);
    for (let i = 1; i <= 10; i++) { await touch("touchMove", [{ x, y: b.y + b.height - 12 - i * (b.height - 30) / 10, id: 1 }]); await page.waitForTimeout(16); }
    await touch("touchEnd", []);
    await page.waitForTimeout(400);
  }
  const after = await card.evaluate((c) => {
    const lines = c.querySelectorAll(".clines > div");
    const last = lines[lines.length - 1];
    const cr = c.getBoundingClientRect();
    const lr = last.getBoundingClientRect();
    return { top: c.scrollTop, lastText: last.textContent, lastVisible: lr.bottom <= cr.bottom + 1 && lr.top >= cr.top - 1, more: c.classList.contains("more"), atBottom: c.scrollHeight - c.clientHeight - c.scrollTop <= 4 };
  });
  res.push({ sel, before, after });
}
const sheetOpen = await page.evaluate(() => !!document.querySelector(".cmpsheet"));
if (shot) await page.screenshot({ path: shot });
let ok = sheetOpen && errors.length === 0;
for (const r of res) {
  const pass = r.after.lastVisible && (!r.before.overflow || (r.before.more && r.after.top > 0 && !r.after.more));
  ok &&= pass;
  console.log(pass ? "PASS" : "FAIL", r.sel, JSON.stringify(r));
}
console.log(ok ? "compare-scroll: PASS" : "compare-scroll: FAIL", errors.join(" | "));
await browser.close();
process.exit(ok ? 0 : 1);
