-- 019: launch lockdown, part 2 of 2. Apply only AFTER the app that calls
-- join_coach_by_code (018) is live, or joining a coach from an older copy of
-- the app stops working.
--
-- Before this, a signed-in user could write any coach_id or role onto their
-- own profile from the browser: put themselves on any coach's roster without
-- a code, or turn themselves into a coach. This blocks those writes when they
-- come straight from the app. Functions that run as the owner (join_coach_by_code,
-- redeem_coach_invite, remove_athlete_from_roster) still make these changes.
--
-- Allowed from the app:
--   - leaving a coach (coach_id to null, role athlete_coached to athlete)
--   - role athlete <-> athlete_coached
-- Blocked from the app:
--   - coach_id set to any coach
--   - role changed to or from coach
--   - invite_code changed
-- Nothing is changed or dropped. Existing rows are untouched.

begin;

create or replace function public.profiles_guard_links()
returns trigger
language plpgsql
-- Runs as the CALLER on purpose: current_user is how it tells a direct
-- write from the app (authenticated) apart from one made inside a function
-- that runs as the owner. As security definer it would always see the owner.
security invoker
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.coach_id is distinct from old.coach_id and new.coach_id is not null then
    raise exception 'profiles: join a coach with their invite code';
  end if;

  if new.role is distinct from old.role then
    if old.role = 'coach' or new.role = 'coach'
       or new.role not in ('athlete', 'athlete_coached') then
      raise exception 'profiles: this account type cannot be changed here';
    end if;
  end if;

  if new.invite_code is distinct from old.invite_code then
    raise exception 'profiles: invite codes are assigned, not chosen';
  end if;

  return new;
end;
$$;
revoke execute on function public.profiles_guard_links() from public, anon, authenticated;

drop trigger if exists profiles_guard_links on public.profiles;
create trigger profiles_guard_links
  before update on public.profiles
  for each row execute function public.profiles_guard_links();

commit;
