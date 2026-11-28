// v1.7.2 at 852x393 in Chromium and WebKit: uncapped 20% skill-effect leech, drain on elites/bosses/later
// acts, and a free respec confirm.
// usage: node scripts/v172-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v172";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };

async function load(page, cls) {
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate((cls) => {
    const s = __ec.game.toSave();
    const ring = (uid, ll, ml) => ({ ...__ec.items.makeItem("ring", 20), uid, q: "magic", name: "Ring of the Leech", mods: [{ s: "ll", v: ll }, ...(ml ? [{ s: "ml", v: ml }] : [])] });
    s.player.cls = cls; s.player.level = 30; s.maxFloor = 40; s.player.gold = 0;
    if (cls === "barbarian") {
      s.player.name = "Bul-Kathos";
      s.player.base = { str: 120, dex: 60, vit: 82, ene: 30 };
      s.player.skills = { howl: 1, shout: 1, taunt: 1, battle_cry: 1, battle_orders: 1, war_cry: 20 };
      s.player.slots = ["war_cry", null, null];
      s.player.mainAtk = null;
      s.player.equip = { main: __ec.items.makeItem("axe", 20), ring1: ring(9901, 6, 6) };
      s.player.bag = [{ item: ring(9902, 5, 0), x: 0, y: 0 }];
    } else {
      s.player.name = "Tal Rasha";
      s.player.base = { str: 40, dex: 25, vit: 70, ene: 100 };
      s.player.skills = { frost_nova: 1, ice_bolt: 1, ice_blast: 1, blizzard: 20, cold_mastery: 10 };
      s.player.slots = ["blizzard", null, null];
      s.player.mainAtk = "blizzard";
      s.player.equip = { main: __ec.items.makeItem("battle_staff", 20), ring1: ring(9901, 6, 6) };
      s.player.bag = [{ item: ring(9902, 5, 0), x: 0, y: 0 }];
    }
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
    const keep = JSON.parse(JSON.stringify(s));
    __ec.game.toSave = () => JSON.parse(JSON.stringify(keep));
  }, cls);
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

  // 1) Sorceress character screen: 20% / no cap + drain note
  await load(page, "sorceress");
  await page.click('[data-tab="char"]');
  await page.waitForTimeout(400);
  const notes = await ev(() => [...document.querySelectorAll(".leechnote")].map((e) => e.textContent.replace(/\s+/g, " ").trim()).join(" | "));
  C("Character screen: 20% of your leech, no cap, later acts resist", /leech at 20% of your leech/.test(notes) && /no cap/i.test(notes) && /later acts/.test(notes) && /II 75%/.test(notes), notes);
  await page.locator(".drainnote, .leechnote").last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/01-char-leech${sfx}.png` });

  // 2) Item card
  await page.click(".pclose");
  await page.waitForTimeout(200);
  await page.click('[data-tab="inv"], .mbtn[data-tab="inv"]');
  await page.waitForTimeout(400);
  await page.locator('[data-src="bag"][data-uid="9902"]').first().click();
  await page.waitForTimeout(400);
  const card = await ev(() => [...document.querySelectorAll(".leechnote")].map((e) => e.textContent).join(" | ").replace(/\s+/g, " "));
  C("Item card: 20%, no cap, resist all leech", /leech at 20% of this, no cap/.test(card) && /resist all leech/.test(card), card.slice(0, 280));
  await page.screenshot({ path: `${out}/02-item-leech${sfx}.png` });
  await page.locator('[data-act="cmp-close"]').click().catch(() => {});
  await ev(() => { __ec.ui.close?.(); document.querySelector(".pclose")?.click(); });
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);

  // 3) Blizzard into a pack: uncapped heal well above the old 4% cap
  await ev(() => { __ec.ui.close?.(); __ec.game.goDungeon(20); });
  await page.waitForTimeout(800);
  const bliz = await ev((idle) => {
    const g = __ec.game, p = g.player;
    const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    p.x = R.cx + 0.5 - 2.5; p.y = R.cy + 0.5; p.fx = 1; p.fy = 0;
    const proto = g.monsters.find((m) => m.def.rank === "normal") ?? g.monsters[0];
    const spots = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return { x: p.x + 5 + Math.cos(a) * 0.7, y: p.y + Math.sin(a) * 0.7 };
    });
    g.monsters = spots.map((s, i) => {
      const m = { ...proto, id: 9e6 + i, x: s.x, y: s.y, state: "chase", kx: 0, ky: 0, stunT: 0, hp: 1e6, maxHp: 1e6, fuse: -1, elite: 0 };
      m.def = { ...proto.def, rank: "normal", speed: 0, dmgMin: 0, dmgMax: 0, specials: undefined, shot: undefined };
      return m;
    });
    for (let i = 0; i < 5; i++) g.update(1 / 60, idle);
    const d = g.derived();
    const cap = d.maxHp * 0.04;
    p.hp = 1; p.mana = d.maxMana; p.healLeft = 0;
    const s0 = g.spellLeechGot.hp;
    const T = 8;
    for (let t = 0; t < T; t += 1 / 60) {
      p.x = R.cx + 0.5 - 2.5; p.y = R.cy + 0.5; p.fx = 1; p.fy = 0;
      p.hp = 1; p.mana = Math.max(p.mana, d.maxMana / 2); p.healLeft = 0;
      g.monsters.forEach((m, i) => { m.x = spots[i].x; m.y = spots[i].y; m.kx = 0; m.ky = 0; m.state = "chase"; });
      if (!p.action) g.castSkill("blizzard", g.derived());
      g.update(1 / 60, idle);
    }
    const lifePerS = (g.spellLeechGot.hp - s0) / T;
    // screenshot: hurt, mid-storm
    p.hp = d.maxHp * 0.4; p.action = null; p.mana = d.maxMana;
    g.castSkill("blizzard", g.derived());
    for (let k = 0; k < 40; k++) {
      p.x = R.cx + 0.5 - 2.5; p.y = R.cy + 0.5; p.fx = 1; p.fy = 0;
      g.monsters.forEach((m, i) => { m.x = spots[i].x; m.y = spots[i].y; m.kx = 0; });
      g.update(1 / 60, idle);
    }
    g.update = () => {};
    return { ok: true, lifePerS, cap, hp: p.hp, maxHp: d.maxHp };
  }, idle);
  C("Blizzard on 10 heals well above the old 4% cap", bliz.lifePerS > bliz.cap * 2, JSON.stringify(bliz));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/03-blizzard-pack${sfx}.png` });
  await ev(() => { delete __ec.game.update; });

  // 4) Respec confirm is free (Barbarian, no gold)
  await load(page, "barbarian");
  await page.click('[data-tab="char"]');
  await page.waitForTimeout(400);
  await page.locator('.sminus[data-act="unstat"][data-stat="vit"]').click();
  await page.waitForTimeout(300);
  const rsp = await ev(() => document.querySelector(".rsp")?.textContent.replace(/\s+/g, " ").trim() ?? "");
  C("Respec confirm: 'Remove for free' / 'Free for now', no gold price", /Remove for free/.test(rsp) && /Free for now/.test(rsp) && !/Costs/.test(rsp), rsp);
  await page.screenshot({ path: `${out}/04-respec-free${sfx}.png` });
  await page.click('[data-act="respec-yes"]');
  await page.waitForTimeout(300);
  const gold = await ev(() => ({ gold: __ec.game.player.gold, vit: __ec.game.player.base.vit, pts: __ec.game.player.statPoints }));
  C("Respec succeeded with 0 gold, Vitality down one, a stat point back", gold.gold === 0 && gold.vit === 81 && gold.pts === 1, JSON.stringify(gold));

  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const pass = checks.filter(Boolean).length;
console.log(`${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
