import { ITEM_BASES as BASES } from "../src/data/items";
import { itemIcon } from "../src/sprites/items";
import * as T from "../src/sprites/tiles";
const c = document.getElementById("c") as HTMLCanvasElement;
c.width = 1200; c.height = 760;
const g = c.getContext("2d")!;
g.imageSmoothingEnabled = false;
let x = 4, y = 4, rowH = 0;
for (const b of BASES) {
  const ic = itemIcon(b.id);
  if (x + ic.width * 2 > 1200) { x = 4; y += rowH + 6; rowH = 0; }
  g.fillStyle = "#141210"; g.fillRect(x, y, ic.width * 2, ic.height * 2);
  g.drawImage(ic, x, y, ic.width * 2, ic.height * 2);
  x += ic.width * 2 + 6; rowH = Math.max(rowH, ic.height * 2);
}
y += rowH + 10;
const S = 3;
// a little iso patch
const draw = (cv: HTMLCanvasElement, tx: number, ty: number, ox = 0, oy = 0) => {
  const sx = 200 + (tx - ty) * 16 - 16 + ox, sy = (tx + ty) * 8 + oy;
  g.drawImage(cv, sx * S, (y / S + sy - (cv.height - 16)) * S, cv.width * S, cv.height * S);
};
for (let ty = 0; ty < 6; ty++) for (let tx = 0; tx < 6; tx++) {
  if (tx === 0 || ty === 0) draw(T.cryptWall(true), tx, ty);
  else draw(T.cryptFloor((tx * 7 + ty * 3) % 4), tx, ty);
}
draw(T.stairsSprite(), 3, 3);
draw(T.waypointFrames()[0], 4, 2, 0, 0);
for (let ty = 0; ty < 6; ty++) for (let tx = 0; tx < 6; tx++) {
  const ox = 200;
  if (tx === 5) draw(T.fenceWall(true), tx, ty, ox);
  else draw(tx === 2 ? T.dirtTile(ty % 3) : T.grassTile((tx + ty) % 4), tx, ty, ox);
}
g.drawImage(T.treeSprite(0), 960, y, 38 * S, 56 * S);
g.drawImage(T.tentSprite(0), 1000, y + 150, 100 * 2, 84 * 2);
g.drawImage(T.campfireFrames()[0], 860, y + 10, 22 * S, 26 * S);
g.drawImage(T.crateSprite(), 860, y + 100, 18 * S, 18 * S);
g.drawImage(T.barrelSprite(), 920, y + 100, 14 * S, 18 * S);
g.drawImage(T.stumpSprite(), 860, y + 170, 16 * S, 12 * S);
(window as any).done = true;
