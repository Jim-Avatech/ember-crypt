// v1.7.1 at 852x393 in Chromium and WebKit: one leech rule for every hero. A Barbarian's War Cry (a skill effect)
// heals a hurt Barbarian through skill-effect leech, capped; the Character screen's spell rows follow the hero's
// spells, not the class; the leech notes say "Spells and skill effects".
// usage: node scripts/v171-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v171";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const idle = { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] };

async function load(page, base, cls) {
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate((cls) => {
    const s = __ec.game.toSave();
    const ring = (uid) => ({ ...__ec.items.makeItem("ring", 20), uid, q: "magic", name: "Ring of the Leech", mods: [{ s: "ll", v: 6 }, { s: "ml", v: 6 }] });
    const amu = { ...__ec.items.makeItem("amulet", 20), uid: 9903, q: "magic", name: "Amulet of Speed", mods: [{ s: "fcr", v: 20 }] };
    s.player.cls = cls; s.player.level = 30; s.maxFloor = 40;
    if (cls === "barbarian") {
      s.player.name = "Bul-Kathos";
      s.player.base = { str: 120, dex: 60, vit: 80, ene: 30 };
      s.player.skills = { howl: 1, shout: 1, taunt: 1, battle_cry: 1, battle_orders: 1, war_cry: 20 };
      s.player.slots = ["war_cry", null, null];
      s.player.mainAtk = null;
      s.player.equip = { main: __ec.items.makeItem("axe", 20), ring1: ring(9901), amulet: amu };
    } else {
      s.player.name = "Tal Rasha";
      s.player.base = { str: 40, dex: 25, vit: 70, ene: 100 };
      s.player.skills = { fire_bolt: 10, fire_ball: 20, warmth: 1 };
      s.player.slots = ["fire_ball", null, null];
      s.player.mainAtk = "fire_ball";
      s.player.equip = { main: __ec.items.makeItem("battle_staff", 20), ring1: ring(9901), amulet: amu };
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
  const charRows = () => ev(() => ({
    cast: document.querySelector(".casttime")?.textContent.replace(/\s+/g, " ").trim() ?? null,
    sdps: document.querySelector(".spelldps")?.textContent.replace(/\s+/g, " ").trim() ?? null,
    leech: document.querySelector(".leechnote")?.textContent.replace(/\s+/g, " ").trim() ?? "",
  }));

  // 1) Barbarian: War Cry into a pack heals through skill-effect leech (capped); no spell rows despite +20% FCR
  await load(page, base, "barbarian");
  await page.click('[data-tab="char"]');
  await page.waitForTimeout(400);
  const b = await charRows();
  C("Barbarian (+20% FCR amulet, no spells): no Cast time / Spell DPS rows", b.cast === null && b.sdps === null, JSON.stringify(b));
  C("Barbarian: leech note 'Spells and skill effects leech at 35%'", /Spells (?:and|&) skill effects leech at 35%/.test(b.leech), b.leech);
  await page.screenshot({ path: `${out}/01-barb-char${sfx}.png` });
  await page.click(".pclose");
  await page.waitForTimeout(300);
  const wc = await ev(async (idle) => {
    const g = __ec.game, p = g.player;
    g.goDungeon(20);
    const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    p.x = R.cx + 0.5; p.y = R.cy + 0.5;
    const proto = g.monsters.find((m) => m.def.rank === "normal") ?? g.monsters[0];
    g.monsters = Array.from({ length: 6 }, (_, i) => {
      const m = { ...proto, id: 9e6 + i, x: p.x + Math.cos(i) * 1.5, y: p.y + Math.sin(i) * 1.5, state: "chase", kx: 0, ky: 0, stunT: 0, hp: 1e6, maxHp: 1e6, fuse: -1 };
      m.def = { ...proto.def, speed: 0, dmgMin: 0, dmgMax: 0, specials: undefined, shot: undefined };
      return m;
    });
    for (let i = 0; i < 70; i++) g.update(1 / 60, idle);
    const d = g.derived();
    p.hp = Math.round(d.maxHp * 0.3); p.mana = d.maxMana;
    const hp0 = p.hp, sl0 = g.spellLeechGot.hp, al0 = g.atkLeechGot.hp;
    const ok = g.castSkill("war_cry", d);
    for (let i = 0; i < 10; i++) g.update(1 / 60, idle);
    g.update = () => {};
    const dealt = g.monsters.reduce((s, m) => s + (1e6 - m.hp), 0);
    return { ok, dealt, got: g.spellLeechGot.hp - sl0, atk: g.atkLeechGot.hp - al0, cap: d.maxHp * 0.04, hp0, hp: p.hp };
  }, idle);
  C("War Cry hits the pack and heals through skill-effect leech (≤ 4% of max life), none through weapon leech", wc.ok && wc.dealt > 0 && wc.got > 0 && wc.got <= wc.cap + 0.01 && wc.atk === 0, JSON.stringify(wc));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/02-barb-warcry${sfx}.png` });
  await ev(() => { delete __ec.game.update; });

  // 2) Sorceress: Cast time and Spell DPS rows (she has a damaging spell)
  await load(page, base, "sorceress");
  await page.click('[data-tab="char"]');
  await page.waitForTimeout(400);
  const s = await charRows();
  C("Sorceress: Cast time row (+20% faster cast rate) and Spell DPS row", /Cast time.*\+20% faster cast rate/.test(s.cast ?? "") && /Spell DPS.*Fire Ball/.test(s.sdps ?? ""), JSON.stringify(s));
  C("Sorceress: same leech note", /Spells (?:and|&) skill effects leech at 35%/.test(s.leech), s.leech);
  await page.screenshot({ path: `${out}/03-sorc-char${sfx}.png` });

  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const pass = checks.filter(Boolean).length;
console.log(`${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
