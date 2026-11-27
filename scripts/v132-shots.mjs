// v1.3.2 at 852x393 in Chromium and WebKit: the Amazon's off-hand refuses a second weapon (compare sheet, disabled
// Off-hand button, drag onto the off-hand slot), an old save's off-hand weapon is moved to the bag with a note, and the
// Barbarian still dual wields.
// usage: node scripts/v132-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v132";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const LIFT = 26; // ui.ts DRAG_LIFT
/** a hero in slot 2; `prep` edits the save (runs in the page) */
const seed = async (page, cls, prep) => {
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate(([cls, prep]) => {
    const s = __ec.game.toSave();
    const mk = __ec.items.makeItem;
    s.player.cls = cls; s.player.name = cls === "amazon" ? "Ilsa" : "Grom"; s.player.level = 30;
    s.player.base.str = 200; s.player.base.dex = 200; s.player.skills = cls === "amazon" ? { jab: 1 } : { bash: 1 };
    s.player.bag = []; s.player.equip = { chest: mk("armor", 5) };
    new Function("s", "mk", prep)(s, mk);
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  }, [cls, prep]);
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1400);
};
for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const sfx = ename === "webkit" ? "-webkit" : "";
  const br = await engine.launch();
  const errs = [];
  let ctx = null;
  let page = null;
  const fresh = async () => {
    if (ctx) await ctx.close();
    ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2 });
    page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(e.message));
  };
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  const ev = (fn, a) => page.evaluate(fn, a);
  const center = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const drag = async (from, to) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12); await page.waitForTimeout(20); }
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(250);
  };
  const openBag = async () => { await page.locator('.mbtn[data-tab="inv"]').click(); await page.waitForTimeout(400); };

  // ---- 1. Amazon: javelin + buckler, a sword in the bag: the compare sheet's off-hand card says why
  await fresh();
  await seed(page, "amazon", `s.player.equip.main = mk("javelin", 5); s.player.equip.off = mk("shield", 5); const w = mk("sword", 6); w.uid = 9101; s.player.bag = [{ item: w, x: 0, y: 0 }];`);
  C("hero is an Amazon with a javelin and a buckler", await ev(() => __ec.game.player.cls === "amazon" && __ec.game.player.equip.off?.baseId === "shield"));
  await openBag();
  await page.locator('[data-src="bag"][data-uid="9101"]').first().click();
  await page.waitForTimeout(400);
  const sh = await ev(() => ({
    cards: [...document.querySelectorAll(".cmpsheet .ccard .chead")].map((e) => e.textContent),
    no: document.querySelector(".cmpsheet .offno, .cmpsheet .offnol") ? "red note" : "",
    red: /Main hand only|Can't go in the off-hand/.test(document.querySelector(".cmpsheet")?.textContent ?? ""),
    off: (() => { const b = [...document.querySelectorAll(".cmpsheet .ibtns button")].find((x) => x.textContent.trim() === "Off-hand"); return b ? { disabled: b.disabled, title: b.title } : null; })(),
    main: !![...document.querySelectorAll(".cmpsheet .ibtns button")].find((x) => x.textContent.trim() === "Main hand" && !x.disabled),
    tip: document.querySelector(".cmpsheet .selc .offnol")?.textContent ?? "",
    dual: /can dual wield/.test(document.querySelector(".cmpsheet .selc")?.textContent ?? ""),
  }));
  // v1.5: no off-hand card, no Off-hand button and no red "Main hand only" note for an Amazon (the block stays)
  C("v1.5 compare sheet: main hand card only, no off-hand card, no red note", !sh.cards.some((c) => /Off-hand/i.test(c)) && sh.cards.some((c) => /Main hand/i.test(c)) && !sh.no && !sh.red, JSON.stringify(sh));
  C("v1.5 no Off-hand button; Main hand works", sh.off === null && sh.main, JSON.stringify(sh.off));
  C("v1.5 the sword's card has no 'Main hand only' and no 'can dual wield'", !sh.tip && !sh.dual, sh.tip);
  await page.screenshot({ path: `${out}/01-amazon-offhand-blocked${sfx}.png` });
  await page.locator('[data-act="cmp-close"]').click();
  await page.waitForTimeout(250);
  // drag the sword onto the off-hand slot: refused with the reason, buckler stays
  const from = await center('[data-src="bag"][data-uid="9101"]');
  const to = await center('.slot[data-slot="off"]');
  await drag(from, { x: to.x, y: to.y + LIFT });
  const dr = await ev(() => ({ off: __ec.game.player.equip.off?.baseId, inBag: !!__ec.game.bagEntry(9101), toast: document.getElementById("toast").textContent, dual: __ec.game.derived().dual }));
  C("dragging the sword onto the off-hand is refused with the reason; the buckler stays", dr.off === "shield" && dr.inBag && /dual wield/.test(dr.toast) && !dr.dual, JSON.stringify(dr));
  await page.screenshot({ path: `${out}/02-amazon-drag-refused${sfx}.png` });
  // Main hand works
  await page.locator('[data-src="bag"][data-uid="9101"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.cmpsheet [data-act="equip"][data-slot="main"]').click();
  await page.waitForTimeout(300);
  const mh = await ev(() => ({ main: __ec.game.player.equip.main?.uid, off: __ec.game.player.equip.off?.baseId, jav: __ec.game.player.bag.some((e) => e.item.baseId === "javelin") }));
  C("Main hand equips it, the javelin goes to the bag, the buckler stays", mh.main === 9101 && mh.off === "shield" && mh.jav, JSON.stringify(mh));
  // Character screen: no dual-wield row
  await page.locator('.mbtn[data-tab="char"]').click().catch(() => {});
  await page.waitForTimeout(300);
  C("Character screen: no 'Dual wielding'", await ev(() => !document.querySelector(".dualtag")));

  // ---- 2. an old save: Amazon with a sword in her off-hand → it's in her bag on load, with a note
  await fresh();
  await seed(page, "amazon", `s.player.equip.main = mk("javelin", 5); const w = mk("sword", 9); w.uid = 9202; w.name = "Zach's Blade"; s.player.equip.off = w;`);
  await page.waitForFunction(() => /dual wield/.test(document.getElementById("toast").textContent), null, { timeout: 6000 }).catch(() => {});
  const mg = await ev(() => ({ off: __ec.game.player.equip.off?.baseId ?? null, inBag: !!__ec.game.bagEntry(9202), toast: document.getElementById("toast").textContent, dual: __ec.game.derived().dual, saved: JSON.parse(localStorage.getItem("ember-crypt-save-v1#2")).player }));
  C("old save: the off-hand sword is moved to the bag, a note says so, and it's saved that way", mg.off === null && mg.inBag && /bag/.test(mg.toast) && /dual wield/.test(mg.toast) && !mg.dual && !mg.saved.equip.off && mg.saved.bag.some((e) => e.item.uid === 9202), JSON.stringify({ ...mg, saved: undefined }));
  await page.screenshot({ path: `${out}/03-migration-note${sfx}.png` });
  // bag full: it goes to the stash
  await fresh();
  await seed(page, "amazon", `s.player.equip.main = mk("javelin", 5); const w = mk("sword", 9); w.uid = 9303; s.player.equip.off = w; const bag = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) { const r = mk("ring", 1); bag.push({ item: r, x, y }); } s.player.bag = bag;`);
  await page.waitForFunction(() => /dual wield/.test(document.getElementById("toast").textContent), null, { timeout: 6000 }).catch(() => {});
  const st = await ev(() => ({ off: __ec.game.player.equip.off?.baseId ?? null, stash: !!__ec.game.stashEntry(9303), toast: document.getElementById("toast").textContent, shared: JSON.stringify(JSON.parse(localStorage.getItem("ember-crypt-stash-shared") ?? "null") ?? {}).includes("9303") }));
  C("bag full: it goes to the camp stash (shared stash saved), with a note", st.off === null && st.stash && st.shared && /stash/.test(st.toast), JSON.stringify(st));

  // ---- 3. Barbarian still dual wields (drag a sword onto the off-hand)
  await fresh();
  await seed(page, "barbarian", `s.player.equip.main = mk("axe", 5); const w = mk("sword", 6); w.uid = 9404; s.player.bag = [{ item: w, x: 0, y: 0 }];`);
  await openBag();
  const f2 = await center('[data-src="bag"][data-uid="9404"]');
  const t2 = await center('.slot[data-slot="off"]');
  await drag(f2, { x: t2.x, y: t2.y + LIFT });
  const bb = await ev(() => ({ off: __ec.game.player.equip.off?.uid, dual: __ec.game.derived().dual }));
  C("Barbarian: dragging a sword onto the off-hand dual wields", bb.off === 9404 && bb.dual, JSON.stringify(bb));
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const ok = checks.filter(Boolean).length;
console.log(`${ok}/${checks.length} passed`);
process.exit(ok === checks.length ? 0 : 1);
