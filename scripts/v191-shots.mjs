// v1.9.1 at 852x393 in Chromium and WebKit: Great Sword reach on the item card, and a Great Sword
// hitting a Doom Knight standing at the knight's own landed reach (a one-hand sword cannot).
// usage: node scripts/v191-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v191";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };

async function loadHero(page) {
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const s = __ec.game.toSave();
    const mk = __ec.items.makeItem;
    s.player.cls = "barbarian"; s.player.name = "Reacher"; s.player.level = 40; s.floor = 61; s.maxFloor = 61;
    s.player.base = { str: 200, dex: 80, vit: 100, ene: 20 };
    s.player.equip = { main: mk("great_sword", 30), chest: mk("armor", 20), belt: mk("belt", 10) };
    s.player.bag = [{ item: mk("sword", 30), x: 0, y: 0 }, { item: mk("spear", 30), x: 2, y: 0 }];
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  });
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1400);
}

for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const sfx = ename === "webkit" ? "-webkit" : "";
  const br = await engine.launch();
  const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: ename === "chromium" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  const ev = (f, a) => page.evaluate(f, a);

  await loadHero(page);

  // 1) the Great Sword's item card lists Reach: 1.35 tiles
  await ev(() => __ec.ui.open("inv"));
  await page.waitForTimeout(400);
  await page.locator('[data-src="eq"][data-eq="main"]').click({ force: true });
  await page.waitForTimeout(300);
  const card = await ev(() => document.querySelector(".idetail")?.innerText ?? document.body.innerText);
  C("Great Sword card shows Reach: 1.35 tiles", /Reach:\s*1\.35 tiles/.test(card) && /Great Sword/.test(card), card.slice(0, 280).replace(/\s+/g, " "));
  await page.screenshot({ path: `${out}/01-greatsword-reach${sfx}.png` });

  // 2) a one-hand sword is 0.95, a spear is 1.50
  const bodyInv = () => ev(() => (document.getElementById("panel")?.innerText ?? ""));
  const uid = await ev(() => __ec.game.player.bag.find((e) => e.item.baseId === "sword").item.uid);
  await page.locator(`[data-src="bag"][data-uid="${uid}"]`).click({ force: true });
  await page.waitForTimeout(250);
  const swordCard = await bodyInv();
  C("Sword card shows Reach: 0.95 tiles", /Reach:\s*0\.95 tiles/.test(swordCard) && /Sword/.test(swordCard), swordCard.slice(0, 300).replace(/\s+/g, " "));
  await page.locator('[data-act="cmp-close"]').click({ force: true }).catch(() => {});
  await page.waitForTimeout(200);
  const suid = await ev(() => __ec.game.player.bag.find((e) => e.item.baseId === "spear").item.uid);
  await page.locator(`[data-src="bag"][data-uid="${suid}"]`).click({ force: true });
  await page.waitForTimeout(250);
  const spearCard = await bodyInv();
  C("Spear card shows Reach: 1.50 tiles", /Reach:\s*1\.50 tiles/.test(spearCard) && /Spear/.test(spearCard), spearCard.slice(0, 300).replace(/\s+/g, " "));
  await ev(() => __ec.ui.close());

  // 3) in the crypt: a Great Sword hits a Doom Knight standing at the knight's landed reach
  // actually enter the crypt so the shot is of the fight, not the camp
  await ev(() => { __ec.game.startFloor(61); });
  await page.waitForTimeout(500);
  const fight = await ev(() => {
    const g = __ec.game;
    for (const m of g.monsters) m.state = "dead";
    g.boss = null;
    const m = g.monsters[0];
    m.state = "idle";
    m.hp = m.maxHp = 20000;
    m.def = { ...m.def, kind: "knight", name: "Doom Knight", behavior: "charger", reach: 0.9, radius: 0.36, rank: "normal" };
    const theyLand = 0.9 + 0.36 + 0.28 + 0.35; // 1.89
    const p = g.player;
    p.dead = false; p.hp = 2000; p.level = 40;
    p.base = { str: 200, dex: 80, vit: 100, ene: 20 };
    p.x = 12; p.y = 12;
    m.x = 12 + theyLand; m.y = 12;
    p.fx = 1; p.fy = 0;
    const dist = Math.hypot(m.x - p.x, m.y - p.y);
    const inReach = (r) => dist <= r + m.def.radius + p.r;
    const sword = __ec.items.makeItem("sword", 30);
    const gs = p.equip.main && p.equip.main.baseId === "great_sword" ? p.equip.main : __ec.items.makeItem("great_sword", 30);
    p.equip.main = sword;
    const rSword = g.weaponReach();
    const swordIn = inReach(rSword);
    p.equip.main = gs;
    const rGS = g.weaponReach();
    const gsIn = inReach(rGS);
    g.events.changed();
    return { swordIn, gsIn, theyLand, dist, inTown: g.inTown, floor: g.floor, rSword, rGS };
  });
  C("at a Doom Knight's landed reach (1.89 tiles): a sword is short and a Great Sword reaches", fight.swordIn === false && fight.gsIn === true && !fight.inTown && Math.abs(fight.theyLand - 1.89) < 0.001, JSON.stringify(fight));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/02-greatsword-vs-knight${sfx}.png` });

  // 4) patch notes
  await ev(() => { __ec.game.goTown(); __ec.ui.open("settings"); });
  await page.waitForTimeout(300);
  await ev(() => [...document.querySelectorAll("button, .row, .btn")].find((e) => /patch notes/i.test(e.textContent))?.click());
  await page.waitForTimeout(400);
  const txt = await ev(() => document.body.innerText);
  C("patch notes: v1.9.1 weapon reach at the top", /1\.9\.1/.test(txt) && /reach/i.test(txt), "");
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
console.log(`${checks.filter(Boolean).length}/${checks.length} checks passed`);
process.exit(checks.every(Boolean) ? 0 : 1);
