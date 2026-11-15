-- Add bounded duration metadata and video message/story kinds.
begin;
alter table public.m4zk_messages
  drop constraint if exists m4zk_messages_kind_check;
alter table public.m4zk_messages
  add constraint m4zk_messages_kind_check
  check (kind in ('text','image','voice','video'));
alter table public.m4zk_messages
  add column if not exists duration_ms bigint;
alter table public.m4zk_messages
  add constraint m4zk_messages_duration_ms_check
  check (duration_ms is null or duration_ms between 1 and 1800000);

alter table public.m4zk_stories
  drop constraint if exists m4zk_stories_kind_check;
alter table public.m4zk_stories
  add constraint m4zk_stories_kind_check
  check (kind in ('text','image','video'));
alter table public.m4zk_stories
  add column if not exists duration_ms bigint;
alter table public.m4zk_stories
  add constraint m4zk_stories_duration_ms_check
  check (duration_ms is null or duration_ms between 1 and 120000);
commit;
