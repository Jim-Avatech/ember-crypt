// v1.3.1 at 852x393 in Chromium and WebKit: an Ice Arrow piercing through a frozen monster into the ones behind,
// and (real game loop, real skill-button input) every arrow/throw skill's pierce rate.
// usage: node scripts/v131-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v131";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const SK = { magic_arrow: 1, fire_arrow: 1, cold_arrow: 1, ice_arrow: 5, multiple_shot: 1, guided_arrow: 1, strafe: 1, exploding_arrow: 1, immolation_arrow: 1, freezing_arrow: 1, penetrate: 1, pierce: 5, critical_strike: 1, dodge: 1, inner_sight: 1 };
for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const sfx = ename === "webkit" ? "-webkit" : "";
  const br = await engine.launch();
  const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: ename === "chromium" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate((sk) => {
    const s = __ec.game.toSave();
    s.player.cls = "amazon"; s.player.name = "Zach"; s.player.level = 30; s.player.base.dex = 200; s.player.base.str = 150; s.player.skills = sk;
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  }, SK);
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1200);

  // ---- 1. real loop, real skill-button input: each arrow skill fired from slot 1 at a line of three monsters
  const rates = await page.evaluate(() => {
    const g = __ec.game, p = g.player;
    p.equip.main = __ec.items.makeItem("long_bow", 10); p.equip.off = __ec.items.makeItem("arrows", 1);
    const res = {};
    for (const sk of ["magic_arrow", "fire_arrow", "cold_arrow", "ice_arrow", "multiple_shot", "strafe", "guided_arrow", "exploding_arrow", "immolation_arrow", "freezing_arrow"]) {
      g.goTown(true); g.floorCache.clear(); g.goDungeon(4);
      const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
      const proto = g.monsters.filter((m) => m.def.rank === "normal" && !m.elite).slice(0, 3);
      g.allies = [];
      p.slots = [sk, "inner_sight", "dodge"];
      const real = g.update.bind(g);
      g.update = () => {};
      let shots = 0, behind = 0;
      for (let n = 0; n < 60; n++) {
        p.x = R.x + 1.5; p.y = R.cy + 0.5; p.fx = 1; p.fy = 0; p.action = null; p.mana = 999; p.equip.off.qty = 100;
        const ms = proto.map((m, i) => ({ ...m, id: 1e6 + n * 10 + i, x: p.x + 2 + i * 1.3, y: p.y, hp: 1e6, maxHp: 1e6, defense: 0, frozenT: 0, chillT: 0, stunT: 0, kx: 0, ky: 0, state: "chase", freezeImmuneUntil: 0, def: { ...m.def, speed: 0, dmgMin: 0, dmgMax: 0 } }));
        g.monsters = ms; g.projectiles = [];
        // one press of the skill button, then let it play out
        real(1 / 60, { mx: 0, my: 0, mag: 0, attack: false, skills: [true, false, false] });
        for (let f = 0; f < 70; f++) { real(1 / 60, { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] }); ms.forEach((m, i) => { m.x = p.x + 2 + i * 1.3; m.y = p.y; }); }
        shots++;
        if (ms[1].hp < ms[1].maxHp || ms[2].hp < ms[2].maxHp) behind++;
      }
      delete g.update;
      res[sk] = Math.round((100 * behind) / shots);
    }
    return res;
  });
  console.log(ename, "share of casts that reached a monster behind the first (%):", JSON.stringify(rates));
  for (const sk of ["magic_arrow", "fire_arrow", "cold_arrow", "ice_arrow"]) C(`${sk} pierces in the real loop (~45%)`, rates[sk] >= 25 && rates[sk] <= 70, `${rates[sk]}%`);
  C("guided_arrow never pierces", rates.guided_arrow === 0, `${rates.guided_arrow}%`);

  // ---- 2. the Ice Arrow pierce shot: three monsters in a line, stepped until the arrow is past the first
  await page.evaluate(() => {
    const g = __ec.game, p = g.player;
    g.goTown(true); g.floorCache.clear(); g.goDungeon(4);
    const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    p.x = R.x + 1.5; p.y = R.cy + 0.5; p.fx = 1; p.fy = 0;
    const ms = g.monsters.filter((m) => m.def.rank === "normal" && !m.elite).slice(0, 3);
    ms.forEach((m, i) => { m.x = p.x + 2.2 + i * 1.6; m.y = p.y; m.hp = m.maxHp = 1e6; m.defense = 0; m.def = { ...m.def, speed: 0, dmgMin: 0, dmgMax: 0 }; m.state = "chase"; });
    g.monsters = ms; g.allies = [];
    p.slots = ["ice_arrow", "inner_sight", "dodge"];
    const real = g.update.bind(g);
    window.__step = (dt) => real(dt, { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] });
    g.update = () => {};
    window.__ms = ms;
    g.events.changed();
  });
  let got = null;
  for (let k = 0; k < 60 && !got; k++) {
    got = await page.evaluate(() => {
      const g = __ec.game, p = g.player;
      p.action = null; p.mana = 999; p.equip.off.qty = 100;
      __ms.forEach((m) => { m.frozenT = 0; m.chillT = 0; m.stunT = 0; m.hp = m.maxHp; m.kx = m.ky = 0; });
      g.floaters = [];
      g.castSkill("ice_arrow", g.derived());
      for (let t = 0; t < 60; t++) {
        __step(1 / 60);
        __ms.forEach((m, i) => { m.x = p.x + 2.2 + i * 1.6; m.y = p.y; });
        const q = g.projectiles.find((x) => x.skill === "ice_arrow" && x.pierced);
        if (q && __ms[1].hp < __ms[1].maxHp && q.x > __ms[1].x + 0.3) return { pierced: q.pierced, x: q.x, hits: __ms.map((m) => Math.round(m.maxHp - m.hp)), frozen: __ms.map((m) => +(m.frozenT ?? 0).toFixed(2)), tags: g.floaters.filter((f) => /Pierce|⇶/.test(f.text)).map((f) => f.text + " " + f.color) };
      }
      return null;
    });
  }
  await page.waitForTimeout(150);
  C("an Ice Arrow flies through the frozen first monster and hits (and freezes) the one behind", !!got && got.hits[0] > 0 && got.hits[1] > 0 && got.frozen[0] > 0 && got.frozen[1] > 0, JSON.stringify(got));
  C("the pierce is tagged in a colour that isn't ice blue", !!got && got.tags.length > 0 && got.tags.every((t) => !/#8ff0ff|#8ad0ff/i.test(t)), JSON.stringify(got?.tags));
  await page.screenshot({ path: `${out}/01-ice-arrow-pierce${sfx}.png` });
  await page.evaluate(() => { window.__step = null; delete __ec.game.update; });
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const ok = checks.filter(Boolean).length;
console.log(`${ok}/${checks.length} passed`);
process.exit(ok === checks.length ? 0 : 1);
