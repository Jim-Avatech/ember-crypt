// v1.7 at 852x393 in Chromium and WebKit: base spell damage = level + Energy + caster items. Character screen row
// with the breakdown, the spell tooltip line, "+N Base Spell Damage" on a battle staff card, the compare sheet row
// (staff vs sword), spells hitting harder with the staff than with a sword in the real game, and a Barbarian's row.
// usage: node scripts/v17-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v17";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };

async function seed(page, cls, mk) {
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate(([cls, mk]) => {
    const s = __ec.game.toSave();
    s.player.cls = cls; s.player.name = cls === "sorceress" ? "Tal Rasha" : "Bul-Kathos"; s.player.level = 30;
    eval(mk)(s, __ec.items.makeItem);
    s.maxFloor = 40;
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
    const keep = JSON.parse(JSON.stringify(s));
    __ec.game.toSave = () => JSON.parse(JSON.stringify(keep));
  }, [cls, mk]);
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
  await seed(page, "sorceress", `(s, mk) => {
    s.player.base = { str: 75, dex: 60, vit: 60, ene: 93 };
    s.player.skills = { fire_bolt: 10, fire_ball: 20, warmth: 1 };
    s.player.slots = ["fire_ball", null, null]; s.player.mainAtk = "fire_ball";
    s.player.equip = { main: { ...mk("battle_staff", 30), uid: 9701 } };
    s.player.bag = [{ item: { ...mk("sword", 30), uid: 9702 }, x: 0, y: 0 }];
  }`);
  const parts = await ev(() => __ec.game.spellBaseParts());
  const r = (x) => Math.round(x);
  // 1) Character screen
  await page.click('[data-tab="char"]');
  await page.waitForTimeout(400);
  const row = await ev(() => document.querySelector(".kv.spellbase")?.textContent.replace(/\s+/g, " ").trim() ?? "");
  C("Character screen: 'Base spell damage level L + Energy E + items I' = total", row.includes(`level ${r(parts.level)} + Energy ${r(parts.energy)} + items ${r(parts.items)}`) && row.endsWith(String(r(parts.total))) && parts.items > 0, row);
  await page.locator(".kv.spellbase").first().scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${out}/01-character-base-spell-damage${sfx}.png` });
  await ev(() => __ec.ui.close?.());
  // 2) Skill tooltip
  await page.click('[data-tab="skills"]');
  await page.waitForTimeout(300);
  await page.click('.stab[data-tree="fire"]');
  await page.waitForTimeout(150);
  await page.click('.snode[data-id="fire_ball"]');
  await page.waitForTimeout(250);
  const tip = await ev(() => ({ sbase: document.querySelector(".sbase")?.textContent ?? "", dmg: document.querySelector(".seff .sdmg")?.textContent ?? "" }));
  C("Fire Ball tooltip: 'Base spell damage T = level + Energy + items' and real damage", tip.sbase.includes(`Base spell damage ${r(parts.total)} = level ${r(parts.level)} + Energy ${r(parts.energy)} + items ${r(parts.items)}`) && /= \d+–\d+ fire/.test(tip.dmg), JSON.stringify(tip));
  await page.screenshot({ path: `${out}/02-fire-ball-tooltip${sfx}.png` });
  await ev(() => __ec.ui.close?.());
  // 3) the staff's card, and the compare sheet for the sword
  await page.locator('.mbtn[data-tab="inv"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-src="eq"][data-eq="main"]').first().click();
  await page.waitForTimeout(400);
  const staff = await ev(() => [...document.querySelectorAll(".spelldmg")].map((e) => e.textContent).join(" | "));
  C("battle staff card: '+N Base Spell Damage'", new RegExp(`\\+${r(parts.items)} Base Spell Damage`).test(staff), staff);
  await page.screenshot({ path: `${out}/03-staff-card${sfx}.png` });
  await page.locator('[data-act="cmp-close"]').click().catch(() => {});
  await ev(() => __ec.ui.close?.());
  await page.waitForTimeout(200);
  await page.locator('.mbtn[data-tab="inv"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-src="bag"][data-uid="9702"]').first().click();
  await page.waitForTimeout(400);
  const cmp = await ev(() => ({ sel: document.querySelector(".ccard.selc .spelldmg")?.textContent ?? "", eq: document.querySelector(".ccard.eqc .spelldmg")?.textContent ?? "" }));
  C("side by side: the sword has no base spell damage, the worn staff '+N Base Spell Damage'", cmp.sel === "" && cmp.eq === `+${r(parts.items)} Base Spell Damage`, JSON.stringify(cmp));
  await page.screenshot({ path: `${out}/04-compare-sword-vs-staff${sfx}.png` });
  await page.locator('[data-act="cmp-close"]').click().catch(() => {});
  await ev(() => __ec.ui.close?.());
  // 4) in the game: the same Fire Ball, staff vs sword
  await ev(() => __ec.game.goDungeon(12));
  await page.waitForTimeout(900);
  const hits = await ev(() => {
    const g = __ec.game, p = g.player;
    const staff = g.spellBaseParts().total;
    const it = p.equip.main;
    p.equip.main = p.bag[0].item;
    const sword = g.spellBaseParts().total;
    p.equip.main = it;
    return { staff, sword };
  });
  C("base spell damage with the sword is lower (no caster item)", hits.sword < hits.staff && Math.abs(hits.staff - hits.sword - parts.items) < 1, JSON.stringify(hits));
  C("no page errors (Sorceress)", errs.length === 0, errs.join(" | "));
  // 5) a Barbarian has one too
  await seed(page, "barbarian", `(s, mk) => { s.player.base = { str: 120, dex: 60, vit: 80, ene: 10 }; s.player.equip = { main: mk("axe", 30) }; s.player.bag = []; }`);
  await page.click('[data-tab="char"]');
  await page.waitForTimeout(400);
  const brow = await ev(() => ({ t: document.querySelector(".kv.spellbase")?.textContent.replace(/\s+/g, " ").trim() ?? "", p: __ec.game.spellBaseParts() }));
  C("Barbarian: base spell damage row (items 0 with an axe)", /Base spell damage/.test(brow.t) && brow.t.includes("items 0") && brow.p.items === 0, JSON.stringify(brow));
  await page.locator(".kv.spellbase").first().scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${out}/05-barbarian-base-spell-damage${sfx}.png` });
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const failed = checks.filter((c) => !c).length;
console.log(failed ? `${failed} FAILED` : `all ${checks.length} passed`);
process.exit(failed ? 1 : 0);
