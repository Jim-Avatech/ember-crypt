// v1.3 at 852x393 in Chromium and WebKit: the buff bar along the top (both classes), a piercing arrow, the DPS lines
// (weapon tooltips / compare sheet, Character screen) and the camp training dummy with its DPS meter.
// usage: node scripts/v13-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v13";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const seedHero = async (page, cls, name, skills) => {
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate(([cls, name, skills]) => {
    const s = __ec.game.toSave();
    s.player.cls = cls; s.player.name = name; s.player.level = 30;
    s.player.base.dex = 200; s.player.base.str = 150;
    s.player.skills = skills;
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  }, [cls, name, skills]);
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1200);
};
const rects = (page) => page.evaluate(() => ["#btn-attack", "#btn-s0", "#btn-s1", "#btn-s2"].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(","); }).join(" | "));
for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const sfx = ename === "webkit" ? "-webkit" : "";
  const br = await engine.launch();
  const errs = [];
  let ctx = null;
  let page = null;
  // a fresh browser context per hero (leaving a page saves its hero over the slot it came from)
  const fresh = async () => {
    if (ctx) await ctx.close();
    ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: ename === "chromium" });
    page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(e.message));
  };
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  const shot = (name) => page.screenshot({ path: `${out}/${name}${sfx}.png` });
  const tap = async (sel) => { await page.locator(sel).first().tap(); await page.waitForTimeout(250); };

  // ---- 1. Barbarian buff bar: Battle Orders, Shout, Battle Command, Frenzy, Battle Cry
  await fresh();
  await seedHero(page, "barbarian", "Grom", { shout: 4, battle_orders: 3, battle_command: 1, battle_cry: 2, howl: 1, taunt: 1, find_potion: 1, frenzy: 3, double_swing: 1, stun: 1, bash: 1, leap: 1 });
  const before = await rects(page);
  await page.evaluate(() => {
    const g = __ec.game, p = g.player;
    p.equip.main = __ec.items.makeItem("sword", 5);
    g.goTown(true); g.floorCache.clear(); g.goDungeon(3);
    p.mana = 999;
    const d = g.derived();
    for (const m of g.monsters.filter((m) => m.state !== "dead").slice(0, 3)) { m.x = p.x + 2.5; m.y = p.y + 0.5; m.dmgMin = m.dmgMax = 0; }
    for (const s of ["battle_orders", "shout", "battle_command", "battle_cry"]) { p.action = null; g.castSkill(s, d); }
    p.frenzy = { stacks: 3, t: 5, decay: 0 };
    p.slots = ["shout", "battle_orders", "frenzy"];
    g.events.changed();
  });
  await page.waitForTimeout(1200);
  const bb = await page.evaluate(() => [...document.querySelectorAll("#buffs .tbuff")].map((e) => ({ id: e.dataset.id, t: e.querySelector(".ts").textContent, w: e.querySelector(".tbar").style.width, top: Math.round(e.getBoundingClientRect().top) })));
  C("hero is a Barbarian", await page.evaluate(() => __ec.game.player.cls === "barbarian"));
  C("Barbarian: warcries, Frenzy and Battle Cry in the top buff bar, each with seconds and a bar", ["battle_orders", "shout", "battle_command", "frenzy", "battle_cry"].every((id) => bb.some((b) => b.id === id && /^\d+s$/.test(b.t) && parseFloat(b.w) > 0)) && bb.every((b) => b.top < 60), JSON.stringify(bb));
  C("skill buttons and ⚔ did not move or resize", (await rects(page)) === before, before);
  const ring = await page.evaluate(() => document.querySelectorAll(".sbtn .bring, .abtn .bring").length);
  C("no rings on the buttons", ring === 0);
  await shot("01-buff-bar-barbarian");

  // ---- 2. Amazon buff bar: Slow Missiles, Decoy, Inner Sight (+ chilled)
  await fresh();
  await seedHero(page, "amazon", "Ilsa", { magic_arrow: 1, inner_sight: 3, slow_missiles: 2, decoy: 2, valkyrie: 1, strafe: 4, guided_arrow: 1, multiple_shot: 1, cold_arrow: 1, critical_strike: 1, dodge: 1, penetrate: 1, pierce: 20 });
  await page.evaluate(() => {
    const g = __ec.game, p = g.player;
    p.equip.main = __ec.items.makeItem("long_bow", 10); p.equip.off = __ec.items.makeItem("arrows", 1);
    g.goTown(true); g.floorCache.clear(); g.goDungeon(3);
    p.mana = 999;
    const d = g.derived();
    for (const m of g.monsters.filter((m) => m.state !== "dead").slice(0, 3)) { m.x = p.x + 3; m.y = p.y; m.dmgMin = m.dmgMax = 0; }
    for (const s of ["inner_sight", "slow_missiles", "decoy"]) { p.action = null; g.castSkill(s, d); }
    p.chillT = 1.5;
    p.slots = ["strafe", "slow_missiles", "decoy"];
    g.events.changed();
  });
  await page.waitForTimeout(700);
  C("hero is an Amazon", await page.evaluate(() => __ec.game.player.cls === "amazon"));
  const ab = await page.evaluate(() => [...document.querySelectorAll("#buffs .tbuff")].map((e) => e.dataset.id));
  C("Amazon: Slow Missiles, Decoy, Inner Sight in the same bar", ["slow_missiles", "decoy", "inner_sight"].every((id) => ab.includes(id)), JSON.stringify(ab));
  await shot("02-buff-bar-amazon");

  // ---- 3. Pierce: three monsters in a line, Pierce 20, stepped frame by frame until a glowing arrow is between them
  const pr = await page.evaluate(() => {
    const g = __ec.game, p = g.player;
    g.goTown(true); g.floorCache.clear(); g.goDungeon(4);
    const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    p.x = R.x + 1.5; p.y = R.cy + 0.5; p.fx = 1; p.fy = 0;
    const ms = g.monsters.filter((m) => m.def.rank === "normal" && !m.elite).slice(0, 3);
    ms.forEach((m, i) => { m.x = p.x + 2 + i * 1.5; m.y = p.y; m.hp = m.maxHp = 1e6; m.defense = 0; m.def = { ...m.def, speed: 0, dmgMin: 0, dmgMax: 0 }; m.state = "chase"; });
    g.monsters = ms;
    g.allies = [];
    const real = g.update.bind(g);
    window.__step = (dt) => real(dt, { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] });
    g.update = () => {};
    window.__ms = ms;
    return ms.length;
  });
  let got = null;
  for (let k = 0; k < 40 && !got; k++) {
    got = await page.evaluate(() => {
      const g = __ec.game, p = g.player;
      p.action = null; p.equip.off.qty = 100;
      g.startShoot(null, g.derived());
      for (let t = 0; t < 40; t++) {
        __step(1 / 60);
        const q = g.projectiles.find((x) => x.pierced);
        if (q && q.x > __ms[1].x - 0.5) return { pierced: q.pierced, x: q.x, hits: __ms.map((m) => Math.round(m.maxHp - m.hp)) };
      }
      return null;
    });
  }
  await page.waitForTimeout(150);
  C("a piercing arrow flies through into the next monster", !!got && got.pierced >= 1 && got.hits[0] > 0, JSON.stringify(got));
  const tag = await page.evaluate(() => __ec.game.floaters.some((f) => /Pierce/.test(f.text)));
  C("the pierced monster shows 'Pierce'", tag);
  await shot("03-pierce");

  // ---- 4. DPS: compare sheet (Short Bow in the bag vs the worn Long Bow) and the Character screen
  await page.evaluate(() => {
    const g = __ec.game, p = g.player, mk = __ec.items.makeItem;
    window.__step = null;
    delete g.update; // back to the real clock (the pierce step froze it)
    g.goTown(true);
    const lb = mk("long_bow", 10);
    const sb = mk("short_bow", 10);
    sb.q = "magic"; sb.name = "Swift Short Bow"; sb.mods = [{ s: "ias", v: 20 }];
    p.equip.main = lb; p.equip.off = mk("arrows", 1);
    p.bag = [{ item: sb, x: 0, y: 0 }];
    g.events.changed();
    __ec.ui.open("inv");
  });
  await page.waitForTimeout(400);
  await tap('.gi[data-src="bag"]');
  const cmp = await page.evaluate(() => [...document.querySelectorAll(".cmpsheet .dpsl")].map((e) => e.textContent));
  C("compare sheet: DPS on both bows (the new one as if equipped)", cmp.length >= 2 && /DPS: [\d.,]+ · [\d.]+ attacks\/s if equipped/.test(cmp[0]) && /DPS: [\d.,]+ · [\d.]+ attacks\/s$/.test(cmp[1]), JSON.stringify(cmp));
  await shot("04-dps-compare");
  await page.evaluate(() => { __ec.ui.close(); __ec.ui.open("char"); });
  await page.waitForTimeout(400);
  const cd = await page.evaluate(() => document.querySelector(".kv.dpsrow")?.textContent ?? "");
  const dv = await page.evaluate(() => { const v = __ec.game.derived().dps; return v < 100 ? v.toFixed(1) : String(Math.round(v)); });
  C("Character screen: DPS of the ⚔ normal attack", cd.includes(`DPS`) && cd.includes(dv), cd + " / " + dv);
  await shot("05-dps-character");
  await page.evaluate(() => __ec.ui.close());

  // ---- 6. training dummy in camp: shoot it for a few seconds; meter above it
  await page.evaluate(() => {
    const g = __ec.game, p = g.player;
    g.goTown(true);
    const dm = g.monsters.find((m) => m.dummy);
    p.x = dm.x - 4; p.y = dm.y + 0.5; p.fx = 1; p.fy = 0;
    p.equip.off.qty = 300;
    __ec.input.attack = true;
  });
  await page.waitForTimeout(4500);
  const mt = await page.evaluate(() => { const m = __ec.game.dummyMeter(); const d = __ec.game.monsters.find((x) => x.dummy); return { ...m, hp: d.hp, max: d.maxHp, dead: d.state === "dead", xp: __ec.game.player.xp }; });
  C("dummy: hits counted, DPS shown, never dies", mt.hits > 4 && mt.dps > 0 && !mt.dead && mt.hp === mt.max, JSON.stringify(mt));
  await shot("06-training-dummy");
  await page.evaluate(() => { __ec.input.attack = false; });
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const fails = checks.filter((c) => !c).length;
console.log(`${checks.length - fails}/${checks.length} passed`);
process.exit(fails ? 1 : 0);
