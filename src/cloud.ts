/**
 * Cloud save (behind a flag; off until a free Supabase project is configured).
 *
 * - Sign-in: email + 6-digit code (Supabase Auth OTP). No password, no redirect: works inside the Home Screen app.
 * - One row per player and hero slot in `public.saves` (v1.0: primary key user_id + slot; slot 1 is the original
 *   hero); row-level security so a player only sees their own rows.
 * - Writes go through `put_save()` (supabase/schema.sql): a compare-and-swap that only overwrites when the
 *   cloud copy is the one this device last saw, or older. The copy being replaced is kept in `prev_data`.
 * - Conflicts: newest wins, and the other copy is kept as a backup (local backups on this device, or `prev_data`
 *   in the cloud). A device's very first sync never lets a fresh low-level hero overwrite a real one.
 *
 * No SDK: plain fetch against the Supabase REST endpoints keeps the game small and offline-first.
 */
import type { SaveData } from "./game";

export interface CloudConfig {
  url: string; // https://<project>.supabase.co
  anonKey: string; // the public "anon" key (safe to ship; RLS protects the data)
}

/** Build-time config + flag. Cloud is on only when both values are set and VITE_CLOUD=1 (or ?cloud in the URL). */
export function cloudConfig(env: Record<string, string | undefined>, search = ""): CloudConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  const flag = env.VITE_CLOUD === "1" || new URLSearchParams(search).has("cloud");
  return flag ? { url: url.replace(/\/+$/, ""), anonKey } : null;
}

export interface Session {
  access: string;
  refresh: string;
  expiresAt: number; // ms
  userId: string;
  email: string;
}
export interface CloudRow {
  slot?: number;
  data: SaveData;
  saved_at: number;
  level: number;
  device: string;
}
export type SyncResult =
  | { kind: "none" }
  | { kind: "pushed"; savedAt: number }
  | { kind: "pulled"; data: SaveData; keepLocalAsBackup: boolean }
  | { kind: "offline" | "signed-out" | "error"; message?: string };

/** Progress score used only for a device's first sync, so a brand-new hero never replaces a real one. */
export const progress = (d: SaveData | null | undefined) => (d ? d.player.level * 1e9 + (d.player.xp ?? 0) : -1);

/**
 * Decide what to do. `lastSynced` = saved_at of the cloud copy this device last pushed or pulled (0 = never);
 * `lastLocal` = this device's own savedAt at that moment (a pulled copy is re-saved locally with a new time).
 * Pure function: unit-tested in tests/cloud.test.ts.
 */
export function decide(local: SaveData | null, remote: CloudRow | null, lastSynced: number, lastLocal = lastSynced): "push" | "pull" | "none" {
  if (!remote) return local ? "push" : "none";
  if (!local) return "pull";
  const ls = local.savedAt ?? 0;
  const rs = remote.saved_at;
  if (ls === rs) return "none";
  if (!lastSynced) {
    // first sync on this device: keep the hero with more progress; on a tie, the newer one
    const pl = progress(local), pr = progress(remote.data);
    if (pl !== pr) return pl > pr ? "push" : "pull";
    return ls > rs ? "push" : "pull";
  }
  const remoteChanged = rs !== lastSynced;
  const localChanged = ls > lastLocal;
  if (!remoteChanged) return localChanged ? "push" : "none";
  if (!localChanged) return "pull";
  return ls > rs ? "push" : "pull"; // both changed: newest wins (the loser is kept as a backup)
}

type Fetch = typeof fetch;
const SKEY = "ember-crypt-cloud-session";
const LKEY = "ember-crypt-cloud-last";
const DKEY = "ember-crypt-device";
const LLKEY = "ember-crypt-cloud-last-local";
/** v1.0: per-slot bookkeeping keys (slot 1 keeps the original names). */
const sk = (k: string, n: number) => (n === 1 ? k : `${k}#${n}`);

export class Cloud {
  session: Session | null = null;
  lastSynced = 0;
  lastLocal = 0;
  lastSyncAt = 0;
  status = "";
  /** v1.0: which hero slot this client syncs */
  slot = 1;
  constructor(
    private cfg: CloudConfig,
    private f: Fetch = (...a) => fetch(...a),
    private store: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = globalThis.localStorage ?? null,
  ) {
    try {
      this.session = JSON.parse(this.store?.getItem(SKEY) ?? "null");
      this.loadLast();
    } catch {
      this.session = null;
    }
  }
  private loadLast() {
    this.lastSynced = Number(this.store?.getItem(sk(LKEY, this.slot)) ?? 0) || 0;
    this.lastLocal = Number(this.store?.getItem(sk(LLKEY, this.slot)) ?? 0) || this.lastSynced;
  }
  /** v1.0: sync another hero slot from now on. */
  setSlot(n: number) {
    this.slot = n;
    this.loadLast();
  }
  /** Forget what every slot last synced (sign-in on a new account / sign-out). */
  private resetAll() {
    for (let n = 1; n <= 8; n++) {
      this.store?.removeItem(sk(LKEY, n));
      this.store?.removeItem(sk(LLKEY, n));
    }
    this.lastSynced = 0;
    this.lastLocal = 0;
  }
  get signedIn() {
    return !!this.session;
  }
  device(): string {
    let d = this.store?.getItem(DKEY);
    if (!d) {
      d = Math.random().toString(36).slice(2, 10);
      this.store?.setItem(DKEY, d);
    }
    return d;
  }
  private headers(auth = true): Record<string, string> {
    return {
      apikey: this.cfg.anonKey,
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth && this.session ? this.session.access : this.cfg.anonKey}`,
    };
  }
  private keep(s: Session | null) {
    this.session = s;
    if (s) this.store?.setItem(SKEY, JSON.stringify(s));
    else this.store?.removeItem(SKEY);
  }
  private setLast(v: number, local = v) {
    this.lastSynced = v;
    this.lastLocal = local;
    this.store?.setItem(sk(LKEY, this.slot), String(v));
    this.store?.setItem(sk(LLKEY, this.slot), String(local));
  }
  /** Mark another slot as in step with a cloud row (after copying a cloud-only hero onto this device). */
  markSynced(n: number, savedAt: number, localSavedAt = savedAt) {
    this.store?.setItem(sk(LKEY, n), String(savedAt));
    this.store?.setItem(sk(LLKEY, n), String(localSavedAt));
    if (n === this.slot) this.loadLast();
  }
  /** After applying a pulled copy, tell the client the local savedAt it was stored under. */
  adopted(localSavedAt: number) {
    this.setLast(this.lastSynced, localSavedAt);
  }

  /** Step 1: email a 6-digit code (creates the player on first use). */
  async sendCode(email: string): Promise<string | null> {
    const r = await this.f(`${this.cfg.url}/auth/v1/otp`, { method: "POST", headers: this.headers(false), body: JSON.stringify({ email, create_user: true }) });
    return r.ok ? null : await errText(r);
  }
  /** Step 2: the code from the email signs this device in. */
  async verify(email: string, code: string): Promise<string | null> {
    const r = await this.f(`${this.cfg.url}/auth/v1/verify`, { method: "POST", headers: this.headers(false), body: JSON.stringify({ type: "email", email, token: code.trim() }) });
    if (!r.ok) return await errText(r);
    this.keep(toSession(await r.json()));
    this.resetAll(); // first sync on this device is the careful one
    return null;
  }
  signOut() {
    this.keep(null);
    this.resetAll();
  }
  private async fresh(): Promise<boolean> {
    const s = this.session;
    if (!s) return false;
    if (s.expiresAt - Date.now() > 60_000) return true;
    const r = await this.f(`${this.cfg.url}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: this.headers(false), body: JSON.stringify({ refresh_token: s.refresh }) });
    if (!r.ok) {
      if (r.status === 400 || r.status === 401) this.keep(null);
      return false;
    }
    this.keep(toSession(await r.json()));
    return true;
  }
  async pull(): Promise<CloudRow | null> {
    const r = await this.f(`${this.cfg.url}/rest/v1/saves?select=data,saved_at,level,device&user_id=eq.${this.session!.userId}&slot=eq.${this.slot}`, { headers: this.headers() });
    if (!r.ok) throw new Error(await errText(r));
    const rows = (await r.json()) as CloudRow[];
    return rows[0] ?? null;
  }
  /** v1.0: every hero in the cloud (so a hero made on another device shows up here too). */
  async pullAll(): Promise<CloudRow[]> {
    if (!this.session || !(await this.fresh())) return [];
    const r = await this.f(`${this.cfg.url}/rest/v1/saves?select=slot,data,saved_at,level,device&user_id=eq.${this.session!.userId}`, { headers: this.headers() });
    if (!r.ok) throw new Error(await errText(r));
    return (await r.json()) as CloudRow[];
  }
  /** Compare-and-swap write. Returns the cloud row that won if someone else wrote a newer copy first. */
  async push(d: SaveData, expected: number): Promise<CloudRow | null> {
    const r = await this.f(`${this.cfg.url}/rest/v1/rpc/put_save`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ p_slot: this.slot, p_data: d, p_saved_at: d.savedAt ?? Date.now(), p_level: d.player.level, p_device: this.device(), p_expected: expected }),
    });
    if (!r.ok) throw new Error(await errText(r));
    const res = (await r.json()) as { ok: boolean; current?: CloudRow | null };
    return res.ok ? null : res.current ?? null;
  }

  /** One sync round. The caller applies a "pulled" result (replaceGame keeps the local hero as a backup). */
  async sync(local: SaveData | null): Promise<SyncResult> {
    if (!this.session) return { kind: "signed-out" };
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "offline" };
    try {
      if (!(await this.fresh())) return this.session ? { kind: "offline" } : { kind: "signed-out" };
      const remote = await this.pull();
      const what = decide(local, remote, this.lastSynced, this.lastLocal);
      if (what === "push" && local) {
        const winner = await this.push(local, remote?.saved_at ?? 0);
        if (!winner) {
          this.setLast(local.savedAt ?? 0);
          this.lastSyncAt = Date.now();
          return { kind: "pushed", savedAt: local.savedAt ?? 0 };
        }
        // someone wrote in between and theirs is newer: take it
        return this.took(winner, true);
      }
      if (what === "pull" && remote) return this.took(remote, !!local);
      if (remote) this.setLast(remote.saved_at);
      this.lastSyncAt = Date.now();
      return { kind: "none" };
    } catch (e) {
      return { kind: "error", message: (e as Error)?.message ?? String(e) };
    }
  }
  private took(row: CloudRow, keepLocal: boolean): SyncResult {
    this.setLast(row.saved_at);
    this.lastSyncAt = Date.now();
    return { kind: "pulled", data: { ...row.data, savedAt: row.saved_at }, keepLocalAsBackup: keepLocal };
  }
}

function toSession(j: { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email: string } }): Session {
  return { access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + j.expires_in * 1000, userId: j.user.id, email: j.user.email };
}
async function errText(r: Response): Promise<string> {
  try {
    const j = await r.json();
    return j.msg ?? j.error_description ?? j.message ?? j.error ?? `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}
