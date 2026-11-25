// Screenshots of the v0.8 compare sheet and elite monsters (852x393 phone landscape).
// usage: node scripts/compare-shots.mjs [baseUrl] [dir]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}?debug&new&seed=42`);
await page.waitForTimeout(800);
const ev = (fn, a) => page.evaluate(fn, a);
await ev(() => {
  __ec.settings.tutorialSeen = true;
  __ec.ui.showTutorial(false);
  const g = __ec.game;
  const p = g.player;
  p.level = 30; p.base.str = 150; p.base.dex = 100;
  const mk = (uid, id, l, q, name, mods) => Object.assign(__ec.items.makeItem(id, l), { uid, q, name, mods, aff: [] });
  p.equip.main = mk(9001, "sword", 20, "magic", "Cruel Sword of Leech", [{ s: "edmg", v: 60 }, { s: "ll", v: 5 }]);
  p.equip.off = mk(9002, "shield", 18, "rare", "Grim Ward", [{ s: "def", v: 40 }, { s: "fres", v: 20 }, { s: "life", v: 25 }]);
  p.equip.ring1 = mk(9003, "ring", 15, "magic", "Ring of the Fox", [{ s: "dex", v: 6 }]);
  p.equip.ring2 = mk(9004, "ring", 18, "rare", "Doom Loop", [{ s: "str", v: 8 }, { s: "life", v: 20 }, { s: "mana", v: 15 }]);
  p.bag = [
    { item: mk(9010, "axe", 24, "rare", "Bone Bite", [{ s: "edmg", v: 90 }, { s: "ias", v: 20 }, { s: "str", v: 10 }, { s: "cres", v: 15 }]), x: 0, y: 0 },
    { item: mk(9011, "ring", 22, "rare", "Storm Coil", [{ s: "lres", v: 20 }, { s: "life", v: 30 }, { s: "ar", v: 60 }]), x: 3, y: 0 },
  ];
  g.events.changed();
});
await page.locator('.mbtn[data-tab="inv"]').tap();
await page.waitForTimeout(300);
await page.locator('[data-src="bag"][data-uid="9010"]').tap();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/compare-weapon.png` });
await page.locator('[data-act="cmp-close"]').tap();
await page.locator('[data-src="bag"][data-uid="9011"]').tap();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/compare-rings.png` });
await ev(() => __ec.ui.close());
// elites
await ev(() => {
  const g = __ec.game;
  g.maxFloor = 45;
  g.goDungeon(45);
  const p = g.player;
  const u = g.monsters.find((m) => m.elite === 2);
  p.x = u.x - 2.5; p.y = u.y + 1.5;
  p.base.vit = 900; p.hp = g.derived().maxHp;
  for (const m of g.monsters) if (m.pack === u.pack) m.state = "chase";
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/elite-unique.png` });
console.log("errors", errors);
await browser.close();
