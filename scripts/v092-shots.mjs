// v0.9.2: HUD with a boss bar at 852x393 with iPhone safe-area insets (bar must not touch any HUD button,
// buffs or minimap; no top-left text), the 3 skill buttons, and the Left/Right ring choice with both rings compared.
// usage: node scripts/v092-shots.mjs [baseUrl]
import { chromium, webkit } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
for (const [engine, insets, tag] of [[chromium, { l: 47, r: 47, t: 0, b: 21 }, "iphone"], [chromium, { l: 0, r: 0, t: 0, b: 0 }, "noinset"], [webkit, { l: 59, r: 59, t: 0, b: 21 }, "webkit-iphone-pro"]]) {
  const b = await engine.launch();
  const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: engine === chromium });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(`${base}?debug&new&seed=4`);
  await page.waitForTimeout(900);
  await page.evaluate((s) => {
    const r = document.documentElement.style;
    r.setProperty("--sal", `${s.l}px`); r.setProperty("--sar", `${s.r}px`); r.setProperty("--sat", `${s.t}px`); r.setProperty("--sab", `${s.b}px`);
    __ec.settings.tutorialSeen = true;
    __ec.ui.showTutorial(false);
    const g = __ec.game, p = g.player;
    g.goDungeon(5);
    p.level = 20; p.base.vit = 400;
    p.skills = { bash: 3, double_swing: 2, frenzy: 3, leap: 1 };
    p.slots = ["frenzy", "double_swing", "leap"];
    p.buffs.bo = 30; p.buffs.shout = 30; p.frenzy.stacks = 3; p.frenzy.t = 9;
    const bo = g.boss;
    Object.assign(bo, { x: p.x + 2, y: p.y + 1, state: "chase", dmgMin: 0, dmgMax: 0, atkT: 99 });
    bo.def = { ...bo.def, speed: 0 };
    bo.hp = bo.maxHp * 0.7;
    g.events.changed();
  }, insets);
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const bar = __ec.renderer?.lastBossBar ?? null;
    const boxes = [...document.querySelectorAll("#hud .hud-tr .mbtn, #buffs .buff, #minimap")].filter((e) => e.offsetParent).map((e) => { const q = e.getBoundingClientRect(); return { id: e.id || e.className || e.textContent, l: q.left, t: q.top, r: q.right, b: q.bottom }; });
    return { bar, boxes, tl: !!document.querySelector("#floor-label, #objective"), town: !document.querySelector("#btn-town").hidden, sbtn: document.querySelectorAll(".sbtn").length };
  });
  // a toast while the boss bar is up must sit below it
  await page.evaluate(() => __ec.ui.toast("Ember Crypt — Level 5", 4000));
  await page.waitForTimeout(400);
  const tq = await page.evaluate(() => { const q = document.querySelector("#toast").getBoundingClientRect(); return { t: q.top, b: q.bottom }; });
  if (r.bar) check(`${tag}: toast sits below the boss bar`, tq.t >= r.bar.y + r.bar.h, JSON.stringify({ toastTop: tq.t, barBottom: r.bar.y + r.bar.h }));
  if (!r.bar) {
    check(`${tag}: boss bar drawn`, false, "renderer.lastBossBar missing (is __ec.renderer exposed?)");
  } else {
    const hits = r.boxes.filter((q) => r.bar.x < q.r && r.bar.x + r.bar.w > q.l && r.bar.y < q.b && r.bar.y + r.bar.h > q.t);
    check(`${tag}: boss bar clear of every HUD button, buff and the minimap`, hits.length === 0, JSON.stringify({ bar: r.bar, hits: hits.map((h) => h.id) }));
  }
  check(`${tag}: no top-left text`, !r.tl);
  check(`${tag}: Town button visible in the crypt`, r.town);
  check(`${tag}: 3 skill buttons`, r.sbtn === 3, String(r.sbtn));
  await page.screenshot({ path: `screenshots/v092-hud-boss-${tag}.png` });
  // Town still works
  await page.locator("#btn-town").tap();
  await page.waitForTimeout(150);
  check(`${tag}: Town starts the return`, await page.evaluate(() => !!__ec.game.recall));
  await page.locator("#btn-town").tap(); // cancel
  if (tag === "iphone") {
    // ring choice
    await page.evaluate(() => {
      const g = __ec.game, p = g.player, mk = __ec.items.makeItem;
      p.equip.ring1 = Object.assign(mk("ring", 10), { uid: 8801, q: "magic", name: "Ring of the Fox", mods: [{ s: "life", v: 12 }], aff: [] });
      p.equip.ring2 = Object.assign(mk("ring", 12), { uid: 8802, q: "magic", name: "Garnet Ring", mods: [{ s: "fres", v: 20 }], aff: [] });
      p.bag = [{ item: Object.assign(mk("ring", 14), { uid: 8803, q: "rare", name: "Storm Loop", mods: [{ s: "str", v: 6 }, { s: "ll", v: 4 }, { s: "lres", v: 18 }], aff: [] }), x: 0, y: 0 }];
      g.events.changed();
    });
    await page.locator('.mbtn[data-tab="inv"]').tap();
    await page.waitForTimeout(300);
    await page.locator('[data-src="bag"][data-uid="8803"]').tap();
    await page.waitForTimeout(400);
    const btns = await page.$$eval('[data-act="equip"]', (bs) => bs.map((b) => b.textContent.trim()));
    check("ring: Left ring / Right ring buttons", btns.includes("Left ring") && btns.includes("Right ring"), JSON.stringify(btns));
    const cards = await page.$$eval(".cmpsheet .ccard .chead", (hs) => hs.map((h) => h.textContent.trim()));
    const body = await page.locator(".cmpsheet").textContent().catch(() => "");
    check("ring: compare shows both equipped rings, labelled left and right", body.includes("Ring of the Fox") && body.includes("Garnet Ring") && cards.some((c) => c.includes("Left ring")) && cards.some((c) => c.includes("Right ring")), JSON.stringify(cards));
    await page.screenshot({ path: "screenshots/v092-ring-choice.png" });
    await page.locator('[data-act="equip"][data-slot="ring2"]').tap();
    await page.waitForTimeout(300);
    const eq = await page.evaluate(() => ({ r1: __ec.game.player.equip.ring1?.name, r2: __ec.game.player.equip.ring2?.name, bag: __ec.game.player.bag.map((e) => e.item.name) }));
    check("ring: Right ring replaced the right ring, old one in the bag", eq.r1 === "Ring of the Fox" && eq.r2 === "Storm Loop" && eq.bag.includes("Garnet Ring"), JSON.stringify(eq));
  }
  check(`${tag}: no page errors`, errs.length === 0, errs.join(" | "));
  await b.close();
}
const ok = checks.every(Boolean);
console.log(ok ? `v092-shots: PASS (${checks.length})` : "v092-shots: FAIL");
process.exit(ok ? 0 : 1);
