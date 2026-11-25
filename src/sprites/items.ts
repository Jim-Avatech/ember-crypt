/** Pixel-art item icons, drawn procedurally per base at a given cell size. */
import { BASE_BY_ID, type Item, lookOf } from "../data/items";
import { LOOK_BY_ID } from "../data/looks";
import { Mask, PB, type RGB, hex, mul, rot90 } from "../pixel";

const STEEL = hex("#c4ccd4");
const STEEL_D = hex("#8a929a");
const WOOD = hex("#7a4e2a");
const WOOD_L = hex("#9a6a3a");
const GOLD = hex("#d0a640");
const LEATHER = hex("#8a5a32");

/** Paint a D2-look icon into a w×h-cell box. */
function paint(baseId: string, cs: number, cw?: number, ch?: number): HTMLCanvasElement {
  const lb = LOOK_BY_ID[baseId];
  const b = { ...lb, w: cw ?? lb.w, h: ch ?? lb.h };
  const W = b.w * cs;
  const H = b.h * cs;
  const pb = new PB(W, H);
  const M = () => pb.mask();
  const u = cs / 16; // design unit: 16 per cell
  const cx = W / 2;
  const part = (m: Mask, c: RGB, pattern?: (x: number, y: number) => number) => pb.part(m, c, { edge: true, pattern });
  const id = baseId;
  switch (b.kind) {
    case "sword": {
      const wide = b.w === 2 || b.hands === 2;
      const bw = wide ? 2.6 * u : 1.7 * u;
      const guardY = H * (b.hands === 2 ? 0.74 : 0.7);
      const curve = id === "scimitar" || id === "sabre" ? 2.2 * u : 0;
      const tipY = 2 * u;
      const blade = M();
      const pts: [number, number][] = [
        [cx - bw + curve * 0.2, guardY], [cx - bw + curve, H * 0.3], [cx + curve * 0.6, tipY], [cx + bw + curve * 0.6, H * 0.28], [cx + bw, guardY],
      ];
      if (id === "falchion") pts.splice(3, 1, [cx + bw * 1.8, H * 0.22]);
      blade.poly(pts);
      part(blade, STEEL);
      const fuller = M().capsule(cx + curve * 0.4, tipY + 5 * u, cx, guardY - 2 * u, 0.4 * u);
      pb.part(fuller, mul(STEEL, 0.82), { shade: false });
      part(M().rect(cx - (wide ? 6 : 4.5) * u, guardY, (wide ? 12 : 9) * u, 1.8 * u), GOLD);
      part(M().rect(cx - 1.1 * u, guardY + 1.8 * u, 2.2 * u, H - guardY - 4.6 * u), hex("#4a2c16"), (_x, y) => (y % 2 ? 0.8 : 1));
      part(M().disc(cx, H - 2.2 * u, 1.7 * u), GOLD);
      break;
    }
    case "axe": {
      const two = b.hands === 2;
      const hx = b.w === 2 ? cx - 2 * u : cx;
      part(M().rect(hx - 1 * u, 3 * u, 2 * u, H - 4 * u), WOOD, (_x, y) => (y % 3 === 0 ? 0.85 : 1));
      const top = 3 * u;
      const size = b.w === 2 ? 1 : 0.65;
      const head = M().poly([
        [hx + 1 * u, top + 1 * u], [hx + 11 * u * size, top - 1 * u], [hx + 13 * u * size, top + 9 * u * size], [hx + 11 * u * size, top + 16 * u * size], [hx + 1 * u, top + 8 * u],
      ]);
      part(head, STEEL);
      pb.part(M().capsule(hx + 12 * u * size, top + 1 * u, hx + 12 * u * size, top + 14 * u * size, 0.5 * u), hex("#eef2f6"), { shade: false });
      if (id === "double_axe" || id === "battle_axe" || id === "broad_axe" || two) {
        const h2 = M().poly([[hx - 1 * u, top + 1 * u], [hx - 9 * u * size, top], [hx - 11 * u * size, top + 8 * u * size], [hx - 9 * u * size, top + 14 * u * size], [hx - 1 * u, top + 8 * u]]);
        part(h2, STEEL);
      }
      if (id === "military_pick") part(M().poly([[hx - 1 * u, top + 3 * u], [hx - 10 * u, top + 9 * u], [hx - 1 * u, top + 6 * u]]), STEEL_D);
      break;
    }
    case "mace": {
      const club = id === "club" || id === "spiked_club";
      const two = b.hands === 2;
      if (club) {
        part(M().poly([[cx - 1.3 * u, H - 2 * u], [cx + 1.3 * u, H - 2 * u], [cx + 3.6 * u, 3 * u], [cx, 1 * u], [cx - 3.6 * u, 3 * u]]), WOOD_L, (_x, y) => (y % 4 === 0 ? 0.85 : 1));
        if (id === "spiked_club") for (let i = 0; i < 5; i++) part(M().capsule(cx + (i % 2 ? 4 : -4) * u, (4 + i * 3) * u, cx + (i % 2 ? 6 : -6) * u, (3 + i * 3) * u, 0.6 * u), STEEL);
        break;
      }
      part(M().rect(cx - 1 * u, 8 * u, 2 * u, H - 9 * u), WOOD);
      if (id === "flail") {
        for (let i = 0; i < 3; i++) part(M().disc(cx + (2 + i * 2) * u, (8 - i * 2.4) * u, 0.9 * u), STEEL_D);
        part(M().disc(cx + 8 * u, 3.6 * u, 3.2 * u), STEEL_D);
        break;
      }
      if (two) {
        part(M().rect(cx - 7 * u, 2 * u, 14 * u, 8 * u), STEEL_D);
        break;
      }
      part(M().disc(cx, 6 * u, (id === "morning_star" ? 4 : 3.6) * u), id === "morning_star" ? STEEL_D : STEEL, id === "mace" ? (x) => ((x % 3) === 0 ? 0.75 : 1) : undefined);
      if (id === "morning_star") for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        part(M().capsule(cx + Math.cos(a) * 3.5 * u, 6 * u + Math.sin(a) * 3.5 * u, cx + Math.cos(a) * 6 * u, 6 * u + Math.sin(a) * 6 * u, 0.5 * u), STEEL);
      }
      break;
    }
    case "knife": {
      // a small leaf blade with a wrapped grip, pointing up
      const tip = 1.5 * u;
      const guard = H * 0.58;
      part(M().poly([[cx - 2.2 * u, guard], [cx - 1.4 * u, H * 0.25], [cx, tip], [cx + 1.4 * u, H * 0.25], [cx + 2.2 * u, guard]]), STEEL);
      pb.part(M().capsule(cx, tip + 3 * u, cx, guard - 1.5 * u, 0.35 * u), mul(STEEL, 0.8), { shade: false });
      part(M().rect(cx - 3 * u, guard, 6 * u, 1.4 * u), STEEL_D);
      part(M().rect(cx - 1 * u, guard + 1.4 * u, 2 * u, H - guard - 3.6 * u), LEATHER, (_x, y) => (y % 2 ? 0.75 : 1));
      part(M().disc(cx, H - 2 * u, 1.4 * u), STEEL_D);
      break;
    }
    case "spear": {
      // javelin: long shaft, leaf-shaped head, small fletching wrap
      part(M().rect(cx - 0.8 * u, 7 * u, 1.6 * u, H - 8 * u), WOOD_L, (_x, y) => (y % 5 === 0 ? 0.85 : 1));
      part(M().poly([[cx, 0.8 * u], [cx + 2.4 * u, 5 * u], [cx + 0.9 * u, 8.5 * u], [cx - 0.9 * u, 8.5 * u], [cx - 2.4 * u, 5 * u]]), STEEL);
      part(M().rect(cx - 1.3 * u, H * 0.55, 2.6 * u, 2.4 * u), LEATHER);
      part(M().rect(cx - 1.1 * u, H - 3 * u, 2.2 * u, 1.6 * u), STEEL_D);
      break;
    }
    case "staff": {
      // quarterstaff: long wooden pole with iron caps and a leather grip in the middle
      part(M().rect(cx - 1.3 * u, 2 * u, 2.6 * u, H - 4 * u), WOOD, (_x, y) => (y % 4 === 0 ? 0.82 : y % 7 === 0 ? 1.12 : 1));
      part(M().rect(cx - 1.7 * u, 1 * u, 3.4 * u, 3 * u), STEEL_D);
      part(M().rect(cx - 1.7 * u, H - 4 * u, 3.4 * u, 3 * u), STEEL_D);
      part(M().rect(cx - 1.6 * u, H * 0.44, 3.2 * u, H * 0.12), LEATHER, (_x, y) => (y % 2 ? 0.75 : 1));
      break;
    }
    case "armor": {
      const q = b.qlvl;
      const c = q >= 11 ? hex("#9aa2aa") : id === "quilted_armor" ? hex("#b8a47c") : id === "studded_leather" ? hex("#74482a") : id === "hard_leather" ? hex("#6a4224") : LEATHER;
      const pat =
        id === "chain_mail" ? (x: number, y: number) => ((x ^ y) & 1 ? 0.82 : 1.06)
        : id === "ring_mail" ? (x: number, y: number) => ((x + (y % 2)) % 2 ? 0.85 : 1.05)
        : id === "scale_mail" ? (x: number, y: number) => ((x + ((y >> 1) % 2)) % 3 === 0 ? 0.75 : 1)
        : id === "studded_leather" ? (x: number, y: number) => (x % 4 === 0 && y % 4 === 0 ? 1.8 : 1)
        : id === "quilted_armor" ? (x: number, y: number) => ((x + y) % 5 === 0 ? 0.82 : 1)
        : undefined;
      const m = M().poly([
        [3 * u, 6 * u], [10 * u, 3 * u], [cx, 7 * u], [W - 10 * u, 3 * u], [W - 3 * u, 6 * u], [W - 1 * u, 20 * u], [W - 6 * u, 21 * u],
        [W - 7 * u, H - 3 * u], [7 * u, H - 3 * u], [6 * u, 21 * u], [1 * u, 20 * u],
      ]);
      part(m, c, pat);
      part(M().rect(7 * u, H - 13 * u, W - 14 * u, 2 * u), hex("#4a2e18"));
      break;
    }
    case "helm": {
      const q = b.qlvl;
      const c = q >= 11 ? hex("#a8b0b8") : q >= 5 ? hex("#8e7458") : hex("#7a5636");
      part(M().ellipse(cx, 15 * u, 12 * u, 11 * u).rect(cx - 12 * u, 15 * u, 24 * u, 9 * u), c);
      part(M().rect(cx - 13 * u, 22 * u, 26 * u, 3 * u), mul(c, 0.85));
      if (q >= 11) part(M().rect(cx - 8 * u, 16 * u, 16 * u, 2 * u).rect(cx - 1 * u, 16 * u, 2 * u, 7 * u), hex("#1a1210"));
      if (q >= 15) for (const s of [-1, 1]) part(M().poly([[cx + s * 10 * u, 10 * u], [cx + s * 15 * u, 1 * u], [cx + s * 13 * u, 11 * u]]), hex("#e6dcc0"));
      break;
    }
    case "shield": {
      const wood = hex("#6e4a2a");
      if (id === "kite_shield") part(M().poly([[3 * u, 4 * u], [W - 3 * u, 4 * u], [W - 3 * u, H * 0.45], [cx, H - 2 * u], [3 * u, H * 0.45]]), wood, (x) => (x % 5 === 0 ? 0.8 : 1));
      else if (b.h === 3) part(M().rect(3 * u, 3 * u, W - 6 * u, H - 6 * u), wood, (x) => (x % 5 === 0 ? 0.8 : 1));
      else part(M().disc(cx, H / 2, (id === "buckler" ? 11 : 13.5) * u), wood, (x) => (x % 5 === 0 ? 0.8 : 1));
      part(M().disc(cx, H / 2, 3.5 * u), STEEL);
      break;
    }
    case "gloves": {
      const c = b.qlvl >= 12 ? hex("#9aa2aa") : b.qlvl >= 7 ? hex("#5a4030") : hex("#8a6440");
      part(M().poly([[8 * u, H - 2 * u], [8 * u, 16 * u], [4 * u, 10 * u], [7 * u, 8 * u], [11 * u, 12 * u], [11 * u, 3 * u], [15 * u, 3 * u], [16 * u, 10 * u], [18 * u, 3 * u], [22 * u, 4 * u], [21 * u, 12 * u], [25 * u, 7 * u], [28 * u, 9 * u], [23 * u, 19 * u], [23 * u, H - 2 * u]]), c);
      part(M().rect(8 * u, H - 7 * u, 15 * u, 3 * u), mul(c, 0.75));
      break;
    }
    case "boots": {
      const c = b.qlvl >= 12 ? hex("#9aa2aa") : b.qlvl >= 7 ? hex("#4a3626") : hex("#7a5634");
      part(M().poly([[9 * u, 3 * u], [20 * u, 3 * u], [20 * u, 20 * u], [29 * u, 24 * u], [29 * u, 29 * u], [7 * u, 29 * u]]), c);
      part(M().rect(9 * u, 7 * u, 11 * u, 2 * u), mul(c, 0.7));
      break;
    }
    case "belt": {
      const c = b.qlvl >= 12 ? hex("#5a3a22") : LEATHER;
      part(M().rect(1 * u, 5 * u, W - 2 * u, 6 * u), c);
      part(M().rect(cx - 3 * u, 4 * u, 6 * u, 8 * u), GOLD);
      part(M().rect(cx - 1 * u, 6 * u, 2 * u, 4 * u), hex("#3a2a14"));
      for (const x of [5, W / u - 9]) part(M().rect(x * u, 9 * u, 4 * u, 5 * u), mul(c, 0.8));
      break;
    }
    case "ring": {
      const c = id === "gold_ring" ? GOLD : id === "silver_ring" ? hex("#d0d6dc") : hex("#c07a48");
      const m = M().disc(cx, 9 * u, 5 * u);
      const hole = M().disc(cx, 9 * u, 2.6 * u);
      for (let i = 0; i < m.m.length; i++) if (hole.m[i]) m.m[i] = 0;
      part(m, c);
      part(M().disc(cx, 4 * u, 2 * u), id === "gold_ring" ? hex("#d02a2a") : id === "silver_ring" ? hex("#3a7ae0") : hex("#40b060"));
      break;
    }
    case "amulet": {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.15 + (i / 8) * 0.7);
        pb.set(cx + Math.cos(a) * 6 * u, 3 * u + Math.sin(a) * 4 * u, GOLD);
      }
      part(M().ellipse(cx, 11 * u, 3.2 * u, 4 * u), id === "jade_amulet" ? hex("#3aa070") : hex("#e0d6bc"));
      break;
    }
    case "potion": {
      const c = b.potion === "hp" ? hex("#d0261c") : hex("#2a5ad8");
      part(M().rect(cx - 2 * u, 2 * u, 4 * u, 4 * u), hex("#8a6a4a"));
      part(M().rect(cx - 2 * u, 5 * u, 4 * u, 3 * u), hex("#c8d4dc"));
      part(M().disc(cx, 10.5 * u, 4.5 * u), c);
      pb.set(cx - 2 * u, 9 * u, hex("#ffffff"));
      break;
    }
  }
  pb.outline(hex("#0e0a08"));
  return pb.canvas();
}

const cache = new Map<string, HTMLCanvasElement>();
const urls = new Map<string, string>();

/** Icon key: which look, drawn at the item class's grid size. */
function lookKey(it: Item | string): { look: string; w: number; h: number; key: string } {
  const item: Item = typeof it === "string" ? { uid: 0, baseId: it } : it;
  const look = lookOf(item) ?? "short_sword";
  const cls = BASE_BY_ID[item.baseId] ?? LOOK_BY_ID[look];
  return { look, w: cls.w, h: cls.h, key: `${look}:${cls.w}x${cls.h}` };
}

/** Inventory icon: 16 px per grid cell. */
export function itemIcon(it: Item | string): HTMLCanvasElement {
  const { look, w, h, key } = lookKey(it);
  const k = `i:${key}`;
  let c = cache.get(k);
  if (!c) {
    c = paint(look, 16, w, h);
    cache.set(k, c);
  }
  return c;
}

export function itemIconUrl(it: Item | string): string {
  const { key } = lookKey(it);
  let u = urls.get(key);
  if (!u) {
    u = itemIcon(it).toDataURL();
    urls.set(key, u);
  }
  return u;
}

/** Small sprite for an item lying on the ground (long items lie sideways). */
export function groundSprite(it: Item): HTMLCanvasElement {
  const { look, w, h, key } = lookKey(it);
  const k = `g:${key}`;
  let c = cache.get(k);
  if (!c) {
    const b = LOOK_BY_ID[look];
    const cs = b.kind === "potion" || b.kind === "ring" || b.kind === "amulet" ? 8 : h >= 3 ? 5 : 6;
    c = paint(look, cs, w, h);
    if (h > w && b.slot === "weapon") c = rot90(c);
    cache.set(k, c);
  }
  return c;
}

export function goldSprite(): HTMLCanvasElement {
  let c = cache.get("gold");
  if (!c) {
    const pb = new PB(12, 8);
    for (const [x, y] of [[3, 5], [7, 5], [5, 3], [8, 2], [2, 2]]) pb.part(pb.mask().ellipse(x, y, 2.2, 1.4), hex("#e8b730"), { edge: true });
    pb.outline(hex("#3a2606"));
    c = pb.canvas();
    cache.set("gold", c);
  }
  return c;
}
