import "./styles.css";
import { Sfx } from "./audio";
import { Game, type GameEvents } from "./game";
import { Input } from "./input";
import { Renderer } from "./render";
import { clearGame, loadGame, loadSettings, saveGame, saveSettings } from "./save";
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
    ui.refresh();
  },
  died: () => {
    input.reset();
    setTimeout(() => ui.showDeath(), 900);
  },
  levelUp: (lvl) => ui.toast(`Level ${lvl}! +1 skill point, +5 stat points`),
  shake: (a) => (renderer.shake = Math.max(renderer.shake, a)),
};

const params = new URLSearchParams(location.search);
// test/debug switches only work in dev builds or with ?debug
const DEBUG = import.meta.env.DEV || params.has("debug");
const fresh = DEBUG && params.has("new");
if (fresh) clearGame();
const saved = fresh ? null : loadGame();
let game = new Game(events, saved, DEBUG && params.has("seed") ? Number(params.get("seed")) : undefined);

const ui = new Ui(app, () => game, input, settings, {
  settingsChanged: () => {
    saveSettings(settings);
    sfx.enabled = settings.sound;
    renderer.shakeOn = settings.shake;
    ui.updateJoystick();
  },
  newGame: () => {
    clearGame();
    game = new Game(events, null);
    ui.refresh();
    ui.toast("A new Barbarian enters the Ember Crypt");
  },
  click: () => sfx.play("click"),
});
renderer.setMinimap(ui.minimap);
input.onJoyChange = () => ui.updateJoystick();

let tutorial = !settings.tutorialSeen;
let tutorialT = 0;
ui.showTutorial(tutorial);
if (saved?.migratedSold !== undefined) {
  const n = saved.migratedSold;
  setTimeout(() => ui.toast(n ? `Your bag now uses a grid. ${n} item${n === 1 ? "" : "s"} didn't fit and were sold.` : "Your bag now uses a grid, like Diablo II."), 600);
}
input.onFirstTouch = () => sfx.unlock();
document.addEventListener("pointerdown", () => sfx.unlock(), { capture: true });

// ---- iOS hardening: no zoom, no scroll, no callouts
for (const ev of ["gesturestart", "gesturechange", "gestureend", "dblclick", "contextmenu"]) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener(
  "touchmove",
  (e) => {
    const t = e.target as HTMLElement;
    if (!t.closest?.(".pbody")) e.preventDefault();
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

// ---- loop
let last = performance.now();
let saveT = 0;
let fpsAcc = 0;
let fpsN = 0;
let fps = 60;
function frame(now: number) {
  requestAnimationFrame(frame);
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
      else if (renderer.hitVendor(game, t.x, t.y)) {
        if (game.nearVendor()) ui.open("shop");
        else ui.toast("Walk up to Hilde to trade");
      }
    }
    input.taps.length = 0;
    const v = input.vector();
    game.update(dt, { ...v, attack: input.attack, skills: input.skills });
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
  ui.updateHud();
  ui.tick(dt);
  saveT += dt;
  if ((dirty && saveT > 1) || saveT > 8) {
    saveT = 0;
    dirty = false;
    saveGame(game.toSave());
  }
}
requestAnimationFrame(frame);
window.addEventListener("pagehide", () => saveGame(game.toSave()));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveGame(game.toSave());
  last = performance.now();
});

// ---- debug hooks for automated tests (dev builds or ?debug only)
if (DEBUG) (window as unknown as { __ec: unknown }).__ec = {
  get game() {
    return game;
  },
  renderer,
  input,
  ui,
  settings,
  get fps() {
    return fps;
  },
};

// ---- PWA
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
