import { GRID_H, GRID_W, STASH_H, STASH_W } from "./inventory";
/**
 * In-game wiki ("Guide" tab). Every table is generated from the game data, so it stays in sync
 * when classes, affixes, monsters or skills change.
 */
import { AFFIXES, type Cat, MAGIC_SPLIT, RARE_COUNTS, modText, qualityOdds } from "./data/affixes";
import {
  CLASS_USE, ITEM_BASES, type ItemBase, type Mod, QUALITY_COLOR, baseDamage, baseDefense, beltSlotsOf, makeItem,
} from "./data/items";
import { ACTS, ARTIFACT_COLOR, LEVELS_PER_ACT, XP_RATE, firstFloorOf, mlvlOf } from "./data/acts";
import { ELEM_COLOR, ELEM_NAME, ELITE_MODS, MONSTERS, type MonsterDef, scaleDmg, scaleHp, scaleXp } from "./data/monsters";
import { artifactIcon } from "./sprites/artifacts";
import { MAX_SKILL_LVL, SKILLS, SKILL_BY_ID, TAB_NAMES } from "./data/skills";
import { itemIconUrl } from "./sprites/items";

export type GuideSec = "classes" | "levels" | "affixes" | "rarity" | "acts" | "monsters" | "skills";
export const GUIDE_SECS: [GuideSec, string][] = [
  ["classes", "Item classes"],
  ["levels", "Stats by level"],
  ["affixes", "Affixes"],
  ["rarity", "Rarity & drops"],
  ["acts", "Acts & artifacts"],
  ["monsters", "Monsters"],
  ["skills", "Skills"],
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const LEVELS = [1, 3, 5, 8, 10, 12, 15, 20, 25, 30];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const reqText = (p: [number, number] | undefined, name: string) => (p ? `${name} ${p[0]} + ${p[1]}×ilvl` : "");
const CAT_LABEL: Record<Cat, string> = {
  weapon: "Weapons", armor: "Armor", helm: "Helms", shield: "Shields", gloves: "Gloves", boots: "Boots", belt: "Belts", ring: "Rings", amulet: "Amulets",
};

function classesHtml(): string {
  const rows = ITEM_BASES.map((b) => {
    const icon = `<img class="gicon" src="${itemIconUrl(b.id)}" alt="" style="width:${b.w * 14}px;height:${b.h * 14}px"/>`;
    const facts: string[] = [`${b.w}×${b.h} grid`];
    if (b.slot === "weapon") {
      facts.push(`${b.hands === 2 ? "Two-handed" : "One-handed"}`, `Speed ${b.speedLabel} (${b.speed!.toFixed(2)} s/swing)`);
      const [lo, hi] = b.spread!;
      facts.push(`Damage spread ${lo}–${hi}× average`, `Damage ×${b.dmgMul} vs base`);
      if (b.thrown) facts.push(`Throws: stack of ${b.thrown.max}, range ${b.thrown.range}`);
      const mast = b.thrown ? "Throwing Mastery" : ({ sword: "Sword", axe: "Axe", mace: "Mace", staff: "Pole Arm", spear: "Spear" } as Record<string, string>)[b.kind];
      if (mast) facts.push(b.thrown ? `${mast}${b.kind === "axe" ? " (Axe Mastery in melee)" : b.kind === "spear" ? " (Spear Mastery in melee)" : ""}` : `${mast} Mastery`);
    } else if (b.defMul) facts.push(`Defense ×${b.defMul}`);
    if (b.kind === "belt") facts.push("+1 to +4 potion slots");
    const req = [reqText(b.str, "Str"), reqText(b.dex, "Dex")].filter(Boolean).join(", ");
    if (!b.potion) facts.push(req ? `Needs ${req}` : "No stat requirement");
    if (b.potion) facts.push(`${b.price} gold`);
    return `<div class="gcard"><div class="gic">${icon}</div><div class="gtx"><b>${esc(b.name)}</b><small>${facts.map(esc).join(" · ")}</small><p>${esc(CLASS_USE[b.id] ?? "")}</p></div></div>`;
  }).join("");
  return `<p class="gnote">One base per class. The <b>class</b> sets damage spread, speed, size and requirements; <b>item level</b> sets the numbers; <b>rarity</b> sets the number of random affixes. Magic and rare items also need character level ¾ × item level.</p><p class="gnote">Storage: your <b>backpack</b> is ${GRID_W}×${GRID_H} (${GRID_W * GRID_H} cells). The <b>stash</b> chest in Ember Camp holds ${STASH_W}×${STASH_H} more; it's saved with your hero and included in save exports. Walk up to it (or tap it) to open it. The "grid" size below is how many cells an item takes.</p><div class="gcards">${rows}</div>`;
}

function levelsHtml(): string {
  const weapons = ITEM_BASES.filter((b) => b.slot === "weapon");
  const armor = ITEM_BASES.filter((b) => !!b.defMul);
  const head = (bs: ItemBase[]) => `<tr><th>ilvl</th>${bs.map((b) => `<th>${esc(b.name)}</th>`).join("")}</tr>`;
  const wrows = LEVELS.map((L) => `<tr><td>${L}</td>${weapons.map((b) => { const [lo, hi] = baseDamage(b, L); return `<td>${lo}–${hi}</td>`; }).join("")}</tr>`).join("");
  const arows = LEVELS.map((L) => `<tr><td>${L}</td>${armor.map((b) => `<td>${baseDefense(b, L)}${b.kind === "belt" ? ` <small>+${beltSlotsOf(makeItem("belt", L))}♥</small>` : ""}</td>`).join("")}</tr>`).join("");
  return `<p class="gnote">White (normal) item numbers. Enhanced Damage / Defense and +min/+max affixes add to these. Items drop at the monster's level (boss +2).</p>
    <h4>Weapon damage</h4><div class="gtable"><table>${head(weapons)}${wrows}</table></div>
    <h4>Defense</h4><div class="gtable"><table>${head(armor)}${arows}</table></div>`;
}

function affixesHtml(): string {
  const side = (sd: "p" | "s") =>
    AFFIXES.filter((a) => a.side === sd)
      .map((a) => {
        const cats = a.cats.map((c) => CAT_LABEL[c]).join(", ");
        const tiers = a.tiers
          .map((t) => {
            const vals = t.mods.map(([s, lo, hi]) => modText({ s, v: (lo === hi ? `${lo}` : `${lo}–${hi}`) as unknown as number } as Mod)).join(", ");
            return `<tr><td>${esc(t.name)}</td><td>${t.lvl}</td><td>${esc(vals)}</td></tr>`;
          })
          .join("");
        return `<div class="gaff"><div class="gaffh">${cats}</div><div class="gtable"><table><tr><th>${sd === "p" ? "Prefix" : "Suffix"}</th><th>Min ilvl</th><th>Value</th></tr>${tiers}</table></div></div>`;
      })
      .join("");
  return `<p class="gnote">Each item can have one affix per group. Higher tiers need a higher item level. Enhanced Damage and Enhanced Damage + AR don't stack on one item. +skill affixes boost a skill you have learned.</p>
    <h4>Prefixes</h4>${side("p")}<h4>Suffixes</h4>${side("s")}`;
}

function rarityHtml(): string {
  const counts = [...new Set(RARE_COUNTS)];
  const odds = (mlvl: number, mf: number, boss = false) => {
    const o = qualityOdds(mlvl, mf, boss);
    return `<td>${pct(1 - o.rare - o.magic)}</td><td style="color:${QUALITY_COLOR.magic}">${pct(o.magic)}</td><td style="color:${QUALITY_COLOR.rare}">${pct(o.rare)}</td>`;
  };
  const rows = [1, 3, 5, 10, 20].flatMap((m) => [0, 100].map((mf) => `<tr><td>${m}</td><td>${mf}%</td>${odds(m, mf)}</tr>`)).join("");
  return `
    <div class="grar"><b style="color:${QUALITY_COLOR.normal}">Normal (white)</b><span>No affixes. Plain class name.</span></div>
    <div class="grar"><b style="color:${QUALITY_COLOR.magic}">Magic (blue)</b><span>1–2 affixes: a prefix and/or a suffix (${pct(MAGIC_SPLIT.prefixOnly)} prefix only, ${pct(MAGIC_SPLIT.suffixOnly)} suffix only, the rest both). Named like “Jagged Axe of the Fox”.</span></div>
    <div class="grar"><b style="color:${QUALITY_COLOR.rare}">Rare (yellow)</b><span>${counts[0]}–${counts[counts.length - 1]} affixes, at most 3 prefixes and 3 suffixes. A random two-word name with the class name under it.</span></div>
    <p class="gnote">Rings and amulets are never white. Hilde sells white gear and a few magic items. Nothing ever needs identifying.</p>
    <h4>Drop quality by monster level</h4>
    <div class="gtable"><table><tr><th>Monster lvl</th><th>Magic find</th><th>White</th><th>Magic</th><th>Rare</th></tr>${rows}
    <tr><td>Boss</td><td>0%</td>${odds(5, 0, true)}</tr></table></div>
    <p class="gnote">Magic find raises magic odds fully and rare odds with diminishing returns (like Diablo II).</p>`;
}

const BEHAVIOR: Record<string, string> = { melee: "Melee", ranged: "Ranged", charger: "Charger", exploder: "Exploder" };

function actsHtml(): string {
  const rows = ACTS.map((a) => {
    const f0 = firstFloorOf(a.n);
    const icon = artifactIcon(a.artifact.id).toDataURL();
    return `<tr><td><b>Act ${a.roman}</b><br/>${esc(a.area)}<br/><small>${esc(a.tagline)}</small></td>
      <td>${mlvlOf(f0)}–${mlvlOf(f0 + LEVELS_PER_ACT - 1)}</td>
      <td>${a.monsters.map((k) => esc(MONSTERS[k].name)).join(", ")}</td>
      <td>${a.bossNames.map(esc).join(", ")}<br/><b>${esc(MONSTERS[a.finalBoss].name)}</b> (level ${LEVELS_PER_ACT})</td>
      <td><img class="gicon" src="${icon}" alt="" style="width:28px;height:28px;image-rendering:pixelated"/> <span style="color:${ARTIFACT_COLOR}">${esc(a.artifact.name)}</span></td></tr>`;
  }).join("");
  return `<p class="gnote">Four acts of ${LEVELS_PER_ACT} levels, all reached from Ember Camp. Every level ends with a boss guarding the stairs; each level's boss is tougher than the last (monster level climbs, plus +4% life and +2% damage per level). Level ${LEVELS_PER_ACT} holds the act's final boss, with special attacks. It drops the act's artifact ✧ (kept in the Artifacts tab, not your bag) and opens the stairs to the next act, which then shows on the waypoint. Waypoints sit on level 1 and every 5th level. Deeper acts give a little more XP per kill (Act II ×1.1, III ×1.2, IV ×1.3) and +20% magic find per act (+1% per level within an act). Like Diablo II, monsters more than 3 levels below you give less XP (−15% per level, down to 5%). Expect about 2–5 minutes per level, an hour or more per act, and roughly 13–15 hero levels per act.</p>
    <div class="gtable"><table><tr><th>Act</th><th>Monster lvl</th><th>Monsters</th><th>Bosses</th><th>Artifact</th></tr>${rows}</table></div>`;
}

function monstersHtml(): string {
  const row = (m: MonsterDef, lv: number, rw: number) => {
    const el = m.elem === "phys" ? "—" : `<span style="color:${ELEM_COLOR[m.elem]}">${ELEM_NAME[m.elem]}</span>`;
    const tag = m.rank === "final" ? " <small>(final boss)</small>" : m.rank === "boss" ? " <small>(level boss)</small>" : "";
    return `<tr><td>${esc(m.name)}${tag}<br/><small>${esc(m.blurb)}</small></td><td>${BEHAVIOR[m.behavior]}</td><td>${el}</td><td>${lv}</td><td>${scaleHp(m.hp, lv)}</td><td>${scaleDmg(m.dmgMin, lv)}–${scaleDmg(m.dmgMax, lv)}</td><td>${Math.max(1, Math.round(scaleXp(m.xp, lv) * rw * XP_RATE))}</td><td>${m.speed}</td></tr>`;
  };
  return `<p class="gnote">Speed is tiles per second; you walk at 4.6. Stats shown at each monster's level on level 1 of its act (bosses get extra levels). Elemental damage is cut by your matching resist (max 75%); cold slows you for a moment and poison hurts over time. Rangers keep their distance; chargers rush you from a few tiles away; exploders burst when they reach you — kill them first or step back.</p>
    <p class="gnote"><b style="color:#7fa2ff">Champions</b> (blue ring) come in small packs with 2.5× life, +30% damage, one modifier and 3× XP. <b style="color:#ffc65a">Uniques</b> (gold ring, named) lead a pack from Act I level 3 on (two per level from level 10): 4× life, +50% damage, 1–3 modifiers (more in later acts), 5× XP and two magic-or-better drops. Modifiers: ${Object.values(ELITE_MODS).join(", ")}. Fire Enchanted monsters burst into flame when they die. Potions heal over 1.5 s and a second one of the same kind can't be drunk for 1.5 s.</p>
    ${ACTS.map((a) => {
      const lv = mlvlOf(firstFloorOf(a.n));
      const list = [...a.monsters.map((k) => row(MONSTERS[k], lv, a.reward)), row(MONSTERS[a.levelBoss], lv + 1, a.reward), row(MONSTERS[a.finalBoss], mlvlOf(firstFloorOf(a.n) + LEVELS_PER_ACT - 1) + 2, a.reward)].join("");
      return `<h4>Act ${a.roman} · ${esc(a.area)}</h4><div class="gtable"><table><tr><th>Monster</th><th>Type</th><th>Element</th><th>Lvl</th><th>Life</th><th>Damage</th><th>XP</th><th>Speed</th></tr>${list}</table></div>`;
    }).join("")}`;
}

function skillsHtml(): string {
  const tabs = [...new Set(SKILLS.map((s) => s.tab))];
  return `<p class="gnote">Each level gives 1 skill point. As in Diablo II, a skill's hard points are capped at 1 + (your level − the skill's level), up to ${MAX_SKILL_LVL}; +skills on gear go on top. Skills marked “soon” aren't playable yet.</p>${tabs
    .map((t) => {
      const rows = SKILLS.filter((s) => s.tab === t)
        .sort((a, b) => a.reqLvl - b.reqLvl || a.row - b.row)
        .map((s) => `<tr><td>${s.glyph} ${esc(s.name)}${s.implemented ? "" : " <small>(soon)</small>"}</td><td>${s.reqLvl}</td><td>${s.prereq.map((q) => esc(SKILL_BY_ID[q].name)).join(", ") || "—"}</td><td>${esc(s.blurb)}</td></tr>`)
        .join("");
      return `<h4>${esc(TAB_NAMES[t])}</h4><div class="gtable"><table><tr><th>Skill</th><th>Lvl</th><th>Needs</th><th>What it does</th></tr>${rows}</table></div>`;
    })
    .join("")}`;
}

export function guideHtml(sec: GuideSec): string {
  const nav = GUIDE_SECS.map(([id, n]) => `<button class="gsec ${id === sec ? "on" : ""}" data-act="gsec" data-sec="${id}">${n}</button>`).join("");
  const body = sec === "classes" ? classesHtml() : sec === "levels" ? levelsHtml() : sec === "affixes" ? affixesHtml() : sec === "rarity" ? rarityHtml() : sec === "monsters" ? monstersHtml() : sec === "acts" ? actsHtml() : skillsHtml();
  return `<div class="gnav">${nav}</div><div class="gbody" data-sec="${sec}">${body}</div>`;
}
