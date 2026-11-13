-- 018: launch lockdown, part 1 of 2. Safe to apply BEFORE the app update.
--
-- Nothing here changes or drops a column or any data. It:
--   1. stops signed-out visitors (anon) running 22 functions they never need,
--   2. fixes "delete for everyone" on messages, which could never succeed,
--   3. stops a program being pointed at a coach or athlete the caller has no
--      link to,
--   4. adds join_coach_by_code, the one way to join a coach from now on.
--      Part 2 (019) blocks the old direct write, and goes on only after the
--      app that calls this function is live.

begin;

-- 1. anon off the functions that need a signed-in user -----------------------
-- coach_by_invite_code, invite_by_token and email_has_account stay open:
-- signup calls them before an account exists.
-- Trigger functions are revoked from everyone: triggers do not need EXECUTE.

revoke execute on function public.archive_session_type(uuid) from public, anon;
revoke execute on function public.assign_program_to_athlete(uuid, uuid) from public, anon;
revoke execute on function public.book_slot(uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
revoke execute on function public.cancel_slot(uuid) from public, anon;
revoke execute on function public.coach_cancellation_hours(uuid) from public, anon;
revoke execute on function public.credits_remaining(uuid, uuid, uuid) from public, anon;
revoke execute on function public.decide_session_change(uuid, boolean, uuid, text) from public, anon;
revoke execute on function public.forgive_late_cancellation(uuid) from public, anon;
revoke execute on function public.is_my_coach(uuid) from public, anon;
revoke execute on function public.move_booking(uuid, uuid) from public, anon;
revoke execute on function public.notify_coach_session_complete(text, date, integer, integer, integer) from public, anon;
revoke execute on function public.open_repeating_times(uuid, integer[], text[], integer, date) from public, anon;
revoke execute on function public.remove_athlete_from_roster(uuid) from public, anon;
revoke execute on function public.request_session_change(uuid, text, uuid, text) from public, anon;
revoke execute on function public.set_athlete_group(uuid, uuid) from public, anon;
revoke execute on function public.set_profile_setting(text, jsonb) from public, anon;
revoke execute on function public.slot_openings() from public, anon;
revoke execute on function public.slot_participants(uuid) from public, anon;
revoke execute on function public.withdraw_session_change(uuid) from public, anon;

grant execute on function public.archive_session_type(uuid) to authenticated;
grant execute on function public.assign_program_to_athlete(uuid, uuid) to authenticated;
grant execute on function public.book_slot(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.cancel_slot(uuid) to authenticated;
grant execute on function public.coach_cancellation_hours(uuid) to authenticated;
grant execute on function public.credits_remaining(uuid, uuid, uuid) to authenticated;
grant execute on function public.decide_session_change(uuid, boolean, uuid, text) to authenticated;
grant execute on function public.forgive_late_cancellation(uuid) to authenticated;
grant execute on function public.is_my_coach(uuid) to authenticated;
grant execute on function public.move_booking(uuid, uuid) to authenticated;
grant execute on function public.notify_coach_session_complete(text, date, integer, integer, integer) to authenticated;
grant execute on function public.open_repeating_times(uuid, integer[], text[], integer, date) to authenticated;
grant execute on function public.remove_athlete_from_roster(uuid) to authenticated;
grant execute on function public.request_session_change(uuid, text, uuid, text) to authenticated;
grant execute on function public.set_athlete_group(uuid, uuid) to authenticated;
grant execute on function public.set_profile_setting(text, jsonb) to authenticated;
grant execute on function public.slot_openings() to authenticated;
grant execute on function public.slot_participants(uuid) to authenticated;
grant execute on function public.withdraw_session_change(uuid) to authenticated;

revoke execute on function public.assign_coach_invite_code() from public, anon, authenticated;
revoke execute on function public.enforce_slot_capacity() from public, anon, authenticated;

-- 2. "Delete for everyone" ----------------------------------------------------
-- messages_guard_update copies the message into deleted_messages before
-- blanking it. It ran as the signed-in user, who has no INSERT on that table
-- (on purpose: nobody should read or write it from the app), so every delete
-- failed. Running it as the owner lets the copy happen while the table stays
-- closed to clients. The checks inside it are unchanged and still use
-- auth.uid(), which is the caller either way.
alter function public.messages_guard_update() security definer;
alter function public.messages_guard_update() set search_path = public;
revoke execute on function public.messages_guard_update() from public, anon, authenticated;

comment on table public.deleted_messages is
  'Server-only archive of messages deleted for everyone. Written by messages_guard_update. RLS on with no policy on purpose: no client reads or writes it.';

-- 3. programs: only link to people you are linked to --------------------------
-- The existing policies check that the caller is the athlete OR the coach on
-- the row, but not that the OTHER id is someone they are linked to. Checked
-- here on insert and whenever either id changes, so editing an old program
-- after leaving a coach still works. Functions running as the owner
-- (assign_program_to_athlete) are not affected.
create or replace function public.programs_guard_links()
returns trigger
language plpgsql
-- Runs as the CALLER on purpose: current_user is how it tells a direct
-- write from the app (authenticated) apart from one made inside a function
-- that runs as the owner. As security definer it would always see the owner.
security invoker
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_coach uuid;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' or new.coach_id is distinct from old.coach_id then
    if new.coach_id is not null and new.coach_id <> me then
      select coach_id into my_coach from profiles where id = me;
      if my_coach is distinct from new.coach_id then
        raise exception 'programs: you can only link a program to your own coach';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' or new.athlete_id is distinct from old.athlete_id then
    if new.athlete_id is not null and new.athlete_id <> me then
      if not exists (select 1 from profiles where id = new.athlete_id and coach_id = me) then
        raise exception 'programs: you can only give a program to an athlete on your roster';
      end if;
    end if;
  end if;

  return new;
end;
$$;
revoke execute on function public.programs_guard_links() from public, anon, authenticated;

drop trigger if exists programs_guard_links on public.programs;
create trigger programs_guard_links
  before insert or update of coach_id, athlete_id on public.programs
  for each row execute function public.programs_guard_links();

-- 4. Joining a coach -----------------------------------------------------------
-- Takes the coach's 6-character invite code, so knowing a coach's id is not
-- enough to land on their roster. Returns the coach id, or null when the code
-- matches no coach.
create or replace function public.join_coach_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_coach uuid;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  select id into v_coach
    from profiles
   where role = 'coach'
     and invite_code = upper(btrim(p_code))
     and length(btrim(p_code)) = 6
   limit 1;

  if v_coach is null or v_coach = me then
    return null;
  end if;

  update profiles
     set coach_id = v_coach,
         role = 'athlete_coached'
   where id = me
     and role in ('athlete', 'athlete_coached');

  if not found then
    return null;
  end if;
  return v_coach;
end;
$$;
revoke execute on function public.join_coach_by_code(text) from public, anon;
grant execute on function public.join_coach_by_code(text) to authenticated;

commit;
