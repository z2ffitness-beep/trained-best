-- 007: phone notifications.
--
-- Approved by Isaiah on 23 Oct 2026. Additive only: one new table, one new
-- trigger, three helper functions, the pg_net extension, and two values in
-- Vault. Nothing existing is changed or dropped.
--
-- HOW IT WORKS
--
--   1. A person taps "Turn on phone notifications". Their phone hands the app
--      a push address, which is saved in push_subscriptions.
--   2. Whenever a row lands in public.notifications (the bell), the trigger
--      below posts that row's id to the send-push Edge Function.
--   3. send-push looks up that person's phones and sends the title and body.
--
-- The signing keys (VAPID) are created by send-push itself on first use and
-- kept in Vault, so the private key is never in the code, in Vercel, or in
-- anybody's clipboard. The trigger proves it is the trigger with a random
-- secret that also lives only in Vault.

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

drop policy if exists "push_subscriptions_own_read" on public.push_subscriptions;
create policy "push_subscriptions_own_read" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "push_subscriptions_own_insert" on public.push_subscriptions;
create policy "push_subscriptions_own_insert" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "push_subscriptions_own_update" on public.push_subscriptions;
create policy "push_subscriptions_own_update" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "push_subscriptions_own_delete" on public.push_subscriptions;
create policy "push_subscriptions_own_delete" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- The trigger's secret. Random, made here, never seen by anybody.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_hook_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_hook_secret',
      'Proves a call to send-push came from the notifications trigger');
  end if;
end $$;

-- Read and write the push settings in Vault. service_role only: that is the
-- key the Edge Function runs with, and it is never in the browser.
create or replace function public.push_config_get()
returns table (vapid_public text, vapid_private text, hook_secret text)
language sql stable security definer set search_path = public
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_public'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_private'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret');
$$;
revoke all on function public.push_config_get() from public, anon, authenticated;
grant execute on function public.push_config_get() to service_role;

-- Stores the signing keys once. A second call is ignored, so two first
-- requests racing cannot leave phones subscribed to a key that was replaced.
create or replace function public.push_config_init(p_public text, p_private text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('push_vapid'));
  if not exists (select 1 from vault.secrets where name = 'push_vapid_private') then
    perform vault.create_secret(p_public, 'push_vapid_public', 'Web push public key');
    perform vault.create_secret(p_private, 'push_vapid_private', 'Web push private key');
  end if;
end;
$$;
revoke all on function public.push_config_init(text, text) from public, anon, authenticated;
grant execute on function public.push_config_init(text, text) to service_role;

-- Every new bell notification is also offered to the person's phones.
-- Fire and forget: pg_net queues the request, so a slow or failed push can
-- never hold up or undo the insert that a workout log depends on.
create or replace function public.notifications_push_hook()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_secret text;
begin
  if not exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    return new;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_hook_secret';
  perform net.http_post(
    url := 'https://pkujygyibuiyyrryrswr.supabase.co/functions/v1/send-push',
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-hook-secret', v_secret)
  );
  return new;
exception when others then
  -- Never let the phone side break the bell side.
  return new;
end;
$$;
revoke all on function public.notifications_push_hook() from public, anon, authenticated;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.notifications_push_hook();
