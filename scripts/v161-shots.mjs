// v1.6.1 at 852x393 in Chromium and WebKit: spell base and real damage in the skill tooltip, spell base and cast time
// on the Character screen, +Sorceress skills / +tree / Faster Cast Rate on item cards, and Static Field reaching
// monsters 5–6 tiles down a corridor (ring drawn at its real size). Asserts no page errors.
// usage: node scripts/v161-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v161";
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
  const shot = (n) => page.screenshot({ path: `${out}/${n}${sfx}.png` });
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  const ev = (f, a) => page.evaluate(f, a);

  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await ev(() => {
    const s = __ec.game.toSave();
    const mk = __ec.items.makeItem;
    s.player.cls = "sorceress"; s.player.name = "Tal Rasha"; s.player.level = 40;
    s.player.base = { str: 60, dex: 25, vit: 90, ene: 130 };
    s.player.skills = { fire_bolt: 8, fire_ball: 12, warmth: 5, fire_mastery: 5, static_field: 1, charged_bolt: 1, frozen_orb: 8, ice_bolt: 1 };
    s.player.slots = ["static_field", "frozen_orb", "fire_bolt"];
    s.player.mainAtk = "fire_ball";
    const st = mk("battle_staff", 40); st.uid = 9701; st.q = "rare"; st.name = "Storm Song";
    st.mods = [{ s: "clsk", v: 1, sk: "sorceress" }, { s: "tabsk", v: 2, sk: "fire" }, { s: "fcr", v: 20 }, { s: "mana", v: 15 }];
    st.aff = ["clsk", "tabsk", "fcr", "mana"];
    const orb = mk("orb", 40); orb.uid = 9702; orb.q = "magic"; orb.name = "Master's Orb of the Magus";
    orb.mods = [{ s: "tabsk", v: 2, sk: "cold" }, { s: "fcr", v: 20 }]; orb.aff = ["tabsk", "fcr"];
    s.player.equip = { main: st, chest: mk("armor", 40) };
    s.player.bag = [{ item: orb, x: 0, y: 0 }];
    s.player.gold = 50000; s.maxFloor = 60;
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  });
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1400);

  // 1) skill tooltip: spell base and real damage
  await page.click('[data-tab="skills"]');
  await page.waitForTimeout(300);
  await page.click('.stab[data-tree="fire"]');
  await page.waitForTimeout(150);
  await page.click('.snode[data-id="fire_ball"]');
  await page.waitForTimeout(200);
  const tip = await ev(() => {
    const g = __ec.game;
    return { base: document.querySelector(".sbase")?.textContent ?? "", dmg: [...document.querySelectorAll(".seff .sdmg")].map((e) => e.textContent), lvl: g.skillLevel("fire_ball") };
  });
  C("Fire Ball tooltip: spell base damage 74 at level 40, Fire Mastery (5 points +1 class +2 tree = 8: +79%), real damage for Now and Next", /Spell base damage 74 at character level 40/.test(tip.base) && /Fire Mastery \+79%/.test(tip.base) && tip.dmg.length === 2 && tip.dmg.every((t) => /^= \d+–\d+ fire$/.test(t)) && tip.lvl === 15, JSON.stringify(tip));
  await shot("01-tooltip-fire-ball");
  await page.click('.stab[data-tree="cold"]');
  await page.waitForTimeout(150);
  await page.click('.snode[data-id="frozen_orb"]');
  await page.waitForTimeout(200);
  const fo = await ev(() => [...document.querySelectorAll(".seff .sdmg")].map((e) => e.textContent));
  C("Frozen Orb tooltip: damage per shard", fo.length === 2 && /cold per shard/.test(fo[0]), fo.join(" | "));
  await shot("02-tooltip-frozen-orb");
  await page.click('.stab[data-tree="lightning"]');
  await page.waitForTimeout(150);
  await page.click('.snode[data-id="static_field"]');
  await page.waitForTimeout(200);
  const sf = await ev(() => document.querySelector(".seff")?.textContent ?? "");
  C("Static Field tooltip: 6.8 tile radius at level 2 (1 point +1 Sorceress skills)", /6\.8 tile radius/.test(sf), sf);
  await shot("03-tooltip-static-field");
  await ev(() => __ec.ui.close());

  // 2) Character screen
  await page.click('[data-tab="char"]');
  await page.waitForTimeout(400);
  const ch = await ev(() => ({ base: document.querySelector(".spellbase")?.textContent.replace(/\s+/g, " ").trim(), cast: document.querySelector(".casttime")?.textContent.replace(/\s+/g, " ").trim(), dps: document.querySelector(".spelldps")?.textContent.replace(/\s+/g, " ").trim() }));
  C("Character screen: spell base damage 74 and cast time 0.42 s (+20% faster cast rate)", /Spell base damage.*level 40 ?74$/.test(ch.base ?? "") && /\+20% faster cast rate ?0\.42 s/.test(ch.cast ?? ""), JSON.stringify(ch));
  await shot("04-character-spell-base");
  await ev(() => __ec.ui.close());

  // 3) item cards: +class / +tree skills and Faster Cast Rate
  await page.locator('.mbtn[data-tab="inv"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-src="bag"][data-uid="9702"]').first().click();
  await page.waitForTimeout(400);
  const card = await ev(() => document.querySelector(".cmpsheet")?.textContent.replace(/\s+/g, " ") ?? "");
  C("orb card: +2 to Cold Spells (Sorceress Only), +20% Faster Cast Rate", /\+2 to Cold Spells \(Sorceress Only\)/.test(card) && /\+20% Faster Cast Rate/.test(card), card.slice(0, 300));
  await shot("05-item-card-orb");
  await page.locator('[data-act="cmp-close"]').click().catch(() => {});
  await page.waitForTimeout(250);
  await page.locator('[data-src="eq"][data-eq="main"]').first().click();
  await page.waitForTimeout(400);
  const card2 = await ev(() => (document.querySelector(".cmpsheet, .idetail")?.textContent ?? "").replace(/\s+/g, " "));
  C("worn staff card: +1 to Sorceress Skill Levels, +2 to Fire Spells, +20% Faster Cast Rate", /\+1 to Sorceress Skill Levels/.test(card2) && /\+2 to Fire Spells \(Sorceress Only\)/.test(card2) && /\+20% Faster Cast Rate/.test(card2), card2.slice(0, 300));
  await shot("06-item-card-staff");
  await page.locator('[data-act="cmp-close"]').click().catch(() => {});
  await ev(() => __ec.ui.close?.());
  await page.waitForTimeout(250);

  // 4) Brann adds one of the new affixes (same pool as drops)
  const brann = await ev(() => {
    let tries = 0, got = null;
    while (!got && tries < 400) {
      tries++;
      const it = __ec.items.makeItem("wand", 40);
      for (let k = 0; k < 4; k++) __ec.items.craftAffix?.(it, Math.random, "sorceress");
      if ((it.mods ?? []).some((m) => m.s === "clsk" || m.s === "tabsk")) got = it;
    }
    return { tries, mods: got?.mods ?? null, api: typeof __ec.items.craftAffix };
  });
  if (brann.api === "function") C("Brann's crafting can add +class / +tree skills", !!brann.mods, JSON.stringify(brann));

  // 5) Static Field down a corridor
  await ev(() => __ec.game.goDungeon(5));
  await page.waitForTimeout(900);
  const spot = await ev(() => {
    const g = __ec.game, L = g.level, p = g.player;
    const fl = (x, y) => x >= 0 && y >= 0 && x < L.w && y < L.h && !g.blocked(x + 0.5, y + 0.5, 0.3);
    // a corridor running up-left on screen (−x): 8 floor tiles in a row with a wall 1–2 tiles to each side
    for (let y = 3; y < L.h - 3; y++) for (let x = 10; x < L.w - 2; x++) {
      let ok = true;
      for (let k = 0; k <= 7 && ok; k++) ok = fl(x - k, y) && (!fl(x - k, y - 2) && !fl(x - k, y + 2));
      if (!ok) continue;
      p.x = x + 0.5; p.y = y + 0.5; p.fx = -1; p.fy = 0;
      window.__sf = { x: p.x, y: p.y };
      return { x, y };
    }
    return null;
  });
  C("found a corridor", !!spot, JSON.stringify(spot));
  for (let k = 0; k < 6; k++) { await page.waitForTimeout(500); await ev(() => { const p = __ec.game.player; p.hp = __ec.game.derived().maxHp; p.x = window.__sf.x; p.y = window.__sf.y; for (const m of __ec.game.monsters) if (Math.hypot(m.x - p.x, m.y - p.y) < 12) { m.x = -50; m.y = -50; } }); }
  const sfr = await ev((idle) => {
    const g = __ec.game, p = g.player;
    p.x = window.__sf.x; p.y = window.__sf.y;
    const live = g.monsters.filter((m) => m.state !== "dead" && m.def.rank === "normal").slice(0, 3);
    const ds = [4, 5.2, 6.3];
    live.forEach((m, i) => { m.x = p.x - ds[i]; m.y = p.y + (i - 1) * 0.6; m.hp = m.maxHp = 500; m.def = { ...m.def, speed: 0, dmgMin: 0, dmgMax: 0 }; m.state = "chase"; });
    p.mana = 999; p.action = null; p.fx = -1; p.fy = 0;
    const ok = g.castSkill("static_field", g.derived());
    for (let k = 0; k < 24; k++) { g.update(1 / 60, idle); live.forEach((m, i) => { m.x = p.x - ds[i]; m.y = p.y + (i - 1) * 0.6; }); }
    g.update = () => {}; // hold still for the screenshot
    return { ok, hp: live.map((m) => m.hp), d: ds.slice(0, live.length) };
  }, idle);
  await page.waitForTimeout(120);
  C("Static Field (level 2) hits monsters 4, 5.2 and 6.3 tiles down the corridor", sfr.ok && sfr.hp.length === 3 && sfr.hp.every((h) => h < 500), JSON.stringify(sfr));
  await shot("07-static-field-corridor");
  await ev(() => { delete __ec.game.update; });
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const failed = checks.filter((c) => !c).length;
console.log(failed ? `${failed} FAILED` : `all ${checks.length} passed`);
process.exit(failed ? 1 : 0);
