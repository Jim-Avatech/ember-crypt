import { type Anim, FRAMES, type Model, getFrame } from "../src/sprites/puppet";
const c = document.getElementById("c") as HTMLCanvasElement;
const S = 4;
const rows: [Model, Anim, object][] = [
  ["barb", "idle", { main: "hand_axe", chest: "quilted_armor" }],
  ["barb", "walk", { main: "short_sword", off: "buckler", chest: "chain_mail", head: "full_helm" }],
  ["barb", "atk0", { main: "war_axe", off: "hand_axe", chest: "leather_armor", head: "cap" }],
  ["barb", "atk1", { main: "war_axe", off: "hand_axe", chest: "leather_armor" }],
  ["barb", "walk", { main: "claymore" }],
  ["barb", "death", { main: "mace" }],
  ["zombie", "walk", {}],
  ["zombie", "atk0", {}],
  ["fallen", "walk", {}],
  ["boss", "walk", {}],
  ["vendor", "idle", {}],
];
const params = new URLSearchParams(location.search);
const dir = Number(params.get("dir") ?? 1);
c.width = 8 * 80 * S;
c.height = rows.length * 82 * S;
const g = c.getContext("2d")!;
g.imageSmoothingEnabled = false;
rows.forEach(([m, a, look], r) => {
  for (let f = 0; f < FRAMES[a]; f++) {
    const fr = getFrame(m, look, JSON.stringify(look), a, params.has("dirs") ? f : dir, f);
    g.drawImage(fr.c, f * 80 * S, r * 82 * S, fr.c.width * S, fr.c.height * S);
  }
});
(window as any).done = true;
