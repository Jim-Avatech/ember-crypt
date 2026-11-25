/** The four acts: a linear run of levels each, a theme, monsters, bosses and the artifact the final boss drops. */
import type { MonsterKind } from "./monsters";

/** v0.8 pacing: about 20 short levels (2-5 min each) per act, so an act takes an hour or more. */
export const LEVELS_PER_ACT = 20;
export const ACT_COUNT = 4;
export const MAX_FLOOR = LEVELS_PER_ACT * ACT_COUNT;

export interface Theme {
  /** 4 floor base colors */
  floor: [string, string, string, string];
  /** extra floor detail */
  feature: "slabs" | "sand" | "moss" | "lava";
  wallTop: string;
  wallLeft: string;
  wallRight: string;
  /** torch flame, core and glow rgb */
  flame: string;
  core: string;
  glow: string;
  /** background outside the map */
  void: string;
  /** decal remap: bones/skull/blood/crack → theme decals */
  decals: Record<"bones" | "skull" | "blood" | "crack", string>;
  /** minimap floor color */
  mini: string;
}

export interface ArtifactDef {
  id: string;
  name: string;
  lore: string;
  act: number;
}

export interface ActDef {
  n: number;
  roman: string;
  area: string;
  tagline: string;
  theme: Theme;
  monsters: MonsterKind[];
  levelBoss: MonsterKind;
  /** level boss names; levels past the list reuse them with an epithet (see bossName) */
  bossNames: string[];
  finalBoss: MonsterKind;
  artifact: ArtifactDef;
  /** monster level on level 1 of the act, and per level after */
  mlvl0: number;
  mlvlStep: number;
  /** XP and gold multiplier (keeps leveling steady as the XP curve steepens) */
  reward: number;
}

export const ACTS: ActDef[] = [
  {
    n: 1, roman: "I", area: "Ember Crypt", tagline: "Bones and embers beneath the camp",
    theme: {
      floor: ["#3d362e", "#3a332b", "#3f372e", "#383128"], feature: "slabs", wallTop: "#544a3e", wallLeft: "#2c2620", wallRight: "#40362c",
      flame: "#ff8a1a", core: "#ffe08a", glow: "255,150,60", void: "#070605", decals: { bones: "bones", skull: "skull", blood: "blood", crack: "crack" }, mini: "#6a5a48",
    },
    monsters: ["zombie", "fallen", "skeleton"], levelBoss: "boss", bossNames: ["Gravelord Morth", "Bonegnaw", "Cinderjaw", "Rotfang the Hollow", "Ashwight", "Old Marrow", "The Pale Warden"], finalBoss: "lich",
    artifact: { id: "ember_heart", name: "The Ember Heart", lore: "Still warm. The Lich kept it in a cage of ribs, and it beats when you hold it.", act: 1 },
    mlvl0: 1, mlvlStep: 0.6, reward: 1,
  },
  {
    n: 2, roman: "II", area: "Sunken Tombs", tagline: "Sand-choked halls of a buried dynasty",
    theme: {
      floor: ["#8a7048", "#846a44", "#8e744c", "#806640"], feature: "sand", wallTop: "#b09060", wallLeft: "#5e4a30", wallRight: "#7e6440",
      flame: "#ffb43a", core: "#fff0b0", glow: "255,190,90", void: "#0c0905", decals: { bones: "bones", skull: "urn", blood: "sand", crack: "crack" }, mini: "#a08860",
    },
    monsters: ["mummy", "raider", "priest"], levelBoss: "boss2", bossNames: ["Anhur the Embalmer", "Sandmaw", "Scarab Lord Teth", "Vizier Kaem", "Dune Stalker Rakh", "The Gilded Husk", "High Priest Sobek"], finalBoss: "sekhet",
    artifact: { id: "sun_scarab", name: "The Sun Scarab", lore: "Queen Sekhet's seal. Its gold never cools, even in the dark.", act: 2 },
    mlvl0: 13, mlvlStep: 0.6, reward: 1.1,
  },
  {
    n: 3, roman: "III", area: "Drowned Jungle", tagline: "Flooded ruins swallowed by the swamp",
    theme: {
      floor: ["#34402c", "#303c28", "#384430", "#2c3826"], feature: "moss", wallTop: "#56634a", wallLeft: "#26301e", wallRight: "#3a4630",
      flame: "#9aff6a", core: "#e8ffc0", glow: "140,230,120", void: "#040806", decals: { bones: "vine", skull: "skull", blood: "puddle", crack: "vine" }, mini: "#5a7a4a",
    },
    monsters: ["lurker", "flayer", "spitter", "bloater"], levelBoss: "boss3", bossNames: ["Gutrot", "The Drowned Thing", "Bramblehide", "Old Croak", "Mossjaw", "The Leech King", "Fenwitch Ulla"], finalBoss: "mire",
    artifact: { id: "mire_pearl", name: "The Mire Pearl", lore: "Black as bog water, cold as the deep. Something inside it swims.", act: 3 },
    mlvl0: 25, mlvlStep: 0.6, reward: 1.2,
  },
  {
    n: 4, roman: "IV", area: "Burning Hells", tagline: "Where the embers come from",
    theme: {
      floor: ["#3a1e18", "#361a14", "#3e221a", "#321812"], feature: "lava", wallTop: "#5a2a20", wallLeft: "#26100c", wallRight: "#401a14",
      flame: "#ff4a1a", core: "#ffc060", glow: "255,90,40", void: "#0a0302", decals: { bones: "bones", skull: "skull", blood: "lava", crack: "lava" }, mini: "#7a3a2a",
    },
    monsters: ["imp", "knight", "conjurer", "soul"], levelBoss: "boss4", bossNames: ["Grezzik the Flayed", "Ashmaw", "Infernus", "The Brimstone Duke", "Cinderfang", "Lady Scorch", "The Ember Tyrant"], finalBoss: "malakar",
    artifact: { id: "cinder_crown", name: "The Cinder Crown", lore: "Malakar's crown of black iron. The flames on it have burned since before the camp was built.", act: 4 },
    mlvl0: 37, mlvlStep: 0.65, reward: 1.3,
  },
];

export const ARTIFACTS: ArtifactDef[] = ACTS.map((a) => a.artifact);
export const ARTIFACT_BY_ID: Record<string, ArtifactDef> = Object.fromEntries(ARTIFACTS.map((a) => [a.id, a]));
export const ARTIFACT_COLOR = "#ff9a2a";

/** Act number (1..4) of a global floor (1..20); 0 in town. */
export const actOf = (floor: number) => (floor <= 0 ? 0 : Math.min(ACT_COUNT, Math.ceil(floor / LEVELS_PER_ACT)));
/** Level within the act (1..5). */
export const levelInAct = (floor: number) => ((Math.max(1, floor) - 1) % LEVELS_PER_ACT) + 1;
export const actDef = (floor: number) => ACTS[Math.max(1, actOf(floor)) - 1];
export const isFinalLevel = (floor: number) => levelInAct(floor) === LEVELS_PER_ACT;
export const firstFloorOf = (act: number) => (act - 1) * LEVELS_PER_ACT + 1;
/** Monster level for normal monsters on a floor. */
export const mlvlOf = (floor: number) => {
  const a = actDef(floor);
  return Math.round(a.mlvl0 + (levelInAct(floor) - 1) * a.mlvlStep);
};
/** "Sunken Tombs — Level 2" */
export const floorName = (floor: number) => (floor <= 0 ? "Ember Camp" : `${actDef(floor).area} — Level ${levelInAct(floor)}`);
export const shortFloorName = (floor: number) => (floor <= 0 ? "Camp" : `Act ${actDef(floor).roman} · ${levelInAct(floor)}/${LEVELS_PER_ACT}`);

/**
 * XP multiplier when the hero is above the monster (like Diablo II): full XP up to 3 levels
 * above, then 15% less per extra level, down to 5%. Keeps leveling steady as the acts get harder.
 */
export const xpPenalty = (plevel: number, mlvl: number) => {
  const diff = plevel - mlvl;
  return diff <= 3 ? 1 : Math.max(0.05, 1 - 0.2 * (diff - 3));
};

/** Global XP per kill (v0.8 pacing: about 10-15 hero levels per act, not 20 an hour). */
export const XP_RATE = 0.24;

const EPITHETS = ["Risen", "Elder", "Undying"];
/** Name of the level boss on level `l` (1..19) of an act. */
export const bossName = (a: ActDef, l: number) => {
  const n = a.bossNames.length;
  const i = l - 1;
  return i < n ? a.bossNames[i] : `${EPITHETS[Math.floor(i / n) - 1] ?? "Last"} ${a.bossNames[i % n].replace(/^The /, "")}`;
};

/** Waypoints sit on level 1, every 5th level and the final level of each act. */
export const hasWaypoint = (floor: number) => {
  const l = levelInAct(floor);
  return l === 1 || l % 5 === 0;
};
