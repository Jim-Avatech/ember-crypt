// v0.8.3: "Back up to Files" shares a real .embercrypt file (or downloads it), "Restore from file" brings it back
// and keeps the current hero as a backup, the last backup time shows in Settings, and the 24h reminder fires.
// usage: node scripts/file-backup.mjs [baseUrl] [shotPath] [engine]
import { chromium, webkit } from "@playwright/test";
import fs from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5174/ember-crypt/";
const shot = process.argv[3];
const engine = process.argv[4] === "webkit" ? webkit : chromium;
const browser = await engine.launch();
const checks = [];
const check = (name, ok, info = "") => { checks.push(ok); console.log(ok ? "PASS" : "FAIL", name, info); };

async function open(withShare) {
  const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, isMobile: engine === chromium, hasTouch: true, acceptDownloads: true });
  if (withShare)
    await ctx.addInitScript(() => {
      window.__shared = [];
      navigator.canShare = (d) => !!d?.files?.length;
      navigator.share = async (d) => { for (const f of d.files) window.__shared.push({ name: f.name, type: f.type, text: await f.text() }); };
    });
  else await ctx.addInitScript(() => { delete Navigator.prototype.share; delete Navigator.prototype.canShare; });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}?debug&new&seed=7`);
  await page.waitForTimeout(900);
  await page.evaluate(() => { __ec.settings.tutorialSeen = true; __ec.ui.showTutorial(false); });
  return { ctx, page, errors };
}
const openSettings = async (page) => { await page.locator('.mbtn[data-tab="settings"]').tap(); await page.waitForTimeout(300); };

// 1) share sheet path
{
  const { ctx, page, errors } = await open(true);
  await page.evaluate(() => { const p = __ec.game.player; p.level = 21; p.gold = 9876; __ec.game.events.changed(); });
  await openSettings(page);
  check("settings shows 'never' before first backup", (await page.locator("#filebak-at").textContent()).includes("never"));
  await page.locator('[data-act="exp-share"]').tap();
  await page.waitForTimeout(400);
  const shared = await page.evaluate(() => window.__shared);
  const f = shared?.[0];
  check("share sheet got one .embercrypt file", shared.length === 1 && /^ember-crypt-lv21-\d{4}-\d\d-\d\d\.embercrypt$/.test(f.name), f?.name);
  let parsed = null;
  try { parsed = JSON.parse(f.text); } catch {}
  check("file is the real save JSON", parsed?.player?.level === 21 && parsed?.player?.gold === 9876);
  const at = await page.locator("#filebak-at").textContent();
  check("last backup time shown", !at.includes("never"), at.trim());
  check("message mentions the file", (await page.locator(".savemsg").textContent()).includes(".embercrypt"));
  if (f) fs.writeFileSync("/tmp/test-backup.embercrypt", f.text);
  if (shot) await page.screenshot({ path: shot });
  check("no page errors (share)", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// 2) fallback: no share API -> download
{
  const { ctx, page, errors } = await open(false);
  await openSettings(page);
  const dl = page.waitForEvent("download", { timeout: 4000 }).catch(() => null);
  await page.locator('[data-act="exp-share"]').tap();
  const d = await dl;
  check("falls back to a download", !!d && d.suggestedFilename().endsWith(".embercrypt"), d?.suggestedFilename());
  check("no page errors (download)", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// 3) restore from file on a different (new) hero; the current hero goes to backups
{
  const { ctx, page, errors } = await open(true);
  await page.evaluate(() => { const p = __ec.game.player; p.level = 5; p.gold = 11; __ec.game.events.changed(); });
  await page.waitForTimeout(1500); // let it save
  await openSettings(page);
  await page.setInputFiles("#impfile", { name: "x.embercrypt", mimeType: "", buffer: fs.readFileSync("/tmp/test-backup.embercrypt") });
  await page.waitForTimeout(400);
  const confirm = await page.locator(".savemsg").first().textContent();
  check("asks before replacing", confirm.includes("level 21"), confirm.slice(0, 90));
  await page.locator('[data-act="imp-yes"]').tap();
  await page.waitForTimeout(1200);
  const st = await page.evaluate(() => ({ lvl: __ec.game.player.level, gold: __ec.game.player.gold }));
  check("restored hero loaded", st.lvl === 21 && st.gold === 9876, JSON.stringify(st));
  const baks = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ember-crypt-save-bak")).map((k) => JSON.parse(localStorage[k]).player.level));
  check("previous level 5 hero kept in backups", baks.includes(5), JSON.stringify(baks));
  // a bad file is refused, nothing changes
  await openSettings(page).catch(() => {});
  if (!(await page.locator("#impfile").count())) await openSettings(page);
  await page.setInputFiles("#impfile", { name: "bad.embercrypt", mimeType: "", buffer: Buffer.from("not a save") });
  await page.waitForTimeout(400);
  check("bad file refused", (await page.locator(".savemsg").first().textContent()).includes("isn't a valid"));
  check("hero untouched by bad file", (await page.evaluate(() => __ec.game.player.level)) === 21);
  check("no page errors (restore)", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// 4) reminder after a level-up when never backed up; none right after a backup
{
  const { ctx, page, errors } = await open(true);
  await page.evaluate(() => { __ec.game.player.level = 6; __ec.game.events.levelUp(6); });
  await page.waitForTimeout(4200);
  const t = await page.locator("#toast").textContent();
  check("reminder toast after level-up", t.includes("Back up to Files"), t);
  await page.evaluate(() => { localStorage.removeItem("ember-crypt-backup-reminded-at"); localStorage.setItem("ember-crypt-file-backup-at", String(Date.now() - 3600e3)); document.querySelector("#toast").textContent = ""; __ec.game.events.bossKilled(); });
  await page.waitForTimeout(5000);
  const t2 = await page.locator("#toast").textContent();
  check("no reminder when backed up an hour ago", !t2.includes("Back up to Files"), t2);
  check("no page errors (reminder)", errors.length === 0, errors.join(" | "));
  await ctx.close();
}
await browser.close();
const ok = checks.every(Boolean);
console.log(ok ? `file-backup: PASS (${checks.length})` : "file-backup: FAIL");
process.exit(ok ? 0 : 1);
