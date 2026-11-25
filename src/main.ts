import { SKILLS } from "./data/skills";
import "./styles.css";
import { AFFIXES, enchant, rollDrop } from "./data/affixes";
import { ITEM_BASES, makeItem, migrateItem } from "./data/items";
import { Sfx } from "./audio";
import { Game, type GameEvents, type SaveData } from "./game";
import { Input } from "./input";
import { LOW_LIFE, Renderer } from "./render";
import {
  canSave, clearGame, exportCode, importCode, lastSavedAt, listBackups, loadBackup, loadFromIdb, loadGame, loadSettings, cleanSettings,
  keepDamaged, pauseSaving, requestPersist, saveGame, saveSettings, lastFileBackup, markFileBackup, backupFileName, takeBackupReminder,
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
let game = startGame();

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
    clearGame();
    game = new Game(events, null);
    applyAuto();
    doSave();
    ui.refresh();
    ui.toast("A new Barbarian enters the Ember Crypt (your old hero is in the backups)");
  },
  save: {
    lastSaved: () => lastSavedAt(),
    canSave: () => canSave(),
    exportCode: () => exportCode(withSettings()),
    exportJson: () => JSON.stringify(withSettings(), null, 1),
    importCode: (text: string) => importCode(text),
    backups: () => listBackups(),
    loadBackup: (key: string) => loadBackup(key),
    replace: (d: SaveData) => replaceGame(d),
    lastFileBackup: () => lastFileBackup(),
    markFileBackup: () => markFileBackup(),
    fileName: () => backupFileName(game.player.level),
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
  const els = ["#hud .hud-tr", "#buffs", "#minimap", "#xpbar"].map((s) => document.querySelector<HTMLElement>(s));
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
    if (r.kind === "pushed") return manual ? "Saved to the cloud." : "";
    if (r.kind === "none") return manual ? "Already in sync." : "";
    if (r.kind === "offline") return "Offline: will sync when you're back online.";
    if (r.kind === "signed-out") return "Signed out (session expired). Sign in again to sync.";
    return `Sync failed: ${r.message ?? "unknown error"}`;
  } finally {
    cloudBusy = false;
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
  game = new Game(events, d);
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
      applyAuto();
      ui.refresh();
      ui.toast(`Restored your level ${d.player.level} hero from backup storage`);
    }
  });
}
input.onJoyChange = () => ui.updateJoystick();

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
    if (!t.closest?.(".pbody, .ccard")) e.preventDefault();
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
  const paused = portrait || ui.openTab !== null || document.hidden;
  if (!paused) {
    // taps on the world: pick up items
    for (const t of input.taps) {
      const g = renderer.hitTest(game, t.x, t.y);
      if (g) game.tapGround(g);
      else if (renderer.hitStash(game, t.x, t.y)) {
        if (game.nearStash()) ui.open("stash");
        else ui.toast("Walk up to the stash chest to open it");
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
