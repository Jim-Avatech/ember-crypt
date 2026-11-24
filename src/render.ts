import { BASE_BY_ID } from "./data/items";
import type { Game, GroundItem, Monster } from "./game";
import { goldIcon, itemIcon, potionIcon } from "./icons";
import { idx, isFloor } from "./map";

const HW = 32; // half tile width (base px)
const HH = 16; // half tile height
const WALL_H = 54;
const LOW_WALL_H = 10;

export interface LabelHit {
  g: GroundItem;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Drawable = { d: number; f: () => void };

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  W = 0;
  H = 0;
  dpr = 1;
  zoom = 1;
  camX = 0;
  camY = 0;
  shake = 0;
  shakeOn = true;
  labels: LabelHit[] = [];
  private floorSprites: HTMLCanvasElement[] = [];
  private wallTall!: HTMLCanvasElement;
  private wallLow!: HTMLCanvasElement;
  private light!: HTMLCanvasElement;
  private lctx!: CanvasRenderingContext2D;
  private mini: HTMLCanvasElement | null = null;
  private miniT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
  }

  setMinimap(c: HTMLCanvasElement) {
    this.mini = c;
  }

  resize(w: number, h: number) {
    this.W = w;
    this.H = h;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.zoom = Math.max(0.85, Math.min(1.7, Math.min(h / 310, w / 600)));
    this.buildSprites();
    this.light = document.createElement("canvas");
    this.light.width = Math.ceil(w / 2);
    this.light.height = Math.ceil(h / 2);
    this.lctx = this.light.getContext("2d")!;
  }

  // -------------------------------------------------------------- sprites
  private buildSprites() {
    const s = this.zoom * this.dpr;
    const mk = (w: number, h: number) => {
      const c = document.createElement("canvas");
      c.width = Math.ceil(w * s);
      c.height = Math.ceil(h * s);
      const g = c.getContext("2d")!;
      g.scale(s, s);
      return [c, g] as const;
    };
    const diamond = (g: CanvasRenderingContext2D, ox: number, oy: number) => {
      g.beginPath();
      g.moveTo(ox + HW, oy);
      g.lineTo(ox + HW * 2, oy + HH);
      g.lineTo(ox + HW, oy + HH * 2);
      g.lineTo(ox, oy + HH);
      g.closePath();
    };
    let seed = 7;
    const r = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    this.floorSprites = [];
    const bases = ["#3b342d", "#38312a", "#3e362e", "#352f29"];
    for (let v = 0; v < 4; v++) {
      const [c, g] = mk(HW * 2, HH * 2);
      diamond(g, 0, 0);
      g.save();
      g.clip();
      g.fillStyle = bases[v];
      g.fillRect(0, 0, HW * 2, HH * 2);
      // flagstones: split diamond into 4 stones
      g.strokeStyle = "rgba(0,0,0,.45)";
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(HW / 2, HH / 2 + HH / 2);
      g.lineTo(HW * 1.5, HH * 1.5);
      g.moveTo(HW * 1.5, HH / 2);
      g.lineTo(HW / 2, HH * 1.5);
      g.stroke();
      for (let i = 0; i < 26; i++) {
        g.fillStyle = r() < 0.5 ? "rgba(255,240,210,.05)" : "rgba(0,0,0,.12)";
        g.fillRect(r() * HW * 2, r() * HH * 2, 1 + r() * 3, 1 + r() * 2);
      }
      if (v === 2) {
        g.strokeStyle = "rgba(0,0,0,.5)";
        g.beginPath();
        g.moveTo(HW * 0.8, HH * 0.6);
        g.lineTo(HW * 1.0, HH * 1.0);
        g.lineTo(HW * 0.9, HH * 1.4);
        g.stroke();
      }
      if (v === 3) {
        g.fillStyle = "rgba(60,80,40,.25)";
        g.beginPath();
        g.ellipse(HW * 1.2, HH * 1.1, 8, 4, 0, 0, 7);
        g.fill();
      }
      g.restore();
      diamond(g, 0, 0);
      g.strokeStyle = "rgba(0,0,0,.55)";
      g.lineWidth = 1.5;
      g.stroke();
      this.floorSprites.push(c);
    }
    const wall = (h: number) => {
      const [c, g] = mk(HW * 2, HH * 2 + h);
      // left face
      g.fillStyle = "#2a241f";
      g.beginPath();
      g.moveTo(0, HH);
      g.lineTo(HW, HH * 2);
      g.lineTo(HW, HH * 2 + h);
      g.lineTo(0, HH + h);
      g.closePath();
      g.fill();
      // right face
      g.fillStyle = "#3a3129";
      g.beginPath();
      g.moveTo(HW, HH * 2);
      g.lineTo(HW * 2, HH);
      g.lineTo(HW * 2, HH + h);
      g.lineTo(HW, HH * 2 + h);
      g.closePath();
      g.fill();
      // bricks
      g.strokeStyle = "rgba(0,0,0,.4)";
      g.lineWidth = 1;
      for (let y = 9; y < h; y += 9) {
        g.beginPath();
        g.moveTo(0, HH + y);
        g.lineTo(HW, HH * 2 + y);
        g.lineTo(HW * 2, HH + y);
        g.stroke();
        const off = (y / 9) % 2 ? 0.25 : 0.65;
        for (const side of [0, 1]) {
          const x0 = side ? HW + HW * off : HW * off;
          const y0 = side ? HH * 2 - HH * off + y : HH + HH * off + y;
          g.beginPath();
          g.moveTo(x0, y0);
          g.lineTo(x0, y0 - 9);
          g.stroke();
        }
      }
      // top
      diamond(g, 0, 0);
      g.fillStyle = "#4d443a";
      g.fill();
      g.strokeStyle = "rgba(0,0,0,.6)";
      g.lineWidth = 1.5;
      g.stroke();
      g.strokeStyle = "rgba(255,230,190,.12)";
      g.beginPath();
      g.moveTo(1, HH);
      g.lineTo(HW, 1);
      g.lineTo(HW * 2 - 1, HH);
      g.stroke();
      return c;
    };
    this.wallTall = wall(WALL_H);
    this.wallLow = wall(LOW_WALL_H);
  }

  // -------------------------------------------------------------- projection
  sx(wx: number, wy: number) {
    return ((wx - wy) * HW - this.camX) * this.zoom + this.W / 2;
  }
  sy(wx: number, wy: number, z = 0) {
    return ((wx + wy) * HH - this.camY - z * HH * 2) * this.zoom + this.H / 2;
  }

  // -------------------------------------------------------------- frame
  render(game: Game, dt: number, showLabels: boolean) {
    const ctx = this.ctx;
    const p = game.player;
    const L = game.level;
    const z = this.zoom;
    // camera follow
    const tx = (p.x - p.y) * HW;
    const ty = (p.x + p.y) * HH;
    const k = 1 - Math.exp(-10 * dt);
    if (Math.abs(this.camX - tx) > 400 || Math.abs(this.camY - ty) > 400) {
      this.camX = tx;
      this.camY = ty;
    } else {
      this.camX += (tx - this.camX) * k;
      this.camY += (ty - this.camY) * k;
    }
    this.shake = Math.max(0, this.shake - dt * 30);
    const shx = this.shakeOn ? (Math.random() - 0.5) * this.shake : 0;
    const shy = this.shakeOn ? (Math.random() - 0.5) * this.shake : 0;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#070605";
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.save();
    ctx.translate(shx, shy);

    const tileW = HW * 2 * z;
    const tileH = HH * 2 * z;
    const R = Math.ceil(Math.max(this.W / tileW, this.H / tileH)) + 3;
    const x0 = Math.max(0, Math.floor(p.x - R));
    const x1 = Math.min(L.w - 1, Math.ceil(p.x + R));
    const y0 = Math.max(0, Math.floor(p.y - R));
    const y1 = Math.min(L.h - 1, Math.ceil(p.y + R));
    const onScreen = (sx: number, sy: number, pad: number) => sx > -pad && sx < this.W + pad && sy > -pad * 2 && sy < this.H + pad;

    // floor
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (L.tiles[idx(x, y)] !== 1) continue;
        const sx = this.sx(x, y) - HW * z;
        const sy = this.sy(x, y);
        if (!onScreen(sx + HW * z, sy, tileW)) continue;
        ctx.drawImage(this.floorSprites[L.variant[idx(x, y)] & 3], sx, sy, tileW, tileH);
      }

    // decals
    for (const dcl of L.decals) {
      if (Math.abs(dcl.x - p.x) > R || Math.abs(dcl.y - p.y) > R) continue;
      const sx = this.sx(dcl.x, dcl.y);
      const sy = this.sy(dcl.x, dcl.y);
      this.drawDecal(dcl.kind, sx, sy, dcl.rot);
    }

    // stairs
    if (game.stairs) this.drawStairs(game.stairs.x, game.stairs.y, game.time);
    // entry marker
    {
      const s = L.start;
      const sx = this.sx(s.cx + 0.5, s.cy + 0.5);
      const sy = this.sy(s.cx + 0.5, s.cy + 0.5);
      ctx.strokeStyle = "rgba(120,170,255,.35)";
      ctx.lineWidth = 2 * z;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 26 * z, 13 * z, 0, 0, 7);
      ctx.stroke();
      ctx.strokeStyle = "rgba(120,170,255,.18)";
      ctx.beginPath();
      ctx.ellipse(sx, sy, 18 * z, 9 * z, 0, 0, 7);
      ctx.stroke();
    }

    // corpses (flat)
    for (const m of game.monsters) if (m.state === "dead") this.drawCorpse(m);

    // ground rings
    for (const rg of game.rings) {
      const kk = rg.t / rg.life;
      ctx.strokeStyle = `${rg.color}${(1 - kk).toFixed(2)})`;
      ctx.lineWidth = 3 * z;
      ctx.beginPath();
      ctx.ellipse(this.sx(rg.x, rg.y), this.sy(rg.x, rg.y), rg.radius * kk * HW * z * 1.41, rg.radius * kk * HH * z * 1.41, 0, 0, 7);
      ctx.stroke();
    }

    // ground items (flat on floor)
    for (const g of game.ground) {
      const sx = this.sx(g.x, g.y);
      const bounce = g.t < 0.4 ? Math.sin((g.t / 0.4) * Math.PI) * 0.6 : 0;
      const sy = this.sy(g.x, g.y, bounce);
      const sz = (g.item ? 30 : 20) * z;
      const img = g.item ? itemIcon(g.item.baseId, 64) : g.gold ? goldIcon(32) : potionIcon(g.potion!, 32);
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.beginPath();
      ctx.ellipse(this.sx(g.x, g.y), this.sy(g.x, g.y), sz * 0.4, sz * 0.18, 0, 0, 7);
      ctx.fill();
      ctx.drawImage(img, sx - sz / 2, sy - sz * 0.8, sz, sz);
    }

    // sortable: walls + entities
    const list: Drawable[] = [];
    const pD = p.x + p.y;
    const psx = this.sx(p.x, p.y);
    const psy = this.sy(p.x, p.y);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (L.tiles[idx(x, y)] === 1) continue;
        // only walls touching floor
        let front = false;
        let back = false;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            if (!isFloor(L, x + ox, y + oy)) continue;
            if (ox + oy < 0 || (ox === 0 && oy < 0) || (oy === 0 && ox < 0)) front = true;
            else if (ox + oy > 0) back = true;
            else front = true;
          }
        if (!front && !back) continue;
        const tall = back && !front;
        const h = tall ? WALL_H : LOW_WALL_H;
        const sx = this.sx(x, y) - HW * z;
        const sy = this.sy(x, y) - h * z;
        if (!onScreen(sx + HW * z, sy, tileW * 2)) continue;
        const d = x + y + 1;
        let alpha = 1;
        if (tall && d > pD && Math.abs(sx + HW * z - psx) < 70 * z && sy + h * z > psy - 60 * z && sy < psy) alpha = 0.35;
        const img = tall ? this.wallTall : this.wallLow;
        const hasTorch = tall && L.torches.some((t) => t.x === x && t.y === y);
        list.push({
          d,
          f: () => {
            ctx.globalAlpha = alpha;
            ctx.drawImage(img, sx, sy, tileW, (HH * 2 + h) * z);
            ctx.globalAlpha = 1;
            if (hasTorch) this.drawTorch(x, y, game.time, isFloor(L, x + 1, y) ? 1 : 0);
          },
        });
      }
    for (const m of game.monsters) {
      if (m.state === "dead") continue;
      if (Math.abs(m.x - p.x) > R || Math.abs(m.y - p.y) > R) continue;
      list.push({ d: m.x + m.y, f: () => this.drawMonster(m, game.time) });
    }
    if (!p.dead || true) list.push({ d: pD, f: () => this.drawPlayer(game) });
    list.sort((a, b) => a.d - b.d);
    for (const it of list) it.f();

    // particles
    for (const q of game.particles) {
      const a = 1 - q.t / q.life;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = q.color;
      const s = q.size * z;
      ctx.fillRect(this.sx(q.x, q.y) - s / 2, this.sy(q.x, q.y, q.z * 0.5) - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    // lighting
    this.drawLighting(game);

    // health bars + labels + floaters above the darkness
    for (const m of game.monsters) {
      if (m.state === "dead" || m.def.kind === "boss") continue;
      if (m.hp >= m.maxHp && m.state === "idle") continue;
      const sx = this.sx(m.x, m.y);
      const sy = this.sy(m.x, m.y) - (m.def.kind === "fallen" ? 36 : 52) * z;
      const w = 30 * z;
      ctx.fillStyle = "rgba(0,0,0,.7)";
      ctx.fillRect(sx - w / 2 - 1, sy - 1, w + 2, 5 * z + 2);
      ctx.fillStyle = "#b3241b";
      ctx.fillRect(sx - w / 2, sy, w * Math.max(0, m.hp / m.maxHp), 5 * z);
    }
    this.labels = [];
    if (showLabels) this.drawLabels(game);
    for (const f of game.floaters) {
      const kk = f.t / f.life;
      const sx = this.sx(f.x, f.y);
      const sy = this.sy(f.x, f.y) - (50 + kk * 34) * z;
      ctx.globalAlpha = kk > 0.7 ? (1 - kk) / 0.3 : 1;
      ctx.font = `bold ${Math.round(f.size * z)}px Georgia, 'Times New Roman', serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,.85)";
      ctx.strokeText(f.text, sx, sy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // boss bar
    if (game.boss && game.boss.state !== "dead" && game.boss.state !== "idle") {
      const b = game.boss;
      const w = Math.min(320, this.W * 0.4);
      const x = this.W / 2 - w / 2;
      const y = 12;
      ctx.fillStyle = "rgba(0,0,0,.75)";
      ctx.fillRect(x - 2, y - 2, w + 4, 22);
      ctx.fillStyle = "#7a1410";
      ctx.fillRect(x, y, w * (b.hp / b.maxHp), 18);
      ctx.font = "bold 13px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#e9d9a8";
      ctx.fillText(b.def.name, this.W / 2, y + 14);
    }

    // player hurt vignette
    if (p.flash > 0 || (p.hp / game.derived().maxHp < 0.3 && !p.dead)) {
      const low = p.hp / game.derived().maxHp < 0.3 ? 0.25 + Math.sin(game.time * 5) * 0.08 : 0;
      const a = Math.max(p.flash * 0.45, low);
      const grd = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.3, this.W / 2, this.H / 2, this.W * 0.7);
      grd.addColorStop(0, "rgba(120,0,0,0)");
      grd.addColorStop(1, `rgba(140,0,0,${a.toFixed(2)})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, this.W, this.H);
    }

    this.miniT -= dt;
    if (this.mini && this.miniT <= 0) {
      this.miniT = 0.25;
      this.drawMinimap(game);
    }
  }

  // -------------------------------------------------------------- lighting
  private drawLighting(game: Game) {
    const g = this.lctx;
    const p = game.player;
    const W = this.light.width;
    const H = this.light.height;
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(4,3,2,0.9)";
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "destination-out";
    const hole = (wx: number, wy: number, radiusTiles: number, strength: number, zz = 0) => {
      const x = this.sx(wx, wy) / 2;
      const y = this.sy(wx, wy, zz) / 2;
      const r = radiusTiles * HW * this.zoom * 0.75;
      const grd = g.createRadialGradient(x, y, r * 0.15, x, y, r);
      grd.addColorStop(0, `rgba(0,0,0,${strength})`);
      grd.addColorStop(0.55, `rgba(0,0,0,${strength * 0.75})`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.8, 0, 0, 7);
      g.fill();
    };
    hole(p.x, p.y, 8.5, 1, 0.5);
    const L = game.level;
    for (const t of L.torches) {
      if (Math.abs(t.x - p.x) > 18 || Math.abs(t.y - p.y) > 18) continue;
      const fl = 0.85 + Math.sin(game.time * 9 + t.x) * 0.05;
      hole(t.x + 0.9, t.y + 0.9, 3.6 * fl, 0.8, 0.5);
    }
    if (game.stairs) hole(game.stairs.x, game.stairs.y, 3, 0.7);
    g.globalCompositeOperation = "source-over";
    const ctx = this.ctx;
    ctx.drawImage(this.light, 0, 0, this.W, this.H);
    // warm torch tint
    ctx.globalCompositeOperation = "lighter";
    for (const t of L.torches) {
      if (Math.abs(t.x - p.x) > 14 || Math.abs(t.y - p.y) > 14) continue;
      const x = this.sx(t.x + 0.9, t.y + 0.9);
      const y = this.sy(t.x + 0.9, t.y + 0.9, 0.6);
      const r = 2.6 * HW * this.zoom;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, "rgba(120,60,10,.28)");
      grd.addColorStop(1, "rgba(120,60,10,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // -------------------------------------------------------------- pieces
  private drawDecal(kind: string, sx: number, sy: number, rot: number) {
    const ctx = this.ctx;
    const z = this.zoom;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(z, z * 0.5);
    ctx.rotate(rot);
    if (kind === "bones") {
      ctx.strokeStyle = "rgba(210,200,170,.55)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-8, -2);
      ctx.lineTo(8, 2);
      ctx.moveTo(-3, 5);
      ctx.lineTo(6, -6);
      ctx.stroke();
    } else if (kind === "skull") {
      ctx.fillStyle = "rgba(215,205,175,.6)";
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillRect(-3, -1, 2, 2);
      ctx.fillRect(1, -1, 2, 2);
    } else if (kind === "blood") {
      ctx.fillStyle = "rgba(90,10,6,.45)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 6, 0, 0, 7);
      ctx.fill();
    } else {
      ctx.strokeStyle = "rgba(0,0,0,.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-2, 2);
      ctx.lineTo(4, -3);
      ctx.lineTo(10, 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawStairs(x: number, y: number, t: number) {
    const ctx = this.ctx;
    const z = this.zoom;
    const sx = this.sx(x, y);
    const sy = this.sy(x, y);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(z, z);
    ctx.fillStyle = "#050403";
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(36, 0);
    ctx.lineTo(0, 18);
    ctx.lineTo(-36, 0);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(150,130,100,${0.55 - i * 0.12})`;
      ctx.lineWidth = 2;
      const k = 1 - i * 0.2;
      ctx.beginPath();
      ctx.moveTo(-30 * k, 2 + i * 3);
      ctx.lineTo(0, 15 * k + i * 3);
      ctx.lineTo(30 * k, 2 + i * 3);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(255,190,90,${0.35 + Math.sin(t * 3) * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(36, 0);
    ctx.lineTo(0, 18);
    ctx.lineTo(-36, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawTorch(x: number, y: number, t: number, side: number) {
    const ctx = this.ctx;
    const z = this.zoom;
    // put the torch on the visible face: right face if floor is to +x, else left face
    const wx = side ? x + 1 : x + 0.5;
    const wy = side ? y + 0.5 : y + 1;
    const sx = this.sx(wx, wy);
    const sy = this.sy(wx, wy) - 30 * z;
    ctx.fillStyle = "#2a1a0a";
    ctx.fillRect(sx - 2 * z, sy, 4 * z, 9 * z);
    const f = Math.sin(t * 13 + x * 3) * 1.5;
    ctx.fillStyle = "#ff9a2a";
    ctx.beginPath();
    ctx.ellipse(sx, sy - 3 * z, 4 * z, (7 + f) * z, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.ellipse(sx, sy - 1 * z, 2 * z, (4 + f / 2) * z, 0, 0, 7);
    ctx.fill();
  }

  private shadow(sx: number, sy: number, r: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.beginPath();
    ctx.ellipse(sx, sy, r * this.zoom, r * 0.5 * this.zoom, 0, 0, 7);
    ctx.fill();
  }

  /** screen-space facing angle for a world direction */
  private faceAngle(fx: number, fy: number) {
    return Math.atan2((fx + fy) * 0.5, fx - fy);
  }

  private drawPlayer(game: Game) {
    const ctx = this.ctx;
    const p = game.player;
    const z = this.zoom;
    const sx = this.sx(p.x, p.y);
    const sy0 = this.sy(p.x, p.y);
    const sy = this.sy(p.x, p.y, p.z);
    this.shadow(sx, sy0, 13 * (1 - p.z * 0.2));
    const d = game.derived();
    const ang = this.faceAngle(p.fx, p.fy);
    const flip = Math.cos(ang) < 0 ? -1 : 1;
    const back = Math.sin(ang) < -0.35;
    let swing = -1;
    let skill: string | null = null;
    if (p.action?.type === "swing") {
      swing = p.action.t / p.action.dur;
      skill = p.action.skill;
      if (skill === "double_swing") swing = (swing * 2) % 1;
    }
    const cry = p.action?.type === "cry";
    const leaping = p.action?.type === "leap";
    const flash = p.flash > 0.5;
    const dead = p.dead;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(z * flip, z);
    if (dead) {
      ctx.rotate(-Math.PI / 2);
      ctx.translate(-6, 6);
      ctx.globalAlpha = 0.85;
    }
    const col = (c: string) => (flash ? "#ffffff" : c);
    const walk = p.moving ? Math.sin(p.walkPhase) : 0;
    const bob = p.moving ? Math.abs(Math.cos(p.walkPhase)) * 1.5 : 0;
    const tuck = leaping ? 5 : 0;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#120c08";
    ctx.lineWidth = 1.6;
    // legs
    const boots = p.equip.boots ? "#4a3626" : "#6a4428";
    const leg = (dx: number, sw: number) => {
      ctx.fillStyle = col("#b07a4c");
      ctx.beginPath();
      ctx.roundRect(dx - 3 + sw, -18 + tuck, 6, 13 - tuck, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col(boots);
      ctx.beginPath();
      ctx.roundRect(dx - 3.5 + sw * 1.3, -6, 8, 6, 2);
      ctx.fill();
      ctx.stroke();
    };
    leg(-4, -walk * 4);
    leg(4, walk * 4);
    ctx.translate(0, -bob);
    // shield arm (behind)
    const shield = p.equip.shield;
    if (shield && !back) this.drawShield(ctx, -9, -27, BASE_BY_ID[shield.baseId].qlvl, col);
    // torso
    const armor = p.equip.armor ? BASE_BY_ID[p.equip.armor.baseId] : null;
    ctx.fillStyle = col("#c48a5a");
    ctx.beginPath();
    ctx.moveTo(-10, -37);
    ctx.lineTo(10, -37);
    ctx.lineTo(7, -18);
    ctx.lineTo(-7, -18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (armor) {
      const q = armor.qlvl;
      ctx.fillStyle = col(q > 10 ? "#8e959c" : q > 4 ? "#6b4a2b" : "#8a7656");
      ctx.beginPath();
      ctx.moveTo(-9, -35);
      ctx.lineTo(9, -35);
      ctx.lineTo(7, -19);
      ctx.lineTo(-7, -19);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,.35)";
      ctx.beginPath();
      ctx.moveTo(-8, -30);
      ctx.lineTo(8, -30);
      ctx.moveTo(-7.5, -25);
      ctx.lineTo(7.5, -25);
      ctx.stroke();
      ctx.strokeStyle = "#120c08";
    } else {
      // fur strap
      ctx.strokeStyle = col("#4a2e18");
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-9, -36);
      ctx.lineTo(7, -20);
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = "#120c08";
    }
    // belt / loincloth
    ctx.fillStyle = col("#5a3a20");
    ctx.fillRect(-8, -20, 16, 5);
    ctx.strokeRect(-8, -20, 16, 5);
    // pauldrons
    ctx.fillStyle = col(armor && armor.qlvl > 10 ? "#a0a7ae" : "#7a5634");
    ctx.beginPath();
    ctx.ellipse(-10, -35, 5, 4, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(10, -35, 5, 4, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    // head
    ctx.fillStyle = col("#c48a5a");
    ctx.beginPath();
    ctx.arc(1, -43, 6, 0, 7);
    ctx.fill();
    ctx.stroke();
    if (!back) {
      ctx.fillStyle = col("#3a2414");
      ctx.beginPath();
      ctx.moveTo(-2, -41);
      ctx.quadraticCurveTo(3, -33, 7, -40);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#120c08";
      ctx.fillRect(3, -45, 2, 2);
    }
    const helm = p.equip.helm;
    if (helm) {
      const q = BASE_BY_ID[helm.baseId].qlvl;
      ctx.fillStyle = col(q > 4 ? "#a6adb4" : "#8c6a44");
      ctx.beginPath();
      ctx.arc(1, -44, 6.8, Math.PI, 0);
      ctx.lineTo(7.8, -42);
      ctx.lineTo(-5.8, -42);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (q > 10) {
        ctx.fillStyle = col("#e0e0e0");
        ctx.beginPath();
        ctx.moveTo(-5, -47);
        ctx.lineTo(-10, -55);
        ctx.lineTo(-3, -49);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = col("#3a2414");
      ctx.beginPath();
      ctx.arc(1, -45, 6.2, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
    }
    // weapon arm
    let armA: number;
    if (swing >= 0) {
      const e = swing < 0.45 ? swing / 0.45 : 1;
      const raise = swing < 0.25 ? swing / 0.25 : 1;
      armA = swing < 0.25 ? 0.9 - raise * 3.2 : -2.3 + (e - 0.55) * 0 + Math.min(1, (swing - 0.25) / 0.3) * 3.6;
    } else if (cry) armA = -2.6;
    else if (leaping) armA = -2.0;
    else armA = 0.9 + walk * 0.25;
    const shX = 8;
    const shY = -34;
    const hx = shX + Math.cos(armA) * 12;
    const hy = shY + Math.sin(armA) * 12;
    ctx.strokeStyle = col("#b07a4c");
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#120c08";
    this.drawWeapon(ctx, hx, hy, armA, d.weaponKind, col, p.equip.weapon ? BASE_BY_ID[p.equip.weapon.baseId].qlvl : 0);
    if (shield && back) this.drawShield(ctx, -9, -27, BASE_BY_ID[shield.baseId].qlvl, col);
    // swing trail
    if (swing > 0.3 && swing < 0.7) {
      const a = 1 - Math.abs(swing - 0.5) / 0.2;
      ctx.strokeStyle = skill === "bash" ? `rgba(255,200,90,${0.7 * a})` : skill === "stun" ? `rgba(160,200,255,${0.7 * a})` : `rgba(255,255,255,${0.55 * a})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(shX, shY, 30, -1.9, 0.9);
      ctx.stroke();
    }
    ctx.restore();
    // buff auras
    if (p.buffs.shout > 0 || p.buffs.bo > 0) {
      ctx.strokeStyle = p.buffs.bo > 0 ? "rgba(255,200,100,.35)" : "rgba(140,180,255,.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(sx, sy0, 18 * z, 9 * z, 0, 0, 7);
      ctx.stroke();
    }
  }

  private drawShield(ctx: CanvasRenderingContext2D, x: number, y: number, q: number, col: (c: string) => string) {
    ctx.fillStyle = col(q > 4 ? "#6b4a2a" : "#7a5a36");
    ctx.beginPath();
    ctx.ellipse(x, y, q > 4 ? 7 : 6, q > 4 ? 9 : 7, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = col("#a8aeb4");
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, 7);
    ctx.fill();
  }

  private drawWeapon(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, kind: string, col: (c: string) => string, q: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a - Math.PI / 2);
    const metal = col(q > 14 ? "#dde2e6" : q > 7 ? "#c0c7ce" : "#a3aab1");
    if (kind === "sword") {
      const len = 22 + Math.min(10, q / 2);
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.moveTo(-2, 3);
      ctx.lineTo(-2, 3 + len);
      ctx.lineTo(0, 7 + len);
      ctx.lineTo(2, 3 + len);
      ctx.lineTo(2, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col("#8a6a2a");
      ctx.fillRect(-6, 1, 12, 3);
    } else if (kind === "axe") {
      ctx.fillStyle = col("#7a4e2a");
      ctx.fillRect(-1.5, -3, 3, 26);
      ctx.strokeRect(-1.5, -3, 3, 26);
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.moveTo(1, 15);
      ctx.quadraticCurveTo(12, 14, 12, 26);
      ctx.quadraticCurveTo(6, 22, 1, 23);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (q > 12) {
        ctx.beginPath();
        ctx.moveTo(-1, 15);
        ctx.quadraticCurveTo(-11, 15, -11, 25);
        ctx.quadraticCurveTo(-6, 22, -1, 23);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (kind === "mace") {
      ctx.fillStyle = col("#7a4e2a");
      ctx.fillRect(-1.5, -3, 3, 22);
      ctx.strokeRect(-1.5, -3, 3, 22);
      ctx.fillStyle = q <= 1 ? col("#8a5a30") : metal;
      ctx.beginPath();
      ctx.arc(0, 22, 5.5, 0, 7);
      ctx.fill();
      ctx.stroke();
      if (q > 1) {
        for (let i = 0; i < 6; i++) {
          const aa = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(aa) * 5, 22 + Math.sin(aa) * 5);
          ctx.lineTo(Math.cos(aa) * 8.5, 22 + Math.sin(aa) * 8.5);
          ctx.stroke();
        }
      }
    } else {
      ctx.fillStyle = col("#c48a5a");
      ctx.beginPath();
      ctx.arc(0, 2, 3.5, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMonster(m: Monster, t: number) {
    const ctx = this.ctx;
    const z = this.zoom;
    const sx = this.sx(m.x, m.y);
    const sy = this.sy(m.x, m.y);
    const scale = m.def.kind === "boss" ? 1.55 : 1;
    this.shadow(sx, sy, (m.def.kind === "fallen" ? 9 : 13) * scale);
    const ang = this.faceAngle(m.fx, m.fy);
    const flip = Math.cos(ang) < 0 ? -1 : 1;
    const flash = m.flash > 0.4;
    const col = (c: string) => (flash ? "#ffffff" : c);
    const moving = m.state === "chase" || m.fearT > 0;
    const walk = Math.sin(m.walkPhase);
    const wind = m.state === "attack" ? 1 - Math.max(0, m.windT) / m.def.windup : 0;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(z * flip * scale, z * scale);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0a0806";
    ctx.lineWidth = 1.5;
    if (m.def.kind === "fallen") {
      const hop = moving ? Math.abs(Math.sin(m.walkPhase * 1.3)) * 4 : 0;
      ctx.translate(0, -hop);
      // legs
      ctx.fillStyle = col("#8a2018");
      ctx.fillRect(-4 + walk * 2, -8, 3, 8);
      ctx.fillRect(1 - walk * 2, -8, 3, 8);
      // body
      ctx.fillStyle = col("#b8342a");
      ctx.beginPath();
      ctx.ellipse(0, -13, 6, 7, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      // head
      ctx.beginPath();
      ctx.arc(2, -23, 6, 0, 7);
      ctx.fill();
      ctx.stroke();
      // horns
      ctx.fillStyle = col("#e8dcc0");
      ctx.beginPath();
      ctx.moveTo(-2, -27);
      ctx.lineTo(-6, -34);
      ctx.lineTo(0, -28);
      ctx.moveTo(4, -28);
      ctx.lineTo(7, -35);
      ctx.lineTo(7, -27);
      ctx.fill();
      // eyes
      ctx.fillStyle = "#ffe14a";
      ctx.fillRect(4, -25, 2, 2);
      ctx.fillRect(7, -25, 1.5, 2);
      // arm + blade
      const aa = m.state === "attack" ? -1.8 + wind * 0.4 : wind > 0 ? 1 : 0.6 + walk * 0.3;
      const hx = 5 + Math.cos(aa) * 7;
      const hy = -15 + Math.sin(aa) * 7;
      ctx.strokeStyle = col("#8a2018");
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(4, -15);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.strokeStyle = col("#c8ccd0");
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(aa - 0.4) * 9, hy + Math.sin(aa - 0.4) * 9);
      ctx.stroke();
    } else {
      const boss = m.def.kind === "boss";
      const skin = boss ? "#7a6a94" : "#7d8f5c";
      const cloth = boss ? "#3a2440" : "#4a4038";
      const sway = moving ? walk * 0.08 : 0;
      ctx.rotate(sway);
      // legs
      ctx.fillStyle = col(cloth);
      ctx.fillRect(-5 + walk * 2.5, -16, 4, 16);
      ctx.fillRect(1 - walk * 2.5, -16, 4, 16);
      ctx.strokeRect(-5 + walk * 2.5, -16, 4, 16);
      ctx.strokeRect(1 - walk * 2.5, -16, 4, 16);
      // torso, hunched
      ctx.fillStyle = col(skin);
      ctx.beginPath();
      ctx.moveTo(-8, -34);
      ctx.lineTo(8, -36);
      ctx.lineTo(6, -15);
      ctx.lineTo(-6, -15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col(cloth);
      ctx.beginPath();
      ctx.moveTo(-7, -26);
      ctx.lineTo(6.5, -28);
      ctx.lineTo(6, -15);
      ctx.lineTo(-6, -15);
      ctx.closePath();
      ctx.fill();
      // head forward
      ctx.fillStyle = col(skin);
      ctx.beginPath();
      ctx.arc(6, -39, 5.5, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = boss ? "#ff4a2a" : "#e8f0a0";
      ctx.fillRect(8, -41, 2, 2);
      // arms outstretched
      const lift = m.state === "attack" ? -0.9 * wind : 0;
      const aa = -0.15 + lift + (moving ? walk * 0.1 : 0.3);
      ctx.strokeStyle = col(skin);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(5, -33);
      ctx.lineTo(5 + Math.cos(aa) * 15, -33 + Math.sin(aa) * 15);
      ctx.moveTo(-3, -33);
      ctx.lineTo(-3 + Math.cos(aa + 0.15) * 15, -33 + Math.sin(aa + 0.15) * 15);
      ctx.stroke();
      if (boss) {
        ctx.fillStyle = "rgba(255,80,40,.25)";
        ctx.beginPath();
        ctx.arc(6, -39, 10 + Math.sin(t * 4) * 2, 0, 7);
        ctx.fill();
      }
    }
    if (m.stunT > 0) {
      ctx.fillStyle = "#ffe36a";
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + (i * Math.PI * 2) / 3;
        ctx.fillRect(Math.cos(a) * 8 - 1.5, (m.def.kind === "fallen" ? -38 : -50) + Math.sin(a) * 3, 3, 3);
      }
    }
    if (m.fearT > 0) {
      ctx.fillStyle = "#e8d9a0";
      ctx.font = "bold 10px Georgia";
      ctx.fillText("!", -2, m.def.kind === "fallen" ? -38 : -50);
    }
    ctx.restore();
  }

  private drawCorpse(m: Monster) {
    const ctx = this.ctx;
    const z = this.zoom;
    const sx = this.sx(m.x, m.y);
    const sy = this.sy(m.x, m.y);
    const scale = m.def.kind === "boss" ? 1.5 : m.def.kind === "fallen" ? 0.7 : 1;
    const k = Math.min(1, m.deadT / 0.25);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(z * scale, z * scale);
    ctx.fillStyle = "rgba(80,8,4,.55)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 14 * k + 2, 6 * k + 1, 0, 0, 7);
    ctx.fill();
    const skin = m.def.kind === "fallen" ? "#7a2018" : m.def.kind === "boss" ? "#56486a" : "#55633e";
    ctx.fillStyle = m.searched ? "#3a3530" : skin;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.ellipse(-2, -3, 11, 4, -0.15, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(10, -4, 4, 0, 7);
    ctx.fill();
    ctx.restore();
  }

  private drawLabels(game: Game) {
    const ctx = this.ctx;
    const z = this.zoom;
    ctx.font = `${Math.round(12 * Math.min(1.25, z))}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = "center";
    const placed: LabelHit[] = [];
    // nearest first so close labels win the space
    const p = game.player;
    const items = [...game.ground].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    for (const g of items) {
      if (Math.hypot(g.x - p.x, g.y - p.y) > 11) continue;
      if (!g.item) continue; // gold and potions are picked up by walking over them
      const text = g.item ? BASE_BY_ID[g.item.baseId].name : g.gold ? `${g.gold} Gold` : g.potion === "hp" ? "Healing Potion" : "Mana Potion";
      const color = g.item ? (game.meetsReq(g.item) ? "#ffffff" : "#ff6a5a") : g.gold ? "#e8c547" : g.potion === "hp" ? "#ff8a7a" : "#8ab0ff";
      const tw = ctx.measureText(text).width;
      const w = tw + 12;
      const h = 18 * Math.min(1.25, z);
      let x = this.sx(g.x, g.y) - w / 2;
      let y = this.sy(g.x, g.y) - 16 * z - h;
      // nudge up to avoid overlap
      for (let tries = 0; tries < 6; tries++) {
        const hit = placed.find((o) => x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y);
        if (!hit) break;
        y = hit.y - h - 2;
      }
      if (x + w < 0 || x > this.W || y + h < 0 || y > this.H) continue;
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillRect(x, y, w, h);
      if (g.item) {
        ctx.strokeStyle = "rgba(255,255,255,.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
      ctx.fillStyle = color;
      ctx.fillText(text, x + w / 2, y + h * 0.72);
      const hitR: LabelHit = { g, x, y, w, h };
      placed.push(hitR);
      this.labels.push(hitR);
      x += 0;
    }
  }

  /** Find a ground item under a screen point (label or sprite). */
  hitTest(game: Game, x: number, y: number): GroundItem | null {
    const pad = 8;
    for (const l of this.labels) {
      if (x >= l.x - pad && x <= l.x + l.w + pad && y >= l.y - pad && y <= l.y + l.h + pad) return l.g;
    }
    let best: GroundItem | null = null;
    let bd = 28 * this.zoom;
    for (const g of game.ground) {
      const d = Math.hypot(this.sx(g.x, g.y) - x, this.sy(g.x, g.y) - 10 * this.zoom - y);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    return best;
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
    if (game.stairs) {
      g.fillStyle = "#ffb04a";
      g.fillRect(ox + (game.stairs.x - game.stairs.y) * S - 2.5, oy + (game.stairs.x + game.stairs.y) * S * 0.5 - 2.5, 5, 5);
    }
    for (const m of game.monsters) {
      if (m.state === "dead" || !L.explored[idx(Math.floor(m.x), Math.floor(m.y))]) continue;
      if (Math.hypot(m.x - p.x, m.y - p.y) > 9) continue;
      g.fillStyle = m.def.kind === "boss" ? "#ff40ff" : "#ff3a2a";
      g.fillRect(ox + (m.x - m.y) * S - 1.5, oy + (m.x + m.y) * S * 0.5 - 1.5, 3, 3);
    }
    g.fillStyle = "#4aa0ff";
    g.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);
  }
}
