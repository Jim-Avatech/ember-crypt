/**
 * Tiny pixel-art rasterizer. Shapes are rasterized without anti-aliasing into masks,
 * then composited with simple top-left lighting, inner edges and a dark outline.
 */
export type RGB = [number, number, number];

export const hex = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mul = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Deterministic hash noise in [0,1). */
export function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Mask {
  m: Uint8Array;
  constructor(public w: number, public h: number) {
    this.m = new Uint8Array(w * h);
  }
  has(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.m[y * this.w + x] === 1;
  }
  set(x: number, y: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.m[y * this.w + x] = 1;
    return this;
  }
  rect(x: number, y: number, w: number, h: number) {
    for (let yy = Math.floor(y); yy < Math.floor(y + h); yy++) for (let xx = Math.floor(x); xx < Math.floor(x + w); xx++) this.set(xx, yy);
    return this;
  }
  /** Filled capsule (thick line) between two points. */
  capsule(x0: number, y0: number, x1: number, y1: number, r: number) {
    const minx = Math.floor(Math.min(x0, x1) - r - 1);
    const maxx = Math.ceil(Math.max(x0, x1) + r + 1);
    const miny = Math.floor(Math.min(y0, y1) - r - 1);
    const maxy = Math.ceil(Math.max(y0, y1) + r + 1);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = dx * dx + dy * dy || 1e-6;
    const rr = (r + 0.02) * (r + 0.02);
    for (let y = miny; y <= maxy; y++)
      for (let x = minx; x <= maxx; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let t = ((px - x0) * dx + (py - y0) * dy) / L;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = x0 + dx * t - px;
        const qy = y0 + dy * t - py;
        if (qx * qx + qy * qy <= rr) this.set(x, y);
      }
    return this;
  }
  disc(cx: number, cy: number, r: number) {
    return this.ellipse(cx, cy, r, r);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const nx = (x + 0.5 - cx) / (rx + 0.02);
        const ny = (y + 0.5 - cy) / (ry + 0.02);
        if (nx * nx + ny * ny <= 1) this.set(x, y);
      }
    return this;
  }
  poly(pts: [number, number][]) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++)
      for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i];
          const [xj, yj] = pts[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y);
      }
    return this;
  }
}

export interface PartOpts {
  /** top-left highlight and bottom-right shadow (default on) */
  shade?: boolean;
  /** darken where this part's edge sits on top of another part */
  edge?: boolean;
  /** per-pixel brightness multiplier, e.g. a chainmail checker */
  pattern?: (x: number, y: number) => number;
  hi?: number;
  lo?: number;
}

export class PB {
  px: Uint8ClampedArray;
  constructor(public w: number, public h: number) {
    this.px = new Uint8ClampedArray(w * h * 4);
  }
  mask() {
    return new Mask(this.w, this.h);
  }
  alpha(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.px[(y * this.w + x) * 4 + 3];
  }
  set(x: number, y: number, c: RGB, a = 255) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
    this.px[i + 3] = a;
  }
  get(x: number, y: number): RGB {
    const i = (y * this.w + x) * 4;
    return [this.px[i], this.px[i + 1], this.px[i + 2]];
  }
  /** Composite a mask in a base color with pixel shading. */
  part(m: Mask, base: RGB, o: PartOpts = {}) {
    const shade = o.shade ?? true;
    const hi = o.hi ?? 1.22;
    const lo = o.lo ?? 0.7;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (!m.has(x, y)) continue;
        let k = 1;
        if (shade) {
          if (!m.has(x - 1, y - 1) || !m.has(x, y - 1)) k = hi;
          else if (!m.has(x + 1, y + 1) || !m.has(x, y + 1)) k = lo;
        }
        if (o.pattern) k *= o.pattern(x, y);
        if (o.edge) {
          const out = (xx: number, yy: number) => !m.has(xx, yy) && this.alpha(xx, yy) > 0;
          if (out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || out(x, y + 1)) k *= 0.62;
        }
        this.set(x, y, mul(base, k));
      }
  }
  /** Flat fill without shading. */
  fill(m: Mask, c: RGB, a = 255) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (m.has(x, y)) this.set(x, y, c, a);
  }
  /** One-pixel outline around everything opaque. */
  outline(c: RGB = [16, 10, 8]) {
    const src = new Uint8Array(this.w * this.h);
    for (let i = 0; i < src.length; i++) src[i] = this.px[i * 4 + 3] > 0 ? 1 : 0;
    const on = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && src[y * this.w + x] === 1;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (on(x, y)) continue;
        if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) this.set(x, y, c);
      }
  }
  canvas(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = this.w;
    c.height = this.h;
    const g = c.getContext("2d")!;
    const img = g.createImageData(this.w, this.h);
    img.data.set(this.px);
    g.putImageData(img, 0, 0);
    return c;
  }
}

/** A white silhouette of a sprite, for hit flashes. */
export function whiteOf(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Rotate a canvas 90° clockwise (pixel-exact). */
export function rot90(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.height;
  c.height = src.width;
  const g = c.getContext("2d")!;
  g.translate(c.width, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(src, 0, 0);
  return c;
}
