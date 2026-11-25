import { beforeEach, describe, expect, it } from "vitest";
import { Game, type GameEvents, SAVE_VERSION } from "../src/game";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  get length() {
    return this.m.size;
  }
}
const mem = new MemStorage();
(globalThis as unknown as { localStorage: MemStorage }).localStorage = mem;

const save = await import("../src/save");
const events: GameEvents = { sound() {}, toast() {}, changed() {}, died() {}, levelUp() {}, shake() {} };



describe("v0.8.3 backup to Files", () => {
  beforeEach(() => mem.clear());
  const fresh = () => {
    const g = new Game(events, null, 7);
    g.player.level = 12;
    g.player.gold = 4321;
    return g;
  };

  it("names backups .embercrypt with the level and local date", () => {
    expect(save.backupFileName(24, new Date(2026, 10, 25, 23, 50))).toBe("ember-crypt-lv24-2026-11-25.embercrypt");
  });

  it("a backup file round-trips through importCode (the Restore from file path)", () => {
    const g = fresh();
    save.saveGame(g.toSave());
    const json = JSON.stringify(g.toSave());
    const back = save.importCode(json)!;
    expect(back).toBeTruthy();
    expect(back.player.level).toBe(12);
    expect(back.player.gold).toBe(4321);
    expect(back.v).toBe(SAVE_VERSION);
  });

  it("rejects files that are not saves", () => {
    expect(save.importCode("hello")).toBeNull();
    expect(save.importCode('{"foo":1}')).toBeNull();
    expect(save.importCode("")).toBeNull();
  });

  it("forced save always pushes the current hero into backups (restore keeps it)", () => {
    const g = fresh();
    save.saveGame(g.toSave());
    save.saveGame(g.toSave()); // seconds later: normally no new backup
    const before = save.listBackups().length;
    g.player.level = 13;
    save.saveGame(g.toSave(), { force: true });
    const after = save.listBackups();
    expect(after.length).toBe(Math.min(3, before + 1));
    expect(after[0].level).toBe(12);
  });

  it("records the last file backup time", () => {
    expect(save.lastFileBackup()).toBe(0);
    save.markFileBackup(1_000_000);
    expect(save.lastFileBackup()).toBe(1_000_000);
  });

  it("reminds only for real heroes, after 24h, at most every 12h", () => {
    const H = 3600_000, now = 100 * 24 * H;
    expect(save.backupDue(2, 0, 0, now)).toBe(false); // brand-new hero
    expect(save.backupDue(5, 0, 0, now)).toBe(true); // never backed up
    expect(save.backupDue(5, now - 23 * H, 0, now)).toBe(false);
    expect(save.backupDue(5, now - 25 * H, 0, now)).toBe(true);
    expect(save.backupDue(5, now - 25 * H, now - 2 * H, now)).toBe(false); // just reminded
    expect(save.backupDue(5, now - 40 * H, now - 13 * H, now)).toBe(true);
    // takeBackupReminder records the nudge so it doesn't repeat right away
    expect(save.takeBackupReminder(5, now)).toBe(true);
    expect(save.takeBackupReminder(5, now + H)).toBe(false);
    save.markFileBackup(now + 2 * H);
    expect(save.takeBackupReminder(5, now + 20 * H)).toBe(false);
  });
});
