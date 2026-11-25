import { describe, expect, it } from "vitest";
import { Cloud, cloudConfig, decide, type CloudRow } from "../src/cloud";
import type { SaveData } from "../src/game";

const save = (level: number, savedAt: number, gold = 0) => ({ v: 6, savedAt, player: { level, xp: level * 100, gold } }) as unknown as SaveData;
const row = (level: number, saved_at: number): CloudRow => ({ data: save(level, saved_at), saved_at, level, device: "x" });

describe("cloud flag", () => {
  it("is off unless configured and flagged", () => {
    expect(cloudConfig({})).toBeNull();
    expect(cloudConfig({ VITE_SUPABASE_URL: "https://a.supabase.co", VITE_SUPABASE_ANON_KEY: "k" })).toBeNull();
    expect(cloudConfig({ VITE_SUPABASE_URL: "https://a.supabase.co/", VITE_SUPABASE_ANON_KEY: "k", VITE_CLOUD: "1" })).toEqual({ url: "https://a.supabase.co", anonKey: "k" });
    expect(cloudConfig({ VITE_SUPABASE_URL: "https://a.supabase.co", VITE_SUPABASE_ANON_KEY: "k" }, "?cloud")).not.toBeNull();
  });
});

describe("decide (newest wins, careful first sync)", () => {
  it("empty sides", () => {
    expect(decide(null, null, 0)).toBe("none");
    expect(decide(save(3, 10), null, 0)).toBe("push");
    expect(decide(null, row(3, 10), 0)).toBe("pull");
  });
  it("first sync on a device keeps the hero with more progress, even if older", () => {
    expect(decide(save(1, 999), row(30, 10), 0)).toBe("pull"); // fresh phone never overwrites the real hero
    expect(decide(save(30, 10), row(2, 999), 0)).toBe("push");
    expect(decide(save(5, 20), row(5, 10), 0)).toBe("push");
  });
  it("after syncing: only the side that changed moves", () => {
    expect(decide(save(5, 10), row(5, 10), 10)).toBe("none");
    expect(decide(save(6, 20), row(5, 10), 10)).toBe("push");
    expect(decide(save(5, 10), row(7, 30), 10)).toBe("pull");
  });
  it("both changed: newest wins", () => {
    expect(decide(save(6, 40), row(7, 30), 10)).toBe("push");
    expect(decide(save(9, 25), row(7, 30), 10)).toBe("pull");
  });
});

/** A tiny fake Supabase: auth + the saves table + put_save with the same CAS rule as supabase/schema.sql. */
function fakeSupabase() {
  const db: { row: (CloudRow & { prev?: SaveData }) | null } = { row: null };
  const calls: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    calls.push(u.pathname);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "Content-Type": "application/json" } });
    if (u.pathname === "/auth/v1/otp") return body.email?.includes("@") ? json({}) : json({ msg: "bad email" }, 400);
    if (u.pathname === "/auth/v1/verify")
      return body.token === "123456" ? json({ access_token: "A", refresh_token: "R", expires_in: 3600, user: { id: "u1", email: body.email } }) : json({ msg: "Token has expired or is invalid" }, 403);
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    if (auth !== "Bearer A") return json({ message: "JWT" }, 401);
    if (u.pathname === "/rest/v1/saves") return json(db.row ? [{ data: db.row.data, saved_at: db.row.saved_at, level: db.row.level, device: db.row.device }] : []);
    if (u.pathname === "/rest/v1/rpc/put_save") {
      const cur = db.row;
      if (!cur || cur.saved_at === body.p_expected || cur.saved_at < body.p_saved_at) {
        db.row = { data: body.p_data, saved_at: body.p_saved_at, level: body.p_level, device: body.p_device, prev: cur?.data };
        return json({ ok: true });
      }
      return json({ ok: false, current: { data: cur.data, saved_at: cur.saved_at, level: cur.level, device: cur.device } });
    }
    return json({}, 404);
  }) as typeof fetch;
  return { db, f, calls };
}
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const cfg = { url: "https://p.supabase.co", anonKey: "anon" };

describe("Cloud client against a fake Supabase", () => {
  it("sign in with an emailed code, then push, then the second device pulls", async () => {
    const sb = fakeSupabase();
    const phone = new Cloud(cfg, sb.f, mem());
    expect(await phone.sync(save(3, 1))).toEqual({ kind: "signed-out" });
    expect(await phone.sendCode("james@example.com")).toBeNull();
    expect(await phone.verify("james@example.com", "000000")).toMatch(/invalid/);
    expect(await phone.verify("james@example.com", "123456")).toBeNull();
    expect(phone.signedIn).toBe(true);
    expect((await phone.sync(save(20, 100))).kind).toBe("pushed");
    expect(sb.db.row?.level).toBe(20);

    // an iPad that started a fresh level 1 hero signs in: it must take the level 20 hero, keeping its own as a backup
    const ipad = new Cloud(cfg, sb.f, mem());
    await ipad.verify("james@example.com", "123456");
    const r = await ipad.sync(save(1, 500));
    expect(r.kind).toBe("pulled");
    if (r.kind === "pulled") {
      expect(r.data.player.level).toBe(20);
      expect(r.keepLocalAsBackup).toBe(true);
    }
    expect(sb.db.row?.level).toBe(20);
  });

  it("conflict: both devices changed; newest wins and the cloud keeps the loser in prev", async () => {
    const sb = fakeSupabase();
    const a = new Cloud(cfg, sb.f, mem());
    const b = new Cloud(cfg, sb.f, mem());
    await a.verify("j@x.y", "123456");
    await b.verify("j@x.y", "123456");
    await a.sync(save(10, 100));
    await b.sync(save(10, 100)); // b in step: none
    expect(b.lastSynced).toBe(100);
    await a.sync(save(11, 200)); // a plays on
    const rb = await b.sync(save(12, 300)); // b played too, later: b wins
    expect(rb.kind).toBe("pushed");
    expect(sb.db.row?.level).toBe(12);
    expect(sb.db.row?.prev?.player.level).toBe(11);
    const ra = await a.sync(save(11, 250)); // a played a bit more but older than b: a takes b, keeps its own as backup
    expect(ra.kind).toBe("pulled");
    if (ra.kind === "pulled") expect(ra.keepLocalAsBackup).toBe(true);
  });

  it("race: someone pushes between our read and write; the newer cloud copy wins", async () => {
    const sb = fakeSupabase();
    const a = new Cloud(cfg, sb.f, mem());
    await a.verify("j@x.y", "123456");
    await a.sync(save(10, 100));
    const realF = sb.f;
    let sneaky = true;
    const f2 = (async (url: string, init?: RequestInit) => {
      if (sneaky && String(url).includes("put_save")) {
        sneaky = false;
        sb.db.row = { ...row(15, 900) };
      }
      return realF(url, init);
    }) as typeof fetch;
    const a2 = new Cloud(cfg, f2, mem());
    await a2.verify("j@x.y", "123456");
    (a2 as unknown as { lastSynced: number }).lastSynced = 100;
    const r = await a2.sync(save(11, 200));
    expect(r.kind).toBe("pulled");
    if (r.kind === "pulled") expect(r.data.player.level).toBe(15);
  });

  it("no ping-pong: a pulled copy re-saved locally with a new time is not pushed back", async () => {
    const sb = fakeSupabase();
    const a = new Cloud(cfg, sb.f, mem());
    await a.verify("j@x.y", "123456");
    await a.sync(save(10, 100));
    sb.db.row = { ...row(12, 300) }; // another device pushed
    const r = await a.sync(save(10, 100));
    expect(r.kind).toBe("pulled");
    a.adopted(350); // the game re-saved the pulled hero at 350
    expect((await a.sync(save(12, 350))).kind).toBe("none");
    expect((await a.sync(save(12, 400))).kind).toBe("pushed"); // real progress still goes up
  });

  it("sign out forgets the session; offline is reported, not an error", async () => {
    const sb = fakeSupabase();
    const a = new Cloud(cfg, sb.f, mem());
    await a.verify("j@x.y", "123456");
    a.signOut();
    expect(a.signedIn).toBe(false);
    expect((await a.sync(save(1, 1))).kind).toBe("signed-out");
  });
});
