import { type SaveData, migrateSave } from "./game";

const KEY = "ember-crypt-save-v1";
const SKEY = "ember-crypt-settings-v1";

export interface Settings {
  showJoystick: boolean;
  sound: boolean;
  shake: boolean;
  labels: boolean;
  tutorialSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = { showJoystick: false, sound: true, shake: true, labels: true, tutorialSeen: false };

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrateSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveGame(d: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* private mode / quota */
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SKEY) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SKEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
