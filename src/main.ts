import { CLASS_NAME, SKILLS } from "./data/skills";
import "./styles.css";
import { AFFIXES, enchant, mergeDuplicateMods, rollDrop } from "./data/affixes";
import { ITEM_BASES, lookOf, makeItem, migrateItem } from "./data/items";
import type { HeroClass } from "./data/skills";
import { HeroSelect, type HeroCard } from "./heroes";
import { Sfx } from "./audio";
import { Game, type GameEvents, type SaveData, isHeroClass } from "./game";
import { Input } from "./input";
import { LOW_LIFE, Renderer } from "./render";
import {
  canSave, clearGame, exportCode, importCode, lastSavedAt, listBackups, loadBackup, loadFromIdb, loadGame, loadSettings, cleanSettings,
  keepDamaged, pauseSaving, requestPersist, saveGame, saveSettings, lastFileBackup, markFileBackup, backupFileName, takeBackupReminder,
  setSlot, lastSlot, currentSlot, listHeroes, readSlot, freeSlot, loadSharedStash, saveSharedStash, parseSave,
  MAX_HEROES, deleteHero, deletedAt,
} from "./save";
import { Cloud, cloudConfig } from "./cloud";
import { Ui } from "./ui";


const app = document.getElementById("app")!;
app.innerHTML = `<canvas id="view"></canvas><canvas id="fx"></canvas>`;
const canvas = document.getElementById("view") as HTMLCanvasElement;
const fxCanvas = document.getElementById("fx") as HTMLCanvasElement;

const settings = loadSettings();
const sfx = new Sfx();
sfx.enabled = settings.sound;
const renderer = new Renderer(canvas, fxCanvas);
renderer.shakeOn = settings.shake;
const input = new Input(canvas);

let dirty = false;
const events: GameEvents = {
  sound: (n) => sfx.play(n),
  toast: (t) => ui.toast(t),
  changed: () => {
    dirty = true;
    scheduleSave();
    ui.refresh();
  },
  died: () => {
    input.reset();
    setTimeout(() => ui.showDeath(), 900);
  },
  levelUp: (lvl) => {
    ui.toast(`Level ${lvl}! +1 skill point, +5 stat points`);
    setTimeout(() => doSave(true), 0);
    remindBackup(3500);
  },
  bossKilled: () => remindBackup(4500),
  shake: (a) => (renderer.shake = Math.max(renderer.shake, a)),
};

const params = new URLSearchParams(location.search);
// test/debug switches only work in dev builds or with ?debug
const DEBUG = import.meta.env.DEV || params.has("debug");
const fresh = DEBUG && params.has("new");
// v1.0: open the hero played last (slot 1 = the original hero, so an existing save is simply hero #1)
setSlot(DEBUG && params.has("slot") ? Number(params.get("slot")) : lastSlot());
if (fresh) clearGame();
type BootShell = { ok(): void; show(title: string, detail?: string): void; done: boolean; after?: boolean };
const boot = (window as unknown as { __ecBoot?: BootShell }).__ecBoot;
const loaded = fresh ? null : loadGame();
let saved = loaded?.data ?? null;
/** v0.8.1: if a save can't be turned into a game, keep it (as the damaged copy) and try the backups instead of crashing. */
function startGame(): Game {
  const seed = DEBUG && params.has("seed") ? Number(params.get("seed")) : undefined;
  try {
    return new Game(events, saved, seed);
  } catch (err) {
    console.error("Ember Crypt: save failed to load", err);
    keepDamaged();
    for (const b of listBackups()) {
      const d = loadBackup(b.key);
      if (!d) continue;
      try {
        const g = new Game(events, d, seed);
        saved = d;
        setTimeout(() => ui.toast(`Your save couldn't be opened, so your level ${d.player.level} backup was loaded. The original is kept.`, 8000), 800);
        return g;
      } catch {
        /* try the next one */
      }
    }
    boot?.show("Your save couldn't be opened by this version. It is kept on this phone; use Export save to keep a copy.", String((err as Error)?.message ?? err));
    pauseSaving();
    throw err;
  }
}
const cloudCfg = cloudConfig(import.meta.env as Record<string, string | undefined>, location.search);
const cloud = cloudCfg ? new Cloud(cloudCfg) : null;
cloud?.setSlot(currentSlot());
let game = startGame();
syncStash();

const ui = new Ui(app, () => game, input, settings, {
  settingsChanged: () => {
    saveSettings(settings);
    sfx.enabled = settings.sound;
    renderer.shakeOn = settings.shake;
    applyAuto();
    scheduleSave();
    ui.updateJoystick();
  },
  newGame: () => {
    // start THIS hero over (same slot and class); the old one goes into this slot's backups
    const hero = { cls: game.player.cls, name: game.player.name };
    clearGame();
    game = new Game(events, null, undefined, hero);
    syncStash();
    applyAuto();
    doSave();
    ui.refresh();
    ui.toast(`A new ${hero.name} enters the Ember Crypt (your old hero is in the backups)`);
  },
  heroes: () => heroSelect.show({ closable: true }),
  save: {
    lastSaved: () => lastSavedAt(),
    canSave: () => canSave(),
    exportCode: () => exportCode(withSettings()),
    exportJson: () => JSON.stringify(bundle(), null, 1),
    importCode: (text: string) => importCode(text),
    backups: () => listBackups(),
    loadBackup: (key: string) => loadBackup(key),
    replace: (d: SaveData) => replaceGame(d),
    lastFileBackup: () => lastFileBackup(),
    markFileBackup: () => markFileBackup(),
    fileName: () => backupFileName(game.player.level, new Date(), game.player.cls),
    cloud: cloud ? cloudHooks(cloud) : undefined,
  },
  click: () => sfx.play("click"),
  testSound: () => sfx.test(),
  soundState: () => sfx.state,
});
renderer.setMinimap(ui.minimap);
// v0.9.2: the boss bar stays clear of the menu buttons, buffs and minimap; toasts drop below the bar
const toastEl = document.getElementById("toast");
let toastTop = "";
function placeToast() {
  const bb = renderer.lastBossBar;
  const top = bb ? `${Math.round(bb.y + bb.h + 10)}px` : "";
  if (toastEl && top !== toastTop) toastEl.style.top = toastTop = top;
}
{
  const els = ["#hud .hud-tr", "#buffs", "#where", "#minimap", "#xpbar"].map((s) => document.querySelector<HTMLElement>(s));
  renderer.hudAvoid = () => {
    const c = canvas.getBoundingClientRect();
    return els.filter((e): e is HTMLElement => !!e).map((e) => {
      const r = e.getBoundingClientRect();
      return { left: r.left - c.left, top: r.top - c.top, right: r.right - c.left, bottom: r.bottom - c.top };
    });
  };
}
function applyAuto() {
  game.auto = { hp: settings.autoHp, hpAt: settings.autoHpAt, mp: settings.autoMp };
}
applyAuto();
if (game.inTown && game.maxFloor <= 1 && game.player.kills === 0)
  setTimeout(() => game.inTown && game.maxFloor <= 1 && ui.toast("Walk to the glowing waypoint ✦ to enter the crypt", 6000), 1800);

// ---- v1.0: heroes (slots) and the shared stash
/** Newest stash wins: take the shared copy if it changed after this hero's, else publish this hero's. */
function syncStash() {
  const sh = loadSharedStash();
  if (sh && sh.at > game.stashAt) {
    const mine = new Set<number>();
    for (const e of game.player.bag) mine.add(e.item.uid);
    for (const it of Object.values(game.player.equip)) if (it) mine.add(it.uid);
    const items = (sh.items as typeof game.player.stash).filter((e) => e && e.item && typeof e.item.baseId === "string" && ITEM_BASES.some((b) => b.id === e.item.baseId));
    for (const e of items) if (mine.has(e.item.uid)) e.item = { ...e.item, uid: e.item.uid + 7 + Math.floor(Math.random() * 1e6) };
    // v1.4: an old shared stash can hold items with the same stat twice: merge them (higher value kept)
    let merged = 0;
    for (const e of items) if (mergeDuplicateMods(e.item) > 0) merged++;
    if (merged) {
      game.mergedItems += merged;
      saveSharedStash(sh.at, items);
    }
    game.player.stash = items;
    game.stashAt = sh.at;
  } else if (!sh || game.stashAt > sh.at) saveSharedStash(game.stashAt || Date.now(), game.player.stash);
  afterLoad();
}
/**
 * v1.3.2: after a hero is loaded and the shared stash is in place: an Amazon's old off-hand weapon that fit in neither
 * the bag nor the stash goes into the stash now if there is room (and the shared stash is saved), otherwise it waits on
 * the ground in camp; then tell the player once where it went.
 */
function afterLoad() {
  if (game.placeUnclaimed()) saveSharedStash(game.stashAt, game.player.stash);
  if (game.mergedItems > 0) {
    const n = game.mergedItems;
    game.mergedItems = 0;
    setTimeout(() => ui.toast(`${n} item${n === 1 ? " had" : "s had"} the same affix twice: merged into one row, keeping the higher value.`, 7000), 4200);
    setTimeout(() => doSave(true), 0);
  }
  const note = game.takeOffhandNote();
  if (note) {
    setTimeout(() => ui.toast(note, 8000), 2600); // after the "walk to the waypoint" hint (1.8 s) so it is not covered
    setTimeout(() => doSave(true), 0);
  }
}
function lookOfSave(d: SaveData) {
  const e = d.player.equip as Record<string, { baseId: string } | undefined>;
  const L = (k: string) => lookOf(e[k] as Parameters<typeof lookOf>[0]);
  return { main: L("main"), off: L("off"), head: L("head"), chest: L("chest"), gloves: L("gloves"), boots: L("boots") };
}
function heroCards(): HeroCard[] {
  return listHeroes().map((h) => {
    const d = readSlot(h.slot);
    return { ...h, cls: (isHeroClass(h.cls) ? h.cls : "barbarian") as HeroClass, look: d ? lookOfSave(d) : {} };
  });
}
/** Save the current hero, then load (or create) another one. */
function switchHero(n: number, hero?: { cls: HeroClass; name: string }) {
  if (canSave()) doSave();
  setSlot(n);
  cloud?.setSlot(n);
  const r = hero ? null : loadGame();
  let g: Game;
  try {
    g = r?.data ? new Game(events, r.data) : new Game(events, null, undefined, hero ?? { cls: "barbarian", name: "" });
  } catch (err) {
    console.error("Ember Crypt: hero failed to load", err);
    keepDamaged();
    pauseSaving();
    ui.toast("That hero couldn't be opened by this version. It is kept untouched.", 6000);
    g = new Game(events, null, undefined, { cls: "barbarian", name: "" });
  }
  game = g;
  saved = r?.data ?? null;
  syncStash();
  applyAuto();
  input.reset();
  ui.close();
  if (!r?.data && canSave()) doSave(true);
  ui.refresh();
  lastTown = game.inTown;
  ui.toast(hero ? `${game.player.name} the ${CLASS_NAME[hero.cls] ?? "hero"} arrives at Ember Camp` : `Playing ${game.player.name} · level ${game.player.level}`, 3500);
  if (cloud) setTimeout(() => void cloudSync(), 1500);
}
const heroSelect = new HeroSelect(app, {
  heroes: heroCards,
  current: () => currentSlot(),
  canCreate: () => freeSlot() !== null,
  pick: (n) => {
    if (n !== currentSlot()) switchHero(n);
  },
  create: (cls, name) => {
    const n = freeSlot();
    if (n !== null) switchHero(n, { cls, name });
  },
  click: () => sfx.play("click"),
  /** v1.0.1: delete a hero. Returns true when it was the hero being played (the select then stays open). */
  remove: (n) => {
    const cur = n === currentSlot();
    if (cur) {
      if (canSave()) doSave(); // publishes the shared stash first, so it keeps the latest items
      pauseSaving(); // the paused game must not write the deleted hero back
    }
    if (!deleteHero(n)) return false;
    if (cloud) void cloud.remove(n).catch(() => {});
    ui.toast("Hero deleted. Your other heroes and the shared stash are untouched.", 4000);
    return cur;
  },
});
/** v1.0 Files backup: the current hero plus every other hero on this device and the shared stash. */
function bundle() {
  const heroes = listHeroes()
    .filter((h) => h.slot !== currentSlot())
    .map((h) => ({ slot: h.slot, data: readSlot(h.slot) }))
    .filter((h) => h.data);
  return { ...withSettings(), slot: currentSlot(), heroes, sharedStash: loadSharedStash() };
}
/** Restore the other heroes of a Files backup into their slots when those are empty or older (never overwrites newer). */
function restoreBundle(d: SaveData): number {
  const extra = (d as unknown as { heroes?: { slot: number; data: unknown }[] }).heroes;
  if (!Array.isArray(extra)) return 0;
  let n = 0;
  const cur = currentSlot();
  for (const h of extra) {
    if (!h || typeof h.slot !== "number" || h.slot === cur || h.slot < 1 || h.slot > MAX_HEROES) continue;
    const hd = parseSave(JSON.stringify(h.data)).data;
    if (!hd) continue;
    const have = readSlot(h.slot);
    if (have && (have.savedAt ?? 0) >= (hd.savedAt ?? 0)) continue;
    setSlot(h.slot);
    if (saveGame(hd, { force: true })) n++;
    setSlot(cur);
  }
  return n;
}

// ---- v0.9: cloud save (off unless the build has a free Supabase project configured and VITE_CLOUD=1, or ?cloud)
function cloudHooks(c: Cloud) {
  return {
    signedIn: () => c.signedIn,
    email: () => c.session?.email ?? "",
    status: () => (c.lastSyncAt ? `synced ${new Date(c.lastSyncAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "not synced yet"),
    sendCode: (email: string) => c.sendCode(email).catch((e) => String(e?.message ?? e)),
    verify: (email: string, code: string) => c.verify(email, code).catch((e) => String(e?.message ?? e)),
    syncNow: () => cloudSync(true),
    signOut: () => c.signOut(),
  };
}
let cloudBusy = false;
async function cloudSync(manual = false): Promise<string> {
  if (!cloud?.signedIn || cloudBusy || !canSave()) return "";
  cloudBusy = true;
  try {
    if (dirty) doSave();
    const local = lastSavedAt() ? { ...withSettings(), savedAt: lastSavedAt() } : null;
    const r = await cloud.sync(local);
    if (r.kind === "pulled") {
      replaceGame(r.data); // the hero on this device goes into Backups first
      cloud.adopted(lastSavedAt());
      ui.toast(`Cloud save: loaded your level ${r.data.player.level} hero from your other device. This device's hero is in Backups.`, 6000);
      return "Loaded the newer hero from the cloud.";
    }
    await pullOtherHeroes();
    if (r.kind === "pushed") return manual ? "Saved to the cloud." : "";
    if (r.kind === "none") return manual ? "Already in sync." : "";
    if (r.kind === "offline") return "Offline: will sync when you're back online.";
    if (r.kind === "signed-out") return "Signed out (session expired). Sign in again to sync.";
    return `Sync failed: ${r.message ?? "unknown error"}`;
  } finally {
    cloudBusy = false;
  }
}
/** v1.0: heroes that exist only in the cloud (made on another device) are copied into their empty slots here. */
async function pullOtherHeroes() {
  if (!cloud) return;
  try {
    const rows = await cloud.pullAll();
    for (const row of rows) {
      const n = row.slot ?? 1;
      if (n === currentSlot() || n < 1 || n > MAX_HEROES || readSlot(n) || row.saved_at <= deletedAt(n)) continue;
      const d = parseSave(JSON.stringify({ ...row.data, savedAt: row.saved_at })).data;
      if (!d) continue;
      const cur = currentSlot();
      setSlot(n);
      const ok = saveGame(d, { force: true });
      const at = d.savedAt ?? 0;
      setSlot(cur);
      if (ok) cloud.markSynced(n, row.saved_at, at);
    }
  } catch {
    /* next time */
  }
}
if (cloud) {
  setTimeout(() => void cloudSync(), 2500);
  setInterval(() => void cloudSync(), 60_000);
  addEventListener("online", () => void cloudSync());
  document.addEventListener("visibilitychange", () => void cloudSync());
}

/** v0.8.3: a gentle nudge to back up to Files when the last file backup is over a day old. */
function remindBackup(delay: number) {
  if (!takeBackupReminder(game.player.level)) return;
  setTimeout(() => ui.toast("Your hero hasn't been backed up to Files in a while: Settings → 📁 Back up to Files.", 7000), delay);
}

// ---- saving: debounced after any change, right away on level-up / town, every 8 s, and when the app is hidden
function withSettings(): SaveData {
  const { tutorialSeen: _t, ...rest } = settings;
  return { ...game.toSave(), settings: rest };
}
function doSave(backup = false) {
  dirty = false;
  saveT = 0;
  if (saveGame(withSettings(), { backup })) ui.savedChanged();
  const sh = loadSharedStash();
  if (!sh || game.stashAt > sh.at) saveSharedStash(game.stashAt || Date.now(), game.player.stash);
}
let saveTimer = 0;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    doSave();
  }, 400);
}
/** Swap in another hero (import or backup); the current one is kept as a backup first. */
function replaceGame(d: SaveData) {
  // v0.8.3: the current hero always goes into the backups first
  saveGame(withSettings(), { force: true });
  const others = restoreBundle(d);
  game = new Game(events, d);
  syncStash();
  if (others) setTimeout(() => ui.toast(`Also restored ${others} other hero${others === 1 ? "" : "es"} from the backup (Settings → Change hero).`, 6000), 2500);
  if (d.settings) {
    Object.assign(settings, cleanSettings(d.settings, settings));
    saveSettings(settings);
    sfx.enabled = settings.sound;
    renderer.shakeOn = settings.shake;
  }
  applyAuto();
  ui.close();
  doSave(true);
  ui.refresh();
  if (d.refundedPoints) setTimeout(() => ui.toast(`Skill tree updated to match Diablo II: ${d.refundedPoints} point${d.refundedPoints === 1 ? "" : "s"} refunded (${d.refundedSkills!.join(", ")}).`, 7000), 3000);
}
if (loaded?.recovered) {
  setTimeout(() => ui.toast(`Your last save was damaged. Restored the backup from ${new Date(lastSavedAt()).toLocaleString()}.`), 700);
} else if (loaded?.newer) {
  setTimeout(() => ui.toast("This device has a save from a newer version. Reload to update; saving is paused so it isn't overwritten."), 700);
} else if (!saved && !fresh) {
  // nothing in localStorage: Safari may have cleared it, so try the IndexedDB mirror
  void loadFromIdb().then((d) => {
    if (d && game.player.level === 1 && game.player.kills === 0 && game.player.xp === 0) {
      game = new Game(events, d);
      syncStash();
      applyAuto();
      ui.refresh();
      ui.toast(`Restored your level ${d.player.level} hero from backup storage`);
    }
  });
}
input.onJoyChange = () => ui.updateJoystick();
// v1.0: the game opens on the hero select (test runs with ?debug skip it unless ?select is given)
if (!DEBUG || params.has("select")) heroSelect.show({ closable: false });

let tutorial = !settings.tutorialSeen;
let tutorialT = 0;
ui.showTutorial(tutorial);
if (saved?.migratedSold !== undefined) {
  const n = saved.migratedSold;
  const what = saved.migratedFrom === 1 ? "Your bag now uses a grid, like Diablo II." : "Your gear was converted to the new item classes.";
  setTimeout(() => ui.toast(n ? `${what} ${n} item${n === 1 ? "" : "s"} didn't fit and were sold.` : what), 600);
}
if (saved?.actsFrom !== undefined) {
  // converted from the single endless crypt: write the v6 save now, and explain the acts once
  setTimeout(() => doSave(true), 0);
  if (saved.actsFrom > 1) setTimeout(() => ui.toast("The crypt now leads to four acts of 20 levels. Your hero keeps their progress in Act I; the Ember Lich waits on level 20.", 7000), 5200);
}
if (saved?.cappedPoints) {
  const n = saved.cappedPoints;
  setTimeout(() => ui.toast(`Skills now follow Diablo II's level cap (1 point per character level after a skill unlocks). ${n} point${n === 1 ? "" : "s"} refunded from ${saved?.cappedSkills?.join(", ")}.`, 7000), 2600);
}
if (saved?.refundedPoints) {
  const n = saved.refundedPoints;
  setTimeout(
    () => ui.toast(`The skill tree now matches Diablo II. ${n} skill point${n === 1 ? "" : "s"} refunded (${saved?.refundedSkills?.join(", ")}): spend them again in Skills.`, 7000),
    1400,
  );
}
input.onFirstTouch = () => {
  void requestPersist();
};
// iOS audio: only the end of a tap counts as a gesture that may start sound, so unlock on
// touchend / pointerup / click / keydown, every time until it's running (also after backgrounding)
for (const ev of ["touchend", "pointerup", "click", "keydown"]) document.addEventListener(ev, () => sfx.unlock(), { capture: true, passive: true });
document.addEventListener("visibilitychange", () => sfx.visibility(document.visibilityState === "visible"));
window.addEventListener("pageshow", () => sfx.visibility(true));

// ---- iOS hardening: no zoom, no scroll, no callouts
for (const ev of ["gesturestart", "gesturechange", "gestureend", "dblclick", "contextmenu"]) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener(
  "touchmove",
  (e) => {
    const t = e.target as HTMLElement;
    // v0.8.2: the compare sheet's cards scroll by touch too
    if (!t.closest?.(".pbody, .ccard, .hbox")) e.preventDefault();
  },
  { passive: false },
);

// ---- sizing / orientation
let portrait = false;
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  portrait = h > w;
  document.body.classList.toggle("portrait", portrait);
  renderer.resize(w, h);
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 200));
resize();

// v0.9.4: below 35% life a soft heartbeat plays once per beat, in step with the red edge pulse (renderer.lowLifeBeat)
let beatPh = 1;
function heartbeat(paused: boolean) {
  const p = game.player;
  const low = !paused && !p.dead && p.hp / game.derived().maxHp < LOW_LIFE;
  const ph = game.time % 1;
  if (low && ph < beatPh) sfx.play("heartbeat");
  beatPh = low ? ph : 1;
}

// ---- loop
let last = performance.now();
let saveT = 0;
let lastTown = game.inTown;
let fpsAcc = 0;
let fpsN = 0;
let fps = 60;
let frameErrs = 0;
let booted = false;
function frame(now: number) {
  requestAnimationFrame(frame);
  try {
    step(now);
    frameErrs = 0;
    if (!booted) {
      booted = true;
      boot?.ok();
    }
  } catch (err) {
    // v0.8.1: a bad frame is logged; a game that keeps failing shows the error instead of a black screen
    frameErrs++;
    if (frameErrs === 1) console.error("Ember Crypt frame error", err);
    if (frameErrs === 90 && boot) {
      boot.after = true;
      boot.show("The game stopped because of an error. Your progress up to now is saved.", String((err as Error)?.stack ?? err).slice(0, 400));
    }
  }
}
function step(now: number) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  if (!(dt > 0)) dt = 0;
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc >= 1) {
    fps = Math.round(fpsN / fpsAcc);
    fpsAcc = 0;
    fpsN = 0;
  }
  const paused = portrait || ui.openTab !== null || document.hidden || heroSelect.open;
  if (!paused) {
    // taps on the world: pick up items
    for (const t of input.taps) {
      const g = renderer.hitTest(game, t.x, t.y);
      if (g) game.tapGround(g);
      else if (renderer.hitStash(game, t.x, t.y)) {
        if (game.nearStash()) ui.open("stash");
        else ui.toast("Walk up to the stash chest to open it");
      } else if (renderer.hitCrafter(game, t.x, t.y)) {
        if (game.nearCrafter()) ui.open("craft");
        else ui.toast("Walk up to Brann to craft");
      } else if (renderer.hitVendor(game, t.x, t.y)) {
        if (game.nearVendor()) ui.open("shop");
        else ui.toast("Walk up to Hilde to trade");
      }
    }
    input.taps.length = 0;
    const v = input.vector();
    // a tap that went down and up between two frames still fires once
    game.update(dt, { ...v, attack: input.attack || input.pressedAttack, skills: input.skills.map((s, i) => s || input.pressedSkills[i]) });
    input.pressedAttack = false;
    input.pressedSkills.fill(false);
    if (tutorial) {
      tutorialT += dt;
      if (v.mag > 0 || input.attack || tutorialT > 9) {
        if (v.mag > 0 || tutorialT > 9) {
          tutorial = false;
          settings.tutorialSeen = true;
          saveSettings(settings);
          ui.showTutorial(false);
        }
      }
    }
  } else input.taps.length = 0;
  renderer.render(game, paused ? 0 : dt, settings.labels);
  heartbeat(paused);
  placeToast();
  ui.updateHud();
  ui.tick(dt);
  saveT += dt;
  if (game.inTown !== lastTown) {
    // arriving in camp (or leaving it) is a good checkpoint: save now and keep a backup
    lastTown = game.inTown;
    doSave(game.inTown);
  } else if ((dirty && saveT > 1) || saveT > 8) doSave();
}
requestAnimationFrame(frame);
window.addEventListener("pagehide", () => doSave());
document.addEventListener("freeze", () => doSave());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) doSave();
  last = performance.now();
});

// ---- debug hooks for automated tests (dev builds or ?debug only)
if (DEBUG) (window as unknown as { __ec: unknown }).__ec = {
  sfx,
  get game() {
    return game;
  },
  renderer,
  input,
  ui,
  settings,
  items: { makeItem, enchant, rollDrop, migrateItem },
  data: { ITEM_BASES, AFFIXES, SKILLS },
  get fps() {
    return fps;
  },
};

// ---- PWA
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    // v0.8.1: always fetch a fresh sw.js (never from the HTTP cache) and check for updates when the app comes back
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .then((reg) => {
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
}
