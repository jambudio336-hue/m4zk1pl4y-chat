-- Cover foreign-key lookups introduced by the M4ZK foundation schema.
create index if not exists m4zk_call_signals_from_idx on public.m4zk_call_signals(from_id);
create index if not exists m4zk_call_signals_to_idx on public.m4zk_call_signals(to_id);
create index if not exists m4zk_media_owner_idx on public.m4zk_media(owner_id);
create index if not exists m4zk_media_message_idx on public.m4zk_media(message_id);
create index if not exists m4zk_media_story_idx on public.m4zk_media(story_id);
