import { enchant, rollDrop } from "./data/affixes";
import {
  BASE_BY_ID, type EquipSlot, ITEM_BASES, type Item, type Kind, type StatKey, beltSlotsOf, isTwoHanded, itemDamage,
  itemDefense, itemName, itemPrice, itemReqs, makeItem, migrateItem, modTotal, QUALITY_COLOR, qualityOf, sellPrice,
} from "./data/items";
import {
  MONSTERS, type MonsterDef, type MonsterKind, scaleAR, scaleDef, scaleDmg, scaleHp, scaleXp,
} from "./data/monsters";
import {
  FRENZY_HOLD, FRENZY_MAX_STACKS, MAX_SKILL_LVL, SKILL_BY_ID, bashAR, bashDmg, boDur, boPct, doubleSwingAR,
  findPotionChance, frenzyAR, frenzyDmg, frenzyIas, frenzyMove, howlDur,
  incSpeed, ironSkinDef, leapAttackDmg, leapRange, masteryAR, masteryCrit, masteryDmg, shoutDef, shoutDur,
  stunAR, stunDur,
} from "./data/skills";
import { type BagEntry, addItem, findSpot, fits, moveItem, sizeOf } from "./inventory";
import { type Level, bfs, generateLevel, generateTown, idx, isFloor, lineOfSight } from "./map";
import { Rng, chance, rand, randInt } from "./rng";

export interface Stats {
  str: number;
  dex: number;
  vit: number;
  ene: number;
}

export type Action =
  | { type: "swing"; skill: string | null; t: number; dur: number; hitAt: number[]; hands: number[]; hitsDone: number; target: Monster | null }
  | { type: "leap"; skill: string; t: number; dur: number; fx: number; fy: number; tx: number; ty: number; target: Monster | null }
  | { type: "cry"; t: number; dur: number };

export interface Player {
  x: number;
  y: number;
  r: number;
  fx: number;
  fy: number;
  hp: number;
  mana: number;
  level: number;
  xp: number;
  base: Stats;
  statPoints: number;
  skillPoints: number;
  skills: Record<string, number>;
  slots: (string | null)[];
  bag: BagEntry[];
  equip: Partial<Record<EquipSlot, Item>>;
  nextHand: number;
  frenzy: { stacks: number; t: number; decay: number };
  gold: number;
  hpPots: number;
  mpPots: number;
  action: Action | null;
  walkPhase: number;
  moving: boolean;
  buffs: { shout: number; bo: number };
  flash: number;
  z: number;
  moveTarget: GroundItem | null;
  dead: boolean;
  healLeft: number;
  manaLeft: number;
  kills: number;
}

export interface Monster {
  id: number;
  def: MonsterDef;
  mlvl: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dmgMin: number;
  dmgMax: number;
  ar: number;
  defense: number;
  xp: number;
  state: "idle" | "chase" | "attack" | "dead";
  atkT: number;
  windT: number;
  stunT: number;
  fearT: number;
  kx: number;
  ky: number;
  flash: number;
  fx: number;
  fy: number;
  walkPhase: number;
  pack: number;
  homeX: number;
  homeY: number;
  wanderT: number;
  wx: number;
  wy: number;
  deadT: number;
  searched: boolean;
  lastHurt: number;
}

export interface GroundItem {
  id: number;
  x: number;
  y: number;
  item?: Item;
  gold?: number;
  t: number;
}

export interface HitLog {
  hand: number;
  skill: string | null;
  t: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  life: number;
  size: number;
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  life: number;
  color: string;
  size: number;
}

export interface Ring {
  x: number;
  y: number;
  t: number;
  life: number;
  radius: number;
  color: string;
}

export interface FrameInput {
  /** joystick in screen space, normalized; mag 0..1 */
  mx: number;
  my: number;
  mag: number;
  attack: boolean;
  skills: boolean[];
}

export interface GameEvents {
  sound(name: string): void;
  toast(text: string): void;
  changed(): void;
  died(): void;
  levelUp(level: number): void;
  shake(amount: number): void;
}

export interface Hand {
  slot: EquipSlot | null;
  min: number;
  max: number;
  dmgPct: number;
  ar: number;
  crit: number;
  speed: number;
  kind: Kind | "fist";
  twoHanded: boolean;
}

export interface Derived {
  maxHp: number;
  maxMana: number;
  /** weapons in use: [main] or [main, off] when dual wielding */
  hands: Hand[];
  dual: boolean;
  def: number;
  speed: number;
  ias: number;
  /** main-hand shortcuts */
  dmgMin: number;
  dmgMax: number;
  dmgPct: number;
  ar: number;
  crit: number;
  swing: number;
  weaponKind: Kind | "fist";
  /** resistances in % (no elemental monsters yet) */
  res: { fire: number; cold: number; light: number; poison: number };
  /** % of damage dealt returned as life / mana */
  ll: number;
  ml: number;
  /** % faster run/walk and increased attack speed from gear */
  frw: number;
  gearIas: number;
  gf: number;
  mf: number;
  /** total attributes, gear included */
  stats: Stats;
}

/** Base walking speed in tiles per second (v0.3: raised from 3.5 to keep the v0.1 on-screen speed after the pixel-art rescale). */
export const BASE_RUN = 4.6;

export const BASE_POTS = 4;
export const VENDOR_W = 10;
export const VENDOR_H = 8;
export const BASE_STATS: Stats = { str: 30, dex: 20, vit: 25, ene: 10 };

/** Total XP needed to reach level L+1 from level L. */
export const xpForLevel = (L: number) => (L <= 1 ? 0 : Math.round(100 * Math.pow(L - 1, 1.9)));

export interface SaveData {
  v: 3;
  seed: number;
  floor: number;
  maxFloor: number;
  player: Pick<Player, "level" | "xp" | "base" | "statPoints" | "skillPoints" | "skills" | "slots" | "bag" | "equip" | "gold" | "hpPots" | "mpPots" | "kills">;
  /** items that didn't fit when an old save was converted */
  migratedSold?: number;
  migratedFrom?: number;
}

const MELEE_SKILLS = new Set(["bash", "double_swing", "stun", "frenzy"]);
const TWO_HIT = new Set(["double_swing", "frenzy"]);

/** Bring any older save up to v3: v1 (20-slot list, 6 slots) → v2 (grid bag, D2 slots) → v3 (item classes). */
export function migrateSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown> & { v: number };
  if (d.v === 3) return d as unknown as SaveData;
  if (d.v !== 1 && d.v !== 2) return null;
  const op = d.player as Record<string, unknown>;
  const equip: Partial<Record<EquipSlot, Item>> = {};
  let loose: Item[] = [];
  if (d.v === 1) {
    const oldEq = (op.equip ?? {}) as Record<string, Item>;
    const map: Record<string, EquipSlot> = { weapon: "main", shield: "off", armor: "chest", helm: "head", gloves: "gloves", boots: "boots" };
    for (const [k, v] of Object.entries(oldEq)) if (v && map[k]) equip[map[k]] = v;
    loose = ((op.inventory as (Item | null)[]) ?? []).filter((it): it is Item => !!it);
  } else {
    Object.assign(equip, op.equip ?? {});
    loose = ((op.bag as BagEntry[]) ?? []).map((e) => e.item);
  }
  // convert items to the class system
  for (const k of Object.keys(equip) as EquipSlot[]) {
    const it = migrateItem(equip[k]!);
    if (it) equip[k] = it;
    else delete equip[k];
  }
  if (isTwoHanded(equip.main) && equip.off) {
    loose.push(equip.off);
    delete equip.off;
  }
  // repack the bag (sizes changed); small items first so as many as possible survive
  const items = loose.map(migrateItem).filter((it): it is Item => !!it);
  const area = (it: Item) => BASE_BY_ID[it.baseId].w * BASE_BY_ID[it.baseId].h;
  items.sort((a, b) => area(a) - area(b));
  const bag: BagEntry[] = [];
  let gold = Number(op.gold ?? 0);
  let sold = 0;
  for (const it of items) {
    if (!addItem(bag, it)) {
      gold += sellPrice(it);
      sold++;
    }
  }
  const floor = Number(d.floor ?? 1);
  return {
    v: 3, seed: Number(d.seed), floor, maxFloor: Number(d.maxFloor ?? floor), migratedSold: sold, migratedFrom: d.v,
    player: {
      level: op.level as number, xp: op.xp as number, base: op.base as Stats, statPoints: op.statPoints as number,
      skillPoints: op.skillPoints as number, skills: (op.skills ?? {}) as Record<string, number>,
      slots: (op.slots ?? [null, null, null]) as (string | null)[], bag, equip, gold,
      hpPots: Number(op.hpPots ?? 0), mpPots: Number(op.mpPots ?? 0), kills: Number(op.kills ?? 0),
    },
  };
}

interface DungeonSnap {
  level: Level;
  monsters: Monster[];
  ground: GroundItem[];
  stairs: { x: number; y: number } | null;
  boss: Monster | null;
  px: number;
  py: number;
}

export const RECALL_TIME = 1.2;

export class Game {
  level!: Level;
  floor = 1;
  seed: number;
  player: Player;
  monsters: Monster[] = [];
  ground: GroundItem[] = [];
  floaters: Floater[] = [];
  particles: Particle[] = [];
  rings: Ring[] = [];
  stairs: { x: number; y: number } | null = null;
  boss: Monster | null = null;
  time = 0;
  inTown = true;
  maxFloor = 1;
  vendorStock: BagEntry[] = [];
  hitLog: HitLog[] = [];
  private flow = new Uint16Array(60 * 60);
  private flowFrom = -1;
  private nextId = 1;
  private exploreT = 0;
  private skillCd = 0;
  events: GameEvents;
  /** Return to Town channel in progress (seconds done / total). Monster hits don't stop it; walking does. */
  recall: { t: number; dur: number } | null = null;
  /** Blue portal in camp that leads back to the exact spot you recalled from (kept in memory only). */
  portal: { x: number; y: number; floor: number; snap: DungeonSnap } | null = null;
  /** world-space joystick direction from last frame (used by Leap) */
  moveDir = { x: 0, y: 0, active: false };

  constructor(events: GameEvents, save?: SaveData | null, seed?: number) {
    this.events = events;
    this.seed = save?.seed ?? seed ?? (Math.random() * 1e9) | 0;
    this.player = {
      x: 0, y: 0, r: 0.28, fx: 1, fy: 1, hp: 1, mana: 1, level: 1, xp: 0,
      base: { ...BASE_STATS }, statPoints: 0, skillPoints: 1, skills: {}, slots: [null, null, null],
      bag: [], equip: {}, nextHand: 0, frenzy: { stacks: 0, t: 0, decay: 0 }, gold: 0, hpPots: 3, mpPots: 1,
      action: null, walkPhase: 0, moving: false, buffs: { shout: 0, bo: 0 }, flash: 0, z: 0,
      moveTarget: null, dead: false, healLeft: 0, manaLeft: 0, kills: 0,
    };
    if (save) {
      Object.assign(this.player, JSON.parse(JSON.stringify(save.player)));
      this.player.bag = this.player.bag ?? [];
      this.floor = save.floor;
      this.maxFloor = Math.max(save.maxFloor ?? save.floor, save.floor);
    } else {
      this.player.equip.main = makeItem("axe", 1);
      this.player.equip.chest = makeItem("armor", 1);
      this.player.equip.belt = makeItem("belt", 1);
    }
    // like Diablo II, a loaded game starts in town
    this.goTown(true);
    const d = this.derived();
    this.player.hp = d.maxHp;
    this.player.mana = d.maxMana;
  }

  toSave(): SaveData {
    const p = this.player;
    return {
      v: 3, seed: this.seed, floor: this.floor, maxFloor: this.maxFloor,
      player: {
        level: p.level, xp: p.xp, base: p.base, statPoints: p.statPoints, skillPoints: p.skillPoints,
        skills: p.skills, slots: p.slots, bag: p.bag, equip: p.equip, gold: p.gold,
        hpPots: p.hpPots, mpPots: p.mpPots, kills: p.kills,
      },
    };
  }

  // ------------------------------------------------------------------ level setup
  /** Travel to the town hub. */
  goTown(silent = false) {
    this.inTown = true;
    this.level = generateTown();
    this.monsters = [];
    this.ground = [];
    this.floaters = [];
    this.particles = [];
    this.rings = [];
    this.stairs = null;
    this.boss = null;
    this.flowFrom = -1;
    const p = this.player;
    p.x = this.level.spawn.x;
    p.y = this.level.spawn.y;
    p.fx = 1;
    p.fy = 1;
    p.action = null;
    p.moveTarget = null;
    p.dead = false;
    p.buffs = { shout: 0, bo: 0 };
    p.frenzy = { stacks: 0, t: 0, decay: 0 };
    const d = this.derived();
    p.hp = d.maxHp;
    p.mana = d.maxMana;
    this.restock();
    if (!silent) {
      this.events.sound("stairs");
      this.events.toast("Ember Camp — you're safe here");
      this.events.changed();
    }
  }

  /** Travel to a dungeon level (by waypoint or stairs). */
  goDungeon(floor: number) {
    this.startFloor(floor);
    this.events.sound("stairs");
    this.events.toast(`Ember Crypt — Level ${this.floor}`);
    this.events.changed();
  }

  /** Vendor goods: basics plus a few random pieces near the deepest level reached. */
  restock() {
    const stock: BagEntry[] = [];
    const rng = new Rng(this.seed + this.maxFloor * 31 + Math.floor(this.time * 7));
    const r = () => rng.next();
    const lvl = Math.max(1, this.maxFloor * 2 - 1);
    const add = (it: Item) => addItem(stock, it, VENDOR_W, VENDOR_H);
    add(makeItem("hp_potion"));
    add(makeItem("mp_potion"));
    // plain gear of every class near your level
    for (const id of ["sword", "axe", "mace", "great_sword", "armor", "helm", "shield", "gloves", "boots", "belt"]) add(makeItem(id, Math.max(1, lvl - 1 + Math.floor(r() * 3))));
    // a few magic pieces (Hilde never sells rares)
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const pool = ITEM_BASES.filter((b) => b.weight > 0);
      const b = pool[Math.floor(r() * pool.length)];
      add(enchant(makeItem(b.id, lvl + Math.floor(r() * 3)), "magic", r));
    }
    this.vendorStock = stock;
  }

  startFloor(floor: number) {
    this.inTown = false;
    this.floor = floor;
    this.maxFloor = Math.max(this.maxFloor, floor);
    this.level = generateLevel(this.seed + floor * 7919);
    this.monsters = [];
    this.ground = [];
    this.floaters = [];
    this.particles = [];
    this.rings = [];
    this.stairs = null;
    this.flowFrom = -1;
    const rng = new Rng(this.seed + floor * 104729);
    const p = this.player;
    p.x = this.level.spawn.x;
    p.y = this.level.spawn.y;
    p.action = null;
    p.moveTarget = null;
    this.boss = null;
    let pack = 0;
    for (const room of this.level.rooms) {
      if (room === this.level.start) continue;
      const isBoss = room === this.level.bossRoom;
      const packs = isBoss ? 1 : rng.int(1, 2);
      for (let k = 0; k < packs; k++) {
        pack++;
        const kind: MonsterKind = rng.chance(0.5) ? "zombie" : "fallen";
        const n = kind === "zombie" ? rng.int(2, 4) : rng.int(3, 5);
        for (let i = 0; i < n; i++) {
          const x = rng.int(room.x + 1, room.x + room.w - 2) + 0.5;
          const y = rng.int(room.y + 1, room.y + room.h - 2) + 0.5;
          this.spawn(kind, floor, x, y, pack);
        }
      }
      if (isBoss) {
        pack++;
        this.boss = this.spawn("boss", floor + 1, room.cx + 0.5, room.cy + 0.5, pack);
      }
    }
    this.exploreAround(true);
  }

  private spawn(kind: MonsterKind, mlvl: number, x: number, y: number, pack: number): Monster {
    const def = MONSTERS[kind];
    const hp = scaleHp(def.hp, mlvl);
    const m: Monster = {
      id: this.nextId++, def, mlvl, x, y, hp, maxHp: hp,
      dmgMin: scaleDmg(def.dmgMin, mlvl), dmgMax: scaleDmg(def.dmgMax, mlvl),
      ar: scaleAR(def.ar, mlvl), defense: scaleDef(def.def, mlvl), xp: scaleXp(def.xp, mlvl),
      state: "idle", atkT: 0, windT: 0, stunT: 0, fearT: 0, kx: 0, ky: 0, flash: 0, fx: 0, fy: 1,
      walkPhase: Math.random() * 6, pack, homeX: x, homeY: y, wanderT: Math.random() * 3, wx: x, wy: y,
      deadT: 0, searched: false, lastHurt: -99,
    };
    this.monsters.push(m);
    return m;
  }

  // ------------------------------------------------------------------ derived stats
  /** Sum of one stat over all equipped items. */
  gear(k: StatKey): number {
    let t = 0;
    for (const it of Object.values(this.player.equip)) t += modTotal(it, k);
    return t;
  }

  /** Attributes with gear bonuses. */
  stats(): Stats {
    const b = this.player.base;
    return { str: b.str + this.gear("str"), dex: b.dex + this.gear("dex"), vit: b.vit + this.gear("vit"), ene: b.ene + this.gear("ene") };
  }

  private handFor(slot: EquipSlot | null): Hand {
    const p = this.player;
    const s = this.stats();
    const it = slot ? p.equip[slot] : undefined;
    const b = it ? BASE_BY_ID[it.baseId] : null;
    const kind: Kind | "fist" = b ? b.kind : "fist";
    const mastery = kind === "sword" ? "sword_mastery" : kind === "axe" ? "axe_mastery" : kind === "mace" ? "mace_mastery" : null;
    const ml = mastery ? this.skillLevel(mastery) : 0;
    const arPct = ml ? masteryAR(ml) : 0;
    const arFlat = this.gear("ar");
    const [min, max] = it && b ? itemDamage(it) : [1, 2];
    return {
      slot,
      min,
      max,
      dmgPct: s.str + (ml ? masteryDmg(ml) : 0),
      ar: Math.round((s.dex * 5 + 20 + p.level * 5 + arFlat) * (1 + arPct / 100)),
      crit: masteryCrit(ml),
      speed: b ? b.speed! : 0.42,
      kind,
      twoHanded: !!b && b.hands === 2,
    };
  }

  derived(): Derived {
    const p = this.player;
    const s = this.stats();
    const isWeapon = (sl: EquipSlot) => !!p.equip[sl] && BASE_BY_ID[p.equip[sl]!.baseId].slot === "weapon";
    const hands: Hand[] = [];
    if (isWeapon("main")) hands.push(this.handFor("main"));
    if (isWeapon("off")) hands.push(this.handFor("off"));
    if (!hands.length) hands.push(this.handFor(null));
    let armor = 0;
    for (const it of Object.values(p.equip)) if (it) armor += itemDefense(it);
    const g = (k: StatKey) => this.gear(k);
    let defPct = 0;
    const isl = this.skillLevel("iron_skin");
    if (isl) defPct += ironSkinDef(isl);
    if (p.buffs.shout > 0) defPct += shoutDef(this.skillLevel("shout") || 1);
    const boMul = p.buffs.bo > 0 ? 1 + boPct(this.skillLevel("battle_orders") || 1) / 100 : 1;
    const maxHp = Math.round((55 + (s.vit - 25) * 4 + (p.level - 1) * 2 + g("life")) * boMul);
    const maxMana = Math.round((10 + (s.ene - 10) * 1.5 + (p.level - 1) * 1.5 + g("mana")) * boMul);
    const fl = this.skillLevel("frenzy");
    const gearIas = Math.min(60, g("ias"));
    const ias = (fl ? (p.frenzy.stacks * frenzyIas(fl)) / 100 : 0) + gearIas / 100;
    const move = fl ? (p.frenzy.stacks * frenzyMove(fl)) / 100 : 0;
    const frw = g("frw");
    const m = hands[0];
    const all = g("ares");
    const cap = (v: number) => Math.min(75, v);
    return {
      maxHp, maxMana, hands, dual: hands.length === 2,
      def: Math.round((armor + s.dex / 4) * (1 + defPct / 100)),
      speed: BASE_RUN * (1 + incSpeed(this.skillLevel("increased_speed")) / 100 + move + frw / 100),
      ias,
      dmgMin: m.min, dmgMax: m.max, dmgPct: m.dmgPct, ar: m.ar, crit: m.crit, swing: m.speed / (1 + ias), weaponKind: m.kind,
      res: { fire: cap(g("fres") + all), cold: cap(g("cres") + all), light: cap(g("lres") + all), poison: cap(g("pres") + all) },
      ll: g("ll"), ml: g("ml"), frw, gearIas, gf: g("gf"), mf: g("mf"), stats: s,
    };
  }

  /** What derived stats would be with an item put in a slot (for tooltips). */
  previewEquip(it: Item, slot: EquipSlot): Derived {
    const p = this.player;
    const saved = { ...p.equip };
    p.equip[slot] = it;
    if (slot === "main" && isTwoHanded(it)) delete p.equip.off;
    const d = this.derived();
    p.equip = saved;
    return d;
  }

  meetsReq(it: Item): boolean {
    const r = itemReqs(it);
    const s = this.stats();
    return s.str >= r.str && s.dex >= r.dex && this.player.level >= r.lvl;
  }


  // ------------------------------------------------------------------ main update
  update(dt: number, input: FrameInput) {
    this.time += dt;
    const p = this.player;
    const d = this.derived();

    // world-space move direction from screen-space joystick
    if (input.mag > 0) {
      const a = input.mx / 32;
      const b = input.my / 16;
      let wx = (a + b) / 2;
      let wy = (b - a) / 2;
      const l = Math.hypot(wx, wy) || 1;
      wx /= l;
      wy /= l;
      this.moveDir = { x: wx, y: wy, active: true };
    } else this.moveDir.active = false;

    if (this.recall && !p.dead) {
      // channeling Return to Town: moving cancels it, monster hits don't
      if (input.mag > 0.35) {
        this.recall = null;
        this.events.toast("Return to Town cancelled");
      } else {
        this.recall.t += dt;
        if (this.recall.t >= this.recall.dur) {
          this.recall = null;
          this.finishRecall();
          return;
        }
        input = { ...input, mx: 0, my: 0, mag: 0, attack: false, skills: input.skills.map(() => false) };
      }
    } else if (p.dead) this.recall = null;
    if (!p.dead) this.updatePlayer(dt, input, d);
    this.updateMonsters(dt, d);
    this.updateFx(dt);
    this.exploreT -= dt;
    if (this.exploreT <= 0) {
      this.exploreT = 0.2;
      this.exploreAround(false);
    }
  }

  private updatePlayer(dt: number, input: FrameInput, d: Derived) {
    const p = this.player;
    // regen + potions
    p.mana = Math.min(d.maxMana, p.mana + (d.maxMana / 22) * dt);
    p.hp = Math.min(d.maxHp, p.hp + (d.maxHp / 160) * dt);
    if (p.healLeft > 0) {
      const amt = Math.min(p.healLeft, d.maxHp * 0.9 * dt);
      p.healLeft -= amt;
      p.hp = Math.min(d.maxHp, p.hp + amt);
    }
    if (p.manaLeft > 0) {
      const amt = Math.min(p.manaLeft, d.maxMana * 1.2 * dt);
      p.manaLeft -= amt;
      p.mana = Math.min(d.maxMana, p.mana + amt);
    }
    if (p.buffs.shout > 0) p.buffs.shout = Math.max(0, p.buffs.shout - dt);
    if (p.buffs.bo > 0) {
      p.buffs.bo = Math.max(0, p.buffs.bo - dt);
      if (p.buffs.bo === 0) {
        const nd = this.derived();
        p.hp = Math.min(p.hp, nd.maxHp);
        p.mana = Math.min(p.mana, nd.maxMana);
      }
    }
    p.flash = Math.max(0, p.flash - dt * 4);
    if (p.frenzy.t > 0) p.frenzy.t = Math.max(0, p.frenzy.t - dt);
    else if (p.frenzy.stacks > 0) {
      p.frenzy.decay += dt;
      if (p.frenzy.decay >= 0.5) {
        p.frenzy.decay = 0;
        p.frenzy.stacks--;
      }
    }

    // start actions
    this.skillCd = Math.max(0, this.skillCd - dt);
    if (!p.action && this.skillCd <= 0) {
      for (let i = 0; i < input.skills.length; i++) {
        const id = p.slots[i];
        if (input.skills[i] && id) {
          if (this.castSkill(id, d)) break;
          this.skillCd = 0.5;
        }
      }
    }
    if (!p.action && input.attack) this.startSwing(null, d);

    // run current action
    p.moving = false;
    if (p.action) {
      this.runAction(dt, d);
      return;
    }

    // movement
    if (this.moveDir.active) {
      p.moveTarget = null;
      const spd = d.speed * (0.45 + 0.55 * Math.min(1, input.mag));
      this.moveEntity(p, this.moveDir.x * spd * dt, this.moveDir.y * spd * dt, p.r);
      p.fx = this.moveDir.x;
      p.fy = this.moveDir.y;
      p.moving = true;
      p.walkPhase += dt * spd * 3.2;
    } else if (p.moveTarget) {
      const g = p.moveTarget;
      if (!this.ground.includes(g)) p.moveTarget = null;
      else {
        const dx = g.x - p.x;
        const dy = g.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.8) {
          this.pickUp(g);
          p.moveTarget = null;
        } else {
          const ox = p.x;
          const oy = p.y;
          this.moveEntity(p, (dx / dist) * d.speed * dt, (dy / dist) * d.speed * dt, p.r);
          p.fx = dx / dist;
          p.fy = dy / dist;
          p.moving = true;
          p.walkPhase += dt * d.speed * 3.2;
          if (Math.hypot(p.x - ox, p.y - oy) < 0.002) p.moveTarget = null; // stuck on a wall
        }
      }
    }

    // auto-pickup gold, and potions while the belt has room
    for (const g of this.ground) {
      if (g.t < 0.35) continue;
      if (g.item) {
        const pk = BASE_BY_ID[g.item.baseId].potion;
        if (!pk || (pk === "hp" ? p.hpPots : p.mpPots) >= this.beltCap()) continue;
      }
      if (Math.hypot(g.x - p.x, g.y - p.y) < 0.75) {
        this.pickUp(g);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ skills & attacks
  /** Skill level including +skill gear (gear only boosts skills you've learned). */
  skillLevel(id: string) {
    const hard = this.player.skills[id] ?? 0;
    if (!hard) return 0;
    let bonus = 0;
    for (const it of Object.values(this.player.equip)) for (const m of it?.mods ?? []) if (m.s === "skill" && m.sk === id) bonus += m.v;
    return hard + bonus;
  }

  /** Points spent in a skill (no gear). */
  hardLevel(id: string) {
    return this.player.skills[id] ?? 0;
  }

  canLearn(id: string): { ok: boolean; why?: string } {
    const s = SKILL_BY_ID[id];
    const p = this.player;
    if (!s) return { ok: false, why: "Unknown skill" };
    const lvl = this.hardLevel(id);
    if (!s.implemented) return { ok: false, why: "Coming soon" };
    if (lvl >= MAX_SKILL_LVL) return { ok: false, why: "Maxed" };
    if (p.level < s.reqLvl) return { ok: false, why: `Requires level ${s.reqLvl}` };
    const missing = s.prereq.filter((q) => !this.skillLevel(q));
    if (missing.length) return { ok: false, why: `Requires ${missing.map((m) => SKILL_BY_ID[m].name).join(" and ")}` };
    if (p.skillPoints <= 0) return { ok: false, why: "No skill points" };
    return { ok: true };
  }

  learn(id: string): boolean {
    if (!this.canLearn(id).ok) return false;
    const p = this.player;
    p.skillPoints--;
    const first = !p.skills[id];
    p.skills[id] = (p.skills[id] ?? 0) + 1;
    // auto-assign a newly learned active skill to the first empty slot
    if (first && SKILL_BY_ID[id].kind === "active" && !p.slots.includes(id)) {
      const empty = p.slots.indexOf(null);
      if (empty >= 0) p.slots[empty] = id;
    }
    this.events.sound("learn");
    this.events.changed();
    return true;
  }

  assignSlot(slot: number, id: string | null) {
    const p = this.player;
    if (id) {
      const prev = p.slots.indexOf(id);
      if (prev >= 0) p.slots[prev] = null;
    }
    p.slots[slot] = id;
    this.events.changed();
  }

  private nearestMonster(maxDist: number, requireLos = true): Monster | null {
    const p = this.player;
    let best: Monster | null = null;
    let bd = maxDist;
    for (const m of this.monsters) {
      if (m.state === "dead") continue;
      const dd = Math.hypot(m.x - p.x, m.y - p.y) - m.def.radius;
      if (dd < bd && (!requireLos || lineOfSight(this.level, p.x, p.y, m.x, m.y))) {
        bd = dd;
        best = m;
      }
    }
    return best;
  }

  private startSwing(skill: string | null, d: Derived) {
    const p = this.player;
    const target = this.nearestMonster(2.4);
    if (target) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const l = Math.hypot(dx, dy) || 1;
      p.fx = dx / l;
      p.fy = dy / l;
    } else if (this.moveDir.active) {
      p.fx = this.moveDir.x;
      p.fy = this.moveDir.y;
    }
    let hands: number[];
    let dur: number;
    if (skill && TWO_HIT.has(skill)) {
      // one hit with each weapon when dual wielding, otherwise two with the main hand
      hands = d.dual ? [0, 1] : [0, 0];
      dur = ((d.hands[hands[0]].speed + d.hands[hands[1]].speed) / 2) * (skill === "frenzy" ? 0.9 : 1.05);
    } else {
      const h = d.dual ? p.nextHand % 2 : 0;
      hands = [h];
      dur = d.hands[h].speed;
      if (d.dual) p.nextHand = 1 - h;
    }
    dur /= 1 + d.ias;
    p.action = { type: "swing", skill, t: 0, dur, hitAt: hands.length === 2 ? [0.32, 0.72] : [0.5], hands, hitsDone: 0, target };
    p.moveTarget = null;
    this.events.sound("swing");
  }

  castSkill(id: string, d: Derived): boolean {
    const p = this.player;
    const s = SKILL_BY_ID[id];
    const lvl = this.skillLevel(id);
    if (!s || !lvl || !s.implemented || s.kind !== "active") return false;
    const cost = s.mana ? s.mana(lvl) : 0;
    if (p.mana < cost) {
      this.floatAt(p.x, p.y, "Not enough mana", "#6aa6ff", 13);
      this.events.sound("nomana");
      // fall back to a normal attack for melee skills so holding the button still swings
      if (MELEE_SKILLS.has(id)) {
        this.startSwing(null, d);
        return true;
      }
      return false;
    }
    if (MELEE_SKILLS.has(id)) {
      p.mana -= cost;
      this.startSwing(id, d);
      return true;
    }
    switch (id) {
      case "leap":
      case "leap_attack": {
        let tx: number;
        let ty: number;
        let target: Monster | null = null;
        if (id === "leap_attack") {
          target = this.nearestMonster(7);
          if (!target) {
            this.floatAt(p.x, p.y, "No target", "#ccc", 13);
            return false;
          }
          const dx = target.x - p.x;
          const dy = target.y - p.y;
          const l = Math.hypot(dx, dy) || 1;
          const stop = target.def.radius + p.r + 0.2;
          tx = target.x - (dx / l) * stop;
          ty = target.y - (dy / l) * stop;
          p.fx = dx / l;
          p.fy = dy / l;
        } else {
          const dir = this.moveDir.active ? this.moveDir : { x: p.fx, y: p.fy };
          const range = leapRange(lvl);
          tx = p.x;
          ty = p.y;
          for (let t = 0; t <= range; t += 0.1) {
            const nx = p.x + dir.x * t;
            const ny = p.y + dir.y * t;
            if (this.blocked(nx, ny, p.r)) break;
            tx = nx;
            ty = ny;
          }
          p.fx = dir.x;
          p.fy = dir.y;
        }
        p.mana -= cost;
        p.action = { type: "leap", skill: id, t: 0, dur: 0.55, fx: p.x, fy: p.y, tx, ty, target };
        p.moveTarget = null;
        this.events.sound("leap");
        return true;
      }
      case "howl": {
        p.mana -= cost;
        let n = 0;
        for (const m of this.monsters) {
          if (m.state === "dead") continue;
          if (Math.hypot(m.x - p.x, m.y - p.y) < 7) {
            m.fearT = m.def.kind === "boss" ? howlDur(lvl) / 2 : howlDur(lvl);
            m.state = "chase";
            n++;
          }
        }
        this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.6, radius: 7, color: "rgba(230,200,120," });
        p.action = { type: "cry", t: 0, dur: 0.4 };
        this.events.sound("howl");
        if (!n) this.floatAt(p.x, p.y, "Howl", "#e8d9a0", 13);
        return true;
      }
      case "shout": {
        p.mana -= cost;
        p.buffs.shout = shoutDur(lvl);
        this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.6, radius: 4, color: "rgba(150,190,255," });
        p.action = { type: "cry", t: 0, dur: 0.4 };
        this.floatAt(p.x, p.y, `Defense +${shoutDef(lvl)}%`, "#9cc0ff", 14);
        this.events.sound("shout");
        this.events.changed();
        return true;
      }
      case "battle_orders": {
        p.mana -= cost;
        const before = this.derived();
        p.buffs.bo = boDur(lvl);
        const after = this.derived();
        p.hp *= after.maxHp / before.maxHp;
        p.mana *= after.maxMana / before.maxMana;
        this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.6, radius: 4, color: "rgba(255,210,120," });
        p.action = { type: "cry", t: 0, dur: 0.4 };
        this.events.sound("shout");
        this.events.changed();
        return true;
      }
      case "find_potion": {
        let best: Monster | null = null;
        let bd = 2.6;
        for (const m of this.monsters) {
          if (m.state !== "dead" || m.searched) continue;
          const dd = Math.hypot(m.x - p.x, m.y - p.y);
          if (dd < bd) {
            bd = dd;
            best = m;
          }
        }
        if (!best) {
          this.floatAt(p.x, p.y, "No corpse nearby", "#ccc", 13);
          return false;
        }
        best.searched = true;
        p.action = { type: "cry", t: 0, dur: 0.35 };
        if (chance(findPotionChance(lvl) / 100)) {
          this.dropAt(best.x, best.y, { item: makeItem(chance(0.7) ? "hp_potion" : "mp_potion") });
          this.events.sound("drop");
        } else {
          this.floatAt(best.x, best.y, "Nothing", "#aaa", 13);
        }
        return true;
      }
    }
    return false;
  }

  private runAction(dt: number, d: Derived) {
    const p = this.player;
    const a = p.action!;
    a.t += dt;
    if (a.type === "swing") {
      while (a.hitsDone < a.hitAt.length && a.t >= a.hitAt[a.hitsDone] * a.dur) {
        const hand = a.hands[a.hitsDone] ?? 0;
        a.hitsDone++;
        this.resolveMelee(a.skill, a.target, d, hand);
      }
      if (a.t >= a.dur) p.action = null;
    } else if (a.type === "leap") {
      const k = Math.min(1, a.t / a.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      p.x = a.fx + (a.tx - a.fx) * e;
      p.y = a.fy + (a.ty - a.fy) * e;
      p.z = Math.sin(k * Math.PI) * 1.4;
      if (k >= 1) {
        p.z = 0;
        p.action = null;
        this.events.shake(6);
        this.events.sound("land");
        this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.4, radius: 1.8, color: "rgba(200,170,120," });
        for (let i = 0; i < 14; i++) this.spark(p.x, p.y, "#8a7a62", 2.5);
        const lvl = this.skillLevel(a.skill);
        if (a.skill === "leap_attack" && a.target && a.target.state !== "dead") {
          this.playerHit(a.target, d.hands[0], { dmgPct: leapAttackDmg(lvl), arPct: 100, knock: 5 });
        }
        for (const m of this.monsters) {
          if (m.state === "dead" || m === a.target) continue;
          const dx = m.x - p.x;
          const dy = m.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 1.8) {
            m.kx = (dx / (dist || 1)) * 7;
            m.ky = (dy / (dist || 1)) * 7;
            m.stunT = Math.max(m.stunT, 0.4);
            if (m.state === "idle") m.state = "chase";
          }
        }
      }
    } else if (a.type === "cry") {
      if (a.t >= a.dur) p.action = null;
    }
  }

  private resolveMelee(skill: string | null, preferred: Monster | null, d: Derived, hand = 0) {
    const p = this.player;
    const reach = 0.95;
    let target: Monster | null = null;
    const inReach = (m: Monster) => {
      if (m.state === "dead") return false;
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > reach + m.def.radius + p.r) return false;
      // within ~75 degrees of facing
      return (dx * p.fx + dy * p.fy) / (dist || 1) > 0.25 || dist < m.def.radius + p.r + 0.1;
    };
    if (preferred && inReach(preferred)) target = preferred;
    else {
      let bd = Infinity;
      for (const m of this.monsters) {
        if (!inReach(m)) continue;
        const dist = Math.hypot(m.x - p.x, m.y - p.y);
        if (dist < bd) {
          bd = dist;
          target = m;
        }
      }
    }
    this.hitLog.push({ hand, skill, t: this.time });
    if (this.hitLog.length > 40) this.hitLog.shift();
    if (!target) return;
    const lvl = skill ? this.skillLevel(skill) : 0;
    const h = d.hands[hand] ?? d.hands[0];
    if (skill === "bash") this.playerHit(target, h, { dmgPct: bashDmg(lvl), arPct: bashAR(lvl), knock: 6 });
    else if (skill === "stun") this.playerHit(target, h, { arPct: stunAR(lvl), stun: stunDur(lvl), knock: 1.5 });
    else if (skill === "double_swing") this.playerHit(target, h, { arPct: doubleSwingAR(lvl), knock: 1.5 });
    else if (skill === "frenzy") {
      if (this.playerHit(target, h, { dmgPct: frenzyDmg(lvl), arPct: frenzyAR(lvl), knock: 1 })) {
        const p = this.player;
        p.frenzy.stacks = Math.min(FRENZY_MAX_STACKS, p.frenzy.stacks + 1);
        p.frenzy.t = FRENZY_HOLD;
        p.frenzy.decay = 0;
      }
    } else this.playerHit(target, h, { knock: 1.8 });
  }

  private playerHit(m: Monster, d: Hand, o: { dmgPct?: number; arPct?: number; knock?: number; stun?: number }): boolean {
    const p = this.player;
    const ar = d.ar * (1 + (o.arPct ?? 0) / 100);
    const hitChance = Math.max(0.05, Math.min(0.95, 2 * (ar / (ar + m.defense)) * (p.level / (p.level + m.mlvl))));
    if (m.state === "idle") this.aggroPack(m);
    if (!chance(hitChance)) {
      this.floatAt(m.x, m.y, "Miss", "#b8b8b8", 13);
      this.events.sound("miss");
      return false;
    }
    let dmg = randInt(d.min, d.max) * (1 + (d.dmgPct + (o.dmgPct ?? 0)) / 100);
    const crit = d.crit > 0 && chance(d.crit / 100);
    if (crit) dmg *= 2;
    dmg = Math.max(1, Math.round(dmg));
    m.hp -= dmg;
    m.flash = 1;
    m.lastHurt = this.time;
    // life / mana leech from gear
    const dv = this.derived();
    if (dv.ll > 0) p.hp = Math.min(dv.maxHp, p.hp + (dmg * dv.ll) / 100);
    if (dv.ml > 0) p.mana = Math.min(dv.maxMana, p.mana + (dmg * dv.ml) / 100);
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    const knock = (o.knock ?? 0) * (m.def.kind === "boss" ? 0.3 : 1);
    m.kx += (dx / l) * knock;
    m.ky += (dy / l) * knock;
    if (o.stun) m.stunT = Math.max(m.stunT, m.def.kind === "boss" ? o.stun / 2 : o.stun);
    if (m.state === "attack" && (o.stun || knock > 3)) {
      m.state = "chase";
      m.atkT = Math.max(m.atkT, 0.4);
    }
    this.floatAt(m.x, m.y, crit ? `${dmg}!` : `${dmg}`, crit ? "#ffd84a" : "#fff", crit ? 20 : 15);
    for (let i = 0; i < (crit ? 12 : 7); i++) this.spark(m.x, m.y, m.def.kind === "fallen" ? "#b0201a" : "#6e8a2a", 3);
    this.events.sound(crit ? "crit" : "hit");
    if (crit || o.stun) this.events.shake(crit ? 4 : 2);
    if (m.hp <= 0) this.kill(m);
    return true;
  }

  private aggroPack(m: Monster) {
    for (const o of this.monsters) if (o.pack === m.pack && o.state === "idle") o.state = "chase";
  }

  private kill(m: Monster) {
    m.hp = 0;
    m.state = "dead";
    m.deadT = 0;
    m.kx *= 0.5;
    m.ky *= 0.5;
    const p = this.player;
    p.kills++;
    this.events.sound(m.def.kind === "fallen" ? "die_fallen" : "die_zombie");
    for (let i = 0; i < 16; i++) this.spark(m.x, m.y, m.def.kind === "fallen" ? "#a01a14" : "#56702a", 4);
    this.gainXp(m.xp);
    // loot
    if (m.def.kind === "boss") {
      this.events.shake(10);
      const mf = this.derived().mf;
      for (let i = 0; i < 3; i++) this.dropAt(m.x, m.y, { item: rollDrop(m.mlvl, mf, true) });
      this.dropAt(m.x, m.y, { gold: this.goldAmount(randInt(40, 90) * m.mlvl) });
      this.dropAt(m.x, m.y, { item: makeItem("hp_potion") });
      this.dropAt(m.x, m.y, { item: makeItem("mp_potion") });
      this.stairs = { x: this.level.bossRoom.cx + 0.5, y: this.level.bossRoom.cy + 2.5 };
      if (!isFloor(this.level, Math.floor(this.stairs.x), Math.floor(this.stairs.y))) this.stairs = { x: m.x, y: m.y };
      this.events.toast(`${m.def.name} is slain! Stairs down have opened.`);
      this.events.sound("boss");
    } else {
      const r = Math.random();
      if (r < 0.17) this.dropAt(m.x, m.y, { item: rollDrop(m.mlvl, this.derived().mf, false) });
      else if (r < 0.37) this.dropAt(m.x, m.y, { gold: this.goldAmount(randInt(3, 12) * m.mlvl) });
      else if (r < 0.5) this.dropAt(m.x, m.y, { item: makeItem(chance(0.7) ? "hp_potion" : "mp_potion") });
    }
  }

  /** Gold find from gear. */
  private goldAmount(n: number) {
    return Math.max(1, Math.round(n * (1 + this.derived().gf / 100)));
  }

  gainXp(n: number) {
    const p = this.player;
    p.xp += n;
    this.floatAt(p.x, p.y, `+${n} xp`, "#c9b37a", 12);
    let leveled = false;
    while (p.xp >= xpForLevel(p.level + 1) && p.level < 99) {
      p.level++;
      p.statPoints += 5;
      p.skillPoints += 1;
      leveled = true;
    }
    if (leveled) {
      const d = this.derived();
      p.hp = d.maxHp;
      p.mana = d.maxMana;
      this.rings.push({ x: p.x, y: p.y, t: 0, life: 1, radius: 2.5, color: "rgba(255,220,120," });
      this.events.levelUp(p.level);
      this.events.sound("levelup");
    }
    this.events.changed();
  }

  // ------------------------------------------------------------------ monsters
  private updateMonsters(dt: number, d: Derived) {
    const p = this.player;
    const ptx = Math.floor(p.x);
    const pty = Math.floor(p.y);
    const pi = idx(ptx, pty);
    if (pi !== this.flowFrom) {
      bfs(this.level, ptx, pty, this.flow);
      this.flowFrom = pi;
    }
    for (const m of this.monsters) {
      m.flash = Math.max(0, m.flash - dt * 5);
      if (m.state === "dead") {
        m.deadT += dt;
        if (Math.abs(m.kx) + Math.abs(m.ky) > 0.05) {
          this.moveEntity(m, m.kx * dt, m.ky * dt, m.def.radius * 0.6);
          m.kx *= Math.exp(-8 * dt);
          m.ky *= Math.exp(-8 * dt);
        }
        continue;
      }
      // knockback
      if (Math.abs(m.kx) + Math.abs(m.ky) > 0.05) {
        this.moveEntity(m, m.kx * dt, m.ky * dt, m.def.radius);
        m.kx *= Math.exp(-9 * dt);
        m.ky *= Math.exp(-9 * dt);
      }
      m.atkT = Math.max(0, m.atkT - dt);
      if (m.stunT > 0) {
        m.stunT -= dt;
        if (m.state === "attack") m.state = "chase";
        continue;
      }
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      const dist = Math.hypot(dx, dy);
      if (p.dead) {
        if (m.state !== "idle") m.state = "idle";
      }
      if (m.fearT > 0) {
        m.fearT -= dt;
        if (dist > 0.01) {
          this.moveEntity(m, (-dx / dist) * m.def.speed * 1.1 * dt, (-dy / dist) * m.def.speed * 1.1 * dt, m.def.radius);
          m.fx = -dx / dist;
          m.fy = -dy / dist;
          m.walkPhase += dt * m.def.speed * 4;
        }
        if (m.state === "attack") m.state = "chase";
        continue;
      }
      if (m.state === "idle") {
        if (!p.dead && dist < m.def.aggro && lineOfSight(this.level, m.x, m.y, p.x, p.y)) {
          this.aggroPack(m);
          if (m.def.kind === "boss") this.events.sound("boss_aggro");
        } else {
          // wander near home
          m.wanderT -= dt;
          if (m.wanderT <= 0) {
            m.wanderT = rand(2, 5);
            const nx = m.homeX + rand(-1.5, 1.5);
            const ny = m.homeY + rand(-1.5, 1.5);
            if (isFloor(this.level, Math.floor(nx), Math.floor(ny))) {
              m.wx = nx;
              m.wy = ny;
            }
          }
          const wdx = m.wx - m.x;
          const wdy = m.wy - m.y;
          const wd = Math.hypot(wdx, wdy);
          if (wd > 0.15) {
            const s = m.def.speed * 0.4;
            this.moveEntity(m, (wdx / wd) * s * dt, (wdy / wd) * s * dt, m.def.radius);
            m.fx = wdx / wd;
            m.fy = wdy / wd;
            m.walkPhase += dt * s * 4;
          }
          continue;
        }
      }
      if (dist > 20) {
        m.state = "idle";
        m.wx = m.homeX;
        m.wy = m.homeY;
        continue;
      }
      const reach = m.def.reach + m.def.radius + p.r;
      if (m.state === "attack") {
        m.windT -= dt;
        if (dist > 0.01) {
          m.fx = dx / dist;
          m.fy = dy / dist;
        }
        if (m.windT <= 0) {
          m.state = "chase";
          m.atkT = m.def.atkInterval;
          if (dist <= reach + 0.35 && !p.dead) this.monsterHit(m, d);
        }
        continue;
      }
      // chase
      if (dist <= reach) {
        if (m.atkT <= 0) {
          m.state = "attack";
          m.windT = m.def.windup;
        }
        if (dist > 0.01) {
          m.fx = dx / dist;
          m.fy = dy / dist;
        }
        continue;
      }
      let mx = 0;
      let my = 0;
      if (dist < 4 && lineOfSight(this.level, m.x, m.y, p.x, p.y)) {
        mx = dx / dist;
        my = dy / dist;
      } else {
        const tx = Math.floor(m.x);
        const ty = Math.floor(m.y);
        let best = this.flow[idx(tx, ty)];
        let bx = 0;
        let by = 0;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const nx = tx + ox;
            const ny = ty + oy;
            if (!isFloor(this.level, nx, ny)) continue;
            if (ox && oy && (!isFloor(this.level, tx + ox, ty) || !isFloor(this.level, tx, ty + oy))) continue;
            const v = this.flow[idx(nx, ny)];
            if (v < best) {
              best = v;
              bx = ox;
              by = oy;
            }
          }
        if (bx || by) {
          const gx = tx + bx + 0.5 - m.x;
          const gy = ty + by + 0.5 - m.y;
          const gl = Math.hypot(gx, gy) || 1;
          mx = gx / gl;
          my = gy / gl;
        } else {
          mx = dx / dist;
          my = dy / dist;
        }
      }
      // separation from other monsters
      for (const o of this.monsters) {
        if (o === m || o.state === "dead") continue;
        const sx = m.x - o.x;
        const sy = m.y - o.y;
        const sd = Math.hypot(sx, sy);
        const min = m.def.radius + o.def.radius + 0.05;
        if (sd < min && sd > 0.001) {
          mx += (sx / sd) * (min - sd) * 3;
          my += (sy / sd) * (min - sd) * 3;
        }
      }
      const ml = Math.hypot(mx, my) || 1;
      const sp = m.def.speed;
      this.moveEntity(m, (mx / ml) * sp * dt, (my / ml) * sp * dt, m.def.radius);
      m.fx = mx / ml;
      m.fy = my / ml;
      m.walkPhase += dt * sp * 4;
    }
  }

  private monsterHit(m: Monster, d: Derived) {
    const p = this.player;
    if (p.action?.type === "leap") return;
    const hc = Math.max(0.05, Math.min(0.95, 2 * (m.ar / (m.ar + d.def)) * (m.mlvl / (m.mlvl + p.level))));
    if (!chance(hc)) {
      this.floatAt(p.x, p.y, "Miss", "#9a9a9a", 12);
      this.events.sound("whiff");
      return;
    }
    const dmg = randInt(m.dmgMin, m.dmgMax);
    p.hp -= dmg;
    p.flash = 1;
    this.floatAt(p.x, p.y, `-${dmg}`, "#ff5a4a", 15);
    for (let i = 0; i < 6; i++) this.spark(p.x, p.y, "#9a1410", 2.5);
    this.events.sound("hurt");
    this.events.shake(m.def.kind === "boss" ? 6 : 3);
    if (p.hp <= 0) this.die();
  }

  private die() {
    const p = this.player;
    p.hp = 0;
    p.dead = true;
    p.action = null;
    p.moveTarget = null;
    this.events.sound("death");
    this.events.died();
  }

  /** After death you wake up in town, like Diablo II, minus 10% of your gold. */
  respawn() {
    const p = this.player;
    const lost = Math.floor(p.gold * 0.1);
    p.gold -= lost;
    p.healLeft = 0;
    p.manaLeft = 0;
    this.goTown(true);
    this.events.toast(lost ? `You wake up in camp. You lost ${lost} gold.` : "You wake up in camp.");
    this.events.changed();
  }

  // ------------------------------------------------------------------ items
  dropAt(x: number, y: number, g: Omit<GroundItem, "id" | "x" | "y" | "t">) {
    let gx = x;
    let gy = y;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(0.3, 0.9);
      const nx = x + Math.cos(a) * r;
      const ny = y + Math.sin(a) * r;
      if (!this.blocked(nx, ny, 0.15)) {
        gx = nx;
        gy = ny;
        break;
      }
    }
    this.ground.push({ id: this.nextId++, x: gx, y: gy, t: 0, ...g });
    if (g.item) this.events.sound("drop");
  }

  /** Tap on a ground item: pick up if close, otherwise walk to it. */
  tapGround(g: GroundItem) {
    const p = this.player;
    if (p.dead) return;
    if (Math.hypot(g.x - p.x, g.y - p.y) < 1.6) this.pickUp(g);
    else p.moveTarget = g;
  }

  beltCap(): number {
    const b = this.player.equip.belt;
    return BASE_POTS + (b ? beltSlotsOf(b) : 0);
  }

  pickUp(g: GroundItem): boolean {
    const p = this.player;
    if (g.gold) {
      p.gold += g.gold;
      this.floatAt(g.x, g.y, `+${g.gold} gold`, "#e8c547", 13);
      this.events.sound("gold");
    } else if (g.item) {
      const b = BASE_BY_ID[g.item.baseId];
      if (b.potion === "hp" && p.hpPots < this.beltCap()) p.hpPots++;
      else if (b.potion === "mp" && p.mpPots < this.beltCap()) p.mpPots++;
      else if (!addItem(p.bag, g.item)) {
        this.events.toast("Not enough room in your bag");
        this.events.sound("nomana");
        return false;
      }
      this.floatAt(g.x, g.y, itemName(g.item), QUALITY_COLOR[qualityOf(g.item)], 13);
      this.events.sound("pickup");
    }
    this.ground.splice(this.ground.indexOf(g), 1);
    this.events.changed();
    return true;
  }

  bagEntry(uid: number) {
    return this.player.bag.find((e) => e.item.uid === uid) ?? null;
  }

  /** Slots an item could go in. */
  slotsFor(it: Item): EquipSlot[] {
    const b = BASE_BY_ID[it.baseId];
    switch (b.slot) {
      case "weapon":
        return b.hands === 2 ? ["main"] : ["main", "off"];
      case "shield":
        return ["off"];
      case "armor":
        return ["chest"];
      case "helm":
        return ["head"];
      case "ring":
        return ["ring1", "ring2"];
      case "potion":
        return [];
      default:
        return [b.slot as EquipSlot];
    }
  }

  /** Why an item can't go in a slot, or null if it can. */
  equipError(it: Item, slot: EquipSlot): string | null {
    if (!this.slotsFor(it).includes(slot)) return "That doesn't go there";
    if (!this.meetsReq(it)) return "You don't meet the requirements";
    if (slot === "off" && isTwoHanded(this.player.equip.main)) return "Your two-handed weapon needs both hands";
    return null;
  }

  defaultSlot(it: Item): EquipSlot | null {
    const e = this.player.equip;
    const b = BASE_BY_ID[it.baseId];
    const opts = this.slotsFor(it);
    if (!opts.length) return null;
    if (b.slot === "weapon" && b.hands === 1) {
      if (!e.main) return "main";
      if (!e.off && !isTwoHanded(e.main)) return "off";
      return "main";
    }
    if (b.slot === "ring") return !e.ring1 ? "ring1" : !e.ring2 ? "ring2" : "ring1";
    return opts[0];
  }

  /** Equip an item from the bag. Whatever it replaces goes back into the bag. */
  equipFromBag(uid: number, slot?: EquipSlot): string | null {
    const p = this.player;
    const entry = this.bagEntry(uid);
    if (!entry) return "Item not found";
    const it = entry.item;
    const target = slot ?? this.defaultSlot(it);
    if (!target) return "You can't equip that";
    const err = this.equipError(it, target);
    if (err) return err;
    const displaced: Item[] = [];
    if (p.equip[target]) displaced.push(p.equip[target]!);
    if (target === "main" && isTwoHanded(it) && p.equip.off) displaced.push(p.equip.off);
    const bag = p.bag.filter((e) => e !== entry);
    const placed: BagEntry[] = [];
    for (const d of displaced) {
      const s = sizeOf(d);
      const spot = fits([...bag, ...placed], s.w, s.h, entry.x, entry.y) ? { x: entry.x, y: entry.y } : findSpot([...bag, ...placed], s.w, s.h);
      if (!spot) return "Not enough room in your bag";
      placed.push({ item: d, ...spot });
    }
    p.bag = [...bag, ...placed];
    p.equip[target] = it;
    if (target === "main" && isTwoHanded(it)) delete p.equip.off;
    p.nextHand = 0;
    this.events.sound("equip");
    this.clampVitals();
    this.events.changed();
    return null;
  }

  /** Move an equipped item to another slot (e.g. main hand to off-hand), swapping if both fit. */
  swapEquip(a: EquipSlot, b: EquipSlot): string | null {
    const p = this.player;
    const ia = p.equip[a];
    const ib = p.equip[b];
    if (!ia || a === b) return null;
    if (!this.slotsFor(ia).includes(b)) return "That doesn't go there";
    if (ib && !this.slotsFor(ib).includes(a)) return "Those can't swap";
    if ((b === "off" && isTwoHanded(ia)) || (a === "off" && isTwoHanded(ib))) return "Two-handed weapons go in the main hand";
    if (ib) p.equip[a] = ib;
    else delete p.equip[a];
    p.equip[b] = ia;
    p.nextHand = 0;
    this.events.sound("equip");
    this.events.changed();
    return null;
  }

  /** Start the Return to Town channel (always available in the crypt). */
  startRecall(): boolean {
    const p = this.player;
    if (this.inTown || p.dead || this.recall) return false;
    p.action = null;
    p.moveTarget = null;
    this.recall = { t: 0, dur: RECALL_TIME };
    this.events.sound("shout");
    this.events.changed();
    return true;
  }

  private finishRecall() {
    const p = this.player;
    const snap: DungeonSnap = { level: this.level, monsters: this.monsters, ground: this.ground, stairs: this.stairs, boss: this.boss, px: p.x, py: p.y };
    const floor = this.floor;
    this.goTown(true);
    const wp = this.level.waypoint;
    // portal stands next to the waypoint
    let px = wp.x + 2.2;
    let py = wp.y + 0.6;
    if (this.blocked(px, py, 0.4)) {
      px = wp.x - 2;
      py = wp.y + 0.8;
    }
    this.portal = { x: px, y: py, floor, snap };
    this.events.sound("stairs");
    this.events.toast(`Back in Ember Camp. The blue portal returns you to Level ${floor}.`);
    this.events.changed();
  }

  nearPortal(): boolean {
    const q = this.portal;
    return !!q && this.inTown && !this.player.dead && Math.hypot(q.x - this.player.x, q.y - this.player.y) < 1.8;
  }

  /** Step through the camp portal: back to the same spot, with the level as you left it. */
  usePortal(): boolean {
    const q = this.portal;
    if (!q || !this.inTown) return false;
    const s = q.snap;
    this.portal = null;
    this.inTown = false;
    this.floor = q.floor;
    this.level = s.level;
    this.monsters = s.monsters;
    this.ground = s.ground;
    this.stairs = s.stairs;
    this.boss = s.boss;
    this.floaters = [];
    this.particles = [];
    this.rings = [];
    this.flowFrom = -1;
    const p = this.player;
    p.x = s.px;
    p.y = s.py;
    p.action = null;
    p.moveTarget = null;
    // monsters that were chasing you lose interest while you were away
    for (const m of this.monsters) if (m.state !== "dead") { m.state = "idle"; }
    this.events.sound("stairs");
    this.events.toast(`Ember Crypt — Level ${this.floor}`);
    this.events.changed();
    return true;
  }

  /** Waypoint travel: 0 = camp, n = crypt level n (if reached before). */
  travel(floor: number) {
    if (floor <= 0) this.goTown();
    else if (floor <= this.maxFloor) this.goDungeon(floor);
  }

  /** Take off an item, optionally to a chosen bag cell. */
  unequip(slot: EquipSlot, x?: number, y?: number): string | null {
    const p = this.player;
    const it = p.equip[slot];
    if (!it) return null;
    const s = sizeOf(it);
    const spot = x !== undefined && y !== undefined && fits(p.bag, s.w, s.h, x, y) ? { x, y: y! } : x === undefined ? findSpot(p.bag, s.w, s.h) : null;
    if (!spot) return x === undefined ? "Not enough room in your bag" : "It doesn't fit there";
    p.bag.push({ item: it, ...spot });
    delete p.equip[slot];
    p.nextHand = 0;
    this.events.sound("equip");
    this.clampVitals();
    this.events.changed();
    return null;
  }

  /** Move an item within the bag (swaps with a single overlapping item). */
  moveInBag(uid: number, x: number, y: number): boolean {
    const ok = moveItem(this.player.bag, uid, x, y);
    if (ok) {
      this.events.sound("equip");
      this.events.changed();
    }
    return ok;
  }

  dropFromBag(uid: number) {
    const p = this.player;
    const e = this.bagEntry(uid);
    if (!e) return;
    p.bag = p.bag.filter((q) => q !== e);
    this.dropAt(p.x, p.y, { item: e.item });
    this.events.changed();
  }

  drinkFromBag(uid: number) {
    const p = this.player;
    const e = this.bagEntry(uid);
    if (!e) return;
    const pk = BASE_BY_ID[e.item.baseId].potion;
    if (!pk) return;
    p.bag = p.bag.filter((q) => q !== e);
    this.drink(pk);
  }

  /** Sell a bag item to the vendor. */
  sell(uid: number): number {
    const p = this.player;
    const e = this.bagEntry(uid);
    if (!e || !this.inTown) return 0;
    const price = sellPrice(e.item);
    p.bag = p.bag.filter((q) => q !== e);
    p.gold += price;
    if (!BASE_BY_ID[e.item.baseId].potion) addItem(this.vendorStock, e.item, VENDOR_W, VENDOR_H);
    this.events.sound("gold");
    this.events.changed();
    return price;
  }

  /** Buy from the vendor. Potions are unlimited and go to the belt first. */
  buy(uid: number): string | null {
    const p = this.player;
    const e = this.vendorStock.find((q) => q.item.uid === uid);
    if (!e) return "Not for sale";
    const b = BASE_BY_ID[e.item.baseId];
    if (p.gold < itemPrice(e.item)) return "Not enough gold";
    if (b.potion) {
      if (b.potion === "hp" && p.hpPots < this.beltCap()) p.hpPots++;
      else if (b.potion === "mp" && p.mpPots < this.beltCap()) p.mpPots++;
      else if (!addItem(p.bag, makeItem(b.id))) return "Not enough room in your bag";
    } else {
      if (!addItem(p.bag, e.item)) return "Not enough room in your bag";
      this.vendorStock = this.vendorStock.filter((q) => q !== e);
    }
    p.gold -= itemPrice(e.item);
    this.events.sound("gold");
    this.events.changed();
    return null;
  }

  /** Belt button: drink from the belt, or from the bag when the belt is empty. */
  usePotion(kind: "hp" | "mp") {
    const p = this.player;
    if (p.dead) return;
    if (kind === "hp" ? p.hpPots > 0 : p.mpPots > 0) {
      if (kind === "hp") p.hpPots--;
      else p.mpPots--;
      this.drink(kind);
      return;
    }
    const e = p.bag.find((q) => BASE_BY_ID[q.item.baseId].potion === kind);
    if (e) return this.drinkFromBag(e.item.uid);
    this.events.toast(kind === "hp" ? "No healing potions" : "No mana potions");
  }

  private drink(kind: "hp" | "mp") {
    const p = this.player;
    const d = this.derived();
    if (kind === "hp") p.healLeft += d.maxHp * 0.45;
    else p.manaLeft += d.maxMana * 0.6;
    this.events.sound("potion");
    this.events.changed();
  }

  addStat(k: keyof Stats) {
    const p = this.player;
    if (p.statPoints <= 0) return;
    p.statPoints--;
    const before = this.derived();
    p.base[k]++;
    const after = this.derived();
    p.hp += Math.max(0, after.maxHp - before.maxHp);
    p.mana += Math.max(0, after.maxMana - before.maxMana);
    this.events.changed();
  }

  private clampVitals() {
    const d = this.derived();
    const p = this.player;
    p.hp = Math.min(p.hp, d.maxHp);
    p.mana = Math.min(p.mana, d.maxMana);
  }

  descend() {
    this.goDungeon(this.floor + 1);
  }

  nearStairs(): boolean {
    if (!this.stairs || this.player.dead) return false;
    return Math.hypot(this.stairs.x - this.player.x, this.stairs.y - this.player.y) < 1.6;
  }

  nearWaypoint(): boolean {
    const w = this.level.waypoint;
    return !this.player.dead && Math.hypot(w.x - this.player.x, w.y - this.player.y) < 1.7;
  }

  nearVendor(): boolean {
    const v = this.level.vendor;
    return !!v && this.inTown && Math.hypot(v.x - this.player.x, v.y - this.player.y) < 2.3;
  }

  /** The one context action shown above the controls. */
  contextAction(): "descend" | "waypoint" | "trade" | "portal" | null {
    if (this.nearStairs()) return "descend";
    if (this.nearVendor()) return "trade";
    if (this.nearPortal()) return "portal";
    if (this.nearWaypoint()) return "waypoint";
    return null;
  }

  // ------------------------------------------------------------------ physics helpers
  blocked(x: number, y: number, r: number): boolean {
    const L = this.level;
    return (
      !isFloor(L, Math.floor(x - r), Math.floor(y - r)) ||
      !isFloor(L, Math.floor(x + r), Math.floor(y - r)) ||
      !isFloor(L, Math.floor(x - r), Math.floor(y + r)) ||
      !isFloor(L, Math.floor(x + r), Math.floor(y + r))
    );
  }

  moveEntity(e: { x: number; y: number }, dx: number, dy: number, r: number) {
    const step = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
    for (let i = 0; i < step; i++) {
      const sx = dx / step;
      const sy = dy / step;
      if (!this.blocked(e.x + sx, e.y, r)) e.x += sx;
      if (!this.blocked(e.x, e.y + sy, r)) e.y += sy;
    }
  }

  private exploreAround(force: boolean) {
    const p = this.player;
    const R = 7;
    const L = this.level;
    for (let y = Math.floor(p.y - R); y <= p.y + R; y++)
      for (let x = Math.floor(p.x - R); x <= p.x + R; x++) {
        if (x < 0 || y < 0 || x >= L.w || y >= L.h) continue;
        if ((x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2 > R * R) continue;
        L.explored[idx(x, y)] = 1;
      }
    if (force) return;
  }

  // ------------------------------------------------------------------ fx
  floatAt(x: number, y: number, text: string, color: string, size: number) {
    this.floaters.push({ x: x + rand(-0.15, 0.15), y, text, color, t: 0, life: 1.0, size });
  }

  private spark(x: number, y: number, color: string, speed: number) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(0.3, 1) * speed;
    this.particles.push({ x, y, z: 0.6, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(1, 4), t: 0, life: rand(0.4, 0.8), color, size: rand(2, 4) });
  }

  private updateFx(dt: number) {
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.life);
    for (const q of this.particles) {
      q.t += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vz -= 14 * dt;
      q.z = Math.max(0, q.z + q.vz * dt);
      if (q.z === 0) {
        q.vx *= 0.8;
        q.vy *= 0.8;
      }
    }
    this.particles = this.particles.filter((q) => q.t < q.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    for (const g of this.ground) g.t += dt;
  }
}
