// v1.6 at 852x393 in Chromium and WebKit: the Sorceress on hero select (3 cards), her three skill trees, Frozen Orb /
// Blizzard, Chain Lightning, Meteor and Hydra in a dungeon, the Character screen with Spell DPS and the camp dummy
// hit by spells. Asserts no page errors.
// usage: node scripts/v16-shots.mjs [baseUrl] [outDir]
import { chromium, webkit } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots/v16";
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
  const shot = (n) => page.screenshot({ path: `${out}/${n}${sfx}.png` });
  const C = (n, ok, i) => check(`[${ename}] ${n}`, ok, i);
  const ev = (f, a) => page.evaluate(f, a);

  // 1) hero select → new hero → three class cards, create a Sorceress
  await page.goto(`${base}?debug&new&seed=21`);
  await page.waitForTimeout(800);
  await ev(() => { localStorage.setItem("ember-crypt-settings-v1", JSON.stringify({ tutorialSeen: true })); });
  await page.goto(`${base}?debug&select`);
  await page.waitForTimeout(900);
  const hasNew = await page.locator("#heroes .hcard.new").count();
  if (hasNew) { await page.click("#heroes .hcard.new"); await page.waitForTimeout(200); }
  const cards = await ev(() => [...document.querySelectorAll("#heroes .hcls")].map((e) => { const r = e.getBoundingClientRect(); return { c: e.dataset.cls, x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom }; }));
  await page.click('#heroes .hcls[data-cls="sorceress"]');
  await page.fill("#hero-name", "Tal Rasha");
  await page.waitForTimeout(200);
  const lay = await ev(() => {
    const cs = [...document.querySelectorAll("#heroes .hcls")].map((e) => e.getBoundingClientRect());
    const cr = document.querySelector('#heroes [data-hact="create"]').getBoundingClientRect();
    const sc = document.querySelector("#heroes");
    return { rows: new Set(cs.map((r) => Math.round(r.y))).size, overlap: cs.some((a, i) => cs.some((b, j) => i < j && a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1)), createVisible: cr.bottom <= innerHeight || sc.scrollHeight > sc.clientHeight };
  });
  C("hero select shows Barbarian, Amazon and Sorceress side by side, no overlap", cards.map((c) => c.c).join() === "barbarian,amazon,sorceress" && lay.rows === 1 && !lay.overlap, JSON.stringify({ cards: cards.map((c) => c.c), ...lay }));
  await shot("01-hero-select");
  await page.click('#heroes [data-hact="create"]');
  await page.waitForTimeout(1000);
  const made = await ev(() => { const p = __ec.game.player; return { cls: p.cls, name: p.name, main: p.equip.main?.baseId, bag: p.bag.map((e) => e.item.baseId), mana: Math.round(p.mana) }; });
  C("creating a Sorceress: battle staff in hand, a wand in the bag", made.cls === "sorceress" && made.main === "battle_staff" && made.bag.includes("wand"), JSON.stringify(made));
  await shot("02-new-sorceress-town");

  // 2) a level 40 Sorceress with points spread over the trees
  await ev(() => {
    const g = __ec.game, p = g.player, mk = __ec.items.makeItem;
    p.level = 40; p.skillPoints = 3; p.base = { str: 40, dex: 25, vit: 90, ene: 130 };
    p.skills = { fire_bolt: 8, warmth: 5, fire_ball: 12, blaze: 1, inferno: 1, fire_wall: 1, enchant: 2, meteor: 8, fire_mastery: 6, hydra: 4,
      ice_bolt: 1, frozen_armor: 1, frost_nova: 1, ice_blast: 3, shiver_armor: 1, glacial_spike: 1, blizzard: 6, chilling_armor: 1, frozen_orb: 12, cold_mastery: 4,
      charged_bolt: 1, static_field: 3, telekinesis: 1, nova: 1, lightning: 4, chain_lightning: 10, teleport: 1, thunder_storm: 1, energy_shield: 2, lightning_mastery: 3 };
    for (const k of Object.keys(p.skills)) if (!__ec.data.SKILLS.find((d) => d.id === k)) console.error("unknown skill " + k);
    p.slots = ["frozen_orb", "chain_lightning", "meteor"];
    p.mainAtk = "fire_ball";
    const st = mk("battle_staff", 40); st.q = "magic"; st.name = "Arcanist's Battle Staff"; st.mods = [{ s: "skill", v: 2, sk: "frozen_orb" }];
    p.equip = { ...p.equip, main: st, chest: mk("armor", 40), head: mk("helm", 40), gloves: mk("gloves", 40), boots: mk("boots", 40) };
    g.events.changed();
  });
  await page.click('[data-tab="skills"]');
  await page.waitForTimeout(300);
  const tabs = await ev(() => [...document.querySelectorAll(".stab")].map((e) => e.textContent.trim()));
  C("Sorceress skill tabs: Fire, Cold, Lightning Spells, Basic", tabs.length === 4 && /Fire/.test(tabs[0]) && /Cold/.test(tabs[1]) && /Lightning/.test(tabs[2]), tabs.join(" | "));
  for (const [tree, node, n] of [["fire", "meteor", "03-tree-fire"], ["cold", "frozen_orb", "04-tree-cold"], ["lightning", "chain_lightning", "05-tree-lightning"]]) {
    await page.click(`.stab[data-tree="${tree}"]`);
    await page.waitForTimeout(150);
    const nodes = await ev(() => document.querySelectorAll(".snode").length);
    await page.click(`.snode[data-id="${node}"]`);
    await page.waitForTimeout(150);
    C(`${tree} tree has 10 skills`, nodes === 10, String(nodes));
    await shot(n);
  }
  await ev(() => __ec.ui.close());

  // 3) Character screen: Spell DPS
  await page.click('[data-tab="char"]');
  await page.waitForTimeout(400);
  const sd = await ev(() => document.querySelector(".spelldps")?.textContent.replace(/\s+/g, " ").trim() ?? "");
  C("Character screen shows Spell DPS for the ⚔ spell", /Spell DPS/.test(sd) && /Fire Ball/.test(sd) && /\d/.test(sd), sd);
  await shot("06-character-spell-dps");
  await ev(() => __ec.ui.close());

  // 4) spells in a dungeon: monsters held in place in front of her
  const arena = async (ids, n, extra = 0) => {
    await ev(([ids, n]) => {
      const g = __ec.game, p = g.player;
      g.player.mana = 9999; g.player.hp = 99999; g.player.action = null; g.sorcCd = {}; g.spells = [];
      const live = g.monsters.filter((m) => m.state !== "dead" && !m.dummy);
      live.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      const pack = live.slice(0, n);
      let i = 0;
      for (const m of pack) {
        const a = (2 * Math.PI * i) / n; i++;
        const x = window.__cx + Math.cos(a) * 1.3, y = window.__cy + Math.sin(a) * 1.3;
        if (!g.blocked(x, y, 0.4)) { m.x = x; m.y = y; } else { m.x = window.__cx; m.y = window.__cy; }
        m.hp = m.maxHp = 1e6; m.state = "idle";
      }
      p.x = window.__px; p.y = window.__py; p.fx = -Math.SQRT1_2; p.fy = Math.SQRT1_2;
      ids.forEach(([id, steps], j) => {
        g.player.mana = 9999; g.player.action = null; g.sorcCd = {};
        if (!g.castSkill(id, g.derived())) console.error("cast failed " + id);
        for (let k = 0; k < steps; k++) g.update(1 / 60, { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] });
      });
      // hold the world still while the screenshot is taken (the renderer keeps drawing)
      g.update = () => {};
    }, [ids, n]);
    await page.waitForTimeout(extra);
  };
  const thaw = () => ev(() => { delete __ec.game.update; });
  await ev(() => { __ec.game.goDungeon(25); });
  await page.waitForTimeout(900);
  // an open spot: a centre C with open ground around it and the hero 4.5 tiles west of it, clear line between
  const spot = await ev(() => {
    const g = __ec.game, p = g.player;
    const open = (x, y) => !g.blocked(x, y, 0.45);
    const W = g.level.w, H = g.level.h;
    const cands = [];
    for (const m of g.monsters) cands.push([m.x, m.y]);
    for (let y = 2; y < H - 2; y += 1.5) for (let x = 2; x < W - 2; x += 1.5) cands.push([x, y]);
    for (const [cx, cy] of cands) {
      let ok = open(cx, cy);
      for (let a = 0; ok && a < 8; a++) ok = open(cx + Math.cos(a * Math.PI / 4) * 2.2, cy + Math.sin(a * Math.PI / 4) * 2.2);
      for (let d = 0; ok && d <= 3; d += 0.4) ok = open(cx + d, cy - d) && open(cx + d - 0.8, cy - d - 0.8) && open(cx + d + 0.8, cy - d + 0.8);
      if (ok) { window.__cx = cx; window.__cy = cy; window.__px = cx + 2.8; window.__py = cy - 2.8; p.x = window.__px; p.y = window.__py; return { cx, cy }; }
    }
    return null;
  });
  C("found an open room for the spell shots", !!spot, JSON.stringify(spot));
  await ev(() => { for (const m of __ec.game.monsters) m.def = { ...m.def, dmgMin: 0, dmgMax: 0, speed: 0 }; });
  for (let k = 0; k < 7; k++) { await page.waitForTimeout(500); await ev(() => { const p = __ec.game.player; p.hp = __ec.game.derived().maxHp; p.x = window.__px; p.y = window.__py; }); } // the level banner fades
  C("the hero is alive for the spell shots", await ev(() => !__ec.game.player.dead));
  await arena([["blizzard", 40], ["frozen_orb", 22]], 5, 250);
  const fo = await ev(() => __ec.game.spells.map((s) => s.k).join());
  C("Frozen Orb and Blizzard are live on screen", /blizzard/.test(fo) && /missile/.test(fo), fo);
  await shot("07-frozen-orb-blizzard");
  await thaw();
  await page.waitForTimeout(500);
  await arena([["chain_lightning", 16]], 5, 250);
  const dealtCl = await ev(() => __ec.game.monsters.filter((m) => m.maxHp === 1e6).reduce((a, m) => a + (1e6 - m.hp), 0));
  C("Chain Lightning hits the pack", dealtCl > 100, String(Math.round(dealtCl)));
  await shot("08-chain-lightning");
  await thaw();
  await page.waitForTimeout(500);
  await arena([["meteor", 30], ["hydra", 20], ["hydra", 21]], 5, 250);
  await shot("09-meteor-hydra");
  const dealt = await ev(() => __ec.game.monsters.filter((m) => m.maxHp === 1e6).reduce((a, m) => a + (1e6 - m.hp), 0));
  C("Hydras and Meteor hit the held monsters", dealt > 100, `${Math.round(dealt)} damage`);
  await thaw();
  const buffs = await ev(() => { const g = __ec.game; for (const id of ["frozen_armor", "energy_shield", "thunder_storm"]) { g.player.action = null; g.player.mana = 9999; g.castSkill(id, g.derived()); for (let k = 0; k < 40; k++) g.update(1 / 60, { mx: 0, my: 0, mag: 0, attack: false, skills: [false, false, false] }); } return g.timedBuffs().map((b) => b.id); });
  C("Frozen Armor, Energy Shield and Thunder Storm show on the buff bar", ["frozen_armor", "energy_shield", "thunder_storm"].every((b) => buffs.includes(b)), buffs.join());
  await page.waitForTimeout(300);
  await shot("10-buff-bar");

  // 5) training dummy in camp: ⚔ is Fire Ball, held for a few seconds
  await ev(() => {
    const g = __ec.game, p = g.player;
    g.goTown(true);
    const dm = g.monsters.find((m) => m.dummy);
    p.x = dm.x - 4; p.y = dm.y + 0.3; p.fx = 1; p.fy = 0;
    p.mainAtk = "fire_ball";
    __ec.input.attack = true;
  });
  for (let k = 0; k < 9; k++) { await page.waitForTimeout(500); await ev(() => { __ec.game.player.mana = 9999; }); }
  const mt = await ev(() => { const m = __ec.game.dummyMeter(); const d = __ec.game.monsters.find((x) => x.dummy); return { ...m, hp: d.hp, max: d.maxHp, dead: d.state === "dead" }; });
  C("dummy: spell hits counted, DPS shown, never dies", mt.hits >= 3 && mt.dps > 0 && !mt.dead, JSON.stringify(mt));
  await shot("11-dummy-fire-ball");
  await ev(() => { __ec.input.attack = false; });
  C("no page errors", errs.length === 0, errs.join(" | "));
  await br.close();
}
const failed = checks.filter((c) => !c).length;
console.log(failed ? `${failed} FAILED` : `all ${checks.length} passed`);
process.exit(failed ? 1 : 0);
