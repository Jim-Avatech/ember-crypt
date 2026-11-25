// Screenshots of each act, a final boss and the artifacts view (852x393 phone landscape).
// usage: node scripts/acts-shots.mjs [baseUrl] [dir]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const out = process.argv[3] ?? "screenshots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${base}?debug&new&seed=42`);
await page.waitForTimeout(800);
const ev = (fn, a) => page.evaluate(fn, a);
await ev(() => {
  __ec.settings.tutorialSeen = true;
  __ec.ui.showTutorial(false);
  const p = __ec.game.player;
  p.level = 40;
  p.base.vit = 400;
  p.base.str = 200;
  p.base.dex = 150;
});
async function act(floor, name, near = "pack") {
  await ev(({ floor, near }) => {
    const g = __ec.game;
    g.maxFloor = Math.max(g.maxFloor, floor);
    g.goDungeon(floor);
    const p = g.player;
    const d = g.derived();
    p.hp = d.maxHp;
    let target;
    if (near === "boss") target = g.boss;
    else {
      // the room with the most monsters that isn't the boss room
      const counts = new Map();
      for (const m of g.monsters) if (m !== g.boss) counts.set(m.pack, [...(counts.get(m.pack) ?? []), m]);
      const best = [...counts.values()].sort((a, b) => b.length - a.length)[0];
      target = best[0];
    }
    // stand ~3 tiles away on a floor tile
    for (const [dx, dy] of [[3, 0], [0, 3], [-3, 0], [0, -3], [2, 2], [-2, -2], [2, -2], [-2, 2], [1.5, 0], [0, 1.5]]) {
      const x = target.x + dx;
      const y = target.y + dy;
      if (!g.blocked(x, y, 0.3)) {
        p.x = x;
        p.y = y;
        break;
      }
    }
    for (const m of g.monsters) if (Math.hypot(m.x - p.x, m.y - p.y) < 9) m.state = "chase";
  }, { floor, near });
  await page.waitForTimeout(near === "boss" ? 2600 : 1500);
  await ev(() => { const p = __ec.game.player; p.hp = __ec.game.derived().maxHp; });
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("shot", name);
}
await act(3, "act1-crypt");
await act(23, "act2-tombs");
await act(43, "act3-jungle");
await act(63, "act4-hells");
await act(20, "boss-act1-lich", "boss");
await act(40, "boss-act2-sekhet", "boss");
await act(60, "boss-act3-mire", "boss");
await act(80, "boss-act4-malakar", "boss");
// kill a final boss, collect the artifact, open the artifacts view
await ev(() => {
  const g = __ec.game;
  g.goDungeon(20);
  const b = g.boss;
  g.player.x = b.x + 1.5;
  g.player.y = b.y;
  g.kill(b);
});
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/artifact-drop.png` });
const got = await ev(() => {
  const g = __ec.game;
  const a = g.ground.find((x) => x.artifact);
  g.player.x = a.x;
  g.player.y = a.y;
  return !!a;
});
await page.waitForTimeout(500);
await ev(() => {
  const g = __ec.game;
  g.player.artifacts.push({ id: "mire_pearl", at: Date.now(), level: 33 });
  __ec.ui.open("arts");
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/artifacts.png` });
await ev(() => { __ec.ui.close(); __ec.ui.open("wp"); });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/waypoint-acts.png` });
const fps = await ev(() => (typeof __ec.fps === "function" ? null : __ec.fps));
console.log("artifact dropped:", got, "arts:", await ev(() => __ec.game.player.artifacts.map((a) => a.id).join(",")), "fps", JSON.stringify(fps));
console.log("errors:", errors.length ? errors.join("\n") : "none");
await browser.close();
