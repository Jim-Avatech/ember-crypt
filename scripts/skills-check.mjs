import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: true })).newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto("http://127.0.0.1:4174/ember-crypt/?new&seed=7");
await page.waitForTimeout(600);
const out = [];
for (const id of ["leap", "leap_attack", "double_swing", "stun", "howl", "shout", "battle_orders", "find_potion"]) {
  const r = await page.evaluate((id) => {
    const g = __ec.game; const p = g.player;
    p.level = 30; for (const k of ["bash","leap","double_swing","stun","leap_attack","howl","shout","battle_orders","find_potion","increased_stamina"]) p.skills[k] = p.skills[k] || 1;
    p.mana = 50; p.action = null;
    const m = g.monsters.find((q) => q.state !== "dead" && q.def.kind !== "boss");
    for (const [dx, dy] of [[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]]) if (!g.blocked(m.x+dx, m.y+dy, p.r)) { p.x = m.x+dx; p.y = m.y+dy; break; }
    if (id === "find_potion") { m.hp = 0; m.state = "dead"; }
    const ok = g.castSkill(id, g.derived());
    return { id, ok, action: p.action?.type ?? null };
  }, id);
  await page.waitForTimeout(700);
  out.push(r);
}
console.log(out, errs);
await browser.close();
