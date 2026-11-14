begin;

alter table public.m4zk_messages
  add column if not exists deleted_at bigint;

create table if not exists public.m4zk_message_hidden (
  message_id text not null references public.m4zk_messages(id) on delete cascade,
  user_id text not null references public.m4zk_users(id) on delete cascade,
  hidden_at bigint not null,
  primary key (message_id, user_id)
);

create index if not exists m4zk_message_hidden_user_idx
  on public.m4zk_message_hidden(user_id, message_id);

alter table public.m4zk_message_hidden enable row level security;
revoke all on public.m4zk_message_hidden from anon, authenticated;
grant all on public.m4zk_message_hidden to service_role;

commit;
