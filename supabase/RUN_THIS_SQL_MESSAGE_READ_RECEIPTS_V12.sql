-- Fix unread messages coming back after refresh.
-- Run this once in Supabase SQL editor.

alter table if exists public.shop_thread_messages
  add column if not exists read_at timestamptz;

create index if not exists shop_thread_messages_unread_idx
  on public.shop_thread_messages(thread_id, sender_user_id, read_at);

drop policy if exists "participants update message read receipts" on public.shop_thread_messages;
create policy "participants update message read receipts" on public.shop_thread_messages
for update to authenticated
using (
  sender_user_id <> auth.uid()
  and exists (
    select 1 from public.shop_message_threads t
    where t.id = thread_id
      and (t.participant_a_user_id = auth.uid() or t.participant_b_user_id = auth.uid())
  )
)
with check (
  sender_user_id <> auth.uid()
  and exists (
    select 1 from public.shop_message_threads t
    where t.id = thread_id
      and (t.participant_a_user_id = auth.uid() or t.participant_b_user_id = auth.uid())
  )
);
