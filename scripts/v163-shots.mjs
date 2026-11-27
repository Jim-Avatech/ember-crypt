// v1.6.3 at 852x393 in Chromium and WebKit: Charged Bolt in a 45° cone (±22.5°); "+1 to Frozen Armor" on a wand
// grants the skill with no points (tree, button, cast) and takes it off the button when unequipped; potions stack in
// the backpack (old loose ones merge on load) and fill the belt by themselves.
// usage: node scripts/v163-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v163";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };

for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const sfx = ename === "webkit" ? "-webkit" : "";
  const br = await engine.launch();
  const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: ename === "chromium" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  const ev = (f, a) => page.evaluate(f, a);
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await ev(() => {
    const s = __ec.game.toSave();
    s.player.cls = "sorceress"; s.player.name = "Tal Rasha"; s.player.level = 30;
    s.player.base = { str: 40, dex: 25, vit: 70, ene: 100 };
    s.player.skills = { charged_bolt: 14 };
    s.player.slots = ["charged_bolt", null, null];
    s.player.mainAtk = "charged_bolt";
    s.player.equip = { main: __ec.items.makeItem("battle_staff", 20) };
    s.maxFloor = 40;
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  });
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1300);
  await ev(() => __ec.game.goDungeon(12));
  await page.waitForTimeout(900);
  // an open stretch: the hero, and 7 open tiles up-left on screen (−x) with room either side
  const spot = await ev(() => {
    const g = __ec.game, L = g.level, p = g.player;
    const open = (x, y) => !g.blocked(x, y, 0.45);
    for (let y = 4; y < L.h - 4; y++) for (let x = 10; x < L.w - 3; x++) {
      let ok = true;
      for (let d = 0; d <= 7 && ok; d += 0.5) ok = open(x + 0.5 - d, y + 0.5) && open(x + 0.5 - d, y - 1) && open(x + 0.5 - d, y + 2);
      if (ok) { window.__cb = { x: x + 0.5, y: y + 0.5 }; p.x = x + 0.5; p.y = y + 0.5; return { x, y }; }
    }
    return null;
  });
  C("found open ground", !!spot, JSON.stringify(spot));
  for (let k = 0; k < 6; k++) { await page.waitForTimeout(500); await ev(() => { const g = __ec.game, p = g.player; p.hp = g.derived().maxHp; p.x = window.__cb.x; p.y = window.__cb.y; for (const m of g.monsters) if (Math.hypot(m.x - p.x, m.y - p.y) < 14) { m.x = -50; m.y = -50; } }); }
  // several casts, counted in the game loop (stepped from the page), then one more for the screenshot
  const res = await ev((idle) => {
    const g = __ec.game, p = g.player;
    const m = g.monsters.find((x) => x.state !== "dead" && x.def.rank === "normal");
    m.def = { ...m.def, speed: 0, dmgMin: 0, dmgMax: 0 };
    const launch = [];
    const push = g.spells.push.bind(g.spells);
    g.spells.push = (...xs) => { for (const s of xs) if (s.k === "missile" && s.id === "charged_bolt") launch.push(Math.atan2(s.vy, s.vx)); return push(...xs); };
    let hits = 0, bolts = 0;
    const eh = g.elemHit.bind(g);
    g.elemHit = (mm, d, e, o) => { if (mm === m) hits++; eh(mm, d, e, o); };
    for (let c = 0; c < 10; c++) {
      p.x = window.__cb.x; p.y = window.__cb.y; m.x = p.x - 6; m.y = p.y; m.hp = m.maxHp = 1e6; m.state = "chase";
      p.mana = 999; p.action = null; p.fx = -1; p.fy = 0;
      const n0 = launch.length;
      g.castSkill("charged_bolt", g.derived());
      for (let k = 0; k < 120; k++) { g.update(1 / 60, idle); p.x = window.__cb.x; p.y = window.__cb.y; m.x = p.x - 6; m.y = p.y; m.kx = 0; m.ky = 0; p.hp = 9999; }
      bolts += launch.length - n0;
    }
    const devs = launch.map((a) => Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) * 180 / Math.PI);
    // the screenshot cast: freeze mid-flight
    p.mana = 999; p.action = null; m.hp = 1e6;
    g.castSkill("charged_bolt", g.derived());
    for (let k = 0; k < 40; k++) { g.update(1 / 60, idle); p.x = window.__cb.x; p.y = window.__cb.y; m.x = p.x - 6; m.y = p.y; m.kx = 0; m.ky = 0; }
    g.update = () => {};
    return { bolts, hits, maxLaunchDeg: Math.max(...devs), inFlight: g.spells.filter((s) => s.id === "charged_bolt").length };
  }, idle);
  await page.waitForTimeout(150);
  C("every bolt leaves within ±22.5° of the aim, outer bolts use the wider cone", res.maxLaunchDeg <= 23 && res.maxLaunchDeg > 16, JSON.stringify(res));
  C("a monster 6 tiles away takes 30–70% of the bolts (10 casts)", res.hits / res.bolts >= 0.3 && res.hits / res.bolts <= 0.7, `${res.hits}/${res.bolts}`);
  await page.screenshot({ path: `${out}/01-charged-bolt-6-tiles${sfx}.png` });
  await ev(() => { delete __ec.game.update; });

  // ---- 2) +1 to Frozen Armor wand, potion stacks (from a fresh page, so leaving the crypt doesn't save over it)
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await ev(() => {
    const s = __ec.game.toSave();
    s.player.cls = "sorceress"; s.player.name = "Tal Rasha"; s.player.base = { str: 40, dex: 25, vit: 70, ene: 100 };
    s.player.level = 10; s.player.skills = {}; s.player.skillPoints = 0;
    s.player.slots = [null, null, null]; s.player.mainAtk = null;
    s.player.equip = { main: __ec.items.makeItem("battle_staff", 8) };
    const w = { ...__ec.items.makeItem("wand", 8), uid: 9801, q: "magic", name: "Wand of Frost", mods: [{ s: "skill", v: 1, sk: "frozen_armor" }] };
    const pots = [];
    for (let i = 0; i < 9; i++) pots.push({ item: __ec.items.makeItem("hp_potion"), x: 2 + (i % 4), y: Math.floor(i / 4) });
    for (let i = 0; i < 3; i++) pots.push({ item: __ec.items.makeItem("mp_potion"), x: 7, y: i });
    s.player.bag = [{ item: w, x: 0, y: 0 }, ...pots];
    s.player.hpPots = 1; s.player.mpPots = 4;
    s.maxFloor = 40;
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
    // this page's own save on leaving (it may be slot 2 too) writes the same hero
    const keep = JSON.parse(JSON.stringify(s));
    __ec.game.toSave = () => JSON.parse(JSON.stringify(keep));
  });
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1400);
  const pots = await ev(() => {
    const g = __ec.game, p = g.player;
    const st = (id) => p.bag.filter((e) => e.item.baseId === id).map((e) => e.item.qty ?? 1);
    return { cap: g.beltCap(), hp: p.hpPots, mp: p.mpPots, hpStacks: st("hp_potion"), mpStacks: st("mp_potion"), hud: document.querySelector("#btn-hp b")?.textContent };
  });
  // 9 loose healing potions + 1 on the belt: the belt (4) fills, the other 6 are one stack; 3 mana potions: one stack
  C("old loose potions merged into one stack each and the belt filled itself", pots.hp === pots.cap && pots.hpStacks.join() === String(10 - pots.cap) && pots.mpStacks.join() === "3" && pots.hud === String(pots.cap), JSON.stringify(pots));
  await page.locator('.mbtn[data-tab="inv"]').click();
  await page.waitForTimeout(400);
  const badge = await ev(() => [...document.querySelectorAll('[data-src="bag"] .qty.pq')].map((e) => e.textContent).join());
  C("stack counts show on the potion cells", badge.split(",").sort().join() === [String(10 - pots.cap), "3"].sort().join(), badge);
  await page.screenshot({ path: `${out}/02-potion-stacks${sfx}.png` });
  // equip the wand from its card
  await page.locator('[data-src="bag"][data-uid="9801"]').first().click();
  await page.waitForTimeout(400);
  const eqBtn = page.locator('[data-act="equip"][data-slot="main"]').first();
  if (await eqBtn.count()) await eqBtn.click(); else await ev(() => __ec.game.equipFromBag(9801, "main"));
  await page.waitForTimeout(400);
  await page.locator('[data-act="cmp-close"]').click().catch(() => {});
  await ev(() => __ec.ui.close?.());
  await page.waitForTimeout(300);
  const g1 = await ev(() => ({ main: __ec.game.player.equip.main?.uid, lvl: __ec.game.skillLevel("frozen_armor"), hard: __ec.game.hardLevel("frozen_armor"), slots: __ec.game.player.slots, btn: document.querySelector("#btn-s0")?.textContent }));
  C("+1 to Frozen Armor wand grants Frozen Armor level 1 with 0 points, on button 1", g1.main === 9801 && g1.lvl === 1 && g1.hard === 0 && g1.slots[0] === "frozen_armor" && /Frozen Armor/.test(g1.btn), JSON.stringify(g1));
  await page.click('[data-tab="skills"]');
  await page.waitForTimeout(300);
  await page.click('.stab[data-tree="cold"]');
  await page.waitForTimeout(150);
  await page.click('.snode[data-id="frozen_armor"]');
  await page.waitForTimeout(250);
  const tree = await ev(() => ({ granted: document.querySelector('.snode[data-id="frozen_armor"]')?.classList.contains("granted"), lv: document.querySelector('.snode[data-id="frozen_armor"] .sl')?.textContent, from: document.querySelector(".sfrom")?.textContent ?? "", assign: document.querySelectorAll('.assign [data-act="assign"], .assign [data-act="unassign"]').length }));
  C("skill tree shows it granted (blue, level 1, 'Granted by your gear') and assignable", tree.granted && tree.lv === "1" && /Granted by your gear/.test(tree.from) && tree.assign === 3, JSON.stringify(tree));
  await page.screenshot({ path: `${out}/03-granted-skill-tree${sfx}.png` });
  await ev(() => __ec.ui.close?.());
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/04-granted-skill-button${sfx}.png` });
  // cast it in the crypt, then take the wand off
  await ev(() => __ec.game.goDungeon(1));
  await page.waitForTimeout(900);
  const cast = await ev(() => { const g = __ec.game, p = g.player; p.mana = 999; p.action = null; for (const m of g.monsters) { m.x = -50; m.y = -50; } return g.castSkill("frozen_armor", g.derived()); });
  C("the granted skill casts", cast === true);
  await page.waitForTimeout(800);
  const un = await ev(() => { const g = __ec.game; const e = g.unequip("main"); return { e, lvl: g.skillLevel("frozen_armor"), slots: g.player.slots }; });
  await page.waitForTimeout(300);
  const btnAfter = await ev(() => ({ empty: document.querySelector("#btn-s0")?.classList.contains("empty"), txt: document.querySelector("#btn-s0")?.textContent }));
  C("unequipping takes the skill away and off its button", un.e === null && un.lvl === 0 && un.slots[0] === null && btnAfter.empty, JSON.stringify({ un, btnAfter }));
  // drink from the belt: it refills from the stack
  const before = await ev(() => { const p = __ec.game.player; p.hp = 5; return p.bag.find((e) => e.item.baseId === "hp_potion")?.item.qty; });
  await page.locator("#btn-hp").tap().catch(async () => { await page.locator("#btn-hp").click(); });
  await page.waitForTimeout(400);
  const after = await ev(() => { const g = __ec.game, p = g.player; return { hp: p.hpPots, cap: g.beltCap(), qty: p.bag.find((e) => e.item.baseId === "hp_potion")?.item.qty }; });
  C("drinking from the belt refills it from the backpack stack", after.hp === after.cap && after.qty === before - 1, JSON.stringify({ before, ...after }));
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const failed = checks.filter((c) => !c).length;
console.log(failed ? `${failed} FAILED` : `all ${checks.length} passed`);
process.exit(failed ? 1 : 0);
