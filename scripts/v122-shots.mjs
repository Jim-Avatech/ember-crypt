// v1.2.2 at 852x393 in Chromium and WebKit: Guided Arrow shot down a hall with no monster in sight acquires one in the
// room while flying and curves into it (the v1.2.1 arrow flew straight into the back wall).
// usage: node scripts/v122-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v122";
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
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const s = __ec.game.toSave();
    s.player.cls = "amazon"; s.player.name = "Ilsa"; s.player.level = 30;
    s.player.base.dex = 200; s.player.base.str = 100;
    s.player.skills = { magic_arrow: 1, guided_arrow: 5 };
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  });
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1200);
  // a 3-wide hall running east (y 29..31) into a room (x 31..35, y 20..40); the monster is in the room's south end,
  // out of the hero's sight and 45° off the aim line
  const setup = await page.evaluate(() => {
    const g = __ec.game;
    const p = g.player;
    p.equip.main = __ec.items.makeItem("long_bow", 10);
    p.equip.off = __ec.items.makeItem("arrows", 1);
    g.goTown(true); g.floorCache.clear(); g.goDungeon(3);
    const L = g.level;
    L.tiles.fill(0);
    for (let y = 29; y <= 31; y++) for (let x = 18; x <= 30; x++) L.tiles[y * L.w + x] = 1;
    for (let y = 20; y <= 40; y++) for (let x = 31; x <= 35; x++) L.tiles[y * L.w + x] = 1;
    L.explored.fill(1);
    const proto = g.monsters.find((q) => q.def.rank === "normal" && !q.name) ?? g.monsters.find((q) => q.def.rank === "normal");
    const m = { ...proto, x: 33.5, y: 36.5, state: "idle", hp: 1e6, maxHp: 1e6, defense: 0 };
    m.def = { ...proto.def, speed: 0, dmgMin: 0, dmgMax: 0 };
    g.monsters = [m];
    for (const k of ["chests", "items", "props", "patches", "projectiles", "minions"]) if (Array.isArray(g[k])) g[k].length = 0;
    p.x = 27.5; p.y = 30.5; p.fx = 1; p.fy = 0; p.mana = 999;
    // hold the game clock so the script steps it frame by frame
    const real = g.update.bind(g);
    window.__step = (dt) => real(dt, { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] });
    g.update = () => {};
    window.__m = m;
    // frame the hall and the room: camera halfway between the hero and the monster (render with dt 0 keeps it there)
    const R = __ec.renderer;
    const orig = R.render.bind(R);
    const cx = (p.x + m.x) / 2, cy = (p.y + m.y) / 2;
    R.render = (gg, _dt, lab) => { R.camX = (cx - cy) * 16; R.camY = (cx + cy) * 8; return orig(gg, 0, lab); };
    // the arrow's trail, drawn over the canvas so the curve shows in one picture
    window.__trail = [];
    window.__drawTrail = () => {
      const cv = document.querySelector("canvas");
      const r = cv.getBoundingClientRect();
      const k = r.width / R.AW;
      const pts = __trail.map(([x, y]) => `${r.left + ((x - y) * 16 + R.ox) * k},${r.top + ((x + y) * 8 + R.oy) * k}`).join(" ");
      let svg = document.getElementById("trail");
      if (!svg) {
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = "trail";
        svg.setAttribute("style", "position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:50");
        document.body.appendChild(svg);
      }
      svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="#ffd34d" stroke-width="2" stroke-dasharray="5 4" opacity="0.9"/>`;
    };
    return { ok: g.castSkill("guided_arrow", g.derived()) };
  });
  C("Guided Arrow cast in the hall", setup.ok === true);
  const path = [];
  let firstHoming = "unset";
  let shot = 0;
  for (let t = 0; t < 120; t++) {
    const st = await page.evaluate(() => {
      __step(1 / 30);
      const q = __ec.game.projectiles.find((x) => x.skill === "guided_arrow");
      if (q) __trail.push([q.x, q.y]);
      return q ? { x: q.x, y: q.y, homing: !!q.homing } : null;
    });
    if (st) {
      if (firstHoming === "unset") firstHoming = st.homing;
      path.push(st);
      const turned = st.x > 31.2 && st.y > 32.4;
      if (turned && shot === 0) {
        await page.waitForTimeout(120);
        await page.evaluate(() => __drawTrail());
        await page.screenshot({ path: `${out}/01-guided-curving${sfx}.png` });
        shot = 1;
      }
    } else if (path.length) break;
  }
  const hp = await page.evaluate(() => __m.hp);
  const end = path.at(-1) ?? {};
  C("no target at release (nothing in sight or in the aim cone)", firstHoming === false, String(firstHoming));
  C("in flight it acquires the monster and curves south into the room", path.some((s) => s.homing) && path.some((s) => s.y > 33), JSON.stringify(end));
  C("it hits the monster, not the back wall", hp < 1e6 && end.x < 35.4, JSON.stringify({ hp, end }));
  C("screenshot taken mid-curve", shot === 1);
  await page.waitForTimeout(150);
  await page.evaluate(() => __drawTrail());
  await page.screenshot({ path: `${out}/02-guided-hit${sfx}.png` });
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const fails = checks.filter((c) => !c).length;
console.log(`${checks.length - fails}/${checks.length} passed`);
process.exit(fails ? 1 : 0);
