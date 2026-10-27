-- 009: a 7 AM notice on session days, to the coach and to each client.
--
-- Isaiah, 26 Oct 2026: a coach should be told, on the morning of the day,
-- which clients they are seeing. It lands in the bell like any other
-- notification, and the notifications_push trigger from 007 sends it to the
-- coach's phone. Nothing new is needed on the phone side.
--
-- Clients too (Isaiah, 26 Oct): one notification per booked session today,
--   title "Session today at 5:30 PM"
--   body  "Strength 1:1 with Isaiah, Virtual"
-- kind 'session_today', once per booking.
--
-- What this adds (no existing table, column or row is changed):
--   1. The pg_cron extension, so the database can run a job on a clock.
--   2. public.notify_coaches_sessions_today(): one bell notification per coach
--      who has at least one booked client today, e.g.
--        title "3 sessions today"
--        body  "9:00 AM Josiah, 12:30 PM Lia, 5:30 PM Zay"
--      It only acts at 7 AM Toronto time and only once per coach per day, so
--      the hourly job below can run safely through daylight saving changes.
--   3. An hourly job that calls it.
--
-- Time zone: Toronto for every coach for now. If a coach elsewhere joins, this
-- is the one place to change.
--
-- Approved by Isaiah on 26 Oct 2026.

create extension if not exists pg_cron;

create or replace function public.notify_coaches_sessions_today()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  tz constant text := 'America/Toronto';
  local_now timestamp := now() at time zone tz;
  today date := (now() at time zone tz)::date;
  sent integer := 0;
  r record;
begin
  if extract(hour from local_now) <> 7 then
    return 0;
  end if;

  for r in
    select s.coach_id,
           count(*) as n,
           string_agg(
             trim(to_char(s.starts_at at time zone tz, 'FMHH12:MI AM')) || ' ' ||
               coalesce(nullif(split_part(p.name, ' ', 1), ''), 'Client'),
             ', ' order by s.starts_at, p.name
           ) as list
      from public.bookings b
      join public.availability_slots s on s.id = b.slot_id
      left join public.profiles p on p.id = b.athlete_id
     where b.status in ('booked', 'attended')
       and b.cancelled_at is null
       and s.cancelled_at is null
       and (s.starts_at at time zone tz)::date = today
     group by s.coach_id
  loop
    -- Once per coach per day, whatever the job does.
    if exists (
      select 1 from public.notifications
       where user_id = r.coach_id
         and kind = 'sessions_today'
         and data->>'date' = today::text
    ) then
      continue;
    end if;

    insert into public.notifications (user_id, kind, title, body, data)
    values (
      r.coach_id,
      'sessions_today',
      r.n || case when r.n = 1 then ' session today' else ' sessions today' end,
      r.list,
      jsonb_build_object('date', today::text, 'count', r.n)
    );
    sent := sent + 1;
  end loop;

  -- Each client, once per booked session today.
  for r in
    select b.id as booking_id, b.athlete_id, s.coach_id, s.starts_at,
           coalesce(t.name, 'Session') as type_name,
           case when t.delivery in ('virtual', 'in_app_live') then 'Virtual'
                when t.delivery = 'remote' then 'Remote'
                else 'In person' end as delivery_label,
           nullif(split_part(c.name, ' ', 1), '') as coach_first
      from public.bookings b
      join public.availability_slots s on s.id = b.slot_id
      left join public.session_types t on t.id = s.session_type_id
      left join public.profiles c on c.id = s.coach_id
     where b.status in ('booked', 'attended')
       and b.cancelled_at is null
       and s.cancelled_at is null
       and (s.starts_at at time zone tz)::date = today
  loop
    if exists (
      select 1 from public.notifications
       where user_id = r.athlete_id
         and kind = 'session_today'
         and data->>'bookingId' = r.booking_id::text
    ) then
      continue;
    end if;

    insert into public.notifications (user_id, actor_id, kind, title, body, data)
    values (
      r.athlete_id,
      r.coach_id,
      'session_today',
      'Session today at ' || trim(to_char(r.starts_at at time zone tz, 'FMHH12:MI AM')),
      r.type_name || coalesce(' with ' || r.coach_first, '') || ', ' || r.delivery_label,
      jsonb_build_object('date', today::text, 'bookingId', r.booking_id, 'startsAt', r.starts_at)
    );
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke all on function public.notify_coaches_sessions_today() from public, anon, authenticated;

-- Hourly, on the hour. The function itself only acts in the 7 AM Toronto hour.
select cron.unschedule('coach-sessions-today')
 where exists (select 1 from cron.job where jobname = 'coach-sessions-today');
select cron.schedule('coach-sessions-today', '0 * * * *', $$select public.notify_coaches_sessions_today()$$);
