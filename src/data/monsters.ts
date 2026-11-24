export type MonsterKind = "zombie" | "fallen" | "boss";

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  hp: number;
  dmgMin: number;
  dmgMax: number;
  /** tiles per second (v0.3: ×1.27 to match the v0.1 on-screen speed after the pixel-art rescale) */
  speed: number;
  /** seconds between attacks */
  atkInterval: number;
  windup: number;
  reach: number;
  radius: number;
  xp: number;
  ar: number;
  def: number;
  aggro: number;
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  zombie: { kind: "zombie", name: "Zombie", hp: 15, dmgMin: 2, dmgMax: 5, speed: 1.2, atkInterval: 1.5, windup: 0.45, reach: 0.75, radius: 0.32, xp: 14, ar: 22, def: 3, aggro: 7 },
  fallen: { kind: "fallen", name: "Fallen", hp: 7, dmgMin: 1, dmgMax: 3, speed: 3.05, atkInterval: 0.95, windup: 0.25, reach: 0.6, radius: 0.24, xp: 8, ar: 28, def: 2, aggro: 8 },
  boss: { kind: "boss", name: "Rotfang the Hollow", hp: 110, dmgMin: 4, dmgMax: 9, speed: 1.45, atkInterval: 1.3, windup: 0.5, reach: 0.95, radius: 0.5, xp: 160, ar: 40, def: 8, aggro: 7 },
};

/** Scale a stat by monster level. */
export const scaleHp = (base: number, mlvl: number) => Math.round(base * (1 + 0.38 * (mlvl - 1)));
export const scaleDmg = (base: number, mlvl: number) => Math.max(1, Math.round(base * (1 + 0.28 * (mlvl - 1))));
export const scaleAR = (base: number, mlvl: number) => Math.round(base + 9 * (mlvl - 1));
export const scaleDef = (base: number, mlvl: number) => Math.round(base + 4 * (mlvl - 1));
export const scaleXp = (base: number, mlvl: number) => Math.round(base * (1 + 0.5 * (mlvl - 1)));
