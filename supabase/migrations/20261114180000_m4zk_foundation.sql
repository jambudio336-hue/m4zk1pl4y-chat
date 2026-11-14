-- M4ZK Phase 1: foundation tables, message sequencing, private buckets and storage ownership.
begin;

alter table public.m4zk_messages
  add column if not exists client_msg_id text,
  add column if not exists server_seq bigserial,
  add column if not exists status text not null default 'sent';

create unique index if not exists m4zk_messages_sender_client_msg_uidx
  on public.m4zk_messages(sender_id, client_msg_id)
  where client_msg_id is not null;
create unique index if not exists m4zk_messages_server_seq_uidx
  on public.m4zk_messages(server_seq);
create index if not exists m4zk_messages_pair_seq_idx
  on public.m4zk_messages(sender_id, recipient_id, server_seq);

alter table public.m4zk_story_views
  add column if not exists seen_at bigint;

alter table public.m4zk_users
  add column if not exists nearby_opt_in boolean not null default false,
  add column if not exists geohash text,
  add column if not exists last_geohash_at bigint,
  add column if not exists country text;

create table if not exists public.m4zk_media (
  id text primary key,
  owner_id text not null references public.m4zk_users(id) on delete cascade,
  message_id text references public.m4zk_messages(id) on delete cascade,
  story_id text references public.m4zk_stories(id) on delete cascade,
  bucket text not null check (bucket in ('m4zk-media','m4zk-stories')),
  path text not null,
  thumb_path text,
  mime text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  duration_ms bigint,
  key_b64 text not null,
  iv_b64 text not null,
  sha256 text not null,
  created_at bigint not null
);

create table if not exists public.m4zk_call_signals (
  id text primary key,
  call_id text not null references public.m4zk_calls(id) on delete cascade,
  from_id text not null references public.m4zk_users(id) on delete cascade,
  to_id text not null references public.m4zk_users(id) on delete cascade,
  type text not null check (type in ('offer','answer','ice','hangup','reject','busy')),
  payload jsonb not null default '{}'::jsonb,
  created_at bigint not null
);
create index if not exists m4zk_call_signals_call_created_idx
  on public.m4zk_call_signals(call_id, created_at);

create table if not exists public.m4zk_push_tokens (
  token text primary key,
  user_id text not null references public.m4zk_users(id) on delete cascade,
  platform text not null,
  device_label text,
  updated_at bigint not null
);
create index if not exists m4zk_push_tokens_user_idx on public.m4zk_push_tokens(user_id);

create table if not exists public.m4zk_rate_limits (
  bucket text primary key,
  window_start bigint not null,
  count integer not null default 0 check (count >= 0)
);

create table if not exists public.m4zk_sessions (
  id text primary key,
  user_id text not null references public.m4zk_users(id) on delete cascade,
  device_label text not null default 'unknown',
  last_ip_hash text,
  created_at bigint not null,
  revoked_at bigint
);
create index if not exists m4zk_sessions_user_active_idx
  on public.m4zk_sessions(user_id, created_at desc) where revoked_at is null;

create table if not exists public.m4zk_invites (
  code text primary key,
  user_id text not null references public.m4zk_users(id) on delete cascade,
  created_at bigint not null,
  hit_count bigint not null default 0
);
create index if not exists m4zk_invites_user_idx on public.m4zk_invites(user_id);

alter table public.m4zk_media enable row level security;
alter table public.m4zk_call_signals enable row level security;
alter table public.m4zk_push_tokens enable row level security;
alter table public.m4zk_rate_limits enable row level security;
alter table public.m4zk_sessions enable row level security;
alter table public.m4zk_invites enable row level security;

revoke all on public.m4zk_media, public.m4zk_call_signals, public.m4zk_push_tokens,
  public.m4zk_rate_limits, public.m4zk_sessions, public.m4zk_invites
  from anon, authenticated;
grant all on public.m4zk_media, public.m4zk_call_signals, public.m4zk_push_tokens,
  public.m4zk_rate_limits, public.m4zk_sessions, public.m4zk_invites
  to service_role;
grant usage, select on all sequences in schema public to service_role;

create or replace function public.m4zk_consume_rate_limit(
  p_bucket text,
  p_window_start bigint,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.m4zk_rate_limits(bucket, window_start, count)
  values (p_bucket, p_window_start, 1)
  on conflict (bucket) do update
    set window_start = excluded.window_start,
        count = case
          when public.m4zk_rate_limits.window_start = excluded.window_start
            then public.m4zk_rate_limits.count + 1
          else 1
        end
  returning count into current_count;
  return current_count <= p_limit;
end;
$$;
revoke all on function public.m4zk_consume_rate_limit(text, bigint, integer) from public, anon, authenticated;
grant execute on function public.m4zk_consume_rate_limit(text, bigint, integer) to service_role;

insert into storage.buckets (id, name, public)
values ('m4zk-media', 'm4zk-media', false),
       ('m4zk-stories', 'm4zk-stories', false)
on conflict (id) do update set public = false;

drop policy if exists m4zk_media_owner_read on storage.objects;
create policy m4zk_media_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id in ('m4zk-media','m4zk-stories')
    and (storage.foldername(name))[1] = (auth.jwt()->>'sub')
  );
drop policy if exists m4zk_media_owner_insert on storage.objects;
create policy m4zk_media_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('m4zk-media','m4zk-stories')
    and (storage.foldername(name))[1] = (auth.jwt()->>'sub')
  );
drop policy if exists m4zk_media_owner_update on storage.objects;
create policy m4zk_media_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('m4zk-media','m4zk-stories')
    and (storage.foldername(name))[1] = (auth.jwt()->>'sub')
  )
  with check (
    bucket_id in ('m4zk-media','m4zk-stories')
    and (storage.foldername(name))[1] = (auth.jwt()->>'sub')
  );
drop policy if exists m4zk_media_owner_delete on storage.objects;
create policy m4zk_media_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('m4zk-media','m4zk-stories')
    and (storage.foldername(name))[1] = (auth.jwt()->>'sub')
  );

commit;