/**
 * Pixel-art renderer. The world is drawn on a low-resolution canvas (1 canvas px = 1 art px) and
 * scaled up with nearest-neighbour by CSS. Text (labels, damage numbers, boss name) is drawn on a
 * separate full-resolution overlay so it stays sharp.
 */
import { BASE_BY_ID, QUALITY_COLOR, itemName, lookOf, qualityOf } from "./data/items";
import { ARTIFACT_BY_ID, ARTIFACT_COLOR, type Theme, actDef } from "./data/acts";
import { ELEM_COLOR, ELITE_MODS } from "./data/monsters";
import type { Game, GroundItem, Monster, MonsterShot, Nova, Projectile } from "./game";
import { artifactIcon } from "./sprites/artifacts";
import { idx, isFloor } from "./map";
import { groundSprite, goldSprite } from "./sprites/items";
import { type Anim, FRAMES, type Look, dirOf, getFrame, lookKey, spriteTop } from "./sprites/puppet";
import * as T from "./sprites/tiles";

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
const ACT_ART = new Map<number, ActArt>();
function actArt(floor: number): ActArt {
  const a = actDef(floor);
  let r = ACT_ART.get(a.n);
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
    ACT_ART.set(a.n, r);
  }
  return r;
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
    {
      const wp = L.waypoint;
      const f = A.waypoint[fi(game.time * 5, 4)];
      ctx.drawImage(f, this.ax(wp.x - 0.5, wp.y - 0.5) - HW, this.ay(wp.x - 0.5, wp.y - 0.5));
    }
    if (game.portal && game.inTown) this.drawPortal(ctx, game.portal.x, game.portal.y, game.time, 1);
    // rings
    for (const rg of game.rings) {
      const kk = rg.t / rg.life;
      const rx = rg.radius * kk * HW * 1.41;
      ctx.fillStyle = `${rg.color}${(1 - kk).toFixed(2)})`;
      const cx = this.ax(rg.x, rg.y);
      const cy = this.ay(rg.x, rg.y);
      const n = Math.max(16, Math.round(rx * 1.5));
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2;
        ctx.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * rx * 0.5), 1, 1);
      }
    }
    // boss novas: a warning ring on the ground, then the burst
    for (const n of game.novas) this.drawNova(n, game.time);
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
    for (const m of game.monsters) {
      if (Math.abs(m.x - p.x) > R || Math.abs(m.y - p.y) > R) continue;
      // corpses lie flat, under everything standing
      list.push({ d: m.state === "dead" && m.deadT > 0.6 ? -1e6 + m.x + m.y : m.x + m.y, f: () => this.drawMonster(m) });
    }
    if (L.vendor) {
      const v = L.vendor;
      list.push({ d: v.x + v.y, f: () => this.drawVendor(game) });
    }
    list.push({ d: pD, f: () => this.drawPlayer(game) });
    for (const q of game.projectiles) list.push({ d: q.x + q.y + 0.3, f: () => this.drawProjectile(q) });
    for (const q of game.shots) list.push({ d: q.x + q.y + 0.3, f: () => this.drawShot(q) });
    list.sort((a, b) => a.d - b.d);
    for (const it of list) it.f();

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
      if (m.state === "dead" || m === game.boss) continue;
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

    if (game.boss && game.boss.state !== "dead" && game.boss.state !== "idle") {
      const b = game.boss;
      const w = Math.min(320, this.W * 0.4);
      const x = this.W / 2 - w / 2;
      const y = 12;
      f.fillStyle = "rgba(0,0,0,.75)";
      f.fillRect(x - 2, y - 2, w + 4, 22);
      f.fillStyle = b.def.rank === "final" ? "#a0400c" : "#7a1410";
      f.fillRect(x, y, w * (b.hp / b.maxHp), 18);
      f.font = "bold 13px Georgia, serif";
      f.textAlign = "center";
      f.fillStyle = b.def.rank === "final" ? "#ffcf7a" : "#e9d9a8";
      f.fillText(b.def.name, this.W / 2, y + 14);
    }
    const maxHp = game.derived().maxHp;
    if (p.flash > 0 || (p.hp / maxHp < 0.3 && !p.dead)) {
      const low = p.hp / maxHp < 0.3 ? 0.25 + Math.sin(game.time * 5) * 0.08 : 0;
      const a = Math.max(p.flash * 0.45, low);
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
    hole(L.waypoint.x, L.waypoint.y, 2.6, 0.7);
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
    glow(L.waypoint.x, L.waypoint.y, 2, "40,90,200", 0.25 + Math.sin(game.time * 3) * 0.06);
    ctx.globalCompositeOperation = "source-over";
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
  private drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, k: number) {
    const cx = Math.round(this.ax(x, y));
    const cy = Math.round(this.ay(x, y));
    const H = Math.round(34 * k);
    const W = Math.round(12 * k);
    // ground glow
    ctx.fillStyle = `rgba(80,150,255,${0.25 * k})`;
    ctx.fillRect(cx - W - 3, cy - 1, W * 2 + 7, 3);
    for (let yy = 0; yy < H; yy++) {
      const v = (yy - H / 2) / (H / 2);
      const half = Math.round(W * Math.sqrt(Math.max(0, 1 - v * v)));
      for (let xx = -half; xx <= half; xx++) {
        const edge = Math.abs(xx) >= half - 1;
        const swirl = Math.sin(xx * 0.9 + yy * 0.5 - t * 6) > 0.4;
        ctx.fillStyle = edge ? `rgba(170,215,255,${0.95 * k})` : swirl ? `rgba(90,160,255,${0.8 * k})` : `rgba(30,70,170,${0.75 * k})`;
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
    if (q.cls === "javelin") {
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
    if (a?.type === "leap") return { anim: "leap", f: Math.min(2, Math.floor((a.t / a.dur) * 3)) };
    if (game.recall) return { anim: "cry", f: Math.min(3, Math.floor((game.recall.t / game.recall.dur) * 6)) };
    if (a?.type === "cry") return { anim: "cry", f: Math.min(3, Math.floor((a.t / a.dur) * 4)) };
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
    const fr = getFrame("barb", look, lookKey(look), anim, dirOf(p.fx, p.fy), f, p.flash > 0.5);
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
    // frenzy glow under the feet
    if (p.frenzy.stacks > 0 && !p.dead) {
      this.ctx.fillStyle = `rgba(255,90,40,${0.12 + p.frenzy.stacks * 0.05})`;
      this.ctx.fillRect(sx - 6, sy0 - 1, 12, 2);
    }
  }

  private drawMonster(m: Monster) {
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
    const fr = getFrame(model, {}, "", anim, dirOf(m.fx, m.fy), f, m.flash > 0.4 && m.state !== "dead");
    const ctx = this.ctx;
    if (m.state === "dead" && m.searched) ctx.globalAlpha = 0.75;
    ctx.drawImage(fr.c, sx - fr.ax, sy - fr.ay);
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
    dot(L.waypoint.x, L.waypoint.y, "#5aa8ff", 5);
    if (L.vendor) dot(L.vendor.x, L.vendor.y, "#ffe08a", 4);
    for (const m of game.monsters) {
      if (m.state === "dead" || !L.explored[idx(Math.floor(m.x), Math.floor(m.y))]) continue;
      if (Math.hypot(m.x - p.x, m.y - p.y) > 9) continue;
      dot(m.x, m.y, m.def.rank !== "normal" ? "#ff40ff" : "#ff3a2a", m.def.rank !== "normal" ? 4 : 3);
    }
    g.fillStyle = "#4aa0ff";
    g.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);
  }
}
