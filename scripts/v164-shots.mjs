// v1.6.4 at 852x393 in Chromium and WebKit: spells leech at 35%, capped at 4% of max life / mana a second. Character
// screen note, item card note, and a Blizzard into a pack healing a hurt Sorceress at no more than the cap.
// usage: node scripts/v164-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v164";
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
    s.player.skills = { frost_nova: 1, ice_bolt: 1, ice_blast: 1, blizzard: 20, cold_mastery: 10 };
    s.player.slots = ["blizzard", null, null];
    s.player.mainAtk = "blizzard";
    const ring = (uid, ll, ml) => ({ ...__ec.items.makeItem("ring", 20), uid, q: "magic", name: "Ring of the Leech", mods: [{ s: "ll", v: ll }, ...(ml ? [{ s: "ml", v: ml }] : [])] });
    s.player.equip = { main: __ec.items.makeItem("battle_staff", 20), ring1: ring(9901, 6, 6) };
    s.player.bag = [{ item: ring(9902, 5, 0), x: 0, y: 0 }];
    s.maxFloor = 40;
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
    const keep = JSON.parse(JSON.stringify(s));
    __ec.game.toSave = () => JSON.parse(JSON.stringify(keep));
  });
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1400);
  // 1) Character screen
  await page.click('[data-tab="char"]');
  await page.waitForTimeout(400);
  const row = await ev(() => ({ t: document.querySelector(".leechnote")?.textContent.replace(/\s+/g, " ").trim() ?? "", hp: __ec.game.derived().maxHp, mp: __ec.game.derived().maxMana }));
  const capH = Math.round(Math.max(1, row.hp * 0.04)), capM = Math.round(Math.max(1, row.mp * 0.04));
  C("Character screen: 'Spells leech at 35%, up to X life · Y mana a second'", new RegExp(`Spells leech at 35%.*up to ${capH} life · ${capM} mana a second`).test(row.t), JSON.stringify(row));
  await page.locator(".leechnote").first().scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${out}/01-character-spell-leech${sfx}.png` });
  await ev(() => __ec.ui.close?.());
  // 2) item card
  await page.locator('.mbtn[data-tab="inv"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-src="bag"][data-uid="9902"]').first().click();
  await page.waitForTimeout(400);
  const card = await ev(() => [...document.querySelectorAll(".leechnote")].map((e) => e.textContent).join(" | ").replace(/\s+/g, " "));
  C("leech item card: 'Spells leech at 35%, up to 4% of max life / mana a second'", /Spells leech at 35%, up to 4% of max life \/ mana a second/.test(card), card.slice(0, 260));
  await page.screenshot({ path: `${out}/02-item-card-spell-leech${sfx}.png` });
  await page.locator('[data-act="cmp-close"]').click().catch(() => {});
  await ev(() => __ec.ui.close?.());
  // 3) Blizzard into a pack while hurt
  await ev(() => __ec.game.goDungeon(12));
  await page.waitForTimeout(900);
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
  for (let k = 0; k < 4; k++) { await page.waitForTimeout(400); await ev(() => { const g = __ec.game, p = g.player; p.hp = g.derived().maxHp; p.x = window.__cb.x; p.y = window.__cb.y; for (const m of g.monsters) if (Math.hypot(m.x - p.x, m.y - p.y) < 14) { m.x = -50; m.y = -50; } }); }
  const res = await ev((idle) => {
    const g = __ec.game, p = g.player, d = g.derived();
    const proto = g.monsters.find((x) => x.state !== "dead" && x.def.rank === "normal");
    const pack = [];
    for (let i = 0; i < 10; i++) {
      const m = { ...proto, id: 7e6 + i, x: p.x - 5 + (i % 3) * 0.8 - 0.8, y: p.y + (Math.floor(i / 3) - 1.5) * 0.8, state: "chase", kx: 0, ky: 0, stunT: 0, chillT: 0, frozenT: 0, hp: 1e6, maxHp: 1e6, fuse: -1 };
      m.def = { ...proto.def, speed: 0, dmgMin: 0, dmgMax: 0, specials: undefined, shot: undefined };
      pack.push(m);
    }
    g.monsters.push(...pack);
    const spots = pack.map((m) => ({ x: m.x, y: m.y }));
    const hold = () => { p.x = window.__cb.x; p.y = window.__cb.y; p.fx = -1; p.fy = 0; pack.forEach((m, i) => { m.x = spots[i].x; m.y = spots[i].y; m.kx = 0; m.ky = 0; }); };
    const s0 = { ...g.spellLeechGot };
    const T = 10;
    let casts = 0;
    for (let t = 0; t < T; t += 1 / 60) {
      hold(); p.hp = Math.min(p.hp, d.maxHp * 0.2); p.healLeft = 0; p.mana = Math.max(p.mana, 200);
      if (!p.action && g.castSkill("blizzard", g.derived())) casts++;
      g.update(1 / 60, idle);
    }
    const lifePerS = (g.spellLeechGot.hp - s0.hp) / T;
    // the screenshot: hurt, a fresh Blizzard on the pack, frozen mid-storm
    p.hp = d.maxHp * 0.35; p.action = null; p.mana = 500;
    g.castSkill("blizzard", g.derived());
    for (let k = 0; k < 50; k++) { hold(); g.update(1 / 60, idle); }
    g.update = () => {};
    return { lifePerS, cap: d.maxHp * 0.04, maxHp: d.maxHp, casts };
  }, idle);
  await page.waitForTimeout(200);
  C("Blizzard on 10 monsters heals a hurt Sorceress, but no more than 4% of max life a second", res.lifePerS > 0 && res.lifePerS <= res.cap * 1.12, JSON.stringify(res));
  await page.screenshot({ path: `${out}/03-blizzard-leech${sfx}.png` });
  await ev(() => { delete __ec.game.update; });
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const failed = checks.filter((c) => !c).length;
console.log(failed ? `${failed} FAILED` : `all ${checks.length} passed`);
process.exit(failed ? 1 : 0);
