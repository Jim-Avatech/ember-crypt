// End-to-end check in a phone-landscape viewport (852x393) with real touch events (CDP).
// usage: node scripts/e2e.mjs [baseUrl] [screenshotDir]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const outDir = process.argv[3] ?? "screenshots";
mkdirSync(outDir, { recursive: true });
mkdirSync("test-results", { recursive: true });
const LIFT = 26; // ui.ts DRAG_LIFT: a dragged item floats this far above the finger
const browser = await chromium.launch();
const ctxOpts = {
  viewport: { width: 852, height: 393 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};
const ctx = await browser.newContext(ctxOpts);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const cdp = await ctx.newCDPSession(page);
const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
const wait = (ms) => page.waitForTimeout(ms);
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`);
};
const ev = (fn, arg) => page.evaluate(fn, arg);
const center = async (sel) => {
  const b = await page.locator(sel).first().boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
async function tapAt(pt, id = 3) {
  await touch("touchStart", [{ ...pt, id }]);
  await wait(50);
  await touch("touchEnd", []);
  await wait(120);
}
const tap = async (sel) => tapAt(await center(sel));
async function drag(from, to, steps = 10) {
  await touch("touchStart", [{ ...from, id: 5 }]);
  for (let i = 1; i <= steps; i++) {
    await touch("touchMove", [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps, id: 5 }]);
    await wait(20);
  }
  await wait(60);
  await touch("touchEnd", []);
  await wait(150);
}
/** finger position that drops an item of size w×h with its top-left on bag cell (cx, cy) */
async function bagCell(cx, cy, w, h) {
  const r = await page.locator('[data-grid="bag"]').boundingBox();
  const C = await ev(() => __ec.ui.C);
  return { x: r.x + (cx + w / 2) * C, y: r.y + (cy + h / 2) * C + LIFT };
}
const bagPos = (uid) => ev((u) => { const e = __ec.game.bagEntry(u); return e ? [e.x, e.y] : null; }, uid);
/** stand next to the nearest live non-boss monster; optionally make it tanky and harmless */
const standByMonster = (tanky = false) =>
  ev((tk) => {
    const g = __ec.game;
    const p = g.player;
    const alive = g.monsters.filter((m) => m.state !== "dead" && m.def.kind !== "boss");
    alive.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const m = alive[0];
    for (const [dx, dy] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) if (!g.blocked(m.x + dx, m.y + dy, p.r)) { p.x = m.x + dx; p.y = m.y + dy; break; }
    p.fx = m.x - p.x; p.fy = m.y - p.y;
    if (tk) { m.hp = m.maxHp = 99999; m.dmgMin = m.dmgMax = 0; m.ar = 0; }
    p.hp = g.derived().maxHp;
    return m.id;
  }, tanky);

await page.goto(`${base}?debug&new&seed=42`);
await wait(1200);
await ev(() => { __ec.settings.tutorialSeen = true; });

// ---------------------------------------------------------------- 1. start in camp
const start = await ev(() => { const g = __ec.game; const e = g.player.equip; return { town: g.inTown, main: e.main?.baseId, chest: e.chest?.baseId, belt: e.belt?.baseId }; });
check("New hero starts in Ember Camp", start.town && start.main === "hand_axe", JSON.stringify(start));

// ---------------------------------------------------------------- 2. joystick
const p0 = await ev(() => ({ x: __ec.game.player.x, y: __ec.game.player.y }));
await touch("touchStart", [{ x: 200, y: 250, id: 1 }]);
for (let i = 1; i <= 10; i++) {
  await touch("touchMove", [{ x: 200 + i * 6, y: 250 - i * 2, id: 1 }]);
  await wait(30);
}
const joyVisibleWhenOff = await ev(() => document.getElementById("joy").classList.contains("on"));
await wait(700);
await touch("touchEnd", []);
const p1 = await ev(() => ({ x: __ec.game.player.x, y: __ec.game.player.y }));
const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
check("Joystick drag moves the Barbarian", moved > 1, `(moved ${moved.toFixed(2)} tiles)`);
check("Joystick is invisible by default", !joyVisibleWhenOff);
await wait(300);
const p2 = await ev(() => ({ x: __ec.game.player.x, y: __ec.game.player.y }));
check("Releasing the thumb stops movement", Math.hypot(p2.x - p1.x, p2.y - p1.y) < 0.05);

// town screenshot by the trader
await ev(() => { const g = __ec.game; g.player.x = g.level.vendor.x - 2.2; g.player.y = g.level.vendor.y + 2.4; g.player.fx = 1; g.player.fy = -1; });
await wait(900);
await page.screenshot({ path: `${outDir}/town.png` });

// ---------------------------------------------------------------- 3. waypoint camp -> crypt 1
await ev(() => { const g = __ec.game; g.player.x = g.level.waypoint.x + 0.6; g.player.y = g.level.waypoint.y + 0.2; });
await wait(300);
const ctxLabel = await ev(() => { const b = document.getElementById("btn-ctx"); return b.hidden ? "" : b.textContent; });
await tap("#btn-ctx");
await wait(250);
const wpOpen = await ev(() => __ec.ui.openTab);
await tap('.wprow[data-floor="1"]');
await wait(500);
const inCrypt = await ev(() => ({ town: __ec.game.inTown, floor: __ec.game.floor }));
check("Waypoint in camp takes you to the crypt", ctxLabel.includes("Waypoint") && wpOpen === "wp" && !inCrypt.town && inCrypt.floor === 1, `(button "${ctxLabel}", panel ${wpOpen})`);

// ---------------------------------------------------------------- 4. fighting
const atkPt = await center("#btn-attack");
async function fightNearest(maxMs = 15000) {
  const id = await standByMonster(false);
  const t0 = Date.now();
  await touch("touchStart", [{ ...atkPt, id: 7 }]);
  let dead = false;
  while (Date.now() - t0 < maxMs) {
    await wait(150);
    dead = await ev((mid) => {
      const g = __ec.game;
      g.player.hp = Math.max(g.player.hp, 30);
      return g.monsters.find((q) => q.id === mid).state === "dead";
    }, id);
    if (dead) break;
  }
  await touch("touchEnd", []);
  return dead;
}
check("Holding the attack button kills a monster", await fightNearest());
await standByMonster(false);
await wait(900);
let noAuto = true;
for (let i = 0; i < 8; i++) {
  if (await ev(() => __ec.game.player.action?.type === "swing")) noAuto = false;
  await wait(120);
}
check("No auto-attack when the button is not held", noAuto);
for (let i = 0; i < 3; i++) await fightNearest(8000);
const kills = await ev(() => __ec.game.player.kills);
check("Several kills", kills >= 3, `(${kills} kills)`);

// ---------------------------------------------------------------- 5. pick up by tapping a label
await ev(() => {
  const g = __ec.game;
  g.dropAt(g.player.x, g.player.y + 0.6, { item: { uid: 1001, baseId: "spiked_club" } });
});
await wait(700);
const before = await ev(() => __ec.game.player.bag.length);
const label = await ev(() => {
  const l = __ec.renderer.labels.find((q) => q.g.item && q.g.item.uid === 1001);
  return l ? { x: l.x + l.w / 2, y: l.y + l.h / 2 } : null;
});
if (label) await tapAt(label);
await wait(1500);
const after = await ev(() => __ec.game.player.bag.length);
check("Tapping an item label picks it up into the grid bag", after > before, `(bag ${before} → ${after})`);

// gameplay screenshot: a pack in view
await ev(() => {
  const g = __ec.game;
  const p = g.player;
  const alive = g.monsters.filter((m) => m.state !== "dead");
  alive.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const m = alive[0];
  for (const [dx, dy] of [[2, 1], [-2, 1], [1, 2], [2, -1], [-1, 2]]) if (!g.blocked(m.x + dx, m.y + dy, p.r)) { p.x = m.x + dx; p.y = m.y + dy; break; }
  p.hp = g.derived().maxHp;
});
await touch("touchStart", [{ ...atkPt, id: 7 }]);
await wait(700);
await page.screenshot({ path: `${outDir}/gameplay.png` });
await touch("touchEnd", []);

// ---------------------------------------------------------------- 6. grid inventory
await ev(() => {
  const g = __ec.game;
  const p = g.player;
  p.base.str = 70; p.base.dex = 60; p.level = 12;
  const mk = (uid, baseId, def) => ({ uid, baseId, def });
  p.bag = [
    { item: mk(3001, "short_sword"), x: 0, y: 0 },
    { item: mk(3002, "buckler", 6), x: 2, y: 0 },
    { item: mk(3003, "copper_ring"), x: 6, y: 0 },
    { item: mk(3004, "cap", 4), x: 0, y: 3 - 0 > 2 ? 2 : 2 },
    { item: mk(3005, "two_handed_sword"), x: 8, y: 0 },
  ];
  // the cap sits at (2,2); make room
  p.bag[3].x = 2; p.bag[3].y = 2;
  g.events.changed();
});
await page.locator('.mbtn[data-tab="inv"]').tap();
await wait(300);
// a. drag the sword to a free spot
await drag(await center('[data-src="bag"][data-uid="3001"]'), await bagCell(5, 1, 1, 3));
const sw = await bagPos(3001);
check("Touch-drag moves an item on the grid", sw && sw[0] === 5 && sw[1] === 1, `(now at ${sw})`);
// b. invalid: buckler (2x2) onto ring + sword (two items) is refused
await drag(await center('[data-src="bag"][data-uid="3002"]'), await bagCell(5, 0, 2, 2));
const bk = await bagPos(3002);
check("Dropping onto two items is refused", bk && bk[0] === 2 && bk[1] === 0, `(buckler at ${bk})`);
// c. swap: buckler onto just the ring
await ev(() => { const e = __ec.game.bagEntry(3001); e.x = 0; e.y = 0; __ec.game.events.changed(); });
await wait(100);
await drag(await center('[data-src="bag"][data-uid="3002"]'), await bagCell(6, 0, 2, 2));
const bk2 = await bagPos(3002);
const rg2 = await bagPos(3003);
check("Dropping onto one item swaps them", bk2 && bk2[0] === 6 && bk2[1] === 0 && rg2 && !(rg2[0] === 6 && rg2[1] === 0), `(buckler ${bk2}, ring ${rg2})`);
// d. tap-to-place: tap ring, tap an empty cell
await tap('[data-src="bag"][data-uid="3003"]');
{
  const r = await page.locator('[data-grid="bag"]').boundingBox();
  const C = await ev(() => __ec.ui.C);
  await tapAt({ x: r.x + 4.5 * C, y: r.y + 3.5 * C });
}
const rg3 = await bagPos(3003);
check("Tap an item, then tap a cell, moves it there", rg3 && rg3[0] === 4 && rg3[1] === 3, `(ring at ${rg3})`);
// e. drag the short sword onto the off-hand slot: dual wield
await drag(await center('[data-src="bag"][data-uid="3001"]'), { ...(await center('.slot[data-slot="off"]')), y: (await center('.slot[data-slot="off"]')).y + LIFT });
const offId = await ev(() => __ec.game.player.equip.off?.baseId);
const dual = await ev(() => __ec.game.derived().dual);
check("Drag a one-hander onto the off-hand: dual wielding", offId === "short_sword" && dual, `(off-hand ${offId})`);
// f. tap cap, tap head slot
await tap('[data-src="bag"][data-uid="3004"]');
await tap('.slot[data-slot="head"]');
check("Tap an item, then tap a slot, equips it", (await ev(() => __ec.game.player.equip.head?.baseId)) === "cap");
// g. ring via second tap (quick equip)
await tap('[data-src="bag"][data-uid="3003"]');
await tap('[data-src="bag"][data-uid="3003"]');
check("Tapping a selected item again equips it", (await ev(() => __ec.game.player.equip.ring1?.baseId)) === "copper_ring");
// h. two-handed sword blocks the off-hand
await drag(await center('[data-src="bag"][data-uid="3005"]'), { ...(await center('.slot[data-slot="main"]')), y: (await center('.slot[data-slot="main"]')).y + LIFT });
const th = await ev(() => {
  const g = __ec.game;
  const e = g.player.equip;
  const sword = g.player.bag.find((q) => q.item.baseId === "short_sword");
  return { main: e.main?.baseId, off: e.off?.baseId ?? null, swordBack: !!sword, err: sword ? g.equipError(sword.item, "off") : "n/a", blocked: !!document.querySelector('.slot[data-slot="off"].blocked') };
});
check("Two-handed weapon takes both hands", th.main === "two_handed_sword" && th.off === null && th.swordBack && /two-handed/i.test(th.err) && th.blocked, JSON.stringify(th));
// equipment screenshot: a full paper doll with two weapons
await ev(() => {
  const g = __ec.game;
  const p = g.player;
  const mk = (uid, baseId, def) => ({ uid, baseId, def });
  p.equip = {
    main: mk(4001, "war_axe"), off: mk(4002, "scimitar"), head: mk(4003, "full_helm", 22), chest: mk(4004, "chain_mail", 74),
    gloves: mk(4005, "heavy_gloves", 6), boots: mk(4006, "heavy_boots", 7), belt: mk(4007, "belt", 4), ring1: mk(4008, "gold_ring"),
    ring2: mk(4009, "silver_ring"), amulet: mk(4010, "jade_amulet"),
  };
  p.bag = [
    { item: mk(4101, "long_sword"), x: 0, y: 0 }, { item: mk(4102, "kite_shield", 12), x: 2, y: 0 }, { item: mk(4103, "hp_potion"), x: 4, y: 0 },
    { item: mk(4104, "hp_potion"), x: 4, y: 1 }, { item: mk(4105, "mp_potion"), x: 5, y: 0 }, { item: mk(4106, "cap", 5), x: 6, y: 0 },
    { item: mk(4107, "morning_star"), x: 8, y: 0 }, { item: mk(4108, "copper_ring"), x: 5, y: 1 }, { item: mk(4109, "sash"), x: 4, y: 3 },
  ];
  g.events.changed();
});
await wait(200);
await tap('[data-src="bag"][data-uid="4101"]');
await wait(150);
await page.screenshot({ path: `${outDir}/inventory.png` });
// show a drag in progress for the equipment shot
{
  const from = await center('[data-src="bag"][data-uid="4106"]');
  const to = await center('.slot[data-slot="head"]');
  await touch("touchStart", [{ ...from, id: 5 }]);
  for (let i = 1; i <= 8; i++) {
    await touch("touchMove", [{ x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y + LIFT - from.y) * i) / 8, id: 5 }]);
    await wait(20);
  }
  await wait(500);
  await page.screenshot({ path: `${outDir}/equipment.png` });
  await touch("touchCancel", []);
  await wait(100);
  await ev(() => __ec.ui.refresh());
}
await page.locator(".pclose").tap();
await wait(200);

// ---------------------------------------------------------------- 7. dual wield alternates hands
await ev(() => {
  const g = __ec.game;
  const p = g.player;
  p.equip = { main: { uid: 5001, baseId: "hand_axe" }, off: { uid: 5002, baseId: "short_sword" }, chest: { uid: 5003, baseId: "quilted_armor", def: 9 } };
  p.bag = [];
});
await standByMonster(true);
await ev(() => { __ec.game.hitLog.length = 0; });
await touch("touchStart", [{ ...atkPt, id: 7 }]);
await wait(2600);
await touch("touchEnd", []);
const log1 = await ev(() => __ec.game.hitLog.filter((h) => h.skill === null).map((h) => h.hand));
const alternates = log1.length >= 3 && log1.every((h, i) => i === 0 || h !== log1[i - 1]);
check("Dual wield: basic attacks alternate hands", alternates, `(hands ${log1.join("")})`);

// ---------------------------------------------------------------- 8. Double Swing
await ev(() => {
  const g = __ec.game;
  const p = g.player;
  p.level = 12;
  p.skillPoints = 6;
  g.learn("bash");
  g.learn("double_swing");
  g.assignSlot(1, "double_swing");
  p.mana = 999;
});
async function useSkill(slot, ms) {
  const pt = await center(`#btn-s${slot}`);
  await touch("touchStart", [{ ...pt, id: 9 }]);
  await wait(ms);
  await touch("touchEnd", []);
  await wait(250);
}
await wait(800); // let the last basic swing finish
await standByMonster(true);
await ev(() => { __ec.game.hitLog.length = 0; __ec.game.player.mana = 999; });
await useSkill(1, 120);
await wait(600);
const ds1 = await ev(() => __ec.game.hitLog.filter((h) => h.skill === "double_swing").map((h) => h.hand).slice(0, 2));
check("Double Swing with two weapons hits once with each", ds1.length === 2 && ds1.includes(0) && ds1.includes(1), `(hands ${ds1.join("")})`);
await ev(() => { const g = __ec.game; delete g.player.equip.off; g.hitLog.length = 0; g.player.mana = 999; });
await standByMonster(true);
await useSkill(1, 120);
await wait(600);
const ds2 = await ev(() => __ec.game.hitLog.filter((h) => h.skill === "double_swing").map((h) => h.hand).slice(0, 2));
check("Double Swing with one weapon hits twice with it", ds2.length === 2 && ds2.every((h) => h === 0), `(hands ${ds2.join("")})`);

// ---------------------------------------------------------------- 9. Frenzy
await ev(() => {
  const g = __ec.game;
  const p = g.player;
  p.equip.off = { uid: 5002, baseId: "short_sword" };
  p.skillPoints = Math.max(p.skillPoints, 1);
  g.learn("frenzy");
  g.assignSlot(2, "frenzy");
  p.mana = 999;
});
const fzBase = await ev(() => { const d = __ec.game.derived(); return { speed: d.speed, ias: d.ias }; });
await standByMonster(true);
await useSkill(2, 2600);
const fz = await ev(() => { const g = __ec.game; const d = g.derived(); return { stacks: g.player.frenzy.stacks, speed: d.speed, ias: d.ias, hits: g.hitLog.filter((h) => h.skill === "frenzy").length }; });
check("Frenzy stacks raise attack and move speed", fz.stacks >= 2 && fz.speed > fzBase.speed && fz.ias > fzBase.ias, `(stacks ${fz.stacks}, move ${fzBase.speed.toFixed(2)}→${fz.speed.toFixed(2)}, ias +${Math.round(fz.ias * 100)}%)`);
await wait(500);
await page.screenshot({ path: "test-results/e2e-frenzy.png" });
await ev(() => { const g = __ec.game; g.player.x = g.level.waypoint.x; g.player.y = g.level.waypoint.y; });
await wait(7500);
const fz2 = await ev(() => __ec.game.player.frenzy.stacks);
check("Frenzy stacks wear off after a few seconds", fz2 === 0, `(stacks ${fz.stacks} → ${fz2})`);

// ---------------------------------------------------------------- 10. skill tree screen
await page.locator('.mbtn[data-tab="skills"]').tap();
await wait(250);
await tap('.snode[data-id="frenzy"]');
await wait(200);
await page.screenshot({ path: `${outDir}/skill-tree.png` });
const learnedViaUi = await ev(() => __ec.game.player.skills.frenzy >= 1);
check("Skill tree shows Frenzy under Double Swing", learnedViaUi && (await ev(() => document.querySelectorAll(".sgrid path").length > 3)));
await page.locator(".pclose").tap();
await wait(200);

// ---------------------------------------------------------------- 11. settings: joystick + multi-touch
await page.locator('.mbtn[data-tab="settings"]').tap();
await wait(200);
await page.locator('[data-key="showJoystick"]').tap();
await wait(100);
await page.locator(".pclose").tap();
await wait(200);
await touch("touchStart", [{ x: 170, y: 260, id: 1 }]);
await touch("touchMove", [{ x: 205, y: 240, id: 1 }]);
await wait(250);
const joyOn = await ev(() => document.getElementById("joy").classList.contains("on"));
await page.screenshot({ path: `test-results/joystick-debug.png` });
await touch("touchStart", [{ x: 205, y: 240, id: 1 }, { ...atkPt, id: 7 }]);
await wait(400);
const multi = await ev(() => __ec.game.player.action !== null || __ec.input.attack);
await touch("touchEnd", []);
check("Settings toggle shows the joystick", joyOn);
check("Multi-touch: move thumb + attack thumb together", multi);
await page.locator('.mbtn[data-tab="settings"]').tap();
await page.locator('[data-key="showJoystick"]').tap();
await page.locator(".pclose").tap();

// ---------------------------------------------------------------- 12. back to camp, trade with Hilde
await ev(() => { const g = __ec.game; g.player.x = g.level.waypoint.x + 0.5; g.player.y = g.level.waypoint.y + 0.3; });
await wait(250);
await tap("#btn-ctx");
await wait(250);
await tap('.wprow[data-floor="0"]');
await wait(500);
check("Waypoint in the crypt takes you back to camp", await ev(() => __ec.game.inTown));
await ev(() => {
  const g = __ec.game;
  const p = g.player;
  p.x = g.level.vendor.x - 1.2;
  p.y = g.level.vendor.y + 1;
  p.gold = 50;
  p.hpPots = 0;
  p.bag = [{ item: { uid: 6001, baseId: "war_axe" }, x: 0, y: 0 }, { item: { uid: 6002, baseId: "chain_mail", def: 70 }, x: 2, y: 0 }];
});
await wait(300);
const tradeLabel = await ev(() => document.getElementById("btn-ctx").textContent);
await tap("#btn-ctx");
await wait(300);
const shopOpen = await ev(() => __ec.ui.openTab === "shop");
check("Walking up to Hilde offers Trade, which opens the shop", shopOpen && /Trade/.test(tradeLabel), `("${tradeLabel}")`);
// sell by tapping + Sell button
const g0 = await ev(() => __ec.game.player.gold);
await tap('[data-src="bag"][data-uid="6001"]');
await tap('[data-act="sell"]');
const sold = await ev(() => ({ gold: __ec.game.player.gold, gone: !__ec.game.bagEntry(6001), inStock: __ec.game.vendorStock.some((q) => q.item.uid === 6001) }));
check("Selling loot adds gold", sold.gold > g0 && sold.gone && sold.inStock, `(gold ${g0} → ${sold.gold})`);
// sell by dragging onto Hilde's wares
const g1 = sold.gold;
await drag(await center('[data-src="bag"][data-uid="6002"]'), { ...(await center('[data-grid="vendor"]')), y: (await center('[data-grid="vendor"]')).y + LIFT });
const g2 = await ev(() => __ec.game.player.gold);
check("Dragging an item onto the trader sells it", g2 > g1 && !(await ev(() => __ec.game.bagEntry(6002))), `(gold ${g1} → ${g2})`);
// buy a healing potion
const potUid = await ev(() => __ec.game.vendorStock.find((q) => q.item.baseId === "hp_potion").item.uid);
await tap(`[data-src="vendor"][data-uid="${potUid}"]`);
await wait(100);
await page.screenshot({ path: `${outDir}/town-shop.png` });
await tap('[data-act="buy"]');
const bought = await ev(() => ({ gold: __ec.game.player.gold, pots: __ec.game.player.hpPots }));
check("Buying a potion costs gold and fills the belt", bought.pots === 1 && bought.gold < g2, `(gold ${g2} → ${bought.gold}, belt ♥ ${bought.pots})`);
// buy an item by dragging it into the bag
const buyUid = await ev(() => { const g = __ec.game; g.player.gold = 5000; return g.vendorStock.find((q) => !q.item.baseId.endsWith("potion")).item.uid; });
await ev(() => __ec.ui.refresh());
await drag(await center(`[data-src="vendor"][data-uid="${buyUid}"]`), await bagCell(6, 0, 1, 1));
check("Dragging the trader's item into your bag buys it", !!(await ev((u) => __ec.game.bagEntry(u), buyUid)));
await page.locator(".pclose").tap();
await wait(200);

// ---------------------------------------------------------------- 13. death → camp
await ev(() => __ec.game.goDungeon(1));
await wait(300);
await ev(() => { const g = __ec.game; g.player.hp = 0; g["die"](); });
await wait(1300);
const deathShown = await ev(() => !document.getElementById("death").hidden);
await page.locator("#btn-respawn").tap();
await wait(300);
const alive = await ev(() => !__ec.game.player.dead && __ec.game.player.hp > 0 && __ec.game.inTown);
check("Death screen, then you wake in camp", deathShown && alive);

// ---------------------------------------------------------------- 14. saves round-trip
await ev(() => {
  const g = __ec.game;
  g.player.equip.off = { uid: 7001, baseId: "short_sword" };
  localStorage.setItem("ember-crypt-save-v1", JSON.stringify(g.toSave()));
});
await page.goto(`${base}?debug`);
await wait(1200);
const reloaded = await ev(() => ({ off: __ec.game.player.equip.off?.baseId, town: __ec.game.inTown, bag: __ec.game.player.bag.length }));
check("A saved game reloads (in camp, gear kept)", reloaded.off === "short_sword" && reloaded.town, JSON.stringify(reloaded));

// ---------------------------------------------------------------- 15. portrait + perf
await page.setViewportSize({ width: 393, height: 852 });
await wait(400);
check("Portrait shows the rotate-your-phone prompt", await ev(() => getComputedStyle(document.getElementById("rotate")).display !== "none"));
await page.setViewportSize({ width: 852, height: 393 });
await ev(() => __ec.game.goDungeon(1));
await wait(2500);
const fps = await ev(() => __ec.fps);
check("Runs smoothly", fps >= 30, `(${fps} fps headless)`);
check("No page errors", errors.length === 0, errors.join(" | "));
await page.close();

// ---------------------------------------------------------------- 16. v0.1 save migrates to the grid
{
  const ctx2 = await browser.newContext(ctxOpts);
  await ctx2.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    const inv = Array(20).fill(null);
    const ids = ["war_axe", "war_axe", "war_axe", "war_axe", "war_axe", "war_axe", "short_sword", "cap", "boots", "leather_gloves", "buckler", "falchion"];
    ids.forEach((id, i) => (inv[i] = { uid: 100 + i, baseId: id, def: /axe|sword|falchion/.test(id) ? undefined : 3 }));
    const v1 = {
      v: 1, seed: 1234, floor: 3,
      player: {
        level: 7, xp: 2500, base: { str: 40, dex: 25, vit: 30, ene: 10 }, statPoints: 0, skillPoints: 0, skills: { bash: 2 }, slots: ["bash", null, null],
        inventory: inv, equip: { weapon: { uid: 1, baseId: "scimitar" }, shield: { uid: 2, baseId: "small_shield", def: 9 }, armor: { uid: 3, baseId: "leather_armor", def: 15 }, helm: { uid: 4, baseId: "skull_cap", def: 9 } },
        gold: 100, hpPots: 3, mpPots: 2, kills: 40,
      },
    };
    localStorage.setItem("ember-crypt-save-v1", JSON.stringify(v1));
  });
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on("pageerror", (e) => errs2.push(e.message));
  await p2.goto(`${base}?debug`);
  await p2.waitForTimeout(1500);
  const mig = await p2.evaluate(() => {
    const g = __ec.game;
    const e = g.player.equip;
    return { main: e.main?.baseId, off: e.off?.baseId, chest: e.chest?.baseId, head: e.head?.baseId, bag: g.player.bag.length, gold: g.player.gold, maxFloor: g.maxFloor, lvl: g.player.level, toast: document.getElementById("toast").textContent };
  });
  check("Old v0.1 saves convert to the grid bag and new slots", mig.main === "scimitar" && mig.off === "small_shield" && mig.chest === "leather_armor" && mig.lvl === 7 && mig.bag >= 6 && mig.gold > 100 && /grid/.test(mig.toast), JSON.stringify(mig));
  check("No page errors after migration", errs2.length === 0, errs2.join(" | "));
  await p2.close();
  await ctx2.close();
}

// ---------------------------------------------------------------- 17. test hooks are hidden without ?debug (production builds)
if (!base.includes("127.0.0.1:5174")) {
  const p3 = await ctx.newPage();
  await p3.goto(base);
  await p3.waitForTimeout(1000);
  check("Test hooks are off in the normal build", await p3.evaluate(() => typeof window.__ec === "undefined"));
  await p3.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
