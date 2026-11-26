// v1.1 at 852x393 in Chromium and WebKit: a red (unusable) bow, per-hero stash gold, Hilde's buy-back row,
// To belt for potions, waypoint stone only on waypoint levels, weapon-aware Character text.
// usage: node scripts/v11-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v11";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };

for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const sfx = ename === "webkit" ? "-webkit" : "";
  const br = await engine.launch();
  const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: ename === "chromium" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const shot = (name) => page.screenshot({ path: `${out}/${name}${sfx}.png` });
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  const tap = async (sel) => { await page.locator(sel).first().tap(); await page.waitForTimeout(200); };

  // an Amazon, level 20, with a long bow she can only use thanks to a Dexterity ring
  await page.goto(`${base}?debug&new&seed=11`);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const g = __ec.game;
    const s = g.toSave();
    s.player.cls = "amazon"; s.player.name = "Penthesilea"; s.player.level = 20; s.player.gold = 5000;
    localStorage.clear();
    // slot 2: leaving this page saves its own hero over slot 1
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  });
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1200);
  const st = await page.evaluate(() => {
    const g = __ec.game, p = g.player, mk = __ec.items.makeItem;
    g.goTown(true);
    const bow = mk("long_bow", 18);
    bow.q = "magic"; bow.name = "Keen Long Bow"; bow.mods = [{ s: "edmg", v: 40 }];
    p.base.str = 200;
    p.base.dex = 25;
    p.equip = { main: bow, off: mk("arrows", 1), chest: mk("armor", 1), ring1: { ...mk("ring", 1), q: "magic", name: "Ring of Dexterity", mods: [{ s: "dex", v: 60 }] } };
    const withRing = g.usable("main");
    delete p.equip.ring1;
    g.events.changed();
    return { withRing, without: g.usable("main"), cls: p.cls };
  });
  C("bow works with the Dexterity ring and stops working without it", st.withRing && !st.without && st.cls === "amazon", JSON.stringify(st));
  await page.evaluate(() => __ec.ui.open("inv"));
  await page.waitForTimeout(300);
  await tap('.eqi[data-eq="main"]');
  const red = await page.evaluate(() => ({
    bad: !!document.querySelector('.eqi.bad[data-eq="main"]'),
    text: document.querySelector("#panel")?.textContent?.includes("Unusable: requirements not met") ?? false,
  }));
  C("the unusable bow is red in the doll and its details say so", red.bad && red.text, JSON.stringify(red));
  await shot("01-red-unusable-bow");
  // Character panel: damage text follows the weapon
  await page.evaluate(() => { __ec.game.player.base.dex = 200; __ec.game.events.changed(); __ec.ui.open("char"); });
  await page.waitForTimeout(300);
  const ch = await page.evaluate(() => document.querySelector("#panel")?.textContent ?? "");
  C("Character panel: with a bow, Dexterity adds damage", ch.includes("+1% bow damage each"), "");
  const head = await page.evaluate(() => document.querySelector(".char-head")?.textContent ?? "");
  C("Character header shows the hero's name and class", head.includes("Penthesilea, Amazon") && !head.includes("Barbarian"), head);
  await shot("05-amazon-character");
  await page.evaluate(() => __ec.ui.close());

  // stash gold
  await page.evaluate(() => __ec.ui.open("stash"));
  await page.waitForTimeout(300);
  await tap('[data-act="sg-in"]');
  const sg = await page.evaluate(() => ({ gold: __ec.game.player.gold, stash: __ec.game.player.stashGold, shown: document.querySelector(".sgold .gold")?.textContent }));
  C("Deposit all moves carried gold into the stash", sg.gold === 0 && sg.stash === 5000 && sg.shown === "5,000 gold", JSON.stringify(sg));
  await page.evaluate(() => { const g = __ec.game; g.moveStashGold(-1200); g.events.changed(); });
  await page.waitForTimeout(200);
  await shot("02-stash-gold");
  // potions: To belt from the stash
  await page.evaluate(() => { const g = __ec.game, p = g.player; p.hpPots = 0; p.stash = [{ item: __ec.items.makeItem("hp_potion"), x: 0, y: 0 }]; g.events.changed(); __ec.ui.open("stash"); });
  await page.waitForTimeout(250);
  await tap('.gi[data-src="stash"]');
  const hasBelt = await page.locator('[data-act="tobelt"]').count();
  if (hasBelt) await tap('[data-act="tobelt"]');
  const pots = await page.evaluate(() => ({ hp: __ec.game.player.hpPots, stash: __ec.game.player.stash.length }));
  C("To belt moves a potion from the stash to the belt", hasBelt === 1 && pots.hp === 1 && pots.stash === 0, JSON.stringify(pots));
  await page.evaluate(() => __ec.ui.close());

  // buy-back
  const sold = await page.evaluate(() => {
    const g = __ec.game, p = g.player, mk = __ec.items.makeItem;
    g.restock();
    const n = g.vendorStock.length;
    const names = [];
    for (const [id, q] of [["great_sword", "rare"], ["helm", "magic"], ["spear", "normal"], ["gloves", "magic"]]) {
      const it = mk(id, 15);
      if (q !== "normal") { it.q = q; it.mods = [{ s: "life", v: 12 }]; it.name = q === "rare" ? "Grim Edge" : `Sturdy ${id}`; }
      p.bag = [{ item: it, x: 0, y: 0 }];
      g.sell(it.uid);
      names.push(it.uid);
    }
    g.events.changed();
    return { same: g.vendorStock.length === n, bb: g.buyback.length, first: g.buyback[0].uid === names[3] };
  });
  C("selling fills the buy-back row and leaves Hilde's wares alone", sold.same && sold.bb === 4 && sold.first, JSON.stringify(sold));
  await page.evaluate(() => __ec.ui.open("shop"));
  await page.waitForTimeout(300);
  const row = await page.evaluate(() => ({ cells: document.querySelectorAll(".bbrow .bbc").length, full: document.querySelectorAll('.bbrow [data-src="buyback"]').length }));
  C("buy-back row shows 8 cells, 4 filled", row.cells === 8 && row.full === 4, JSON.stringify(row));
  await shot("03-buyback-row");
  await tap('.bbrow [data-src="buyback"]');
  const btn = await page.locator('[data-act="buyback"]').count();
  await shot("03b-buyback-selected");
  const before = await page.evaluate(() => __ec.game.player.gold);
  if (btn) await tap('[data-act="buyback"]');
  const after = await page.evaluate(() => ({ gold: __ec.game.player.gold, bag: __ec.game.player.bag.length, bb: __ec.game.buyback.length }));
  C("Buy back returns the item to the bag for its sell price", btn === 1 && after.bag === 1 && after.bb === 3 && after.gold < before, JSON.stringify({ before, ...after }));
  // the panel must fit the screen (the buy-back row is inside the visible panel)
  const fit = await page.evaluate(() => { const r = document.querySelector(".bbrow")?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom } : null; });
  C("buy-back row is on screen at 852x393", !!fit && fit.bottom <= 393 && fit.top >= 0, JSON.stringify(fit));
  await page.evaluate(() => __ec.ui.close());

  // waypoint stone only on waypoint levels
  const wp = await page.evaluate(() => {
    const g = __ec.game, p = g.player, r = {};
    for (const f of [2, 5]) {
      g.goTown(true); g.floorCache.clear(); g.goDungeon(f);
      p.x = g.level.waypoint.x; p.y = g.level.waypoint.y;
      r[f] = { here: g.waypointHere(), ctx: g.contextAction() };
    }
    g.goTown(true); g.floorCache.clear(); g.goDungeon(2);
    p.x = g.level.waypoint.x + 0.6; p.y = g.level.waypoint.y + 0.6;
    for (const m of g.monsters) { m.x = 1; m.y = 1; m.state = "idle"; }
    return r;
  });
  C("no waypoint stone on level 2; one on level 5", !wp[2].here && wp[2].ctx !== "waypoint" && wp[5].here && wp[5].ctx === "waypoint", JSON.stringify(wp));
  await page.waitForTimeout(500);
  await shot("04-level2-no-waypoint");
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const ok = checks.filter(Boolean).length;
console.log(`${ok}/${checks.length} checks passed`);
process.exit(ok === checks.length ? 0 : 1);
