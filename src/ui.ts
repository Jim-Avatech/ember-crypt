import { modText } from "./data/affixes";
import {
  BASE_BY_ID, EQUIP_LABEL, type EquipSlot, type Item, QUALITY_LABEL, SLOT_LABEL, baseDamage, baseDefense, beltSlotsOf, ilvlOf,
  isTwoHanded, itemDamage, itemDefense, itemName, itemPrice, itemReqs, qualityOf, sellPrice,
} from "./data/items";
import type { SaveData } from "./game";
import { MAX_SKILL_LVL, SKILLS, SKILL_BY_ID, SKILL_SLOTS, type Tab, TAB_NAMES } from "./data/skills";
import { type Game, type Stats, VENDOR_H, VENDOR_W, xpForLevel } from "./game";
import { Input } from "./input";
import { GRID_H, GRID_W, STASH_H, STASH_W, overlapping, sizeOf } from "./inventory";
import type { Settings } from "./save";
import { type GuideSec, guideHtml } from "./guide";
import { itemIconUrl } from "./sprites/items";
import { artifactIcon } from "./sprites/artifacts";
import { ACTS, ARTIFACTS, LEVELS_PER_ACT, actDef, actOf, firstFloorOf, hasWaypoint, isFinalLevel, levelInAct } from "./data/acts";
import { MONSTERS } from "./data/monsters";

const artUrl = new Map<string, string>();
/** data: URL of an artifact icon (cached). */
const artifactUrl = (id: string, sil = false) => {
  const k = `${id}|${sil}`;
  let u = artUrl.get(k);
  if (!u) {
    u = artifactIcon(id, sil).toDataURL();
    artUrl.set(k, u);
  }
  return u;
};
/** "Ember Crypt · Level 3" */
const floorLabel = (f: number) => (f <= 0 ? "Ember Camp" : `${actDef(f).area} · Level ${levelInAct(f)}/${LEVELS_PER_ACT}`);

export type PanelTab = "char" | "inv" | "skills" | "arts" | "guide" | "settings" | "shop" | "wp" | "stash";

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Paper-doll layout in doll units: [x, y] of each slot's top-left; sizes come from EQUIP_SIZE. */
const DOLL: Record<EquipSlot, [number, number, number, number]> = {
  head: [2.25, 0, 2, 2],
  amulet: [4.6, 0.5, 1, 1],
  main: [0, 1.5, 2, 4],
  chest: [2.25, 2.25, 2, 3],
  off: [4.5, 1.5, 2, 4],
  gloves: [0, 5.75, 2, 2],
  belt: [2.25, 5.5, 2, 1],
  ring1: [2.25, 6.75, 1, 1],
  ring2: [3.25, 6.75, 1, 1],
  boots: [4.5, 5.75, 2, 2],
};
const DOLL_W = 6.5;
const DOLL_H = 7.75;
/** On touch, the dragged item floats this far above the finger so it stays visible. */
export const DRAG_LIFT = 26;

type Src = "bag" | "eq" | "vendor" | "stash";
type GridName = "bag" | "stash";
interface Sel {
  src: Src;
  uid?: number;
  slot?: EquipSlot;
}
type Target =
  | { kind: "grid"; grid: GridName; x: number; y: number; ok: "ok" | "swap" | "bad" }
  | { kind: "grid"; grid: "vendor"; ok: "ok" | "bad" }
  | { kind: "slot"; slot: EquipSlot; ok: "ok" | "bad" }
  | { kind: "ground"; ok: "ok" | "bad" }
  | null;

interface Press {
  pid: number;
  x: number;
  y: number;
  sel: Sel | null;
  grid?: "bag" | "vendor" | "stash";
  slot?: EquipSlot;
  moved: boolean;
  touch: boolean;
  ghost?: HTMLElement;
  target?: Target;
}

export interface SaveTools {
  lastSaved(): number;
  canSave(): boolean;
  exportCode(): string;
  exportJson(): string;
  importCode(text: string): SaveData | null;
  backups(): { key: string; level: number; savedAt: number }[];
  lastFileBackup(): number;
  /** v0.9 cloud save (only present when the build has a Supabase project and the flag is on) */
  cloud?: {
    signedIn(): boolean;
    email(): string;
    status(): string;
    sendCode(email: string): Promise<string | null>;
    verify(email: string, code: string): Promise<string | null>;
    syncNow(): Promise<string>;
    signOut(): void;
  };
  markFileBackup(): void;
  fileName(): string;
  loadBackup(key: string): SaveData | null;
  replace(d: SaveData): void;
}

export interface UiHooks {
  settingsChanged(): void;
  newGame(): void;
  click(): void;
  /** plays a chime (inside the tap) and returns the audio state */
  testSound(): string;
  soundState(): string;
  save: SaveTools;
}

export class Ui {
  root: HTMLElement;
  panel: HTMLElement;
  openTab: PanelTab | null = null;
  private skillTab: Tab = "combat";
  private selSkill: string | null = "bash";
  private sel: Sel | null = null;
  private lastHud = "";
  private toastT = 0;
  private confirmReset = false;
  private openedAt = 0;
  private guideSec: GuideSec = "classes";
  private saveMsg = "";
  private exportShown = "";
  private importOpen = false;
  private importText = "";
  private importPending: SaveData | null = null;
  private btnTap: { id: number; x: number; y: number } | null = null;
  private lastPanelDown = 0;
  private press: Press | null = null;
  /** a click synthesized right where a drag ended is ignored */
  private suppress = { x: 0, y: 0, t: 0 };
  /** bag cell size and doll unit for the current layout (CSS px) */
  C = 30;
  U = 27;
  VC = 24;
  joy!: HTMLElement;
  minimap!: HTMLCanvasElement;

  constructor(
    root: HTMLElement,
    private game: () => Game,
    private input: Input,
    private settings: Settings,
    private hooks: UiHooks,
  ) {
    this.root = root;
    root.insertAdjacentHTML(
      "beforeend",
      `
      <div id="joy" aria-hidden="true"><div class="joy-knob"></div></div>
      <div id="hud">
        <div class="hud-tl">
          <div id="buffs"></div>
          <canvas id="minimap" width="150" height="90"></canvas>
        </div>
        <div class="hud-tr">
          <button class="mbtn town" id="btn-town" aria-label="Return to Town" hidden><span class="ti">⌂</span> Town<i class="rfill"></i></button>
          <button class="mbtn" data-tab="char" aria-label="Character">Char<i class="dot" id="dot-char"></i></button>
          <button class="mbtn" data-tab="inv" aria-label="Inventory">Bag</button>
          <button class="mbtn" data-tab="skills" aria-label="Skills">Skills<i class="dot" id="dot-skills"></i></button>
          <button class="mbtn" data-tab="settings" aria-label="Settings">⚙</button>
        </div>
        <div class="globe life" aria-label="Life"><div class="fill"></div><span></span></div>
        <div class="globe mana" aria-label="Mana"><div class="fill"></div><span></span></div>
        <div id="xpbar"><div class="fill"></div></div>
        <button id="btn-attack" class="abtn" aria-label="Attack"><span>⚔</span><b class="ammo"></b></button>
        <button id="btn-s0" class="sbtn" data-slot="0"></button>
        <button id="btn-s1" class="sbtn" data-slot="1"></button>
        <button id="btn-s2" class="sbtn" data-slot="2"></button>
        <button id="btn-hp" class="pbtn hp" aria-label="Healing potion"><b></b></button>
        <button id="btn-mp" class="pbtn mp" aria-label="Mana potion"><b></b></button>
        <button id="btn-ctx" hidden></button>
        <div id="tutorial" hidden>
          <div class="tut-left">Put your thumb anywhere here<br/>and drag to move</div>
          <div class="tut-right">Tap or hold ⚔ to attack →</div>
        </div>
      </div>
      <div id="toast"></div>
      <div id="panel" hidden></div>
      <div id="death" hidden>
        <div class="death-title">You have died</div>
        <button id="btn-respawn" class="gbtn">Wake in camp</button>
        <div class="death-sub">You'll return to Ember Camp. You lose 10% of your gold.</div>
      </div>
      <div id="rotate"><div class="phone"></div><div>Turn your phone sideways to play</div></div>
    `,
    );
    this.panel = $(root, "#panel");
    this.joy = $(root, "#joy");
    this.minimap = $(root, "#minimap");

    Input.holdButton($(root, "#btn-attack"), (v) => {
      input.attack = v;
      if (v) input.pressedAttack = true;
    });
    for (let i = 0; i < SKILL_SLOTS; i++) {
      const el = $(root, `#btn-s${i}`);
      Input.holdButton(
        el,
        (v) => {
          input.skills[i] = v && !!this.game().player.slots[i];
          if (input.skills[i]) input.pressedSkills[i] = true;
        },
        () => {
          if (!this.game().player.slots[i]) {
            this.selSkill = null;
            this.open("skills");
          }
        },
      );
    }
    Input.tapButton($(root, "#btn-hp"), () => this.game().usePotion("hp"));
    Input.tapButton($(root, "#btn-mp"), () => this.game().usePotion("mp"));
    Input.tapButton($(root, "#btn-ctx"), () => this.contextTap());
    Input.tapButton($(root, "#btn-town"), () => this.recallTap());
    Input.tapButton($(root, "#btn-respawn"), () => {
      this.game().respawn();
      $(root, "#death").hidden = true;
    });
    root.querySelectorAll<HTMLElement>(".mbtn[data-tab]").forEach((b) => Input.tapButton(b, () => this.open(b.dataset.tab as PanelTab)));
    this.panel.addEventListener("pointerdown", (e) => {
      this.lastPanelDown = performance.now();
      // buttons: our own tap tracking (fires on pointerup), so iOS's click rules can't drop taps
      if (!(e.target as HTMLElement).closest(".dnd")) this.btnTap = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.onDown(e);
    });
    this.panel.addEventListener("pointermove", (e) => this.onMove(e));
    this.panel.addEventListener(
      "scroll",
      (e) => {
        const t = e.target as HTMLElement;
        if (t.classList?.contains("ccard")) Ui.markMore(t);
      },
      true,
    );
    this.panel.addEventListener("pointerup", (e) => {
      const bt = this.btnTap;
      if (bt && bt.id === e.pointerId) {
        this.btnTap = null;
        if (Math.hypot(e.clientX - bt.x, e.clientY - bt.y) < 24 && !(e.target as HTMLElement).closest(".dnd")) {
          e.preventDefault();
          this.onPanelTap(e.target as HTMLElement, e.clientX, e.clientY);
          return;
        }
      }
      this.onUp(e);
    });
    this.panel.addEventListener("pointercancel", () => {
      this.btnTap = null;
      this.cancelDrag();
    });
    // synthesized clicks are ignored: every panel action runs from pointerup above
    // (except form controls: the file picker needs its real click)
    this.panel.addEventListener("click", (e) => {
      if (!(e.target as HTMLElement).closest("label, input, textarea")) e.preventDefault();
    });
    this.panel.addEventListener("input", (e) => {
      const t = e.target as HTMLTextAreaElement;
      if (t.id === "impcode") this.importText = t.value;
    });
    this.panel.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === "impfile" && t.files?.[0]) void this.importFile(t.files[0]);
    });
  }

  /** Town button: start (or cancel) Return to Town. */
  recallTap() {
    const g = this.game();
    if (g.inTown) return;
    if (g.recall) {
      g.recall = null;
      this.toast("Return to Town cancelled");
    } else if (g.startRecall()) this.toast("Returning to Ember Camp… (walk to cancel)");
  }

  /** The button above the controls: descend, trade or use the waypoint. */
  contextTap() {
    const g = this.game();
    const a = g.contextAction();
    if (a === "descend") g.descend();
    else if (a === "trade") this.open("shop");
    else if (a === "stash") this.open("stash");
    else if (a === "waypoint") this.open("wp");
    else if (a === "portal") g.usePortal();
  }

  // ------------------------------------------------------------ HUD
  updateHud() {
    const g = this.game();
    const p = g.player;
    const d = g.derived();
    const hpPct = Math.max(0, p.hp / d.maxHp);
    const mpPct = Math.max(0, p.mana / d.maxMana);
    const prev = xpForLevel(p.level);
    const next = xpForLevel(p.level + 1);
    const xpPct = (p.xp - prev) / Math.max(1, next - prev);
    const slots = p.slots.map((s) => (s ? `${s}:${(SKILL_BY_ID[s].mana?.(g.skillLevel(s)) ?? 0) <= p.mana ? 1 : 0}` : "-")).join(",");
    const ctx = g.contextAction();
    const key = [
      Math.round(hpPct * 200), Math.round(mpPct * 200), Math.round(xpPct * 300), Math.ceil(p.hp), Math.ceil(p.mana),
      p.hpPots, p.mpPots, slots, p.statPoints, p.skillPoints, g.floor, g.inTown, p.level, ctx,
      Math.ceil(p.buffs.shout), Math.ceil(p.buffs.bo), Math.ceil(p.buffs.bcmd), p.buffs.conc > 0, p.buffs.bers > 0, p.frenzy.stacks, Math.ceil(p.frenzy.t), g.maxFloor,
      g.recall ? Math.round((g.recall.t / g.recall.dur) * 40) : -1, g.portal?.floor ?? 0, p.chillT > 0, p.poison.t > 0, p.artifacts.length, g.victory,
      p.equip.main?.qty ?? -1, p.equip.off?.qty ?? -1, p.equip.main?.baseId, g.potionWait("hp") > 0, g.potionWait("mp") > 0,
    ].join("|");
    if (key === this.lastHud) return;
    this.lastHud = key;
    const r = this.root;
    $(r, ".globe.life .fill").style.transform = `translateY(${(1 - hpPct) * 100}%)`;
    $(r, ".globe.mana .fill").style.transform = `translateY(${(1 - mpPct) * 100}%)`;
    $(r, ".globe.life span").textContent = `${Math.ceil(p.hp)}`;
    $(r, ".globe.mana span").textContent = `${Math.ceil(p.mana)}`;
    $(r, "#xpbar .fill").style.width = `${Math.min(100, xpPct * 100)}%`;
    // throwing: the attack button shows a throw icon and how many are left
    const thr = BASE_BY_ID[p.equip.main?.baseId ?? ""]?.thrown ? p.equip.main! : null;
    const ab = $(r, "#btn-attack");
    ab.classList.toggle("throw", !!thr && (thr.qty ?? 0) > 0);
    $(ab, "span").textContent = thr && (thr.qty ?? 0) > 0 ? "➶" : "⚔";
    $(ab, ".ammo").textContent = thr ? `${(thr.qty ?? 0) + (BASE_BY_ID[p.equip.off?.baseId ?? ""]?.thrown ? p.equip.off!.qty ?? 0 : 0)}` : "";
    $(r, "#btn-hp b").textContent = `${p.hpPots}`;
    $(r, "#btn-mp b").textContent = `${p.mpPots}`;
    $(r, "#btn-hp").classList.toggle("empty", p.hpPots === 0);
    $(r, "#btn-mp").classList.toggle("empty", p.mpPots === 0);
    $(r, "#btn-hp").classList.toggle("cool", g.potionWait("hp") > 0);
    $(r, "#btn-mp").classList.toggle("cool", g.potionWait("mp") > 0);
    // v0.9.2: no top-left text (floor and portal info come as toasts; ⌂ Town is top right). The same line is kept
    // off-screen as the HUD's accessible name (screen readers, tests).
    $(r, "#hud").setAttribute("aria-label", `${g.inTown ? "Ember Camp" : `Act ${actDef(g.floor).roman} · ${floorLabel(g.floor)}`}   ·   Lv ${p.level} Barbarian`);
    $(r, "#dot-char").textContent = p.statPoints ? `${p.statPoints}` : "";
    $(r, "#dot-skills").textContent = p.skillPoints ? `${p.skillPoints}` : "";
    for (let i = 0; i < SKILL_SLOTS; i++) {
      const el = $(r, `#btn-s${i}`);
      const id = p.slots[i];
      if (!id) {
        el.innerHTML = `<span class="plus">+</span>`;
        el.classList.add("empty");
        el.classList.remove("nomana");
      } else {
        const s = SKILL_BY_ID[id];
        const cost = s.mana?.(g.skillLevel(id)) ?? 0;
        el.innerHTML = `<span class="g">${s.glyph}</span><span class="n">${esc(s.name)}</span>`;
        el.classList.remove("empty");
        el.classList.toggle("nomana", cost > p.mana);
      }
    }
    const tb = $(r, "#btn-town");
    tb.hidden = g.inTown || p.dead;
    tb.classList.toggle("channel", !!g.recall);
    ($(r, "#btn-town .rfill") as HTMLElement).style.width = g.recall ? `${Math.min(100, (g.recall.t / g.recall.dur) * 100)}%` : "0";
    const btn = $(r, "#btn-ctx");
    btn.hidden = !ctx;
    btn.dataset.kind = ctx ?? "";
    const nx = g.floor + 1;
    btn.textContent = ctx === "descend" ? (levelInAct(nx) === 1 ? `▼ Enter Act ${actDef(nx).roman}: ${actDef(nx).area}` : `▼ Descend to Level ${levelInAct(nx)}`) : ctx === "trade" ? "⚖ Trade with Hilde" : ctx === "stash" ? "▣ Open stash" : ctx === "waypoint" ? "✦ Waypoint" : ctx === "portal" ? `◎ Portal back to ${floorLabel(g.portal?.floor ?? 1)}` : "";
    const buffs: string[] = [];
    if (p.chillT > 0) buffs.push(`<span class="buff chill">❄ Chilled</span>`);
    if (p.poison.t > 0) buffs.push(`<span class="buff poison">☠ Poisoned</span>`);
    if (p.frenzy.stacks > 0) {
      const left = p.frenzy.t > 0 ? Math.ceil(p.frenzy.t) : 0;
      buffs.push(`<span class="buff frenzy">⚡ Frenzy ×${p.frenzy.stacks}${left ? ` ${left}s` : ""}</span>`);
    }
    if (p.buffs.shout > 0) buffs.push(`<span class="buff shout">◈ ${Math.ceil(p.buffs.shout)}s</span>`);
    if (p.buffs.bo > 0) buffs.push(`<span class="buff bo">⚑ ${Math.ceil(p.buffs.bo)}s</span>`);
    if (p.buffs.bcmd > 0) buffs.push(`<span class="buff bo">✪ Command ${Math.ceil(p.buffs.bcmd)}s</span>`);
    if (p.buffs.conc > 0) buffs.push(`<span class="buff conc">◎ Focus</span>`);
    if (p.buffs.bers > 0) buffs.push(`<span class="buff bers">✖ Berserk: no defense</span>`);
    $(r, "#buffs").innerHTML = buffs.join("");
  }

  updateJoystick() {
    const show = this.settings.showJoystick && this.input.joyId !== null;
    this.joy.classList.toggle("on", show);
    if (!show) return;
    this.joy.style.transform = `translate(${this.input.ox}px, ${this.input.oy}px)`;
    const k = $(this.joy, ".joy-knob");
    k.style.transform = `translate(${this.input.jx - this.input.ox}px, ${this.input.jy - this.input.oy}px)`;
  }

  private soundText(st: string): string {
    if (st === "running") return this.settings.sound ? "Audio is on. You should hear a chime." : "Audio works, but the Sound switch above is off.";
    if (st === "not started") return "Tap Test sound to start audio.";
    return `Audio is ${st}. Tap Test sound again; if it stays silent, check the volume buttons while the game is open.`;
  }

  toast(text: string, ms = 2600) {
    const t = $(this.root, "#toast");
    t.textContent = text;
    t.classList.add("on");
    this.toastT = ms / 1000;
  }

  tick(dt: number) {
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) $(this.root, "#toast").classList.remove("on");
    }
  }

  showDeath() {
    $(this.root, "#death").hidden = false;
  }

  showTutorial(on: boolean) {
    $(this.root, "#tutorial").hidden = !on;
  }

  // ------------------------------------------------------------ panel
  open(tab: PanelTab) {
    if (tab === "stash" && !this.game().inTown) {
      this.toast("The stash is in Ember Camp");
      return;
    }
    this.hooks.click();
    this.openTab = tab;
    this.confirmReset = false;
    this.sel = null;
    this.input.reset();
    this.input.enabled = false; // the game ignores touches while a panel is open
    this.openedAt = performance.now();
    this.panel.hidden = false;
    this.renderPanel();
  }

  close() {
    this.cancelDrag();
    this.openTab = null;
    this.input.enabled = true;
    this.panel.hidden = true;
    this.sel = null;
  }

  refresh() {
    this.lastHud = "";
    if (this.openTab && !this.press?.moved) this.renderPanel();
  }

  private layout() {
    const sa = (n: string) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) || 0;
    const W = Math.min(820, window.innerWidth - 16 - Math.max(sa("--sal"), 0) - Math.max(sa("--sar"), 0)) - 28;
    const H = window.innerHeight - 70;
    if (this.openTab === "stash") {
      // stash 10×10 and backpack 10×8 side by side, same cell size so items drag 1:1
      this.C = Math.max(16, Math.min(30, Math.floor((W - 170 - 24) / (STASH_W + GRID_W)), Math.floor((H - 52) / STASH_H)));
    } else if (this.openTab === "shop") {
      this.C = Math.max(16, Math.min(30, Math.floor((W - 190 - 30) / 18.6), Math.floor((H - 60) / GRID_H)));
      this.VC = Math.max(14, Math.min(26, Math.floor(this.C * 0.86), Math.floor((H - 24) / VENDOR_H)));
    } else {
      this.C = Math.max(18, Math.min(34, Math.floor((W - 200 - 28) / (10 + DOLL_W * 0.9)), Math.floor((H - 6) / (DOLL_H * 0.9)), Math.floor((H - 60) / GRID_H)));
      this.U = Math.round(this.C * 0.9);
    }
  }

  private renderPanel() {
    const tab = this.openTab!;
    this.layout();
    const tabs: [PanelTab, string][] = [
      ["char", "Character"],
      ["inv", "Inventory"],
      ["skills", "Skills"],
      ["arts", "Artifacts"],
      ["guide", "Guide"],
      ["settings", "Settings"],
    ];
    if (tab === "shop") tabs.unshift(["shop", "Trade"]);
    if (tab === "wp") tabs.unshift(["wp", "Waypoint"]);
    if (tab === "stash") tabs.unshift(["stash", "Stash"]);
    let body = "";
    if (tab === "char") body = this.charHtml();
    else if (tab === "inv") body = this.invHtml();
    else if (tab === "skills") body = this.skillsHtml();
    else if (tab === "shop") body = this.shopHtml();
    else if (tab === "stash") body = this.stashHtml();
    else if (tab === "wp") body = this.wpHtml();
    else if (tab === "arts") body = this.artsHtml();
    else if (tab === "guide") body = guideHtml(this.guideSec);
    else body = this.settingsHtml();
    this.panel.innerHTML = `
      <div class="pbox">
        <div class="ptabs">
          ${tabs.map(([t, n]) => `<button class="ptab ${t === tab ? "on" : ""}" data-act="tab" data-tab="${t}">${n}</button>`).join("")}
          <button class="pclose" data-act="close" aria-label="Close">✕</button>
        </div>
        <div class="pbody pbody-${tab}">${body}</div>
        ${this.sheetHtml()}
      </div>`;
    this.panel.querySelectorAll<HTMLElement>(".ccard").forEach((c) => Ui.markMore(c));
  }

  /** v0.8.2: show the "▾ more" fade on a compare card while there's more to scroll to. */
  static markMore(c: HTMLElement) {
    c.classList.toggle("more", c.scrollHeight - c.clientHeight - c.scrollTop > 4);
  }

  /** Nearest panel button within `r` px of a point (for taps that land just outside a button). */
  private nearButton(x: number, y: number, r: number): HTMLElement | null {
    let best: HTMLElement | null = null;
    let bd = r;
    for (const el of this.panel.querySelectorAll<HTMLElement>("[data-act]")) {
      const b = el.getBoundingClientRect();
      if (!b.width) continue;
      const d = Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));
      if (d < bd) {
        bd = d;
        best = el;
      }
    }
    return best;
  }

  private onPanelTap(t: HTMLElement, x: number, y: number) {
    // a tap must start and end inside the open panel (the finger that opened it doesn't count)
    if (this.lastPanelDown < this.openedAt) return;
    if (performance.now() < this.suppress.t && Math.hypot(x - this.suppress.x, y - this.suppress.y) < 40) return;
    let el = t.closest<HTMLElement>("[data-act]");
    if (!el && (t === this.panel || t.classList.contains("ptabs"))) {
      // just missed a button (e.g. above a tab or beside the X): take the nearest one
      el = this.nearButton(x, y, 28);
      if (!el) {
        if (t === this.panel) this.close();
        return;
      }
    }
    if (!el) return;
    const g = this.game();
    const act = el.dataset.act!;
    this.hooks.click();
    const selItem = this.selItem();
    switch (act) {
      case "cmp-close":
        this.sel = null;
        break;
      case "close":
        this.close();
        return;
      case "exp-copy":
      case "exp-file":
      case "exp-share":
      case "imp-open":
      case "imp-go":
      case "imp-paste":
      case "imp-yes":
      case "imp-no":
      case "bak":
        void this.saveAction(act, el);
        return;
      case "cloud-send":
      case "cloud-verify":
      case "cloud-sync":
      case "cloud-out":
      case "cloud-back":
        void this.cloudAction(act);
        return;
      case "testsnd": {
        this.hooks.testSound();
        const show = () => {
          const el2 = this.root.querySelector("#sndstate");
          if (el2) el2.textContent = this.soundText(this.hooks.soundState());
        };
        show();
        setTimeout(show, 400);
        break;
      }
      case "hpat": {
        const v = Math.max(5, Math.min(50, this.settings.autoHpAt + Number(el.dataset.d)));
        this.settings.autoHpAt = v;
        this.hooks.settingsChanged();
        break;
      }
      case "gsec":
        this.guideSec = el.dataset.sec as GuideSec;
        break;
      case "recall":
        this.close();
        this.recallTap();
        return;
      case "tab":
        this.openTab = el.dataset.tab as PanelTab;
        this.sel = null;
        this.confirmReset = false;
        break;
      case "stat":
        g.addStat(el.dataset.stat as keyof Stats);
        break;
      case "stree":
        this.skillTab = el.dataset.tree as Tab;
        this.selSkill = SKILLS.find((s) => s.tab === this.skillTab)!.id;
        break;
      case "skill":
        this.selSkill = el.dataset.id!;
        break;
      case "learn":
        g.learn(el.dataset.id!);
        break;
      case "assign":
        g.assignSlot(Number(el.dataset.slot), el.dataset.id!);
        break;
      case "unassign":
        g.assignSlot(Number(el.dataset.slot), null);
        break;
      case "equip":
        if (this.sel?.src === "bag" && this.sel.uid !== undefined) {
          const err = g.equipFromBag(this.sel.uid, (el.dataset.slot as EquipSlot) || undefined);
          if (err) this.toast(err);
          else this.sel = null;
        }
        break;
      case "unequip":
        if (this.sel?.src === "eq" && this.sel.slot) {
          const err = g.unequip(this.sel.slot);
          if (err) this.toast(err);
          else this.sel = null;
        }
        break;
      case "drop":
        if (this.sel?.src === "bag" && this.sel.uid !== undefined) {
          g.dropFromBag(this.sel.uid);
          this.sel = null;
        }
        break;
      case "drink":
        if (this.sel?.src === "bag" && this.sel.uid !== undefined) {
          g.drinkFromBag(this.sel.uid);
          this.sel = null;
        }
        break;
      case "stash-put":
      case "stash-take":
        if (this.sel?.uid !== undefined) {
          const err = act === "stash-put" ? g.toStash(this.sel.uid) : g.fromStash(this.sel.uid);
          if (err) this.toast(err);
          else this.sel = null;
        }
        break;
      case "sell":
        if (this.sel?.src === "bag" && this.sel.uid !== undefined && selItem) {
          const price = g.sell(this.sel.uid);
          if (price) this.toast(`Sold ${itemName(selItem)} for ${price} gold`);
          this.sel = null;
        }
        break;
      case "buy":
        if (this.sel?.src === "vendor" && this.sel.uid !== undefined) {
          const err = g.buy(this.sel.uid);
          if (err) this.toast(err);
          else if (!g.vendorStock.some((q) => q.item.uid === this.sel?.uid)) this.sel = null;
        }
        break;
      case "wp": {
        const f = Number(el.dataset.floor);
        this.close();
        g.travel(f);
        return;
      }
      case "toggle": {
        const k = el.dataset.key as keyof Settings;
        (this.settings as unknown as Record<string, boolean>)[k] = !this.settings[k];
        this.hooks.settingsChanged();
        break;
      }
      case "reset":
        if (!this.confirmReset) this.confirmReset = true;
        else {
          this.confirmReset = false;
          this.close();
          this.hooks.newGame();
          return;
        }
        break;
    }
    if (this.openTab) this.renderPanel();
  }

  // ------------------------------------------------------------ selection helpers
  private selItem(s: Sel | null = this.sel): Item | null {
    if (!s) return null;
    const g = this.game();
    if (s.src === "bag") return g.bagEntry(s.uid!)?.item ?? null;
    if (s.src === "eq") return g.player.equip[s.slot!] ?? null;
    if (s.src === "stash") return g.stashEntry(s.uid!)?.item ?? null;
    return g.vendorStock.find((q) => q.item.uid === s.uid)?.item ?? null;
  }

  private sameSel(a: Sel | null, b: Sel | null) {
    return !!a && !!b && a.src === b.src && a.uid === b.uid && a.slot === b.slot;
  }

  // ------------------------------------------------------------ drag & drop / taps on grids
  private onDown(e: PointerEvent) {
    if (this.press) return;
    const t = e.target as HTMLElement;
    const zone = t.closest<HTMLElement>(".dnd");
    if (!zone) return;
    e.preventDefault();
    const itemEl = t.closest<HTMLElement>("[data-src]");
    const gridEl = t.closest<HTMLElement>("[data-grid]");
    const slotEl = t.closest<HTMLElement>("[data-slot]");
    let sel: Sel | null = null;
    if (itemEl) {
      const src = itemEl.dataset.src as Src;
      sel = src === "eq" ? { src, slot: itemEl.dataset.eq as EquipSlot } : { src, uid: Number(itemEl.dataset.uid) };
    }
    this.press = {
      pid: e.pointerId, x: e.clientX, y: e.clientY, sel, moved: false, touch: e.pointerType === "touch",
      grid: gridEl?.dataset.grid as "bag" | "vendor" | "stash" | undefined, slot: slotEl?.dataset.slot as EquipSlot | undefined,
    };
    try {
      this.panel.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
  }

  private onMove(e: PointerEvent) {
    const pr = this.press;
    if (!pr || e.pointerId !== pr.pid) return;
    e.preventDefault();
    if (!pr.moved && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 8 && pr.sel) {
      const it = this.selItem(pr.sel);
      if (!it) return;
      pr.moved = true;
      const { w, h } = sizeOf(it);
      const C = this.openTab === "shop" && pr.sel.src === "vendor" ? this.VC : this.C;
      const ghost = document.createElement("div");
      ghost.className = "ghost";
      ghost.style.width = `${w * C}px`;
      ghost.style.height = `${h * C}px`;
      ghost.innerHTML = `<img src="${itemIconUrl(it)}" alt="" draggable="false"/>`;
      document.body.appendChild(ghost);
      pr.ghost = ghost;
      this.panel.querySelector(this.itemSelector(pr.sel))?.classList.add("lifted");
    }
    if (pr.moved) this.dragTo(e.clientX, e.clientY);
  }

  private itemSelector(s: Sel) {
    return s.src === "eq" ? `[data-src="eq"][data-eq="${s.slot}"]` : `[data-src="${s.src}"][data-uid="${s.uid}"]`;
  }

  /** Where the dragged item's centre is for a finger at (x, y). */
  private dragPoint(x: number, y: number) {
    return { x, y: y - (this.press?.touch ? DRAG_LIFT : 0) };
  }

  private dragTo(fx: number, fy: number) {
    const pr = this.press!;
    const it = this.selItem(pr.sel)!;
    const { w, h } = sizeOf(it);
    const ghost = pr.ghost!;
    const gw = parseFloat(ghost.style.width);
    const gh = parseFloat(ghost.style.height);
    const { x, y } = this.dragPoint(fx, fy);
    ghost.style.transform = `translate(${x - gw / 2}px, ${y - gh / 2}px)`;
    pr.target = this.targetAt(x, y, it, w, h);
    this.showHighlight(pr.target, w, h);
  }

  private targetAt(x: number, y: number, it: Item, w: number, h: number): Target {
    const g = this.game();
    const pr = this.press!;
    const src = pr.sel!.src;
    const inRect = (r: DOMRect, pad = 0) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    for (const sl of this.panel.querySelectorAll<HTMLElement>(".slot[data-slot]")) {
      if (!inRect(sl.getBoundingClientRect())) continue;
      const slot = sl.dataset.slot as EquipSlot;
      if (src === "vendor" || src === "stash") return { kind: "slot", slot, ok: "bad" };
      if (src === "eq") return { kind: "slot", slot, ok: slot === pr.sel!.slot || !g.slotsFor(it).includes(slot) ? "bad" : "ok" };
      return { kind: "slot", slot, ok: g.equipError(it, slot) ? "bad" : "ok" };
    }
    for (const gname of ["bag", "stash"] as const) {
      const gEl = this.panel.querySelector<HTMLElement>(`[data-grid="${gname}"]`);
      if (!gEl) continue;
      const r = gEl.getBoundingClientRect();
      if (!inRect(r, this.C * 0.5)) continue;
      const C = this.C;
      const [GW, GH] = gname === "bag" ? [GRID_W, GRID_H] : [STASH_W, STASH_H];
      const cx = Math.max(0, Math.min(GW - w, Math.round((x - r.left) / C - w / 2)));
      const cy = Math.max(0, Math.min(GH - h, Math.round((y - r.top) / C - h / 2)));
      if (src === "vendor") return { kind: "grid", grid: gname, x: cx, y: cy, ok: gname === "bag" ? "ok" : "bad" };
      if (src === "eq" && gname === "stash") return { kind: "grid", grid: gname, x: cx, y: cy, ok: "bad" };
      const entries = gname === "bag" ? g.player.bag : g.player.stash;
      const same = src === gname;
      const over = overlapping(entries, w, h, cx, cy, same ? it.uid : -1);
      const ok = over.length === 0 ? "ok" : over.length === 1 && same ? "swap" : "bad";
      return { kind: "grid", grid: gname, x: cx, y: cy, ok };
    }
    const vEl = this.panel.querySelector<HTMLElement>('[data-grid="vendor"]');
    if (vEl && inRect(vEl.getBoundingClientRect(), 6)) return { kind: "grid", grid: "vendor", ok: src === "bag" ? "ok" : "bad" };
    const box = this.panel.querySelector<HTMLElement>(".pbox")!.getBoundingClientRect();
    if (!inRect(box) && src === "bag" && this.openTab === "inv") return { kind: "ground", ok: "ok" };
    return null;
  }

  private showHighlight(t: Target, w: number, h: number) {
    this.panel.querySelectorAll(".hl").forEach((n) => n.remove());
    this.panel.querySelectorAll(".drop-ok,.drop-bad").forEach((n) => n.classList.remove("drop-ok", "drop-bad"));
    if (!t) return;
    if (t.kind === "grid" && (t.grid === "bag" || t.grid === "stash")) {
      const el = this.panel.querySelector<HTMLElement>(`[data-grid="${t.grid}"]`)!;
      const hl = document.createElement("div");
      hl.className = `hl ${t.ok}`;
      hl.style.cssText = `left:${t.x * this.C}px;top:${t.y * this.C}px;width:${w * this.C}px;height:${h * this.C}px`;
      el.appendChild(hl);
    } else if (t.kind === "slot") {
      this.panel.querySelector(`.slot[data-slot="${t.slot}"]`)?.classList.add(t.ok === "ok" ? "drop-ok" : "drop-bad");
    } else if (t.kind === "grid") {
      this.panel.querySelector('[data-grid="vendor"]')?.classList.add(t.ok === "ok" ? "drop-ok" : "drop-bad");
    }
  }

  private cancelDrag() {
    if (this.press?.ghost) this.press.ghost.remove();
    this.press = null;
    this.panel.querySelectorAll(".hl").forEach((n) => n.remove());
  }

  private onUp(e: PointerEvent) {
    const pr = this.press;
    if (!pr || e.pointerId !== pr.pid) return;
    e.preventDefault();
    if (pr.moved) {
      this.suppress = { x: e.clientX, y: e.clientY, t: performance.now() + 500 };
      const t = pr.target ?? null;
      pr.ghost?.remove();
      this.press = null;
      this.drop(pr.sel!, t);
      // v0.8: a drag never leaves the compare sheet open over the grids
      if (this.sel && (this.sel.src === "bag" || this.sel.src === "stash" || this.sel.src === "vendor")) this.sel = null;
    } else {
      this.press = null;
      this.tap(pr, e.clientX, e.clientY);
    }
    if (this.openTab) this.renderPanel();
  }

  private drop(s: Sel, t: Target) {
    const g = this.game();
    const it = this.selItem(s);
    if (!t || !it) return;
    if (t.ok === "bad") {
      this.toast(t.kind === "slot" && s.src === "bag" ? (g.equipError(it, t.slot) ?? "That doesn't go there") : "It doesn't fit there");
      return;
    }
    this.hooks.click();
    let err: string | null = null;
    if (t.kind === "slot") {
      if (s.src === "bag") err = g.equipFromBag(s.uid!, t.slot);
      else if (s.src === "eq") err = g.swapEquip(s.slot!, t.slot);
      if (!err) this.sel = null;
    } else if (t.kind === "grid" && t.grid === "bag") {
      if (s.src === "bag") {
        if (!g.moveInBag(s.uid!, t.x, t.y)) err = "It doesn't fit there";
      } else if (s.src === "eq") err = g.unequip(s.slot!, t.x, t.y);
      else if (s.src === "stash") err = g.fromStash(s.uid!, t.x, t.y);
      else err = g.buy(s.uid!);
      if (!err && s.src === "stash") this.sel = { src: "bag", uid: s.uid };
      else if (!err && s.src !== "bag") this.sel = null;
    } else if (t.kind === "grid" && t.grid === "stash") {
      if (s.src === "stash") {
        if (!g.moveInStash(s.uid!, t.x, t.y)) err = "It doesn't fit there";
      } else if (s.src === "bag") {
        err = g.toStash(s.uid!, t.x, t.y);
        if (!err) this.sel = { src: "stash", uid: s.uid };
      }
    } else if (t.kind === "grid" && t.grid === "vendor") {
      const price = g.sell(s.uid!);
      if (price) this.toast(`Sold ${itemName(it)} for ${price} gold`);
      this.sel = null;
    } else if (t.kind === "ground") {
      g.dropFromBag(s.uid!);
      this.toast(`Dropped ${itemName(it)}`);
      this.sel = null;
    }
    if (err) this.toast(err);
  }

  private tap(pr: Press, x: number, y: number) {
    const g = this.game();
    this.hooks.click();
    if (pr.sel) {
      if (this.sameSel(pr.sel, this.sel)) {
        // second tap on the selected item deselects it (equip / sell / stash use the buttons, a drag, or tap-then-slot)
        this.sel = null;
        return;
      }
      // tapping another item while one is selected moves/equips onto it (bag → slot)
      if (this.sel?.src === "bag" && pr.sel.src === "eq") {
        const err = g.equipFromBag(this.sel.uid!, pr.sel.slot);
        if (!err) {
          this.sel = null;
          return;
        }
      }
      this.sel = pr.sel;
      return;
    }
    const cur = this.sel;
    const it = this.selItem();
    if (pr.slot) {
      if (cur && it && cur.src === "bag") {
        const err = g.equipFromBag(cur.uid!, pr.slot);
        if (err) this.toast(err);
        else this.sel = null;
      } else if (cur && it && cur.src === "eq") {
        const err = g.swapEquip(cur.slot!, pr.slot);
        if (err) this.toast(err);
        else this.sel = null;
      } else this.sel = null;
      return;
    }
    if (pr.grid === "bag") {
      const el = this.panel.querySelector<HTMLElement>('[data-grid="bag"]')!.getBoundingClientRect();
      const cx = Math.floor((x - el.left) / this.C);
      const cy = Math.floor((y - el.top) / this.C);
      if (cur && it) {
        const { w, h } = sizeOf(it);
        const tx = Math.max(0, Math.min(GRID_W - w, cx));
        const ty = Math.max(0, Math.min(GRID_H - h, cy));
        if (cur.src === "bag") {
          if (!g.moveInBag(cur.uid!, tx, ty)) this.toast("It doesn't fit there");
        } else if (cur.src === "stash") {
          const err = g.fromStash(cur.uid!, tx, ty);
          if (err) this.toast(err);
          else this.sel = { src: "bag", uid: cur.uid };
        } else if (cur.src === "eq") {
          const err = g.unequip(cur.slot!, tx, ty);
          if (err) this.toast(err);
          else this.sel = null;
        } else {
          const err = g.buy(cur.uid!);
          if (err) this.toast(err);
        }
      }
      return;
    }
    if (pr.grid === "stash") {
      const el = this.panel.querySelector<HTMLElement>('[data-grid="stash"]')!.getBoundingClientRect();
      if (cur && it && (cur.src === "bag" || cur.src === "stash")) {
        const { w, h } = sizeOf(it);
        const tx = Math.max(0, Math.min(STASH_W - w, Math.floor((x - el.left) / this.C)));
        const ty = Math.max(0, Math.min(STASH_H - h, Math.floor((y - el.top) / this.C)));
        if (cur.src === "stash") {
          if (!g.moveInStash(cur.uid!, tx, ty)) this.toast("It doesn't fit there");
        } else {
          const err = g.toStash(cur.uid!, tx, ty);
          if (err) this.toast(err);
          else this.sel = { src: "stash", uid: cur.uid };
        }
      }
      return;
    }
    if (pr.grid === "vendor" && cur?.src === "bag" && it) {
      const price = g.sell(cur.uid!);
      if (price) this.toast(`Sold ${itemName(it)} for ${price} gold`);
      this.sel = null;
      return;
    }
    this.sel = null;
  }

  // ------------------------------------------------------------ character
  private charHtml() {
    const g = this.game();
    const p = g.player;
    const d = g.derived();
    const s = p.base;
    const tot = d.stats;
    const next = xpForLevel(p.level + 1);
    const row = (k: keyof Stats, name: string, note: string) => `
      <div class="srow">
        <div class="sname">${name}<small>${note}</small></div>
        <div class="sval ${tot[k] !== s[k] ? "mod" : ""}">${tot[k]}${tot[k] !== s[k] ? `<small> (${s[k]}+${tot[k] - s[k]})</small>` : ""}</div>
        ${p.statPoints ? `<button class="splus" data-act="stat" data-stat="${k}" aria-label="Add ${name}">+</button>` : `<span class="splus off"></span>`}
      </div>`;
    const hands = d.hands
      .map((h, i) => {
        const it = h.slot ? p.equip[h.slot] : null;
        const name = it ? itemName(it) : "Fists";
        const lo = Math.round(h.min * (1 + h.dmgPct / 100));
        const hi = Math.round(h.max * (1 + h.dmgPct / 100));
        const aps = (1 + d.ias) / h.speed;
        return `<div class="kv"><span>${d.hands.length > 1 ? (i ? "Off-hand" : "Main hand") : "Damage"} <small>${esc(name)}</small></span><b>${lo} – ${hi}</b></div>
          <div class="kv sub"><span>Attack rating · speed</span><b>${h.ar} · ${aps.toFixed(1)}/s</b></div>`;
      })
      .join("");
    const fz = p.frenzy.stacks
      ? `<div class="kv"><span>Frenzy</span><b class="frz">×${p.frenzy.stacks} · +${Math.round(d.ias * 100)}% attack speed</b></div>`
      : "";
    return `
      <div class="char-left">
        <div class="char-head"><b>Barbarian</b> · Level ${p.level}</div>
        <div class="char-xp">Experience ${p.xp.toLocaleString()} / ${next.toLocaleString()}</div>
        ${row("str", "Strength", "+1% damage each")}
        ${row("dex", "Dexterity", "attack rating, defense")}
        ${row("vit", "Vitality", "+4 life each")}
        ${row("ene", "Energy", "+1.5 mana each")}
        <div class="spoints ${p.statPoints ? "has" : ""}">${p.statPoints ? `${p.statPoints} stat points to spend` : "Gain 5 stat points each level"}</div>
      </div>
      <div class="char-right">
        ${d.dual ? `<div class="kv dualtag"><span>Dual wielding</span><b>attacks alternate hands</b></div>` : ""}
        ${hands}
        ${fz}
        <div class="kv"><span>Defense</span><b>${d.def}</b></div>
        <div class="kv"><span>Life</span><b>${Math.ceil(p.hp)} / ${d.maxHp}</b></div>
        <div class="kv"><span>Mana</span><b>${Math.ceil(p.mana)} / ${d.maxMana}</b></div>
        <div class="kv"><span>Critical strike</span><b>${d.crit}%</b></div>
        <div class="kv"><span>Resist fire · cold</span><b>${d.res.fire}% · ${d.res.cold}%</b></div>
        <div class="kv"><span>Resist lightning · poison</span><b>${d.res.light}% · ${d.res.poison}%</b></div>
        ${d.ll || d.ml ? `<div class="kv"><span>Life · mana leech</span><b class="mod">${d.ll}% · ${d.ml}%</b></div>` : ""}
        ${d.gearIas || d.frw ? `<div class="kv"><span>Attack speed · run speed</span><b class="mod">+${d.gearIas}% · +${d.frw}%</b></div>` : ""}
        ${d.gf || d.mf ? `<div class="kv"><span>Gold find · magic find</span><b class="mod">+${d.gf}% · +${d.mf}%</b></div>` : ""}
        <div class="kv"><span>Gold</span><b class="gold">${p.gold.toLocaleString()}</b></div>
        <div class="kv"><span>Kills · deepest level</span><b>${p.kills} · ${g.maxFloor}</b></div>
      </div>`;
  }

  // ------------------------------------------------------------ items
  private itemLines(it: Item): string {
    const g = this.game();
    const b = BASE_BY_ID[it.baseId];
    const st = g.stats();
    const L = ilvlOf(it);
    const lines: string[] = [];
    if (b.slot === "weapon") {
      const [bl, bh] = baseDamage(b, L);
      const [lo, hi] = itemDamage(it);
      const m = lo !== bl || hi !== bh;
      lines.push(`${b.hands === 2 ? "Two-Hand" : "One-Hand"} Damage: <b class="${m ? "mod" : ""}">${lo} to ${hi}</b>`);
      if (b.thrown) {
        lines.push(`Throw Damage: <b class="${m ? "mod" : ""}">${lo} to ${hi}</b>`);
        lines.push(`Quantity: <b class="${(it.qty ?? 0) === 0 ? "bad" : ""}">${it.qty ?? 0} of ${b.thrown.max}</b> · refills in camp`);
        lines.push(`Throw range: ${b.thrown.range} · Throwing Mastery`);
      }
      lines.push(`Speed: ${b.speedLabel}${b.hands === 1 ? " · can dual wield" : ""}`);
      if (b.kind === "staff") lines.push(`Uses Pole Arm Mastery`);
    } else if (b.potion) {
      lines.push(b.potion === "hp" ? "Restores 45% life over a few seconds" : "Restores 60% mana over a few seconds");
    } else if (b.defMul) {
      const dv = itemDefense(it);
      lines.push(`Defense: <b class="${dv !== baseDefense(b, L) ? "mod" : ""}">${dv}</b>`);
    }
    if (b.kind === "belt") lines.push(`Belt: holds <b>+${beltSlotsOf(it)}</b> potions of each kind`);
    if (!b.potion) {
      const r = itemReqs(it);
      if (r.str) lines.push(`<span class="${st.str < r.str ? "bad" : ""}">Required Strength: ${r.str}</span>`);
      if (r.dex) lines.push(`<span class="${st.dex < r.dex ? "bad" : ""}">Required Dexterity: ${r.dex}</span>`);
      if (r.lvl) lines.push(`<span class="${g.player.level < r.lvl ? "bad" : ""}">Required Level: ${r.lvl}</span>`);
    }
    for (const m of it.mods ?? []) lines.push(`<span class="mod">${esc(modText(m))}</span>`);
    return lines.map((l) => `<div>${l}</div>`).join("");
  }

  private itemBox(it: Item, src: Src, x: number, y: number, C: number, extra = "") {
    const b = BASE_BY_ID[it.baseId];
    const sel = this.sel && this.sel.src === src && this.sel.uid === it.uid;
    const bad = src !== "vendor" && !b.potion && !this.game().meetsReq(it);
    return `<div class="gi q-${qualityOf(it)} ${sel ? "sel" : ""} ${bad ? "bad" : ""}" data-src="${src}" data-uid="${it.uid}" data-q="${qualityOf(it)}" style="left:${x * C}px;top:${y * C}px;width:${b.w * C}px;height:${b.h * C}px" ${extra}>
      <img src="${itemIconUrl(it)}" alt="${esc(b.name)}" draggable="false"/>${b.thrown ? `<span class="qty ${(it.qty ?? 0) === 0 ? "out" : ""}">${it.qty ?? 0}</span>` : ""}</div>`;
  }

  private bagGrid() {
    const p = this.game().player;
    const C = this.C;
    const items = p.bag.map((e) => this.itemBox(e.item, "bag", e.x, e.y, C)).join("");
    return `<div class="grid" data-grid="bag" style="--c:${C}px;width:${GRID_W * C}px;height:${GRID_H * C}px">${items}</div>`;
  }

  private dollHtml() {
    const g = this.game();
    const p = g.player;
    const U = this.U;
    const slots = (Object.keys(DOLL) as EquipSlot[])
      .map((s) => {
        const [x, y, w, h] = DOLL[s];
        const it = p.equip[s];
        const blocked = s === "off" && isTwoHanded(p.equip.main);
        const sel = this.sel?.src === "eq" && this.sel.slot === s;
        let inner = `<em>${EQUIP_LABEL[s]}</em>`;
        if (it) {
          const b = BASE_BY_ID[it.baseId];
          const k = Math.min(1, w / b.w, h / b.h);
          inner = `<div class="eqi q-${qualityOf(it)}" data-src="eq" data-eq="${s}"><img src="${itemIconUrl(it)}" alt="${esc(b.name)}" draggable="false" style="width:${b.w * U * k}px;height:${b.h * U * k}px"/>${b.thrown ? `<span class="qty ${(it.qty ?? 0) === 0 ? "out" : ""}">${it.qty ?? 0}</span>` : ""}</div>`;
        } else if (blocked && p.equip.main) {
          const b = BASE_BY_ID[p.equip.main.baseId];
          inner = `<img class="ghost2h" src="${itemIconUrl(p.equip.main)}" alt="" draggable="false" style="width:${b.w * U * 0.9}px;height:${b.h * U * 0.9}px"/><em>2-handed</em>`;
        }
        return `<div class="slot ${it ? "full" : ""} ${sel ? "sel" : ""} ${blocked ? "blocked" : ""}" data-slot="${s}" style="left:${x * U}px;top:${y * U}px;width:${w * U}px;height:${h * U}px">${inner}</div>`;
      })
      .join("");
    return `<div class="doll dnd" style="width:${DOLL_W * U}px;height:${DOLL_H * U}px">${slots}</div>`;
  }

  private detailHtml(shop: boolean) {
    const s = this.sel;
    const it = this.selItem();
    const stash = this.openTab === "stash";
    if ((!s || !it) && stash) {
      return `<div class="hint">Your stash keeps items safe in camp, saved with your hero.<br/>Drag items between the stash and your backpack, or tap an item and use To stash / To backpack. Tap it again to deselect.</div>`;
    }
    if (!s || !it) {
      return shop
        ? `<div class="hint">Tap an item to see its price.<br/>Drag your items onto Hilde's stock to sell (or tap and Sell). Drag hers into your bag to buy. Tap again to deselect.</div>`
        : `<div class="hint">Tap an item to see it and compare; tap it again to deselect.<br/>Equip with the button, by dragging onto a slot, or tap the item then a slot.<br/>Drag out of the window to drop.</div>`;
    }
    if (this.sheetShown()) return `<div class="hint">Comparing…</div>`;
    const b = BASE_BY_ID[it.baseId];
    const { btns, price } = this.actionsFor(shop);
    return `
      <div class="iname q-${qualityOf(it)}">${esc(itemName(it))}</div>
      ${qualityOf(it) === "rare" ? `<div class="iname q-rare sub">${esc(b.name)}</div>` : ""}
      <div class="itype">${s.src === "eq" ? EQUIP_LABEL[s.slot!] : SLOT_LABEL[b.slot]} · ${QUALITY_LABEL[qualityOf(it)]}${b.potion ? "" : ` · Item level ${ilvlOf(it)}`}</div>
      ${this.itemLines(it)}
      ${price}
      <div class="ibtns">${btns.join("")}</div>`;
  }

  /** Buttons (and price line) for the selected item, shared by the detail pane and the compare sheet. */
  private actionsFor(shop: boolean): { btns: string[]; price: string } {
    const g = this.game();
    const s = this.sel!;
    const it = this.selItem()!;
    const stash = this.openTab === "stash";
    const b = BASE_BY_ID[it.baseId];
    const btns: string[] = [];
    let price = "";
    if (s.src === "vendor") {
      const cost = itemPrice(it);
      price = `<div class="price ${g.player.gold < cost ? "bad" : ""}">Price: ${cost} gold</div>`;
      btns.push(`<button class="gbtn" data-act="buy" ${g.player.gold < cost ? "disabled" : ""}>Buy</button>`);
    } else if (s.src === "stash") {
      btns.push(`<button class="gbtn" data-act="stash-take">To backpack</button>`);
    } else if (s.src === "bag" && stash) {
      btns.push(`<button class="gbtn" data-act="stash-put">To stash</button>`);
    } else if (s.src === "bag") {
      if (shop) {
        price = `<div class="price">Sells for ${sellPrice(it)} gold</div>`;
        btns.push(`<button class="gbtn" data-act="sell">Sell</button>`);
      } else if (b.potion) {
        btns.push(`<button class="gbtn" data-act="drink">Drink</button>`);
        btns.push(`<button class="gbtn dim" data-act="drop">Drop</button>`);
      } else {
        const opts = g.slotsFor(it);
        if (opts.length === 2 && b.slot === "weapon")
          btns.push(
            `<button class="gbtn" data-act="equip" data-slot="main" ${g.meetsReq(it) ? "" : "disabled"}>Main hand</button>`,
            `<button class="gbtn" data-act="equip" data-slot="off" ${g.equipError(it, "off") ? "disabled" : ""}>Off-hand</button>`,
          );
        else if (b.slot === "ring")
          btns.push(
            `<button class="gbtn" data-act="equip" data-slot="ring1" ${g.meetsReq(it) ? "" : "disabled"}>Left ring</button>`,
            `<button class="gbtn" data-act="equip" data-slot="ring2" ${g.meetsReq(it) ? "" : "disabled"}>Right ring</button>`,
          );
        else btns.push(`<button class="gbtn" data-act="equip" ${g.meetsReq(it) ? "" : "disabled"}>Equip</button>`);
        btns.push(`<button class="gbtn dim" data-act="drop">Drop</button>`);
      }
    } else {
      btns.push(`<button class="gbtn" data-act="unequip">Unequip</button>`);
    }
    return { btns, price };
  }

  /**
   * Side-by-side compare (v0.8): the selected item's full card next to what's equipped in the
   * slot(s) it would go in (both rings; main and off-hand for one-handers). Each card lists its own
   * stats plainly, with no deltas. Closing it deselects.
   */
  /** The side-by-side compare sheet is up (a bag, stash or shop item that isn't a potion is selected). */
  private sheetShown(): boolean {
    const s = this.sel;
    const it = this.selItem();
    if (!s || !it || s.src === "eq" || BASE_BY_ID[it.baseId].potion) return false;
    return this.openTab === "inv" || this.openTab === "stash" || this.openTab === "shop";
  }

  private sheetHtml(): string {
    const g = this.game();
    const s = this.sel;
    const it = this.selItem();
    if (!s || !it || !this.sheetShown()) return "";
    const p = g.player;
    const card = (x: Item, head: string, cls: string) => `<div class="ccard ${cls}"><div class="chead">${head}</div>
      <div class="iname q-${qualityOf(x)}">${esc(itemName(x))}</div>
      ${qualityOf(x) === "rare" ? `<div class="iname q-rare sub">${esc(BASE_BY_ID[x.baseId].name)}</div>` : ""}
      <div class="itype">${SLOT_LABEL[BASE_BY_ID[x.baseId].slot]} · ${QUALITY_LABEL[qualityOf(x)]} · Item level ${ilvlOf(x)}</div>
      <div class="clines">${this.itemLines(x)}</div></div>`;
    const slots = g.compareSlots(it);
    const eq = slots.map((sl) => {
      const cur = p.equip[sl];
      const label = `Equipped · ${sl === "ring1" ? "Left ring" : sl === "ring2" ? "Right ring" : EQUIP_LABEL[sl]}`;
      if (cur) return card(cur, label, "eqc");
      if (sl === "off" && isTwoHanded(p.equip.main)) return `<div class="ccard eqc empty"><div class="chead">${label}</div><div class="hint">Blocked by your two-handed weapon</div></div>`;
      return `<div class="ccard eqc empty"><div class="chead">${label}</div><div class="hint">Nothing equipped</div></div>`;
    });
    const { btns, price } = this.actionsFor(this.openTab === "shop");
    const where = s.src === "vendor" ? "Hilde's item" : s.src === "stash" ? "In your stash" : "Selected";
    return `<div class="cmpsheet" data-n="${1 + eq.length}">
      <div class="ccards">${card(it, where, "selc")}${eq.join("")}</div>
      <div class="cfoot">${price}<div class="ibtns">${btns.join("")}<button class="gbtn dim" data-act="cmp-close">✕ Close</button></div></div>
    </div>`;
  }

  private beltLine() {
    const g = this.game();
    const p = g.player;
    const cap = g.beltCap();
    return `<div class="beltline">Belt: <span class="hpc">♥ ${p.hpPots}/${cap}</span> <span class="mpc">◆ ${p.mpPots}/${cap}</span><small>${p.equip.belt ? "" : " · equip a belt for more"}</small></div>`;
  }

  private invHtml() {
    const p = this.game().player;
    return `
      ${this.dollHtml()}
      <div class="bagwrap">
        <div class="bagtop"><span>Backpack</span><span class="gold">${p.gold.toLocaleString()} gold</span></div>
        <div class="dnd">${this.bagGrid()}</div>
        ${this.beltLine()}
      </div>
      <div class="idetail">${this.detailHtml(false)}</div>`;
  }

  private shopHtml() {
    const g = this.game();
    const p = g.player;
    const VC = this.VC;
    const stock = g.vendorStock
      .map((e) => {
        return this.itemBox(e.item, "vendor", e.x, e.y, VC, `data-price="${itemPrice(e.item)}"`);
      })
      .join("");
    return `
      <div class="vendwrap">
        <div class="bagtop"><span>Hilde's wares</span><span class="muted">tap to inspect</span></div>
        <div class="dnd"><div class="grid vgrid" data-grid="vendor" style="--c:${VC}px;width:${VENDOR_W * VC}px;height:${VENDOR_H * VC}px">${stock}</div></div>
      </div>
      <div class="bagwrap">
        <div class="bagtop"><span>Your backpack</span><span class="gold">${p.gold.toLocaleString()} gold</span></div>
        <div class="dnd">${this.bagGrid()}</div>
        ${this.beltLine()}
      </div>
      <div class="idetail">${this.detailHtml(true)}</div>`;
  }

  private stashHtml() {
    const g = this.game();
    const p = g.player;
    const C = this.C;
    const items = p.stash.map((e) => this.itemBox(e.item, "stash", e.x, e.y, C)).join("");
    return `
      <div class="vendwrap">
        <div class="bagtop"><span>Stash</span><span class="muted">${p.stash.length} item${p.stash.length === 1 ? "" : "s"}</span></div>
        <div class="dnd"><div class="grid sgrid2" data-grid="stash" style="--c:${C}px;width:${STASH_W * C}px;height:${STASH_H * C}px">${items}</div></div>
      </div>
      <div class="bagwrap">
        <div class="bagtop"><span>Your backpack</span><span class="gold">${p.gold.toLocaleString()} gold</span></div>
        <div class="dnd">${this.bagGrid()}</div>
      </div>
      <div class="idetail">${this.detailHtml(false)}</div>`;
  }

  /** Waypoint: camp, then each act's levels in a column. Acts you haven't reached are locked. */
  private wpHtml() {
    const g = this.game();
    const here = g.inTown ? 0 : g.floor;
    const row = (f: number, label: string) =>
      `<button class="wprow ${f === here ? "here" : ""}" data-act="wp" data-floor="${f}" ${f === here ? "disabled" : ""}><span class="wpg">✦</span>${label}${f === here ? " <small>(here)</small>" : ""}</button>`;
    const reachedAct = actOf(g.maxFloor);
    const cols = ACTS.map((a) => {
      if (a.n > reachedAct) return `<div class="wpact locked"><div class="wph">Act ${a.roman} · ${a.area}</div><div class="wplock">🔒 Beat ${a.n > 1 ? MONSTERS[ACTS[a.n - 2].finalBoss].name : ""} to unlock</div></div>`;
      const rows: string[] = [];
      for (let l = 1; l <= LEVELS_PER_ACT; l++) {
        const f = firstFloorOf(a.n) + l - 1;
        if (f > g.maxFloor) break;
        if (hasWaypoint(f)) rows.push(row(f, `Level ${l}${isFinalLevel(f) ? " ☠" : ""}`));
      }
      const deepest = Math.min(g.maxFloor, firstFloorOf(a.n) + LEVELS_PER_ACT - 1);
      if (actOf(deepest) === a.n && !hasWaypoint(deepest)) rows.push(`<div class="wpnext">Deepest: Level ${levelInAct(deepest)} · next waypoint at ${Math.ceil(levelInAct(deepest) / 5) * 5}</div>`);
      return `<div class="wpact"><div class="wph">Act ${a.roman} · ${a.area}</div>${rows.join("")}</div>`;
    }).join("");
    return `
      <div class="wpwrap">
        <div class="wpcamp">${row(0, "Ember Camp")}<small class="hint">Waypoints on level 1 and every 5th level of each act. Use ⌂ Town and the blue portal to come back to any other level. ☠ = the act's final boss (level ${LEVELS_PER_ACT}).</small></div>
        <div class="wpacts">${cols}</div>
      </div>`;
  }

  /** Artifacts collected from each act's final boss. Unfound ones show as dark outlines with a hint. */
  private artsHtml() {
    const p = this.game().player;
    const cards = ARTIFACTS.map((a) => {
      const f = p.artifacts.find((x) => x.id === a.id);
      const act = ACTS[a.act - 1];
      if (!f)
        return `<div class="artcard unfound"><img src="${artifactUrl(a.id, true)}" alt=""/><div><div class="artname">Unknown artifact</div><div class="artlore">Act ${act.roman} · ${act.area}: carried by ${esc(MONSTERS[act.finalBoss].name)}.</div></div></div>`;
      const when = new Date(f.at).toLocaleDateString([], { month: "short", day: "numeric" });
      return `<div class="artcard found" data-art="${a.id}"><img src="${artifactUrl(a.id)}" alt=""/><div><div class="artname">${esc(a.name)}</div><div class="artlore">${esc(a.lore)}</div><div class="artmeta">Act ${act.roman} · from ${esc(MONSTERS[act.finalBoss].name)} · found ${when} at Lv ${f.level}</div></div></div>`;
    }).join("");
    return `
      <div class="artwrap">
        <div class="arthead"><b>Artifacts</b> · ${p.artifacts.length} of ${ARTIFACTS.length} found<small> · Each act's final boss carries one. They're kept here, not in your bag, and saved with your hero.</small></div>
        <div class="artgrid">${cards}</div>
      </div>`;
  }

  // ------------------------------------------------------------ skills
  private skillsHtml() {
    const g = this.game();
    const p = g.player;
    const tabs = (Object.keys(TAB_NAMES) as Tab[])
      .map((t) => `<button class="stab ${t === this.skillTab ? "on" : ""}" data-act="stree" data-tree="${t}">${TAB_NAMES[t]}</button>`)
      .join("");
    const list = SKILLS.filter((s) => s.tab === this.skillTab);
    const CW = 33.33;
    const RH = 100 / 6;
    // prerequisite lines; a line that would run through another skill bends around it
    const lines = list
      .flatMap((s) =>
        s.prereq.map((q) => {
          const a = SKILL_BY_ID[q];
          const x1 = a.col * CW + CW / 2;
          const y1 = a.row * RH + RH / 2;
          const x2 = s.col * CW + CW / 2;
          const y2 = s.row * RH + RH / 2;
          const lit = g.skillLevel(q) > 0;
          const through = list.some((o) => {
            if (o === s || o === a) return false;
            const ox = o.col * CW + CW / 2;
            const oy = o.row * RH + RH / 2;
            const t = ((ox - x1) * (x2 - x1) + (oy - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2);
            if (t <= 0.05 || t >= 0.95) return false;
            return Math.hypot(x1 + (x2 - x1) * t - ox, y1 + (y2 - y1) * t - oy) < 7;
          });
          if (!through) return `<path d="M${x1} ${y1} L${x2} ${y2}" class="${lit ? "lit" : ""}"/>`;
          const bend = x2 < 50 ? -CW * 0.42 : CW * 0.42;
          const mx = Math.max(x1, x2) === x1 && x1 === x2 ? x1 + bend : (x1 + x2) / 2 + bend;
          return `<path d="M${x1} ${y1 + RH * 0.22} C${mx} ${y1 + RH * 0.5}, ${mx} ${y2 - RH * 0.5}, ${x2} ${y2 - RH * 0.22}" class="${lit ? "lit" : ""}"/>`;
        }),
      )
      .join("");
    const nodes = list
      .map((s) => {
        const lvl = g.skillLevel(s.id);
        const can = g.canLearn(s.id);
        const cls = [
          "snode",
          s.id === this.selSkill ? "sel" : "",
          lvl ? "learned" : "",
          !s.implemented ? "soon" : "",
          can.ok ? "can" : "",
          p.level < s.reqLvl ? "locked" : "",
        ].join(" ");
        return `<button class="${cls}" style="left:${s.col * CW}%;top:${s.row * RH}%" data-act="skill" data-id="${s.id}">
          <span class="sg">${s.glyph}</span>${lvl ? `<span class="sl">${lvl}</span>` : ""}<span class="sn">${esc(s.name)}</span>
        </button>`;
      })
      .join("");
    // detail
    let detail = `<div class="hint">Pick a skill.</div>`;
    const s = this.selSkill ? SKILL_BY_ID[this.selSkill] : null;
    if (s) {
      const lvl = g.skillLevel(s.id);
      const can = g.canLearn(s.id);
      const pre = s.prereq.length ? `Requires: ${s.prereq.map((q) => SKILL_BY_ID[q].name).join(", ")}` : "";
      const slotBtns =
        s.kind === "active" && s.implemented && lvl
          ? `<div class="assign"><span>Skill button:</span>${Array.from({ length: SKILL_SLOTS }, (_, i) => i)
              .map((i) =>
                p.slots[i] === s.id
                  ? `<button class="slotb on" data-act="unassign" data-slot="${i}">${i + 1} ✓</button>`
                  : `<button class="slotb" data-act="assign" data-slot="${i}" data-id="${s.id}">${i + 1}</button>`,
              )
              .join("")}</div>`
          : "";
      detail = `
        <div class="iname">${s.glyph} ${esc(s.name)}</div>
        <div class="itype">${s.kind === "passive" ? "Passive" : "Active"} · Level ${lvl}/${MAX_SKILL_LVL}${p.level >= s.reqLvl && Math.min(MAX_SKILL_LVL, 1 + p.level - s.reqLvl) < MAX_SKILL_LVL ? ` (cap ${1 + p.level - s.reqLvl} at your level)` : ""}${s.mana && s.implemented ? ` · Mana ${s.mana(Math.max(1, lvl))}` : ""}</div>
        <div class="sblurb">${esc(s.blurb)}</div>
        ${s.implemented && s.effect ? `${lvl ? `<div class="seff">Now: ${esc(s.effect(lvl))}</div>` : ""}${lvl < MAX_SKILL_LVL ? `<div class="seff next">Next: ${esc(s.effect(lvl + 1))}</div>` : ""}` : `<div class="seff soon">Coming soon</div>`}
        <div class="sreq ${p.level < s.reqLvl ? "bad" : ""}">Required level: ${s.reqLvl}</div>
        ${pre ? `<div class="sreq">${esc(pre)}</div>` : ""}
        <div class="ibtns">
          <button class="gbtn" data-act="learn" data-id="${s.id}" ${can.ok ? "" : "disabled"}>${can.ok ? (lvl ? "Add point" : "Learn") : esc(can.why ?? "")}</button>
        </div>
        ${slotBtns}`;
    }
    return `
      <div class="stree">
        <div class="stabs">${tabs}</div>
        <div class="sgrid"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>${nodes}</div>
      </div>
      <div class="sdetail">
        <div class="spts ${p.skillPoints ? "has" : ""}">${p.skillPoints} skill point${p.skillPoints === 1 ? "" : "s"}</div>
        ${detail}
      </div>`;
  }

  // ------------------------------------------------------------ settings
  private settingsHtml() {
    const t = (key: keyof Settings, label: string, note: string) => `
      <button class="toggle ${this.settings[key] ? "on" : ""}" data-act="toggle" data-key="${key}" role="switch" aria-checked="${this.settings[key]}">
        <span class="tl">${label}<small>${note}</small></span><span class="sw"><i></i></span>
      </button>`;
    const sv = this.hooks.save;
    const last = sv.lastSaved();
    const baks = sv.backups();
    const fileAt = sv.lastFileBackup();
    let saveBox = `
      <div class="savebox">
        <b>Your save</b>
        <div class="saved-at">${sv.canSave() ? `Last saved <span id="lastsaved">${last ? new Date(last).toLocaleTimeString() : "not yet"}</span>` : `<span class="bad">Saving paused: this device has a save from a newer version. Reload to update.</span>`}</div>
        <div class="srow2 filebak">
          <button class="gbtn hot" data-act="exp-share">📁 Back up to Files</button>
          <label class="gbtn filebtn">Restore from file<input type="file" id="impfile"/></label>
        </div>
        <div class="saved-at" id="filebak-at">Last file backup: ${fileAt ? new Date(fileAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never"}${fileAt && Date.now() - fileAt > 864e5 ? ` <span class="bad">· over a day ago</span>` : ""}</div>
        <div class="srow2">
          <button class="gbtn dim" data-act="exp-copy">Copy save code</button>
          <button class="gbtn dim" data-act="imp-open">Paste a code…</button>
        </div>`;
    if (this.saveMsg) saveBox += `<div class="savemsg">${esc(this.saveMsg)}</div>`;
    if (this.exportShown) saveBox += `<textarea id="expcode" class="codebox" readonly rows="3">${esc(this.exportShown)}</textarea>`;
    if (this.importOpen) {
      const pend = this.importPending;
      saveBox += pend
        ? `<div class="savemsg">Replace your level ${this.game().player.level} hero with this level ${pend.player.level} hero (${pend.player.gold} gold, deepest level ${pend.maxFloor})? Your current hero goes into the backups.</div>
           <div class="srow2"><button class="gbtn" data-act="imp-yes">Replace</button><button class="gbtn dim" data-act="imp-no">Cancel</button></div>`
        : `<textarea id="impcode" class="codebox" rows="3" placeholder="Paste a save code here">${esc(this.importText)}</textarea>
           <div class="srow2"><button class="gbtn" data-act="imp-paste">Paste</button><button class="gbtn" data-act="imp-go">Load this code</button></div>`;
    }
    if (baks.length)
      saveBox += `<div class="baks">Backups: ${baks
        .map((b) => `<button class="gbtn dim bak" data-act="bak" data-key="${b.key}">Lv ${b.level} · ${b.savedAt ? new Date(b.savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "?"}</button>`)
        .join("")}</div>`;
    const cl = sv.cloud;
    if (cl) {
      saveBox += `<div class="cloudbox"><b>☁ Cloud save</b>`;
      if (cl.signedIn())
        saveBox += `<div class="saved-at">Signed in as ${esc(cl.email())} · <span id="cloudstat">${esc(cl.status())}</span></div>
          <div class="srow2"><button class="gbtn" data-act="cloud-sync">Sync now</button><button class="gbtn dim" data-act="cloud-out">Sign out</button></div>`;
      else if (this.cloudStep === "code")
        saveBox += `<div class="saved-at">We emailed a 6-digit code to ${esc(this.cloudEmail)}.</div>
          <div class="srow2"><input id="cloud-code" class="codebox" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456"/><button class="gbtn" data-act="cloud-verify">Sign in</button><button class="gbtn dim" data-act="cloud-back">Back</button></div>`;
      else
        saveBox += `<div class="saved-at">Sign in with your email to keep your hero in sync across devices.</div>
          <div class="srow2"><input id="cloud-email" class="codebox" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(this.cloudEmail)}"/><button class="gbtn" data-act="cloud-send">Email me a code</button></div>`;
      if (this.cloudMsg) saveBox += `<div class="savemsg">${esc(this.cloudMsg)}</div>`;
      saveBox += `</div>`;
    }
    saveBox += `<small class="savenote">Saves on this device after every change and when you leave the app. On iPhone, add the game to your Home Screen so Safari doesn&rsquo;t clear it, and tap 📁 Back up to Files now and then (Save to Files → iCloud Drive) so your hero survives a lost or reset phone.</small></div>`;
    return `
      <div class="set-col">
        ${this.game().inTown ? "" : `<button class="gbtn town" data-act="recall">⌂ Return to Town</button>`}
        <div class="srow2"><button class="gbtn guide" data-act="tab" data-tab="guide">📖 Item Guide</button><button class="gbtn arts" data-act="tab" data-tab="arts">✧ Artifacts ${this.game().player.artifacts.length}/${ARTIFACTS.length}</button></div>
        ${t("autoHp", "Auto health potion", `Drinks one when life is at or below ${this.settings.autoHpAt}%`)}
        ${this.settings.autoHp ? `<div class="stepper"><span>Auto health at</span><button class="gbtn" data-act="hpat" data-d="-5" aria-label="Lower">−</button><b>${this.settings.autoHpAt}%</b><button class="gbtn" data-act="hpat" data-d="5" aria-label="Higher">+</button></div>` : ""}
        ${t("autoMp", "Auto mana potion", "Press a skill again within 1.5 s while out of mana to drink one")}
        ${t("showJoystick", "Show joystick", "Debug: draw the movement stick where your thumb lands")}
        ${t("sound", "Sound", "Sound effects")}
        <div class="sndrow"><button class="gbtn" data-act="testsnd">🔊 Test sound</button><small id="sndstate">${this.soundText(this.hooks.soundState())}</small></div>
        ${t("shake", "Screen shake", "Shake on big hits")}
        ${t("labels", "Item labels", "Show item names on the ground")}
        <button class="gbtn danger" data-act="reset">${this.confirmReset ? "Tap again to start over (old hero goes to backups)" : "Start a new character"}</button>
      </div>
      <div class="set-col help">
        ${saveBox}
        <b>How to play</b>
        <p>Left side: put your thumb down anywhere and drag to move. Lift to stop.</p>
        <p>Right side: tap or hold ⚔ to attack. The three small buttons use skills you learn: in Skills, pick a skill and tap 1–3 to put it on a button. ⌂ Town (top right) takes you back to camp.</p>
        <p>Kill monsters for experience. Each level gives 1 skill point and 5 stat points.</p>
        <p>Tap an item's name on the ground to pick it up. In the Bag, drag items around the grid or onto a slot to equip. One-handed weapons can go in the off-hand to dual wield.</p>
        <p>Kill the boss to open the stairs to the next level. Each act has five levels; the fifth holds the act's final boss, who drops an artifact ✧ and opens the way to the next act. In camp, sell loot to Hilde and buy potions. The waypoint ✦ takes you to any level you’ve reached.</p>
        <p>Some monsters hit with fire, cold, lightning or poison. Resist gear cuts that damage (up to 75%). Cold slows you, poison hurts over time.</p>
        <p>Tap ⌂ Town (top right) any time in the crypt to return to camp. Stand still for a moment; monsters can’t interrupt it, walking cancels it. A blue portal ◎ in camp takes you back to the exact spot. Items never need identifying.</p>
        <p class="ver">Ember Crypt v0.9.3 · all art made in code for this game</p>
      </div>`;
  }

  /** Update the "Last saved" time without redrawing the panel. */
  savedChanged() {
    const el = this.panel.querySelector("#lastsaved");
    const t = this.hooks.save.lastSaved();
    if (el && t) el.textContent = new Date(t).toLocaleTimeString();
  }

  private async saveAction(act: string, el: HTMLElement) {
    const sv = this.hooks.save;
    this.saveMsg = "";
    if (act === "exp-copy") {
      const code = sv.exportCode();
      let ok = false;
      try {
        await navigator.clipboard.writeText(code);
        ok = true;
      } catch {
        /* no clipboard permission: show the code to copy by hand */
      }
      this.exportShown = ok ? "" : code;
      this.saveMsg = ok ? `Save code copied (${Math.round(code.length / 1024)} KB). Paste it somewhere safe, like Notes.` : "Copy the code below (tap it, Select All, Copy).";
    } else if (act === "exp-share" || act === "exp-file") {
      // v0.8.3: a real .embercrypt file through the share sheet (Save to Files / iCloud Drive), else a download
      const name = sv.fileName();
      const json = sv.exportJson();
      const file = new File([json], name, { type: "application/json" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (act === "exp-share" && nav.share && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: "Ember Crypt save" });
          sv.markFileBackup();
          this.saveMsg = `Backed up as ${name}. Restore from file brings it back on any device.`;
        } catch (e) {
          this.saveMsg = (e as Error)?.name === "AbortError" ? "Backup cancelled." : `Couldn't open the share sheet (${(e as Error)?.message ?? e}). Try again, or use Copy save code.`;
        }
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        sv.markFileBackup();
        this.saveMsg = `Saved ${name} to your downloads. Keep it somewhere safe (Files, iCloud Drive).`;
      }
    } else if (act === "imp-open") {
      this.importOpen = !this.importOpen;
      this.importPending = null;
    } else if (act === "imp-paste") {
      try {
        this.importText = (await navigator.clipboard.readText()).trim();
      } catch {
        this.saveMsg = "Couldn't read the clipboard. Tap the box, then Paste.";
      }
      if (this.importText) {
        const d = sv.importCode(this.importText);
        if (d) this.importPending = d;
        else this.saveMsg = "The clipboard doesn't hold an Ember Crypt save code.";
      }
    } else if (act === "imp-go") {
      const d = sv.importCode(this.importText);
      if (d) this.importPending = d;
      else this.saveMsg = "That code isn't a valid Ember Crypt save.";
    } else if (act === "imp-yes" && this.importPending) {
      const d = this.importPending;
      this.importPending = null;
      this.importOpen = false;
      this.importText = "";
      sv.replace(d);
      this.toast(`Loaded your level ${d.player.level} hero. Your previous hero is in Backups.`);
      return;
    } else if (act === "imp-no") {
      this.importPending = null;
      this.importOpen = false;
    } else if (act === "bak") {
      const d = sv.loadBackup(el.dataset.key!);
      if (d) {
        this.importOpen = true;
        this.importPending = d;
      }
    }
    if (this.openTab) this.renderPanel();
    const box = this.panel.querySelector<HTMLTextAreaElement>("#expcode");
    if (box) {
      box.focus();
      box.select();
      box.setSelectionRange(0, box.value.length);
    }
  }

  private cloudStep: "email" | "code" = "email";
  private cloudEmail = "";
  private cloudMsg = "";
  private async cloudAction(act: string) {
    const cl = this.hooks.save.cloud;
    if (!cl) return;
    this.cloudMsg = "";
    const val = (id: string) => this.panel.querySelector<HTMLInputElement>(id)?.value.trim() ?? "";
    if (act === "cloud-send") {
      const email = val("#cloud-email");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) this.cloudMsg = "Enter your email address.";
      else {
        this.cloudEmail = email;
        this.cloudMsg = "Sending…";
        this.renderPanel();
        const err = await cl.sendCode(email);
        this.cloudMsg = err ? `Couldn't send the code: ${err}` : "";
        if (!err) this.cloudStep = "code";
      }
    } else if (act === "cloud-verify") {
      const err = await cl.verify(this.cloudEmail, val("#cloud-code"));
      if (err) this.cloudMsg = `That code didn't work: ${err}`;
      else {
        this.cloudStep = "email";
        this.cloudMsg = await cl.syncNow();
      }
    } else if (act === "cloud-sync") this.cloudMsg = await cl.syncNow();
    else if (act === "cloud-out") {
      cl.signOut();
      this.cloudMsg = "Signed out. Your hero stays on this device.";
    } else if (act === "cloud-back") this.cloudStep = "email";
    if (this.openTab === "settings") this.renderPanel();
  }

  /** File chosen in the import box. */
  private async importFile(f: File) {
    const text = await f.text();
    const d = this.hooks.save.importCode(text);
    this.importOpen = true;
    if (d) this.importPending = d;
    else {
      this.importOpen = false;
      this.saveMsg = "That file isn't a valid Ember Crypt save.";
    }
    if (this.openTab) this.renderPanel();
  }

}
