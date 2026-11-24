import { BASE_BY_ID, type Item, type Kind, type Slot, makeItem, rollBase } from "./data/items";
import {
  MONSTERS, type MonsterDef, type MonsterKind, scaleAR, scaleDef, scaleDmg, scaleHp, scaleXp,
} from "./data/monsters";
import {
  MAX_SKILL_LVL, SKILL_BY_ID, bashAR, bashDmg, boDur, boPct, doubleSwingAR, findPotionChance, howlDur,
  incSpeed, ironSkinDef, leapAttackDmg, leapRange, masteryAR, masteryCrit, masteryDmg, shoutDef, shoutDur,
  stunAR, stunDur,
} from "./data/skills";
import { type Level, bfs, generateLevel, idx, isFloor, lineOfSight } from "./map";
import { Rng, chance, rand, randInt } from "./rng";

export interface Stats {
  str: number;
  dex: number;
  vit: number;
  ene: number;
}

export type Action =
  | { type: "swing"; skill: string | null; t: number; dur: number; hitAt: number[]; hitsDone: number; target: Monster | null }
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
  inventory: (Item | null)[];
  equip: Partial<Record<Slot, Item>>;
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
  potion?: "hp" | "mp";
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

export interface Derived {
  maxHp: number;
  maxMana: number;
  dmgMin: number;
  dmgMax: number;
  dmgPct: number;
  ar: number;
  arPct: number;
  def: number;
  speed: number;
  swing: number;
  crit: number;
  weaponKind: Kind | "fist";
}

export const INV_SIZE = 20;
export const MAX_POTS = 10;
export const BASE_STATS: Stats = { str: 30, dex: 20, vit: 25, ene: 10 };

/** Total XP needed to reach level L+1 from level L. */
export const xpForLevel = (L: number) => (L <= 1 ? 0 : Math.round(100 * Math.pow(L - 1, 1.9)));

export interface SaveData {
  v: 1;
  seed: number;
  floor: number;
  player: Pick<Player, "level" | "xp" | "base" | "statPoints" | "skillPoints" | "skills" | "slots" | "inventory" | "equip" | "gold" | "hpPots" | "mpPots" | "kills">;
}

const MELEE_SKILLS = new Set(["bash", "double_swing", "stun"]);

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
  private flow = new Uint16Array(60 * 60);
  private flowFrom = -1;
  private nextId = 1;
  private exploreT = 0;
  private skillCd = 0;
  events: GameEvents;
  /** world-space joystick direction from last frame (used by Leap) */
  moveDir = { x: 0, y: 0, active: false };

  constructor(events: GameEvents, save?: SaveData | null, seed?: number) {
    this.events = events;
    this.seed = save?.seed ?? seed ?? (Math.random() * 1e9) | 0;
    this.player = {
      x: 0, y: 0, r: 0.28, fx: 1, fy: 1, hp: 1, mana: 1, level: 1, xp: 0,
      base: { ...BASE_STATS }, statPoints: 0, skillPoints: 1, skills: {}, slots: [null, null, null],
      inventory: new Array(INV_SIZE).fill(null), equip: {}, gold: 0, hpPots: 3, mpPots: 1,
      action: null, walkPhase: 0, moving: false, buffs: { shout: 0, bo: 0 }, flash: 0, z: 0,
      moveTarget: null, dead: false, healLeft: 0, manaLeft: 0, kills: 0,
    };
    if (save) {
      Object.assign(this.player, JSON.parse(JSON.stringify(save.player)));
      while (this.player.inventory.length < INV_SIZE) this.player.inventory.push(null);
      this.floor = save.floor;
    } else {
      this.player.equip.weapon = makeItem("hand_axe");
      this.player.equip.armor = makeItem("quilted_armor");
    }
    this.startFloor(this.floor);
    const d = this.derived();
    this.player.hp = d.maxHp;
    this.player.mana = d.maxMana;
  }

  toSave(): SaveData {
    const p = this.player;
    return {
      v: 1, seed: this.seed, floor: this.floor,
      player: {
        level: p.level, xp: p.xp, base: p.base, statPoints: p.statPoints, skillPoints: p.skillPoints,
        skills: p.skills, slots: p.slots, inventory: p.inventory, equip: p.equip, gold: p.gold,
        hpPots: p.hpPots, mpPots: p.mpPots, kills: p.kills,
      },
    };
  }

  // ------------------------------------------------------------------ level setup
  startFloor(floor: number) {
    this.floor = floor;
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
    p.x = this.level.start.cx + 0.5;
    p.y = this.level.start.cy + 0.5;
    p.action = null;
    p.moveTarget = null;
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
  stats(): Stats {
    return this.player.base;
  }

  derived(): Derived {
    const p = this.player;
    const s = p.base;
    const w = p.equip.weapon ? BASE_BY_ID[p.equip.weapon.baseId] : null;
    const kind: Kind | "fist" = w ? w.kind : "fist";
    const mastery = kind === "sword" ? "sword_mastery" : kind === "axe" ? "axe_mastery" : kind === "mace" ? "mace_mastery" : null;
    const ml = mastery ? p.skills[mastery] ?? 0 : 0;
    const dmgPct = s.str + (ml ? masteryDmg(ml) : 0);
    const arPct = ml ? masteryAR(ml) : 0;
    let armor = 0;
    for (const it of Object.values(p.equip)) if (it?.def) armor += it.def;
    let defPct = 0;
    if (p.skills.iron_skin) defPct += ironSkinDef(p.skills.iron_skin);
    if (p.buffs.shout > 0) defPct += shoutDef(p.skills.shout ?? 1);
    const boMul = p.buffs.bo > 0 ? 1 + boPct(p.skills.battle_orders ?? 1) / 100 : 1;
    const maxHp = Math.round((55 + (s.vit - 25) * 4 + (p.level - 1) * 2) * boMul);
    const maxMana = Math.round((10 + (s.ene - 10) * 1.5 + (p.level - 1) * 1.5) * boMul);
    return {
      maxHp, maxMana,
      dmgMin: w ? w.min! : 1,
      dmgMax: w ? w.max! : 2,
      dmgPct,
      ar: Math.round((s.dex * 5 + 20 + p.level * 5) * (1 + arPct / 100)),
      arPct,
      def: Math.round((armor + s.dex / 4) * (1 + defPct / 100)),
      speed: 3.5 * (1 + incSpeed(p.skills.increased_speed ?? 0) / 100),
      swing: w ? w.speed! : 0.42,
      crit: masteryCrit(ml),
      weaponKind: kind,
    };
  }

  meetsReq(it: Item): boolean {
    const b = BASE_BY_ID[it.baseId];
    const s = this.player.base;
    return s.str >= b.reqStr && s.dex >= b.reqDex && this.player.level >= b.reqLvl;
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

    // auto-pickup gold and potions
    for (const g of this.ground) {
      if (g.item) continue;
      if (g.t < 0.35) continue;
      if (Math.hypot(g.x - p.x, g.y - p.y) < 0.75) {
        if (g.potion) {
          if ((g.potion === "hp" ? p.hpPots : p.mpPots) >= MAX_POTS) continue;
        }
        this.pickUp(g);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ skills & attacks
  skillLevel(id: string) {
    return this.player.skills[id] ?? 0;
  }

  canLearn(id: string): { ok: boolean; why?: string } {
    const s = SKILL_BY_ID[id];
    const p = this.player;
    if (!s) return { ok: false, why: "Unknown skill" };
    const lvl = this.skillLevel(id);
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
    const dur = skill === "double_swing" ? d.swing * 1.05 : d.swing;
    p.action = { type: "swing", skill, t: 0, dur, hitAt: skill === "double_swing" ? [0.32, 0.72] : [0.5], hitsDone: 0, target };
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
          this.dropAt(best.x, best.y, { potion: chance(0.7) ? "hp" : "mp" });
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
        a.hitsDone++;
        this.resolveMelee(a.skill, a.target, d);
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
          this.playerHit(a.target, d, { dmgPct: leapAttackDmg(lvl), arPct: 100, knock: 5 });
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

  private resolveMelee(skill: string | null, preferred: Monster | null, d: Derived) {
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
    if (!target) return;
    const lvl = skill ? this.skillLevel(skill) : 0;
    if (skill === "bash") this.playerHit(target, d, { dmgPct: bashDmg(lvl), arPct: bashAR(lvl), knock: 6 });
    else if (skill === "stun") this.playerHit(target, d, { arPct: stunAR(lvl), stun: stunDur(lvl), knock: 1.5 });
    else if (skill === "double_swing") this.playerHit(target, d, { arPct: doubleSwingAR(lvl), knock: 1.5 });
    else this.playerHit(target, d, { knock: 1.8 });
  }

  private playerHit(m: Monster, d: Derived, o: { dmgPct?: number; arPct?: number; knock?: number; stun?: number }) {
    const p = this.player;
    const ar = d.ar * (1 + (o.arPct ?? 0) / 100);
    const hitChance = Math.max(0.05, Math.min(0.95, 2 * (ar / (ar + m.defense)) * (p.level / (p.level + m.mlvl))));
    if (m.state === "idle") this.aggroPack(m);
    if (!chance(hitChance)) {
      this.floatAt(m.x, m.y, "Miss", "#b8b8b8", 13);
      this.events.sound("miss");
      return;
    }
    let dmg = randInt(d.dmgMin, d.dmgMax) * (1 + (d.dmgPct + (o.dmgPct ?? 0)) / 100);
    const crit = d.crit > 0 && chance(d.crit / 100);
    if (crit) dmg *= 2;
    dmg = Math.max(1, Math.round(dmg));
    m.hp -= dmg;
    m.flash = 1;
    m.lastHurt = this.time;
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
      for (let i = 0; i < 3; i++) this.dropAt(m.x, m.y, { item: makeItem(rollBase(m.mlvl + 2).id) });
      this.dropAt(m.x, m.y, { gold: randInt(40, 90) * m.mlvl });
      this.dropAt(m.x, m.y, { potion: "hp" });
      this.dropAt(m.x, m.y, { potion: "mp" });
      this.stairs = { x: this.level.bossRoom.cx + 0.5, y: this.level.bossRoom.cy + 2.5 };
      if (!isFloor(this.level, Math.floor(this.stairs.x), Math.floor(this.stairs.y))) this.stairs = { x: m.x, y: m.y };
      this.events.toast(`${m.def.name} is slain! Stairs down have opened.`);
      this.events.sound("boss");
    } else {
      const r = Math.random();
      if (r < 0.16) this.dropAt(m.x, m.y, { item: makeItem(rollBase(m.mlvl).id) });
      else if (r < 0.36) this.dropAt(m.x, m.y, { gold: randInt(3, 12) * m.mlvl });
      else if (r < 0.5) this.dropAt(m.x, m.y, { potion: chance(0.7) ? "hp" : "mp" });
    }
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

  respawn() {
    const p = this.player;
    const lost = Math.floor(p.gold * 0.1);
    p.gold -= lost;
    p.dead = false;
    p.x = this.level.start.cx + 0.5;
    p.y = this.level.start.cy + 0.5;
    p.buffs = { shout: 0, bo: 0 };
    p.healLeft = 0;
    p.manaLeft = 0;
    const d = this.derived();
    p.hp = d.maxHp;
    p.mana = d.maxMana;
    for (const m of this.monsters) {
      if (m.state === "dead") continue;
      m.state = "idle";
      m.x = m.homeX;
      m.y = m.homeY;
      m.fearT = 0;
      m.stunT = 0;
    }
    if (lost) this.events.toast(`You lost ${lost} gold.`);
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

  pickUp(g: GroundItem): boolean {
    const p = this.player;
    if (g.gold) {
      p.gold += g.gold;
      this.floatAt(g.x, g.y, `+${g.gold} gold`, "#e8c547", 13);
      this.events.sound("gold");
    } else if (g.potion) {
      if (g.potion === "hp") {
        if (p.hpPots >= MAX_POTS) {
          this.events.toast("Potion belt is full");
          return false;
        }
        p.hpPots++;
      } else {
        if (p.mpPots >= MAX_POTS) {
          this.events.toast("Potion belt is full");
          return false;
        }
        p.mpPots++;
      }
      this.events.sound("pickup");
    } else if (g.item) {
      const slot = p.inventory.indexOf(null);
      if (slot < 0) {
        this.events.toast("Inventory is full");
        this.events.sound("nomana");
        return false;
      }
      p.inventory[slot] = g.item;
      this.floatAt(g.x, g.y, BASE_BY_ID[g.item.baseId].name, "#fff", 13);
      this.events.sound("pickup");
    }
    this.ground.splice(this.ground.indexOf(g), 1);
    this.events.changed();
    return true;
  }

  equipFromInventory(i: number): string | null {
    const p = this.player;
    const it = p.inventory[i];
    if (!it) return null;
    if (!this.meetsReq(it)) return "You don't meet the requirements";
    const slot = BASE_BY_ID[it.baseId].slot;
    const prev = p.equip[slot] ?? null;
    p.equip[slot] = it;
    p.inventory[i] = prev;
    this.events.sound("equip");
    this.clampVitals();
    this.events.changed();
    return null;
  }

  unequip(slot: Slot): string | null {
    const p = this.player;
    const it = p.equip[slot];
    if (!it) return null;
    const free = p.inventory.indexOf(null);
    if (free < 0) return "Inventory is full";
    p.inventory[free] = it;
    delete p.equip[slot];
    this.events.sound("equip");
    this.clampVitals();
    this.events.changed();
    return null;
  }

  dropFromInventory(i: number) {
    const p = this.player;
    const it = p.inventory[i];
    if (!it) return;
    p.inventory[i] = null;
    this.dropAt(p.x, p.y, { item: it });
    this.events.changed();
  }

  usePotion(kind: "hp" | "mp") {
    const p = this.player;
    if (p.dead) return;
    const d = this.derived();
    if (kind === "hp") {
      if (p.hpPots <= 0) return this.events.toast("No healing potions");
      p.hpPots--;
      p.healLeft += d.maxHp * 0.45;
    } else {
      if (p.mpPots <= 0) return this.events.toast("No mana potions");
      p.mpPots--;
      p.manaLeft += d.maxMana * 0.6;
    }
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
    this.startFloor(this.floor + 1);
    this.events.sound("stairs");
    this.events.toast(`Ember Crypt — Level ${this.floor}`);
    this.events.changed();
  }

  nearStairs(): boolean {
    if (!this.stairs || this.player.dead) return false;
    return Math.hypot(this.stairs.x - this.player.x, this.stairs.y - this.player.y) < 1.6;
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
