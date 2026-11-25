-- Ember Crypt cloud save: run once in the Supabase SQL editor (free tier is plenty: one small row per player).
create table if not exists public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb   not null,
  saved_at   bigint  not null,          -- the game's own savedAt (ms since epoch)
  level      int     not null default 1,
  device     text,
  prev_data  jsonb,                     -- the copy that was replaced last time (conflict backup)
  prev_saved_at bigint,
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;

drop policy if exists "own save: read" on public.saves;
create policy "own save: read" on public.saves for select using (auth.uid() = user_id);
-- no direct insert/update/delete policies: writes only go through put_save() below

-- Compare-and-swap write. p_expected = the saved_at this device last saw (0 = none).
-- Overwrites when the cloud copy is the one expected or older than the incoming copy (newest wins);
-- the replaced copy goes into prev_data. Otherwise returns the newer cloud copy so the device can take it.
create or replace function public.put_save(p_data jsonb, p_saved_at bigint, p_level int, p_device text, p_expected bigint)
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
  select * into cur from public.saves where user_id = uid for update;
  if not found then
    insert into public.saves (user_id, data, saved_at, level, device) values (uid, p_data, p_saved_at, p_level, p_device);
    return jsonb_build_object('ok', true);
  end if;
  if cur.saved_at = p_expected or cur.saved_at < p_saved_at then
    update public.saves
       set prev_data = cur.data, prev_saved_at = cur.saved_at,
           data = p_data, saved_at = p_saved_at, level = p_level, device = p_device, updated_at = now()
     where user_id = uid;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'current',
    jsonb_build_object('data', cur.data, 'saved_at', cur.saved_at, 'level', cur.level, 'device', cur.device));
end;
$$;
revoke all on function public.put_save(jsonb, bigint, int, text, bigint) from public, anon;
grant execute on function public.put_save(jsonb, bigint, int, text, bigint) to authenticated;
