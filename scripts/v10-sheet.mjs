// v1.0: sprite contact sheets for the Amazon and the javelin overhead grip (8 directions per row).
// usage: node scripts/v10-sheet.mjs [baseUrl]  -> screenshots/v10/sheet-*.png
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`${base}?debug&new`);
await page.waitForTimeout(800);
const sets = {
  "ama-shortbow": ["amazon", { main: "short_bow", off: "arrows", chest: "leather_armor", head: "cap", boots: "boots", gloves: "leather_gloves" }, ["idle", "walk", "shoot", "cast"]],
  "ama-longbow": ["amazon", { main: "long_battle_bow", off: "arrows", chest: "scale_mail", head: "helm", boots: "chain_boots", gloves: "chain_gloves" }, ["idle", "shoot"]],
  "ama-javelin": ["amazon", { main: "javelin", off: "buckler", chest: "quilted_armor" }, ["idle", "walk", "atk0", "thr0"]],
  "barb-javelin": ["barb", { main: "javelin", off: "buckler", chest: "chain_mail", head: "helm" }, ["idle", "walk", "atk0", "thr0"]],
  "ama-spear": ["amazon", { main: "pike", chest: "studded_leather" }, ["idle", "walk", "atk0"]],
  "armor-ama": ["amazon", { main: "short_sword", off: "small_shield", chest: "chain_mail", head: "full_helm", boots: "chain_boots", gloves: "chain_gloves" }, ["idle"]],
  "armor-barb": ["barb", { main: "short_sword", off: "small_shield", chest: "chain_mail", head: "full_helm", boots: "chain_boots", gloves: "chain_gloves" }, ["idle"]],
};
const res = await page.evaluate(async (sets) => {
  const P = await import("/ember-crypt/src/sprites/puppet.ts");
  const out = {};
  for (const [name, [model, L, anims]] of Object.entries(sets)) {
    const cols = Math.max(...anims.map((a) => P.FRAMES[a]));
    const S = 3;
    const c = document.createElement("canvas");
    c.width = 8 * cols * 52 * S / 2; c.height = anims.length * 58 * S;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#3a3026"; g.fillRect(0, 0, c.width, c.height);
    // two rows of 4 directions per animation to keep it readable
    c.height = anims.length * 2 * 58 * S; c.width = 4 * cols * 52 * S;
    g.fillStyle = "#3a3026"; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    anims.forEach((a, ri) => {
      for (let dir = 0; dir < 8; dir++)
        for (let f = 0; f < P.FRAMES[a]; f++) {
          const fr = P.getFrame(model, L, P.lookKey(L) + "|sheet", a, dir, f);
          const x = ((dir % 4) * cols + f) * 52 * S;
          const y = (ri * 2 + (dir >> 2)) * 58 * S;
          g.drawImage(fr.c, x, y, fr.c.width * S, fr.c.height * S);
        }
    });
    out[name] = c.toDataURL();
  }
  return out;
}, sets);
const fs = await import("node:fs");
for (const [k, v] of Object.entries(res)) fs.writeFileSync(`screenshots/v10/sheet-${k}.png`, Buffer.from(v.split(",")[1], "base64"));
console.log("wrote", Object.keys(res).join(", "));
await b.close();
