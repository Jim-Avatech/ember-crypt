// v0.9.4 HUD: life/mana ring under the hero, low-life heartbeat (red edge pulse + sound).
// 852x393 with iPhone 15 Pro landscape insets, boss fight, see-through thumbs on the joystick and attack button.
// usage: node scripts/v094-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots";
mkdirSync(out, { recursive: true });
const ins = { l: 59, r: 59, t: 0, b: 21 };
// v0.9.3 positions with these insets: never move
const BTNS = ["#btn-attack:619:256:92:92", "#btn-s0:545:296:60:60", "#btn-s1:557:216:60:60", "#btn-s2:625:176:60:60"];
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const W = 78, H = 190;
const thumbs = [{ x: ins.l + 115, y: 393 - ins.b - 100, rot: 40 }, { x: 852 - ins.r - 128, y: 393 - ins.b - 70, rot: -40 }];
async function setup(page, hpPct, monsterRight) {
  await page.evaluate(({ s, hpPct, monsterRight }) => {
    const r = document.documentElement.style;
    r.setProperty("--sal", `${s.l}px`); r.setProperty("--sar", `${s.r}px`); r.setProperty("--sat", `${s.t}px`); r.setProperty("--sab", `${s.b}px`);
    __ec.settings.tutorialSeen = true;
    __ec.ui.showTutorial(false);
    const g = __ec.game, p = g.player;
    g.goDungeon(5);
    p.level = 20; p.base.vit = 60;
    p.skills = { bash: 3, double_swing: 2, frenzy: 3, leap: 1 };
    p.slots = ["frenzy", "double_swing", "leap"];
    p.buffs.bo = 30; p.frenzy.stacks = 2; p.frenzy.t = 9;
    p.hpPots = 6; p.mpPots = 4;
    const bo = g.boss;
    // the boss stands just right of the hero (where the life number would go) when monsterRight
    Object.assign(bo, monsterRight ? { x: p.x + 0.9, y: p.y - 0.9 } : { x: p.x + 1.6, y: p.y - 0.6 }, { state: "chase", dmgMin: 0, dmgMax: 0, atkT: 99 });
    bo.def = { ...bo.def, speed: 0 };
    bo.hp = bo.maxHp * 0.7;
    for (const m of g.monsters) { m.dmgMin = 0; m.dmgMax = 0; }
    p.hp = g.derived().maxHp * hpPct; p.mana = g.derived().maxMana * 0.55;
    g.events.changed();
  }, { s: ins, hpPct, monsterRight });
  await page.waitForTimeout(700);
  await page.evaluate((hpPct) => { const g = __ec.game; g.player.hp = g.derived().maxHp * hpPct; g.events.changed(); }, hpPct);
  await page.waitForTimeout(200);
}
async function overlay(page, caption) {
  await page.evaluate(({ thumbs, W, H, caption, b }) => {
    for (const t of thumbs) {
      const e = document.createElement("div");
      Object.assign(e.style, { position: "fixed", left: `${t.x - W / 2}px`, top: `${t.y - 34}px`, width: `${W}px`, height: `${H}px`, borderRadius: "40px 40px 34px 34px", transformOrigin: `${W / 2}px 34px`, transform: `rotate(${t.rot}deg)`, background: "rgba(236,196,168,.45)", border: "1.5px solid rgba(255,240,225,.7)", zIndex: 9000, pointerEvents: "none" });
      document.body.appendChild(e);
    }
    const st = document.createElement("style");
    st.textContent = "#toast{display:none!important} #btn-ctx{display:none!important}";
    document.head.appendChild(st);
    const cap = document.createElement("div");
    cap.textContent = caption;
    Object.assign(cap.style, { position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: `${b + 14}px`, font: "600 12px system-ui", color: "#fff", background: "rgba(0,0,0,.6)", padding: "3px 9px", borderRadius: "10px", zIndex: 9001, pointerEvents: "none" });
    document.body.appendChild(cap);
  }, { thumbs, W, H, caption, b: ins.b });
}
const inLeftThumb = (px, py) => {
  const t = thumbs[0], a = (-t.rot * Math.PI) / 180, dx = px - t.x, dy = py - t.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a) + 34;
  return (lx / (W / 2)) ** 2 + ((ly - H / 2) / (H / 2)) ** 2 <= 1;
};
for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const br = await engine.launch();
  for (const [tag, hpPct, monsterRight] of [["normal", 0.62, false], ["lowlife", 0.24, false], ["crowded", 0.62, true]]) {
    if (ename === "webkit" && tag === "crowded") continue;
    const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: engine === chromium });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(`${base}?debug&new&seed=4`);
    await page.waitForTimeout(900);
    await page.evaluate(() => { window.__beats = 0; const s = __ec.sfx, o = s.play.bind(s); s.play = (n) => { if (n === "heartbeat") window.__beats++; return o(n); }; });
    await setup(page, hpPct, monsterRight);
    const lbl = `${ename} ${tag}`;
    const r = await page.evaluate(() => {
      const btns = ["#btn-attack", "#btn-s0", "#btn-s1", "#btn-s2"].map((sel) => { const q = document.querySelector(sel).getBoundingClientRect(); return [sel, Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)].join(":"); });
      const rd = __ec.renderer, g = __ec.game;
      const bar = rd.lastBossBar;
      const boxes = [...document.querySelectorAll("#hud .hud-tr .mbtn, #buffs .buff, #minimap, #xpbar, .pbtn")].map((e) => [e, e.getBoundingClientRect()]).filter(([, q]) => q.width > 0);
      const hits = bar ? boxes.filter(([, q]) => bar.x < q.right && bar.x + bar.w > q.left && bar.y < q.bottom && bar.y + bar.h > q.top).map(([e]) => e.id || e.className) : ["no boss bar"];
      const bo = g.boss, as = rd.ascale, mx = rd.cx(bo.x, bo.y), my = rd.cy(bo.x, bo.y);
      const body = { l: mx - 12 * as, r: mx + 12 * as, t: my - 38 * as, b: my + 4 * as };
      const xp = document.querySelector("#xpbar").getBoundingClientRect();
      const globeVis = [...document.querySelectorAll(".globe")].some((e) => e.getBoundingClientRect().width > 2);
      return { btns, hits, bar, ring: rd.lastRing, body, xp: { l: xp.left, r: xp.right, t: xp.top, b: xp.bottom }, globeVis, ver: document.body.innerHTML.includes("v0.9.4") };
    });
    check(`${lbl}: attack + 3 skill buttons exactly where they were`, JSON.stringify(r.btns) === JSON.stringify(BTNS), r.btns.join(" "));
    check(`${lbl}: ring drawn`, !!r.ring, JSON.stringify(r.ring));
    if (r.ring) {
      const q = r.ring, pts = [];
      for (let i = 0; i <= 12; i++) pts.push([q.x - q.rx * 1.3 + (q.rx * 2.6 * i) / 12, q.y + q.ry * 1.3], [q.x - q.rx * 1.3 + (q.rx * 2.6 * i) / 12, q.y]);
      for (const c of [[q.num.l, q.num.t], [q.num.r, q.num.b], [q.num.l, q.num.b], [q.num.r, q.num.t]]) pts.push(c);
      check(`${lbl}: left thumb covers no part of the ring or life number`, pts.every(([x, y]) => !inLeftThumb(x, y)));
      check(`${lbl}: ring + number fully on screen`, q.x - q.rx * 1.3 >= 0 && q.x + q.rx * 1.3 <= 852 && q.y + q.ry * 1.3 <= 393 && q.num.l >= 0 && q.num.r <= 852 && q.num.b <= 393);
      const n = q.num, m = r.body;
      check(`${lbl}: life number clear of the boss`, !(n.l < m.r && n.r > m.l && n.t < m.b && n.b > m.t), JSON.stringify({ num: n, boss: m }));
    }
    check(`${lbl}: no thumb over the XP bar`, [[r.xp.l, r.xp.t], [r.xp.l, r.xp.b]].every(([x, y]) => !inLeftThumb(x, y)), JSON.stringify(r.xp));
    check(`${lbl}: old orbs gone from view`, !r.globeVis);
    check(`${lbl}: boss bar clear of the HUD`, r.hits.length === 0, JSON.stringify({ bar: r.bar, hits: r.hits }));
    // heartbeat: only at low life, about once a second, and silent with sound off
    const b0 = await page.evaluate(() => window.__beats);
    await page.waitForTimeout(2600);
    const b1 = await page.evaluate(() => window.__beats);
    if (tag === "lowlife") check(`${lbl}: heartbeat plays at low life`, b1 - b0 >= 2 && b1 - b0 <= 4, `${b1 - b0} beats in 2.6s`);
    else check(`${lbl}: no heartbeat above 35% life`, b1 - b0 === 0, `${b1 - b0}`);
    await overlay(page, tag === "lowlife" ? "v0.9.4 · low life: red pulse + heartbeat" : tag === "crowded" ? "v0.9.4 · number moves away from the boss" : "v0.9.4 · life & mana ring under the hero");
    await page.waitForTimeout(150);
    const file = `${out}/v094-hud-${tag}${ename === "webkit" ? "-webkit" : ""}.png`;
    await page.screenshot({ path: file });
    console.log("shot", file);
    check(`${lbl}: no page errors`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await br.close();
}
const ok = checks.every(Boolean);
console.log(ok ? `v094-shots: PASS (${checks.length})` : "v094-shots: FAIL");
process.exit(ok ? 0 : 1);
