-- Exercising migration 005 against a real Postgres.
--
-- Everything in schedule.test.mjs that touches the server is a source
-- assertion: the SQL says `v_slot.coach_id <> auth.uid()`. That proves the
-- line is there. It does not prove the function refuses, that the status
-- lands in the check constraint, or that the notification `kind` is one the
-- table allows - and a constraint violation at that layer would only ever
-- show up when Isaiah applies the migration to production.
--
-- Each case prints PASS or FAIL. Any FAIL line is a bug in the migration.
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.expect_fail(sql text, what text) returns text
language plpgsql as $$
begin
  execute sql;
  return 'FAIL  ' || what || ' (it was allowed)';
exception when others then
  return 'PASS  ' || what || ' -> ' || sqlerrm;
end $$;

create or replace function pg_temp.expect_ok(sql text, what text) returns text
language plpgsql as $$
begin
  execute sql;
  return 'PASS  ' || what;
exception when others then
  return 'FAIL  ' || what || ' -> ' || sqlerrm;
end $$;

-- ---------- the world ----------
truncate public.bookings, public.notifications, public.availability_slots,
         public.session_types, public.profiles;

insert into public.profiles (id, name, coach_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'Coach Isaiah', null, 'coach'),
  ('22222222-2222-2222-2222-222222222222', 'Dana Ruiz', '11111111-1111-1111-1111-111111111111', 'athlete_coached'),
  ('33333333-3333-3333-3333-333333333333', 'Sam Okafor', '11111111-1111-1111-1111-111111111111', 'athlete_coached'),
  ('44444444-4444-4444-4444-444444444444', 'Other Coach', null, 'coach'),
  ('55555555-5555-5555-5555-555555555555', 'Not Mine', '44444444-4444-4444-4444-444444444444', 'athlete_coached'),
  -- A THIRD athlete on this coach's roster. Without one, "a semi-private
  -- refuses a third" was refused by the roster check before capacity was
  -- ever counted, and passed having tested nothing.
  ('66666666-6666-6666-6666-666666666666', 'Rae Lindo', '11111111-1111-1111-1111-111111111111', 'athlete_coached');

insert into public.session_types (id, coach_id, name, capacity, delivery) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '1-on-1', 1, 'in_person'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Semi-private', 2, 'in_person'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Online live', 2, 'in_app_live');

insert into public.availability_slots (id, coach_id, session_type_id, starts_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', now() + interval '2 days'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', now() + interval '3 days'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '2 hours'),
  ('bbbbbbbb-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', now() + interval '2 days'),
  ('bbbbbbbb-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', now() + interval '4 days'),
  -- EMPTY, and this coach's. Without it the cross-coach and stranger
  -- checks were aimed at a slot that was already full, so they were
  -- refused with "That session is full" and proved nothing about who is
  -- allowed to fill a time.
  ('bbbbbbbb-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', now() + interval '5 days'),
  -- A PAST semi-private, so a cancelled booking can be aimed at a session
  -- that has actually happened - otherwise mark_no_show refuses it for
  -- being in the future and the cancelled-session guard is never reached.
  ('bbbbbbbb-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', now() - interval '3 hours');
update public.availability_slots set cancelled_at = now()
  where id = 'bbbbbbbb-0000-0000-0000-000000000005';

update auth.state set uid = '11111111-1111-1111-1111-111111111111';

select '--- book_athlete_into_slot ---';

select pg_temp.expect_ok(
  $q$ select public.book_athlete_into_slot('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222') $q$,
  'the coach books their own athlete into their own time');

-- The headline rule: no credit check. Dana has no pack of any kind.
select case when exists (
    select 1 from public.bookings
    where slot_id='bbbbbbbb-0000-0000-0000-000000000001'
      and athlete_id='22222222-2222-2222-2222-222222222222'
      and status='booked' and uses_credit)
  then 'PASS  the booking exists and spends a session, with no pack anywhere'
  else 'FAIL  the booking is missing or does not spend a session' end;

select case when (select count(*) from public.notifications
                  where user_id='22222222-2222-2222-2222-222222222222' and kind='session_confirmed') = 1
  then 'PASS  the athlete was told, with a kind the table accepts'
  else 'FAIL  the athlete was not told' end;

-- Double tap on a slow connection. Wrapped, because without the early
-- return the second call RAISES ("that session is full") rather than
-- returning a different id - and a bare statement that errors just prints
-- and scrolls past.
create or replace function pg_temp.double_tap() returns text language plpgsql as $$
declare a uuid; b uuid;
begin
  select id into a from public.bookings
    where slot_id='bbbbbbbb-0000-0000-0000-000000000001' and athlete_id='22222222-2222-2222-2222-222222222222';
  b := public.book_athlete_into_slot('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222');
  if a = b then return 'PASS  booking the same person twice returns the same booking';
  else return 'FAIL  a double tap made a second booking'; end if;
exception when others then
  return 'FAIL  a double tap raised instead of returning the same booking -> ' || sqlerrm;
end $$;
select pg_temp.double_tap();

select case when (select count(*) from public.notifications where user_id='22222222-2222-2222-2222-222222222222') = 1
  then 'PASS  a double tap did not tell them twice'
  else 'FAIL  a double tap sent a second notification' end;

select pg_temp.expect_fail(
  $q$ select public.book_athlete_into_slot('bbbbbbbb-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333') $q$,
  'a full 1-on-1 cannot take a second person');

select pg_temp.expect_fail(
  $q$ select public.book_athlete_into_slot('bbbbbbbb-0000-0000-0000-000000000006','55555555-5555-5555-5555-555555555555') $q$,
  'another coach''s athlete cannot be booked into an EMPTY time');

select pg_temp.expect_fail(
  $q$ select public.book_athlete_into_slot('bbbbbbbb-0000-0000-0000-000000000005','22222222-2222-2222-2222-222222222222') $q$,
  'a cancelled time cannot be filled');

select pg_temp.expect_fail(
  $q$ select public.book_athlete_into_slot('bbbbbbbb-0000-0000-0000-000000000004','22222222-2222-2222-2222-222222222222') $q$,
  'a live in-app session with capacity 2 is refused as misconfigured');

-- Past times ARE allowed: writing down a session that already happened is
-- most of what this is for.
select pg_temp.expect_ok(
  $q$ select public.book_athlete_into_slot('bbbbbbbb-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333') $q$,
  'a session that already happened can be written down');

-- Semi-private really does take two.
select pg_temp.expect_ok(
  $q$ select public.book_athlete_into_slot('bbbbbbbb-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222') $q$,
  'a semi-private takes its first person');
select pg_temp.expect_ok(
  $q$ select public.book_athlete_into_slot('bbbbbbbb-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333333') $q$,
  'a semi-private takes its second person');
select pg_temp.expect_fail(
  $q$ select public.book_athlete_into_slot('bbbbbbbb-0000-0000-0000-000000000002','66666666-6666-6666-6666-666666666666') $q$,
  'a semi-private refuses a third person who IS on the roster');

-- Somebody else's time.
update auth.state set uid = '44444444-4444-4444-4444-444444444444';
select pg_temp.expect_fail(
  $q$ select public.book_athlete_into_slot('bbbbbbbb-0000-0000-0000-000000000006','55555555-5555-5555-5555-555555555555') $q$,
  'another coach cannot fill this coach''s EMPTY time with their own athlete');

-- The athlete themselves.
update auth.state set uid = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_fail(
  $q$ select public.book_athlete_into_slot('bbbbbbbb-0000-0000-0000-000000000006','22222222-2222-2222-2222-222222222222') $q$,
  'an athlete cannot use the coach''s function to book themselves into an empty time');

select '--- mark_no_show ---';
update auth.state set uid = '11111111-1111-1111-1111-111111111111';

select case when public.mark_no_show(
    (select id from public.bookings where slot_id='bbbbbbbb-0000-0000-0000-000000000003'), true) = 'no_show'
  then 'PASS  a past session can be marked as a no-show'
  else 'FAIL  marking a no-show did not settle on no_show' end;

select case when (select count(*) from public.notifications
                  where user_id='33333333-3333-3333-3333-333333333333' and kind='session_confirmed'
                    and data->>'kind' = 'no_show') = 1
  then 'PASS  the athlete was told about the no-show'
  else 'FAIL  the athlete was not told about the no-show' end;

select case when public.mark_no_show(
    (select id from public.bookings where slot_id='bbbbbbbb-0000-0000-0000-000000000003'), false) = 'attended'
  then 'PASS  undoing a no-show settles on attended, not back on the list'
  else 'FAIL  undoing a no-show did not settle on attended' end;

select case when (select count(*) from public.notifications
                  where user_id='33333333-3333-3333-3333-333333333333'
                    and data->>'kind' = 'no_show') = 1
  then 'PASS  undoing it did not send a second notification'
  else 'FAIL  being marked present sent a notification' end;

select pg_temp.expect_fail(
  $q$ select public.mark_no_show((select id from public.bookings where slot_id='bbbbbbbb-0000-0000-0000-000000000001'), true) $q$,
  'a session that has not happened cannot be a no-show');

-- A booking on a session that has ALREADY HAPPENED, then cancelled. Aimed
-- at a future session this was refused for being in the future, so the
-- cancelled-session guard was never reached and the check passed having
-- tested nothing.
select public.book_athlete_into_slot('bbbbbbbb-0000-0000-0000-000000000007','22222222-2222-2222-2222-222222222222');
update public.bookings set status='cancelled'
  where slot_id='bbbbbbbb-0000-0000-0000-000000000007' and athlete_id='22222222-2222-2222-2222-222222222222';
select pg_temp.expect_fail(
  $q$ select public.mark_no_show((select id from public.bookings where slot_id='bbbbbbbb-0000-0000-0000-000000000007' and athlete_id='22222222-2222-2222-2222-222222222222'), true) $q$,
  'a session that happened but was cancelled cannot also be a no-show');

update auth.state set uid = '33333333-3333-3333-3333-333333333333';
select pg_temp.expect_fail(
  $q$ select public.mark_no_show((select id from public.bookings where slot_id='bbbbbbbb-0000-0000-0000-000000000003'), false) $q$,
  'an athlete cannot mark themselves present');

update auth.state set uid = '11111111-1111-1111-1111-111111111111';
select pg_temp.expect_fail(
  $q$ select public.mark_no_show('99999999-9999-9999-9999-999999999999', true) $q$,
  'a booking that does not exist is refused rather than silently ignored');

select '--- grants ---';
select case when has_function_privilege('authenticated', 'public.book_athlete_into_slot(uuid,uuid)', 'execute')
        and has_function_privilege('authenticated', 'public.mark_no_show(uuid,boolean)', 'execute')
  then 'PASS  a signed-in user can call both'
  else 'FAIL  a signed-in user cannot call them, so nothing works at all' end;
select case when not has_function_privilege('anon', 'public.book_athlete_into_slot(uuid,uuid)', 'execute')
        and not has_function_privilege('anon', 'public.mark_no_show(uuid,boolean)', 'execute')
  then 'PASS  an anonymous caller cannot'
  else 'FAIL  an anonymous caller can book sessions and mark no-shows' end;
