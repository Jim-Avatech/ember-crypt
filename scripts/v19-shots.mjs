// v1.9 at 852x393 in Chromium and WebKit: the weapon swap button (clear of ⚔ and the 3 skill buttons), W key, cooldown,
// the I / II bag tabs, saving, and the +skill rule on rolled items.
// usage: node scripts/v19-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v19";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };

async function loadHero(page) {
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const s = __ec.game.toSave();
    const mk = __ec.items.makeItem;
    s.player.cls = "amazon"; s.player.name = "Swapper"; s.player.level = 30; s.floor = 1; s.maxFloor = 1;
    s.player.base = { str: 90, dex: 120, vit: 80, ene: 20 };
    s.player.equip = { main: mk("javelin", 25), off: mk("shield", 20), chest: mk("armor", 20) };
    s.player.altSet = { main: __ec.items.enchant(mk("long_bow", 25), "rare"), off: mk("arrows", 1) };
    s.player.bag = [{ item: __ec.items.enchant(mk("spear", 25), "magic"), x: 0, y: 0 }, { item: mk("short_bow", 10), x: 2, y: 0 }];
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  });
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1400);
}
const rect = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width }; }, sel);
const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const sfx = ename === "webkit" ? "-webkit" : "";
  const br = await engine.launch();
  const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: ename === "chromium" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  const ev = (f, a) => page.evaluate(f, a);
  const hands = () => ev(() => { const e = __ec.game.player.equip; return `${e.main?.baseId ?? "-"}/${e.off?.baseId ?? "-"}`; });

  await loadHero(page);
  await ev(() => { __ec.game.goDungeon?.(1); });
  await page.waitForTimeout(600);
  // 1) layout: the swap button clears ⚔, the 3 skill buttons, the potions and the menu; ⚔ and skills sit where they always did
  const R = {};
  for (const id of ["btn-swap", "btn-attack", "btn-s0", "btn-s1", "btn-s2", "btn-hp", "btn-mp"]) R[id] = await rect(page, `#${id}`);
  const W = 852, H = 393;
  const expectAttack = { r: W - 82, b: H - 24, w: 92 }; // CSS: right 82, bottom 24, 92 px (safe-area insets are 0 here)
  C("⚔ and the three skill buttons are where they were (82/24 px from the corner)", Math.abs(R["btn-attack"].r - (W - 82)) < 1 && Math.abs(R["btn-attack"].b - (H - 24)) < 1 && Math.abs(R["btn-s0"].r - (W - 188)) < 1 && Math.abs(R["btn-s1"].b - (H - 96)) < 1 && Math.abs(R["btn-s2"].r - (W - 108)) < 1, JSON.stringify({ a: R["btn-attack"] }));
  const others = ["btn-attack", "btn-s0", "btn-s1", "btn-s2", "btn-hp", "btn-mp"];
  C("the ⇄ swap button overlaps none of ⚔, the skill buttons or the potions", others.every((o) => !overlap(R["btn-swap"], R[o])), JSON.stringify(R["btn-swap"]));
  const menu = await rect(page, ".hud-tr");
  C("and clears the menu row and is on screen", !overlap(R["btn-swap"], menu) && R["btn-swap"].t > 0 && R["btn-swap"].r <= W, JSON.stringify(menu));
  C("button is a thumb-sized 46 px", Math.round(R["btn-swap"].w) === 46, String(R["btn-swap"].w));
  const h0 = await hands();
  await page.screenshot({ path: `${out}/01-hud-swap-button${sfx}.png` });

  // 2) tap swaps; a second tap inside the cooldown does nothing; after it, swaps back
  await page.locator("#btn-swap").click({ force: true });
  await page.waitForTimeout(150);
  const h1 = await hands();
  const lab1 = await ev(() => document.querySelector("#btn-swap b").textContent);
  const cd = await ev(() => document.getElementById("btn-swap").classList.contains("cool"));
  C("tap: hands become the bow set (long_bow + arrows), label II, cooldown dimmed", h0 === "javelin/shield" && h1 === "long_bow/arrows" && lab1 === "II" && cd, `${h0} → ${h1} ${lab1} ${cd}`);
  await page.screenshot({ path: `${out}/02-swapped-bow${sfx}.png` });
  await page.locator("#btn-swap").click({ force: true });
  await page.waitForTimeout(100);
  C("a second tap inside the cooldown does nothing", (await hands()) === "long_bow/arrows");
  await page.waitForTimeout(1100);
  const cdOff = await ev(() => !document.getElementById("btn-swap").classList.contains("cool"));
  await page.keyboard.press("w");
  await page.waitForTimeout(150);
  C("after the cooldown the W key swaps back (label I)", cdOff && (await hands()) === "javelin/shield" && (await ev(() => document.querySelector("#btn-swap b").textContent)) === "I", await hands());

  // 3) the bag: I / II tabs
  await page.waitForTimeout(1100);
  await ev(() => __ec.ui.open("inv"));
  await page.waitForTimeout(400);
  const tabs = await ev(() => [...document.querySelectorAll(".wset")].map((b) => `${b.textContent}${b.classList.contains("on") ? "*" : ""}${b.classList.contains("act") ? "+" : ""}`).join(","));
  C("bag shows I and II tabs, I shown and in use", /^I.*\*.*\+.*,II/.test(tabs.replace(/ ●/g, "")) || tabs.startsWith("I*+"), tabs);
  await page.screenshot({ path: `${out}/03-bag-set-I${sfx}.png` });
  await page.locator('.wset[data-set="1"]').click({ force: true });
  await page.waitForTimeout(300);
  const dollMain = await ev(() => document.querySelector('.slot[data-slot="main"] img')?.getAttribute("alt"));
  const real = await hands();
  C("tab II shows the bow set in the hands slots; the real hands are unchanged", dollMain === "Long Bow" && real === "javelin/shield", `${dollMain} ${real}`);
  await page.screenshot({ path: `${out}/04-bag-set-II${sfx}.png` });
  // equip a bag item into set II (tap it, then its equip button)
  const uid = await ev(() => __ec.game.player.bag.find((e) => e.item.baseId === "short_bow").item.uid);
  await page.locator(`[data-src="bag"][data-uid="${uid}"]`).click({ force: true });
  await page.waitForTimeout(250);
  await page.locator('[data-act="equip"]').first().click({ force: true });
  await page.waitForTimeout(300);
  const st = await ev(() => { const g = __ec.game, p = g.player; return { real: `${p.equip.main?.baseId}/${p.equip.off?.baseId}`, alt: `${p.altSet?.main?.baseId}/${p.altSet?.off?.baseId}`, viewing: g.viewing, bagHasLong: p.bag.some((e) => e.item.baseId === "long_bow") }; });
  C("equipping from the bag on tab II changes set II only (old bow back in the bag)", st.real === "javelin/shield" && st.alt === "short_bow/arrows" && !st.viewing && st.bagHasLong, JSON.stringify(st));
  await page.locator('.wset[data-set="0"]').click({ force: true });
  await page.waitForTimeout(300);
  const back = await ev(() => document.querySelector('.slot[data-slot="main"] img')?.getAttribute("alt"));
  C("tab I shows the javelin again", back === "Javelin", String(back));
  await ev(() => __ec.ui.close());

  // 4) saved with the hero
  await page.waitForTimeout(1200);
  await page.locator("#btn-swap").click({ force: true });
  await page.waitForTimeout(300);
  await ev(() => __ec.game.events.changed());
  await page.waitForTimeout(2500);
  const sv = await ev(() => { const s = JSON.parse(JSON.stringify(__ec.game.toSave())); return `${s.player.equip.main.baseId}|${s.player.altSet.main.baseId}|${s.player.weaponSet}`; });
  C("the save holds both sets and the active one", sv === "short_bow|javelin|1", sv);
  await page.reload();
  await page.waitForTimeout(1500);
  C("after reload the hero is on set II with the bow, and the button says II", (await hands()) === "short_bow/arrows" && (await ev(() => document.querySelector("#btn-swap b").textContent)) === "II", await hands());

  // 5) the +skill rule on a rolled javelin
  const bad = await ev(() => {
    let n = 0, tab = 0;
    for (let i = 0; i < 400; i++) {
      const it = __ec.items.enchant(__ec.items.makeItem("javelin", 70), "rare", Math.random, "amazon");
      for (const m of it.mods ?? []) if (m.s === "tabsk") { tab++; if (m.sk !== "javelin") n++; }
    }
    return { n, tab };
  });
  C("400 rare javelins: every '+to <tree>' is Javelin & Spear", bad.n === 0 && bad.tab > 0, JSON.stringify(bad));
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
console.log(`${checks.filter(Boolean).length}/${checks.length} checks passed`);
process.exit(checks.every(Boolean) ? 0 : 1);
