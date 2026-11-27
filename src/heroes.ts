/**
 * v1.0 character select / create. A full-screen overlay listing the heroes on this device (last played first),
 * with "New hero" leading to a class choice (Barbarian / Amazon / Sorceress) and a name. The game is paused while it's open.
 */
import { CLASS_NAME, HERO_CLASSES, type HeroClass } from "./data/skills";
import { type Look, getFrame, heroModel, lookKey } from "./sprites/puppet";
import { actDef, levelInAct } from "./data/acts";
import { MAX_HEROES } from "./save";

export interface HeroCard {
  slot: number;
  cls: HeroClass;
  name: string;
  level: number;
  maxFloor: number;
  savedAt: number;
  look: Look;
}
export interface HeroSelectHooks {
  heroes(): HeroCard[];
  current(): number;
  canCreate(): boolean;
  pick(slot: number): void;
  create(cls: HeroClass, name: string): void;
  click(): void;
  /** v1.0.1: delete a hero; true when it was the one being played */
  remove(slot: number): boolean;
}

const CLASS_BLURB: Record<HeroClass, string> = {
  barbarian: "A towering warrior of the high steppes. Masters every weapon, fights two-handed or with one in each hand, and shouts to turn the tide.",
  amazon: "A swift huntress from the Skovos Isles. Bows and javelins, dodging and evading blows, with fire, cold and lightning in her missiles.",
  sorceress: "A mage of the Zann Esu. Fire, cold and lightning spells from a staff, wand or orb; frail, but with deep mana.",
};
const START_LOOK: Record<HeroClass, Look> = {
  barbarian: { main: "short_sword", off: "buckler", chest: "quilted_armor" },
  amazon: { main: "short_bow", off: "arrows", chest: "leather_armor" },
  sorceress: { main: "battle_staff", chest: "quilted_armor" },
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A crisp 3x portrait of a hero (idle, facing down-right). */
export function portrait(cls: HeroClass, look: Look, scale = 3): string {
  const fr = getFrame(heroModel(cls), look, lookKey(look) + "|portrait", "idle", 1, 0);
  const c = document.createElement("canvas");
  // crop to the figure: the frame is 52x58 with the feet near the bottom
  c.width = 30 * scale;
  c.height = 44 * scale;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.drawImage(fr.c, fr.ax - 15, fr.ay - 41, 30, 44, 0, 0, c.width, c.height);
  return c.toDataURL();
}

export class HeroSelect {
  el: HTMLElement;
  open = false;
  private step: "list" | "new" | "delete" = "list";
  private delSlot = 0;
  private cls: HeroClass = "amazon";
  private name = "";
  private closable = false;
  constructor(root: HTMLElement, private h: HeroSelectHooks) {
    this.el = document.createElement("div");
    this.el.id = "heroes";
    this.el.hidden = true;
    root.appendChild(this.el);
    this.el.addEventListener("click", (e) => this.onClick(e));
    this.el.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === "hero-name") this.name = t.value;
      if (t.id === "hero-del-name") {
        const h = this.h.heroes().find((x) => x.slot === this.delSlot);
        const ok = !!h && t.value.trim().toLowerCase() === h.name.trim().toLowerCase();
        const btn = this.el.querySelector<HTMLButtonElement>("[data-hact=del-yes]");
        if (btn) btn.disabled = !ok;
      }
    });
  }
  /** v1.0.1: when it opened; the tap that opened it (Settings → Change hero) must not also "click" a card under it */
  private shownAt = 0;
  show(opts: { closable: boolean; create?: boolean }) {
    this.open = true;
    this.shownAt = performance.now();
    this.closable = opts.closable;
    this.step = opts.create || !this.h.heroes().length ? "new" : "list";
    this.el.hidden = false;
    this.render();
  }
  hide() {
    this.open = false;
    this.el.hidden = true;
  }
  private render() {
    const heroes = this.h.heroes();
    if (this.step === "new") {
      const cards = HERO_CLASSES
        .map((c) => `<button class="hcls ${c === this.cls ? "on" : ""}" data-hact="cls" data-cls="${c}"><img src="${portrait(c, START_LOOK[c])}" alt=""/><b>${CLASS_NAME[c]}</b><small>${CLASS_BLURB[c]}</small></button>`)
        .join("");
      this.el.innerHTML = `
        <div class="hbox">
          <div class="htitle">New hero</div>
          <div class="hclasses">${cards}</div>
          <div class="hname"><label for="hero-name">Name</label><input id="hero-name" maxlength="16" autocomplete="off" placeholder="${CLASS_NAME[this.cls]}" value="${esc(this.name)}"/></div>
          <div class="hbtns">
            <button class="gbtn hot" data-hact="create">Create ${CLASS_NAME[this.cls]}</button>
            ${heroes.length ? `<button class="gbtn dim" data-hact="back">Back</button>` : ""}
          </div>
        </div>`;
      return;
    }
    if (this.step === "delete") {
      const x = heroes.find((h) => h.slot === this.delSlot);
      if (x) {
        this.el.innerHTML = `
        <div class="hbox hdel">
          <div class="htitle">Delete hero?</div>
          <div class="hdelrow">
            <img src="${portrait(x.cls, x.look)}" alt=""/>
            <div class="hdeltext">
              <div><b>${esc(x.name)}</b> · level ${x.level} ${CLASS_NAME[x.cls]}</div>
              <p>This deletes the hero, their gear, bag and skills from this device for good. Your other heroes and the shared stash chest are not touched.</p>
              <label for="hero-del-name">Type <b>${esc(x.name)}</b> to confirm</label>
              <input id="hero-del-name" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(x.name)}"/>
            </div>
          </div>
          <div class="hbtns">
            <button class="gbtn hdanger" data-hact="del-yes" disabled>Delete forever</button>
            <button class="gbtn dim" data-hact="del-no">Keep hero</button>
          </div>
        </div>`;
        return;
      }
      this.step = "list";
    }
    const cur = this.h.current();
    const list = heroes
      .map((x) => {
        const act = actDef(Math.max(1, x.maxFloor));
        const where = x.maxFloor > 0 ? `Act ${act.roman} · level ${levelInAct(Math.max(1, x.maxFloor))}` : "Ember Camp";
        const when = x.savedAt ? new Date(x.savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
        return `<div class="hrow"><button class="hcard ${x.slot === cur ? "cur" : ""}" data-hact="pick" data-slot="${x.slot}">
          <img src="${portrait(x.cls, x.look)}" alt=""/>
          <span class="hinfo"><b>${esc(x.name)}</b><span>Level ${x.level} ${CLASS_NAME[x.cls]}</span><small>${where}${when ? ` · played ${when}` : ""}</small></span>
        </button><button class="hdelb" data-hact="del" data-slot="${x.slot}" aria-label="Delete ${esc(x.name)}" title="Delete hero">🗑</button></div>`;
      })
      .join("");
    const canNew = this.h.canCreate();
    this.el.innerHTML = `
      <div class="hbox">
        <div class="htitle">Choose your hero <small class="hcount">${heroes.length}/${MAX_HEROES}</small></div>
        <div class="hlist">${list}
          <button class="hcard new" data-hact="new" ${canNew ? "" : "disabled"}><span class="plus">+</span><span class="hinfo"><b>New hero</b><small>${canNew ? "Barbarian, Amazon or Sorceress" : `All ${MAX_HEROES} hero slots are used: delete one (🗑) to make room`}</small></span></button>
        </div>
        <div class="hnote">The stash chest in camp is shared by all your heroes.</div>
        ${this.closable ? `<div class="hbtns"><button class="gbtn dim" data-hact="close">Cancel</button></div>` : ""}
      </div>`;
  }
  private onClick(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-hact]");
    if (!b || (b as HTMLButtonElement).disabled) return;
    if (performance.now() - this.shownAt < 400) return; // ghost click from the opening tap
    this.h.click();
    const a = b.dataset.hact;
    if (a === "pick") {
      this.hide();
      this.h.pick(Number(b.dataset.slot));
      return;
    }
    if (a === "del") {
      this.delSlot = Number(b.dataset.slot);
      this.step = "delete";
      this.render();
      setTimeout(() => this.el.querySelector<HTMLInputElement>("#hero-del-name")?.focus(), 50);
      return;
    }
    if (a === "del-no") this.step = "list";
    else if (a === "del-yes") {
      const wasCurrent = this.h.remove(this.delSlot);
      this.step = "list";
      // the hero being played is gone: you must pick another hero or make a new one
      if (wasCurrent) this.closable = false;
      if (!this.h.heroes().length) this.step = "new";
    } else if (a === "new") this.step = "new";
    else if (a === "back") this.step = "list";
    else if (a === "cls") this.cls = b.dataset.cls as HeroClass;
    else if (a === "close") {
      this.hide();
      return;
    } else if (a === "create") {
      const name = (this.el.querySelector<HTMLInputElement>("#hero-name")?.value ?? this.name).trim().slice(0, 16);
      this.hide();
      this.name = "";
      this.h.create(this.cls, name);
      return;
    }
    this.render();
  }
}
