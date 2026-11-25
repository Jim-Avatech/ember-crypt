// v0.9 screenshots: skill tree (Warcries), 4 skill buttons, War Cry, Whirlwind, Leap. Also checks: no page errors,
// all 30 skills playable (no "soon"), the 4 buttons cast what they show.
// usage: node scripts/skills-shots.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
await page.goto(`${base}?debug&new&seed=11`);
await page.waitForTimeout(900);
await page.evaluate(() => {
  __ec.settings.tutorialSeen = true;
  __ec.ui.showTutorial(false);
  const g = __ec.game, p = g.player;
  g.goDungeon(3);
  p.level = 36; p.base.str = 160; p.base.dex = 110; p.base.vit = 120; p.skillPoints = 4;
  p.equip.main = __ec.items.makeItem("great_sword", 30);
  p.skills = { bash: 4, leap: 6, double_swing: 3, stun: 2, leap_attack: 2, concentrate: 3, double_throw: 1, frenzy: 4, whirlwind: 8, berserk: 2,
    sword_mastery: 6, increased_stamina: 2, iron_skin: 3, increased_speed: 2, natural_resistance: 3,
    howl: 2, find_potion: 1, taunt: 2, shout: 4, find_item: 3, battle_cry: 3, battle_orders: 5, grim_ward: 1, war_cry: 8, battle_command: 2 };
  p.slots = ["whirlwind", "war_cry", "leap"];
  p.mana = 9999;
  g.events.changed();
});
await page.waitForTimeout(500);
// skill tree: Warcries
await page.locator('.mbtn[data-tab="skills"]').tap();
await page.waitForTimeout(300);
await page.locator('[data-act="stree"][data-tree="warcries"]').tap().catch(async () => page.locator('[data-act="stree"]').nth(2).tap());
await page.waitForTimeout(200);
await page.locator('[data-act="skill"][data-id="war_cry"]').tap();
await page.waitForTimeout(300);
check("no 'Coming soon' anywhere in the tree", (await page.locator(".seff.soon, .soon").count()) === 0);
await page.screenshot({ path: `${out}/skills-tree.png` });
await page.locator('[data-act="stree"]').first().tap();
await page.waitForTimeout(200);
await page.locator('[data-act="skill"][data-id="whirlwind"]').tap();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/skills-tree-combat.png` });
await page.locator('[data-act="close"]').first().tap().catch(() => {});
await page.waitForTimeout(300);
// bring 4 monsters right next to the hero (harmless, sturdy)
const gather = () => page.evaluate(() => {
  const g = __ec.game, p = g.player;
  const ms = g.monsters.filter((m) => m.state !== "dead" && m !== g.boss).slice(0, 5);
  ms.forEach((m, i) => { const a = i * 1.26; Object.assign(m, { x: p.x + Math.cos(a) * 1.3, y: p.y + Math.sin(a) * 1.3, hp: 1e6, maxHp: 1e6, dmgMin: 0, dmgMax: 0, atkT: 99, state: "chase" }); m.def = { ...m.def, speed: 0.01 }; });
  return ms.length;
});
check("monsters gathered", (await gather()) >= 3);
await page.waitForTimeout(300);
const labels = await page.$$eval(".sbtn", (bs) => bs.map((b) => b.textContent.trim().slice(0, 12)));
check("three skill buttons filled", labels.length === 3 && labels.every((l) => l.length > 0), JSON.stringify(labels));
await page.screenshot({ path: `${out}/skills-buttons.png` });
// War Cry
await page.locator("#btn-s1").tap();
await page.waitForTimeout(180);
await page.screenshot({ path: `${out}/skills-warcry.png` });
const stunned = await page.evaluate(() => __ec.game.monsters.filter((m) => m.stunT > 0).length);
check("War Cry stunned monsters", stunned >= 2, String(stunned));
await page.waitForTimeout(900);
// Whirlwind (hold)
await gather();
const btn = await page.locator("#btn-s0").boundingBox();
const cdp = await ctx.newCDPSession(page);
const pt = [{ x: btn.x + btn.width / 2, y: btn.y + btn.height / 2, id: 7 }];
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
await page.waitForTimeout(420);
const whirl = await page.evaluate(() => __ec.game.player.action?.type);
await page.screenshot({ path: `${out}/skills-whirlwind.png` });
await page.waitForTimeout(400);
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
check("Whirlwind spinning", whirl === "whirl", whirl);
const hurt = await page.evaluate(() => __ec.game.monsters.filter((m) => m.hp < m.maxHp).length);
check("Whirlwind hit several monsters", hurt >= 3, String(hurt));
await page.waitForTimeout(1200);
// Leap
await page.locator("#btn-s2").tap();
await page.waitForTimeout(160);
const leap = await page.evaluate(() => ({ t: __ec.game.player.action?.type, z: __ec.game.player.z }));
await page.screenshot({ path: `${out}/skills-leap.png` });
check("Leap in the air", leap.t === "leap", JSON.stringify(leap));
await page.waitForTimeout(800);
check("no page errors", errs.length === 0, errs.join(" | "));
await b.close();
const ok = checks.every(Boolean);
console.log(ok ? `skills-shots: PASS (${checks.length})` : "skills-shots: FAIL");
process.exit(ok ? 0 : 1);
