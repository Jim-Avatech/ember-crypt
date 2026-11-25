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
  if (typeof id !== "number") id = 3;
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
check("New hero starts in Ember Camp", start.town && start.main === "axe", JSON.stringify(start));

// ---------------------------------------------------------------- 1b. audio unlocks on the end of a tap (iOS rule)
{
  const st0 = await ev(() => __ec.sfx.state);
  await touch("touchStart", [{ x: 420, y: 200, id: 1 }]);
  await wait(150);
  const stDown = await ev(() => __ec.sfx.state);
  await touch("touchEnd", []);
  await wait(300);
  const stUp = await ev(() => __ec.sfx.state);
  check("Audio: nothing on touchstart; AudioContext running after the tap ends", st0 === "not started" && stDown === "not started" && stUp === "running", JSON.stringify({ st0, stDown, stUp }));
  // backgrounding suspends it (iOS 'interrupted'); coming back + the next tap resumes it
  await ev(() => __ec.sfx["ctx"].suspend());
  await wait(100);
  await ev(() => document.dispatchEvent(new Event("visibilitychange")));
  await wait(200);
  const afterVis = await ev(() => __ec.sfx.state);
  await ev(() => __ec.sfx["ctx"].suspend());
  await wait(100);
  await tapAt({ x: 420, y: 200 });
  await wait(300);
  const afterTap = await ev(() => __ec.sfx.state);
  check("Audio resumes after backgrounding (on return and on the next tap)", afterVis === "running" && afterTap === "running", JSON.stringify({ afterVis, afterTap }));
  const gain = await ev(() => ({ master: __ec.sfx["master"].gain.value, on: __ec.sfx.enabled, setting: __ec.settings.sound }));
  check("Sound is on by default with non-zero volume", gain.master > 0 && gain.on && gain.setting, JSON.stringify(gain));
}

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
  g.dropAt(g.player.x, g.player.y + 0.6, { item: { uid: 1001, baseId: "mace", ilvl: 2 } });
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
  const mk = (uid, baseId, ilvl = 3) => ({ uid, baseId, ilvl });
  p.bag = [
    { item: mk(3001, "sword"), x: 0, y: 0 },
    { item: mk(3002, "shield"), x: 2, y: 0 },
    { item: mk(3003, "ring"), x: 6, y: 0 },
    { item: mk(3004, "helm"), x: 0, y: 3 - 0 > 2 ? 2 : 2 },
    { item: mk(3005, "great_sword"), x: 8, y: 0 },
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
check("Drag a one-hander onto the off-hand: dual wielding", offId === "sword" && dual, `(off-hand ${offId})`);
// f. tap cap, tap head slot
await tap('[data-src="bag"][data-uid="3004"]');
await tap('.slot[data-slot="head"]');
check("Tap an item, then tap a slot, equips it", (await ev(() => __ec.game.player.equip.head?.baseId)) === "helm");
// g. a second tap deselects; the Equip button equips
await tap('[data-src="bag"][data-uid="3003"]');
const selOn = await ev(() => !!document.querySelector('[data-src="bag"][data-uid="3003"].sel'));
await tap('[data-src="bag"][data-uid="3003"]');
const selOff = await ev(() => ({ sel: !!document.querySelector('[data-src="bag"][data-uid="3003"].sel'), ring: __ec.game.player.equip.ring1?.baseId ?? null, inBag: !!__ec.game.bagEntry(3003) }));
check("Tapping a selected item again deselects it (doesn't equip)", selOn && !selOff.sel && selOff.ring === null && selOff.inBag, JSON.stringify({ selOn, selOff }));
await tap('[data-src="bag"][data-uid="3003"]');
await tap('.idetail [data-act="equip"]');
check("The Equip button equips the selected item", (await ev(() => __ec.game.player.equip.ring1?.baseId)) === "ring");
// h. two-handed sword blocks the off-hand
await drag(await center('[data-src="bag"][data-uid="3005"]'), { ...(await center('.slot[data-slot="main"]')), y: (await center('.slot[data-slot="main"]')).y + LIFT });
const th = await ev(() => {
  const g = __ec.game;
  const e = g.player.equip;
  const sword = g.player.bag.find((q) => q.item.baseId === "sword");
  return { main: e.main?.baseId, off: e.off?.baseId ?? null, swordBack: !!sword, err: sword ? g.equipError(sword.item, "off") : "n/a", blocked: !!document.querySelector('.slot[data-slot="off"].blocked') };
});
check("Two-handed weapon takes both hands", th.main === "great_sword" && th.off === null && th.swordBack && /two-handed/i.test(th.err) && th.blocked, JSON.stringify(th));
// equipment screenshot: a full paper doll with two weapons
await ev(() => {
  const g = __ec.game;
  const p = g.player;
  let s = 77;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const { makeItem, enchant } = __ec.items;
  const mk = (uid, baseId, ilvl = 12, q = "normal") => { const it = makeItem(baseId, ilvl); it.uid = uid; return q === "normal" ? it : enchant(it, q, r); };
  p.equip = {
    main: mk(4001, "axe", 12, "rare"), off: mk(4002, "sword", 11, "magic"), head: mk(4003, "helm", 12), chest: mk(4004, "armor", 14, "magic"),
    gloves: mk(4005, "gloves", 10), boots: mk(4006, "boots", 10, "magic"), belt: mk(4007, "belt", 10), ring1: mk(4008, "ring", 10, "magic"),
    ring2: mk(4009, "ring", 10, "rare"), amulet: mk(4010, "amulet", 10, "magic"),
  };
  p.bag = [
    { item: mk(4101, "sword", 14, "magic"), x: 0, y: 0 }, { item: mk(4102, "shield", 12, "rare"), x: 2, y: 0 }, { item: mk(4103, "hp_potion"), x: 4, y: 0 },
    { item: mk(4104, "hp_potion"), x: 4, y: 1 }, { item: mk(4105, "mp_potion"), x: 5, y: 0 }, { item: mk(4106, "helm", 13, "magic"), x: 6, y: 0 },
    { item: mk(4107, "mace", 12), x: 8, y: 0 }, { item: mk(4108, "ring", 12, "rare"), x: 5, y: 1 }, { item: mk(4109, "belt", 12), x: 4, y: 3 },
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
  p.equip = { main: { uid: 5001, baseId: "axe", ilvl: 1 }, off: { uid: 5002, baseId: "sword", ilvl: 1 }, chest: { uid: 5003, baseId: "armor", ilvl: 1 } };
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
  p.equip.off = { uid: 5002, baseId: "sword", ilvl: 1 };
  // D2 1.10: Frenzy is level 24 and needs Double Throw
  p.level = 24;
  p.skillPoints = Math.max(p.skillPoints, 3);
  g.learn("double_throw");
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
check("Skill tree shows Frenzy under Double Throw (D2 1.10 tree)", learnedViaUi && (await ev(() => document.querySelectorAll(".sgrid path").length > 3)));
await page.locator(".pclose").tap();
await wait(200);

// ---------------------------------------------------------------- 10b. D2 tree rules, throwing weapons, quarterstaff
{
  const tree = await ev(() => {
    const S = Object.fromEntries(__ec.data.SKILLS.map((s) => [s.id, s]));
    return {
      frenzy: [S.frenzy.reqLvl, S.frenzy.prereq.join()], dt: [S.double_throw.reqLvl, S.double_throw.row],
      masteries: ["sword_mastery", "axe_mastery", "mace_mastery", "polearm_mastery", "throwing_mastery", "spear_mastery"].every((id) => S[id].reqLvl === 1 && !(S[id].prereq ?? []).length && S[id].implemented),
    };
  });
  check("D2 tree: Frenzy 24 after Double Throw; all six masteries at level 1", tree.frenzy[0] === 24 && tree.frenzy[1] === "double_throw" && tree.dt[0] === 12 && tree.dt[1] === 2 && tree.masteries, JSON.stringify(tree));
  await page.locator('.mbtn[data-tab="skills"]').tap();
  await wait(250);
  await tap('.stab[data-tree="masteries"]');
  await wait(200);
  await page.screenshot({ path: `${outDir}/skill-tree-masteries.png` });
  await page.locator(".pclose").tap();
  await wait(200);

  // put a tanky monster 4 tiles away on a clear line, and hold throwing weapons
  const placeAt = (dist) => ev((dist) => {
    const g = __ec.game;
    const p = g.player;
    const alive = g.monsters.filter((m) => m.state !== "dead" && m.def.kind !== "boss");
    for (const q of alive) { q.x = p.x + 80; q.y = p.y + 80; }
    const m = alive[0];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      let clear = true;
      for (let t = 0.3; t <= dist + 0.5; t += 0.2) if (g.blocked(p.x + dx * t, p.y + dy * t, 0.5)) clear = false;
      if (clear) { m.x = p.x + dx * dist; m.y = p.y + dy * dist; break; }
    }
    Object.assign(m, { hp: 99999, maxHp: 99999, dmgMin: 0, dmgMax: 0, ar: 0, defense: 0, state: "idle", atkT: 99, homeX: m.x, homeY: m.y, wx: m.x, wy: m.y });
    m.def = { ...m.def, speed: 0 };
    p.hp = g.derived().maxHp;
    return m.id;
  }, dist);
  await ev(() => {
    const g = __ec.game;
    g.goDungeon(1);
    const p = g.player;
    p.equip.main = __ec.items.makeItem("throwing_axe", 6);
    p.equip.off = __ec.items.makeItem("throwing_knife", 6);
    g.assignSlot(1, "double_throw");
    p.mana = 999;
    g.events.changed();
  });
  await wait(400);
  const mid = await placeAt(4);
  await ev(() => { __ec.game.hitLog.length = 0; });
  await touch("touchStart", [{ ...atkPt, id: 7 }]);
  let shot = false;
  for (let i = 0; i < 40 && !shot; i++) {
    await wait(25);
    if (await ev(() => __ec.game.projectiles.some((q) => q.dist > 1.2))) {
      await page.screenshot({ path: `${outDir}/throw.png` });
      shot = true;
    }
  }
  await wait(1500);
  await touch("touchEnd", []);
  await wait(500);
  const thr = await ev((id) => {
    const g = __ec.game;
    const m = g.monsters.find((q) => q.id === id);
    const p = g.player;
    return { main: p.equip.main.qty, off: p.equip.off.qty, hp: m.hp, dist: Math.hypot(m.x - p.x, m.y - p.y), throws: g.hitLog.filter((h) => h.skill === "throw").length, btn: document.querySelector("#btn-attack span").textContent };
  }, mid);
  check("Throw: attack button throws from range, uses the stack and hits", shot && thr.throws >= 2 && thr.main < 30 && thr.off < 40 && thr.hp < 99999 && thr.dist > 3 && thr.btn === "➶", JSON.stringify(thr));
  await placeAt(4);
  const before = await ev(() => [__ec.game.player.equip.main.qty, __ec.game.player.equip.off.qty]);
  await useSkill(1, 120);
  await wait(800);
  const after = await ev(() => [__ec.game.player.equip.main.qty, __ec.game.player.equip.off.qty, __ec.game.hitLog.filter((h) => h.skill === "double_throw").map((h) => h.hand).join("")]);
  check("Double Throw throws one from each hand", after[0] === before[0] - 1 && after[1] === before[1] - 1 && after[2].length === 2, JSON.stringify({ before, after }));
  await ev(() => __ec.ui.open("inv"));
  await wait(250);
  await page.screenshot({ path: `${outDir}/throwing-inventory.png` });
  const badge = await ev(() => [...document.querySelectorAll(".eqi .qty")].map((e) => e.textContent));
  check("Inventory shows how many are left", badge.length === 2, JSON.stringify(badge));
  await ev(() => __ec.ui.close());
  await ev(() => { __ec.game.player.equip.main.qty = 0; __ec.game.goTown(); });
  await wait(300);
  const refill = await ev(() => ({ q: __ec.game.player.equip.main.qty, stock: ["quarterstaff", "throwing_knife", "throwing_axe", "javelin"].every((id) => __ec.game.vendorStock.some((e) => e.item.baseId === id)) }));
  check("Stacks refill in camp; Hilde sells all four new classes", refill.q === 30 && refill.stock, JSON.stringify(refill));

  // quarterstaff: two-handed melee with Pole Arm Mastery
  await ev(() => {
    const g = __ec.game;
    g.goDungeon(1);
    const p = g.player;
    delete p.equip.off;
    p.equip.main = __ec.items.makeItem("quarterstaff", 6);
    g.events.changed();
  });
  await wait(400);
  const qsBase = await ev(() => __ec.game.handFor("main").crit);
  await ev(() => { const g = __ec.game; g.player.skills.polearm_mastery = 5; g.events.changed(); });
  const qsM = await ev(() => __ec.game.handFor("main").crit);
  const qm = await standByMonster(true);
  // clear the rest so the staff reads clearly; stand to the monster's lower left (facing up-right, toward the camera side)
  await ev((id) => {
    const g = __ec.game;
    const p = g.player;
    const m = g.monsters.find((q) => q.id === id);
    for (const q of g.monsters) if (q !== m) { q.x += 80; q.y += 80; }
    for (const [dx, dy] of [[0, 1.1], [1.1, 0], [-1.1, 0], [0, -1.1]]) if (!g.blocked(m.x + dx, m.y + dy, p.r)) { p.x = m.x + dx; p.y = m.y + dy; break; }
    p.fx = m.x - p.x; p.fy = m.y - p.y;
    m.def = { ...m.def, speed: 0 };
  }, qm);
  await wait(300);
  await ev(() => { __ec.game.hitLog.length = 0; });
  await touch("touchStart", [{ ...atkPt, id: 7 }]);
  let qshot = false;
  for (let i = 0; i < 40 && !qshot; i++) {
    await wait(25);
    if (await ev(() => { const a = __ec.game.player.action; return a?.type === "swing" && a.t / a.dur > 0.35 && a.t / a.dur < 0.6; })) {
      await page.screenshot({ path: `${outDir}/quarterstaff.png` });
      qshot = true;
    }
  }
  await wait(1500);
  await touch("touchEnd", []);
  const qs = await ev(() => ({ hits: __ec.game.hitLog.filter((h) => h.skill === null).length, off: !__ec.game.player.equip.off }));
  check("Quarterstaff: two-handed melee, boosted by Pole Arm Mastery", qshot && qs.hits >= 2 && qs.off && qsM > qsBase, JSON.stringify({ qs, qsBase, qsM }));
  await ev(() => __ec.game.goTown());
  await wait(300);
}

// ---------------------------------------------------------------- 11. settings: joystick + multi-touch
await page.locator('.mbtn[data-tab="settings"]').tap();
await wait(200);
{
  // Test sound button: plays a chime through a running context
  const before = await ev(() => { const c = __ec.sfx["ctx"]; let n = 0; const o = c.createOscillator; c.createOscillator = function (...a) { n++; window.__osc = n; return o.apply(this, a); }; return 0; });
  await tap('[data-act="testsnd"]');
  await wait(500);
  const ts = await ev(() => ({ osc: window.__osc ?? 0, text: document.getElementById("sndstate")?.textContent ?? "", st: __ec.sfx.state }));
  check("Settings has a Test sound button that plays a chime", before === 0 && ts.osc >= 3 && ts.st === "running" && /chime/.test(ts.text), JSON.stringify(ts));
}
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
  p.bag = [{ item: { uid: 6001, baseId: "axe", ilvl: 8 }, x: 0, y: 0 }, { item: { uid: 6002, baseId: "armor", ilvl: 9 }, x: 2, y: 0 }];
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
// the trader stocks some magic (blue) items, priced above plain ones
const blue = await ev(() => {
  const g = __ec.game;
  const m = g.vendorStock.filter((q) => q.item.q === "magic");
  return { n: m.length, boxes: document.querySelectorAll('[data-src="vendor"].q-magic').length };
});
check("Hilde sells some blue (magic) items", blue.n >= 2 && blue.boxes === blue.n, JSON.stringify(blue));
await page.locator(".pclose").tap();
await wait(200);

// ---------------------------------------------------------------- 12a. bigger backpack + camp stash
{
  await ev(() => __ec.ui.open("inv"));
  await wait(250);
  const inv = await ev(() => {
    const b = document.querySelector(".pbody");
    const r = document.querySelector('[data-grid="bag"]').getBoundingClientRect();
    return { cols: Math.round(r.width / __ec.ui.C), rows: Math.round(r.height / __ec.ui.C), C: __ec.ui.C, noScroll: b.scrollHeight <= b.clientHeight + 1 };
  });
  check("Backpack is 10×8 (80 cells) beside the equipment, no scrolling, cells ≥ 30 px", inv.cols === 10 && inv.rows === 8 && inv.noScroll && inv.C >= 30, JSON.stringify(inv));
  await ev(() => __ec.ui.close());
  await ev(() => {
    const g = __ec.game;
    const p = g.player;
    const { makeItem } = __ec.items;
    const mk = (uid, id, l = 8) => { const it = makeItem(id, l); it.uid = uid; return it; };
    p.bag = [
      { item: mk(7001, "great_sword"), x: 0, y: 0 }, { item: mk(7002, "ring"), x: 9, y: 7 }, { item: mk(7003, "javelin"), x: 4, y: 4 },
      { item: mk(7004, "helm"), x: 2, y: 0 },
    ];
    p.stash = [{ item: mk(7101, "armor", 10), x: 0, y: 0 }, { item: mk(7102, "amulet", 9), x: 9, y: 9 }];
    p.x = g.level.stash.x + 1.2;
    p.y = g.level.stash.y + 0.2;
    g.events.changed();
  });
  await wait(400);
  const lbl = await ev(() => document.getElementById("btn-ctx").textContent);
  await page.screenshot({ path: `${outDir}/stash-chest.png` });
  await tap("#btn-ctx");
  await wait(300);
  const open = await ev(() => __ec.ui.openTab);
  check("Walking up to the camp chest offers the stash, which opens beside the backpack", open === "stash" && /stash/i.test(lbl) && (await ev(() => !!document.querySelector('[data-grid="stash"]') && !!document.querySelector('[data-grid="bag"]'))), JSON.stringify({ lbl, open }));
  const fitsScreen = await ev(() => {
    const b = document.querySelector(".pbody");
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    return { noScroll: b.scrollHeight <= b.clientHeight + 1 && b.scrollWidth <= b.clientWidth + 1, stash: [Math.round(r('[data-grid="stash"]').width), Math.round(r('[data-grid="stash"]').height)], bag: [Math.round(r('[data-grid="bag"]').width), Math.round(r('[data-grid="bag"]').height)], C: __ec.ui.C };
  });
  check("Stash 10×10 and backpack 10×8 fit at 852×393 without scrolling", fitsScreen.noScroll && Math.abs(fitsScreen.stash[1] - 10 * fitsScreen.C) <= 2 && Math.abs(fitsScreen.bag[1] - 8 * fitsScreen.C) <= 2, JSON.stringify(fitsScreen));
  // drag the javelin from the backpack into stash cell (5, 3)
  const sCell = async (cx, cy, w, h) => {
    const r = await page.locator('[data-grid="stash"]').boundingBox();
    const C = await ev(() => __ec.ui.C);
    return { x: r.x + (cx + w / 2) * C, y: r.y + (cy + h / 2) * C + LIFT };
  };
  await drag(await center('[data-src="bag"][data-uid="7003"]'), await sCell(5, 3, 1, 4));
  const st1 = await ev(() => { const e = __ec.game.stashEntry(7003); return { e: e ? [e.x, e.y] : null, inBag: !!__ec.game.bagEntry(7003) }; });
  check("Drag a backpack item into the stash, at the cell you drop it on", st1.e && st1.e[0] === 5 && st1.e[1] === 3 && !st1.inBag, JSON.stringify(st1));
  // a drop that overlaps is refused
  await drag(await center('[data-src="bag"][data-uid="7004"]'), await sCell(0, 0, 2, 2));
  check("A stash drop that doesn't fit is refused", !!(await ev(() => __ec.game.bagEntry(7004))) && !(await ev(() => __ec.game.stashEntry(7004))));
  // drag the armor from the stash into the bottom rows of the backpack (rows 4–7 are new)
  await drag(await center('[data-src="stash"][data-uid="7101"]'), await bagCell(6, 5, 2, 3));
  const b1 = await bagPos(7101);
  check("Drag a stash item into the new lower rows of the backpack", b1 && b1[0] === 6 && b1[1] === 5, JSON.stringify(b1));
  // a second tap deselects; "To backpack" moves it
  await tap('[data-src="stash"][data-uid="7102"]');
  await tap('[data-src="stash"][data-uid="7102"]');
  await wait(150);
  const desel = await ev(() => ({ inStash: !!__ec.game.stashEntry(7102), sel: !!document.querySelector(".gi.sel") }));
  await tap('[data-src="stash"][data-uid="7102"]');
  await tap('[data-act="stash-take"]');
  await wait(150);
  check("Stash: a second tap deselects; “To backpack” moves it", desel.inStash && !desel.sel && !!(await ev(() => __ec.game.bagEntry(7102))), JSON.stringify(desel));
  await ev(() => { __ec.game.player.gold = 1234; __ec.ui.refresh(); });
  await tap('[data-src="bag"][data-uid="7002"]');
  await wait(150);
  await page.screenshot({ path: `${outDir}/stash.png` });
  await tap('[data-act="stash-put"]');
  check("“To stash” button stores the selected item", !!(await ev(() => __ec.game.stashEntry(7002))));
  // saved with the hero and in the export code
  await page.locator(".pclose").tap();
  await wait(700);
  const saved = await ev(() => {
    const raw = JSON.parse(localStorage.getItem("ember-crypt-save-v1"));
    const code = __ec.ui["hooks"].save.exportCode();
    const back = JSON.parse(decodeURIComponent(escape(atob(code.slice("EMBERCRYPT1:".length)))));
    return { v: raw.v, stash: raw.player.stash.map((e) => e.item.uid).sort(), exp: (back.player.stash || []).length };
  });
  check("The stash is saved with the hero (v5) and included in the export code", saved.v === 5 && saved.stash.join() === "7002,7003" && saved.exp === 2, JSON.stringify(saved));
  // town only
  await ev(() => __ec.game.goDungeon(1));
  await wait(200);
  await ev(() => __ec.ui.open("stash"));
  await wait(150);
  check("The stash can't be opened outside camp", (await ev(() => __ec.ui.openTab)) !== "stash");
  await ev(() => __ec.game.goTown());
  await wait(300);
}

// ---------------------------------------------------------------- 12b. magic & rare items
await ev(() => __ec.game.goDungeon(1));
await wait(400);
const spd = await ev(() => {
  const d = __ec.game.derived();
  return { tiles: d.speed, px: d.speed * 32 * __ec.renderer.ascale };
});
check("Walk speed on screen is at least v0.1's (~284 px/s)", spd.px >= 284, `(${spd.px.toFixed(0)} px/s, ${spd.tiles} tiles/s)`);
await ev(() => {
  const g = __ec.game;
  const p = g.player;
  for (const m of g.monsters) if (Math.hypot(m.x - p.x, m.y - p.y) < 12) { m.x += 40; m.y += 40; m.state = "idle"; }
  p.hp = g.derived().maxHp;
  let s = 5;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const { makeItem, enchant } = __ec.items;
  const put = (dx, dy, it) => { const x = p.x + dx; const y = p.y + dy; g.dropAt(g.blocked(x, y, 0.2) ? p.x : x, g.blocked(x, y, 0.2) ? p.y : y, { item: it }); };
  put(1.4, 0.2, Object.assign(makeItem("mace", 3), { uid: 8001 }));
  put(-1.2, 0.9, Object.assign(enchant(makeItem("sword", 4), "magic", r), { uid: 8002 }));
  put(0.4, 1.6, Object.assign(enchant(makeItem("armor", 5), "rare", r), { uid: 8003 }));
  put(-0.3, -1.5, Object.assign(enchant(makeItem("ring", 5), "magic", r), { uid: 8004 }));
  put(1.6, -1.1, { uid: 8005, baseId: "hp_potion" });
  g.dropAt(p.x - 1.5, p.y - 0.6, { gold: 37 });
});
await wait(1300);
const lbl = await ev(() => __ec.renderer.labels.map((l) => ({ uid: l.g.item.uid, c: l.color })));
const col = (u) => lbl.find((l) => l.uid === u)?.c;
check("Ground labels are colored by quality (white / blue / yellow)", col(8001) === "#ffffff" && col(8002) === "#7a7aff" && col(8003) === "#ffff64" && col(8004) === "#7a7aff", JSON.stringify(lbl));
await page.screenshot({ path: `${outDir}/ground-drops.png` });
// pick the rare up by its label
const rl = await ev(() => { const l = __ec.renderer.labels.find((q) => q.g.item.uid === 8003); return l ? { x: l.x + l.w / 2, y: l.y + l.h / 2 } : null; });
if (rl) await tapAt(rl);
await wait(1500);
check("Picking up a rare keeps its affixes", await ev(() => { const e = __ec.game.bagEntry(8003); return !!e && e.item.q === "rare" && e.item.mods.length >= 3; }));

// tooltips
await ev(() => {
  const g = __ec.game;
  const p = g.player;
  const { makeItem, enchant } = __ec.items;
  let s = 11;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let mag;
  for (let i = 0; i < 200; i++) { mag = enchant(makeItem("axe", 14), "magic", r); if (mag.aff.length === 2 && mag.mods.length >= 2) break; }
  let rare;
  for (let i = 0; i < 200; i++) { rare = enchant(makeItem("helm", 16), "rare", r); if (rare.aff.length >= 5) break; }
  mag.uid = 8101; rare.uid = 8102;
  p.level = 20; p.base.str = 80; p.base.dex = 60;
  p.bag = [{ item: mag, x: 0, y: 0 }, { item: rare, x: 2, y: 0 }, { item: { uid: 8103, baseId: "ring", ilvl: 10, q: "rare", name: "Test Band", mods: [{ s: "str", v: 15 }, { s: "life", v: 30 }, { s: "ias", v: 10 }] }, x: 4, y: 0 }];
  delete p.equip.ring1; delete p.equip.ring2;
  g.events.changed();
});
await page.locator('.mbtn[data-tab="inv"]').tap();
await wait(300);
await tap('[data-src="bag"][data-uid="8101"]');
await wait(200);
const mt = await ev(() => ({ name: document.querySelector(".idetail .iname.q-magic")?.textContent, mods: document.querySelectorAll(".idetail .mod").length, cmp: document.querySelector(".idetail .cmp")?.textContent, box: !!document.querySelector('[data-uid="8101"].q-magic') }));
check("Magic tooltip: blue name, affix lines, compare vs equipped", !!mt.name && / Axe|Axe /.test(mt.name) && mt.mods >= 2 && /vs /.test(mt.cmp ?? "") && mt.box, JSON.stringify(mt));
await page.screenshot({ path: `${outDir}/magic-tooltip.png` });
// full comparison: wear a sword with mana leech / life leech / resist; look at the magic axe (lacks them)
{
  await ev(() => {
    const g = __ec.game;
    const p = g.player;
    const sw = __ec.items.makeItem("sword", 14);
    Object.assign(sw, { uid: 8150, q: "magic", name: "Vampiric Sword of the Leech", mods: [{ s: "ml", v: 4 }, { s: "ll", v: 5 }, { s: "fres", v: 12 }, { s: "skill", v: 1, sk: "bash" }], aff: [] });
    p.equip.main = sw;
    p.equip.off = (() => { const sh = __ec.items.makeItem("shield", 12); sh.uid = 8151; return sh; })();
    g.events.changed();
    __ec.ui.refresh();
  });
  await ev(() => { __ec.ui.sel = null; __ec.ui.refresh(); });
  await tap('[data-src="bag"][data-uid="8101"]');
  await wait(200);
  const cmp = await ev(() => [...document.querySelectorAll(".idetail .cmp")].map((c) => ({ head: c.querySelector(".cmph")?.textContent, downs: [...c.querySelectorAll(".down")].map((x) => x.textContent), ups: [...c.querySelectorAll(".up")].map((x) => x.textContent) })));
  const main = cmp[0] ?? { downs: [] };
  const lost = (re) => main.downs.some((t) => re.test(t));
  check("Compare lists every stat: losses for mana leech, fire resist, +skill; both hands for a one-hander", cmp.length === 2 && lost(/mana leech/) && lost(/fire resist/) && lost(/Bash/) && /off-hand/i.test(cmp[1].head) && cmp[1].downs.some((t) => /defense/.test(t)), JSON.stringify(cmp));
  await page.screenshot({ path: `${outDir}/compare.png` });
}
await tap('[data-src="bag"][data-uid="8102"]');
await wait(200);
const rt = await ev(() => ({ names: [...document.querySelectorAll(".idetail .iname.q-rare")].map((e) => e.textContent), mods: document.querySelectorAll(".idetail .mod").length, lvl: /Item level 16/.test(document.querySelector(".idetail .itype")?.textContent ?? "") }));
check("Rare tooltip: yellow two-word name over the class, 3+ affixes, item level", rt.names.length === 2 && rt.names[1] === "Helm" && rt.mods >= 4 && rt.lvl, JSON.stringify(rt));
await page.screenshot({ path: `${outDir}/rare-tooltip.png` });
// equip a rare ring and check the stats actually change
const st0 = await ev(() => { const d = __ec.game.derived(); return { str: d.stats.str, hp: d.maxHp, swing: d.swing }; });
await tap('[data-src="bag"][data-uid="8103"]');
await wait(150);
await tap('[data-act="equip"]');
await wait(200);
const st1 = await ev(() => { const d = __ec.game.derived(); return { str: d.stats.str, hp: d.maxHp, swing: d.swing, ring: __ec.game.player.equip.ring1?.uid }; });
check("Equipping a rare ring raises Strength, Life and attack speed", st1.ring === 8103 && st1.str === st0.str + 15 && st1.hp === st0.hp + 30 && st1.swing < st0.swing, `${JSON.stringify(st0)} → ${JSON.stringify(st1)}`);
await ev(() => __ec.ui.open("char"));
await wait(200);
const charMod = await ev(() => /\+15/.test(document.querySelector(".sval.mod")?.textContent ?? ""));
check("Character panel shows gear-boosted totals", charMod);
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
  g.player.equip.off = __ec.items.enchant({ uid: 7001, baseId: "sword", ilvl: 9 }, "rare");
  localStorage.setItem("ember-crypt-save-v1", JSON.stringify(g.toSave()));
});
await page.goto(`${base}?debug`);
await wait(1200);
const reloaded = await ev(() => ({ off: __ec.game.player.equip.off?.baseId, q: __ec.game.player.equip.off?.q, mods: __ec.game.player.equip.off?.mods?.length, town: __ec.game.inTown, bag: __ec.game.player.bag.length }));
check("A saved game reloads (in camp, gear kept)", reloaded.off === "sword" && reloaded.q === "rare" && reloaded.mods > 2 && reloaded.town, JSON.stringify(reloaded));

// ---------------------------------------------------------------- 14b. tap targets in every panel
{
  // simulate iPhone landscape safe areas (notch side + home indicator)
  await ev(() => { const s = document.documentElement.style; s.setProperty("--sal", "59px"); s.setProperty("--sar", "59px"); s.setProperty("--sab", "21px"); });
  await wait(100);
  const panels = ["char", "inv", "skills", "settings"];
  let small = [];
  let misses = [];
  for (const tab of panels) {
    // open with a real tap on the HUD button; the lifting finger must not hit what appears under it
    await tap(`.mbtn[data-tab="${tab}"]`);
    await wait(250);
    if ((await ev(() => __ec.ui.openTab)) !== tab) misses.push(`open ${tab}`);
    const rects = await ev(() => [...document.querySelectorAll("#panel .ptab, #panel .pclose")].map((e) => { const r = e.getBoundingClientRect(); return { t: e.dataset.tab ?? "X", x: r.x, y: r.y, w: r.width, h: r.height }; }));
    for (const r of rects) if (r.w < 44 || r.h < 44) small.push(`${tab}/${r.t} ${r.w.toFixed(0)}x${r.h.toFixed(0)}`);
    // the X stays clear of the notch inset
    const X = rects.find((r) => r.t === "X");
    if (X.x + X.w > 852 - 59) misses.push(`X under notch (${X.x + X.w})`);
    for (const r of rects) {
      // corners, edges and a near miss just above the bar
      const pts = [[3, 3], [r.w - 3, 3], [3, r.h - 3], [r.w - 3, r.h - 3], [r.w / 2, -5]];
      for (const [dx, dy] of pts) {
        await ev((t) => { if (__ec.ui.openTab !== t) { __ec.ui.close(); __ec.ui.open(t); } }, tab);
        await wait(80);
        await tapAt({ x: r.x + dx, y: r.y + dy }, 9);
        const now = await ev(() => __ec.ui.openTab);
        const want = r.t === "X" ? null : r.t;
        if (now !== want) misses.push(`${tab}: ${r.t} @${dx.toFixed(0)},${dy.toFixed(0)} → ${now}`);
      }
    }
    // a slightly sloppy tap (finger drifts 14px) still counts
    await ev((t) => { __ec.ui.close(); __ec.ui.open(t); }, tab);
    await wait(80);
    const sk = rects.find((r) => r.t === "skills");
    await touch("touchStart", [{ x: sk.x + sk.w / 2, y: sk.y + sk.h / 2, id: 9 }]);
    await touch("touchMove", [{ x: sk.x + sk.w / 2 + 12, y: sk.y + sk.h / 2 + 7, id: 9 }]);
    await wait(40);
    await touch("touchEnd", []);
    await wait(120);
    if ((await ev(() => __ec.ui.openTab)) !== "skills") misses.push(`${tab}: drifting tap on Skills`);
    // panels block the game: a left-side touch doesn't grab the joystick
    await touch("touchStart", [{ x: 150, y: 300, id: 10 }]);
    await wait(60);
    const joy = await ev(() => __ec.input.joyId);
    await touch("touchEnd", []);
    await wait(60);
    if (joy !== null) misses.push(`${tab}: joystick grabbed under panel`);
    await ev(() => __ec.ui.close());
    await wait(100);
  }
  // tapping the dim backdrop far from any button closes the panel
  await tap('.mbtn[data-tab="settings"]');
  await wait(200);
  await tapAt({ x: 20, y: 380 });
  if ((await ev(() => __ec.ui.openTab)) !== null) misses.push("backdrop tap didn't close");
  // shop and waypoint panels too
  await ev(() => __ec.ui.open("shop"));
  await wait(150);
  const sx = await ev(() => { const r = document.querySelector("#panel .pclose").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await tapAt({ x: sx.x + sx.w - 3, y: sx.y + 3 });
  if ((await ev(() => __ec.ui.openTab)) !== null) misses.push("shop X corner");
  check("Every tab and X is at least 44x44", small.length === 0, small.join(", "));
  check("Taps on tab/X edges, near misses and drifting taps all land (with iPhone safe areas)", misses.length === 0, misses.slice(0, 8).join(" | "));
  await ev(() => { const s = document.documentElement.style; s.removeProperty("--sal"); s.removeProperty("--sar"); s.removeProperty("--sab"); });
}

// settings panel screenshot
await tap('.mbtn[data-tab="settings"]');
await wait(250);
await page.screenshot({ path: `${outDir}/settings.png` });
await ev(() => __ec.ui.close());

// ---------------------------------------------------------------- 14c. Return to Town + portal back
{
  await ev(() => __ec.game.goDungeon(1));
  await wait(400);
  const hud = await ev(() => { const b = document.getElementById("btn-town"); const r = b.getBoundingClientRect(); return { shown: !b.hidden, w: r.width, h: r.height }; });
  check("Town button shows in the crypt HUD (44pt+ hit area)", hud.shown && hud.h >= 40, JSON.stringify(hud));
  // walk somewhere, then recall while a monster is hitting us
  const spot = await ev(() => {
    const g = __ec.game; const p = g.player;
    const alive = g.monsters.filter((m) => m.state !== "dead" && m.def.kind !== "boss");
    alive.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const m = alive[0];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!g.blocked(m.x + dx, m.y + dy, p.r)) { p.x = m.x + dx; p.y = m.y + dy; break; }
    p.hp = g.derived().maxHp;
    return { x: p.x, y: p.y, n: g.monsters.length, floor: g.floor, dead: g.monsters.filter((q) => q.state === "dead").length };
  });
  await wait(300);
  await page.screenshot({ path: `${outDir}/hud-town-button.png` });
  await tap("#btn-town");
  await wait(500);
  const mid = await ev(() => {
    const g = __ec.game;
    const m = g.monsters.find((q) => q.state !== "dead");
    const hp0 = g.player.hp;
    m.ar = 9999; m.mlvl = 500; m.dmgMin = 2; m.dmgMax = 3;
    for (let i = 0; i < 3; i++) g["monsterHit"](m, g.derived());
    return { recall: !!g.recall, hit: g.player.hp < hp0, hp0, hp: g.player.hp, act: g.player.action, t: g.time, en: __ec.input.enabled };
  });
  await page.screenshot({ path: `${outDir}/return-to-town.png` });
  await wait(1100);
  const town = await ev(() => ({ town: __ec.game.inTown, portal: __ec.game.portal?.floor, ctx: __ec.game.contextAction(), r: __ec.game.recall, dead: __ec.game.player.dead, toast: document.getElementById("toast").textContent, joy: __ec.input.joyId, tab: __ec.ui.openTab, hidden: document.hidden, portrait: document.body.classList.contains("portrait"), time: __ec.game.time, hp: __ec.game.player.hp }));
  check("Return to Town: monster hits don't interrupt it, and you arrive in camp", mid.recall && mid.hit && town.town && town.portal === spot.floor, JSON.stringify({ mid, town, e: errors.slice(0, 3) }));
  // walk to the portal and take it back
  await ev(() => { const g = __ec.game; g.player.x = g.portal.x + 0.6; g.player.y = g.portal.y + 0.6; });
  await wait(300);
  await page.screenshot({ path: `${outDir}/camp-portal.png` });
  const lbl = await ev(() => document.getElementById("btn-ctx").textContent);
  await tap("#btn-ctx");
  await wait(400);
  const back = await ev(() => { const g = __ec.game; const p = g.player; return { town: g.inTown, floor: g.floor, x: p.x, y: p.y, n: g.monsters.length, portal: !!g.portal }; });
  check("Camp portal takes you back to the same spot and level", /Portal/.test(lbl) && !back.town && back.floor === spot.floor && Math.hypot(back.x - spot.x, back.y - spot.y) < 0.6 && back.n === spot.n && !back.portal, JSON.stringify({ lbl, back, spot }));
  // walking cancels it
  await tap("#btn-town");
  await wait(200);
  await touch("touchStart", [{ x: 200, y: 250, id: 1 }]);
  for (let i = 1; i <= 6; i++) { await touch("touchMove", [{ x: 200 + i * 8, y: 250, id: 1 }]); await wait(30); }
  await touch("touchEnd", []);
  await wait(1300);
  check("Walking cancels Return to Town", await ev(() => !__ec.game.inTown && !__ec.game.recall));
  // the menu has it too
  await ev(() => __ec.ui.open("settings"));
  await wait(150);
  await tap('[data-act="recall"]');
  await wait(1600);
  check("Return to Town is also in the Settings menu", await ev(() => __ec.game.inTown));
  // nothing ever needs identifying
  check("Items never need identifying", await ev(() => { const it = __ec.items.rollDrop(10, 0, true); return !("identified" in it) && it.mods?.length > 0; }));
}

// ---------------------------------------------------------------- 14d. Item Guide (compendium)
{
  await tap('.mbtn[data-tab="settings"]');
  await wait(200);
  await tap('[data-act="tab"][data-tab="guide"].gbtn');
  await wait(200);
  const g0 = await ev(() => ({ tab: __ec.ui.openTab, cards: document.querySelectorAll(".gcard").length, bases: __ec.data.ITEM_BASES.length, names: [...document.querySelectorAll(".gcard b")].map((b) => b.textContent) }));
  check("Settings opens the Item Guide, listing every item class from the game data", g0.tab === "guide" && g0.cards === g0.bases && ["Sword", "Axe", "Mace", "Great Sword", "Armor", "Helm", "Shield", "Gloves", "Boots", "Belt", "Ring", "Amulet"].every((n) => g0.names.includes(n)), JSON.stringify(g0));
  await page.screenshot({ path: `${outDir}/guide.png` });
  // scroll the list with a finger
  const gb = await page.locator(".gbody").boundingBox();
  await touch("touchStart", [{ x: gb.x + gb.width / 2, y: gb.y + gb.height - 20, id: 4 }]);
  for (let i = 1; i <= 8; i++) { await touch("touchMove", [{ x: gb.x + gb.width / 2, y: gb.y + gb.height - 20 - i * 25, id: 4 }]); await wait(16); }
  await touch("touchEnd", []);
  await wait(300);
  const scrolled = await ev(() => document.querySelector(".gbody").scrollTop);
  check("Guide scrolls with a finger", scrolled > 40, `(scrollTop ${scrolled})`);
  const secs = {};
  for (const sec of ["levels", "affixes", "rarity", "monsters", "skills"]) {
    await tap(`[data-act="gsec"][data-sec="${sec}"]`);
    await wait(120);
    secs[sec] = await ev(() => ({ on: document.querySelector(".gbody")?.dataset.sec, rows: document.querySelectorAll(".gbody tr").length }));
    if (sec === "affixes") await page.screenshot({ path: `${outDir}/guide-affixes.png` });
  }
  const tiers = await ev(() => __ec.data.AFFIXES.reduce((a, x) => a + x.tiers.length, 0) + __ec.data.AFFIXES.length);
  const navBig = await ev(() => [...document.querySelectorAll(".gsec")].every((b) => b.getBoundingClientRect().height >= 44));
  check("Guide sections: levels, affixes (every tier), rarity, monsters, skills", Object.entries(secs).every(([k, v]) => v.on === k && v.rows > 3) && secs.affixes.rows === tiers && navBig, JSON.stringify({ secs, tiers, navBig }));
  await ev(() => __ec.ui.close());
}

// ---------------------------------------------------------------- 14e. saves: last-saved time, export → import, auto potions
{
  await ev(() => { __ec.game.player.gold = 4242; __ec.game.events.changed(); });
  await wait(700);
  await tap('.mbtn[data-tab="settings"]');
  await wait(200);
  const ls = await ev(() => document.getElementById("lastsaved")?.textContent ?? "");
  check("Settings shows the last-saved time", /\d:\d\d/.test(ls), `("${ls}")`);
  await page.screenshot({ path: `${outDir}/settings-save.png` });
  const code = await ev(() => __ec.ui["hooks"].save.exportCode());
  await ev(() => { __ec.game.player.gold = 1; });
  await tap('[data-act="imp-open"]');
  await wait(150);
  await page.locator("#impcode").fill(code);
  await tap('[data-act="imp-go"]');
  await wait(150);
  const ask = await ev(() => document.querySelector(".savemsg")?.textContent ?? "");
  await tap('[data-act="imp-yes"]');
  await wait(300);
  const imp = await ev(() => ({ gold: __ec.game.player.gold, baks: __ec.ui["hooks"].save.backups().length }));
  check("Export a save code, then import it (current hero goes to backups)", /Replace your level/.test(ask) && imp.gold === 4242 && imp.baks >= 1, JSON.stringify({ ask: ask.slice(0, 60), imp }));
  // auto health potion
  await ev(() => __ec.ui.close());
  await ev(() => __ec.game.goDungeon(1));
  await wait(300);
  const ah = await ev(async () => {
    const g = __ec.game;
    for (const m of g.monsters) { m.x += 60; m.y += 60; }
    g.player.hpPots = 2;
    g.player.healLeft = 0;
    g.player.hp = g.derived().maxHp * 0.08;
    await new Promise((r) => setTimeout(r, 400));
    return { pots: g.player.hpPots, on: __ec.settings.autoHp };
  });
  check("Auto health potion (on by default) drinks one at 10% life", ah.on && ah.pots === 1, JSON.stringify(ah));
  await ev(() => __ec.game.goTown());
}

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
  check("Old v0.1 saves convert to the grid bag, new slots and item classes", mig.main === "sword" && mig.off === "shield" && mig.chest === "armor" && mig.lvl === 7 && mig.bag >= 6 && mig.gold >= 100 && /grid/.test(mig.toast), JSON.stringify(mig));
  check("No page errors after migration", errs2.length === 0, errs2.join(" | "));
  await p2.close();
  await ctx2.close();
}

// ---------------------------------------------------------------- 16b. damaged save → backup
{
  const ctx3 = await browser.newContext(ctxOpts);
  await ctx3.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    const good = { v: 3, seed: 77, floor: 2, maxFloor: 4, savedAt: Date.now() - 600000,
      player: { level: 14, xp: 30000, base: { str: 60, dex: 30, vit: 50, ene: 10 }, statPoints: 0, skillPoints: 0, skills: { bash: 3 }, slots: ["bash", null, null],
        bag: [], equip: { main: { uid: 1, baseId: "axe", ilvl: 10 } }, gold: 999, hpPots: 1, mpPots: 1, kills: 300 } };
    localStorage.setItem("ember-crypt-save-v1", '{"v":3,"seed":77,"player":{"lev');
    localStorage.setItem("ember-crypt-save-bak1", JSON.stringify(good));
  });
  const p4 = await ctx3.newPage();
  const errs4 = [];
  p4.on("pageerror", (e) => errs4.push(e.message));
  await p4.goto(`${base}?debug`);
  await p4.waitForTimeout(1500);
  const rec = await p4.evaluate(() => ({ lvl: __ec.game.player.level, gold: __ec.game.player.gold, toast: document.getElementById("toast").textContent, damaged: !!localStorage.getItem("ember-crypt-save-damaged") }));
  check("A damaged save falls back to the backup (and keeps the damaged copy)", rec.lvl === 14 && rec.gold === 999 && /damaged/.test(rec.toast) && rec.damaged && errs4.length === 0, JSON.stringify({ rec, errs4 }));
  await p4.close();
  await ctx3.close();
}

// ---------------------------------------------------------------- 16c. move a v0.3 save from Safari to the Home Screen app
{
  const v03 = { v: 3, seed: 5, floor: 5, maxFloor: 6,
    player: { level: 18, xp: 60000, base: { str: 80, dex: 40, vit: 60, ene: 15 }, statPoints: 0, skillPoints: 3, skills: { bash: 5, double_swing: 4, frenzy: 3 },
      slots: ["bash", "double_swing", "frenzy"], gold: 4321, hpPots: 4, mpPots: 4, kills: 900,
      equip: { main: { uid: 1, baseId: "axe", ilvl: 14, q: "rare", name: "Doom Bite", mods: [{ s: "edmg", v: 40 }, { s: "ll", v: 5 }, { s: "str", v: 8 }], aff: ["p:edmg", "s:ll", "s:str"] } },
      bag: [{ item: { uid: 3, baseId: "sword", ilvl: 9 }, x: 0, y: 0 }] } };
  // "Safari": has the v0.3 save
  const cA = await browser.newContext(ctxOpts);
  await cA.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(base).origin });
  await cA.addInitScript((d) => { if (!sessionStorage.getItem("s")) { sessionStorage.setItem("s", "1"); localStorage.setItem("ember-crypt-save-v1", JSON.stringify(d)); localStorage.setItem("ember-crypt-settings-v1", '{"tutorialSeen":true}'); } }, v03);
  const pA = await cA.newPage();
  await pA.goto(`${base}?debug`);
  await pA.waitForTimeout(1200);
  const bx = async (pg, sel) => { const b = await pg.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  await pA.locator('.mbtn[data-tab="settings"]').tap();
  await pA.waitForTimeout(200);
  await pA.locator('[data-act="exp-copy"]').tap();
  await pA.waitForTimeout(300);
  const code = await pA.evaluate(async () => { try { return await navigator.clipboard.readText(); } catch { return document.getElementById("expcode")?.value ?? ""; } });
  const msgA = await pA.evaluate(() => document.querySelector(".savemsg")?.textContent ?? "");
  await pA.close(); await cA.close();
  // "Home Screen app": separate, empty storage
  const cB = await browser.newContext(ctxOpts);
  await cB.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(base).origin });
  const pB = await cB.newPage();
  await pB.goto(`${base}?debug`);
  await pB.waitForTimeout(1200);
  await pB.evaluate((c) => navigator.clipboard.writeText(c), code);
  await pB.locator('.mbtn[data-tab="settings"]').tap();
  await pB.waitForTimeout(200);
  await pB.locator('[data-act="imp-open"]').tap();
  await pB.waitForTimeout(150);
  await pB.locator('[data-act="imp-paste"]').tap();
  await pB.waitForTimeout(300);
  await pB.screenshot({ path: `${outDir}/import-save.png` });
  await pB.locator('[data-act="imp-yes"]').tap();
  await pB.waitForTimeout(400);
  const got = await pB.evaluate(() => ({ lvl: __ec.game.player.level, gold: __ec.game.player.gold, main: __ec.game.player.equip.main?.name, saved: JSON.parse(localStorage.getItem("ember-crypt-save-v1")).player.level }));
  await pB.close(); await cB.close();
  check("A v0.3 save exports as a code (Copy) and imports in a separate app (Paste → Replace)", code.startsWith("EMBERCRYPT1:") && /copied/.test(msgA) && got.lvl === 18 && got.gold === 4321 && got.main === "Doom Bite" && got.saved === 18, JSON.stringify({ len: code.length, msgA, got }));
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
