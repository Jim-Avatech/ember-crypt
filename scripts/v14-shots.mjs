// v1.4 at 852x393 in Chromium and WebKit: Brann the Runesmith in camp, his Craft tab with the cost, the confirm, an item
// before and after crafting, the step-by-step quality (normal → magic → magic → rare → rare) and the refusal at 4 affixes,
// carried-then-stash gold, plus an old save's doubled affix merged on load.
// usage: node scripts/v14-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v14";
mkdirSync(out, { recursive: true });
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
const seed = async (page, prep) => {
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await page.evaluate((prep) => {
    const s = __ec.game.toSave();
    const mk = __ec.items.makeItem;
    s.player.cls = "barbarian"; s.player.name = "Grom"; s.player.level = 30; s.player.base.str = 150; s.player.base.dex = 100;
    s.player.skills = { bash: 1 }; s.player.gold = 30000; s.player.stashGold = 0; s.maxFloor = 12;
    new Function("s", "mk", prep)(s, mk);
    localStorage.clear();
    localStorage.setItem("ember-crypt-save-v1#2", JSON.stringify(s));
    localStorage.setItem("ember-crypt-last-slot", "2");
    localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true }));
  }, prep);
  await page.goto(`${base}?debug&slot=2`);
  await page.waitForTimeout(1400);
};
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
  const click = async (sel) => { await page.locator(sel).first().click(); await page.waitForTimeout(300); };

  // ---- 1. Brann in camp: walk up, the context button says Craft
  await fresh();
  await seed(page, `const sw = mk("sword", 20); sw.uid = 8101; s.player.bag = [{ item: sw, x: 0, y: 0 }]; s.player.equip.main = mk("axe", 10);`);
  await ev(() => { const g = __ec.game, c = g.level.crafter; g.player.x = c.x + 1.6; g.player.y = c.y + 1.2; g.player.fx = -1; g.player.fy = -1; g.events.changed(); });
  await page.waitForTimeout(700);
  const cx = await ev(() => ({ ctx: __ec.game.contextAction(), btn: document.querySelector("#ctxbtn, .ctxbtn, [data-act='ctx']")?.textContent ?? [...document.querySelectorAll("button")].map((b) => b.textContent).find((t) => /Craft with Brann/.test(t)) ?? "" }));
  C("next to Brann: context action Craft, button '⚒ Craft with Brann'", cx.ctx === "craft" && /Craft with Brann/.test(cx.btn), JSON.stringify(cx));
  await shot("01-brann-in-camp");
  // open the Craft tab (through the context button)
  await ev(() => __ec.ui.contextTap());
  await page.waitForTimeout(500);
  C("Craft tab opens", await ev(() => __ec.ui.openTab === "craft"));
  // pick the normal sword
  await click('[data-act="craft-sel"][data-uid="8101"]');
  const ui1 = await ev(() => ({ step: document.querySelector(".cstep")?.textContent ?? "", btn: document.querySelector('[data-act="craft-ask"]')?.textContent ?? "", dis: document.querySelector('[data-act="craft-ask"]')?.disabled, lines: [...document.querySelectorAll(".craftdetail .clines > *")].length }));
  C("a normal Sword: Normal (0) → Magic (1), 450 gold shown on the step and the button", /Normal \(0\)/.test(ui1.step) && /Magic \(1\)/.test(ui1.step) && /450 gold/.test(ui1.step) && /450 gold/.test(ui1.btn) && !ui1.dis, JSON.stringify(ui1));
  await shot("02-crafter-ui-cost-before");
  // confirm
  await click('[data-act="craft-ask"]');
  const cf = await ev(() => document.querySelector(".craftconfirm")?.textContent ?? "");
  C("confirm shows the cost and what it becomes", /450 gold/.test(cf) && /Magic/.test(cf) && /random/.test(cf), cf.slice(0, 160));
  await shot("03-crafter-confirm");
  await click('[data-act="craft-yes"]');
  const af = await ev(() => { const it = __ec.game.bagEntry(8101).item; return { q: it.q, name: it.name, mods: it.mods, gold: __ec.game.player.gold, nw: document.querySelector(".cnew")?.textContent ?? "", toast: document.getElementById("toast").textContent }; });
  C("after: a magic Sword with 1 affix, 450 gold paid, the new affix shown", af.q === "magic" && af.mods.length >= 1 && /Sword/.test(af.name) && af.gold === 30000 - 450 && /New:/.test(af.nw) && /Brann adds/.test(af.toast), JSON.stringify(af));
  await shot("04-crafted-after");
  // 3 more steps → rare 4
  const steps = [];
  for (let k = 0; k < 3; k++) {
    await click('[data-act="craft-ask"]');
    await click('[data-act="craft-yes"]');
    steps.push(await ev(() => { const it = __ec.game.bagEntry(8101).item; return `${it.q}:${it.aff.length}`; }));
  }
  C("then magic (2) → rare (3) → rare (4)", steps.join() === "magic:2,rare:3,rare:4", steps.join());
  const ref = await ev(() => ({ why: document.querySelector(".craftwhy")?.textContent ?? "", dis: document.querySelector('[data-act="craft-ask"]')?.disabled, gold: __ec.game.player.gold }));
  C("at 4 affixes: refused with the reason, button disabled", /already has 4 affixes/.test(ref.why) && ref.dis === true, JSON.stringify(ref));
  C("total paid 450 + 1,350 + 3,600 + 9,000", ref.gold === 30000 - 450 - 1350 - 3600 - 9000, String(ref.gold));
  await shot("05-refused-at-4");
  // worn item, and stash gold after carried gold
  await ev(() => { const p = __ec.game.player; p.gold = 100; p.stashGold = 5000; __ec.game.events.changed(); });
  await click('[data-act="craft-sel"][data-slot="main"]');
  await click('[data-act="craft-ask"]');
  await click('[data-act="craft-yes"]');
  const wr = await ev(() => ({ q: __ec.game.player.equip.main.q, gold: __ec.game.player.gold, sg: __ec.game.player.stashGold }));
  C("a worn Axe crafts too; carried gold first (100), then stash gold (150)", wr.q === "magic" && wr.gold === 0 && wr.sg === 4850, JSON.stringify(wr));

  // ---- 2. old save with a doubled affix: merged on load, a note says so
  await fresh();
  await seed(page, `const r = mk("ring", 20); r.uid = 8202; r.q = "rare"; r.name = "Grim Band"; r.mods = [{ s: "mf", v: 10 }, { s: "life", v: 12 }, { s: "mf", v: 22 }]; r.aff = ["p:mf", "s:life", "s:mf"]; s.player.bag = [{ item: r, x: 0, y: 0 }];`);
  await page.waitForFunction(() => /same affix twice/.test(document.getElementById("toast").textContent), null, { timeout: 7000 }).catch(() => {});
  const mg = await ev(() => ({ mods: __ec.game.bagEntry(8202)?.item.mods, toast: document.getElementById("toast").textContent, saved: JSON.parse(localStorage.getItem("ember-crypt-save-v1#2")).player.bag.find((e) => e.item.uid === 8202)?.item.mods }));
  C("old save: two Magic Find rows merged into one (22), the item kept, saved, and a note", JSON.stringify(mg.mods) === JSON.stringify([{ s: "mf", v: 22 }, { s: "life", v: 12 }]) && JSON.stringify(mg.saved) === JSON.stringify(mg.mods) && /same affix twice/.test(mg.toast), JSON.stringify(mg));
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const ok = checks.filter(Boolean).length;
console.log(`${ok}/${checks.length} passed`);
process.exit(ok === checks.length ? 0 : 1);
