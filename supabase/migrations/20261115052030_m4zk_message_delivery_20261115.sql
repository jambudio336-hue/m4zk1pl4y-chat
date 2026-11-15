begin;

alter table public.m4zk_messages
  add column if not exists delivered_at bigint;

create index if not exists m4zk_messages_recipient_delivery_idx
  on public.m4zk_messages(recipient_id, sender_id, delivered_at)
  where delivered_at is null;

commit;
