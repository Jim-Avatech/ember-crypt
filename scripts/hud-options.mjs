// HUD layout mockups: the current HUD and options A/B/C (?hud=a|b|c) at 852x393 with iPhone 15 Pro landscape
// safe-area insets, in a boss fight, with see-through thumbs on the joystick (left) and the attack button (right).
// Checks: attack + skill buttons are pixel-identical to today's, the left thumb covers no life display,
// and the boss bar doesn't hit any HUD box. usage: node scripts/hud-options.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/hud-options";
mkdirSync(out, { recursive: true });
const ins = { l: 59, r: 59, t: 0, b: 21 };
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const modes = [["now", "", "Today: life orb under the thumb"], ["a", "a", "A · orbs in the top corners"], ["b", "b", "B · vitals strip, top centre"], ["c", "c", "C · life & mana ring under the hero"]];
const b = await chromium.launch();
let baseline = null;
for (const [tag, hud, caption] of modes) {
  for (const hpPct of [0.62, 0.24]) {
    const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(`${base}?debug&new&seed=4${hud ? `&hud=${hud}` : ""}`);
    await page.waitForTimeout(900);
    await page.evaluate(({ s, hpPct }) => {
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
      Object.assign(bo, { x: p.x + 1.6, y: p.y - 0.6, state: "chase", dmgMin: 0, dmgMax: 0, atkT: 99 });
      bo.def = { ...bo.def, speed: 0 };
      bo.hp = bo.maxHp * 0.7;
      for (const m of g.monsters) if (m !== bo) { m.dmgMin = 0; m.dmgMax = 0; }
      const d = g.derived();
      p.hp = d.maxHp * hpPct; p.mana = d.maxMana * 0.55; p.regenHold = 99;
      // joystick held (drawn) where a resting left thumb lands
      __ec.settings.showJoystick = true;
      const inp = __ec.ui.input;
      inp.joyId = 99; inp.ox = inp.jx = s.l + 115; inp.oy = inp.jy = 393 - s.b - 100;
      g.events.changed();
    }, { s: ins, hpPct });
    await page.waitForTimeout(700);
    // keep life where we set it (no regen drift) right before the shot
    await page.evaluate((hpPct) => { const g = __ec.game; g.player.hp = g.derived().maxHp * hpPct; g.events.changed(); }, hpPct);
    await page.waitForTimeout(250);
    const r = await page.evaluate(({ s, caption }) => {
      // see-through thumbs: an ellipse whose tip is on the touch point, body running off toward the corner
      const thumbs = [
        { x: s.l + 115, y: 393 - s.b - 100, rot: 40 },
        { x: 852 - s.r - 128, y: 393 - s.b - 70, rot: -40 },
      ];
      const W = 78, H = 190;
      for (const t of thumbs) {
        const e = document.createElement("div");
        e.className = "mock-thumb";
        Object.assign(e.style, { position: "fixed", left: `${t.x - W / 2}px`, top: `${t.y - 34}px`, width: `${W}px`, height: `${H}px`, borderRadius: "40px 40px 34px 34px", transformOrigin: `${W / 2}px 34px`, transform: `rotate(${t.rot}deg)`, background: "rgba(236,196,168,.45)", border: "1.5px solid rgba(255,240,225,.7)", zIndex: 9000, pointerEvents: "none" });
        document.body.appendChild(e);
      }
      // mockup clean-up: no level-entry toast, no Waypoint button (we're standing at the entrance)
      const st = document.createElement("style");
      st.textContent = "#toast{display:none!important} #btn-ctx{display:none!important}";
      document.head.appendChild(st);
      const cap = document.createElement("div");
      cap.textContent = caption;
      Object.assign(cap.style, { position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: `${s.b + 14}px`, font: "600 12px system-ui", color: "#fff", background: "rgba(0,0,0,.6)", padding: "3px 9px", borderRadius: "10px", zIndex: 9001, pointerEvents: "none", whiteSpace: "nowrap" });
      document.body.appendChild(cap);
      // which life displays does the left thumb cover? sample each one's box inside the rotated ellipse
      const inThumb = (px, py) => thumbs.slice(0, 1).some((t) => {
        const a = (-t.rot * Math.PI) / 180, dx = px - t.x, dy = py - t.y;
        const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a) + 34; // into the thumb's own frame
        const cy = H / 2;
        return (lx / (W / 2)) ** 2 + ((ly - cy) / (H / 2)) ** 2 <= 1;
      });
      const rect = (el) => { if (!el || !el.offsetParent && getComputedStyle(el).position !== "fixed") return null; const q = el.getBoundingClientRect(); return q.width > 0 ? q : null; };
      const lifeEls = [document.querySelector(".globe.life"), document.querySelector("#vitals .life")].map(rect).filter(Boolean);
      const rd = __ec.renderer, p = __ec.game.player;
      if (document.documentElement.dataset.hud === "c") { const x = rd.cx(p.x, p.y), y = rd.cy(p.x, p.y); lifeEls.push({ left: x - 16 * rd.ascale, right: x + 16 * rd.ascale + 30, top: y, bottom: y + 9 * rd.ascale }); }
      let covered = 0, total = 0;
      for (const q of lifeEls) for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) { total++; if (inThumb(q.left + ((q.right - q.left) * i) / 8, q.top + ((q.bottom - q.top) * j) / 8)) covered++; }
      const btns = ["#btn-attack", "#btn-s0", "#btn-s1", "#btn-s2"].map((sel) => { const q = document.querySelector(sel).getBoundingClientRect(); return [sel, Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)].join(":"); });
      const bar = rd.lastBossBar;
      const boxes = [...document.querySelectorAll("#hud .hud-tr .mbtn, #buffs .buff, #minimap, #vitals, #xpbar, .globe")].map((e) => [e, e.getBoundingClientRect()]).filter(([, q]) => q.width > 0);
      const hits = bar ? boxes.filter(([, q]) => bar.x < q.right && bar.x + bar.w > q.left && bar.y < q.bottom && bar.y + bar.h > q.top).map(([e]) => e.id || e.className) : ["no boss bar"];
      const vq = document.querySelector("#vitals").getBoundingClientRect();
      const vh = vq.width ? [...document.querySelectorAll("#hud .hud-tr .mbtn, #buffs .buff, #minimap, .globe")].filter((e) => { const q = e.getBoundingClientRect(); return q.width && vq.left < q.right && vq.right > q.left && vq.top < q.bottom && vq.bottom > q.top; }).map((e) => e.className) : [];
      const gq = [...document.querySelectorAll(".globe")].map((e) => e.getBoundingClientRect()).filter((q) => q.width);
      const gh = gq.length ? [...document.querySelectorAll("#hud .hud-tr .mbtn, #buffs .buff, #minimap, .pbtn")].filter((e) => { const q = e.getBoundingClientRect(); return q.width && gq.some((g) => g.left < q.right && g.right > q.left && g.top < q.bottom && g.bottom > q.top); }).map((e) => e.className) : [];
      return { covered, total, lifeEls: lifeEls.length, btns, hits, bar, overlaps: [...vh, ...gh] };
    }, { s: ins, caption });
    await page.waitForTimeout(150);
    const file = `${out}/hud-${tag}${hpPct < 0.35 ? "-lowlife" : ""}.png`;
    await page.screenshot({ path: file });
    const lbl = `${tag}${hpPct < 0.35 ? " low life" : ""}`;
    if (!baseline) baseline = r.btns;
    check(`${lbl}: attack + 3 skill buttons exactly where they are today`, JSON.stringify(r.btns) === JSON.stringify(baseline), r.btns.join(" "));
    if (tag === "now") console.log(`INFO now: left thumb covers ${r.covered}/${r.total} sample points of the life orb`);
    else check(`${lbl}: left thumb covers none of the life display`, r.lifeEls > 0 && r.covered === 0, `${r.covered}/${r.total}`);
    check(`${lbl}: boss bar clear of the HUD`, r.hits.length === 0, JSON.stringify({ bar: r.bar, hits: r.hits }));
    check(`${lbl}: life/mana displays overlap no other HUD control`, r.overlaps.length === 0, JSON.stringify(r.overlaps));
    check(`${lbl}: no page errors`, errs.length === 0, errs.join(" | "));
    console.log("shot", file);
    await ctx.close();
  }
}
await b.close();
const ok = checks.every(Boolean);
console.log(ok ? `hud-options: PASS (${checks.length})` : "hud-options: FAIL");
process.exit(ok ? 0 : 1);
