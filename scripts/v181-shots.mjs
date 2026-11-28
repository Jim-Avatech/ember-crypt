// v1.8.1 at 852x393 in Chromium and WebKit: the Sanctum of the Four on the waypoint, the altar, Kharos rising and
// fighting, the Endless Tower portal in camp, tower floors, the 5-minute tower portal countdown, and a run ending.
// usage: node scripts/v181-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v181";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };

async function loadHero(page) {
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const s = __ec.game.toSave();
    s.player.cls = "barbarian"; s.player.name = "Conqueror"; s.player.level = 75; s.floor = 100; s.maxFloor = 101;
    s.player.base = { str: 200, dex: 100, vit: 300, ene: 40 };
    s.player.equip = { main: __ec.items.makeItem("great_sword", 70), chest: __ec.items.makeItem("armor", 70) };
    s.player.artifacts = ["ember_heart", "sun_scarab", "mire_pearl", "cinder_crown"].map((id, i) => ({ id, at: 1764000000000 + i, level: 20 + i * 12 }));
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
    __ec.game.toSave = () => JSON.parse(JSON.stringify(s));
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
  const ctxText = () => ev(() => { const b = document.getElementById("btn-ctx"); return b.hidden ? "" : b.textContent; });

  // 1) waypoint: the Sanctum row
  await loadHero(page);
  await ev(() => __ec.ui.open("wp"));
  await page.waitForTimeout(400);
  const hasRow = await ev(() => document.querySelector('.wprow[data-floor="101"]')?.textContent ?? "");
  C("waypoint lists ✧ Sanctum of the Four once reached", /Sanctum of the Four/.test(hasRow), hasRow);
  await page.screenshot({ path: `${out}/01-waypoint-sanctum${sfx}.png` });
  await page.locator('.wprow[data-floor="101"]').click();
  await page.waitForTimeout(900);

  // 2) the altar
  await ev(() => { const g = __ec.game, a = g.altar; g.player.x = a.x - 1.2; g.player.y = a.y + 0.4; g.events.changed(); });
  await page.waitForTimeout(400);
  const where = await ev(() => document.getElementById("where").textContent);
  const lbl = await ctxText();
  C("Sanctum: label and the altar button 'Place the four artifacts'", where === "Sanctum of the Four" && /Place the four artifacts/.test(lbl), `${where} / ${lbl}`);
  await page.screenshot({ path: `${out}/02-altar${sfx}.png` });
  await page.locator("#btn-ctx").click({ force: true });
  await page.waitForTimeout(1200);
  const rising = await ev(() => ({ used: __ec.game.altar.used, riseT: __ec.game.altar.riseT, boss: !!__ec.game.boss, toast: document.getElementById("toast").textContent }));
  C("placing the artifacts: the altar burns (Kharos not out yet), a warning toast", rising.used && rising.riseT > 0 && !rising.boss && /Kharos rises/.test(rising.toast), JSON.stringify(rising));
  await page.screenshot({ path: `${out}/03-altar-rising${sfx}.png` });

  // 3) Kharos: let him rise and fight for a few seconds (hero kept alive), freeze on a telegraph if one shows
  const fight = await ev(async (idle) => {
    const g = __ec.game, p = g.player, d = g.derived();
    const hold = { x: p.x - 1.5, y: p.y };
    let telegraph = false, seen = false;
    for (let t = 0; t < 9; t += 1 / 60) {
      p.x = hold.x; p.y = hold.y; p.hp = d.maxHp;
      g.update(1 / 60, idle);
      if (g.boss) seen = true;
      if (seen && t > 3 && (g.novas.some((n) => n.t < n.warn) || g.shots.length > 0)) { telegraph = true; break; }
    }
    const b = g.boss;
    g.update = () => {};
    g.events.changed();
    return { seen, telegraph, kind: b?.def.kind, name: b?.def.name, specials: b?.def.specials, hp: b?.maxHp };
  }, idle);
  C("Kharos, the First Flame rises with every special and a telegraphed attack", fight.kind === "kharos" && fight.telegraph && fight.specials.length >= 5, JSON.stringify(fight));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/04-kharos${sfx}.png` });
  await ev(() => { delete __ec.game.update; });

  // 4) slay him: the tower portal opens in camp
  const slain = await ev(() => { const g = __ec.game; g.kill(g.boss); return { open: g.player.towerOpen, toast: document.getElementById("toast").textContent }; });
  await page.waitForTimeout(300);
  const toast4 = await ev(() => document.getElementById("toast").textContent);
  C("Kharos slain: the Endless Tower opens", slain.open === true && /tower portal has opened/.test(toast4), toast4);
  await ev(() => { const g = __ec.game; g.goTown(); g.player.x = 27.5; g.player.y = 16.3; g.events.changed(); });
  await page.waitForTimeout(500);
  const tl = await ctxText();
  C("camp: the violet tower portal with its 'Enter the Endless Tower' button", /Enter the Endless Tower/.test(tl), tl);
  await page.screenshot({ path: `${out}/05-tower-portal-camp${sfx}.png` });

  // 5) tower floors
  await page.locator("#btn-ctx").click({ force: true });
  await page.waitForTimeout(900);
  const t1 = await ev(() => ({ where: document.getElementById("where").textContent, floor: __ec.game.floor }));
  C("tower floor 1: 'Tower · Floor 1'", t1.where === "Tower · Floor 1", JSON.stringify(t1));
  await ev(() => { const g = __ec.game; for (let i = 0; i < 2; i++) { g.kill(g.boss); g.descend(); } g.events.changed(); });
  await page.waitForTimeout(700);
  const t3 = await ev(() => ({ where: document.getElementById("where").textContent, best: __ec.game.player.towerBest }));
  C("climbing: tower floor 3, best floor 3", t3.where === "Tower · Floor 3" && t3.best === 3, JSON.stringify(t3));
  await page.screenshot({ path: `${out}/06-tower-floor3${sfx}.png` });

  // 6) ⌂ Town from the tower: a portal with a 5:00 countdown
  await ev(() => { const g = __ec.game; for (const m of g.monsters) m.state = "dead"; g.startRecall(); });
  await page.waitForFunction(() => __ec.game.inTown, null, { timeout: 9000 }).catch(() => {});
  await ev(() => { const g = __ec.game; g.player.x = g.portal.x; g.player.y = g.portal.y + 1; g.events.changed(); });
  await page.waitForTimeout(500);
  const pl = await ctxText();
  const left = await ev(() => __ec.game.portalLeft());
  C("camp portal back to tower floor 3 counts down from 5:00", /Tower · Floor 3 · 4:5\d|Floor 3 · 5:00/.test(pl) && left > 290 && left <= 300, `${pl} (${left})`);
  await page.screenshot({ path: `${out}/07-tower-portal-countdown${sfx}.png` });

  // 7) the portal closes while away: run over, next entry on floor 1
  await ev(() => { const g = __ec.game, t = g.events.toast; window.__toasts = []; g.events.toast = (m, ...r) => { window.__toasts.push(m); return t(m, ...r); }; g.portal.expires = Date.now() - 1; });
  await page.waitForTimeout(500);
  const over = await ev(() => ({ portal: !!__ec.game.portal, run: !!__ec.game.towerRun, toast: window.__toasts.join(" | ") }));
  C("portal closed: 'Your tower run is over (best: floor 3)'", !over.portal && !over.run && /run is over \(best: floor 3\)/.test(over.toast), JSON.stringify(over));
  await page.screenshot({ path: `${out}/08-run-over${sfx}.png` });
  const again = await ev(() => { const g = __ec.game; g.enterTower(); return g.floor - 101; });
  C("next entry starts on tower floor 1", again === 1, String(again));

  // 8) patch notes
  await ev(() => { __ec.game.goTown(); __ec.ui.open("settings"); });
  await page.waitForTimeout(300);
  await ev(() => [...document.querySelectorAll("button, .row, .btn")].find((e) => /patch notes/i.test(e.textContent))?.click());
  await page.waitForTimeout(400);
  const txt = await ev(() => document.body.innerText);
  C("patch notes: v1.8.1 Sanctum and Endless Tower at the top", /1\.8\.1/.test(txt) && /Endless Tower/.test(txt), "");
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
console.log(`${checks.filter(Boolean).length}/${checks.length} checks passed`);
process.exit(checks.every(Boolean) ? 0 : 1);
