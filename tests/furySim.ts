// v1.4: Lightning Fury vs Lightning Strike DPS, measured through the real game loop (Game.update with the skill held
// in slot 1): an Amazon with the same javelin, same level and attributes, against a pack of 1-5 real monsters of her
// level (their real defense and level, so misses count), standing still and harmless. DPS = life taken / game time.
import { mlvlOf } from "../src/data/acts";
import { makeItem } from "../src/data/items";
import { MAX_FLOOR } from "../src/data/acts";
import { Game, type GameEvents, type Monster } from "../src/game";

const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };
const press = { mx: 0, my: 0, mag: 0, attack: false, skills: [true, false, false] };

export const SIM_LEVELS = [1, 5, 10, 20];
export const SIM_PACKS = [1, 3, 5];
/** Character level used with each skill level: Strike and Fury unlock at 30. */
export const charLevelFor = (skill: number) => 29 + skill + Math.floor(skill / 2);

export function simDps(skill: "lightning_strike" | "lightning_fury", lvl: number, pack: number, seconds = 40): number {
  const g = new Game(events, null, 11, { cls: "amazon", name: "" });
  const p = g.player;
  const cl = charLevelFor(lvl);
  let floor = 1;
  while (floor < MAX_FLOOR && mlvlOf(floor) < cl) floor++;
  p.level = cl;
  p.base.dex = 40 + cl * 3;
  p.base.str = 30 + cl * 2;
  p.equip = { main: makeItem("javelin", cl) };
  g.goDungeon(floor);
  p.skills = { [skill]: lvl };
  p.slots = [skill, "", ""];
  const R = [...g.level.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const proto = g.monsters.find((m) => m.def.rank === "normal" && !m.elite)!;
  const cx = R.cx + 0.5;
  const cy = R.cy + 0.5;
  // a tight pack: one in front, the rest in a ring 1 tile around it
  const spots = [{ x: cx, y: cy }, ...Array.from({ length: 4 }, (_, i) => ({ x: cx + Math.cos(i * 1.57 + 0.4), y: cy + Math.sin(i * 1.57 + 0.4) }))];
  const ms: Monster[] = spots.slice(0, pack).map((s, i) => {
    const m = { ...proto, id: 9e6 + i, fuse: -1, x: s.x, y: s.y, state: "chase", hp: 1e9, maxHp: 1e9, kx: 0, ky: 0, frozenT: 0, chillT: 0, stunT: 0 } as Monster;
    m.def = { ...proto.def, speed: 0, dmgMin: 0, dmgMax: 0 } as Monster["def"];
    return m;
  });
  g.monsters = ms;
  g.allies = [];
  g.projectiles = [];
  // Strike from melee reach, Fury from 5 tiles away (both facing the pack from the west)
  const px = skill === "lightning_strike" ? cx - 1.5 : cx - 5;
  const dt = 1 / 60;
  const frames = Math.round(seconds / dt);
  let taken = 0;
  for (let f = 0; f < frames; f++) {
    p.x = px; p.y = cy; p.mana = 999; p.hp = 1e6; p.moveTarget = null;
    p.equip.main!.qty = 150;
    const before = ms.reduce((a, m) => a + m.hp, 0);
    g.update(dt, press);
    taken += before - ms.reduce((a, m) => a + m.hp, 0);
    ms.forEach((m, i) => { m.x = spots[i].x; m.y = spots[i].y; m.kx = 0; m.ky = 0; m.state = "chase"; m.fuse = -1; m.hp = 1e9; });
  }
  return taken / seconds;
}
