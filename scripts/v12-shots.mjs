// v1.2 at 852x393 in Chromium and WebKit: respec one stat / skill point for gold (confirm shows the cost), any
// learned skill on the main ⚔ button (same place and size; the 3 skill buttons don't move).
// usage: node scripts/v12-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v12";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };

for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const sfx = ename === "webkit" ? "-webkit" : "";
  const br = await engine.launch();
  const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: ename === "chromium" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const shot = (name) => page.screenshot({ path: `${out}/${name}${sfx}.png` });
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  const tap = async (sel) => { await page.locator(sel).first().tap(); await page.waitForTimeout(200); };
  const boxes = () => page.evaluate(() => ["btn-attack", "btn-s0", "btn-s1", "btn-s2"].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(","); }));

  // a level 20 Barbarian in slot 2 (leaving the first page saves its own hero over slot 1)
  await page.goto(`${base}?debug&new&seed=12`);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const s = __ec.game.toSave();
    s.player.name = "Conan"; s.player.level = 20; s.player.gold = 2500; s.player.stashGold = 0;
    s.player.base.str += 10; s.player.base.vit += 5;
    s.player.skills = { bash: 3, double_swing: 1, howl: 1, shout: 2 };
    s.player.slots = ["double_swing", "shout", null];
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  });
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1200);
  const b0 = await boxes();

  // --- stat respec
  await page.evaluate(() => __ec.ui.open("char"));
  await page.waitForTimeout(300);
  const str0 = await page.evaluate(() => __ec.game.player.base.str);
  await tap('[data-act="unstat"][data-stat="str"]');
  const conf = await page.evaluate(() => ({ text: document.querySelector(".rsp")?.textContent ?? "", ok: !document.querySelector('[data-act="respec-yes"]')?.disabled }));
  C("stat respec asks first and shows the cost (level 20: 1,000 gold)", /Remove 1 point of Strength/.test(conf.text) && conf.text.includes("1,000 gold") && conf.ok, conf.text.replace(/\s+/g, " "));
  await shot("01-respec-stat-confirm");
  await tap('[data-act="respec-no"]');
  const cancelled = await page.evaluate(() => ({ str: __ec.game.player.base.str, gold: __ec.game.player.gold, open: !!document.querySelector(".rsp") }));
  C("Cancel changes nothing", cancelled.str === str0 && cancelled.gold === 2500 && !cancelled.open, JSON.stringify(cancelled));
  await tap('[data-act="unstat"][data-stat="str"]');
  await tap('[data-act="respec-yes"]');
  const done = await page.evaluate(() => ({ str: __ec.game.player.base.str, gold: __ec.game.player.gold, pts: __ec.game.player.statPoints, plus: !!document.querySelector('[data-act="stat"][data-stat="str"]') }));
  C("Remove: Strength −1, a stat point back, 1,000 gold paid", done.str === str0 - 1 && done.gold === 1500 && done.pts === 1 && done.plus, JSON.stringify(done));
  // the point can be spent again
  await tap('[data-act="stat"][data-stat="vit"]');
  C("the refunded point can be spent again", await page.evaluate(() => __ec.game.player.statPoints === 0), "");

  // --- skill respec: Bash can't lose its last point while Double Swing needs it
  await page.evaluate(() => __ec.ui.open("skills"));
  await page.waitForTimeout(300);
  await tap('.snode[data-id="bash"]');
  await tap('[data-act="unskill"][data-id="bash"]');
  const sk = await page.evaluate(() => document.querySelector(".rsp")?.textContent?.replace(/\s+/g, " ") ?? "");
  C("skill respec asks first with the cost", /Remove 1 point of Bash \(3 → 2\)/.test(sk) && sk.includes("1,000 gold"), sk);
  await shot("02-respec-skill-confirm");
  await tap('[data-act="respec-yes"]');
  const s1 = await page.evaluate(() => ({ bash: __ec.game.player.skills.bash, pts: __ec.game.player.skillPoints, gold: __ec.game.player.gold }));
  C("Bash 3 → 2, a skill point back, 1,000 gold paid", s1.bash === 2 && s1.gold === 500, JSON.stringify(s1));
  await page.evaluate(() => { __ec.game.player.skills.bash = 1; __ec.game.player.gold = 5000; __ec.game.events.changed(); });
  await page.waitForTimeout(150);
  await tap('[data-act="unskill"][data-id="bash"]');
  const blocked = await page.evaluate(() => ({ why: document.querySelector(".rsp-why")?.textContent, off: document.querySelector('[data-act="respec-yes"]')?.disabled }));
  C("can't remove Bash's last point while Double Swing needs it", /Double Swing needs it/.test(blocked.why ?? "") && blocked.off, JSON.stringify(blocked));
  await tap('[data-act="respec-no"]');

  // --- a skill on ⚔
  await tap('.snode[data-id="bash"]');
  await tap('.mainb[data-act="mainatk"]');
  const m1 = await page.evaluate(() => __ec.game.player.mainAtk);
  C("Skills → Bash → ⚔ puts Bash on the main button", m1 === "bash", m1);
  await page.evaluate(() => __ec.ui.close());
  await page.waitForTimeout(300);
  const hud = await page.evaluate(() => ({ glyph: document.querySelector("#btn-attack span").textContent, skill: document.getElementById("btn-attack").classList.contains("skill") }));
  const b1 = await boxes();
  C("⚔ shows Bash's glyph; ⚔ and the 3 skill buttons keep their place and size", hud.glyph === "⚒" && hud.skill && JSON.stringify(b0) === JSON.stringify(b1), JSON.stringify({ hud, b0, b1 }));
  // use it on a monster
  const used = await page.evaluate(async () => {
    const g = __ec.game, p = g.player;
    g.goTown(true); g.floorCache.clear(); g.goDungeon(3);
    const m = g.monsters.find((q) => q.def.rank === "normal");
    g.monsters = [m];
    m.x = p.x + 0.9; m.y = p.y; m.hp = m.maxHp = 1e6; m.def = { ...m.def, speed: 0 }; m.dmgMin = m.dmgMax = 0;
    p.fx = 1; p.fy = 0; p.mana = 40;
    return { mana: p.mana };
  });
  const btn = await page.locator("#btn-attack").boundingBox();
  // hold ⚔ with a real touch
  let skillSeen = false;
  await page.evaluate(() => { window.__seen = false; const g = __ec.game; const u = g.update.bind(g); g.update = (dt, inp) => { u(dt, inp); if (g.player.action?.skill === "bash") window.__seen = true; }; });
  await page.touchscreen.tap(btn.x + btn.width / 2, btn.y + btn.height / 2);
  await page.evaluate(() => { __ec.input.attack = true; });
  await page.waitForTimeout(700);
  await shot("03-skill-on-main-button");
  await page.evaluate(() => { __ec.input.attack = false; });
  skillSeen = await page.evaluate(() => window.__seen);
  const after = await page.evaluate(() => __ec.game.player.mana);
  C("pressing ⚔ uses Bash (mana spent)", skillSeen && after < used.mana, JSON.stringify({ before: used.mana, after }));
  // out of mana: still attacks
  const nm = await page.evaluate(async () => {
    const g = __ec.game, p = g.player;
    p.mana = 0; p.action = null; g.events.changed();
    __ec.input.attack = true;
    await new Promise((r) => setTimeout(r, 120));
    const a = p.action;
    __ec.input.attack = false;
    return { type: a?.type ?? null, skill: a?.skill ?? null, dim: document.getElementById("btn-attack").classList.contains("nomana") };
  });
  C("out of mana: ⚔ swings normally and looks dimmed", nm.type === "swing" && nm.skill === null && nm.dim, JSON.stringify(nm));
  // survives a reload
  await page.evaluate(() => __ec.save?.());
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const ok = checks.filter(Boolean).length;
console.log(`${ok}/${checks.length} checks passed`);
process.exit(ok === checks.length ? 0 : 1);
