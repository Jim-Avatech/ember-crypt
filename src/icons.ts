import { BASE_BY_ID, type Item, type Kind } from "./data/items";

/** Procedural item icons, drawn once per base and cached. */
const cache = new Map<string, HTMLCanvasElement>();
const urlCache = new Map<string, string>();

function variantOf(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function itemIcon(baseId: string, size = 64): HTMLCanvasElement {
  const key = `${baseId}@${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  g.scale(size / 64, size / 64);
  const b = BASE_BY_ID[baseId];
  drawKind(g, b.kind, variantOf(baseId), b.qlvl);
  cache.set(key, c);
  return c;
}

export function itemIconUrl(it: Item | string): string {
  const id = typeof it === "string" ? it : it.baseId;
  let u = urlCache.get(id);
  if (!u) {
    u = itemIcon(id, 96).toDataURL();
    urlCache.set(id, u);
  }
  return u;
}

const metal = (q: number) => (q > 14 ? "#d8dde2" : q > 7 ? "#b9c0c7" : "#9aa1a8");

function drawKind(g: CanvasRenderingContext2D, kind: Kind, v: number, q: number) {
  g.lineJoin = "round";
  g.lineCap = "round";
  g.strokeStyle = "#111";
  g.lineWidth = 2.5;
  const wood = "#7a4e2a";
  const m = metal(q);
  switch (kind) {
    case "sword": {
      const len = 30 + (q % 10);
      const wide = 4 + (v % 3);
      g.save();
      g.translate(32, 32);
      g.rotate(-Math.PI / 4);
      g.fillStyle = m;
      g.beginPath();
      g.moveTo(-wide / 2, 6);
      g.lineTo(-wide / 2, 6 - len);
      g.lineTo(0, 6 - len - 6);
      g.lineTo(wide / 2, 6 - len);
      g.lineTo(wide / 2, 6);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,.6)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, 4);
      g.lineTo(0, 4 - len);
      g.stroke();
      g.strokeStyle = "#111";
      g.lineWidth = 2.5;
      g.fillStyle = "#8a6a2a";
      g.fillRect(-9, 6, 18, 4);
      g.strokeRect(-9, 6, 18, 4);
      g.fillStyle = "#4a2e18";
      g.fillRect(-2.5, 10, 5, 11);
      g.strokeRect(-2.5, 10, 5, 11);
      g.fillStyle = "#8a6a2a";
      g.beginPath();
      g.arc(0, 23, 3.5, 0, 7);
      g.fill();
      g.stroke();
      g.restore();
      break;
    }
    case "axe": {
      g.save();
      g.translate(32, 32);
      g.rotate(-Math.PI / 5);
      g.fillStyle = wood;
      g.fillRect(-3, -24, 6, 50);
      g.strokeRect(-3, -24, 6, 50);
      const big = q > 12;
      g.fillStyle = m;
      g.beginPath();
      g.moveTo(2, -22);
      g.quadraticCurveTo(20, -26, big ? 24 : 18, big ? -6 : -10);
      g.quadraticCurveTo(14, -10, 2, -8);
      g.closePath();
      g.fill();
      g.stroke();
      if (big) {
        g.beginPath();
        g.moveTo(-2, -22);
        g.quadraticCurveTo(-18, -24, -20, -8);
        g.quadraticCurveTo(-12, -10, -2, -10);
        g.closePath();
        g.fill();
        g.stroke();
      }
      g.restore();
      break;
    }
    case "mace": {
      g.save();
      g.translate(32, 32);
      g.rotate(-Math.PI / 4);
      g.fillStyle = wood;
      g.fillRect(-3, -8, 6, 34);
      g.strokeRect(-3, -8, 6, 34);
      const isClub = q <= 4 && v % 2 === 0;
      g.fillStyle = isClub ? "#8a5a30" : m;
      g.beginPath();
      g.ellipse(0, -16, isClub ? 7 : 9, isClub ? 13 : 10, 0, 0, 7);
      g.fill();
      g.stroke();
      if (!isClub || q === 4) {
        g.fillStyle = m;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          g.beginPath();
          g.moveTo(Math.cos(a) * 8, -16 + Math.sin(a) * 8);
          g.lineTo(Math.cos(a) * 14, -16 + Math.sin(a) * 14);
          g.stroke();
        }
      }
      g.restore();
      break;
    }
    case "armor": {
      const col = q > 10 ? m : q > 4 ? "#7a5a3a" : "#8c7a5c";
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(14, 14);
      g.lineTo(24, 10);
      g.quadraticCurveTo(32, 16, 40, 10);
      g.lineTo(50, 14);
      g.lineTo(54, 30);
      g.lineTo(46, 30);
      g.lineTo(46, 54);
      g.lineTo(18, 54);
      g.lineTo(18, 30);
      g.lineTo(10, 30);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = "rgba(0,0,0,.35)";
      g.lineWidth = 1.5;
      for (let y = 22; y < 52; y += 6) {
        g.beginPath();
        g.moveTo(19, y);
        g.lineTo(45, y);
        g.stroke();
      }
      if (q > 10) {
        g.fillStyle = "rgba(255,255,255,.25)";
        for (let y = 20; y < 52; y += 4) for (let x = 21; x < 45; x += 4) g.fillRect(x + ((y / 4) % 2) * 2, y, 2, 2);
      }
      break;
    }
    case "helm": {
      g.fillStyle = q > 4 ? m : "#8c6a44";
      g.beginPath();
      g.moveTo(14, 44);
      g.quadraticCurveTo(12, 14, 32, 12);
      g.quadraticCurveTo(52, 14, 50, 44);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = "rgba(0,0,0,.55)";
      if (q > 10) {
        g.fillRect(20, 28, 24, 5);
        g.fillRect(29, 28, 6, 14);
      }
      g.fillStyle = "rgba(255,255,255,.3)";
      g.fillRect(30, 14, 4, 12);
      break;
    }
    case "shield": {
      g.fillStyle = q > 4 ? "#6b4a2a" : "#7a5a36";
      g.beginPath();
      if (q > 8) {
        g.moveTo(14, 10);
        g.lineTo(50, 10);
        g.lineTo(50, 34);
        g.quadraticCurveTo(48, 50, 32, 56);
        g.quadraticCurveTo(16, 50, 14, 34);
        g.closePath();
      } else g.arc(32, 32, q > 4 ? 22 : 17, 0, 7);
      g.fill();
      g.stroke();
      g.fillStyle = m;
      g.beginPath();
      g.arc(32, 32, 6, 0, 7);
      g.fill();
      g.stroke();
      break;
    }
    case "gloves": {
      g.fillStyle = q > 5 ? "#5a4030" : "#8a6440";
      g.beginPath();
      g.moveTo(20, 54);
      g.lineTo(20, 30);
      g.lineTo(16, 22);
      g.lineTo(22, 18);
      g.lineTo(26, 24);
      g.lineTo(26, 10);
      g.lineTo(32, 10);
      g.lineTo(33, 22);
      g.lineTo(36, 10);
      g.lineTo(42, 12);
      g.lineTo(40, 24);
      g.lineTo(46, 16);
      g.lineTo(50, 20);
      g.lineTo(44, 34);
      g.lineTo(44, 54);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case "boots": {
      g.fillStyle = q > 5 ? "#4a3626" : "#7a5634";
      g.beginPath();
      g.moveTo(22, 10);
      g.lineTo(38, 10);
      g.lineTo(38, 40);
      g.lineTo(54, 46);
      g.lineTo(54, 54);
      g.lineTo(20, 54);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = "rgba(0,0,0,.35)";
      g.fillRect(22, 18, 16, 3);
      break;
    }
  }
}

/** Small potion and gold icons for the ground. */
export function potionIcon(kind: "hp" | "mp", size = 32): HTMLCanvasElement {
  const key = `pot-${kind}@${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  g.scale(size / 32, size / 32);
  g.strokeStyle = "#111";
  g.lineWidth = 1.5;
  g.fillStyle = "rgba(220,230,240,.6)";
  g.fillRect(13, 5, 6, 7);
  g.strokeRect(13, 5, 6, 7);
  g.fillStyle = kind === "hp" ? "#d0261c" : "#2a5ad8";
  g.beginPath();
  g.arc(16, 19, 9, 0, 7);
  g.fill();
  g.stroke();
  g.fillStyle = "rgba(255,255,255,.55)";
  g.beginPath();
  g.arc(13, 16, 2.5, 0, 7);
  g.fill();
  g.fillStyle = "#6a4a2a";
  g.fillRect(13, 3, 6, 3);
  cache.set(key, c);
  return c;
}

export function goldIcon(size = 32): HTMLCanvasElement {
  const key = `gold@${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  g.scale(size / 32, size / 32);
  const coins = [
    [10, 22], [18, 23], [14, 18], [22, 19], [17, 14],
  ];
  for (const [x, y] of coins) {
    g.fillStyle = "#e8b730";
    g.strokeStyle = "#5a3c08";
    g.lineWidth = 1.2;
    g.beginPath();
    g.ellipse(x, y, 5, 3, 0, 0, 7);
    g.fill();
    g.stroke();
  }
  cache.set(key, c);
  return c;
}
