-- M4ZK public profile avatars.
alter table public.m4zk_users add column if not exists avatar_url text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('m4zk-avatars', 'm4zk-avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
