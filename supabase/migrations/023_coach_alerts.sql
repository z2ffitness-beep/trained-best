-- 023: alerts for coaches about their clients (Isaiah, 25 Nov).
--
-- "X client has a session today. X client missed a session today. X client
-- logged a session. Check up on your clients today." Coaches already hear when
-- a client finishes a session (session_completed), messages them (022) and
-- has a booked session today (sessions_today). This adds:
--   coach_today    7 am:  "3 clients training today: Mitch (Day 2), ..."
--   coach_missed   8 pm:  "Missed today: Mitch (Day 2)"
--   coach_checkin  Monday 9 am: "Check in on Mitch and Liam: no sessions in
--                  7 days" (only when someone has gone quiet)
--   client_joined  when someone joins the coach's client list
-- Each is at most once a day, in the coach's own time zone, and each can be
-- switched off in Profile (profiles.intake.notify.today / missed / checkin /
-- joined / sessions = false). sessions also switches off "finished a session".
--
-- Nothing is dropped. The kind check gets four more values, and
-- notify_coach_session_complete gains the switch above; the rest is new.

-- 1. Four more kinds -----------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'session_completed', 'session_due', 'coach_message', 'program_changed', 'session_confirmed',
  'sessions_today', 'session_today', 'session_note',
  'message', 'session_reminder', 'session_missed',
  'coach_today', 'coach_missed', 'coach_checkin', 'client_joined'
]));

-- 2. "Finished a session" can be switched off ------------------------------------
create or replace function public.notify_coach_session_complete(p_day_name text, p_date date, p_timed_seconds integer DEFAULT NULL::integer, p_sets_completed integer DEFAULT NULL::integer, p_sets_prescribed integer DEFAULT NULL::integer)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_coach uuid;
  v_name  text;
  v_id    uuid;
begin
  select coach_id, name into v_coach, v_name
  from public.profiles
  where id = auth.uid();

  -- Self-coached athletes have no coach. Not an error; there is simply nobody
  -- to tell, and the session is already saved either way.
  if v_coach is null then
    return null;
  end if;
  -- The coach switched these off in Profile (023).
  if exists (select 1 from public.profiles where id = v_coach and intake->'notify'->>'sessions' = 'false') then
    return null;
  end if;

  insert into public.notifications (user_id, actor_id, kind, title, body, data)
  values (
    v_coach,
    auth.uid(),
    'session_completed',
    coalesce(v_name, 'Your athlete') || ' completed a session',
    coalesce(p_day_name, 'A session'),
    jsonb_build_object(
      'athleteId', auth.uid(),
      'athleteName', v_name,
      'date', p_date,
      'dayName', p_day_name,
      'timedSeconds', p_timed_seconds,
      'setsCompleted', p_sets_completed,
      'setsPrescribed', p_sets_prescribed
    )
  )
  returning id into v_id;

  return v_id;
end;
$function$;

-- 3. Someone joins the client list -------------------------------------------------
create or replace function public.profiles_notify_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coach_id is null or new.coach_id = new.id then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.coach_id is not distinct from old.coach_id then
    return new;
  end if;
  if exists (select 1 from profiles where id = new.coach_id and intake->'notify'->>'joined' = 'false') then
    return new;
  end if;
  insert into notifications (user_id, actor_id, kind, title, body, data)
  values (new.coach_id, new.id, 'client_joined',
          coalesce(nullif(new.name, ''), 'A new client') || ' joined your client list',
          'Their program builds from their answers. Have a look once it''s ready.',
          jsonb_build_object('athleteId', new.id));
  return new;
exception when others then
  return new;
end;
$$;
revoke execute on function public.profiles_notify_joined() from public, anon, authenticated;

drop trigger if exists profiles_notify_joined on public.profiles;
create trigger profiles_notify_joined
  after insert or update of coach_id on public.profiles
  for each row execute function public.profiles_notify_joined();

-- 4. Morning, evening and Monday digests ------------------------------------------
-- Today's session for one client, or null: on the program for that date and
-- not moved away, or pulled to it.
create or replace function public.client_session_on(p_user uuid, p_days jsonb, p_date date)
returns jsonb
language sql
stable
set search_path = public
as $$
  select x.day from (
    select e as day, 1 as o from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) e
     where program_day_on(e, p_date)
       and not exists (select 1 from session_moves m
                        where m.user_id = p_user and m.program_day = e->>'name' and m.from_date = p_date)
    union all
    select e, 0 from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) e
     where exists (select 1 from session_moves m
                    where m.user_id = p_user and m.program_day = e->>'name' and m.to_date = p_date)
  ) x order by x.o limit 1;
$$;
revoke execute on function public.client_session_on(uuid, jsonb, date) from public, anon;

create or replace function public.notify_coach_digests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c       record;
  v_tz    text;
  v_now   timestamp;
  v_today date;
  v_hour  int;
  v_list  text;
  v_n     int;
  sent    integer := 0;
begin
  for c in select id, intake from profiles where role = 'coach' loop
    v_tz := coalesce(nullif(c.intake->>'timezone', ''), 'America/Toronto');
    begin
      v_now := now() at time zone v_tz;
    exception when others then
      v_tz := 'America/Toronto';
      v_now := now() at time zone v_tz;
    end;
    v_today := v_now::date;
    v_hour := extract(hour from v_now);

    -- 7 am: who trains today.
    if v_hour = 7 and coalesce(c.intake->'notify'->>'today', 'true') <> 'false'
       and not exists (select 1 from notifications where user_id = c.id and kind = 'coach_today'
                        and (created_at at time zone v_tz)::date = v_today) then
      select count(*), string_agg(t.first || ' (' || t.day_short || ')', ', ' order by t.first)
        into v_n, v_list
        from (
          select coalesce(nullif(split_part(a.name, ' ', 1), ''), 'Client') as first,
                 split_part(client_session_on(a.id, g.days, v_today)->>'name', ' —', 1) as day_short
            from profiles a join programs g on g.id = a.active_program_id
           where a.coach_id = c.id and a.id <> c.id
             and client_session_on(a.id, g.days, v_today) is not null
        ) t;
      if v_n > 0 then
        insert into notifications (user_id, kind, title, body, data)
        values (c.id, 'coach_today',
                v_n || case when v_n = 1 then ' client training today' else ' clients training today' end,
                v_list, jsonb_build_object('date', v_today::text, 'count', v_n));
        sent := sent + 1;
      end if;
    end if;

    -- 8 pm: who missed today.
    if v_hour = 20 and coalesce(c.intake->'notify'->>'missed', 'true') <> 'false'
       and not exists (select 1 from notifications where user_id = c.id and kind = 'coach_missed'
                        and (created_at at time zone v_tz)::date = v_today) then
      select count(*), string_agg(t.first || ' (' || t.day_short || ')', ', ' order by t.first)
        into v_n, v_list
        from (
          select coalesce(nullif(split_part(a.name, ' ', 1), ''), 'Client') as first,
                 split_part(s.day->>'name', ' —', 1) as day_short
            from profiles a join programs g on g.id = a.active_program_id
            cross join lateral (select client_session_on(a.id, g.days, v_today) as day) s
           where a.coach_id = c.id and a.id <> c.id and s.day is not null
             and not exists (select 1 from workout_logs l
                              where l.user_id = a.id and l.date = v_today and l.program_day = s.day->>'name')
        ) t;
      if v_n > 0 then
        insert into notifications (user_id, kind, title, body, data)
        values (c.id, 'coach_missed',
                v_n || case when v_n = 1 then ' client missed today' else ' clients missed today' end,
                v_list, jsonb_build_object('date', v_today::text, 'count', v_n));
        sent := sent + 1;
      end if;
    end if;

    -- Monday 9 am: who has gone quiet for a week. Nothing when nobody has.
    if v_hour = 9 and extract(isodow from v_today) = 1
       and coalesce(c.intake->'notify'->>'checkin', 'true') <> 'false'
       and not exists (select 1 from notifications where user_id = c.id and kind = 'coach_checkin'
                        and (created_at at time zone v_tz)::date = v_today) then
      select count(*), string_agg(coalesce(nullif(split_part(a.name, ' ', 1), ''), 'Client'), ', ' order by a.name)
        into v_n, v_list
        from profiles a
       where a.coach_id = c.id and a.id <> c.id and a.active_program_id is not null
         and not exists (select 1 from workout_logs l where l.user_id = a.id and l.date > v_today - 7);
      if v_n > 0 then
        insert into notifications (user_id, kind, title, body, data)
        values (c.id, 'coach_checkin', 'Check in on your clients',
                v_list || case when v_n = 1 then ' hasn''t' else ' haven''t' end || ' trained in a week. A quick message goes a long way.',
                jsonb_build_object('date', v_today::text, 'count', v_n));
        sent := sent + 1;
      end if;
    end if;
  end loop;
  return sent;
end;
$$;
revoke execute on function public.notify_coach_digests() from public, anon, authenticated;

select cron.schedule('coach-digests', '7 * * * *', 'select public.notify_coach_digests()');
