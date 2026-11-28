// v1.8 at 852x393 in Chromium and WebKit: Act V (Rimefrost Citadel) tileset and frozen monsters, its waypoint column,
// Vorthak on level 20, and an old hero who beat Malakar getting Act V's first waypoint.
// usage: node scripts/v18-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v18";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };

/** an old (v1.7.3-style) hero who beat Malakar: maxFloor 80, all four artifacts */
async function loadVeteran(page) {
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const s = __ec.game.toSave();
    s.player.cls = "barbarian"; s.player.name = "Veteran"; s.player.level = 62; s.floor = 80; s.maxFloor = 80;
    s.player.base = { str: 160, dex: 80, vit: 200, ene: 30 };
    s.player.equip = { main: __ec.items.makeItem("great_sword", 60), chest: __ec.items.makeItem("armor", 60) };
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

  // 1) migration: the veteran's waypoint shows Act V level 1
  await loadVeteran(page);
  const mig = await ev(() => ({ max: __ec.game.maxFloor, ver: document.body.innerText.match(/v1\.\d+(\.\d+)?/)?.[0] }));
  C("old hero who beat Malakar: Act V's first waypoint is open (maxFloor 81)", mig.max === 81, JSON.stringify(mig));
  await ev(() => __ec.ui.open("wp"));
  await page.waitForTimeout(400);
  const wp = await ev(() => ({ acts: [...document.querySelectorAll(".wpact")].map((e) => `${e.querySelector(".wph").textContent}${e.classList.contains("locked") ? " (locked)" : ""}:${e.querySelectorAll(".wprow").length}`), a5: !!document.querySelector('.wprow[data-floor="81"]') }));
  C("waypoint: five act columns, Act V · Rimefrost Citadel level 1 listed", wp.acts.length === 5 && wp.a5 && /Act V · Rimefrost Citadel:1/.test(wp.acts.join("|")), JSON.stringify(wp));
  await page.screenshot({ path: `${out}/01-waypoint-act5${sfx}.png` });
  await page.locator('.wprow[data-floor="81"]').click();
  await page.waitForTimeout(1000);
  const lab = await ev(() => ({ t: document.getElementById("where").textContent, floor: __ec.game.floor, toast: document.getElementById("toast").textContent }));
  C("waypoint to Act V: label 'Act 5 · Level 1', Rimefrost Citadel toast", lab.floor === 81 && lab.t === "Act 5 · Level 1" && /Rimefrost Citadel/.test(lab.toast), JSON.stringify(lab));

  // 2) Act V level 1: ice tiles and frozen monsters, gathered in view
  const mons = await ev((idle) => {
    const g = __ec.game, p = g.player;
    const kinds = ["husk", "revenant", "rimecaller", "wraith"];
    const pick = kinds.map((k) => g.monsters.find((m) => m.def.kind === k && m.state !== "dead")).filter(Boolean);
    pick.forEach((m, i) => { m.x = p.x + 1.6 + (i % 2) * 1.2; m.y = p.y - 0.8 + Math.floor(i / 2) * 1.4; m.state = "idle"; m.homeX = m.x; m.homeY = m.y; m.wx = m.x; m.wy = m.y; m.fx = -1; m.fy = 0; });
    for (let i = 0; i < 3; i++) g.update(1 / 60, idle);
    g.update = () => {};
    return { kinds: pick.map((m) => m.def.kind), tints: pick.map((m) => m.def.tint), names: pick.map((m) => m.def.name) };
  }, idle);
  C("Act V monsters: husk, revenant, rime caller, frost wraith, each tinted", mons.kinds.length === 4 && mons.tints.every((t) => /^#/.test(t)), JSON.stringify(mons));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/02-act5-level1${sfx}.png` });
  await ev(() => { delete __ec.game.update; });

  // 3) Vorthak, the Frozen King on level 20 (a frame mid-fight)
  const boss = await ev((idle) => {
    const g = __ec.game, p = g.player;
    g.goDungeon(100);
    const b = g.boss;
    g.monsters = [b];
    p.x = b.x - 3; p.y = b.y; p.fx = 1; p.fy = 0;
    Object.assign(b, { state: "chase", homeX: b.x, homeY: b.y });
    const d = g.derived();
    for (let t = 0; t < 3; t += 1 / 60) { p.hp = d.maxHp; g.update(1 / 60, idle); }
    g.update = () => {};
    g.events.changed();
    return { kind: b.def.kind, name: b.def.name, specials: b.def.specials };
  }, idle);
  await page.waitForTimeout(300);
  boss.where = await ev(() => document.getElementById("where").textContent);
  C("Act V level 20: Vorthak, the Frozen King, with specials", boss.kind === "frostking" && boss.specials.length >= 4 && boss.where === "Act 5 · Level 20", JSON.stringify(boss));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/03-vorthak${sfx}.png` });
  await ev(() => { delete __ec.game.update; });

  // 4) patch notes top entry
  await ev(() => { __ec.game.goTown(); __ec.ui.open("settings"); });
  await page.waitForTimeout(300);
  await ev(() => [...document.querySelectorAll("button, .row, .btn")].find((e) => /patch notes/i.test(e.textContent))?.click());
  await page.waitForTimeout(400);
  const txt = await ev(() => document.body.innerText);
  C("patch notes: v1.8 Act V at the top", /1\.8/.test(txt) && /Rimefrost Citadel/.test(txt), "");
  await page.screenshot({ path: `${out}/04-patch-notes${sfx}.png` });
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
console.log(`${checks.filter(Boolean).length}/${checks.length} checks passed`);
process.exit(checks.every(Boolean) ? 0 : 1);
