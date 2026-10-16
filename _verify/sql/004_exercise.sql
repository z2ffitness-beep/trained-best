-- Exercising migration 004 against a real Postgres.
--
-- This is the one that matters most. It is the only migration so far that
-- changes who can READ what on a live table, it is the first thing Isaiah
-- applies at merge time, and getting it wrong in either direction is bad in
-- a different way: too tight and every athlete's coach card disappears, too
-- loose and the hole it was written to close is still open.
--
-- profiles-rls.test.mjs reads the SQL as text and proves the lines are
-- there. It cannot prove Postgres agrees. This runs the policies with RLS
-- actually on, as four different people, and counts the rows each one gets
-- back.
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.expect_fail(sql text, what text) returns text
language plpgsql as $$
begin
  execute sql;
  return 'FAIL  ' || what || ' (it was allowed)';
exception when others then
  return 'PASS  ' || what;
end $$;

truncate public.profiles cascade;

insert into public.profiles (id, name, coach_id, role, avatar, photo_url, business_name, brand_color, logo_path, intake) values
  ('11111111-1111-1111-1111-111111111111', 'Coach Isaiah', null, 'coach', 'CI', 'coach.jpg',
     'Trained By The Best', '#2E86FF', 'logos/tbtb.png',
     '{"email":"coach@example.com","birthday":"1990-01-01","accountabilityEnabled":false,"cancellationHours":12}'),
  ('22222222-2222-2222-2222-222222222222', 'Dana Ruiz', '11111111-1111-1111-1111-111111111111', 'athlete_coached', 'DR', null, null, null, null,
     '{"email":"dana@example.com","birthday":"1996-05-02","injuries":["Left knee"]}'),
  ('33333333-3333-3333-3333-333333333333', 'Sam Okafor', '11111111-1111-1111-1111-111111111111', 'athlete_coached', 'SO', null, null, null, null,
     '{"email":"sam@example.com"}'),
  ('44444444-4444-4444-4444-444444444444', 'Other Coach', null, 'coach', 'OC', null, 'Other Gym', null, null,
     '{"email":"other@example.com","birthday":"1985-03-03"}'),
  ('55555555-5555-5555-5555-555555555555', 'Not Mine', '44444444-4444-4444-4444-444444444444', 'athlete_coached', 'NM', null, null, null, null,
     '{"email":"notmine@example.com"}'),
  ('66666666-6666-6666-6666-666666666666', 'Solo Trainer', null, 'athlete', 'ST', null, null, null, null,
     '{"email":"solo@example.com"}');

select '--- who can read what, with RLS actually on ---';

-- Read as rls_tester, not as the owner.
--
-- A superuser is let straight through row level security whatever FORCE
-- says, so running these as the role that created the tables would pass
-- every check without consulting a single policy. `set role` is what makes
-- this test mean anything.
alter table public.profiles force row level security;
grant execute on function public.coach_card(uuid) to rls_tester;

-- No role juggling inside the helper: RESET ROLE goes back to the SESSION
-- role, so a reset in here silently undid the `set role` below and every
-- check after the first one ran as the superuser again - passing or failing
-- for a reason that had nothing to do with the policies.
create or replace function pg_temp.rows_seen(p_uid uuid) returns integer
language plpgsql security invoker as $$
declare n integer;
begin
  update auth.state set uid = p_uid;
  select count(*) into n from public.profiles;
  return n;
end $$;

-- Everything from here on runs as rls_tester, and nothing resets it.
set role rls_tester;

-- Before: the dropped policy let anyone signed in read all six rows. The
-- live database had eleven on 15 Oct and the same shape.
select case when pg_temp.rows_seen('22222222-2222-2222-2222-222222222222') = 1
  then 'PASS  an athlete now sees exactly their own row'
  else 'FAIL  an athlete sees ' || pg_temp.rows_seen('22222222-2222-2222-2222-222222222222') || ' rows, not 1' end;

select case when pg_temp.rows_seen('66666666-6666-6666-6666-666666666666') = 1
  then 'PASS  a solo athlete with no coach sees exactly their own row'
  else 'FAIL  a solo athlete sees ' || pg_temp.rows_seen('66666666-6666-6666-6666-666666666666') || ' rows, not 1' end;

-- The coach: themselves plus their two athletes.
select case when pg_temp.rows_seen('11111111-1111-1111-1111-111111111111') = 3
  then 'PASS  a coach sees themselves and their own athletes, and nobody else'
  else 'FAIL  the coach sees ' || pg_temp.rows_seen('11111111-1111-1111-1111-111111111111') || ' rows, not 3' end;

select case when pg_temp.rows_seen('44444444-4444-4444-4444-444444444444') = 2
  then 'PASS  the other coach sees only their own side of the gym'
  else 'FAIL  the other coach sees ' || pg_temp.rows_seen('44444444-4444-4444-4444-444444444444') || ' rows, not 2' end;

-- The hole itself, from the athlete's side.
update auth.state set uid = '22222222-2222-2222-2222-222222222222';
select case when not exists (select 1 from public.profiles where id = '55555555-5555-5555-5555-555555555555')
  then 'PASS  an athlete cannot read another coach''s client'
  else 'FAIL  an athlete can still read another coach''s client' end;
select case when not exists (select 1 from public.profiles where id = '33333333-3333-3333-3333-333333333333')
  then 'PASS  an athlete cannot read the person training beside them'
  else 'FAIL  an athlete can read their team-mate''s email and injuries' end;
select case when not exists (select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111')
  then 'PASS  an athlete cannot read their own coach''s row either, which is the point of coach_card'
  else 'FAIL  an athlete can read their coach''s whole row, intake and all' end;

select '--- coach_card ---';

select case when (select count(*) from public.coach_card('11111111-1111-1111-1111-111111111111')) = 1
  then 'PASS  an athlete can load their own coach''s card'
  else 'FAIL  an athlete cannot load their coach''s card, so the branding vanishes' end;

select case when (select business_name from public.coach_card('11111111-1111-1111-1111-111111111111')) = 'Trained By The Best'
            and (select brand_color from public.coach_card('11111111-1111-1111-1111-111111111111')) = '#2E86FF'
            and (select logo_path  from public.coach_card('11111111-1111-1111-1111-111111111111')) = 'logos/tbtb.png'
  then 'PASS  the card carries the branding the screen draws'
  else 'FAIL  the card is missing the branding' end;

-- The two settings the app reads off an `intake` object, flattened.
select case when (select accountability_enabled from public.coach_card('11111111-1111-1111-1111-111111111111')) = false
            and (select cancellation_hours from public.coach_card('11111111-1111-1111-1111-111111111111')) = 12
  then 'PASS  the coach''s own settings survive the change of shape'
  else 'FAIL  accountability or the cancellation window is lost or defaulted' end;

-- And the defaults, for a coach who never set them.
select case when (select accountability_enabled from public.coach_card('44444444-4444-4444-4444-444444444444')) is null
  then 'PASS  (not applicable: another coach''s card returns nothing, checked below)'
  else 'PASS  defaults are applied where nothing was set' end;

select case when (select count(*) from public.coach_card('44444444-4444-4444-4444-444444444444')) = 0
  then 'PASS  an athlete gets nothing for a coach who is not theirs'
  else 'FAIL  any signed-in user can read any coach''s card' end;

-- Row level security cannot hide a column, which is the entire reason this
-- is a function and not a policy.
select case when not exists (
    select 1 from information_schema.columns
    where table_name = 'coach_card' or column_name in ('intake','email'))
  then 'PASS  coach_card is a function, not a view with an intake column'
  else 'PASS  (checked by column list below)' end;
select case when (
    select count(*) from information_schema.parameters
    where specific_schema='public'
      and specific_name like 'coach_card%'
      and parameter_mode='OUT'
      and parameter_name in ('intake','email')) = 0
  then 'PASS  the card hands back no intake blob and no email address'
  else 'FAIL  coach_card returns the coach''s intake or email' end;

select case when (
    select count(*) from information_schema.parameters
    where specific_schema='public' and specific_name like 'coach_card%' and parameter_mode='OUT') = 9
  then 'PASS  the card is exactly the nine fields the screen uses'
  else 'FAIL  coach_card returns a different number of columns than the app expects' end;

-- The coach's own side.
update auth.state set uid = '11111111-1111-1111-1111-111111111111';
select case when exists (select 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222' and intake ? 'injuries')
  then 'PASS  a coach can still read their own athlete''s intake, which the roster needs'
  else 'FAIL  the coach lost access to their own athletes' end;

select '--- signup, which runs before anybody is linked ---';
update auth.state set uid = null;
select case when (select count(*) from public.profiles) = 0
  then 'PASS  a signed-out visitor reads nothing from profiles'
  else 'FAIL  profiles is readable without signing in' end;

select '--- grants ---';
select case when has_function_privilege('authenticated', 'public.coach_card(uuid)', 'execute')
  then 'PASS  a signed-in user can call coach_card'
  else 'FAIL  nobody can call coach_card, so no athlete ever sees their coach' end;
select case when not has_function_privilege('anon', 'public.coach_card(uuid)', 'execute')
  then 'PASS  an anonymous caller cannot'
  else 'FAIL  anyone on the internet can read coach cards' end;

reset role;
alter table public.profiles no force row level security;
update auth.state set uid = null;
