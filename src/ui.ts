import { BASE_BY_ID, EQUIP_LABEL, type EquipSlot, type Item, SLOT_LABEL, isTwoHanded, sellPrice } from "./data/items";
import { MAX_SKILL_LVL, SKILLS, SKILL_BY_ID, type Tab, TAB_NAMES } from "./data/skills";
import { type Game, type Stats, VENDOR_H, VENDOR_W, xpForLevel } from "./game";
import { Input } from "./input";
import { GRID_H, GRID_W, overlapping, sizeOf } from "./inventory";
import type { Settings } from "./save";
import { itemIconUrl } from "./sprites/items";

export type PanelTab = "char" | "inv" | "skills" | "settings" | "shop" | "wp";

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

type Src = "bag" | "eq" | "vendor";
interface Sel {
  src: Src;
  uid?: number;
  slot?: EquipSlot;
}
type Target =
  | { kind: "grid"; grid: "bag"; x: number; y: number; ok: "ok" | "swap" | "bad" }
  | { kind: "grid"; grid: "vendor"; ok: "ok" | "bad" }
  | { kind: "slot"; slot: EquipSlot; ok: "ok" | "bad" }
  | { kind: "ground"; ok: "ok" | "bad" }
  | null;

interface Press {
  pid: number;
  x: number;
  y: number;
  sel: Sel | null;
  grid?: "bag" | "vendor";
  slot?: EquipSlot;
  moved: boolean;
  touch: boolean;
  ghost?: HTMLElement;
  target?: Target;
}

export interface UiHooks {
  settingsChanged(): void;
  newGame(): void;
  click(): void;
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
          <div id="floor-label">Ember Camp</div>
          <div id="objective"></div>
          <div id="buffs"></div>
          <canvas id="minimap" width="150" height="90"></canvas>
        </div>
        <div class="hud-tr">
          <button class="mbtn" data-tab="char" aria-label="Character">Char<i class="dot" id="dot-char"></i></button>
          <button class="mbtn" data-tab="inv" aria-label="Inventory">Bag</button>
          <button class="mbtn" data-tab="skills" aria-label="Skills">Skills<i class="dot" id="dot-skills"></i></button>
          <button class="mbtn" data-tab="settings" aria-label="Settings">⚙</button>
        </div>
        <div class="globe life" aria-label="Life"><div class="fill"></div><span></span></div>
        <div class="globe mana" aria-label="Mana"><div class="fill"></div><span></span></div>
        <div id="xpbar"><div class="fill"></div></div>
        <button id="btn-attack" class="abtn" aria-label="Attack"><span>⚔</span></button>
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

    Input.holdButton($(root, "#btn-attack"), (v) => (input.attack = v));
    for (let i = 0; i < 3; i++) {
      const el = $(root, `#btn-s${i}`);
      Input.holdButton(
        el,
        (v) => (input.skills[i] = v && !!this.game().player.slots[i]),
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
    Input.tapButton($(root, "#btn-respawn"), () => {
      this.game().respawn();
      $(root, "#death").hidden = true;
    });
    root.querySelectorAll<HTMLElement>(".mbtn").forEach((b) => Input.tapButton(b, () => this.open(b.dataset.tab as PanelTab)));
    this.panel.addEventListener("pointerdown", (e) => {
      this.lastPanelDown = performance.now();
      this.onDown(e);
    });
    this.panel.addEventListener("pointermove", (e) => this.onMove(e));
    this.panel.addEventListener("pointerup", (e) => this.onUp(e));
    this.panel.addEventListener("pointercancel", () => this.cancelDrag());
    this.panel.addEventListener("click", (e) => this.onPanelClick(e));
  }

  /** The button above the controls: descend, trade or use the waypoint. */
  contextTap() {
    const g = this.game();
    const a = g.contextAction();
    if (a === "descend") g.descend();
    else if (a === "trade") this.open("shop");
    else if (a === "waypoint") this.open("wp");
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
      Math.ceil(p.buffs.shout), Math.ceil(p.buffs.bo), p.frenzy.stacks, Math.ceil(p.frenzy.t), g.maxFloor,
    ].join("|");
    if (key === this.lastHud) return;
    this.lastHud = key;
    const r = this.root;
    $(r, ".globe.life .fill").style.transform = `translateY(${(1 - hpPct) * 100}%)`;
    $(r, ".globe.mana .fill").style.transform = `translateY(${(1 - mpPct) * 100}%)`;
    $(r, ".globe.life span").textContent = `${Math.ceil(p.hp)}`;
    $(r, ".globe.mana span").textContent = `${Math.ceil(p.mana)}`;
    $(r, "#xpbar .fill").style.width = `${Math.min(100, xpPct * 100)}%`;
    $(r, "#btn-hp b").textContent = `${p.hpPots}`;
    $(r, "#btn-mp b").textContent = `${p.mpPots}`;
    $(r, "#btn-hp").classList.toggle("empty", p.hpPots === 0);
    $(r, "#btn-mp").classList.toggle("empty", p.mpPots === 0);
    $(r, "#floor-label").textContent = `${g.inTown ? "Ember Camp" : `Ember Crypt · Level ${g.floor}`}   ·   Lv ${p.level} Barbarian`;
    $(r, "#objective").textContent = g.inTown ? (g.maxFloor <= 1 && p.kills === 0 ? "Walk to the glowing waypoint ✦ to enter the crypt" : "Trade with Hilde, then take the waypoint ✦") : "";
    $(r, "#dot-char").textContent = p.statPoints ? `${p.statPoints}` : "";
    $(r, "#dot-skills").textContent = p.skillPoints ? `${p.skillPoints}` : "";
    for (let i = 0; i < 3; i++) {
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
    const btn = $(r, "#btn-ctx");
    btn.hidden = !ctx;
    btn.dataset.kind = ctx ?? "";
    btn.textContent = ctx === "descend" ? `▼ Descend to Level ${g.floor + 1}` : ctx === "trade" ? "⚖ Trade with Hilde" : ctx === "waypoint" ? "✦ Waypoint" : "";
    const buffs: string[] = [];
    if (p.frenzy.stacks > 0) {
      const left = p.frenzy.t > 0 ? Math.ceil(p.frenzy.t) : 0;
      buffs.push(`<span class="buff frenzy">⚡ Frenzy ×${p.frenzy.stacks}${left ? ` ${left}s` : ""}</span>`);
    }
    if (p.buffs.shout > 0) buffs.push(`<span class="buff shout">◈ ${Math.ceil(p.buffs.shout)}s</span>`);
    if (p.buffs.bo > 0) buffs.push(`<span class="buff bo">⚑ ${Math.ceil(p.buffs.bo)}s</span>`);
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

  toast(text: string) {
    const t = $(this.root, "#toast");
    t.textContent = text;
    t.classList.add("on");
    this.toastT = 2.6;
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
    this.hooks.click();
    this.openTab = tab;
    this.confirmReset = false;
    this.sel = null;
    this.input.reset();
    this.openedAt = performance.now();
    this.panel.hidden = false;
    this.renderPanel();
  }

  close() {
    this.cancelDrag();
    this.openTab = null;
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
    if (this.openTab === "shop") {
      this.C = Math.max(16, Math.min(30, Math.floor((W - 190 - 30) / 18.6), Math.floor((H - 30) / 5.2)));
      this.VC = Math.max(14, Math.min(26, Math.floor(this.C * 0.86), Math.floor((H - 24) / VENDOR_H)));
    } else {
      this.C = Math.max(18, Math.min(34, Math.floor((W - 200 - 28) / (10 + DOLL_W * 0.9)), Math.floor((H - 6) / (DOLL_H * 0.9))));
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
      ["settings", "Settings"],
    ];
    if (tab === "shop") tabs.unshift(["shop", "Trade"]);
    if (tab === "wp") tabs.unshift(["wp", "Waypoint"]);
    let body = "";
    if (tab === "char") body = this.charHtml();
    else if (tab === "inv") body = this.invHtml();
    else if (tab === "skills") body = this.skillsHtml();
    else if (tab === "shop") body = this.shopHtml();
    else if (tab === "wp") body = this.wpHtml();
    else body = this.settingsHtml();
    this.panel.innerHTML = `
      <div class="pbox">
        <div class="ptabs">
          ${tabs.map(([t, n]) => `<button class="ptab ${t === tab ? "on" : ""}" data-act="tab" data-tab="${t}">${n}</button>`).join("")}
          <button class="pclose" data-act="close" aria-label="Close">✕</button>
        </div>
        <div class="pbody pbody-${tab}">${body}</div>
      </div>`;
  }

  private onPanelClick(e: Event) {
    // ignore the click that iOS synthesizes from the tap that opened the panel
    if (this.lastPanelDown < this.openedAt) return;
    const t = e.target as HTMLElement;
    const me = e as MouseEvent;
    if (performance.now() < this.suppress.t && Math.hypot(me.clientX - this.suppress.x, me.clientY - this.suppress.y) < 40) return;
    if (t.closest(".dnd")) return; // grids and the doll use pointer handlers
    const el = t.closest<HTMLElement>("[data-act]");
    if (!el) {
      if (e.target === this.panel) this.close();
      return;
    }
    const g = this.game();
    const act = el.dataset.act!;
    this.hooks.click();
    const selItem = this.selItem();
    switch (act) {
      case "close":
        this.close();
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
      case "sell":
        if (this.sel?.src === "bag" && this.sel.uid !== undefined && selItem) {
          const price = g.sell(this.sel.uid);
          if (price) this.toast(`Sold ${BASE_BY_ID[selItem.baseId].name} for ${price} gold`);
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
      grid: gridEl?.dataset.grid as "bag" | "vendor" | undefined, slot: slotEl?.dataset.slot as EquipSlot | undefined,
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
      if (src === "vendor") return { kind: "slot", slot, ok: "bad" };
      if (src === "eq") return { kind: "slot", slot, ok: slot === pr.sel!.slot || !g.slotsFor(it).includes(slot) ? "bad" : "ok" };
      return { kind: "slot", slot, ok: g.equipError(it, slot) ? "bad" : "ok" };
    }
    const bagEl = this.panel.querySelector<HTMLElement>('[data-grid="bag"]');
    if (bagEl) {
      const r = bagEl.getBoundingClientRect();
      if (inRect(r, this.C * 0.5)) {
        const C = this.C;
        const cx = Math.max(0, Math.min(GRID_W - w, Math.round((x - r.left) / C - w / 2)));
        const cy = Math.max(0, Math.min(GRID_H - h, Math.round((y - r.top) / C - h / 2)));
        if (src === "vendor") return { kind: "grid", grid: "bag", x: cx, y: cy, ok: "ok" };
        const ignore = src === "bag" ? it.uid : -1;
        const over = overlapping(g.player.bag, w, h, cx, cy, ignore);
        const ok = over.length === 0 ? "ok" : over.length === 1 && src === "bag" ? "swap" : "bad";
        return { kind: "grid", grid: "bag", x: cx, y: cy, ok };
      }
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
    if (t.kind === "grid" && t.grid === "bag") {
      const el = this.panel.querySelector<HTMLElement>('[data-grid="bag"]')!;
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
      else err = g.buy(s.uid!);
      if (!err && s.src !== "bag") this.sel = null;
    } else if (t.kind === "grid" && t.grid === "vendor") {
      const price = g.sell(s.uid!);
      if (price) this.toast(`Sold ${BASE_BY_ID[it.baseId].name} for ${price} gold`);
      this.sel = null;
    } else if (t.kind === "ground") {
      g.dropFromBag(s.uid!);
      this.toast(`Dropped ${BASE_BY_ID[it.baseId].name}`);
      this.sel = null;
    }
    if (err) this.toast(err);
  }

  private tap(pr: Press, x: number, y: number) {
    const g = this.game();
    this.hooks.click();
    if (pr.sel) {
      if (this.sameSel(pr.sel, this.sel)) {
        // second tap: the obvious action
        const it = this.selItem();
        if (!it) return;
        if (pr.sel.src === "bag" && this.openTab === "inv") {
          if (BASE_BY_ID[it.baseId].potion) g.drinkFromBag(pr.sel.uid!);
          else {
            const err = g.equipFromBag(pr.sel.uid!);
            if (err) return this.toast(err);
          }
          this.sel = null;
        } else if (pr.sel.src === "eq") {
          const err = g.unequip(pr.sel.slot!);
          if (err) return this.toast(err);
          this.sel = null;
        }
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
    if (pr.grid === "vendor" && cur?.src === "bag" && it) {
      const price = g.sell(cur.uid!);
      if (price) this.toast(`Sold ${BASE_BY_ID[it.baseId].name} for ${price} gold`);
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
    const next = xpForLevel(p.level + 1);
    const row = (k: keyof Stats, name: string, note: string) => `
      <div class="srow">
        <div class="sname">${name}<small>${note}</small></div>
        <div class="sval">${s[k]}</div>
        ${p.statPoints ? `<button class="splus" data-act="stat" data-stat="${k}" aria-label="Add ${name}">+</button>` : `<span class="splus off"></span>`}
      </div>`;
    const hands = d.hands
      .map((h, i) => {
        const it = h.slot ? p.equip[h.slot] : null;
        const name = it ? BASE_BY_ID[it.baseId].name : "Fists";
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
        <div class="kv"><span>Gold</span><b class="gold">${p.gold.toLocaleString()}</b></div>
        <div class="kv"><span>Kills · deepest level</span><b>${p.kills} · ${g.maxFloor}</b></div>
      </div>`;
  }

  // ------------------------------------------------------------ items
  private itemLines(it: Item): string {
    const g = this.game();
    const b = BASE_BY_ID[it.baseId];
    const s = g.player.base;
    const lines: string[] = [];
    if (b.slot === "weapon") {
      lines.push(`${b.hands === 2 ? "Two-Hand" : "One-Hand"} Damage: <b>${b.min} to ${b.max}</b>`);
      lines.push(`Speed: ${b.speedLabel}${b.hands === 1 ? " · can dual wield" : ""}`);
    } else if (b.potion) {
      lines.push(b.potion === "hp" ? "Restores 45% life over a few seconds" : "Restores 60% mana over a few seconds");
    } else if (it.def) lines.push(`Defense: <b>${it.def}</b>`);
    if (b.beltSlots) lines.push(`Belt: holds <b>+${b.beltSlots}</b> potions of each kind`);
    if (b.bonus?.ar) lines.push(`<span class="mod">+${b.bonus.ar} to Attack Rating</span>`);
    if (b.bonus?.life) lines.push(`<span class="mod">+${b.bonus.life} to Life</span>`);
    if (b.bonus?.mana) lines.push(`<span class="mod">+${b.bonus.mana} to Mana</span>`);
    if (b.reqStr) lines.push(`<span class="${s.str < b.reqStr ? "bad" : ""}">Required Strength: ${b.reqStr}</span>`);
    if (b.reqDex) lines.push(`<span class="${s.dex < b.reqDex ? "bad" : ""}">Required Dexterity: ${b.reqDex}</span>`);
    if (b.reqLvl) lines.push(`<span class="${g.player.level < b.reqLvl ? "bad" : ""}">Required Level: ${b.reqLvl}</span>`);
    return lines.map((l) => `<div>${l}</div>`).join("");
  }

  private compareLine(it: Item): string {
    const g = this.game();
    const b = BASE_BY_ID[it.baseId];
    const slot = g.defaultSlot(it);
    if (!slot) return "";
    const cur = g.player.equip[slot];
    if (!cur) return `<div class="cmp up">${EQUIP_LABEL[slot]} is empty — equip it!</div>`;
    const cb = BASE_BY_ID[cur.baseId];
    if (b.slot === "weapon" && cb.slot === "weapon") {
      const diff = (b.min! + b.max!) / 2 - (cb.min! + cb.max!) / 2;
      return `<div class="cmp ${diff > 0 ? "up" : diff < 0 ? "down" : ""}">vs ${esc(cb.name)}: ${diff >= 0 ? "+" : ""}${diff.toFixed(1)} avg damage</div>`;
    }
    if (it.def !== undefined || cur.def !== undefined) {
      const diff = (it.def ?? 0) - (cur.def ?? 0);
      return `<div class="cmp ${diff > 0 ? "up" : diff < 0 ? "down" : ""}">vs ${esc(cb.name)}: ${diff >= 0 ? "+" : ""}${diff} defense</div>`;
    }
    return `<div class="cmp">Replaces ${esc(cb.name)}</div>`;
  }

  private itemBox(it: Item, src: Src, x: number, y: number, C: number, extra = "") {
    const b = BASE_BY_ID[it.baseId];
    const sel = this.sel && this.sel.src === src && this.sel.uid === it.uid;
    const bad = src !== "vendor" && !b.potion && !this.game().meetsReq(it);
    return `<div class="gi ${sel ? "sel" : ""} ${bad ? "bad" : ""}" data-src="${src}" data-uid="${it.uid}" style="left:${x * C}px;top:${y * C}px;width:${b.w * C}px;height:${b.h * C}px" ${extra}>
      <img src="${itemIconUrl(it)}" alt="${esc(b.name)}" draggable="false"/></div>`;
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
          inner = `<div class="eqi" data-src="eq" data-eq="${s}"><img src="${itemIconUrl(it)}" alt="${esc(b.name)}" draggable="false" style="width:${b.w * U * k}px;height:${b.h * U * k}px"/></div>`;
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
    const g = this.game();
    const s = this.sel;
    const it = this.selItem();
    if (!s || !it) {
      return shop
        ? `<div class="hint">Tap an item to see its price.<br/>Drag your items onto Hilde's stock to sell. Drag hers into your bag to buy.</div>`
        : `<div class="hint">Tap an item to see it. Tap again to equip.<br/>Drag items to rearrange or onto a slot to equip.<br/>Drag out of the window to drop.</div>`;
    }
    const b = BASE_BY_ID[it.baseId];
    const btns: string[] = [];
    let price = "";
    if (s.src === "vendor") {
      price = `<div class="price ${g.player.gold < b.price ? "bad" : ""}">Price: ${b.price} gold</div>`;
      btns.push(`<button class="gbtn" data-act="buy" ${g.player.gold < b.price ? "disabled" : ""}>Buy</button>`);
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
        else btns.push(`<button class="gbtn" data-act="equip" ${g.meetsReq(it) ? "" : "disabled"}>Equip</button>`);
        btns.push(`<button class="gbtn dim" data-act="drop">Drop</button>`);
      }
    } else {
      btns.push(`<button class="gbtn" data-act="unequip">Unequip</button>`);
    }
    return `
      <div class="iname">${esc(b.name)}</div>
      <div class="itype">${s.src === "eq" ? EQUIP_LABEL[s.slot!] : SLOT_LABEL[b.slot]} · Normal · ${b.w}×${b.h}</div>
      ${this.itemLines(it)}
      ${s.src !== "eq" && !b.potion ? this.compareLine(it) : ""}
      ${price}
      <div class="ibtns">${btns.join("")}</div>`;
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
        const b = BASE_BY_ID[e.item.baseId];
        return this.itemBox(e.item, "vendor", e.x, e.y, VC, `data-price="${b.price}"`);
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

  private wpHtml() {
    const g = this.game();
    const here = g.inTown ? 0 : g.floor;
    const rows = [0, ...Array.from({ length: g.maxFloor }, (_, i) => i + 1)]
      .map((f) => {
        const name = f === 0 ? "Ember Camp" : `Ember Crypt · Level ${f}`;
        return `<button class="wprow ${f === here ? "here" : ""}" data-act="wp" data-floor="${f}" ${f === here ? "disabled" : ""}>
          <span class="wpg">✦</span>${name}${f === here ? " <small>(you are here)</small>" : ""}</button>`;
      })
      .join("");
    return `
      <div class="wplist">${rows}</div>
      <div class="idetail"><div class="iname">Waypoint</div>
        <div class="hint">Travel between camp and any crypt level you've reached. Going back down rebuilds the level, and its monsters return.</div></div>`;
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
          ? `<div class="assign"><span>Skill button:</span>${[0, 1, 2]
              .map((i) =>
                p.slots[i] === s.id
                  ? `<button class="slotb on" data-act="unassign" data-slot="${i}">${i + 1} ✓</button>`
                  : `<button class="slotb" data-act="assign" data-slot="${i}" data-id="${s.id}">${i + 1}</button>`,
              )
              .join("")}</div>`
          : "";
      detail = `
        <div class="iname">${s.glyph} ${esc(s.name)}</div>
        <div class="itype">${s.kind === "passive" ? "Passive" : "Active"} · Level ${lvl}/${MAX_SKILL_LVL}${s.mana && s.implemented ? ` · Mana ${s.mana(Math.max(1, lvl))}` : ""}</div>
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
    return `
      <div class="set-col">
        ${t("showJoystick", "Show joystick", "Debug: draw the movement stick where your thumb lands")}
        ${t("sound", "Sound", "Sound effects")}
        ${t("shake", "Screen shake", "Shake on big hits")}
        ${t("labels", "Item labels", "Show item names on the ground")}
        <button class="gbtn danger" data-act="reset">${this.confirmReset ? "Tap again to erase your hero" : "Start a new character"}</button>
      </div>
      <div class="set-col help">
        <b>How to play</b>
        <p>Left side: put your thumb down anywhere and drag to move. Lift to stop.</p>
        <p>Right side: tap or hold ⚔ to attack. The three small buttons use skills you learn.</p>
        <p>Kill monsters for experience. Each level gives 1 skill point and 5 stat points.</p>
        <p>Tap an item's name on the ground to pick it up. In the Bag, drag items around the grid or onto a slot to equip. One-handed weapons can go in the off-hand to dual wield.</p>
        <p>Kill the boss to open the stairs to the next level. In camp, sell loot to Hilde and buy potions. The waypoint ✦ takes you to any level you’ve reached.</p>
        <p class="ver">Ember Crypt v0.2 · progress saves on this device · all art made in code for this game</p>
      </div>`;
  }
}
