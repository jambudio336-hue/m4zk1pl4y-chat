-- Add covering indexes for foreign-key lookups identified by Supabase performance advisors.
create index if not exists m4zk_blocks_peer_idx on public.m4zk_blocks(peer_id);
create index if not exists m4zk_calls_caller_idx on public.m4zk_calls(caller_id);
create index if not exists m4zk_calls_callee_idx on public.m4zk_calls(callee_id);
create index if not exists m4zk_contacts_peer_idx on public.m4zk_contacts(peer_id);
create index if not exists m4zk_stories_user_idx on public.m4zk_stories(user_id);
create index if not exists m4zk_story_recipients_user_idx on public.m4zk_story_recipients(user_id);
create index if not exists m4zk_story_views_user_idx on public.m4zk_story_views(user_id);
