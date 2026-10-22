-- ============================================================
-- APPLY THIS AT MERGE TIME. ONE FILE, TOP TO BOTTOM.
-- ============================================================
--
-- This is migrations 004, 005 and 006 joined together, in the order
-- they must run. Paste the whole thing into the Supabase SQL Editor
-- and press Run once.
--
-- It is safe to run twice: every statement either replaces what is
-- there or checks first.
--
-- WHAT IT DOES
--
--   004  Stops every signed-in athlete being able to read every
--        profile on the database. Adds coach_card() so an athlete
--        can still see their coach's name and branding.
--
--   005  Lets the coach book an athlete into a time, and lets them
--        record a no-show.
--
--   006  Fixes a bug that is live right now: a coach cannot open
--        any athlete's form check or progress photo. Also adds
--        photos and clips to the message thread.
--
-- All three have been applied to a throwaway copy of this schema
-- and exercised there - 72 checks - so none of them is meeting
-- Postgres for the first time here.
--
-- The app code that matches all of this is on the redesign-branding
-- branch. Deploy that, then run this. The app carries fallbacks, so
-- the order between the two is not critical.
-- ============================================================

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

-- Dropped first so the whole file can be run twice without failing
-- halfway. `create policy` has no `or replace`, so without these a second
-- run dies on "policy already exists" - after some of the file has
-- applied and some has not, which is the worst place to stop.
drop policy if exists "Own profile is readable" on public.profiles;
create policy "Own profile is readable"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Coach can view their athletes" on public.profiles;
create policy "Coach can view their athletes"
  on public.profiles for select
  using (coach_id = auth.uid());
-- 005: the coach putting someone in a session, and saying they did not turn up.
--
-- NOT YET APPLIED. Additive only - two new functions and nothing touched -
-- but it ships with the code that calls it, after 004, so apply them in
-- order at merge time.
--
-- WHAT WAS MISSING
--
-- Everything else in the booking system already exists and works: opening
-- times, repeating times, an athlete booking and cancelling, the notice
-- window and late cancellations, change requests and the coach's decision,
-- the coach moving a booking, closing a time and refunding everyone in it.
-- Two things did not:
--
--   1. The coach booking somebody in. In a real gym most sessions are
--      arranged in person or over a text, and the coach then has to ask the
--      client to go and tap it into an app. Everyone forgets, and the
--      schedule drifts away from the truth until it is worth nothing.
--
--   2. No-show. The status already exists on the table and is already
--      counted as spending a session; nothing could ever set it. So a
--      client who did not turn up looked identical to one who did, and the
--      one case where a coach most needs the record to be straight was the
--      one case the app could not record.
--
-- A NOTE ON THE POLICY THAT WAS SUPPOSED TO BE MISSING
--
-- The project notes said session_change_requests needed INSERT and UPDATE
-- policies before this phase could be built. It does not. Every write in
-- this subsystem goes through a security definer function, which is not
-- subject to row level security at all - the SELECT policy is there so the
-- CLIENT can read requests back, and that is the only thing the client does
-- directly. Checked against the live database on 16 Oct: all eleven booking
-- functions are `security definer` with `search_path = public`. These two
-- are written the same way, for the same reason.

-- ---------------------------------------------------------------------------
-- The coach booking an athlete in.
--
-- Deliberately NOT the same rules as book_slot:
--
--   * The caller must own the slot, and the athlete must be on their roster.
--     book_slot checks that the CALLER is on the coach's roster; here the
--     caller is the coach and the athlete is somebody else.
--
--   * No credit check. book_slot refuses an athlete with nothing left,
--     because the alternative is letting somebody quietly run up a debt they
--     did not agree to. A coach doing it is the opposite: a decision, made
--     by the person who is owed, usually with "pay me next week" already
--     said out loud. Refusing would just send them to do it on paper. The
--     booking still spends a session, so the balance goes negative and the
--     Packs screen shows it in red, which is the honest record.
--
--   * The athlete is told. They did not do this, so they have to find out
--     some way other than turning up.
create or replace function public.book_athlete_into_slot(p_slot_id uuid, p_athlete_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot     public.availability_slots;
  v_type     public.session_types;
  v_capacity integer;
  v_taken    integer;
  v_existing public.bookings;
  v_id       uuid;
begin
  -- `for update` for the same reason book_slot does it: capacity is counted
  -- and then acted on, and two coaches on two devices (or a coach and an
  -- athlete) would otherwise both read "one space left".
  select * into v_slot from public.availability_slots where id = p_slot_id for update;

  if v_slot.id is null then
    raise exception 'That time no longer exists.' using errcode = 'P0002';
  end if;
  if v_slot.coach_id <> auth.uid() then
    raise exception 'That is not your time to fill.' using errcode = 'P0001';
  end if;
  if v_slot.cancelled_at is not null then
    raise exception 'You cancelled that time.' using errcode = 'P0001';
  end if;

  -- Past times are allowed, unlike book_slot. Writing down a session that
  -- already happened is most of what this function is for: the coach is
  -- catching the app up with a gym, not planning ahead.
  if not exists (
    select 1 from public.profiles where id = p_athlete_id and coach_id = auth.uid()
  ) then
    raise exception 'They are not on your roster.' using errcode = 'P0001';
  end if;

  select * into v_type from public.session_types where id = v_slot.session_type_id;

  if v_type.delivery = 'in_app_live' and coalesce(v_slot.capacity_override, v_type.capacity) > 1 then
    raise exception 'That session is misconfigured - a live in-app session cannot hold more than one person.'
      using errcode = 'P0001';
  end if;

  select * into v_existing from public.bookings
  where slot_id = p_slot_id and athlete_id = p_athlete_id;

  -- Already in it. Returning the existing booking rather than raising means
  -- a double tap on a slow connection is harmless.
  if v_existing.id is not null and v_existing.status in ('booked', 'attended') then
    return v_existing.id;
  end if;

  v_capacity := coalesce(v_slot.capacity_override, v_type.capacity, 1);
  select count(*) into v_taken
  from public.bookings where slot_id = p_slot_id and status in ('booked', 'attended');
  if v_taken >= v_capacity then
    raise exception 'That session is full.' using errcode = 'P0001';
  end if;

  -- A late cancellation being re-booked by the COACH is the coach deciding
  -- to let it go, which is the same judgement forgive_late_cancellation
  -- exists for. book_slot refuses this; here it is the point.
  if v_existing.id is not null then
    update public.bookings
    set status = 'booked', cancelled_at = null, uses_credit = true
    where id = v_existing.id
    returning id into v_id;
  else
    insert into public.bookings (slot_id, athlete_id, coach_id, status, uses_credit)
    values (p_slot_id, p_athlete_id, auth.uid(), 'booked', true)
    returning id into v_id;
  end if;

  insert into public.notifications (user_id, actor_id, kind, title, body, data)
  select
    p_athlete_id, auth.uid(), 'session_confirmed',
    coalesce(p.name, 'Your coach') || ' booked you in',
    coalesce(v_type.name, 'Session'),
    jsonb_build_object(
      'kind', 'coach_booked', 'bookingId', v_id, 'slotId', p_slot_id,
      'startsAt', v_slot.starts_at, 'sessionType', v_type.name
    )
  from public.profiles p where p.id = auth.uid();

  return v_id;
end;
$$;

revoke all on function public.book_athlete_into_slot(uuid, uuid) from public, anon;
grant execute on function public.book_athlete_into_slot(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Did they turn up.
--
-- Takes a boolean rather than being a one-way "mark no-show", because this
-- is one tap next to somebody's name on a list and the cost of a mistap is
-- a session the athlete paid for and a line on their record saying they did
-- not show. Anything that expensive has to be undoable in the same place it
-- was done.
--
-- Returns the status it settled on, so the screen reports what actually
-- happened rather than what it asked for.
create or replace function public.mark_no_show(p_booking_id uuid, p_no_show boolean default true)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_starts  timestamptz;
  v_status  text;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'That booking no longer exists.' using errcode = 'P0002';
  end if;

  -- The coach's call alone. An athlete marking themselves present, or
  -- un-marking a no-show, is the whole thing being worthless.
  if v_booking.coach_id <> auth.uid() then
    raise exception 'Only the coach can record who turned up.' using errcode = 'P0001';
  end if;

  if v_booking.status in ('cancelled', 'late_cancelled') then
    raise exception 'That session was cancelled, so nobody was expected.' using errcode = 'P0001';
  end if;

  select starts_at into v_starts from public.availability_slots where id = v_booking.slot_id;
  if v_starts is not null and v_starts > now() then
    raise exception 'That session has not happened yet.' using errcode = 'P0001';
  end if;

  -- Undoing a no-show settles on 'attended', not back to 'booked'. The
  -- session is in the past either way, and 'booked' would put it back on the
  -- list of sessions still waiting to be marked.
  v_status := case when p_no_show then 'no_show' else 'attended' end;

  update public.bookings set status = v_status where id = p_booking_id;

  -- Told, and only when marked. A no-show costs the athlete a session, and
  -- finding that out from a balance that is one lower than they expected is
  -- how a coach loses a client over a misunderstanding.
  if p_no_show then
    insert into public.notifications (user_id, actor_id, kind, title, body, data)
    select
      v_booking.athlete_id, auth.uid(), 'session_confirmed',
      'Marked as a no-show',
      'That session has been used. Speak to ' || coalesce(p.name, 'your coach') || ' if that is wrong.',
      jsonb_build_object('kind', 'no_show', 'bookingId', p_booking_id, 'startsAt', v_starts)
    from public.profiles p where p.id = auth.uid();
  end if;

  return v_status;
end;
$$;

revoke all on function public.mark_no_show(uuid, boolean) from public, anon;
grant execute on function public.mark_no_show(uuid, boolean) to authenticated;
-- 006: photos and clips in the message thread, and a policy that never
-- worked.
--
-- NOT YET APPLIED. Apply after 005.
--
-- ===========================================================================
-- PART 1: A LIVE BUG. READ THIS ONE EVEN IF THE REST IS SKIPPED.
-- ===========================================================================
--
-- `form_check_files_read` and `progress_photo_read` both read, in the branch
-- that is supposed to let a coach see their athlete's file:
--
--     exists (
--       select 1 from profiles p
--       where p.id::text = (storage.foldername(p.name))[1]
--         and p.coach_id = auth.uid()
--     )
--
-- `p` is `profiles`, so `p.name` is the person's DISPLAY NAME - "Dana Ruiz" -
-- not the file's path. It should be `objects.name`. As written the branch
-- asks whether a profile's id matches the first path segment of its own
-- name, which is never true: checked against live on 16 Oct, 0 of 11
-- profiles satisfy it.
--
-- So the coach half of both policies has never worked. A coach could not
-- open a form check or a progress photo at all. Nobody has hit it yet only
-- because no files have been uploaded to either bucket - which also means
-- fixing it now costs nothing and breaks nothing.
--
-- The subquery is also uncorrelated, which is the tell: nothing inside it
-- refers to the file being read, so it cannot possibly be deciding anything
-- about that file.

drop policy if exists "form_check_files_read" on storage.objects;
create policy "form_check_files_read"
  on storage.objects for select
  using (
    bucket_id = 'form-checks'
    and (
      -- Your own: the first path segment is the uploader's id, which is the
      -- convention uploadFormCheck writes to.
      (storage.foldername(name))[1] = auth.uid()::text
      -- Or your athlete's. `objects.name`, explicitly qualified, so this
      -- cannot quietly become `p.name` again.
      or exists (
        select 1 from public.profiles p
        where p.id::text = (storage.foldername(objects.name))[1]
          and p.coach_id = auth.uid()
      )
    )
  );

drop policy if exists "progress_photo_read" on storage.objects;
create policy "progress_photo_read"
  on storage.objects for select
  using (
    bucket_id = 'progress-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id::text = (storage.foldername(objects.name))[1]
          and p.coach_id = auth.uid()
      )
    )
  );

-- ===========================================================================
-- PART 2: MEDIA IN MESSAGES
-- ===========================================================================
--
-- A coach saying "your knee is caving in on the second rep" is worth less
-- than the same sentence with the clip attached, and a client asking "is
-- this bar position right" cannot ask it in words.
--
-- form_checks already does video, but it is a different thing: one clip,
-- one reply, a review queue. A conversation is not a queue, and making
-- every photo in a thread a form check would fill the review list with
-- things nobody is waiting on. This extends the THREAD, using the same
-- shape form_checks proved: a private bucket, a path whose first segment
-- says who the file belongs to, and a signed URL at read time.

-- The thread's athlete, not the uploader.
--
-- form-checks keys on the uploader because only the athlete ever uploads.
-- In a thread both people do, and keying on the uploader would mean the
-- policy had to answer "is the person who sent this in a thread with me",
-- which needs the message row. Keying on the THREAD makes it one
-- comparison: you are that athlete, or you are their coach.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-media', 'message-media', false, 104857600,
  array['image/jpeg','image/png','image/webp','image/heic',
        'video/mp4','video/quicktime','video/webm','video/x-m4v']
)
on conflict (id) do nothing;

create or replace function public.in_thread_with(p_athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_athlete = auth.uid()
      or exists (select 1 from public.profiles p where p.id = p_athlete and p.coach_id = auth.uid());
$$;

revoke all on function public.in_thread_with(uuid) from public, anon;
grant execute on function public.in_thread_with(uuid) to authenticated;

drop policy if exists "message_media_read" on storage.objects;
create policy "message_media_read"
  on storage.objects for select
  using (
    bucket_id = 'message-media'
    and public.in_thread_with(((storage.foldername(objects.name))[1])::uuid)
  );

drop policy if exists "message_media_insert" on storage.objects;
create policy "message_media_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'message-media'
    and public.in_thread_with(((storage.foldername(objects.name))[1])::uuid)
  );

-- Deleting the file is how "delete for everyone" stops being a lie about a
-- photo. Both people in the thread can, for the same reason the message
-- tombstone already lets either of them act on the row.
drop policy if exists "message_media_delete" on storage.objects;
create policy "message_media_delete"
  on storage.objects for delete
  using (
    bucket_id = 'message-media'
    and public.in_thread_with(((storage.foldername(objects.name))[1])::uuid)
  );

-- The columns.
--
-- media_kind, not the raw mime type: the thread renders an <img> or a
-- <video> and nothing else cares, so storing the mime type would mean every
-- renderer re-deciding which it is, differently.
alter table public.messages add column if not exists media_path text;
alter table public.messages add column if not exists media_kind text
  check (media_kind is null or media_kind in ('image', 'video'));

-- Neither or both. A path with no kind is unrenderable and a kind with no
-- path is a broken frame in the thread.
alter table public.messages drop constraint if exists messages_media_complete;
alter table public.messages add constraint messages_media_complete
  check ((media_path is null) = (media_kind is null));

-- THE TRAP. `authenticated` holds COLUMN-LEVEL grants on this table:
-- INSERT on the original nine columns and UPDATE on four. A new column is
-- not covered by either, so without this line every attempt to send a photo
-- fails - and it fails as a permission error on a column the sender can see
-- on screen, which reads like a bug in the app rather than a missing grant.
grant insert (media_path, media_kind) on public.messages to authenticated;

-- Deliberately NOT granted UPDATE. Media cannot be swapped under a message
-- after it is sent, for the same reason the body cannot be edited.
--
-- The tombstone path still works: deleted_at already has its UPDATE grant,
-- and the client removes the file from storage separately.
