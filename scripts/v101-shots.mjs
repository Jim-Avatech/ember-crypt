// v1.0.1 at 852x393 in Chromium and WebKit: delete hero (typed-name confirm), 12 slots with a scrolling list,
// patch notes in Settings (touch scroll), a boss following the hero out through a doorway, a level kept after
// a waypoint trip, bigger ammo stacks.
// usage: node scripts/v101-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v101";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };

async function swipe(page, sel, dy) {
  // a real touch drag (Chromium: CDP touch events; WebKit: no CDP, so wheel as a stand-in)
  const box = await page.locator(sel).first().boundingBox();
  const x = box.x + box.width / 2;
  const top = Math.max(box.y, 60), bot = Math.min(box.y + box.height, 380);
  const y0 = dy > 0 ? bot - 10 : top + 10;
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 - (dy * i) / 10 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    return "touch";
  } catch {
    await page.mouse.move(x, y0);
    await page.mouse.wheel(0, dy);
    return "wheel";
  }
}

for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const sfx = ename === "webkit" ? "-webkit" : "";
  const br = await engine.launch();
  const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: ename === "chromium" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const shot = (name) => page.screenshot({ path: `${out}/${name}${sfx}.png` });
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);

  // three heroes + a shared stash
  await page.goto(`${base}?debug&new&seed=4`);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const g = __ec.game, mk = __ec.items.makeItem;
    const make = (cls, name, level) => {
      const s = g.toSave();
      s.player.cls = cls; s.player.name = name; s.player.level = level; s.savedAt = Date.now() - level * 1000;
      if (cls === "amazon") s.player.equip = { main: mk("long_bow", level), off: mk("arrows", 1), chest: mk("armor", level) };
      return JSON.stringify(s);
    };
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1", make("barbarian", "Conan", 41));
    localStorage.setItem("ember-crypt-save-v1#2", make("amazon", "Hippolyta", 23));
    localStorage.setItem("ember-crypt-save-v1-bak1#2".replace("-v1-bak1", "-bak1"), make("amazon", "Hippolyta", 22));
    localStorage.setItem("ember-crypt-save-v1#3", make("amazon", "Ilsa", 12));
    localStorage.setItem("ember-crypt-stash-shared", JSON.stringify({ v: g.toSave().v, at: Date.now() - 5, items: [{ item: mk("great_sword", 30), x: 0, y: 0 }] }));
    localStorage.setItem("ember-crypt-last-slot", "1");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  });
  await page.goto(`${base}?debug&select`);
  await page.waitForTimeout(1000);
  const keysBefore = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => !k.endsWith("#2") && k !== "ember-crypt-last-slot" && k !== "ember-crypt-deleted-heroes" && k !== "ember-crypt-last-deleted-hero").map((k) => [k, localStorage.getItem(k)])));
  const names0 = await page.evaluate(() => [...document.querySelectorAll("#heroes .hcard:not(.new) .hinfo b")].map((b) => b.textContent));
  const l0 = await page.evaluate(() => ({ cards: document.querySelectorAll("#heroes .hrow").length, dels: document.querySelectorAll("#heroes .hdelb").length, count: document.querySelector(".hcount")?.textContent }));
  C("hero list: 3 heroes, each with a delete button, 3/12", l0.cards === 3 && l0.dels === 3 && l0.count === "3/12", JSON.stringify(l0));
  await page.locator('#heroes .hdelb[data-slot="2"]').tap();
  await page.waitForTimeout(250);
  const d0 = await page.evaluate(() => ({ title: document.querySelector(".hdel .htitle")?.textContent, disabled: document.querySelector('[data-hact="del-yes"]')?.disabled }));
  await page.fill("#hero-del-name", "Hippo");
  const d1 = await page.evaluate(() => document.querySelector('[data-hact="del-yes"]').disabled);
  await page.fill("#hero-del-name", "hippolyta");
  const d2 = await page.evaluate(() => document.querySelector('[data-hact="del-yes"]').disabled);
  C("delete asks first: Delete is off until the hero's name is typed", d0.title === "Delete hero?" && d0.disabled && d1 && !d2, JSON.stringify({ d0, d1, d2 }));
  await page.locator("#hero-del-name").blur();
  await page.waitForTimeout(150);
  await shot("01-delete-hero-confirm");
  // Keep hero = nothing happens
  await page.locator('[data-hact="del-no"]').tap();
  await page.waitForTimeout(150);
  C("Keep hero cancels", await page.evaluate(() => document.querySelectorAll("#heroes .hrow").length === 3 && !!localStorage.getItem("ember-crypt-save-v1#2")));
  await page.locator('#heroes .hdelb[data-slot="2"]').tap();
  await page.fill("#hero-del-name", "Hippolyta");
  await page.locator('[data-hact="del-yes"]').tap();
  await page.waitForTimeout(400);
  const after = await page.evaluate((before) => {
    const names = [...document.querySelectorAll("#heroes .hcard:not(.new) .hinfo b")].map((b) => b.textContent);
    const slot2 = Object.keys(localStorage).filter((k) => k.endsWith("#2"));
    const changed = Object.entries(before).filter(([k, v]) => k !== "ember-crypt-stash-shared" && localStorage.getItem(k) !== v).map(([k]) => k);
    const stash = JSON.parse(localStorage.getItem("ember-crypt-stash-shared")).items.map((e) => e.item.baseId);
    return { names, slot2, changed, stash, open: !document.getElementById("heroes").hidden };
  }, keysBefore);
  C("deleted: slot 2 keys gone; the other two heroes and the shared stash untouched", after.names.join() === names0.filter((n) => n !== "Hippolyta").join() && after.slot2.length === 0 && after.changed.length === 0 && after.stash.join() === "great_sword" && after.open, JSON.stringify(after));
  await shot("02-after-delete");

  // fill all 12 slots: list scrolls, New hero is off
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("ember-crypt-save-v1#3"));
    for (let n = 2; n <= 12; n++) if (n !== 3) localStorage.setItem(`ember-crypt-save-v1#${n}`, JSON.stringify({ ...s, player: { ...s.player, name: `Hero ${n}`, cls: n % 2 ? "amazon" : "barbarian", level: n } }));
  });
  await page.goto(`${base}?debug&select`);
  await page.waitForTimeout(1200);
  const t0 = await page.evaluate(() => {
    const box = document.querySelector("#heroes .hbox");
    return { n: document.querySelectorAll("#heroes .hrow").length, count: document.querySelector(".hcount")?.textContent, newOff: document.querySelector("#heroes .hcard.new").disabled, scrollable: box.scrollHeight > box.clientHeight + 10, top: box.scrollTop };
  });
  await shot("03-twelve-heroes");
  const how = await swipe(page, "#heroes .hrow", 220);
  await page.waitForTimeout(500);
  const t1 = await page.evaluate(() => document.querySelector("#heroes .hbox").scrollTop);
  C(`12 heroes: 12/12, New hero off, list scrolls (${how})`, t0.n === 12 && t0.count === "12/12" && t0.newOff && t0.scrollable && t1 > t0.top, JSON.stringify({ ...t0, after: t1 }));
  await shot("04-twelve-heroes-scrolled");

  // play Conan; patch notes in Settings
  await page.locator('#heroes .hcard[data-slot="1"]').tap();
  await page.waitForTimeout(800);
  await page.addStyleTag({ content: "#toast{display:none!important}" });
  await page.locator('.mbtn[data-tab="settings"]').tap();
  await page.waitForTimeout(400);
  const ver = await page.evaluate(() => document.querySelector(".help .ver")?.textContent);
  await page.locator('[data-act="notes"]').tap();
  await page.waitForTimeout(900);
  const pn = await page.evaluate(() => {
    const body = document.querySelector(".pbody");
    const box = document.getElementById("patchnotes");
    const vs = [...box.querySelectorAll(".pnv")].map((e) => e.firstChild.textContent.trim());
    return { vs, top: body.scrollTop, visible: box.getBoundingClientRect().top < 393 };
  });
  // v1.3.2: the newest entries are now v1.3.2, v1.3.1, v1.3, v1.2.2, v1.2.1 (then v1.2)
  C("Settings: patch notes, newest first (v1.3.2, v1.3.1, v1.3, v1.2.2, v1.2.1, v1.2 … v0.8.1), version label v1.3.2", /v1\.3\.2 /.test(ver) && pn.vs.slice(0, 6).join() === "v1.3.2,v1.3.1,v1.3,v1.2.2,v1.2.1,v1.2" && pn.vs.at(-1) === "v0.8.1" && pn.vs.length >= 10 && pn.top > 0 && pn.visible, JSON.stringify({ ver, ...pn }));
  await shot("05-patch-notes");
  const s0 = await page.evaluate(() => document.querySelector(".pbody").scrollTop);
  const how2 = await swipe(page, "#patchnotes", -200);
  await page.waitForTimeout(500);
  const s1 = await page.evaluate(() => document.querySelector(".pbody").scrollTop);
  C(`patch notes scroll by touch (${how2})`, s1 < s0, `${s0} → ${s1}`);
  await shot("06-patch-notes-scrolled");
  await page.locator("#panel .close, #panel [data-act=close]").first().tap().catch(() => page.evaluate(() => __ec.ui.close()));
  await page.evaluate(() => __ec.ui.close());

  // a boss follows the hero out of its room
  const boss = await page.evaluate(async () => {
    const g = __ec.game, p = g.player;
    let best = null;
    for (const floor of [4, 3, 2, 6, 7, 8]) {
      g.goDungeon(floor);
      const L = g.level, b = g.boss, R = L.bossRoom;
      // a corridor tile just outside the boss room, 6-8 steps from the boss
      const W = L.w, D = new Int32Array(W * L.h).fill(-1), q = [];
      const fl = (x, y) => x >= 0 && y >= 0 && x < W && y < L.h && L.tiles[y * W + x] === 1;
      const s = Math.floor(b.x) + Math.floor(b.y) * W; D[s] = 0; q.push(s);
      while (q.length) { const c = q.shift(), cx = c % W, cy = (c / W) | 0; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = cx + dx, ny = cy + dy, ni = nx + ny * W; if (fl(nx, ny) && D[ni] < 0) { D[ni] = D[c] + 1; q.push(ni); } } }
      for (let i = 0; i < D.length && !best; i++) {
        const x = i % W, y = (i / W) | 0;
        const out = x < R.x - 2 || x > R.x + R.w + 1 || y < R.y - 2 || y > R.y + R.h + 1;
        if (out && D[i] >= 8 && D[i] <= 11) best = { floor, x: x + 0.5, y: y + 0.5, room: R };
      }
      if (best) break;
    }
    if (!best) return null;
    g.monsters = g.monsters.filter((m) => m === g.boss);
    p.x = best.x; p.y = best.y;
    p.level = 70; p.hp = 1e6;
    window.__keep = setInterval(() => { p.hp = Math.max(p.hp, 5000); p.dead = false; }, 50);
    g.aggroPack(g.boss);
    return best;
  });
  let saw = null;
  for (let i = 0; i < 80 && boss; i++) {
    await page.waitForTimeout(100);
    saw = await page.evaluate((R) => {
      const g = __ec.game, b = g.boss, p = g.player;
      const outRoom = b.x < R.x - 0.3 || b.x > R.x + R.w + 0.3 || b.y < R.y - 0.3 || b.y > R.y + R.h + 0.3;
      return { outRoom, d: Math.hypot(b.x - p.x, b.y - p.y), state: b.state };
    }, boss.room);
    if (saw.outRoom && saw.d < 3.2) break;
  }
  await shot("07-boss-through-doorway");
  C("a boss leaves its room and comes to the hero in the corridor", !!boss && saw?.outRoom && saw.d < 3.2, JSON.stringify({ boss: boss && { floor: boss.floor }, saw }));

  // the level is kept after a waypoint trip
  const kept = await page.evaluate(() => {
    clearInterval(window.__keep);
    const g = __ec.game;
    const f = g.floor;
    g.kill(g.boss);
    const dead = g.monsters.filter((m) => m.state === "dead").length;
    g.travel(0);
    g.travel(f);
    const r1 = { boss: g.boss.state, dead: g.monsters.filter((m) => m.state === "dead").length, stairs: !!g.stairs };
    // pretend 5 minutes passed
    g.travel(0);
    const t = Date.now();
    g.now = () => t + 5 * 60 * 1000 + 1;
    g.travel(f);
    const r2 = { boss: g.boss.state, stairs: !!g.stairs };
    g.now = () => Date.now();
    return { dead, r1, r2 };
  });
  C("waypoint out and back: boss still dead, stairs open; after 5 min the level is fresh", kept.r1.boss === "dead" && kept.r1.dead === kept.dead && kept.r1.stairs && kept.r2.boss !== "dead" && !kept.r2.stairs, JSON.stringify(kept));

  const st = await page.evaluate(() => ["arrows", "javelin", "throwing_axe", "throwing_knife"].map((id) => __ec.items.makeItem(id, 1).qty).join(","));
  C("stacks: arrows 1200, javelins 200, axes 240, knives 320", st === "1200,200,240,320", st);
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const ok = checks.filter(Boolean).length;
console.log(`${ok}/${checks.length} passed`);
process.exit(ok === checks.length ? 0 : 1);
