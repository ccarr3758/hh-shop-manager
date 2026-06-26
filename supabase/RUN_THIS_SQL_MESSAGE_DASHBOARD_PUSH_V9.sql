-- Message dashboard + direct-message push target support.
-- Safe to run more than once.

alter table if exists public.web_push_subscriptions
  add column if not exists user_profile_id uuid references public.user_profiles(id) on delete set null;

create index if not exists web_push_subscriptions_user_profile_id_idx
  on public.web_push_subscriptions(user_profile_id);

alter table if exists public.shop_thread_messages
  add column if not exists read_at timestamptz;

create index if not exists shop_thread_messages_unread_idx
  on public.shop_thread_messages(thread_id, sender_user_id, read_at);
