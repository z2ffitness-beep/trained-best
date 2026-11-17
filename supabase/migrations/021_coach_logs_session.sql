-- 021: a coach can log a client's session in person (Isaiah, 17 Nov).
--
-- The coach is in the room and runs the client's workout on the coach's own
-- phone. Today only the client can write their workouts, so this adds:
--   1. workout_logs.logged_by: a NEW, nullable column. Null for everything
--      already there and for every session a client logs themselves; the
--      coach's id when the coach logged it. Nothing existing changes.
--   2. coach_log_session: the one way a coach writes a session, and only for
--      a client on their own roster. It writes the log, its sets and a
--      notification to the client in one go. Row level security on both
--      tables is unchanged: clients still own their rows, coaches still only
--      read them directly.

alter table public.workout_logs
  add column if not exists logged_by uuid references public.profiles(id) on delete set null;

comment on column public.workout_logs.logged_by is
  'The coach who logged this session for the client in person (coach_log_session). Null when the client logged it.';

create or replace function public.coach_log_session(p_athlete uuid, p_log jsonb, p_sets jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  v_id     uuid;
  v_date   date;
  v_owner  uuid;
  v_coach  text;
  v_day    text;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if not exists (select 1 from profiles where id = p_athlete and coach_id = me) then
    raise exception 'Only this client''s coach can log their session.' using errcode = '42501';
  end if;

  v_id := nullif(p_log->>'id', '')::uuid;
  if v_id is null then
    raise exception 'The session needs an id.';
  end if;
  v_date := coalesce(nullif(p_log->>'date', '')::date, current_date);
  if v_date < current_date - 2 or v_date > current_date + 1 then
    raise exception 'A session can only be logged for today.';
  end if;
  if jsonb_typeof(coalesce(p_log->'exercises', '[]'::jsonb)) <> 'array' then
    raise exception 'That session is not in the right shape.';
  end if;
  v_day := left(p_log->>'program_day', 200);

  -- Sent twice (a retry after a lost answer): the first one stands.
  select user_id into v_owner from workout_logs where id = v_id;
  if v_owner is not null then
    if v_owner <> p_athlete then
      raise exception 'That session belongs to someone else.' using errcode = '42501';
    end if;
    return v_id;
  end if;

  insert into workout_logs (
    id, user_id, date, program_day, duration, timed_seconds, mood,
    sets_completed, sets_prescribed, counts, exercises, notes, kind, logged_by
  ) values (
    v_id, p_athlete, v_date, v_day,
    nullif(p_log->>'duration', '')::int,
    nullif(p_log->>'timed_seconds', '')::int,
    left(p_log->>'mood', 40),
    nullif(p_log->>'sets_completed', '')::int,
    nullif(p_log->>'sets_prescribed', '')::int,
    nullif(p_log->>'counts', '')::boolean,
    coalesce(p_log->'exercises', '[]'::jsonb),
    nullif(btrim(p_log->>'notes'), ''),
    'session',
    me
  );

  if jsonb_typeof(p_sets) = 'array' then
    insert into workout_sets (log_id, user_id, exercise_name, set_number, reps, weight_lb, done, manually_set, is_pr)
    select v_id, p_athlete,
           left(s->>'exercise_name', 200),
           (s->>'set_number')::int,
           nullif(s->>'reps', '')::int,
           nullif(s->>'weight_lb', '')::numeric,
           coalesce((s->>'done')::boolean, false),
           coalesce((s->>'manually_set')::boolean, false),
           coalesce((s->>'is_pr')::boolean, false)
      from jsonb_array_elements(p_sets) s
     where coalesce(s->>'exercise_name', '') <> '' and (s->>'set_number') is not null
    on conflict (log_id, exercise_name, set_number) do update
      set reps = excluded.reps, weight_lb = excluded.weight_lb, done = excluded.done,
          manually_set = excluded.manually_set, is_pr = excluded.is_pr;
  end if;

  -- The client hears about it, the same way they hear about a coach's note.
  select name into v_coach from profiles where id = me;
  insert into notifications (user_id, actor_id, kind, title, body, data)
  values (
    p_athlete, me, 'session_note',
    coalesce(v_coach, 'Your coach') || ' logged ' || coalesce(v_day, 'your session'),
    'Your session is in your history.',
    jsonb_build_object('logId', v_id, 'dayName', v_day, 'date', v_date, 'loggedByCoach', true)
  );

  return v_id;
end;
$$;

revoke execute on function public.coach_log_session(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.coach_log_session(uuid, jsonb, jsonb) to authenticated;
