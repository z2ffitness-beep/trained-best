-- 015: tell someone signing up that their email already has an account,
-- while they are on the account screen.
--
-- Until now the only way to find out was signUp() at the very end of the
-- signup, after every question had been answered (Isaiah, 30 Oct).
--
-- One read-only function. It answers true or false and nothing else: no id,
-- no name, no role. It reads auth.users, which the app cannot see directly,
-- so it runs as security definer with an empty search path.
--
-- No tables, no columns, no rows change.

create or replace function public.email_has_account(p_email text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from auth.users
     where lower(email) = lower(btrim(coalesce(p_email, '')))
  );
$function$;

revoke all on function public.email_has_account(text) from public;
grant execute on function public.email_has_account(text) to anon, authenticated;
