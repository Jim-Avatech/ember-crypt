/**
 * v1.5: resistances and leech in their colours everywhere (Character screen, item cards, shop, compare): green poison,
 * yellow lightning, red fire, blue cold; life leech red, mana leech blue. Order on the Character row: poison,
 * lightning, fire, cold. Colours are in styles.css (.r-poison, .r-light, .r-fire, .r-cold, .lleech, .mleech).
 */
import { modText } from "./data/affixes";
import type { Mod } from "./data/items";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const RES_ORDER = ["poison", "light", "fire", "cold"] as const;
export const RES_LABEL: Record<(typeof RES_ORDER)[number], string> = { poison: "Poison", light: "Lightning", fire: "Fire", cold: "Cold" };
export const RES_CLASS: Record<(typeof RES_ORDER)[number], string> = { poison: "r-poison", light: "r-light", fire: "r-fire", cold: "r-cold" };
export const MOD_TINT: Partial<Record<Mod["s"], string>> = { fres: "r-fire", cres: "r-cold", lres: "r-light", pres: "r-poison", ll: "lleech", ml: "mleech" };
/** One item stat line: magic blue, or its resistance / leech colour (All Resistances gets a dot in each). */
export function modLine(m: Mod): string {
  if (m.s === "ares") return `<span class="mod rall">${esc(modText(m))} <i class="r-poison">●</i><i class="r-light">●</i><i class="r-fire">●</i><i class="r-cold">●</i></span>`;
  const t = MOD_TINT[m.s];
  return `<span class="mod${t ? ` ${t}` : ""}">${esc(modText(m))}</span>`;
}
