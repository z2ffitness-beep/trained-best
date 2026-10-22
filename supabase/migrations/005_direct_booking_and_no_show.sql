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
