// A clean mid-fight gameplay screenshot.
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
await page.goto(`${base}?new&seed=42`);
await page.waitForTimeout(800);
await page.evaluate(() => {
  const ec = window.__ec;
  ec.settings.tutorialSeen = true;
  document.getElementById("tutorial").hidden = true;
  const g = ec.game;
  const p = g.player;
  p.skills.bash = 1; p.skills.howl = 1; p.slots = ["bash", "howl", null]; p.skillPoints = 0;
  p.equip.shield = { uid: 5, baseId: "buckler", def: 5 };
  p.equip.helm = { uid: 6, baseId: "cap", def: 4 };
  // nearest zombie pack
  const zs = g.monsters.filter((m) => m.def.kind === "zombie");
  const z = zs.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  for (const [dx, dy] of [[2.2, 0], [-2.2, 0], [0, 2.2], [0, -2.2], [1.6, 1.6], [-1.6, -1.6]]) if (!g.blocked(z.x + dx, z.y + dy, p.r)) { p.x = z.x + dx; p.y = z.y + dy; break; }
  g.dropAt(p.x - 0.8, p.y + 0.4, { item: { uid: 77, baseId: "war_axe" } });
  g.dropAt(p.x + 0.2, p.y + 1.0, { gold: 23 });
});
await page.waitForTimeout(1800);
const atk = await page.locator("#btn-attack").boundingBox();
await touch("touchStart", [{ x: atk.x + atk.width / 2, y: atk.y + atk.height / 2, id: 7 }]);
await page.waitForTimeout(1250);
await page.screenshot({ path: "screenshots/gameplay.png" });
await touch("touchEnd", []);
await browser.close();
console.log("ok");
