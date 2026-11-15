begin;

create table if not exists public.m4zk_message_reactions (
  message_id text not null references public.m4zk_messages(id) on delete cascade,
  user_id text not null references public.m4zk_users(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','😮','😢','🙏','👌','🔥')),
  created_at bigint not null,
  primary key (message_id, user_id)
);

create index if not exists m4zk_message_reactions_message_idx
  on public.m4zk_message_reactions(message_id);

alter table public.m4zk_message_reactions enable row level security;
revoke all on public.m4zk_message_reactions from anon, authenticated;
grant all on public.m4zk_message_reactions to service_role;

commit;
