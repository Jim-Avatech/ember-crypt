// v1.5 at 852x393 in Chromium and WebKit: act/level above the minimap (no overlap with the HUD or buff bar), DPS for a
// weapon the hero lacks the stats for (bag card, shop, compare), no red Amazon off-hand notes, the coloured Resistances
// row and leech on the Character screen, and the same colours on item cards.
// usage: node scripts/v15-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v15";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const seed = async (page, cls, prep) => {
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate(([cls, prep]) => {
    const s = __ec.game.toSave();
    const mk = __ec.items.makeItem;
    s.player.cls = cls; s.player.name = cls === "amazon" ? "Kara" : "Grom"; s.player.level = 40; s.player.base.str = 120; s.player.base.dex = 100;
    s.player.skills = cls === "amazon" ? { jab: 1 } : { bash: 1, shout: 1, battle_orders: 1 }; s.player.gold = 50000; s.maxFloor = 60;
    new Function("s", "mk", prep)(s, mk);
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  }, [cls, prep]);
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1400);
};
const rgb = (s) => (s.match(/\d+/g) ?? []).slice(0, 3).map(Number);
const isGreen = ([r, g, b]) => g > r + 40 && g > b + 40;
const isYellow = ([r, g, b]) => r > 200 && g > 190 && b < 130;
const isRed = ([r, g, b]) => r > 200 && r > g + 80 && r > b + 60;
const isBlue = ([r, g, b]) => b > 200 && b > r + 60 && b > g + 20;

for (const [engine, ename] of [[chromium, "chromium"], [webkit, "webkit"]]) {
  const sfx = ename === "webkit" ? "-webkit" : "";
  const br = await engine.launch();
  const errs = [];
  let ctx = null, page = null;
  const fresh = async () => {
    if (ctx) await ctx.close();
    ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2 });
    page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(e.message));
  };
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  const ev = (fn, a) => page.evaluate(fn, a);
  const shot = (n) => page.screenshot({ path: `${out}/${n}${sfx}.png` });
  const boxes = () => ev(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const w = document.getElementById("where");
    return { where: r("#where"), map: r("#minimap"), buffs: r("#buffs"), tr: r("#hud .hud-tr"), text: w.textContent, font: parseFloat(getComputedStyle(w).fontSize), vis: getComputedStyle(w).display !== "none", buffN: document.querySelectorAll("#buffs .tbuff").length };
  });
  const overlap = (a, b) => !!a && !!b && a.w > 0 && b.w > 0 && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

  // ---- 1. act and level above the minimap
  await fresh();
  await seed(page, "barbarian", ``);
  let bx = await boxes();
  C("camp: label says Ember Camp", bx.text === "Ember Camp" && bx.vis, JSON.stringify(bx));
  await ev(() => { __ec.game.goDungeon(42); __ec.game.events.changed(); });
  await page.waitForTimeout(900);
  bx = await boxes();
  C("v1.5.1: overall level 42 reads Act 3 · Level 2 (level within the act)", bx.text === "Act 3 · Level 2", bx.text);
  C("top-left, directly above the minimap, readable (≥ 12px)", bx.where.l < 40 && bx.where.t < 80 && bx.where.b <= bx.map.t + 1 && bx.map.t - bx.where.b < 8 && bx.font >= 12, JSON.stringify(bx));
  C("no overlap with the minimap or the menu buttons", !overlap(bx.where, bx.map) && !overlap(bx.where, bx.tr), JSON.stringify(bx));
  await shot("01-act-level-label");
  await ev(() => { const g = __ec.game, p = g.player; p.buffs.shout = 25; p.buffs.bo = 25; p.chillT = 6; g.events.changed(); });
  await page.waitForTimeout(500);
  bx = await boxes();
  C("with the buff bar showing: label below the buffs, above the minimap, no overlap", bx.buffN >= 2 && !overlap(bx.where, bx.buffs) && bx.where.t >= bx.buffs.b - 0.5 && bx.where.b <= bx.map.t + 1 && !overlap(bx.where, bx.map), JSON.stringify(bx));
  await shot("02-act-level-with-buffs");

  // ---- 2. DPS for a bow the Amazon lacks the Dexterity for (80 vs 90 style)
  await fresh();
  await seed(page, "amazon", `const bow = mk("long_bow", 30); bow.uid = 9501; s.player.bag = [{ item: bow, x: 0, y: 0 }]; s.player.equip.main = mk("javelin", 10);`);
  const dps = await ev(() => {
    const g = __ec.game, p = g.player;
    const bow = g.bagEntry(9501).item;
    // just short on Dexterity: 10 below the requirement, Strength comfortably above
    const reqs = (() => { const before = p.base.dex; let lo = 0; for (let d = 1; d < 400; d++) { p.base.dex = d; if (g.meetsReq(bow) || (p.base.str = 500, g.meetsReq(bow))) { lo = d; break; } } p.base.dex = before; p.base.str = 120; return lo; })();
    p.base.str = 300; p.base.dex = reqs - 10; g.events.changed();
    const shown = g.weaponDps(bow).dps;
    // the reference: the hero really at the required Dexterity, Strength unchanged
    p.base.dex = reqs; const ref = g.previewEquip(bow, "main").dps; p.base.dex = reqs - 10;
    const fist = (() => { const s = p.equip.main; delete p.equip.main; const d = g.derived().dps; p.equip.main = s; return d; })();
    const f = (v) => (v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US"));
    return { req: reqs, dex: p.base.dex, shown, ref, fist, txt: f(ref), meets: g.meetsReq(bow) };
  });
  C("hero short 10 Dexterity: the bow can't be used", !dps.meets && dps.dex === dps.req - 10, JSON.stringify(dps));
  C("its DPS is computed at exactly the required Dexterity (not fists)", Math.abs(dps.shown - dps.ref) < 1e-6 && dps.shown > dps.fist * 1.5, JSON.stringify(dps));
  await page.locator('.mbtn[data-tab="inv"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-src="bag"][data-uid="9501"]').first().click();
  await page.waitForTimeout(400);
  const card = await ev(() => ({ dpsl: document.querySelector(".cmpsheet .selc .dpsl")?.textContent ?? "", red: [...document.querySelectorAll(".cmpsheet .selc .bad")].map((e) => e.textContent) }));
  C("bag card: DPS line shows that number; the Dexterity requirement is still red", card.dpsl.includes(dps.txt) && card.red.some((t) => /Dexterity/.test(t)), JSON.stringify({ card, want: dps.txt }));
  await shot("03-dps-missing-stat-bag");
  await page.locator('[data-act="cmp-close"]').click().catch(() => {});
  await page.waitForTimeout(250);
  // the shop: the same bow in Hilde's stock
  await ev(() => {
    const g = __ec.game;
    const e = g.bagEntry(9501);
    g.player.bag = g.player.bag.filter((x) => x !== e);
    g.vendorStock = [{ item: e.item, x: 0, y: 0 }];
    __ec.ui.close?.();
    __ec.ui.open("shop");
  });
  await page.waitForTimeout(400);
  await page.locator('[data-src="vendor"][data-uid="9501"]').first().click();
  await page.waitForTimeout(400);
  const shop = await ev(() => ({ dpsl: document.querySelector(".cmpsheet .selc .dpsl, .idetail .dpsl")?.textContent ?? "", red: [...document.querySelectorAll(".cmpsheet .selc .bad, .idetail .bad")].map((e) => e.textContent) }));
  C("shop card: same DPS, requirement still red", shop.dpsl.includes(dps.txt) && shop.red.some((t) => /Dexterity/.test(t)), JSON.stringify({ shop, want: dps.txt }));
  await shot("04-dps-missing-stat-shop");
  const cmp = await ev(() => { const g = __ec.game; const bow = g.vendorStock[0].item; const row = g.compare(bow, "main").find((r) => r.id === "dps"); return { diff: row?.diff, want: g.weaponDps(bow).dps - g.derived().dps }; });
  C("compare: the DPS difference uses the same just-enough number", cmp.diff !== undefined && Math.abs(cmp.diff - cmp.want) < 0.01, JSON.stringify(cmp));

  // ---- 3. Amazon: no red off-hand notes, the block stays
  await fresh();
  await seed(page, "amazon", `s.player.equip.main = mk("javelin", 5); s.player.equip.off = mk("shield", 5); const w = mk("sword", 6); w.uid = 9601; s.player.bag = [{ item: w, x: 0, y: 0 }];`);
  await page.locator('.mbtn[data-tab="inv"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-src="bag"][data-uid="9601"]').first().click();
  await page.waitForTimeout(400);
  const amz = await ev(() => {
    const sh = document.querySelector(".cmpsheet");
    return { text: sh?.textContent ?? "", heads: [...document.querySelectorAll(".cmpsheet .chead")].map((e) => e.textContent), btns: [...document.querySelectorAll(".cmpsheet .ibtns button")].map((b) => b.textContent.trim()), redEls: document.querySelectorAll(".offno, .offnol").length };
  });
  C("no 'Main hand only' text, no off-hand card or note, no Off-hand button", !/Main hand only|Can't go in the off-hand|don't dual wield/.test(amz.text) && !amz.heads.some((h) => /Off-hand/.test(h)) && !amz.btns.includes("Off-hand") && amz.btns.includes("Main hand") && amz.redEls === 0, JSON.stringify({ ...amz, text: undefined }));
  await shot("05-amazon-no-offhand-note");
  const blocked = await ev(() => { const g = __ec.game; const r = g.equipFromBag(9601, "off"); return { r, off: g.player.equip.off?.baseId }; });
  C("equipping it in her off-hand is still refused (short reason)", /dual wield/.test(blocked.r ?? "") && blocked.off === "shield", JSON.stringify(blocked));

  // ---- 4/5. Character screen: one coloured Resistances row, coloured leech; item cards in the same colours
  await fresh();
  await seed(page, "barbarian", `
    const r1 = mk("ring", 10); r1.q = "magic"; r1.mods = [{ s: "fres", v: 20 }, { s: "ll", v: 5 }]; s.player.equip.ring1 = r1;
    const r2 = mk("ring", 10); r2.q = "magic"; r2.mods = [{ s: "cres", v: 15 }, { s: "ml", v: 4 }]; s.player.equip.ring2 = r2;
    const am = mk("amulet", 10); am.q = "rare"; am.name = "Storm Charm"; am.mods = [{ s: "lres", v: 25 }, { s: "pres", v: 30 }, { s: "ares", v: 5 }, { s: "str", v: 6 }]; s.player.equip.amulet = am;
    const t = mk("ring", 12); t.uid = 9701; t.q = "rare"; t.name = "Grim Loop"; t.mods = [{ s: "pres", v: 12 }, { s: "lres", v: 18 }, { s: "fres", v: 9 }, { s: "cres", v: 11 }]; const t2 = mk("gloves", 12); t2.uid = 9702; t2.q = "magic"; t2.mods = [{ s: "ll", v: 6 }, { s: "ml", v: 3 }];
    s.player.bag = [{ item: t, x: 0, y: 0 }, { item: t2, x: 2, y: 0 }];`);
  await page.locator('.mbtn[data-tab="char"]').click();
  await page.waitForTimeout(500);
  const ch = await ev(() => {
    const row = document.querySelector(".resrow");
    const lab = row?.querySelector("span")?.textContent ?? "";
    const vals = [...(row?.querySelectorAll("b i") ?? [])].map((e) => ({ t: e.textContent, c: getComputedStyle(e).color, cls: e.className }));
    const old = [...document.querySelectorAll(".kv span")].map((e) => e.textContent).filter((t) => /Resist /.test(t));
    const le = [...document.querySelectorAll(".leechrow b i")].map((e) => ({ t: e.textContent, c: getComputedStyle(e).color, cls: e.className }));
    const d = __ec.game.derived();
    return { lab, vals, old, le, res: d.res, ll: d.ll, ml: d.ml };
  });
  const [vp, vl, vf, vc] = ch.vals;
  C("one row labelled Resistances, no separate resist lines", ch.lab === "Resistances" && ch.vals.length === 4 && ch.old.length === 0, JSON.stringify(ch));
  C("values in order poison, lightning, fire, cold with the hero's numbers", vp?.t === `${ch.res.poison}%` && vl?.t === `${ch.res.light}%` && vf?.t === `${ch.res.fire}%` && vc?.t === `${ch.res.cold}%`, JSON.stringify(ch.vals));
  C("colours: green poison, yellow lightning, red fire, blue cold", isGreen(rgb(vp.c)) && isYellow(rgb(vl.c)) && isRed(rgb(vf.c)) && isBlue(rgb(vc.c)), JSON.stringify(ch.vals.map((v) => v.c)));
  C("life leech red, mana leech blue", ch.le.length === 2 && ch.le[0].t === `${ch.ll}%` && ch.le[1].t === `${ch.ml}%` && isRed(rgb(ch.le[0].c)) && isBlue(rgb(ch.le[1].c)), JSON.stringify(ch.le));
  await shot("06-character-resistances-leech");
  await page.locator('.mbtn[data-tab="inv"]').click().catch(() => {});
  await ev(() => __ec.ui.open("inv"));
  await page.waitForTimeout(400);
  await page.locator('[data-src="bag"][data-uid="9701"]').first().click();
  await page.waitForTimeout(400);
  const it1 = await ev(() => [...document.querySelectorAll(".cmpsheet .ccard .mod")].map((e) => ({ t: e.textContent, c: getComputedStyle(e).color })));
  const find = (arr, re) => arr.find((x) => re.test(x.t));
  const ok1 = isGreen(rgb(find(it1, /^Poison Resist/)?.c ?? "")) && isYellow(rgb(find(it1, /^Lightning Resist/)?.c ?? "")) && isRed(rgb(find(it1, /^Fire Resist/)?.c ?? "")) && isBlue(rgb(find(it1, /^Cold Resist/)?.c ?? ""));
  C("item card and the worn cards it's compared with: resistances in the same colours", ok1, JSON.stringify(it1));
  await shot("07-item-resist-colors");
  await page.locator('[data-act="cmp-close"]').click().catch(() => {});
  await page.waitForTimeout(250);
  await page.locator('[data-src="bag"][data-uid="9702"]').first().click();
  await page.waitForTimeout(400);
  const it2 = await ev(() => [...document.querySelectorAll(".cmpsheet .selc .mod")].map((e) => ({ t: e.textContent, c: getComputedStyle(e).color })));
  C("item card: life leech red, mana leech blue", isRed(rgb(find(it2, /Life Stolen/)?.c ?? "")) && isBlue(rgb(find(it2, /Mana Stolen/)?.c ?? "")), JSON.stringify(it2));
  await shot("08-item-leech-colors");
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const ok = checks.filter(Boolean).length;
console.log(`${ok}/${checks.length} passed`);
process.exit(ok === checks.length ? 0 : 1);
