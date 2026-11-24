import { BASE_BY_ID, type Item, SLOT_LABEL, type Slot } from "./data/items";
import { MAX_SKILL_LVL, SKILLS, SKILL_BY_ID, type Tab, TAB_NAMES } from "./data/skills";
import { type Game, type Stats, xpForLevel } from "./game";
import { itemIconUrl } from "./icons";
import { Input } from "./input";
import type { Settings } from "./save";

export type PanelTab = "char" | "inv" | "skills" | "settings";

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

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
  private selItem: { where: "inv"; i: number } | { where: "eq"; slot: Slot } | null = null;
  private lastHud = "";
  private toastT = 0;
  private confirmReset = false;
  private openedAt = 0;
  private lastPanelDown = 0;
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
          <div id="floor-label">Ember Crypt · Level 1</div>
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
        <button id="btn-descend" hidden>▼ Descend</button>
        <div id="tutorial" hidden>
          <div class="tut-left">Put your thumb anywhere here<br/>and drag to move</div>
          <div class="tut-right">Tap or hold ⚔ to attack →</div>
        </div>
      </div>
      <div id="toast"></div>
      <div id="panel" hidden></div>
      <div id="death" hidden>
        <div class="death-title">You have died</div>
        <button id="btn-respawn" class="gbtn">Respawn</button>
        <div class="death-sub">You'll return to the entrance. You lose 10% of your gold.</div>
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
    Input.tapButton($(root, "#btn-descend"), () => {
      this.game().descend();
    });
    Input.tapButton($(root, "#btn-respawn"), () => {
      this.game().respawn();
      $(root, "#death").hidden = true;
    });
    root.querySelectorAll<HTMLElement>(".mbtn").forEach((b) => Input.tapButton(b, () => this.open(b.dataset.tab as PanelTab)));
    this.panel.addEventListener("pointerdown", () => (this.lastPanelDown = performance.now()));
    this.panel.addEventListener("click", (e) => this.onPanelClick(e));
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
    const key = [
      Math.round(hpPct * 200), Math.round(mpPct * 200), Math.round(xpPct * 300), Math.ceil(p.hp), Math.ceil(p.mana),
      p.hpPots, p.mpPots, slots, p.statPoints, p.skillPoints, g.floor, p.level, g.nearStairs(),
      Math.ceil(p.buffs.shout), Math.ceil(p.buffs.bo),
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
    $(r, "#floor-label").textContent = `Ember Crypt · Level ${g.floor}   ·   Lv ${p.level} Barbarian`;
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
    const dsc = $(r, "#btn-descend");
    dsc.hidden = !g.nearStairs();
    dsc.textContent = `▼ Descend to Level ${g.floor + 1}`;
    const buffs: string[] = [];
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
    this.input.reset();
    this.openedAt = performance.now();
    this.panel.hidden = false;
    this.renderPanel();
  }

  close() {
    this.openTab = null;
    this.panel.hidden = true;
    this.selItem = null;
  }

  refresh() {
    this.lastHud = "";
    if (this.openTab) this.renderPanel();
  }

  private renderPanel() {
    const tab = this.openTab!;
    const tabs: [PanelTab, string][] = [
      ["char", "Character"],
      ["inv", "Inventory"],
      ["skills", "Skills"],
      ["settings", "Settings"],
    ];
    let body = "";
    if (tab === "char") body = this.charHtml();
    else if (tab === "inv") body = this.invHtml();
    else if (tab === "skills") body = this.skillsHtml();
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
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!el) {
      if (e.target === this.panel) this.close();
      return;
    }
    const g = this.game();
    const act = el.dataset.act!;
    this.hooks.click();
    switch (act) {
      case "close":
        this.close();
        return;
      case "tab":
        this.openTab = el.dataset.tab as PanelTab;
        this.selItem = null;
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
      case "inv": {
        const i = Number(el.dataset.i);
        const cur = this.selItem;
        if (cur && cur.where === "inv" && cur.i === i && g.player.inventory[i]) {
          // second tap equips
          const err = g.equipFromInventory(i);
          if (err) this.toast(err);
          this.selItem = null;
        } else this.selItem = g.player.inventory[i] ? { where: "inv", i } : null;
        break;
      }
      case "eq":
        this.selItem = g.player.equip[el.dataset.slot as Slot] ? { where: "eq", slot: el.dataset.slot as Slot } : null;
        break;
      case "equip": {
        if (this.selItem?.where === "inv") {
          const err = g.equipFromInventory(this.selItem.i);
          if (err) this.toast(err);
          else this.selItem = null;
        }
        break;
      }
      case "unequip": {
        if (this.selItem?.where === "eq") {
          const err = g.unequip(this.selItem.slot);
          if (err) this.toast(err);
          this.selItem = null;
        }
        break;
      }
      case "drop":
        if (this.selItem?.where === "inv") {
          g.dropFromInventory(this.selItem.i);
          this.selItem = null;
        }
        break;
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
    const dmin = Math.round(d.dmgMin * (1 + d.dmgPct / 100));
    const dmax = Math.round(d.dmgMax * (1 + d.dmgPct / 100));
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
        <div class="kv"><span>Damage</span><b>${dmin} – ${dmax}</b></div>
        <div class="kv"><span>Attack rating</span><b>${d.ar}</b></div>
        <div class="kv"><span>Defense</span><b>${d.def}</b></div>
        <div class="kv"><span>Life</span><b>${Math.ceil(p.hp)} / ${d.maxHp}</b></div>
        <div class="kv"><span>Mana</span><b>${Math.ceil(p.mana)} / ${d.maxMana}</b></div>
        <div class="kv"><span>Critical strike</span><b>${d.crit}%</b></div>
        <div class="kv"><span>Gold</span><b class="gold">${p.gold.toLocaleString()}</b></div>
        <div class="kv"><span>Kills</span><b>${p.kills}</b></div>
        <div class="kv"><span>Dungeon level</span><b>${g.floor}</b></div>
      </div>`;
  }

  // ------------------------------------------------------------ inventory
  private itemLines(it: Item): string {
    const g = this.game();
    const b = BASE_BY_ID[it.baseId];
    const s = g.player.base;
    const lines: string[] = [];
    if (b.slot === "weapon") {
      lines.push(`One-Hand Damage: <b>${b.min} to ${b.max}</b>`);
      lines.push(`Speed: ${b.speedLabel}`);
    } else {
      lines.push(`Defense: <b>${it.def}</b>`);
    }
    if (b.reqStr) lines.push(`<span class="${s.str < b.reqStr ? "bad" : ""}">Required Strength: ${b.reqStr}</span>`);
    if (b.reqDex) lines.push(`<span class="${s.dex < b.reqDex ? "bad" : ""}">Required Dexterity: ${b.reqDex}</span>`);
    return lines.map((l) => `<div>${l}</div>`).join("");
  }

  private compareLine(it: Item): string {
    const g = this.game();
    const b = BASE_BY_ID[it.baseId];
    const cur = g.player.equip[b.slot];
    if (!cur) return `<div class="cmp up">Empty slot — equip it!</div>`;
    const cb = BASE_BY_ID[cur.baseId];
    if (b.slot === "weapon") {
      const a = (b.min! + b.max!) / 2;
      const c = (cb.min! + cb.max!) / 2;
      const diff = a - c;
      return `<div class="cmp ${diff > 0 ? "up" : diff < 0 ? "down" : ""}">vs ${esc(cb.name)}: ${diff >= 0 ? "+" : ""}${diff.toFixed(1)} avg damage</div>`;
    }
    const diff = (it.def ?? 0) - (cur.def ?? 0);
    return `<div class="cmp ${diff > 0 ? "up" : diff < 0 ? "down" : ""}">vs ${esc(cb.name)}: ${diff >= 0 ? "+" : ""}${diff} defense</div>`;
  }

  private invHtml() {
    const g = this.game();
    const p = g.player;
    const slots: Slot[] = ["helm", "weapon", "armor", "shield", "gloves", "boots"];
    const cell = (it: Item | null | undefined) =>
      it ? `<img src="${itemIconUrl(it)}" alt="${esc(BASE_BY_ID[it.baseId].name)}" draggable="false"/>` : "";
    const sel = this.selItem;
    const doll = slots
      .map((s) => {
        const it = p.equip[s];
        const on = sel?.where === "eq" && sel.slot === s;
        return `<button class="eq eq-${s} ${on ? "sel" : ""} ${it ? "" : "vacant"}" data-act="eq" data-slot="${s}">${cell(it)}<em>${SLOT_LABEL[s]}</em></button>`;
      })
      .join("");
    const bag = p.inventory
      .map((it, i) => {
        const on = sel?.where === "inv" && sel.i === i;
        const bad = it && !g.meetsReq(it);
        return `<button class="bag ${on ? "sel" : ""} ${bad ? "bad" : ""}" data-act="inv" data-i="${i}">${cell(it)}</button>`;
      })
      .join("");
    let detail = `<div class="hint">Tap an item to see it. Tap it again to equip.<br/>Monsters drop gear — tap the name on the ground to pick it up.</div>`;
    const it = sel ? (sel.where === "inv" ? p.inventory[sel.i] : p.equip[sel.slot]) : null;
    if (it) {
      const b = BASE_BY_ID[it.baseId];
      detail = `
        <div class="iname">${esc(b.name)}</div>
        <div class="itype">${SLOT_LABEL[b.slot]} · Normal</div>
        ${this.itemLines(it)}
        ${sel!.where === "inv" ? this.compareLine(it) : ""}
        <div class="ibtns">
          ${
            sel!.where === "inv"
              ? `<button class="gbtn" data-act="equip" ${g.meetsReq(it) ? "" : "disabled"}>Equip</button><button class="gbtn dim" data-act="drop">Drop</button>`
              : `<button class="gbtn" data-act="unequip">Unequip</button>`
          }
        </div>`;
    }
    return `
      <div class="doll">${doll}</div>
      <div class="bagwrap">
        <div class="bagtop"><span>Backpack</span><span class="gold">${p.gold.toLocaleString()} gold</span></div>
        <div class="baggrid">${bag}</div>
      </div>
      <div class="idetail">${detail}</div>`;
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
    const lines = list
      .flatMap((s) =>
        s.prereq.map((q) => {
          const a = SKILL_BY_ID[q];
          const x1 = a.col * CW + CW / 2;
          const y1 = a.row * RH + RH / 2;
          const x2 = s.col * CW + CW / 2;
          const y2 = s.row * RH + RH / 2;
          const lit = g.skillLevel(q) > 0;
          return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${lit ? "lit" : ""}"/>`;
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
        <p>Tap an item's name on the ground to pick it up. Equip it from the Bag.</p>
        <p>Kill the boss to open the stairs to the next, harder level.</p>
        <p class="ver">Ember Crypt v0.1 · progress saves on this device</p>
      </div>`;
  }
}
