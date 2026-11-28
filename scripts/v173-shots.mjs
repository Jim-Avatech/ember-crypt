// v1.7.3 at 852x393 in Chromium and WebKit: floor-1 boss slam is telegraphed for 1.5 s and a fresh Barbarian
// survives it with plenty of life; patch note listed; floor-1 boss fight stays winnable.
// usage: node scripts/v173-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v173";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };

async function loadFresh(page) {
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const s = __ec.game.toSave();
    s.player.cls = "barbarian"; s.player.name = "Bul-Kathos"; s.player.level = 1; s.maxFloor = 1;
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
    const keep = JSON.parse(JSON.stringify(s));
    __ec.game.toSave = () => JSON.parse(JSON.stringify(keep));
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

  // 1) fresh level-1 Barbarian next to the floor-1 boss: the slam ring warns 1.5 s, then the hit is a minor share of 55 life
  await loadFresh(page);
  await ev(() => { __ec.ui.close?.(); __ec.game.goDungeon(1); });
  await page.waitForTimeout(600);
  const r = await ev((idle) => {
    const g = __ec.game, p = g.player, b = g.boss;
    const d = g.derived();
    g.monsters = [b];
    p.x = b.x - 1.4; p.y = b.y; p.fx = 1; p.fy = 0;
    Object.assign(b, { state: "chase", homeX: b.x, homeY: b.y, atkT: 0, cd: 0 });
    p.hp = d.maxHp;
    let warn = 0, ringAt = -1, t = 0;
    const hold = { x: p.x, y: p.y };
    for (; t < 4 && ringAt < 0; t += 1 / 60) {
      p.x = hold.x; p.y = hold.y; p.hp = d.maxHp; b.x = hold.x + 1.4; b.y = hold.y;
      g.update(1 / 60, idle);
      const n = g.novas.find((n) => n.warn > 1.2);
      if (n) { warn = n.warn; ringAt = t; }
    }
    // let the ring grow ~0.8 s for the screenshot, then freeze
    for (let k = 0; k < 48; k++) { p.x = hold.x; p.y = hold.y; b.x = hold.x + 1.4; b.y = hold.y; g.update(1 / 60, idle); }
    const snap = { warn, ringAt, hp: p.hp, maxHp: d.maxHp };
    g.__ud = g.update; g.update = () => {};
    return snap;
  }, idle);
  C("floor-1 boss slam is telegraphed for 1.5 s", Math.abs(r.warn - 1.5) < 0.01, JSON.stringify(r));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/01-slam-warning${sfx}.png` });
  await ev(() => { __ec.game.update = __ec.game.__ud; });
  const hit = await ev((idle) => {
    const g = __ec.game, p = g.player, b = g.boss, d = g.derived();
    const hold = { x: p.x, y: p.y };
    p.hp = d.maxHp;
    let worst = 0, min = d.maxHp;
    for (let t = 0; t < 6; t += 1 / 60) {
      const before = p.hp;
      p.x = hold.x; p.y = hold.y; b.x = hold.x + 1.4; b.y = hold.y;
      g.update(1 / 60, idle);
      worst = Math.max(worst, before - p.hp);
      min = Math.min(min, p.hp);
      if (p.hp < d.maxHp * 0.5) p.hp = d.maxHp;
    }
    return { worstPct: Math.round((100 * worst) / d.maxHp), maxHp: d.maxHp, bossMax: b.dmgMax };
  }, idle);
  C("a fresh Barbarian takes at most ~40% of life from the floor-1 boss in one hit", hit.worstPct <= 40, JSON.stringify(hit));

  // 2) patch notes list v1.7.3 at the top
  await loadFresh(page);
  await page.click('[data-tab="set"], [data-tab="settings"], .mbtn[data-tab="set"]').catch(() => {});
  await page.waitForTimeout(300);
  const pn = await ev(() => { const b = [...document.querySelectorAll("button, .row, .btn")].find((e) => /patch notes/i.test(e.textContent)); b?.click(); return !!b; });
  await page.waitForTimeout(400);
  const txt = await ev(() => document.body.innerText);
  C("Settings → patch notes: v1.7.3 'A gentler start' at the top", pn && /1\.7\.3/.test(txt) && /A gentler start/.test(txt), String(pn));
  await page.screenshot({ path: `${out}/02-patch-notes${sfx}.png` });
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
console.log(`${checks.filter(Boolean).length}/${checks.length} checks passed`);
process.exit(checks.every(Boolean) ? 0 : 1);
