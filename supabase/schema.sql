-- Ember Crypt cloud save: run once in the Supabase SQL editor (free tier is plenty: a few small rows per player).
-- v1.0: one row per player AND hero slot (slot 1 = the original hero).
create table if not exists public.saves (
  user_id    uuid not null references auth.users (id) on delete cascade,
  slot       int  not null default 1 check (slot between 1 and 12),
  data       jsonb   not null,
  saved_at   bigint  not null,          -- the game's own savedAt (ms since epoch)
  level      int     not null default 1,
  device     text,
  prev_data  jsonb,                     -- the copy that was replaced last time (conflict backup)
  prev_saved_at bigint,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table public.saves enable row level security;

drop policy if exists "own save: read" on public.saves;
create policy "own save: read" on public.saves for select using (auth.uid() = user_id);
-- no direct insert/update/delete policies: writes only go through put_save() below

-- Compare-and-swap write. p_expected = the saved_at this device last saw (0 = none).
-- Overwrites when the cloud copy is the one expected or older than the incoming copy (newest wins);
-- the replaced copy goes into prev_data. Otherwise returns the newer cloud copy so the device can take it.
create or replace function public.put_save(p_slot int, p_data jsonb, p_saved_at bigint, p_level int, p_device text, p_expected bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur public.saves%rowtype;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if octet_length(p_data::text) > 512 * 1024 then
    raise exception 'save too large';
  end if;
  if p_slot is null or p_slot < 1 or p_slot > 12 then
    raise exception 'bad slot';
  end if;
  select * into cur from public.saves where user_id = uid and slot = p_slot for update;
  if not found then
    insert into public.saves (user_id, slot, data, saved_at, level, device) values (uid, p_slot, p_data, p_saved_at, p_level, p_device);
    return jsonb_build_object('ok', true);
  end if;
  if cur.saved_at = p_expected or cur.saved_at < p_saved_at then
    update public.saves
       set prev_data = cur.data, prev_saved_at = cur.saved_at,
           data = p_data, saved_at = p_saved_at, level = p_level, device = p_device, updated_at = now()
     where user_id = uid and slot = p_slot;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'current',
    jsonb_build_object('data', cur.data, 'saved_at', cur.saved_at, 'level', cur.level, 'device', cur.device));
end;
$$;
revoke all on function public.put_save(int, jsonb, bigint, int, text, bigint) from public, anon;
grant execute on function public.put_save(int, jsonb, bigint, int, text, bigint) to authenticated;

-- v1.0.1: delete one of your own heroes (Delete hero on the hero screen)
create or replace function public.delete_save(p_slot int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.saves where user_id = auth.uid() and slot = p_slot;
end;
$$;
revoke all on function public.delete_save(int) from public, anon;
grant execute on function public.delete_save(int) to authenticated;

-- v1.0.1 upgrade for a v1.0 table (12 hero slots):
--   alter table public.saves drop constraint if exists saves_slot_check, add constraint saves_slot_check check (slot between 1 and 12);
--   -- then re-run put_save and delete_save above

-- v1.0 upgrade for a v0.9 table created before hero slots (run once; the existing row becomes slot 1):
--   alter table public.saves add column if not exists slot int not null default 1 check (slot between 1 and 12);
--   alter table public.saves drop constraint if exists saves_pkey, add primary key (user_id, slot);
--   drop function if exists public.put_save(jsonb, bigint, int, text, bigint);
--   -- then re-run the create function / revoke / grant statements above
