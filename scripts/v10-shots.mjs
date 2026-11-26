// v1.0: hero select (existing Barbarian kept as hero #1), create an Amazon, her skill tree, bow shooting,
// javelin stab and throw, Multiple Shot and Strafe, the overhead javelin grip, armor look vs the Barbarian.
// usage: node scripts/v10-shots.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v10";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const hideToasts = () => page.addStyleTag({ content: "#toast{display:none!important} #btn-ctx{display:none!important}" });

// 1) an existing finished Barbarian (as v0.9.4 left it), then the v1.0 hero select
await page.goto(`${base}?debug&new&seed=4`);
await page.waitForTimeout(800);
const before = await page.evaluate(() => {
  const g = __ec.game, p = g.player, mk = __ec.items.makeItem;
  p.level = 61; p.gold = 123456; p.kills = 9000;
  p.skills = { bash: 1, double_swing: 1, frenzy: 20, whirlwind: 20, battle_orders: 10, shout: 1, howl: 1, leap: 1, taunt: 1, battle_cry: 1, war_cry: 1, battle_command: 1, find_potion: 1, find_item: 1, double_throw: 1, stun: 1, concentrate: 1, berserk: 1 };
  p.slots = ["whirlwind", "frenzy", "battle_orders"];
  p.equip = { main: mk("great_sword", 60), chest: mk("armor", 60), head: mk("helm", 60), gloves: mk("gloves", 50), boots: mk("boots", 50) };
  p.stash = [{ item: mk("long_bow", 40), x: 0, y: 0 }];
  g.stashAt = Date.now() - 1000;
  g.maxFloor = 80;
  const s = { ...g.toSave(), v: 6 };
  delete s.stashAt; delete s.player.cls; delete s.player.name; delete s.player.mainAtk;
  localStorage.clear();
  localStorage.setItem("ember-crypt-save-v1", JSON.stringify(s));
  localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  return localStorage.getItem("ember-crypt-save-v1");
});
await page.goto(`${base}?debug&select`);
await page.waitForTimeout(1000);
const sel = await page.evaluate(() => ({ open: !document.getElementById("heroes").hidden, cards: [...document.querySelectorAll("#heroes .hcard:not(.new) .hinfo")].map((e) => e.textContent.replace(/\s+/g, " ").trim()) }));
check("boot shows the hero select with the existing Barbarian as hero #1", sel.open && sel.cards.length === 1 && /Level 61 Barbarian/.test(sel.cards[0]), JSON.stringify(sel));
await shot("01-hero-select");
await page.click("#heroes .hcard.new");
await page.waitForTimeout(200);
await page.click('#heroes .hcls[data-cls="amazon"]');
await page.fill("#hero-name", "Ilsa");
await page.waitForTimeout(150);
await shot("02-new-hero-amazon");
await page.click('#heroes [data-hact="create"]');
await page.waitForTimeout(900);
const made = await page.evaluate((before) => {
  const g = __ec.game, p = g.player;
  return {
    cls: p.cls, name: p.name, main: p.equip.main?.baseId, bag: p.bag.map((e) => e.item.baseId),
    slot2: !!localStorage.getItem("ember-crypt-save-v1#2"),
    slot1Same: (() => { const a = JSON.parse(before).player, b = JSON.parse(localStorage.getItem("ember-crypt-save-v1")).player; return b.cls === "barbarian" && a.level === b.level && a.gold === b.gold && a.xp === b.xp && JSON.stringify(a.skills) === JSON.stringify(b.skills) && JSON.stringify(a.equip) === JSON.stringify(b.equip) && JSON.stringify(a.slots) === JSON.stringify(b.slots); })(),
    stash: p.stash.map((e) => e.item.baseId), last: localStorage.getItem("ember-crypt-last-slot"),
  };
}, before);
check("creating an Amazon uses slot 2; the Barbarian (slot 1) keeps level, gold, xp, skills, gear and buttons", made.cls === "amazon" && made.name === "Ilsa" && made.slot2 && made.slot1Same && made.last === "2", JSON.stringify(made));
check("the new hero sees the shared stash (the Barbarian's long bow)", made.stash.includes("long_bow"), made.stash.join());

// Change hero from Settings lists both
await page.click('[data-tab="settings"]');
await page.waitForTimeout(250);
await page.click('[data-act="heroes"]');
await page.waitForTimeout(300);
const both = await page.evaluate(() => [...document.querySelectorAll("#heroes .hcard:not(.new) .hinfo b")].map((e) => e.textContent));
check("Settings → Change hero lists both heroes, last played first", both.join() === "Ilsa,Barbarian", both.join());
await shot("03-hero-select-two");
// switch to the Barbarian and back: both keep their progress
await page.click('#heroes .hcard[data-slot="1"]');
await page.waitForTimeout(600);
const b1 = await page.evaluate(() => ({ cls: __ec.game.player.cls, lvl: __ec.game.player.level, ww: __ec.game.skillLevel("whirlwind"), stash: __ec.game.player.stash.length }));
check("switching to hero #1 loads the level 61 Barbarian with his skills", b1.cls === "barbarian" && b1.lvl === 61 && b1.ww === 20, JSON.stringify(b1));
await page.evaluate(() => __ec.ui.close?.());
await page.click('[data-tab="settings"]');
await page.waitForTimeout(250);
await page.click('[data-act="heroes"]');
await page.waitForTimeout(500);
await page.click('#heroes .hcard[data-slot="2"]');
await page.waitForTimeout(600);
check("and back to the Amazon", await page.evaluate(() => __ec.game.player.name === "Ilsa"));
await hideToasts();

// 2) Amazon skill tree
await page.evaluate(() => {
  const g = __ec.game, p = g.player;
  p.level = 30; p.skillPoints = 4;
  p.skills = { magic_arrow: 3, fire_arrow: 2, cold_arrow: 2, multiple_shot: 8, ice_arrow: 1, guided_arrow: 4, exploding_arrow: 1, strafe: 6, inner_sight: 1, critical_strike: 5, dodge: 2, jab: 1 };
  p.slots = ["multiple_shot", "strafe", "basic_throw"];
  g.events.changed();
});
await page.click('[data-tab="skills"]');
await page.waitForTimeout(300);
const tabs = await page.evaluate(() => [...document.querySelectorAll(".stab")].map((e) => e.textContent));
check("Amazon skill tabs: Bow and Crossbow, Passive and Magic, Javelin and Spear, Basic", tabs.length === 4 && /Bow/.test(tabs[0]) && /Passive/.test(tabs[1]) && /Javelin/.test(tabs[2]), tabs.join(" | "));
await page.click('.snode[data-id="strafe"]');
await page.waitForTimeout(150);
await shot("04-amazon-skills-bow");
await page.click('.stab[data-tree="passive"]');
await page.waitForTimeout(150);
await shot("05-amazon-skills-passive");
await page.click('.stab[data-tree="javelin"]');
await page.waitForTimeout(150);
await shot("06-amazon-skills-javelin");
await page.click('.stab[data-tree="basic"]');
await page.waitForTimeout(150);
await page.click('.snode[data-id="basic_attack"]');
await page.waitForTimeout(150);
await shot("07-basic-attacks");
await page.evaluate(() => __ec.ui.close());

// action helpers
async function arena(main, off, opts = {}) {
  await page.evaluate(({ main, off, opts }) => {
    const g = __ec.game, p = g.player, mk = __ec.items.makeItem;
    __ec.input.attack = false;
    if (g.__upd) g.update = g.__upd;
    g.goTown(true); g.floorCache.clear(); // v1.0.1: a fresh level each time (levels are kept 5 min)
    g.goDungeon(opts.floor ?? 6);
    // v1.1: gear only works when its requirements are met
    p.level = Math.max(p.level, 20); p.base.str = Math.max(p.base.str, 150); p.base.dex = Math.max(p.base.dex, 150);
    p.equip.main = mk(main, 20);
    p.equip.off = off ? mk(off, 20) : undefined;
    if (opts.chest !== undefined) p.equip.chest = opts.chest ? mk(opts.chest, 20) : undefined;
    p.hp = g.derived().maxHp; p.mana = 300; p.action = null; g.projectiles = [];
    p.mainAtk = opts.mainAtk ?? null;
    // a few monsters in clear line of sight around the hero, harmless and rooted
    const blocked = g.blocked.bind(g);
    const keep = [];
    const ms = g.monsters.filter((m) => m.def.rank === "normal").slice(0, opts.n ?? 1);
    let k = 0;
    // prefer screen-right (world -45°) so the hero is seen side-on
    const angs = [];
    for (let i = 0; i < 18; i++) angs.push(-Math.PI / 4 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.35);
    for (const a of angs) {
      if (k >= ms.length) break;
      const dx = Math.cos(a), dy = Math.sin(a), d = opts.dist ?? 4.5;
      let clear = true;
      for (let t = 0.3; t <= d + 0.5; t += 0.2) if (blocked(p.x + dx * t, p.y + dy * t, 0.5)) clear = false;
      if (!clear) continue;
      const m = ms[k++];
      Object.assign(m, { x: p.x + dx * d, y: p.y + dy * d, hp: 1e6, maxHp: 1e6, state: "chase", atkT: 99, dmgMin: 0, dmgMax: 0 });
      m.def = { ...m.def, speed: 0 };
      keep.push(m);
    }
    g.monsters = keep;
    g.particles = [];
    p.fx = keep[0] ? (keep[0].x - p.x) / Math.hypot(keep[0].x - p.x, keep[0].y - p.y) : 1;
    p.fy = keep[0] ? (keep[0].y - p.y) / Math.hypot(keep[0].x - p.x, keep[0].y - p.y) : 0;
    g.events.changed();
  }, { main, off, opts });
  await page.waitForTimeout(500);
}
const freeze = () => page.evaluate(() => { const g = __ec.game; g.__upd = g.update; g.update = () => {}; __ec.input.attack = false; });
const thaw = () => page.evaluate(() => { const g = __ec.game; if (g.__upd) { g.update = g.__upd; delete g.__upd; } });

// 3) shooting with the short bow
await arena("short_bow", "arrows", { dist: 5 });
const q0 = await page.evaluate(() => __ec.game.player.equip.off.qty);
await page.evaluate(() => (__ec.input.attack = true));
await page.waitForFunction(() => { const g = __ec.game, a = g.player.action; return g.projectiles.some((q) => q.kind === "arrow" && q.dist > 1.2) && a?.type === "shoot" && a.t / a.dur > 0.15; }, null, { timeout: 8000 });
await freeze();
const sh = await page.evaluate(() => ({ arrows: __ec.game.projectiles.filter((q) => q.kind === "arrow").length, qty: __ec.game.player.equip.off.qty, hp: __ec.game.monsters[0].hp }));
check("Amazon shoots: arrows in flight, quiver count goes down, the target is hit", sh.arrows >= 1 && sh.qty < q0, JSON.stringify({ ...sh, q0 }));
await shot("08-amazon-shooting");
await thaw();

// 4) javelin stab (main button set to Attack / Stab)
await arena("javelin", "shield", { dist: 1.7, mainAtk: "basic_attack" });
const jq = await page.evaluate(() => __ec.game.player.equip.main.qty);
await page.evaluate(() => (__ec.input.attack = true));
await page.waitForFunction(() => { const a = __ec.game.player.action; return a?.type === "swing" && a.t / a.dur > 0.42 && a.t / a.dur < 0.55; }, null, { timeout: 8000 });
await freeze();
const st = await page.evaluate(() => ({ qty: __ec.game.player.equip.main.qty, proj: __ec.game.projectiles.length }));
check("javelin set to Stab: melee thrust, no javelin thrown", st.qty === jq && st.proj === 0, JSON.stringify(st));
await shot("09-javelin-stab");
await thaw();

// 5) javelin throw
await arena("javelin", "shield", { dist: 5, mainAtk: "basic_throw" });
await page.evaluate(() => (__ec.input.attack = true));
await page.waitForFunction(() => __ec.game.projectiles.some((q) => q.cls === "javelin" && q.dist > 1.2), null, { timeout: 8000 });
await freeze();
check("javelin set to Throw: a javelin flies", await page.evaluate(() => __ec.game.player.equip.main.qty < 200 || __ec.game.projectiles.length > 0));
await shot("10-javelin-throw");
await thaw();

// 6) Multiple Shot and Strafe
await arena("long_bow", "arrows", { dist: 5, n: 6 });
await page.evaluate(() => __ec.game.update(1 / 30, { mx: 0, my: 0, mag: 0, attack: false, skills: [true, false, false] }));
await page.waitForFunction(() => __ec.game.projectiles.filter((q) => q.kind === "arrow" && q.dist > 2).length >= 5, null, { timeout: 8000 });
await freeze();
const ms = await page.evaluate(() => __ec.game.projectiles.filter((q) => q.kind === "arrow").length);
check("Multiple Shot fans out several arrows", ms >= 5, String(ms));
await shot("11-multiple-shot");
await thaw();
await arena("long_bow", "arrows", { dist: 4.5, n: 6 });
const sdbg = await page.evaluate(() => { const g = __ec.game; g.update(1 / 30, { mx: 0, my: 0, mag: 0, attack: false, skills: [false, true, false] }); return { act: g.player.action?.type, n: g.monsters.length, slots: g.player.slots, mana: g.player.mana }; });
console.log("strafe press", JSON.stringify(sdbg));
await page.evaluate(() => { window.__dirs = new Set(); const g = __ec.game; const t = setInterval(() => { for (const q of g.projectiles) if (q.kind === "arrow") window.__dirs.add(Math.round(Math.atan2(q.vy, q.vx) * 4)); }, 10); setTimeout(() => clearInterval(t), 4000); });
await page.waitForFunction(() => { const a = __ec.game.player.action; return a?.type === "shoot" && a.done >= 3 && __ec.game.projectiles.some((q) => q.kind === "arrow"); }, null, { timeout: 8000, polling: 10 });
await freeze();
const sd = await page.evaluate(() => ({ done: __ec.game.player.action?.done, n: __ec.game.player.action?.releaseAt.length, dirs: window.__dirs.size }));
check("Strafe: one arrow per target in quick succession, at different targets", sd.done >= 3 && sd.n >= 4 && sd.dirs >= 2, JSON.stringify(sd));
await shot("12-strafe");
await thaw();

// 7) overhead javelin grip, Amazon and Barbarian, in camp
await page.evaluate(() => { const g = __ec.game, p = g.player, mk = __ec.items.makeItem; if (g.__upd) g.update = g.__upd; g.goTown(); p.equip.main = mk("javelin", 5); p.equip.off = mk("shield", 5); p.mainAtk = null; p.fx = Math.SQRT1_2; p.fy = -Math.SQRT1_2; g.events.changed(); });
await page.waitForTimeout(600);
await shot("13-amazon-javelin-grip");
await page.click('[data-tab="settings"]');
await page.waitForTimeout(250);
await page.click('[data-act="heroes"]');
await page.waitForTimeout(300);
await page.click('#heroes .hcard[data-slot="1"]');
await page.waitForTimeout(700);
await page.evaluate(() => { const g = __ec.game, p = g.player, mk = __ec.items.makeItem; g.goTown(); p.equip.main = mk("javelin", 5); p.equip.off = mk("shield", 5); p.fx = Math.SQRT1_2; p.fy = -Math.SQRT1_2; g.events.changed(); });
await page.waitForTimeout(600);
await shot("14-barbarian-javelin-grip");
// the Barbarian's own armor look (heavy) for the comparison
await page.evaluate(() => { const g = __ec.game, p = g.player, mk = __ec.items.makeItem; p.equip.main = mk("sword", 30); p.equip.chest = mk("armor", 30); p.equip.head = mk("helm", 30); g.events.changed(); });
await page.waitForTimeout(400);
await shot("15-barbarian-armor");
check("no page errors", errs.length === 0, errs.join(" | "));
console.log(`${checks.filter(Boolean).length}/${checks.length} passed`);
await br.close();
process.exit(checks.every(Boolean) ? 0 : 1);
