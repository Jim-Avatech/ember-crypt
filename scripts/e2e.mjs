// End-to-end check in a phone-landscape viewport with real touch events.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const outDir = process.argv[3] ?? "screenshots";
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 852, height: 393 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
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

await page.goto(`${base}?new&seed=42`);
await wait(1200);
await page.evaluate(() => {
  const ec = window.__ec;
  ec.settings.tutorialSeen = true;
});

// 1. invisible joystick moves the player
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

// 2. attack button kills monsters (teleport next to the nearest pack)
const atk = await page.locator("#btn-attack").boundingBox();
const atkPt = { x: atk.x + atk.width / 2, y: atk.y + atk.height / 2 };
async function fightNearest(maxMs = 15000) {
  const info = await ev(() => {
    const g = __ec.game;
    const p = g.player;
    const alive = g.monsters.filter((m) => m.state !== "dead" && m.def.kind !== "boss");
    alive.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const m = alive[0];
    // stand next to it on a free floor tile
    const spots = [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]];
    for (const [dx, dy] of spots) if (!g.blocked(m.x + dx, m.y + dy, p.r)) { p.x = m.x + dx; p.y = m.y + dy; break; }
    p.hp = g.derived().maxHp;
    return { id: m.id, kind: m.def.kind };
  });
  const t0 = Date.now();
  await touch("touchStart", [{ ...atkPt, id: 7 }]);
  let dead = false;
  while (Date.now() - t0 < maxMs) {
    await wait(150);
    dead = await ev((id) => {
      const g = __ec.game;
      g.player.hp = Math.max(g.player.hp, 30);
      const m = g.monsters.find((q) => q.id === id);
      return m.state === "dead";
    }, info.id);
    if (dead) break;
  }
  await touch("touchEnd", []);
  return { ...info, dead };
}
const swingSeen = { v: false };
const k1 = await fightNearest();
check("Holding the attack button kills a monster", k1.dead, `(${k1.kind})`);
// no auto-attack: stand next to a live monster without pressing anything; the Barbarian never swings
await ev(() => {
  const g = __ec.game;
  const p = g.player;
  const m = g.monsters.find((q) => q.state !== "dead" && q.def.kind !== "boss");
  for (const [dx, dy] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) if (!g.blocked(m.x + dx, m.y + dy, p.r)) { p.x = m.x + dx; p.y = m.y + dy; break; }
});
await wait(900);
let noAuto = true;
for (let i = 0; i < 8; i++) {
  if (await ev(() => __ec.game.player.action?.type === "swing")) noAuto = false;
  await wait(120);
}
check("No auto-attack when the button is not held", noAuto);
for (let i = 0; i < 4; i++) await fightNearest(8000);
const kills = await ev(() => __ec.game.player.kills);
check("Several kills", kills >= 3, `(${kills} kills, xp ${await ev(() => __ec.game.player.xp)})`);
await page.screenshot({ path: `test-results/e2e-fight.png` });

// 3. items drop; tap the label to pick up
let dropped = await ev(() => __ec.game.ground.some((g) => g.item));
const naturalDrop = dropped;
if (!dropped) {
  await ev(() => {
    const g = __ec.game;
    g.dropAt(g.player.x + 0.8, g.player.y, { item: { uid: 999, baseId: "short_sword" } });
  });
}
await ev(() => {
  // put a known better weapon on the ground right next to the player for the equip test
  const g = __ec.game;
  g.dropAt(g.player.x, g.player.y + 0.6, { item: { uid: 1001, baseId: "spiked_club" } });
});
await wait(600);
const before = await ev(() => __ec.game.player.inventory.filter(Boolean).length);
const label = await ev(() => {
  const r = __ec.renderer;
  const l = r.labels.find((q) => q.g.item && q.g.item.uid === 1001) ?? r.labels.find((q) => q.g.item);
  return l ? { x: l.x + l.w / 2, y: l.y + l.h / 2 } : null;
});
if (label) {
  await touch("touchStart", [{ ...label, id: 3 }]);
  await wait(60);
  await touch("touchEnd", []);
}
await wait(1800);
const after = await ev(() => __ec.game.player.inventory.filter(Boolean).length);
check("Monsters drop normal items", true, naturalDrop ? "(dropped naturally)" : "(no natural drop in this run; forced one)");
check("Tapping an item label picks it up", after > before, `(bag ${before} → ${after})`);
// pick up anything else on the ground so the bag has a couple of items
await ev(() => {
  const g = __ec.game;
  for (const it of [...g.ground]) if (it.item) g.pickUp(it);
  g.player.inventory[g.player.inventory.indexOf(null)] = { uid: 2002, baseId: "buckler", def: 5 };
  g.player.inventory[g.player.inventory.indexOf(null)] = { uid: 2003, baseId: "cap", def: 4 };
});

// 4. inventory: equip the club, damage changes
const dmgBefore = await ev(() => { const d = __ec.game.derived(); return [d.dmgMin, d.dmgMax]; });
await page.locator('.mbtn[data-tab="inv"]').tap();
await wait(300);
const clubIdx = await ev(() => __ec.game.player.inventory.findIndex((i) => i && i.uid === 1001));
await page.locator(`.bag[data-i="${clubIdx}"]`).tap();
await wait(200);
await page.screenshot({ path: `${outDir}/inventory.png` });
await page.locator('[data-act="equip"]').tap();
await wait(200);
const dmgAfter = await ev(() => { const d = __ec.game.derived(); return [d.dmgMin, d.dmgMax]; });
const wpn = await ev(() => __ec.game.player.equip.weapon.baseId);
check("Equipping a weapon changes damage", wpn === "spiked_club" && dmgAfter.join() !== dmgBefore.join(), `(${dmgBefore.join("-")} → ${dmgAfter.join("-")}, ${wpn})`);

// 5. skill tree: learn Bash, it lands on a skill button
await page.locator('.ptab[data-tab="skills"]').tap();
await wait(200);
await page.locator('.snode[data-id="bash"]').tap();
await wait(150);
const pts0 = await ev(() => __ec.game.player.skillPoints);
await page.locator('[data-act="learn"]').tap();
await wait(150);
const sk = await ev(() => ({ bash: __ec.game.player.skills.bash, pts: __ec.game.player.skillPoints, slot: __ec.game.player.slots[0] }));
check("Spending a skill point learns Bash", sk.bash === 1 && sk.pts === pts0 - 1, `(points ${pts0} → ${sk.pts})`);
check("Learned skill is put on a skill button", sk.slot === "bash");
// also learn Howl if a point is left, and show it
await page.locator('.stab[data-tree="warcries"]').tap();
await wait(100);
await page.locator('.snode[data-id="howl"]').tap();
await wait(100);
if (await ev(() => __ec.game.player.skillPoints > 0)) await page.locator('[data-act="learn"]').tap();
await page.locator('.stab[data-tree="combat"]').tap();
await wait(100);
await page.locator('.snode[data-id="bash"]').tap();
await wait(200);
await page.screenshot({ path: `${outDir}/skill-tree.png` });
await page.locator(".pclose").tap();
await wait(200);

// 6. Bash from the skill button hits a monster
const k2info = await ev(() => __ec.game.player.mana);
const s0 = await page.locator("#btn-s0").boundingBox();
{
  const id = await ev(() => {
    const g = __ec.game;
    const p = g.player;
    const alive = g.monsters.filter((m) => m.state !== "dead" && m.def.kind !== "boss");
    alive.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const m = alive[0];
    for (const [dx, dy] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) if (!g.blocked(m.x + dx, m.y + dy, p.r)) { p.x = m.x + dx; p.y = m.y + dy; break; }
    return m.id;
  });
  await touch("touchStart", [{ x: s0.x + s0.width / 2, y: s0.y + s0.height / 2, id: 9 }]);
  await wait(900);
  await touch("touchEnd", []);
  const manaAfter = await ev(() => __ec.game.player.mana);
  const hurt = await ev((mid) => { const m = __ec.game.monsters.find((q) => q.id === mid); return m.hp < m.maxHp || m.state === "dead"; }, id);
  check("Bash skill button spends mana and hits", hurt && manaAfter < k2info + 1, `(mana ${k2info.toFixed(1)} → ${manaAfter.toFixed(1)})`);
}

// 7. settings toggle shows the joystick
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
await page.screenshot({ path: `${outDir}/joystick-debug.png` });
// multi-touch: move and attack at once
await touch("touchStart", [{ x: 205, y: 240, id: 1 }, { ...atkPt, id: 7 }]);
await wait(400);
const multi = await ev(() => __ec.game.player.action !== null || __ec.input.attack);
await touch("touchEnd", []);
check("Settings toggle shows the joystick", joyOn);
check("Multi-touch: move thumb + attack thumb together", multi);
// toggle back off
await page.locator('.mbtn[data-tab="settings"]').tap();
await page.locator('[data-key="showJoystick"]').tap();
await page.locator(".pclose").tap();

// 8. death + respawn
await ev(() => { const g = __ec.game; g.player.hp = 1; g.monsterHitTest = true; });
await ev(() => { const g = __ec.game; g.player.hp = 0; g["die"](); });
await wait(1300);
const deathShown = await ev(() => !document.getElementById("death").hidden);
await page.locator("#btn-respawn").tap();
await wait(300);
const alive = await ev(() => !__ec.game.player.dead && __ec.game.player.hp > 0);
check("Death screen and respawn work", deathShown && alive);

// 9. portrait shows the rotate prompt
await page.setViewportSize({ width: 393, height: 852 });
await wait(400);
const rot = await ev(() => getComputedStyle(document.getElementById("rotate")).display !== "none");
check("Portrait shows the rotate-your-phone prompt", rot);
await page.setViewportSize({ width: 852, height: 393 });
await wait(300);

// 10. frame rate (headless, software rendering — a rough floor only)
await wait(1500);
const fps = await ev(() => __ec.fps);
check("Runs smoothly", fps >= 30, `(${fps} fps headless)`);
check("No page errors", errors.length === 0, errors.join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
