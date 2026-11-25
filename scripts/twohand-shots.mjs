// v0.9.1 screenshots: two-handed idle, normal attack mid-swing, Frenzy and Double Swing mid-swing with a two-hander.
// Writes full screenshots and 3x zoomed crops around the hero. usage: node scripts/twohand-shots.mjs [baseUrl] [weapon]
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const weapon = process.argv[3] ?? "great_sword";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto(`${base}?debug&new&seed=5`);
await page.waitForTimeout(900);
await page.evaluate((w) => {
  __ec.settings.tutorialSeen = true;
  __ec.ui.showTutorial(false);
  const g = __ec.game, p = g.player;
  g.goDungeon(2);
  p.level = 24; p.base.str = 150; p.base.dex = 90;
  p.equip.main = __ec.items.makeItem(w, 20);
  p.equip.off = undefined;
  p.skills = { bash: 3, double_swing: 3, frenzy: 4, leap: 1 };
  p.slots = ["frenzy", "double_swing", "bash", null];
  p.mana = 999;
  g.monsters = g.monsters.filter((m) => m.state !== "dead" && m !== g.boss).slice(0, 1);
  const m = g.monsters[0];
  Object.assign(m, { x: p.x + 0.75, y: p.y - 0.75, hp: 1e7, maxHp: 1e7, dmgMin: 0, dmgMax: 0, atkT: 99, state: "idle" });
  m.def = { ...m.def, speed: 0 };
  p.fx = 0.707; p.fy = -0.707;
  g.events.changed();
}, weapon);
await page.waitForTimeout(700);
const heroBox = async () => {
  const r = await page.evaluate(() => { const c = document.querySelector("canvas").getBoundingClientRect(); return { w: c.width, h: c.height }; });
  return { x: r.w / 2 - 75, y: r.h / 2 - 95, width: 150, height: 130 };
};
const clip = await heroBox();
const shot = async (name) => {
  await page.screenshot({ path: `screenshots/${name}.png` });
  await page.screenshot({ path: `screenshots/${name}-zoom.png`, clip });
};
await shot("twohand-idle");
const pause = () => page.evaluate(() => { window.__realUpdate ??= __ec.game.update.bind(__ec.game); __ec.game.update = () => {}; });
const resume = () => page.evaluate(() => { __ec.game.update = window.__realUpdate; });
const midSwing = async (sel, name, at = 0.32) => {
  await page.locator(sel).tap();
  for (let i = 0; i < 80; i++) {
    const pr = await page.evaluate(() => { const a = __ec.game.player.action; return a && a.type === "swing" ? a.t / a.dur : -1; });
    if (pr >= at) break;
    await page.waitForTimeout(8);
  }
  await pause();
  await page.waitForTimeout(120);
  const info = await page.evaluate(() => { const a = __ec.game.player.action; return { type: a?.type, prog: a ? +(a.t / a.dur).toFixed(2) : null, hands: a?.hands, anim: __ec.ui && window.__ec && null }; });
  await shot(name);
  await resume();
  await page.waitForTimeout(900);
  return info;
};
console.log("attack wind-up", JSON.stringify(await midSwing("#btn-attack", "twohand-attack-windup", 0.22)));
console.log("attack strike", JSON.stringify(await midSwing("#btn-attack", "twohand-attack-strike", 0.42)));
console.log("frenzy 2nd hit (sweep)", JSON.stringify(await midSwing("#btn-s0", "twohand-frenzy", 0.72)));
console.log("double swing", JSON.stringify(await midSwing("#btn-s1", "twohand-doubleswing", 0.2)));
console.log(errs.length ? "errors: " + errs.join(" | ") : "no page errors");
await b.close();
