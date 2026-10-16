-- 004: stop every signed-in athlete being able to read every profile.
--
-- NOT YET APPLIED. Unlike 002 and 003, which only added things, this one
-- changes who can read what on a live table. Applying it while the deployed
-- code still expects the old permissions would break the coach's name and
-- branding on every athlete's screen. It goes in at merge time, with the
-- code that matches it, and not before.
--
-- THE PROBLEM
--
-- The policy being replaced reads, in full:
--
--     using (auth.role() = 'authenticated')
--
-- Any signed-in athlete could read every row of public.profiles through the
-- API, using the anon key that ships in the browser. Nothing in the app did
-- that; nothing stopped it either. Across the 11 profiles on 15 Oct that was
-- 10 email addresses, 6 birthdays, 2 sets of injury notes, plus everyone's
-- name, sex, weight, height, goals and injuries, and the coach invite code.
--
-- THE SHAPE OF THE FIX
--
-- Three questions the app legitimately asks of this table:
--
--   1. my own row            -> auth.uid() = id
--   2. my athletes' rows     -> coach_id = auth.uid()        (coach side)
--   3. my coach's row        -> NOT a policy. See below.
--
-- (2) compares a column of the row being read against the caller, so it does
-- not read profiles again and cannot recurse into itself.
--
-- (3) is the awkward one, and the reason this migration has a function in it.
-- Row level security is ROW level: it cannot hide a column. The athlete's
-- screen needs the coach's name, photo and branding, and two settings that
-- live inside the coach's intake blob - and that blob also holds the coach's
-- own email and birthday. A policy that lets an athlete read their coach's
-- row hands over all of it. So the row stays unreadable, and coach_card()
-- below returns exactly the eight fields the screen uses, to exactly the
-- athletes on that coach's roster.
--
-- Signup is unaffected: resolveCoachInvite already goes through the
-- coach_by_invite_code RPC, which is security definer and returns the same
-- narrow set. It has to, because it runs before the athlete is linked to
-- anyone - and, when email confirmation is on, before they have a session at
-- all.

create or replace function public.coach_card(p_id uuid)
returns table (
  id uuid,
  name text,
  avatar text,
  photo_url text,
  business_name text,
  brand_color text,
  logo_path text,
  accountability_enabled boolean,
  cancellation_hours int
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.avatar, p.photo_url,
         p.business_name, p.brand_color, p.logo_path,
         -- Defaults match the app's own: accountability on, and
         -- DEFAULT_CANCELLATION_HOURS, which is 24.
         coalesce((p.intake->>'accountabilityEnabled')::boolean, true),
         coalesce((p.intake->>'cancellationHours')::int, 24)
  from public.profiles p
  where p.id = p_id
    -- Only your own coach. Asking for somebody else's returns no rows
    -- rather than an error, which is the right amount to tell a caller who
    -- should not have asked.
    and exists (
      select 1 from public.profiles me
      where me.id = auth.uid() and me.coach_id = p.id
    );
$$;

revoke all on function public.coach_card(uuid) from public, anon;
grant execute on function public.coach_card(uuid) to authenticated;

drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;

create policy "Own profile is readable"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Coach can view their athletes"
  on public.profiles for select
  using (coach_id = auth.uid());
