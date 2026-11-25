/**
 * Saves: localStorage (main + temp + rotating backups) mirrored to IndexedDB.
 *
 * RULE: never wipe a save. Any change to the save shape bumps SaveData.v and adds a step to
 * migrateSave() in game.ts, with a fixture test in tests/save.test.ts. A save we can't read
 * (damaged, or from a newer version) is kept untouched and we fall back to a backup.
 */
import { type SaveData, SAVE_VERSION, migrateSave } from "./game";

export const KEY = "ember-crypt-save-v1"; // name kept from v0.1 so old saves are found
const TMP = "ember-crypt-save-tmp";
const BAK = ["ember-crypt-save-bak1", "ember-crypt-save-bak2", "ember-crypt-save-bak3"];
const BAD = "ember-crypt-save-damaged";
const SKEY = "ember-crypt-settings-v1";
/** backups rotate at most this often (ms), so they hold genuinely older states */
const BAK_EVERY = 3 * 60 * 1000;

export interface Settings {
  showJoystick: boolean;
  sound: boolean;
  shake: boolean;
  labels: boolean;
  tutorialSeen: boolean;
  /** drink a healing potion automatically at low life */
  autoHp: boolean;
  /** % of max life that triggers it */
  autoHpAt: number;
  /** pressing a skill twice without enough mana drinks a mana potion */
  autoMp: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  showJoystick: false, sound: true, shake: true, labels: true, tutorialSeen: false, autoHp: true, autoHpAt: 10, autoMp: true,
};

export interface LoadResult {
  data: SaveData | null;
  /** where it came from */
  source: "main" | "tmp" | "bak1" | "bak2" | "bak3" | "idb" | "none";
  /** the main save was damaged and a backup was used */
  recovered: boolean;
  /** a save from a newer version exists: don't overwrite it */
  newer: boolean;
}

/** Whether saving is allowed (false while a newer-version save is on the device). */
let writable = true;
let lastSaved = 0;
export const lastSavedAt = () => lastSaved;
export const canSave = () => writable;

function ls(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Parse + migrate + validate one stored string. */
export function parseSave(raw: string | null | undefined): { data: SaveData | null; newer: boolean } {
  if (!raw) return { data: null, newer: false };
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && typeof obj.v === "number" && obj.v > SAVE_VERSION) return { data: null, newer: true };
    const d = migrateSave(obj);
    return { data: d && validSave(d) ? d : null, newer: false };
  } catch {
    return { data: null, newer: false };
  }
}

const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);

/** Structural check so a half-written or hand-edited save can't crash the game. */
export function validSave(d: SaveData): boolean {
  const p = d?.player;
  return (
    !!p && num(d.seed) && num(d.floor) && num(d.maxFloor) && num(p.level) && p.level >= 1 && num(p.xp) && num(p.gold) &&
    !!p.base && num(p.base.str) && num(p.base.dex) && num(p.base.vit) && num(p.base.ene) &&
    Array.isArray(p.bag) && !!p.equip && typeof p.equip === "object" && !!p.skills && Array.isArray(p.slots)
  );
}

/** Load the newest good save: main → temp → backups (IndexedDB is checked separately, async). */
export function loadGame(): LoadResult {
  const s = ls();
  writable = true;
  if (!s) return { data: null, source: "none", recovered: false, newer: false };
  const main = s.getItem(KEY);
  const m = parseSave(main);
  if (m.newer) {
    writable = false;
    return { data: null, source: "none", recovered: false, newer: true };
  }
  if (m.data) {
    lastSaved = m.data.savedAt ?? 0;
    return { data: m.data, source: "main", recovered: false, newer: false };
  }
  // main missing or damaged: keep the damaged copy, then try the others
  if (main) {
    try {
      s.setItem(BAD, main);
    } catch {
      /* full */
    }
  }
  const order: [LoadResult["source"], string][] = [["tmp", TMP], ["bak1", BAK[0]], ["bak2", BAK[1]], ["bak3", BAK[2]]];
  for (const [src, k] of order) {
    const r = parseSave(s.getItem(k));
    if (r.newer) {
      writable = false;
      return { data: null, source: "none", recovered: false, newer: true };
    }
    if (r.data) {
      lastSaved = r.data.savedAt ?? 0;
      return { data: r.data, source: src, recovered: !!main, newer: false };
    }
  }
  return { data: null, source: "none", recovered: false, newer: false };
}

/** Write: temp key first, verify it reads back, rotate backups, then swap into the main key. */
export function saveGame(d: SaveData, opts: { backup?: boolean; force?: boolean } = {}): boolean {
  const s = ls();
  if (!s || !writable) return false;
  try {
    const now = Date.now();
    d.savedAt = now;
    const json = JSON.stringify(d);
    s.setItem(TMP, json);
    if (s.getItem(TMP) !== json) return false;
    const prev = s.getItem(KEY);
    const prevOk = parseSave(prev).data;
    if (prev && prevOk) {
      const b1 = parseSave(s.getItem(BAK[0])).data;
      const age = now - (b1?.savedAt ?? 0);
      if (!b1 || age > BAK_EVERY || (opts.backup && age > 30 * 1000) || opts.force) {
        for (let i = BAK.length - 1; i > 0; i--) {
          const v = s.getItem(BAK[i - 1]);
          if (v) s.setItem(BAK[i], v);
        }
        s.setItem(BAK[0], prev);
      }
    }
    s.setItem(KEY, json);
    s.removeItem(TMP);
    lastSaved = now;
    mirrorToIdb(json);
    return true;
  } catch {
    return false; // private mode / quota: the temp or previous main is still there
  }
}

/** Keep a copy of the main save that this version couldn't open (never deleted). */
export function keepDamaged() {
  const s = ls();
  if (!s) return;
  try {
    const cur = s.getItem(KEY);
    if (cur) s.setItem(BAD, cur);
  } catch {
    /* full */
  }
}

/** Stop writing saves (used when the save couldn't be opened, so it is never overwritten). */
export function pauseSaving() {
  writable = false;
}

/** Start over: the current hero goes into the backups first, so it can be restored. */
export function clearGame() {
  const s = ls();
  if (!s) return;
  try {
    const cur = s.getItem(KEY);
    if (cur && parseSave(cur).data) {
      for (let i = BAK.length - 1; i > 0; i--) {
        const v = s.getItem(BAK[i - 1]);
        if (v) s.setItem(BAK[i], v);
      }
      s.setItem(BAK[0], cur);
    }
    s.removeItem(KEY);
    s.removeItem(TMP);
  } catch {
    /* ignore */
  }
  mirrorToIdb(null);
}

/** Backups available (for Settings). */
export function listBackups(): { key: string; level: number; savedAt: number }[] {
  const s = ls();
  if (!s) return [];
  return BAK.map((k) => ({ k, d: parseSave(s.getItem(k)).data }))
    .filter((x) => x.d)
    .map((x) => ({ key: x.k, level: x.d!.player.level, savedAt: x.d!.savedAt ?? 0 }));
}

export function loadBackup(key: string): SaveData | null {
  return parseSave(ls()?.getItem(key)).data;
}

// ------------------------------------------------------------------ export / import
const PREFIX = "EMBERCRYPT1:";

/** A copyable text code for the whole save. */
export function exportCode(d: SaveData): string {
  const json = JSON.stringify(d);
  // chunked: spreading a large save into fromCharCode can exceed Safari's argument limit
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
  const b64 = btoa(bin);
  return PREFIX + b64;
}

/** Accepts a code from exportCode or the raw JSON of a save file. */
export function importCode(text: string): SaveData | null {
  const t = text.trim();
  try {
    let json = t;
    if (t.startsWith(PREFIX)) {
      const bin = atob(t.slice(PREFIX.length).replace(/\s+/g, ""));
      json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    }
    const r = parseSave(json);
    return r.data;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ settings
/** Defaults for anything missing, and drop values of the wrong type (so sound can't end up undefined or "false"). */
export function cleanSettings(raw: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, ...base };
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k];
      if (def !== undefined && typeof v === typeof def && (typeof v !== "number" || Number.isFinite(v))) (out as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

export function loadSettings(): Settings {
  try {
    return cleanSettings(JSON.parse(ls()?.getItem(SKEY) || "{}"));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(st: Settings) {
  try {
    ls()?.setItem(SKEY, JSON.stringify(st));
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ IndexedDB mirror + persistence
const DB = "ember-crypt";
const STORE = "saves";

function idb(): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    try {
      if (!globalThis.indexedDB) return res(null);
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
}

let idbPending: string | null | undefined;
let idbBusy = false;
function mirrorToIdb(json: string | null) {
  idbPending = json;
  if (idbBusy) return;
  idbBusy = true;
  void (async () => {
    while (idbPending !== undefined) {
      const v = idbPending;
      idbPending = undefined;
      const db = await idb();
      if (!db) break;
      await new Promise<void>((res) => {
        try {
          const tx = db.transaction(STORE, "readwrite");
          if (v === null) tx.objectStore(STORE).delete("main");
          else tx.objectStore(STORE).put(v, "main");
          tx.oncomplete = tx.onerror = tx.onabort = () => res();
        } catch {
          res();
        }
      });
      db.close();
    }
    idbBusy = false;
  })();
}

/** The IndexedDB copy (used when localStorage has nothing readable, e.g. after Safari cleared it). */
export async function loadFromIdb(): Promise<SaveData | null> {
  const db = await idb();
  if (!db) return null;
  const raw = await new Promise<string | null>((res) => {
    try {
      const rq = db.transaction(STORE, "readonly").objectStore(STORE).get("main");
      rq.onsuccess = () => res((rq.result as string) ?? null);
      rq.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
  db.close();
  return parseSave(raw).data;
}

/** Ask the browser not to evict our storage (granted for home-screen apps on iOS). */
export async function requestPersist(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ v0.8.3: backups to Files / iCloud Drive
const FILE_AT = "ember-crypt-file-backup-at";
const REMIND_AT = "ember-crypt-backup-reminded-at";
export const FILE_EXT = ".embercrypt";
export const BACKUP_EVERY = 24 * 60 * 60 * 1000;

/** When the hero was last backed up to a file (0 = never). */
export function lastFileBackup(): number {
  return Number(ls()?.getItem(FILE_AT) ?? 0) || 0;
}
export function markFileBackup(at = Date.now()) {
  try {
    ls()?.setItem(FILE_AT, String(at));
  } catch {
    /* full */
  }
}
/** File name for a backup, e.g. ember-crypt-lv24-2026-11-25.embercrypt */
export function backupFileName(level: number, now = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `ember-crypt-lv${level}-${d}${FILE_EXT}`;
}
/**
 * Should we nudge the player to back up? Only for a hero worth keeping (level 3+), when the last file
 * backup is over a day old (or never), and at most once every 12 hours.
 */
export function backupDue(level: number, lastBackup: number, lastReminder: number, now = Date.now()): boolean {
  if (level < 3) return false;
  if (lastBackup && now - lastBackup < BACKUP_EVERY) return false;
  return !lastReminder || now - lastReminder > BACKUP_EVERY / 2;
}
/** Check and record a reminder. */
export function takeBackupReminder(level: number, now = Date.now()): boolean {
  const s = ls();
  const last = Number(s?.getItem(REMIND_AT) ?? 0) || 0;
  if (!backupDue(level, lastFileBackup(), last, now)) return false;
  try {
    s?.setItem(REMIND_AT, String(now));
  } catch {
    /* full */
  }
  return true;
}
