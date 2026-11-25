-- 022: reminders and message alerts (Isaiah, 25 Nov).
--
-- "Good quality reminders, just like any other app. Nothing overbearing."
-- Every row added to notifications already goes to the person's phones
-- (notifications_push_hook -> send-push). This adds three new kinds of row:
--   message          a new message in the Coach tab, to the other person
--   session_reminder 7 am on a training day: "Today: Day 2, Lower Power"
--   session_missed   6 pm the day after a session that didn't happen, once
-- Rules: at most one reminder a day per person, none outside 7 am to 9 pm in
-- their own time zone, and each kind can be switched off in Profile
-- (profiles.intake.notify.reminders / .messages = false).
--
-- Nothing existing is changed or dropped: the kind check gets three more
-- allowed values, and the rest is a new trigger, two new functions and one
-- new scheduled job.

-- 1. Three more kinds ------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'session_completed', 'session_due', 'coach_message', 'program_changed', 'session_confirmed',
  'sessions_today', 'session_today', 'session_note',
  'message', 'session_reminder', 'session_missed'
]));

-- 2. Messages ------------------------------------------------------------------
-- A message on an athlete's thread goes to the athlete when the coach sent it,
-- and to the athlete's coach when the athlete sent it.
create or replace function public.messages_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_to     uuid;
  v_from   text;
  v_body   text;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if new.sender_id = new.athlete_id then
    select coach_id into v_to from profiles where id = new.athlete_id;
  else
    v_to := new.athlete_id;
  end if;
  if v_to is null or v_to = new.sender_id then
    return new;
  end if;
  -- Switched off in Profile.
  if exists (select 1 from profiles where id = v_to and intake->'notify'->>'messages' = 'false') then
    return new;
  end if;
  -- A burst of messages is one alert, not five.
  if exists (
    select 1 from notifications
     where user_id = v_to and actor_id = new.sender_id and kind = 'message'
       and read_at is null and created_at > now() - interval '2 minutes'
  ) then
    return new;
  end if;

  select coalesce(nullif(split_part(name, ' ', 1), ''), 'New message') into v_from from profiles where id = new.sender_id;
  v_body := case
    when nullif(btrim(coalesce(new.body, '')), '') is not null then left(btrim(new.body), 140)
    when new.media_kind = 'video' then 'Sent a video'
    when new.media_path is not null then 'Sent a photo'
    else 'Sent a message' end;

  insert into notifications (user_id, actor_id, kind, title, body, data)
  values (v_to, new.sender_id, 'message', v_from, v_body,
          jsonb_build_object('athleteId', new.athlete_id, 'messageId', new.id));
  return new;
exception when others then
  -- An alert must never stop a message being sent.
  return new;
end;
$$;
revoke execute on function public.messages_notify() from public, anon, authenticated;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.messages_notify();

-- 3. Training reminders ------------------------------------------------------------
-- Is this program day on this date? Same rule as the app's isDayScheduledOn:
-- the weekday matches and no skip range covers it.
create or replace function public.program_day_on(p_day jsonb, p_date date)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_day->>'weekday', '') = trim(to_char(p_date, 'FMDay'))
     and not exists (
       select 1 from jsonb_array_elements(coalesce(p_day->'skipRanges', '[]'::jsonb)) r
        where r->>'start' is not null
          and p_date >= (r->>'start')::date
          and p_date <= coalesce((r->>'end')::date,
                                 (r->>'start')::date + (coalesce((r->>'weeks')::int, 1) * 7 - 1)));
$$;
revoke execute on function public.program_day_on(jsonb, date) from public, anon;

-- Runs every hour. Each person is looked at in their own time zone
-- (profiles.intake.timezone, set by the app; Toronto if it never has been).
create or replace function public.notify_athlete_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  d       jsonb;
  v_tz    text;
  v_now   timestamp;
  v_today date;
  v_hour  int;
  sent    integer := 0;
begin
  for r in
    select p.id, p.intake, g.days
      from profiles p
      join programs g on g.id = p.active_program_id
     where p.role in ('athlete', 'athlete_coached')
       and coalesce(p.intake->'notify'->>'reminders', 'true') <> 'false'
  loop
    v_tz := coalesce(nullif(r.intake->>'timezone', ''), 'America/Toronto');
    begin
      v_now := now() at time zone v_tz;
    exception when others then
      v_tz := 'America/Toronto';
      v_now := now() at time zone v_tz;
    end;
    v_today := v_now::date;
    v_hour := extract(hour from v_now);
    if v_hour not in (7, 18) then
      continue;
    end if;

    -- One reminder a day, whichever comes first.
    if exists (
      select 1 from notifications
       where user_id = r.id and kind in ('session_reminder', 'session_missed')
         and (created_at at time zone v_tz)::date = v_today
    ) then
      continue;
    end if;

    if v_hour = 7 then
      -- Today's session: on the program for today and not moved away, or
      -- pulled to today; and not already logged.
      select x.day into d
        from (
          select e as day from jsonb_array_elements(coalesce(r.days, '[]'::jsonb)) e
           where program_day_on(e, v_today)
             and not exists (select 1 from session_moves m
                              where m.user_id = r.id and m.program_day = e->>'name' and m.from_date = v_today)
          union all
          select e from jsonb_array_elements(coalesce(r.days, '[]'::jsonb)) e
           where exists (select 1 from session_moves m
                          where m.user_id = r.id and m.program_day = e->>'name' and m.to_date = v_today)
        ) x
       where not exists (select 1 from workout_logs l
                          where l.user_id = r.id and l.date = v_today and l.program_day = x.day->>'name')
       limit 1;
      if d is not null then
        insert into notifications (user_id, kind, title, body, data)
        values (r.id, 'session_reminder', 'Training today',
                'Today: ' || coalesce(d->>'name', 'your session'),
                jsonb_build_object('date', v_today::text, 'dayName', d->>'name'));
        sent := sent + 1;
      end if;
    else
      -- Yesterday's session that didn't happen, wasn't moved, and hasn't
      -- been done since.
      select e into d
        from jsonb_array_elements(coalesce(r.days, '[]'::jsonb)) e
       where program_day_on(e, v_today - 1)
         and not exists (select 1 from session_moves m
                          where m.user_id = r.id and m.program_day = e->>'name' and m.from_date = v_today - 1)
         and not exists (select 1 from workout_logs l
                          where l.user_id = r.id and l.program_day = e->>'name' and l.date between v_today - 1 and v_today)
       limit 1;
      if d is not null then
        insert into notifications (user_id, kind, title, body, data)
        values (r.id, 'session_missed', 'Yesterday''s session is still there',
                coalesce(d->>'name', 'Your session') || '. Do it today?',
                jsonb_build_object('date', (v_today - 1)::text, 'dayName', d->>'name'));
        sent := sent + 1;
      end if;
    end if;
    d := null;
  end loop;
  return sent;
end;
$$;
revoke execute on function public.notify_athlete_reminders() from public, anon, authenticated;

select cron.schedule('athlete-reminders', '5 * * * *', 'select public.notify_athlete_reminders()');
