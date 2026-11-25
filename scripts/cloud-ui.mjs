// Cloud save UI against a fake Supabase (network intercepted). Needs a dev server started with
// VITE_SUPABASE_URL=https://fake-proj.supabase.co VITE_SUPABASE_ANON_KEY=anon-test VITE_CLOUD=1 (port 5175).
// Two "devices" (separate browser contexts): the phone pushes a level 20 hero; a fresh iPad signs in and gets it.
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:5175/ember-crypt/";
const shot = process.argv[3];
const db = { row: null };
const b = await chromium.launch();
const checks = [];
const check = (n, ok, i = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", n, i); };
async function device(level) {
  const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: true });
  await ctx.route("https://fake-proj.supabase.co/**", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    const json = (j, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(j) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    if (u.pathname === "/auth/v1/otp") return json({});
    if (u.pathname === "/auth/v1/verify") return body.token === "123456" ? json({ access_token: "A", refresh_token: "R", expires_in: 3600, user: { id: "u1", email: body.email } }) : json({ msg: "Token has expired or is invalid" }, 403);
    if (u.pathname === "/rest/v1/saves") return json(db.row ? [db.row] : []);
    if (u.pathname === "/rest/v1/rpc/put_save") {
      const cur = db.row;
      if (!cur || cur.saved_at === body.p_expected || cur.saved_at < body.p_saved_at) { db.row = { data: body.p_data, saved_at: body.p_saved_at, level: body.p_level, device: body.p_device }; return json({ ok: true }); }
      return json({ ok: false, current: cur });
    }
    return json({}, 404);
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(`${base}?debug&new&seed=3`);
  await page.waitForTimeout(900);
  await page.evaluate((lv) => { __ec.settings.tutorialSeen = true; __ec.ui.showTutorial(false); const p = __ec.game.player; p.level = lv; p.gold = lv * 100; __ec.game.events.changed(); }, level);
  await page.waitForTimeout(800);
  await page.locator('.mbtn[data-tab="settings"]').tap();
  await page.waitForTimeout(300);
  await page.fill("#cloud-email", "player@example.com");
  await page.locator('[data-act="cloud-send"]').tap();
  await page.waitForSelector("#cloud-code");
  await page.fill("#cloud-code", "111111");
  await page.locator('[data-act="cloud-verify"]').tap();
  await page.waitForTimeout(500);
  check("wrong code refused", (await page.locator(".cloudbox .savemsg").textContent()).includes("didn't work"));
  await page.fill("#cloud-code", "123456");
  await page.locator('[data-act="cloud-verify"]').tap();
  await page.waitForTimeout(1500);
  return { ctx, page, errs };
}
const phone = await device(20);
check("phone signed in", (await phone.page.locator(".cloudbox").textContent()).includes("Signed in as player@example.com"));
check("phone pushed level 20", db.row?.level === 20, JSON.stringify({ level: db.row?.level }));
const ipad = await device(1);
await ipad.page.waitForTimeout(1500);
const lv = await ipad.page.evaluate(() => __ec.game.player.level);
check("fresh iPad got the level 20 hero", lv === 20, String(lv));
const baks = await ipad.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ember-crypt-save-bak")).map((k) => JSON.parse(localStorage[k]).player.level));
check("iPad's own level 1 hero kept in backups", baks.includes(1), JSON.stringify(baks));
check("cloud still level 20 (no overwrite by fresh hero)", db.row?.level === 20);
// phone plays on, syncs; then iPad picks it up on Sync now
await phone.page.evaluate(() => { __ec.game.player.level = 21; __ec.game.events.changed(); });
await phone.page.waitForTimeout(800);
await phone.page.locator('[data-act="cloud-sync"]').tap();
await phone.page.waitForTimeout(800);
check("phone pushed level 21", db.row?.level === 21);
await ipad.page.locator('.mbtn[data-tab="settings"]').tap().catch(() => {});
await ipad.page.waitForTimeout(300);
await ipad.page.locator('[data-act="cloud-sync"]').tap();
await ipad.page.waitForTimeout(1200);
check("iPad pulled level 21", (await ipad.page.evaluate(() => __ec.game.player.level)) === 21);
await ipad.page.locator('.mbtn[data-tab="settings"]').tap().catch(() => {});
await ipad.page.waitForTimeout(300);
await ipad.page.locator('[data-act="cloud-sync"]').tap();
await ipad.page.waitForTimeout(800);
check("then in sync (no ping-pong)", (await ipad.page.locator(".cloudbox .savemsg").textContent().catch(() => "")).includes("Already in sync") && db.row?.level === 21);
if (shot) await ipad.page.screenshot({ path: shot });
check("no page errors", phone.errs.length + ipad.errs.length === 0, [...phone.errs, ...ipad.errs].join(" | "));
await b.close();
const ok = checks.every(Boolean);
console.log(ok ? `cloud-ui: PASS (${checks.length})` : "cloud-ui: FAIL");
process.exit(ok ? 0 : 1);
