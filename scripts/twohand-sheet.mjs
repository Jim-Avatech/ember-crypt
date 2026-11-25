// v0.9.1: every two-handed look × every animation frame × 8 directions. Checks both hands are on the shaft
// (IK reached the grip) and writes contact sheets to screenshots/twohand-sheet-*.png.
// usage: node scripts/twohand-sheet.mjs [baseUrl]
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`${base}?debug&new`);
await page.waitForTimeout(800);
const res = await page.evaluate(async () => {
  const P = await import("/ember-crypt/src/sprites/puppet.ts");
  const I = await import("/ember-crypt/src/data/looks.ts");
  const looks = Object.keys(I.LOOK_BY_ID).filter((id) => I.LOOK_BY_ID[id]?.hands === 2);
  const anims = ["idle", "walk", "atk0", "atk1", "leap", "cry"];
  let worst = 0, worstAt = "", n = 0;
  const per = {};
  const sheets = {};
  for (const look of looks) {
    const L = { main: look, chest: "chain_mail" };
    const rows = anims.map((a) => [a, P.FRAMES[a]]);
    const cols = Math.max(...rows.map((r) => r[1])) ;
    const c = document.createElement("canvas");
    c.width = 8 * cols * 52; c.height = rows.length * 58;
    const g = c.getContext("2d");
    g.fillStyle = "#3a3026"; g.fillRect(0, 0, c.width, c.height);
    rows.forEach(([a, nf], ri) => {
      for (let dir = 0; dir < 8; dir++)
        for (let f = 0; f < nf; f++) {
          const fr = P.getFrame("barb", L, P.lookKey(L) + "|sheet", a, dir, f);
          n++;
          per[a] = Math.max(per[a] ?? 0, P.lastGripErr);
          if (P.lastGripErr > worst) { worst = P.lastGripErr; worstAt = `${look} ${a} d${dir} f${f}`; }
          g.drawImage(fr.c, (dir * cols + f) * 52, ri * 58);
        }
    });
    sheets[look] = c.toDataURL();
  }
  return { looks, worst, worstAt, n, sheets, per };
});
const fs = await import("node:fs");
for (const [k, v] of Object.entries(res.sheets)) fs.writeFileSync(`screenshots/twohand-sheet-${k}.png`, Buffer.from(v.split(",")[1], "base64"));
console.log("worst per animation:", JSON.stringify(Object.fromEntries(Object.entries(res.per).map(([k, v]) => [k, +v.toFixed(2)]))));
console.log("two-handed looks:", res.looks.join(", "), "| frames:", res.n, "| worst hand-to-grip error:", res.worst.toFixed(2), "at", res.worstAt);
await b.close();
process.exit(res.worst < 1.0 ? 0 : 1);
