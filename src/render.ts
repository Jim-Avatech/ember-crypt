/**
 * Pixel-art renderer. The world is drawn on a low-resolution canvas (1 canvas px = 1 art px) and
 * scaled up with nearest-neighbour by CSS. Text (labels, damage numbers, boss name) is drawn on a
 * separate full-resolution overlay so it stays sharp.
 */
import { BASE_BY_ID, QUALITY_COLOR, itemName, lookOf, makeItem, qualityOf } from "./data/items";
import { ARTIFACTS, ARTIFACT_BY_ID, ARTIFACT_COLOR, SANCTUM_FLOOR as SANCTUM_FLOOR_R, type Theme, actDef } from "./data/acts";
import { ELEM_COLOR, ELITE_MODS } from "./data/monsters";
import type { Ally, Game, GroundItem, Monster, MonsterShot, Nova, Projectile } from "./game";
import { ALTAR_RISE, PIERCE_COLOR, TOWER_PORTAL_AT, fmtDps } from "./game";
/** v1.8.1: portal colors (rgb): the blue camp portal and the Endless Tower's violet-and-gold one */
const PORTAL_COLORS = { glow: "80,150,255", edge: "170,215,255", swirl: "90,160,255", core: "30,70,170" };
const TOWER_PORTAL_COLORS = { glow: "200,140,255", edge: "255,214,120", swirl: "180,110,255", core: "70,30,130" };
import { artifactIcon } from "./sprites/artifacts";
import { idx, isFloor } from "./map";
import { groundSprite, goldSprite } from "./sprites/items";
import { type Anim, FRAMES, type Look, dirOf, getFrame, heroModel, lookKey, spriteTop } from "./sprites/puppet";
import type { Spell } from "./spells";
import * as T from "./sprites/tiles";

/** v1.4: how Brann the Runesmith looks (a smith's mace as his hammer, mail, gloves and boots) */
const CRAFTER_LOOK: Look = (() => {
  const L = (id: string) => lookOf(makeItem(id, 20));
  return { main: L("mace"), chest: L("armor"), gloves: L("gloves"), boots: L("boots") };
})();

/** v0.9.4: below this share of life the screen edge pulses red and a heartbeat plays. */
export const LOW_LIFE = 0.35;

const HW = 16; // half tile width in art px
const HH = 8;
/** frame index that is safe for any time value */
const fi = (t: number, n: number) => ((Math.floor(t) % n) + n) % n;

export interface LabelHit {
  g: GroundItem;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
}

type Drawable = { d: number; f: () => void };

interface Art {
  crypt: HTMLCanvasElement[];
  wallTall: HTMLCanvasElement;
  wallLow: HTMLCanvasElement;
  grass: HTMLCanvasElement[];
  dirt: HTMLCanvasElement[];
  fenceTall: HTMLCanvasElement;
  fenceLow: HTMLCanvasElement;
  trees: HTMLCanvasElement[];
  tents: HTMLCanvasElement[];
  fire: HTMLCanvasElement[];
  crate: HTMLCanvasElement;
  chest: HTMLCanvasElement;
  barrel: HTMLCanvasElement;
  stump: HTMLCanvasElement;
  waypoint: HTMLCanvasElement[];
  stairs: HTMLCanvasElement;
  torch: HTMLCanvasElement[];
  decals: Record<string, HTMLCanvasElement>;
}

let ART: Art | null = null;
function art(): Art {
  if (!ART)
    ART = {
      crypt: [0, 1, 2, 3].map((v) => T.cryptFloor(v)),
      wallTall: T.cryptWall(true),
      wallLow: T.cryptWall(false),
      grass: [0, 1, 2, 3].map(T.grassTile),
      dirt: [0, 1, 2].map(T.dirtTile),
      fenceTall: T.fenceWall(true),
      fenceLow: T.fenceWall(false),
      trees: [0, 1, 2].map(T.treeSprite),
      tents: [0, 1].map(T.tentSprite),
      fire: T.campfireFrames(),
      crate: T.crateSprite(),
      chest: T.chestSprite(),
      barrel: T.barrelSprite(),
      stump: T.stumpSprite(),
      waypoint: T.waypointFrames(),
      stairs: T.stairsSprite(),
      torch: T.torchFrames(),
      decals: Object.fromEntries(["bones", "skull", "blood", "crack"].map((k) => [k, T.decalSprite(k)])),
    };
  return ART;
}

/** Floor, walls, torches and decals for one act, built on first visit. */
interface ActArt {
  theme: Theme;
  crypt: HTMLCanvasElement[];
  wallTall: HTMLCanvasElement;
  wallLow: HTMLCanvasElement;
  torch: HTMLCanvasElement[];
  decals: Record<string, HTMLCanvasElement>;
}
/** keyed by theme (v1.8.1: the Sanctum and the tower share act number 5 but have their own look) */
const ACT_ART = new Map<Theme, ActArt>();
function actArt(floor: number): ActArt {
  const a = actDef(floor);
  let r = ACT_ART.get(a.theme);
  if (!r) {
    const th = a.theme;
    r = {
      theme: th,
      crypt: [0, 1, 2, 3].map((v) => T.cryptFloor(v, th)),
      wallTall: T.cryptWall(true, th),
      wallLow: T.cryptWall(false, th),
      torch: T.torchFrames(th.flame, th.core),
      decals: Object.fromEntries(Object.entries(th.decals).map(([k, v]) => [k, T.decalSprite(v)])),
    };
    ACT_ART.set(a.theme, r);
  }
  return r;
}

/** v1.8: a sprite frame recolored to a tint (hue and saturation of the tint, the sprite's own light and shade), cached. */
const tintCache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();
export function tinted(src: HTMLCanvasElement, tint: string): HTMLCanvasElement {
  let byTint = tintCache.get(src);
  if (!byTint) tintCache.set(src, (byTint = new Map()));
  let c = byTint.get(tint);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const x = c.getContext("2d")!;
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = "color";
  x.globalAlpha = 0.75;
  x.fillStyle = tint;
  x.fillRect(0, 0, c.width, c.height);
  x.globalAlpha = 1;
  x.globalCompositeOperation = "destination-in";
  x.drawImage(src, 0, 0);
  byTint.set(tint, c);
  return c;
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  fx: HTMLCanvasElement;
  fctx: CanvasRenderingContext2D;
  /** CSS viewport size */
  W = 0;
  H = 0;
  /** art canvas size */
  AW = 0;
  AH = 0;
  /** CSS px per art px */
  ascale = 2;
  dpr = 1;
  camX = 0;
  camY = 0;
  shake = 0;
  shakeOn = true;
  labels: LabelHit[] = [];
  private light!: HTMLCanvasElement;
  private lctx!: CanvasRenderingContext2D;
  private mini: HTMLCanvasElement | null = null;
  private miniT = 0;
  private playerDeadAt = -1;
  private ox = 0;
  private oy = 0;

  constructor(canvas: HTMLCanvasElement, fx: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.fx = fx;
    this.fctx = fx.getContext("2d")!;
  }

  setMinimap(c: HTMLCanvasElement) {
    this.mini = c;
  }

  resize(w: number, h: number) {
    this.W = w;
    this.H = h;
    const dpr = window.devicePixelRatio || 1;
    // whole device pixels per art pixel keeps every art pixel the same size
    const target = Math.max(1.6, Math.min(3, Math.min(h, w * 0.6) / 190));
    this.ascale = Math.max(1, Math.round(dpr * target)) / dpr;
    this.AW = Math.ceil(w / this.ascale);
    this.AH = Math.ceil(h / this.ascale);
    this.canvas.width = this.AW;
    this.canvas.height = this.AH;
    this.canvas.style.width = `${this.AW * this.ascale}px`;
    this.canvas.style.height = `${this.AH * this.ascale}px`;
    this.dpr = Math.min(2, dpr);
    this.fx.width = Math.round(w * this.dpr);
    this.fx.height = Math.round(h * this.dpr);
    this.fx.style.width = `${w}px`;
    this.fx.style.height = `${h}px`;
    this.light = document.createElement("canvas");
    this.light.width = this.AW;
    this.light.height = this.AH;
    this.lctx = this.light.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
  }

  // -------------------------------------------------------------- projection (art px)
  ax(wx: number, wy: number) {
    return Math.round((wx - wy) * HW) + this.ox;
  }
  ay(wx: number, wy: number, z = 0) {
    return Math.round((wx + wy) * HH - z * HH * 2) + this.oy;
  }
  /** CSS px of a world point (for overlays and hit tests) */
  cx(wx: number, wy: number) {
    return this.ax(wx, wy) * this.ascale;
  }
  cy(wx: number, wy: number, z = 0) {
    return this.ay(wx, wy, z) * this.ascale;
  }

  // -------------------------------------------------------------- frame
  render(game: Game, dt: number, showLabels: boolean) {
    const A0 = art();
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    const p = game.player;
    const L = game.level;
    const town = L.kind === "town";
    const AA = town ? null : actArt(game.floor);
    const A = AA ? { ...A0, crypt: AA.crypt, wallTall: AA.wallTall, wallLow: AA.wallLow, torch: AA.torch, decals: AA.decals } : A0;
    const tx = (p.x - p.y) * HW;
    const ty = (p.x + p.y) * HH - p.z * HH;
    const k = 1 - Math.exp(-10 * dt);
    if (Math.abs(this.camX - tx) > 200 || Math.abs(this.camY - ty) > 200 || dt === 0) {
      if (Math.abs(this.camX - tx) > 200 || Math.abs(this.camY - ty) > 200) {
        this.camX = tx;
        this.camY = ty;
      }
    } else {
      this.camX += (tx - this.camX) * k;
      this.camY += (ty - this.camY) * k;
    }
    this.shake = Math.max(0, this.shake - dt * 30);
    const sh = this.shakeOn ? this.shake / this.ascale / 2 : 0;
    this.ox = Math.round(this.AW / 2 - this.camX + (Math.random() - 0.5) * sh);
    this.oy = Math.round(this.AH / 2 - this.camY + (Math.random() - 0.5) * sh);
    if (p.dead && this.playerDeadAt < 0) this.playerDeadAt = game.time;
    if (!p.dead) this.playerDeadAt = -1;

    ctx.fillStyle = town ? "#0c0f08" : AA!.theme.void;
    ctx.fillRect(0, 0, this.AW, this.AH);

    const R = Math.ceil(Math.max(this.AW / 32, this.AH / 16)) + 4;
    const x0 = Math.max(0, Math.floor(p.x - R));
    const x1 = Math.min(L.w - 1, Math.ceil(p.x + R));
    const y0 = Math.max(0, Math.floor(p.y - R));
    const y1 = Math.min(L.h - 1, Math.ceil(p.y + R));
    const vis = (sx: number, sy: number, pad: number) => sx > -pad && sx < this.AW + pad && sy > -pad && sy < this.AH + pad * 2;

    // ---- ground
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = idx(x, y);
        const sx = this.ax(x, y);
        const sy = this.ay(x, y);
        if (!vis(sx, sy, 40)) continue;
        if (town) {
          const v = L.variant[i];
          ctx.drawImage(v >= 4 ? A.dirt[v - 4] : A.grass[(v || (x * 7 + y * 13) % 4) & 3], sx - HW, sy);
        } else if (L.tiles[i] === 1) ctx.drawImage(A.crypt[L.variant[i] & 3], sx - HW, sy);
      }
    for (const dcl of L.decals) {
      if (Math.abs(dcl.x - p.x) > R || Math.abs(dcl.y - p.y) > R) continue;
      const c = A.decals[dcl.kind];
      ctx.drawImage(c, this.ax(dcl.x, dcl.y) - 7, this.ay(dcl.x, dcl.y) - 4);
    }
    if (game.stairs) ctx.drawImage(A.stairs, this.ax(game.stairs.x - 0.5, game.stairs.y - 0.5) - HW, this.ay(game.stairs.x - 0.5, game.stairs.y - 0.5));
    if (game.waypointHere()) {
      const wp = L.waypoint;
      const f = A.waypoint[fi(game.time * 5, 4)];
      ctx.drawImage(f, this.ax(wp.x - 0.5, wp.y - 0.5) - HW, this.ay(wp.x - 0.5, wp.y - 0.5));
    }
    if (game.portal && game.inTown) this.drawPortal(ctx, game.portal.x, game.portal.y, game.time, 1);
    // v1.8.1: the Endless Tower's portal (violet and gold, taller) once Kharos is beaten
    if (game.inTown && game.player.towerOpen) this.drawPortal(ctx, TOWER_PORTAL_AT.x, TOWER_PORTAL_AT.y, game.time, 1.3, TOWER_PORTAL_COLORS);
    // v1.8.1: the Sanctum's altar of the four
    if (game.altar && !game.inTown) this.drawAltar(ctx, game);
    // rings
    for (const rg of game.rings) {
      const kk = rg.t / rg.life;
      // v1.6.1: a "full" ring (Static Field) shows its real reach at once: a quick snap out to the edge, then a fade
      const grow = rg.full ? Math.min(1, kk * 6) : kk;
      const rx = rg.radius * grow * HW * 1.41;
      ctx.fillStyle = `${rg.color}${(rg.full ? 0.9 * (1 - kk) : 1 - kk).toFixed(2)})`;
      const cx = this.ax(rg.x, rg.y);
      const cy = this.ay(rg.x, rg.y);
      const n = Math.max(16, Math.round(rx * (rg.full ? 3 : 1.5)));
      const sz = rg.full ? 2 : 1;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2;
        ctx.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * rx * 0.5), sz, sz);
      }
    }
    // boss novas: a warning ring on the ground, then the burst
    for (const n of game.novas) this.drawNova(n, game.time);
    // v1.0: burning / poisoned ground
    for (const pa of game.patches) this.drawPatch(pa, game.time);
    // ground items
    for (const g of game.ground) {
      if (g.artifact) {
        this.drawArtifact(g, game.time);
        continue;
      }
      const c = g.item ? groundSprite(g.item) : goldSprite();
      const bounce = g.t < 0.4 ? Math.sin((g.t / 0.4) * Math.PI) * 0.5 : 0;
      const q = g.item ? qualityOf(g.item) : "normal";
      if (q !== "normal") {
        // light beam over magic (blue) and rare (yellow) drops
        const bx = this.ax(g.x, g.y);
        const by = this.ay(g.x, g.y);
        const col = q === "rare" ? "255,255,100" : "122,122,255";
        const pulse = 0.75 + 0.25 * Math.sin(game.time * 3 + g.x);
        const H = 34;
        for (let k = 0; k < H; k++) {
          const a = (1 - k / H) * 0.5 * pulse;
          ctx.fillStyle = `rgba(${col},${a.toFixed(3)})`;
          ctx.fillRect(bx - 1, by - k, 3, 1);
          ctx.fillStyle = `rgba(${col},${(a * 0.4).toFixed(3)})`;
          ctx.fillRect(bx - 3, by - k, 2, 1);
          ctx.fillRect(bx + 2, by - k, 2, 1);
        }
        ctx.fillStyle = `rgba(${col},${(0.35 * pulse).toFixed(3)})`;
        ctx.fillRect(bx - 6, by - 1, 13, 3);
      }
      ctx.drawImage(c, this.ax(g.x, g.y) - (c.width >> 1), this.ay(g.x, g.y, bounce) - (c.height >> 1) - 1);
    }

    // ---- sorted: walls, props, actors
    const list: Drawable[] = [];
    const pD = p.x + p.y;
    const psx = this.ax(p.x, p.y);
    const psy = this.ay(p.x, p.y);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = idx(x, y);
        if (L.tiles[i] === 1 || L.solidKind[i] === 1) continue;
        let front = false;
        let back = false;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const nx = x + ox;
            const ny = y + oy;
            const floorish = isFloor(L, nx, ny) || (nx >= 0 && ny >= 0 && nx < L.w && ny < L.h && L.solidKind[idx(nx, ny)] === 1);
            if (!floorish) continue;
            if (ox + oy > 0) back = true;
            else front = true;
          }
        if (!front && !back) continue;
        const tall = back && !front;
        const img = town ? (tall ? A.fenceTall : A.fenceLow) : tall ? A.wallTall : A.wallLow;
        const h = img.height - 16;
        const sx = this.ax(x, y) - HW;
        const sy = this.ay(x, y) - h;
        if (!vis(sx, sy, 60)) continue;
        const d = x + y + 1;
        let alpha = 1;
        if (tall && d > pD && Math.abs(sx + HW - psx) < 34 && sy + h + 16 > psy - 34 && sy < psy) alpha = 0.35;
        const torch = tall && L.torches.find((t) => t.x === x && t.y === y);
        list.push({
          d,
          f: () => {
            ctx.globalAlpha = alpha;
            ctx.drawImage(img, sx, sy);
            ctx.globalAlpha = 1;
            if (torch) {
              const right = isFloor(L, x + 1, y);
              const wx = right ? x + 1 : x + 0.5;
              const wy = right ? y + 0.5 : y + 1;
              const fr = A.torch[fi(game.time * 8 + x, 3)];
              ctx.drawImage(fr, this.ax(wx, wy) - 4, this.ay(wx, wy) - 22);
            }
          },
        });
      }
    for (const pr of L.props) {
      if (Math.abs(pr.x - p.x) > R + 3 || Math.abs(pr.y - p.y) > R + 3) continue;
      const cx = pr.x + 0.5;
      const cy = pr.y + 0.5;
      list.push({
        d: pr.x + pr.y + 1,
        f: () => {
          if (pr.kind === "tent") {
            const c = A.tents[pr.v % 2];
            ctx.drawImage(c, this.ax(pr.x + 1, pr.y + 1) - 50, this.ay(pr.x + 1, pr.y + 1) - 80);
            return;
          }
          const c =
            pr.kind === "tree" ? A.trees[pr.v % 3]
            : pr.kind === "campfire" ? A.fire[fi(game.time * 9, 4)]
            : pr.kind === "crate" ? A.crate
            : pr.kind === "chest" ? A.chest
            : pr.kind === "barrel" ? A.barrel
            : A.stump;
          const footY = pr.kind === "tree" ? 52 : c.height - (pr.kind === "campfire" ? 5 : 3);
          const sx = this.ax(cx, cy) - (c.width >> 1);
          const sy = this.ay(cx, cy) - footY;
          let alpha = 1;
          if (pr.kind === "tree" && cx + cy > pD && Math.abs(sx + c.width / 2 - psx) < 20 && sy < psy && sy + c.height > psy - 30) alpha = 0.45;
          ctx.globalAlpha = alpha;
          ctx.drawImage(c, sx, sy);
          ctx.globalAlpha = 1;
        },
      });
    }
    for (const w of game.wards) {
      if (Math.abs(w.x - p.x) > R || Math.abs(w.y - p.y) > R) continue;
      list.push({ d: w.x + w.y, f: () => this.drawWard(w, game.time) });
    }
    for (const m of game.monsters) {
      if (m.hidden) continue; // a corpse used up by Find Item / Grim Ward
      if (Math.abs(m.x - p.x) > R || Math.abs(m.y - p.y) > R) continue;
      // corpses lie flat, under everything standing
      list.push({ d: m.state === "dead" && m.deadT > 0.6 ? -1e6 + m.x + m.y : m.x + m.y, f: () => this.drawMonster(m) });
    }
    if (L.vendor) {
      const v = L.vendor;
      list.push({ d: v.x + v.y, f: () => this.drawVendor(game) });
    }
    if (L.crafter) {
      const v = L.crafter;
      list.push({ d: v.x + v.y, f: () => this.drawCrafter(game) });
    }
    list.push({ d: pD, f: () => this.drawPlayer(game) });
    for (const al of game.allies) list.push({ d: al.x + al.y, f: () => this.drawAlly(game, al) });
    for (const q of game.projectiles) list.push({ d: q.x + q.y + 0.3, f: () => this.drawProjectile(q) });
    for (const q of game.shots) list.push({ d: q.x + q.y + 0.3, f: () => this.drawShot(q) });
    // v1.6 Sorceress spells (ground effects under everything, the rest sorted with the world)
    for (const sp of game.spells) {
      if (sp.k === "blizzard" || sp.k === "wall" || sp.k === "cone" || sp.k === "blink") list.push({ d: -1e5, f: () => this.drawSpell(sp, game.time) });
      else if (sp.k === "missile" || sp.k === "hydra") list.push({ d: sp.x + sp.y + 0.3, f: () => this.drawSpell(sp, game.time) });
      else list.push({ d: 1e6, f: () => this.drawSpell(sp, game.time) });
    }
    list.sort((a, b) => a.d - b.d);
    for (const it of list) it.f();

    // v1.0 lightning arcs
    for (const z of game.zaps) {
      const k = 1 - z.t / z.life;
      if (k <= 0 || z.pts.length < 2) continue;
      for (const [w, c] of [[3, `rgba(120,160,255,${(0.35 * k).toFixed(2)})`], [1, `rgba(240,245,255,${k.toFixed(2)})`]] as const) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        for (let i = 0; i < z.pts.length; i++) {
          const a = z.pts[i];
          const x = this.ax(a.x, a.y);
          const y = this.ay(a.x, a.y, 0.6);
          if (i === 0) ctx.moveTo(x, y);
          else {
            const b = z.pts[i - 1];
            const mx = (x + this.ax(b.x, b.y)) / 2 + (((i * 37 + Math.floor(z.t * 30)) % 7) - 3);
            const my = (y + this.ay(b.x, b.y, 0.6)) / 2 + (((i * 53 + Math.floor(z.t * 30)) % 5) - 2);
            ctx.lineTo(mx, my);
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
    }
    // particles
    for (const q of game.particles) {
      const a = 1 - q.t / q.life;
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      const s = Math.max(1, Math.round(q.size * 0.5));
      ctx.fillRect(this.ax(q.x, q.y) - (s >> 1), this.ay(q.x, q.y, q.z * 0.5) - (s >> 1), s, s);
    }
    ctx.globalAlpha = 1;

    this.drawLighting(game);

    // health bars (crisp art pixels)
    for (const m of game.monsters) {
      if (m.state === "dead" || m === game.boss || m.dummy) continue;
      if (m.hp >= m.maxHp && m.state === "idle" && !m.elite) continue;
      const sx = this.ax(m.x, m.y);
      const sy = this.ay(m.x, m.y) - Math.round(spriteTop(m.def.species) * 1.6);
      ctx.fillStyle = "#000";
      ctx.fillRect(sx - 9, sy - 1, 18, 4);
      ctx.fillStyle = m.elite === 2 ? "#e0a030" : m.elite === 1 ? "#4f7cff" : "#c8281c";
      ctx.fillRect(sx - 8, sy, Math.max(0, Math.round(16 * (m.hp / m.maxHp))), 2);
    }

    // ---- hi-res overlay
    const f = this.fctx;
    f.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    f.clearRect(0, 0, this.W, this.H);
    this.labels = [];
    this.drawLabels(game, showLabels);
    this.drawEliteNames(game);
    this.drawDummyMeter(game);
    if (L.vendor) {
      const v = L.vendor;
      const near = game.nearVendor();
      f.font = "bold 12px Georgia, 'Times New Roman', serif";
      f.textAlign = "center";
      f.lineWidth = 3;
      f.strokeStyle = "rgba(0,0,0,.85)";
      f.fillStyle = near ? "#ffe9a8" : "#c8b88a";
      const yy = this.cy(v.x, v.y) - 44 * this.ascale;
      f.strokeText("Hilde the Trader", this.cx(v.x, v.y), yy);
      f.fillText("Hilde the Trader", this.cx(v.x, v.y), yy);
    }
    if (L.crafter) {
      const v = L.crafter;
      const near = game.nearCrafter();
      f.font = "bold 12px Georgia, 'Times New Roman', serif";
      f.textAlign = "center";
      f.lineWidth = 3;
      f.strokeStyle = "rgba(0,0,0,.85)";
      f.fillStyle = near ? "#ffe9a8" : "#c8b88a";
      const yy = this.cy(v.x, v.y) - 50 * this.ascale;
      f.strokeText("Brann the Runesmith", this.cx(v.x, v.y), yy);
      f.fillText("Brann the Runesmith", this.cx(v.x, v.y), yy);
    }
    if (game.inTown && game.player.towerOpen) {
      const near = game.nearTowerPortal();
      f.font = "bold 12px Georgia, 'Times New Roman', serif";
      f.textAlign = "center";
      f.lineWidth = 3;
      f.strokeStyle = "rgba(0,0,0,.85)";
      f.fillStyle = near ? "#ffe9a8" : "#d0b0ff";
      const label = `Endless Tower${game.player.towerBest ? ` · best ${game.player.towerBest}` : ""}`;
      const yy = this.cy(TOWER_PORTAL_AT.x, TOWER_PORTAL_AT.y) - 52 * this.ascale;
      f.strokeText(label, this.cx(TOWER_PORTAL_AT.x, TOWER_PORTAL_AT.y), yy);
      f.fillText(label, this.cx(TOWER_PORTAL_AT.x, TOWER_PORTAL_AT.y), yy);
    }
    const left = game.portalLeft();
    if (game.inTown && game.portal && left !== null) {
      f.font = "bold 12px Georgia, 'Times New Roman', serif";
      f.textAlign = "center";
      f.lineWidth = 3;
      f.strokeStyle = "rgba(0,0,0,.85)";
      f.fillStyle = left < 60 ? "#ff8a6a" : "#bfe0ff";
      const label = `Tower ${game.portal.floor - SANCTUM_FLOOR_R} · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
      const yy = this.cy(game.portal.x, game.portal.y) - 42 * this.ascale;
      f.strokeText(label, this.cx(game.portal.x, game.portal.y), yy);
      f.fillText(label, this.cx(game.portal.x, game.portal.y), yy);
    }
    for (const fl of game.floaters) {
      const kk = fl.t / fl.life;
      const sx = this.cx(fl.x, fl.y);
      const sy = this.cy(fl.x, fl.y) - (24 + kk * 16) * this.ascale;
      f.globalAlpha = kk > 0.7 ? (1 - kk) / 0.3 : 1;
      f.font = `bold ${Math.round(fl.size * Math.min(1.15, this.ascale / 2.2))}px Georgia, 'Times New Roman', serif`;
      f.textAlign = "center";
      f.lineWidth = 3;
      f.strokeStyle = "rgba(0,0,0,.85)";
      f.strokeText(fl.text, sx, sy);
      f.fillStyle = fl.color;
      f.fillText(fl.text, sx, sy);
    }
    f.globalAlpha = 1;

    this.lastBossBar = null;
    if (game.boss && game.boss.state !== "dead" && game.boss.state !== "idle") {
      const b = game.boss;
      const w = Math.min(320, this.W * 0.4);
      const x = this.W / 2 - w / 2;
      const y = this.bossBarY(x, w);
      f.fillStyle = "rgba(0,0,0,.75)";
      f.fillRect(x - 2, y - 2, w + 4, 22);
      f.fillStyle = b.def.rank === "final" ? "#a0400c" : "#7a1410";
      f.fillRect(x, y, w * (b.hp / b.maxHp), 18);
      f.font = "bold 13px Georgia, serif";
      f.textAlign = "center";
      f.fillStyle = b.def.rank === "final" ? "#ffcf7a" : "#e9d9a8";
      // v0.9.4: boss modifiers (Extra Fast, Stone Skin) after the name
      const mods = (b.mods ?? []).map((k) => ELITE_MODS[k]).join(" · ");
      f.fillText(mods ? `${b.def.name} · ${mods}` : b.def.name, this.W / 2, y + 14, w - 8);
    }
    const maxHp = game.derived().maxHp;
    if (!p.dead) this.drawVitalRing(game, p.hp / maxHp, p.mana / game.derived().maxMana);
    if (!p.dead && p.hp / maxHp < LOW_LIFE) {
      // mockup low-life warning: a heartbeat (double thump) red edge, stronger the lower you are
      const ph = (game.time % 1.0) / 1.0;
      const beat = Math.max(0, 1 - Math.abs(ph - 0.08) / 0.08) + 0.8 * Math.max(0, 1 - Math.abs(ph - 0.3) / 0.08);
      const depth = 1 - p.hp / maxHp / LOW_LIFE;
      const a = Math.max(p.flash * 0.45, 0.22 + 0.25 * depth + 0.25 * beat);
      const grd = f.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.32, this.W / 2, this.H / 2, this.W * 0.62);
      grd.addColorStop(0, "rgba(150,0,0,0)");
      grd.addColorStop(1, `rgba(185,0,0,${Math.min(0.8, a).toFixed(2)})`);
      f.fillStyle = grd;
      f.fillRect(0, 0, this.W, this.H);
    } else if (p.flash > 0) {
      const a = p.flash * 0.45;
      const grd = f.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.3, this.W / 2, this.H / 2, this.W * 0.7);
      grd.addColorStop(0, "rgba(120,0,0,0)");
      grd.addColorStop(1, `rgba(140,0,0,${a.toFixed(2)})`);
      f.fillStyle = grd;
      f.fillRect(0, 0, this.W, this.H);
    }

    this.miniT -= dt;
    if (this.mini && (this.miniT <= 0 || dt === 0)) {
      this.miniT = 0.25;
      this.drawMinimap(game);
    }
  }

  // -------------------------------------------------------------- lighting
  private drawLighting(game: Game) {
    const g = this.lctx;
    const p = game.player;
    const L = game.level;
    const town = L.kind === "town";
    const W = this.AW;
    const H = this.AH;
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, W, H);
    g.fillStyle = town ? "rgba(6,8,18,.42)" : "rgba(0,0,0,.9)";
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "destination-out";
    const hole = (wx: number, wy: number, r: number, strength: number) => {
      const x = this.ax(wx, wy);
      const y = this.ay(wx, wy) - 8;
      const rr = r * HW * 1.41;
      const grd = g.createRadialGradient(x, y, rr * 0.15, x, y, rr);
      grd.addColorStop(0, `rgba(0,0,0,${strength})`);
      grd.addColorStop(0.55, `rgba(0,0,0,${strength * 0.75})`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(x, y, rr, rr * 0.7, 0, 0, 7);
      g.fill();
    };
    hole(p.x, p.y, town ? 10 : 8.5, 1);
    for (const t of L.torches) {
      if (Math.abs(t.x - p.x) > 18 || Math.abs(t.y - p.y) > 18) continue;
      const fl = 0.85 + Math.sin(game.time * 9 + t.x) * 0.05;
      hole(t.x + 0.9, t.y + 0.9, 3.6 * fl, 0.8);
    }
    if (game.stairs) hole(game.stairs.x, game.stairs.y, 3, 0.7);
    // bosses glow faintly so they read in the dark; bolts light their path
    if (game.boss && game.boss.state !== "dead") hole(game.boss.x, game.boss.y, game.boss.def.rank === "final" ? 3.4 : 2.4, 0.55);
    for (const q of game.shots) if (q.look === "bolt") hole(q.x, q.y, 1.4, 0.6);
    for (const n of game.novas) hole(n.x, n.y, n.radius + 0.6, 0.5);
    if (game.waypointHere()) hole(L.waypoint.x, L.waypoint.y, 2.6, 0.7);
    const fires = L.props.filter((pr) => pr.kind === "campfire");
    for (const fr of fires) hole(fr.x + 0.5, fr.y + 0.5, 6 + Math.sin(game.time * 7) * 0.2, 1);
    g.globalCompositeOperation = "source-over";
    const ctx = this.ctx;
    ctx.drawImage(this.light, 0, 0);
    // warm / cool glows
    ctx.globalCompositeOperation = "lighter";
    const glow = (wx: number, wy: number, r: number, rgb: string, a: number) => {
      const x = this.ax(wx, wy);
      const y = this.ay(wx, wy) - 6;
      const rr = r * HW;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, rr);
      grd.addColorStop(0, `rgba(${rgb},${a})`);
      grd.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    };
    for (const t of L.torches) {
      if (Math.abs(t.x - p.x) > 14 || Math.abs(t.y - p.y) > 14) continue;
      glow(t.x + 0.9, t.y + 0.9, 2.6, town ? "120,60,10" : actArt(game.floor).theme.glow, 0.28);
    }
    for (const q of game.shots) if (q.look === "bolt") glow(q.x, q.y, 1.2, q.elem === "light" ? "200,200,80" : "200,90,20", 0.35);
    for (const g of game.ground) if (g.artifact) glow(g.x, g.y, 2.2, "255,140,40", 0.3 + Math.sin(game.time * 4) * 0.08);
    for (const fr of fires) glow(fr.x + 0.5, fr.y + 0.5, 4.5, "150,70,10", 0.3 + Math.sin(game.time * 11) * 0.03);
    if (game.waypointHere()) glow(L.waypoint.x, L.waypoint.y, 2, "40,90,200", 0.25 + Math.sin(game.time * 3) * 0.06);
    ctx.globalCompositeOperation = "source-over";
  }

  /**
   * v0.9.4 HUD: life (red) and mana (blue) arcs curving under the hero's feet, with the life number beside them.
   * The number goes right, left or below, whichever side no monster stands on; the ring is kept on screen.
   */
  lastRing: { x: number; y: number; rx: number; ry: number; num: { l: number; t: number; r: number; b: number } } | null = null;
  private drawVitalRing(game: Game, hp: number, mp: number) {
    const f = this.fctx;
    const p = game.player;
    const as = this.ascale;
    const rx = 17 * as, ry = 7.5 * as;
    const x = Math.min(this.W - rx * 1.3 - 48, Math.max(rx * 1.3 + 48, this.cx(p.x, p.y)));
    const y = Math.min(this.H - ry * 1.3 - 22, Math.max(24, this.cy(p.x, p.y) + 2 * as));
    const arc = (k: number, r: number, w: number, col: string) => {
      // bottom half, left → right (PI → 0 through PI/2 at the front)
      f.beginPath();
      f.ellipse(x, y, rx * r, ry * r, 0, Math.PI, Math.PI - Math.PI * Math.max(0, Math.min(1, k)), true);
      f.lineWidth = w;
      f.strokeStyle = col;
      f.stroke();
    };
    f.save();
    f.lineCap = "round";
    arc(1, 1, 8, "rgba(0,0,0,.7)");
    arc(hp, 1, 5.5, hp < LOW_LIFE ? "#ff3020" : "#e0281c");
    arc(1, 1.25, 5.5, "rgba(0,0,0,.65)");
    arc(mp, 1.25, 3.5, "#3a78ff");
    // the life number: bold, black outline + shadow, on the side away from monsters
    const t = `${Math.ceil(p.hp)}`;
    f.font = "800 14px system-ui, sans-serif";
    const tw = f.measureText(t).width, th = 14;
    const R = rx * 1.25;
    const spots = [
      { l: x + R + 6, t: y - 6 },
      { l: x - R - 6 - tw, t: y - 6 },
      { l: x - tw / 2, t: y + ry * 1.25 + 5 },
    ].map((s) => ({ l: s.l, t: s.t, r: s.l + tw, b: s.t + th }));
    const bodies = game.monsters
      .filter((m) => m.state !== "dead" && Math.abs(m.x - p.x) + Math.abs(m.y - p.y) < 5)
      .map((m) => { const mx = this.cx(m.x, m.y), my = this.cy(m.x, m.y); return { l: mx - 12 * as, r: mx + 12 * as, t: my - 38 * as, b: my + 4 * as }; });
    const hits = (q: { l: number; t: number; r: number; b: number }) => bodies.filter((m) => q.l - 3 < m.r && q.r + 3 > m.l && q.t - 3 < m.b && q.b + 3 > m.t).length;
    const num = spots.reduce((best, s) => (hits(s) < hits(best) ? s : best), spots[0]);
    f.textAlign = "left";
    f.textBaseline = "top";
    f.shadowColor = "rgba(0,0,0,.9)";
    f.shadowBlur = 4;
    f.lineJoin = "round";
    f.lineWidth = 4;
    f.strokeStyle = "rgba(0,0,0,.95)";
    f.strokeText(t, num.l, num.t);
    f.shadowBlur = 0;
    f.fillStyle = hp < LOW_LIFE ? "#ff6a50" : "#ffd0c4";
    f.fillText(t, num.l, num.t);
    f.restore();
    this.lastRing = { x, y, rx, ry, num };
  }

  // -------------------------------------------------------------- actors
  private shadow(x: number, y: number, rx: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,.35)";
    const ry = Math.max(1, Math.round(rx / 2));
    for (let dy = -ry; dy <= ry; dy++) {
      const w = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
      ctx.fillRect(x - w, y + dy, w * 2, 1);
    }
  }

  /** Blue oval portal (camp → where you recalled from), or the forming one while channeling. */
  /** v1.8.1: a stone altar with four sockets; the artifacts glow in them while Kharos rises */
  private drawAltar(ctx: CanvasRenderingContext2D, game: Game) {
    const a = game.altar!;
    const cx = Math.round(this.ax(a.x, a.y));
    const cy = Math.round(this.ay(a.x, a.y));
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(cx - 15, cy - 2, 30, 5);
    ctx.fillStyle = "#4a4036";
    ctx.fillRect(cx - 13, cy - 12, 26, 11);
    ctx.fillStyle = "#6a5c4a";
    ctx.fillRect(cx - 14, cy - 15, 28, 4);
    ctx.fillStyle = "#2a241e";
    ctx.fillRect(cx - 13, cy - 2, 26, 1);
    const have = new Set(game.player.artifacts.map((f) => f.id));
    const rising = a.riseT > 0;
    ARTIFACTS.forEach((art, i) => {
      const sx = cx - 10 + i * 6;
      const lit = rising || (have.has(art.id) && !a.used);
      ctx.fillStyle = lit ? ARTIFACT_COLOR : "#1a1612";
      ctx.fillRect(sx, cy - 14, 3, 2);
      if (lit) {
        ctx.fillStyle = `rgba(255,190,90,${0.35 + 0.25 * Math.sin(game.time * 5 + i)})`;
        ctx.fillRect(sx - 1, cy - 18, 5, 4);
      }
    });
    if (rising) {
      const k = 1 - a.riseT / ALTAR_RISE;
      ctx.fillStyle = `rgba(255,210,120,${0.25 + 0.5 * k})`;
      const h = Math.round(20 + 40 * k);
      ctx.fillRect(cx - 3, cy - 15 - h, 6, h);
    }
  }

  private drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, k: number, col = PORTAL_COLORS) {
    const cx = Math.round(this.ax(x, y));
    const cy = Math.round(this.ay(x, y));
    const H = Math.round(34 * k);
    const W = Math.round(12 * k);
    // ground glow
    ctx.fillStyle = `rgba(${col.glow},${0.25 * Math.min(1, k)})`;
    ctx.fillRect(cx - W - 3, cy - 1, W * 2 + 7, 3);
    for (let yy = 0; yy < H; yy++) {
      const v = (yy - H / 2) / (H / 2);
      const half = Math.round(W * Math.sqrt(Math.max(0, 1 - v * v)));
      for (let xx = -half; xx <= half; xx++) {
        const edge = Math.abs(xx) >= half - 1;
        const swirl = Math.sin(xx * 0.9 + yy * 0.5 - t * 6) > 0.4;
        const a = Math.min(1, k);
        ctx.fillStyle = edge ? `rgba(${col.edge},${0.95 * a})` : swirl ? `rgba(${col.swirl},${0.8 * a})` : `rgba(${col.core},${0.75 * a})`;
        ctx.fillRect(cx + xx, cy - H + yy, 1, 1);
      }
    }
  }

  playerLook(game: Game): Look {
    const e = game.player.equip;
    return { main: lookOf(e.main), off: lookOf(e.off), head: lookOf(e.head), chest: lookOf(e.chest), gloves: lookOf(e.gloves), boots: lookOf(e.boots) };
  }

  /** A thrown knife, spinning axe or javelin in flight, with a ground shadow. */
  private drawProjectile(q: Projectile) {
    const ctx = this.ctx;
    const x = this.ax(q.x, q.y);
    const y = this.ay(q.x, q.y, 0.55);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x - 2, this.ay(q.x, q.y) - 1, 4, 2);
    let dx = (q.vx - q.vy) * HW;
    let dy = (q.vx + q.vy) * HH;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const line = (a: number, b: number, color: string, w = 1.6) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x + dx * a, y + dy * a);
      ctx.lineTo(x + dx * b, y + dy * b);
      ctx.stroke();
    };
    ctx.save();
    ctx.lineCap = "round";
    const ec = q.elem && q.elem !== "phys" ? ELEM_COLOR[q.elem] : null;
    if (q.pierced && (q.kind === "arrow" || q.kind === "weapon")) {
      // v1.3: a piercing arrow leaves a pale glowing streak
      // v1.3.1: magenta with a white core (was ice cyan, invisible on Cold/Ice Arrows and frozen monsters)
      ctx.globalAlpha = 0.7;
      line(-28, 2, PIERCE_COLOR, 4);
      ctx.globalAlpha = 0.9;
      line(-22, 1, "#fff0fb", 1.3);
      ctx.globalAlpha = 1;
    }
    if (q.kind === "arrow") {
      if (q.cls === "magic_arrow") {
        ctx.globalAlpha = 0.45;
        line(-12, 2, "#8ab4ff", 3);
        ctx.globalAlpha = 1;
        line(-7, 5, "#d8e6ff", 1.4);
      } else {
        if (ec) {
          ctx.globalAlpha = 0.45;
          line(-12, 3, ec, 3.2);
          ctx.globalAlpha = 1;
        }
        line(-7, 4, "#b08a5a", 1.2);
        line(4, 6.5, ec ?? "#d8dde6", 2);
        line(-8, -5.5, "#c84a32", 1.8);
      }
    } else if (q.kind === "bolt") {
      // Lightning Bolt javelin: a crackling streak
      ctx.globalAlpha = 0.5;
      line(-16, 6, "#7aa0ff", 4);
      ctx.globalAlpha = 1;
      for (let i = -14; i < 6; i += 4) {
        const j = ((Math.floor(q.t * 40) + i) % 3) - 1;
        ctx.strokeStyle = "#f0f4ff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + dx * i - dy * j * 2, y + dy * i + dx * j * 2);
        ctx.lineTo(x + dx * (i + 4) + dy * j * 2, y + dy * (i + 4) - dx * j * 2);
        ctx.stroke();
      }
    } else if (q.kind === "cbolt") {
      ctx.fillStyle = "rgba(140,170,255,0.5)";
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4f6ff";
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    } else if (q.cls === "javelin") {
      if (ec) {
        ctx.globalAlpha = 0.5;
        line(-11, 9, ec, 3.4);
        ctx.globalAlpha = 1;
      }
      line(-9, 5, "#a8743e", 1.6);
      line(5, 9, "#d8dde6", 2.4);
      line(-9, -6, "#5a3a1e", 2);
    } else if (q.cls === "throwing_axe") {
      const a = q.t * 22;
      [dx, dy] = [Math.cos(a), Math.sin(a) * 0.7];
      line(-4, 4, "#7a5230", 1.8);
      ctx.fillStyle = "#c9ced8";
      ctx.beginPath();
      ctx.arc(x + dx * 4, y + dy * 4, 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // knife: a glinting streak
      ctx.globalAlpha = 0.35;
      line(-10, -3, "#e8eef8", 1);
      ctx.globalAlpha = 1;
      line(-3, 0, "#5a3a1e", 1.8);
      line(0, 4, "#e8eef8", 1.8);
    }
    ctx.restore();
  }

  /** Which animation + frame the player shows right now. */
  /** v0.9.2: HUD boxes (menu buttons, buffs, minimap) the boss bar must not cover, in canvas CSS pixels. */
  hudAvoid: () => { left: number; top: number; right: number; bottom: number }[] = () => [];
  /** Top of the boss bar: top center, pushed down below any HUD box it would overlap. */
  bossBarY(x: number, w: number): number {
    const H = 22;
    let y = 10;
    const boxes = this.hudAvoid().filter((r) => r.right > r.left && r.bottom > r.top);
    for (let pass = 0; pass < 3; pass++)
      for (const r of boxes)
        if (x - 6 < r.right && x + w + 6 > r.left && y - 4 < r.bottom && y + H + 4 > r.top) y = r.bottom + 6;
    this.lastBossBar = { x: x - 2, y: y - 2, w: w + 4, h: H };
    return y;
  }
  lastBossBar: { x: number; y: number; w: number; h: number } | null = null;

  playerAnim(game: Game): { anim: Anim; f: number } {
    const p = game.player;
    const a = p.action;
    if (p.dead) return { anim: "death", f: Math.min(5, Math.floor((game.time - this.playerDeadAt) / 0.1)) };
    if (a?.type === "swing") {
      let prog = a.t / a.dur;
      let hand = a.hands[0] ?? 0;
      if (a.hands.length > 1) {
        const half = prog < 0.5 ? 0 : 1;
        hand = a.hands[half];
        prog = (prog * 2) % 1;
        // a two-hit with the same hand alternates the swing animation so both hits read clearly
        if (a.hands[0] === a.hands[1] && half === 1) return { anim: "atk1", f: Math.min(5, Math.floor(prog * 6)) };
      }
      return { anim: hand === 1 ? "atk1" : "atk0", f: Math.min(5, Math.floor(prog * 6)) };
    }
    if (a?.type === "throw") {
      let prog = a.t / a.dur;
      let hand = a.hands[0] ?? 0;
      if (a.hands.length > 1) {
        hand = prog < 0.5 ? a.hands[0] : a.hands[1];
        prog = (prog * 2) % 1;
      }
      return { anim: hand === 1 ? "thr1" : "thr0", f: Math.min(5, Math.floor(prog * 6)) };
    }
    if (a?.type === "shoot") {
      const prog = a.t / a.dur;
      // Strafe: one draw-and-release cycle per arrow
      const n = a.releaseAt.length;
      const local = n > 1 ? Math.min(0.999, (prog * n) % 1) : prog;
      return { anim: "shoot", f: Math.min(5, Math.floor(local * 6)) };
    }
    if (a?.type === "whirl") return { anim: a.hand % 2 ? "atk1" : "atk0", f: 3 }; // blade held out while spinning
    if (a?.type === "leap") return { anim: "leap", f: Math.min(2, Math.floor((a.t / a.dur) * 3)) };
    if (game.recall) return { anim: "cry", f: Math.min(3, Math.floor((game.recall.t / game.recall.dur) * 6)) };
    if (a?.type === "cry") return { anim: p.cls === "barbarian" ? "cry" : "cast", f: Math.min(3, Math.floor((a.t / a.dur) * 4)) };
    if (a?.type === "spell") return { anim: "cast", f: Math.min(3, Math.floor((a.t / a.dur) * 4)) };
    if (p.moving) return { anim: "walk", f: Math.floor((p.walkPhase / (Math.PI * 2)) * 8) };
    return { anim: "idle", f: Math.floor(game.time * 3) };
  }

  private drawPlayer(game: Game) {
    const p = game.player;
    const sx = this.ax(p.x, p.y);
    const sy0 = this.ay(p.x, p.y);
    const sy = this.ay(p.x, p.y, p.z);
    if (!p.dead) this.shadow(sx, sy0, 8);
    const look = this.playerLook(game);
    const { anim, f } = this.playerAnim(game);
    const fr = getFrame(heroModel(p.cls), look, lookKey(look), anim, dirOf(p.fx, p.fy), f, p.flash > 0.5);
    const rc = game.recall;
    if (rc) {
      // a portal forms behind you while you channel
      const k = Math.min(1, rc.t / rc.dur);
      this.drawPortal(this.ctx, p.x - 0.55, p.y - 0.55, game.time, 0.3 + 0.7 * k);
    }
    this.ctx.drawImage(fr.c, sx - fr.ax, sy - fr.ay);
    if (rc) {
      // blue sparks spiralling up
      for (let i = 0; i < 10; i++) {
        const a = game.time * 5 + i * 0.63;
        const h = ((game.time * 18 + i * 7) % 30);
        this.ctx.fillStyle = `rgba(140,200,255,${(0.9 - h / 34).toFixed(2)})`;
        this.ctx.fillRect(Math.round(sx + Math.cos(a) * 9), Math.round(sy0 - h + Math.sin(a) * 3), 1, 2);
      }
    }
    const ctx = this.ctx;
    // Whirlwind: blade arcs around the hero
    const a = p.action;
    if (a?.type === "whirl" && !p.dead) {
      for (let i = 0; i < 4; i++) {
        const ang = a.spin - i * 0.45;
        ctx.strokeStyle = `rgba(240,240,255,${(0.95 - i * 0.22).toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(sx, sy0 - 12, 24, 11, 0, ang, ang + 1.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(sx, sy0 - 12, 24, 11, 0, ang + Math.PI, ang + Math.PI + 1.4);
        ctx.stroke();
      }
      // dust kicked up
      for (let i = 0; i < 6; i++) {
        const t = a.spin * 1.3 + i;
        ctx.fillStyle = "rgba(200,170,120,0.6)";
        ctx.fillRect(Math.round(sx + Math.cos(t) * 18), Math.round(sy0 + Math.sin(t) * 6), 1, 1);
      }
      ctx.strokeStyle = "rgba(255,200,120,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sx, sy0, 22, 11, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // buff auras: Concentrate (blue), Berserk (red-violet), shouts (gold motes)
    if (!p.dead) {
      if (p.buffs.conc > 0) {
        ctx.strokeStyle = "rgba(120,170,255,0.55)";
        ctx.beginPath();
        ctx.ellipse(sx, sy0, 10, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (p.buffs.bers > 0) {
        ctx.fillStyle = "rgba(200,40,120,0.22)";
        ctx.beginPath();
        ctx.ellipse(sx, sy - 14, 9, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const shouts = (p.buffs.shout > 0 ? 1 : 0) + (p.buffs.bo > 0 ? 1 : 0) + (p.buffs.bcmd > 0 ? 1 : 0);
      for (let i = 0; i < shouts * 2; i++) {
        const t = game.time * 1.6 + i * (Math.PI / shouts);
        ctx.fillStyle = i % 2 ? "rgba(255,220,130,0.8)" : "rgba(255,180,80,0.7)";
        ctx.fillRect(Math.round(sx + Math.cos(t) * 11), Math.round(sy0 - 4 - ((game.time * 14 + i * 9) % 26)), 1, 1);
      }
    }
    // frenzy glow under the feet
    if (p.frenzy.stacks > 0 && !p.dead) {
      this.ctx.fillStyle = `rgba(255,90,40,${0.12 + p.frenzy.stacks * 0.05})`;
      this.ctx.fillRect(sx - 6, sy0 - 1, 12, 2);
    }
  }

  /** v1.6: one Sorceress spell entity */
  private drawSpell(sp: Spell, t: number) {
    const ctx = this.ctx;
    ctx.save();
    const glow = (x: number, y: number, r: number, inner: string, outer: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, inner);
      g.addColorStop(1, outer);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    switch (sp.k) {
      case "missile": {
        const x = this.ax(sp.x, sp.y);
        const y = this.ay(sp.x, sp.y, 0.6);
        const dx = (sp.vx - sp.vy) * HW;
        const dy = (sp.vx + sp.vy) * HH;
        const l = Math.hypot(dx, dy) || 1;
        const ux = dx / l;
        const uy = dy / l;
        const sz = sp.size;
        if (sp.orb) {
          // Frozen Orb: a big pale sphere with a spinning ring
          glow(x, y, 9, "rgba(230,245,255,0.95)", "rgba(120,190,255,0)");
          ctx.strokeStyle = "rgba(200,235,255,0.9)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(x, y, 6, 3, t * 6, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        const col = sp.elem === "fire" ? ["rgba(255,240,170,1)", "rgba(255,120,30,0)", "#ff8a2a"] : sp.elem === "cold" ? ["rgba(235,250,255,1)", "rgba(110,190,255,0)", "#9ad8ff"] : sp.id === "telekinesis" ? ["rgba(240,230,255,1)", "rgba(170,140,255,0)", "#c8b8ff"] : ["rgba(255,255,230,1)", "rgba(230,230,90,0)", "#fff070"];
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = col[2];
        ctx.lineWidth = 2.4 * sz;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x - ux * 9 * sz, y - uy * 9 * sz);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        glow(x, y, 4.5 * sz, col[0], col[1]);
        if (sp.elem === "light" && sp.id !== "telekinesis") {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1;
          ctx.beginPath();
          const j = (Math.floor(t * 30) % 3) - 1;
          ctx.moveTo(x - 3, y + j);
          ctx.lineTo(x, y - 2);
          ctx.lineTo(x + 3, y - j);
          ctx.stroke();
        }
        break;
      }
      case "meteor": {
        const k = Math.min(1, sp.t / sp.delay);
        const gx = this.ax(sp.x, sp.y);
        const gy = this.ay(sp.x, sp.y);
        ctx.strokeStyle = `rgba(255,120,40,${(0.35 + 0.5 * k).toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(gx, gy, 2 * HW * 1.41 * k, HW * 1.41 * k, 0, 0, Math.PI * 2);
        ctx.stroke();
        const h = (1 - k) * 120;
        const mx = gx + (1 - k) * 50;
        const my = gy - h;
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = "#ff8a2a";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(mx + 18, my - 40);
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.globalAlpha = 1;
        glow(mx, my, 9, "rgba(255,250,200,1)", "rgba(255,100,20,0)");
        break;
      }
      case "blizzard": {
        const cx = this.ax(sp.x, sp.y);
        const cy = this.ay(sp.x, sp.y);
        const k = Math.min(1, (sp.life - sp.t) / 0.4, sp.t / 0.2);
        const rx = sp.r * HW * 1.41;
        ctx.fillStyle = `rgba(150,200,255,${(0.16 * k).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, rx * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // falling ice shards
        for (let i = 0; i < 26; i++) {
          const a = i * 2.39996;
          const rr = Math.sqrt(((i * 7) % 26 + 0.5) / 26) * rx;
          const ph = (t * 1.6 + i * 0.137) % 1;
          const px = cx + Math.cos(a) * rr - (1 - ph) * 10;
          const py = cy + Math.sin(a) * rr * 0.5 - (1 - ph) * 44;
          ctx.strokeStyle = `rgba(220,240,255,${(0.9 * k).toFixed(2)})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(px - 3, py - 8);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
        break;
      }
      case "hydra": {
        const x = this.ax(sp.x, sp.y);
        const y = this.ay(sp.x, sp.y);
        const k = Math.min(1, sp.t / 0.3, (sp.life - sp.t) / 0.3);
        ctx.globalAlpha = Math.max(0, k);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(x, y, 8, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#6a2a14";
        ctx.beginPath();
        ctx.ellipse(x, y - 1, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        const hx = (sp.fx - sp.fy) * 4;
        const hy = (sp.fx + sp.fy) * 2;
        for (const o of [-4, 0, 4]) {
          const bob = Math.sin(t * 6 + o) * 1.2;
          const tx = x + o + hx;
          const ty = y - 13 + bob + hy - Math.abs(o) * 0.3;
          ctx.strokeStyle = "#a0401c";
          ctx.lineWidth = 2.6;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x + o * 0.5, y - 1);
          ctx.quadraticCurveTo(x + o * 1.4, y - 8, tx, ty);
          ctx.stroke();
          ctx.fillStyle = "#c85a24";
          ctx.beginPath();
          ctx.ellipse(tx, ty, 2.6, 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffe14a";
          ctx.fillRect(Math.round(tx + hx * 0.2), Math.round(ty - 1), 1, 1);
        }
        ctx.globalAlpha = 1;
        break;
      }
      case "wall": {
        const k = Math.min(1, (sp.life - sp.t) / 0.4, sp.t / 0.15);
        const n = Math.max(2, Math.round(Math.hypot(sp.x2 - sp.x1, sp.y2 - sp.y1) * 3));
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const wx = sp.x1 + (sp.x2 - sp.x1) * u;
          const wy = sp.y1 + (sp.y2 - sp.y1) * u;
          const x = this.ax(wx, wy);
          const y = this.ay(wx, wy);
          const h = 9 + ((t * 30 + i * 7) % 7);
          ctx.globalAlpha = 0.85 * k;
          ctx.fillStyle = "#ff6a1a";
          ctx.beginPath();
          ctx.moveTo(x - 3.5, y);
          ctx.quadraticCurveTo(x - 1, y - h * 0.6, x + Math.sin(t * 9 + i) * 1.5, y - h);
          ctx.quadraticCurveTo(x + 1, y - h * 0.6, x + 3.5, y);
          ctx.fill();
          ctx.fillStyle = "#ffe08a";
          ctx.fillRect(Math.round(x - 1), Math.round(y - h * 0.45), 2, Math.round(h * 0.4));
        }
        ctx.globalAlpha = 1;
        break;
      }
      case "cone": {
        const k = 1 - sp.t / sp.life;
        const x = this.ax(sp.x, sp.y);
        const y = this.ay(sp.x, sp.y, 0.5);
        for (let i = 0; i < 22; i++) {
          const a = sp.ang + (((i * 37) % 11) / 10 - 0.5) * 0.9;
          const d = (0.3 + (((i * 53) % 17) / 16) * 0.7) * sp.range * (0.5 + 0.5 * (sp.t / sp.life + 0.3));
          const wx = Math.cos(a) * d;
          const wy = Math.sin(a) * d;
          const px = x + (wx - wy) * HW;
          const py = y + (wx + wy) * HH;
          glow(px, py, 4 + (i % 3), `rgba(255,${180 + (i % 4) * 15},80,${(0.9 * k).toFixed(2)})`, "rgba(255,90,20,0)");
        }
        break;
      }
      case "strike": {
        const k = 1 - sp.t / sp.life;
        const x = this.ax(sp.x, sp.y);
        const y = this.ay(sp.x, sp.y);
        for (const [w, c] of [[4, `rgba(140,170,255,${(0.45 * k).toFixed(2)})`], [1.4, `rgba(255,255,255,${k.toFixed(2)})`]] as const) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(x + 6, y - 110);
          for (let i = 1; i <= 8; i++) ctx.lineTo(x + ((i * 29 + Math.floor(sp.t * 40)) % 9) - 4 + (8 - i) * 0.7, y - 110 + i * 13.75);
          ctx.stroke();
        }
        glow(x, y, 10 * k, "rgba(255,255,230,0.9)", "rgba(200,200,255,0)");
        break;
      }
      case "blink": {
        const k = 1 - sp.t / sp.life;
        const x = this.ax(sp.x, sp.y);
        const y = this.ay(sp.x, sp.y);
        ctx.strokeStyle = `rgba(190,200,255,${k.toFixed(2)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(x, y, 10 * (1.3 - k), 5 * (1.3 - k), 0, 0, Math.PI * 2);
        ctx.stroke();
        glow(x, y - 12, 12 * k, "rgba(220,225,255,0.8)", "rgba(160,170,255,0)");
        break;
      }
    }
    ctx.restore();
  }

  /** v1.0: Immolation fire / poison cloud on the ground. */
  private drawPatch(pa: Game["patches"][number], t: number) {
    const ctx = this.ctx;
    const k = Math.min(1, (pa.life - pa.t) / 0.5, pa.t / 0.2);
    if (k <= 0) return;
    const cx = this.ax(pa.x, pa.y);
    const cy = this.ay(pa.x, pa.y);
    const rx = pa.r * HW * 1.41;
    const fire = pa.elem === "fire";
    ctx.fillStyle = fire ? `rgba(255,110,30,${(0.18 * k).toFixed(2)})` : `rgba(110,200,60,${(0.2 * k).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, rx * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const n = Math.round(pa.r * 9);
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996;
      const rr = Math.sqrt((i + 0.5) / n) * rx;
      const h = fire ? ((t * 22 + i * 5) % 9) : ((t * 6 + i * 3) % 6);
      ctx.fillStyle = fire ? (i % 3 ? `rgba(255,170,60,${(0.85 * k).toFixed(2)})` : `rgba(255,240,160,${(0.9 * k).toFixed(2)})`) : `rgba(150,230,90,${(0.6 * k).toFixed(2)})`;
      ctx.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr * 0.5 - h), 1, fire ? 2 : 1);
    }
  }

  /** v1.0: Decoy (a shimmering copy of the hero) and the Valkyrie (a pale spearmaiden). */
  private drawAlly(game: Game, al: Ally) {
    const ctx = this.ctx;
    const sx = this.ax(al.x, al.y);
    const sy = this.ay(al.x, al.y);
    this.shadow(sx, sy, 8);
    const look: Look = al.kind === "decoy" ? this.playerLook(game) : { main: "pike", head: "full_helm", chest: "scale_mail", gloves: "chain_gloves", boots: "chain_boots" };
    let anim: Anim = "idle";
    let f = Math.floor(game.time * 3);
    if (al.swingT > 0) {
      anim = "atk0";
      f = Math.min(5, Math.floor((1 - al.swingT / 0.4) * 6));
    } else if (al.moving) {
      anim = "walk";
      f = Math.floor((al.walkPhase / (Math.PI * 2)) * 8);
    }
    const fr = getFrame("amazon", look, lookKey(look), anim, dirOf(al.fx, al.fy), f);
    ctx.globalAlpha = al.kind === "decoy" ? 0.55 + 0.15 * Math.sin(game.time * 6) : 0.9;
    ctx.drawImage(fr.c, sx - fr.ax, sy - fr.ay);
    if (al.kind === "valkyrie") {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#bcd8ff";
      ctx.fillRect(sx - Math.round(fr.c.width * 0.2), sy - fr.ay + 4, Math.round(fr.c.width * 0.4), fr.ay - 4);
    }
    ctx.globalAlpha = 1;
    // life bar
    const top = sy - Math.round(spriteTop("amazon") * 1.6);
    ctx.fillStyle = "#000";
    ctx.fillRect(sx - 9, top - 1, 18, 4);
    ctx.fillStyle = al.kind === "valkyrie" ? "#8ab4ff" : "#e8d8b0";
    ctx.fillRect(sx - 8, top, Math.max(0, Math.round(16 * (al.hp / al.maxHp))), 2);
  }

  /** v1.3: the camp training dummy: a straw sack on a post with a painted target; it wobbles when hit. */
  private drawDummy(m: Monster) {
    const c = this.ctx;
    const sx = this.ax(m.x, m.y);
    const sy = this.ay(m.x, m.y);
    this.shadow(sx, sy, 10);
    const w = m.flash > 0 ? Math.sin(m.flash * 18) * 2 * m.flash : 0;
    c.save();
    c.translate(sx, sy);
    // post and base
    c.fillStyle = "#4a3020";
    c.fillRect(-6, -2, 12, 3);
    c.fillStyle = "#6a4a2a";
    c.fillRect(-1, -34, 3, 33);
    c.translate(w, 0);
    // arms (a cross bar)
    c.fillStyle = "#7a5632";
    c.fillRect(-11, -27, 22, 3);
    // straw body
    c.fillStyle = "#c8a060";
    c.fillRect(-6, -30, 13, 18);
    c.fillStyle = "#a8803e";
    for (let i = -5; i < 7; i += 3) c.fillRect(i, -30, 1, 18);
    c.fillStyle = "#8a6a3a";
    c.fillRect(-6, -21, 13, 2); // rope
    // target on the chest
    c.fillStyle = "#e8e0d0";
    c.fillRect(-3, -27, 7, 6);
    c.fillStyle = "#c8281c";
    c.fillRect(-2, -26, 5, 4);
    c.fillStyle = "#e8e0d0";
    c.fillRect(0, -25, 1, 2);
    // sack head
    c.fillStyle = "#d8b878";
    c.fillRect(-4, -38, 9, 8);
    c.fillStyle = "#5a4024";
    c.fillRect(-2, -35, 1, 1);
    c.fillRect(2, -35, 1, 1);
    if (m.flash > 0.5) {
      c.globalAlpha = (m.flash - 0.5) * 1.2;
      c.fillStyle = "#fff";
      c.fillRect(-6, -38, 13, 26);
    }
    c.restore();
  }

  private drawMonster(m: Monster) {
    if (m.dummy) return this.drawDummy(m);
    const model = m.def.species;
    const sx = this.ax(m.x, m.y);
    const sy = this.ay(m.x, m.y);
    let anim: Anim = "idle";
    let f = 0;
    if (m.state === "dead") {
      anim = "death";
      f = Math.min(5, Math.floor(m.deadT / 0.09));
    } else if (m.state === "attack") {
      anim = "atk0";
      const w = 1 - Math.max(0, m.windT) / m.def.windup;
      f = Math.min(3, Math.floor(w * 4));
    } else if (m.atkT > m.def.atkInterval - 0.25 && m.atkT > 0) {
      anim = "atk0";
      f = 4 + Math.min(1, Math.floor((m.def.atkInterval - m.atkT) / 0.12));
    } else if (m.state === "chase" || m.fearT > 0 || (m.state === "idle" && Math.hypot(m.wx - m.x, m.wy - m.y) > 0.3)) {
      anim = "walk";
      f = Math.floor((m.walkPhase / (Math.PI * 2)) * FRAMES.walk);
    } else {
      anim = "idle";
      f = Math.floor((m.walkPhase + m.id) * 0.5);
    }
    if (m.state !== "dead") this.shadow(sx, sy, Math.round(m.def.radius * 26));
    if (m.elite && m.state !== "dead") {
      // champion (blue) or unique (gold) glow ring at its feet
      const c = this.ctx;
      const rx = Math.round(m.def.radius * 30) + 2;
      c.globalAlpha = 0.55 + 0.25 * Math.sin(m.walkPhase * 0.5 + m.id);
      c.strokeStyle = m.elite === 2 ? "#ffb43a" : "#5a8cff";
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(sx, sy, rx, rx / 2, 0, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    }
    const fr0 = getFrame(model, {}, "", anim, dirOf(m.fx, m.fy), f, m.flash > 0.4 && m.state !== "dead");
    const fr = m.def.tint && !(m.flash > 0.4 && m.state !== "dead") ? { ...fr0, c: tinted(fr0.c, m.def.tint) } : fr0;
    const ctx = this.ctx;
    if (m.state === "dead" && m.searched) ctx.globalAlpha = 0.75;
    ctx.drawImage(fr.c, sx - fr.ax, sy - fr.ay);
    ctx.globalAlpha = 1;
    if (m.state === "dead") return;
    const top = sy - fr.ay;
    // Taunt: a red mark over the head; Battle Cry: violet haze; stun: circling stars; Grim Ward fear: green wisps
    if (m.taunt.t > 0) {
      ctx.fillStyle = "#ff4a3a";
      ctx.fillRect(sx - 1, top - 7, 2, 4);
      ctx.fillRect(sx - 1, top - 2, 2, 1);
    }
    if (m.bcry.t > 0) {
      ctx.fillStyle = "rgba(170,80,255,0.18)";
      ctx.beginPath();
      ctx.ellipse(sx, sy - (fr.ay >> 1), Math.max(6, fr.c.width >> 2), fr.ay >> 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if ((m.frozenT ?? 0) > 0 || (m.chillT ?? 0) > 0) {
      // v1.0 cold: frozen solid (icy block) or chilled (blue tint)
      const frozen = (m.frozenT ?? 0) > 0;
      ctx.fillStyle = frozen ? "rgba(170,220,255,0.45)" : "rgba(110,170,255,0.22)";
      ctx.fillRect(sx - Math.round(fr.c.width * 0.22), top + 3, Math.round(fr.c.width * 0.44), fr.ay - 3);
    }
    if (m.sight && m.sight.t > 0) {
      ctx.strokeStyle = "rgba(255,240,170,0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sx, top - 4, 3, 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (m.stunT > 0) {
      for (let i = 0; i < 3; i++) {
        const t = performance.now() / 180 + i * 2.09;
        ctx.fillStyle = "#ffe680";
        ctx.fillRect(Math.round(sx + Math.cos(t) * 6), Math.round(top - 2 + Math.sin(t) * 2), 1, 1);
      }
    }
    if (m.flee && m.fearT > 0) {
      ctx.fillStyle = "rgba(150,255,150,0.7)";
      ctx.fillRect(sx - 4, top - 3 - ((performance.now() / 60) % 5), 1, 1);
      ctx.fillRect(sx + 3, top - 3 - ((performance.now() / 70 + 2) % 5), 1, 1);
    }
  }

  /** Grim Ward: a bone totem with a skull, and a faint ring where monsters won't go. */
  private drawWard(w: { x: number; y: number; t: number; life: number; radius: number }, time: number) {
    const ctx = this.ctx;
    const sx = this.ax(w.x, w.y);
    const sy = this.ay(w.x, w.y);
    const fade = Math.min(1, (w.life - w.t) / 1.5, w.t / 0.3);
    ctx.globalAlpha = 0.25 * fade;
    ctx.strokeStyle = "#8aff8a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const rx = w.radius * HW * 1.41;
    ctx.ellipse(sx, sy, rx, rx / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = fade;
    this.shadow(sx, sy, 5);
    ctx.fillStyle = "#6b5a44";
    ctx.fillRect(sx - 1, sy - 20, 3, 20); // pole
    ctx.fillStyle = "#d8d0bc";
    ctx.fillRect(sx - 5, sy - 6, 4, 2); // bones at the foot
    ctx.fillRect(sx + 2, sy - 4, 4, 2);
    ctx.fillRect(sx - 3, sy - 26, 7, 6); // skull
    ctx.fillRect(sx - 2, sy - 20, 5, 2);
    const glow = 0.6 + 0.4 * Math.sin(time * 4);
    ctx.fillStyle = `rgba(120,255,120,${glow.toFixed(2)})`;
    ctx.fillRect(sx - 2, sy - 24, 1, 1);
    ctx.fillRect(sx + 2, sy - 24, 1, 1);
    ctx.globalAlpha = 1;
  }

  /** Monster arrows, bolts and spit. */
  private drawShot(q: MonsterShot) {
    const ctx = this.ctx;
    const x = this.ax(q.x, q.y);
    const y = this.ay(q.x, q.y, 0.9);
    const l = Math.hypot(q.vx, q.vy) || 1;
    // direction on screen
    const dx = (q.vx - q.vy) / l;
    const dy = (q.vx + q.vy) / l / 2;
    if (q.look === "arrow") {
      ctx.fillStyle = "#6a4a2a";
      for (let i = 0; i < 7; i++) ctx.fillRect(Math.round(x - dx * i), Math.round(y - dy * i), 1, 1);
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(x), Math.round(y) - 1, 2, 2);
      return;
    }
    const r = q.look === "spit" ? 2 : q.big ? 3 : 2;
    ctx.fillStyle = q.color;
    for (let i = 1; i < 5; i++) {
      ctx.globalAlpha = 0.5 - i * 0.1;
      ctx.fillRect(Math.round(x - dx * i * 2.5) - 1, Math.round(y - dy * i * 2.5) - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillRect(Math.round(x) - r, Math.round(y) - r + 1, r * 2, r * 2 - 1);
    ctx.fillRect(Math.round(x) - r + 1, Math.round(y) - r, r * 2 - 2, r * 2 + 1);
    ctx.fillStyle = q.look === "spit" ? "#e0ff90" : "#fff6d0";
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
  }

  /** Telegraphed burst: a pulsing ring that fills in, then flashes. */
  private drawNova(n: Nova, t: number) {
    const ctx = this.ctx;
    const cx = this.ax(n.x, n.y);
    const cy = this.ay(n.x, n.y);
    const rx = n.radius * HW * 1.41;
    const col = ELEM_COLOR[n.elem];
    const k = Math.min(1, n.t / n.warn);
    ctx.fillStyle = col;
    if (!n.done) {
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 20);
      const m = Math.max(24, Math.round(rx * 1.6));
      for (let j = 0; j < m; j++) {
        const a = (j / m) * Math.PI * 2;
        ctx.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * rx * 0.5), 2, 1);
      }
      ctx.globalAlpha = 0.12 + 0.18 * k;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * k, rx * k * 0.5, 0, 0, 7);
      ctx.fill();
    } else {
      ctx.globalAlpha = Math.max(0, 0.55 - (n.t - n.warn));
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, rx * 0.5, 0, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** An act artifact on the ground: orange beam and its icon. */
  private drawArtifact(g: GroundItem, t: number) {
    const ctx = this.ctx;
    const bx = this.ax(g.x, g.y);
    const by = this.ay(g.x, g.y);
    const pulse = 0.75 + 0.25 * Math.sin(t * 3);
    const H = 48;
    for (let k = 0; k < H; k++) {
      const a = (1 - k / H) * 0.6 * pulse;
      ctx.fillStyle = `rgba(255,150,40,${a.toFixed(3)})`;
      ctx.fillRect(bx - 2, by - k, 5, 1);
      ctx.fillStyle = `rgba(255,150,40,${(a * 0.35).toFixed(3)})`;
      ctx.fillRect(bx - 5, by - k, 3, 1);
      ctx.fillRect(bx + 3, by - k, 3, 1);
    }
    const ic = artifactIcon(g.artifact!);
    const bob = Math.round(Math.sin(t * 2.5) * 1.5);
    ctx.drawImage(ic, bx - 10, by - 24 + bob);
  }

  /** v1.4: Brann the Runesmith: a burly smith in mail with a hammer, by a small anvil */
  private drawCrafter(game: Game) {
    const v = game.level.crafter!;
    const p = game.player;
    const ctx = this.ctx;
    const sx = this.ax(v.x, v.y);
    const sy = this.ay(v.x, v.y);
    this.shadow(sx, sy, 7);
    // anvil in front of him
    const axx = this.ax(v.x + 0.55, v.y + 0.35);
    const ayy = this.ay(v.x + 0.55, v.y + 0.35);
    ctx.fillStyle = "#2a2a30";
    ctx.fillRect(axx - 5, ayy - 4, 10, 4);
    ctx.fillStyle = "#4a4a54";
    ctx.fillRect(axx - 7, ayy - 8, 14, 4);
    ctx.fillStyle = "#6a6a76";
    ctx.fillRect(axx - 7, ayy - 8, 14, 1);
    if (Math.floor(game.time * 1.3) % 3 === 0 && (game.time * 1.3) % 1 < 0.15) {
      ctx.fillStyle = "#ffd27a";
      for (let i = 0; i < 3; i++) ctx.fillRect(axx - 2 + i * 2, ayy - 11 - i, 1, 1);
    }
    const near = Math.hypot(p.x - v.x, p.y - v.y) < 6;
    const dir = near ? dirOf(p.x - v.x, p.y - v.y) : 2;
    const fr = getFrame("barb", CRAFTER_LOOK, lookKey(CRAFTER_LOOK), "idle", dir, Math.floor(game.time * 2.5));
    ctx.drawImage(fr.c, sx - fr.ax, sy - fr.ay);
  }

  hitCrafter(game: Game, x: number, y: number): boolean {
    const v = game.level.crafter;
    if (!v) return false;
    const cx = this.cx(v.x, v.y);
    const cy = this.cy(v.x, v.y) - 18 * this.ascale;
    return Math.abs(x - cx) < 14 * this.ascale && Math.abs(y - cy) < 26 * this.ascale;
  }

  private drawVendor(game: Game) {
    const v = game.level.vendor!;
    const p = game.player;
    const sx = this.ax(v.x, v.y);
    const sy = this.ay(v.x, v.y);
    this.shadow(sx, sy, 6);
    const near = Math.hypot(p.x - v.x, p.y - v.y) < 6;
    const dir = near ? dirOf(p.x - v.x, p.y - v.y) : 2;
    const fr = getFrame("vendor", {}, "", "idle", dir, Math.floor(game.time * 2.5));
    this.ctx.drawImage(fr.c, sx - fr.ax, sy - fr.ay);
  }

  // -------------------------------------------------------------- labels / hit tests (CSS px)
  /** Item labels (when shown); artifact labels always. */
  /** v1.3: the training dummy's name and DPS meter (rolling DPS, total, hits; the last session's numbers stay up). */
  private drawDummyMeter(game: Game) {
    const m = game.monsters.find((q) => q.dummy);
    if (!m) return;
    const p = game.player;
    if (Math.hypot(m.x - p.x, m.y - p.y) > 16) return;
    const f = this.fctx;
    const x = this.cx(m.x, m.y);
    let y = this.cy(m.x, m.y) - 46 * this.ascale;
    const mt = game.dummyMeter();
    f.textAlign = "center";
    f.lineWidth = 3;
    f.strokeStyle = "rgba(0,0,0,.85)";
    const text = (s: string, font: string, color: string) => {
      f.font = font;
      f.strokeText(s, x, y);
      f.fillStyle = color;
      f.fillText(s, x, y);
    };
    const y0 = y;
    y = mt ? y0 - 30 * Math.min(1, this.ascale / 2.2) - 4 : y0;
    text("Training Dummy", "bold 11px Georgia, 'Times New Roman', serif", "#d8c8a0");
    if (!mt) return;
    y = y0 - 14 * Math.min(1, this.ascale / 2.2);
    text(`${mt.done ? "Last: " : ""}DPS ${fmtDps(mt.done ? mt.avg : mt.dps)}`, "bold 15px Georgia, 'Times New Roman', serif", mt.done ? "#c8b88a" : "#ffe08a");
    y = y0;
    text(`${mt.total.toLocaleString("en-US")} damage · ${mt.hits} hits · ${mt.secs.toFixed(1)}s`, "bold 10px system-ui, sans-serif", "#e8dcc0");
  }

  /** Names (and modifiers) over champions and uniques near the hero. */
  private drawEliteNames(game: Game) {
    const f = this.fctx;
    const p = game.player;
    f.textAlign = "center";
    for (const m of game.monsters) {
      if (!m.elite || m.state === "dead" || Math.hypot(m.x - p.x, m.y - p.y) > 9) continue;
      if (m.state === "idle" && m.hp >= m.maxHp && m.elite === 1) continue;
      const x = this.cx(m.x, m.y);
      const y = this.cy(m.x, m.y) - (spriteTop(m.def.species) * 1.6 + 6) * this.ascale;
      const name = m.elite === 2 ? m.def.name : m.def.name.replace(/^Champion /, "");
      f.font = "bold 11px Georgia, 'Times New Roman', serif";
      f.lineWidth = 3;
      f.strokeStyle = "rgba(0,0,0,.85)";
      f.strokeText(name, x, y);
      f.fillStyle = m.elite === 2 ? "#ffc65a" : "#7fa2ff";
      f.fillText(name, x, y);
      if (m.mods.length) {
        const mods = m.mods.map((k) => ELITE_MODS[k]).join(" · ");
        f.font = "10px Georgia, 'Times New Roman', serif";
        f.strokeText(mods, x, y + 11);
        f.fillStyle = "#d8d0c0";
        f.fillText(mods, x, y + 11);
      }
    }
  }

  private drawLabels(game: Game, show: boolean) {
    const f = this.fctx;
    const fs = 12;
    f.font = `${fs}px Georgia, 'Times New Roman', serif`;
    f.textAlign = "center";
    const placed: LabelHit[] = [];
    const p = game.player;
    const items = [...game.ground].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    for (const g of items) {
      if (Math.hypot(g.x - p.x, g.y - p.y) > 11) continue;
      const art = g.artifact ? ARTIFACT_BY_ID[g.artifact] : null;
      if (!art && !show) continue;
      if (!art && (!g.item || BASE_BY_ID[g.item.baseId].kind === "potion")) continue; // gold and potions: walk over them
      const text = art ? art.name : itemName(g.item!);
      const color = art ? ARTIFACT_COLOR : QUALITY_COLOR[qualityOf(g.item!)];
      const usable = art ? true : game.meetsReq(g.item!);
      const w = f.measureText(text).width + 12;
      const h = 18;
      const x = this.cx(g.x, g.y) - w / 2;
      let y = this.cy(g.x, g.y) - (art ? 28 : 6) * this.ascale - h;
      for (let tries = 0; tries < 6; tries++) {
        const hit = placed.find((o) => x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y);
        if (!hit) break;
        y = hit.y - h - 2;
      }
      if (x + w < 0 || x > this.W || y + h < 0 || y > this.H) continue;
      f.fillStyle = "rgba(0,0,0,.62)";
      f.fillRect(x, y, w, h);
      f.strokeStyle = usable ? "rgba(255,255,255,.18)" : "rgba(255,90,70,.8)";
      f.lineWidth = 1;
      f.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      f.fillStyle = color;
      f.fillText(text, x + w / 2, y + h * 0.72);
      const hit: LabelHit = { g, x, y, w, h, color };
      placed.push(hit);
      this.labels.push(hit);
    }
  }

  /** Find a ground item under a CSS-px point (label or sprite). */
  hitTest(game: Game, x: number, y: number): GroundItem | null {
    const pad = 8;
    for (const l of this.labels) if (x >= l.x - pad && x <= l.x + l.w + pad && y >= l.y - pad && y <= l.y + l.h + pad) return l.g;
    let best: GroundItem | null = null;
    let bd = 14 * this.ascale;
    for (const g of game.ground) {
      const d = Math.hypot(this.cx(g.x, g.y) - x, this.cy(g.x, g.y) - 2 * this.ascale - y);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    return best;
  }

  /** Is a CSS-px point on the trader? */
  hitStash(game: Game, x: number, y: number): boolean {
    const s = game.level.stash;
    if (!s) return false;
    const cx = this.cx(s.x, s.y);
    const cy = this.cy(s.x, s.y) - 8 * this.ascale;
    return Math.abs(x - cx) < 16 * this.ascale && Math.abs(y - cy) < 14 * this.ascale;
  }

  hitVendor(game: Game, x: number, y: number): boolean {
    const v = game.level.vendor;
    if (!v) return false;
    const cx = this.cx(v.x, v.y);
    const cy = this.cy(v.x, v.y) - 18 * this.ascale;
    return Math.abs(x - cx) < 14 * this.ascale && Math.abs(y - cy) < 26 * this.ascale;
  }

  // -------------------------------------------------------------- minimap
  private drawMinimap(game: Game) {
    const c = this.mini!;
    const g = c.getContext("2d")!;
    const L = game.level;
    const S = 2.4;
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    const p = game.player;
    const ox = W / 2 - (p.x - p.y) * S;
    const oy = H / 2 - (p.x + p.y) * S * 0.5;
    for (let y = 0; y < L.h; y++)
      for (let x = 0; x < L.w; x++) {
        const i = idx(x, y);
        if (!L.explored[i] || L.tiles[i] !== 1) continue;
        const edge = !isFloor(L, x - 1, y) || !isFloor(L, x + 1, y) || !isFloor(L, x, y - 1) || !isFloor(L, x, y + 1);
        g.fillStyle = edge ? "rgba(220,200,150,.85)" : "rgba(140,120,90,.35)";
        g.fillRect(ox + (x - y) * S, oy + (x + y) * S * 0.5, S + 0.6, S * 0.6 + 0.4);
      }
    const dot = (wx: number, wy: number, col: string, s: number) => {
      g.fillStyle = col;
      g.fillRect(ox + (wx - wy) * S - s / 2, oy + (wx + wy) * S * 0.5 - s / 2, s, s);
    };
    if (game.stairs) dot(game.stairs.x, game.stairs.y, "#ffb04a", 5);
    for (const gi of game.ground) if (gi.artifact) dot(gi.x, gi.y, ARTIFACT_COLOR, 5);
    if (game.waypointHere()) dot(L.waypoint.x, L.waypoint.y, "#5aa8ff", 5);
    if (L.vendor) dot(L.vendor.x, L.vendor.y, "#ffe08a", 4);
    if (L.crafter) dot(L.crafter.x, L.crafter.y, "#ffb46a", 4);
    for (const m of game.monsters) {
      if (m.state === "dead" || !L.explored[idx(Math.floor(m.x), Math.floor(m.y))]) continue;
      if (Math.hypot(m.x - p.x, m.y - p.y) > 9) continue;
      dot(m.x, m.y, m.dummy ? "#d8b070" : m.def.rank !== "normal" ? "#ff40ff" : "#ff3a2a", m.def.rank !== "normal" || m.dummy ? 4 : 3);
    }
    g.fillStyle = "#4aa0ff";
    g.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);
  }
}
