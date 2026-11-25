/** Pixel icons for the four act artifacts (20×20), drawn once and cached. */
import { PB, hex } from "../pixel";

const cache = new Map<string, HTMLCanvasElement>();

export function artifactIcon(id: string, silhouette = false): HTMLCanvasElement {
  const key = `${id}|${silhouette}`;
  let c = cache.get(key);
  if (c) return c;
  const pb = new PB(20, 20);
  const S = silhouette;
  const col = (h: string) => hex(S ? "#2a2420" : h);
  if (id === "ember_heart") {
    // a glowing heart in a cage of ribs
    pb.part(pb.mask().disc(7.5, 8, 3.6).disc(12.5, 8, 3.6).poly([[4.2, 9.5], [10, 17], [15.8, 9.5]]), col("#e0401a"));
    pb.fill(pb.mask().disc(8, 8, 1.6).disc(10, 11, 1.4), col("#ffb040"));
    if (!S) pb.set(7, 7, hex("#fff0b0"));
    for (const x of [5, 10, 15]) pb.part(pb.mask().capsule(x, 3, x + (10 - x) * 0.2, 17, 0.5), col("#d8ccb0"), { shade: false });
  } else if (id === "sun_scarab") {
    pb.part(pb.mask().ellipse(10, 11, 5, 5.5), col("#d0a030"));
    pb.part(pb.mask().ellipse(10, 4.5, 2.6, 2), col("#b08020"));
    pb.fill(pb.mask().rect(9.5, 6, 1, 10), col("#7a5410"));
    for (const s of [-1, 1]) for (const y of [8, 11, 14]) pb.part(pb.mask().capsule(10 + s * 4, y, 10 + s * 7.5, y + 1.5, 0.5), col("#8a6018"), { shade: false });
    pb.fill(pb.mask().disc(10, 11, 1.6), col("#3a8ad0"));
  } else if (id === "mire_pearl") {
    pb.part(pb.mask().ellipse(10, 15, 7, 3), col("#5a6a4a"));
    pb.part(pb.mask().disc(10, 9.5, 5.2), col("#2a3a44"));
    pb.fill(pb.mask().disc(8.2, 7.6, 1.6), col("#8ab0c0"));
    if (!S) pb.set(11, 11, hex("#9ad040"));
    if (!S) pb.set(12, 10, hex("#6a9a2a"));
  } else {
    // cinder crown
    pb.part(pb.mask().rect(3, 11, 14, 5).poly([[3, 11], [4, 4], [7, 10], [10, 2], [13, 10], [16, 4], [17, 11]]), col("#2a1e1e"));
    pb.fill(pb.mask().rect(4, 12, 12, 1), col("#6a4a3a"));
    for (const [x, y] of [[4, 4], [10, 2], [16, 4]] as [number, number][]) {
      pb.fill(pb.mask().poly([[x - 1.5, y + 1], [x, y - 2.5], [x + 1.5, y + 1]]), col("#ff6a1a"));
      if (!S) pb.set(x, y - 1, hex("#ffd060"));
    }
    pb.fill(pb.mask().disc(10, 13.5, 1.2), col("#e02a10"));
  }
  pb.outline(hex(S ? "#55483c" : "#140a04"));
  c = pb.canvas();
  cache.set(key, c);
  return c;
}
