-- 012: a coach can reply to a logged session and fix a wrong number in it.
--
-- Until now the athlete logged and the coach could only look: a coach has
-- SELECT on their athletes' workout_logs and workout_sets and nothing else.
--
-- Rather than give coaches UPDATE on those tables (which would let a coach
-- rewrite anything in the row), this adds ONE function that can do exactly
-- two things to a session belonging to one of the caller's own athletes:
--   * set the coach's note on it
--   * correct the weight or reps of a set that was logged
-- and tells the athlete it happened. Nothing else in the row can change.
--
-- New columns only; existing rows read null and behave as they do today.

alter table public.workout_logs add column if not exists coach_note text;
alter table public.workout_logs add column if not exists coach_note_at timestamptz;
alter table public.workout_logs add column if not exists coach_edited_at timestamptz;

-- p_edits: [{ "e": exercise index, "s": set index, "weight": number|null, "reps": int|null }]
-- Indexes are positions in workout_logs.exercises and that exercise's "sets".
create or replace function public.coach_update_session(
  p_log_id uuid,
  p_note text default null,
  p_edits jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner     uuid;
  v_exercises jsonb;
  v_day       text;
  v_date      date;
  v_edit      jsonb;
  v_e         int;
  v_s         int;
  v_set       jsonb;
  v_name      text;
  v_unit      text;
  v_weight    numeric;
  v_reps      int;
  v_changed   boolean := false;
  v_coach     text;
begin
  select user_id, exercises, program_day, date
    into v_owner, v_exercises, v_day, v_date
    from public.workout_logs where id = p_log_id;

  if v_owner is null then
    raise exception 'That session no longer exists.';
  end if;
  if not exists (select 1 from public.profiles where id = v_owner and coach_id = auth.uid()) then
    raise exception 'Only this athlete''s coach can do that.' using errcode = '42501';
  end if;

  if p_edits is not null and jsonb_typeof(p_edits) = 'array' then
    for v_edit in select * from jsonb_array_elements(p_edits) loop
      v_e := (v_edit->>'e')::int;
      v_s := (v_edit->>'s')::int;
      v_set := v_exercises -> v_e -> 'sets' -> v_s;
      if v_set is null then
        raise exception 'One of those sets isn''t in this session.';
      end if;
      v_weight := nullif(v_edit->>'weight', '')::numeric;
      v_reps   := nullif(v_edit->>'reps', '')::int;
      if v_weight is not null and (v_weight < 0 or v_weight > 2000) then
        raise exception 'That weight doesn''t look right.';
      end if;
      if v_reps is not null and (v_reps < 0 or v_reps > 999) then
        raise exception 'That rep count doesn''t look right.';
      end if;

      v_set := v_set || jsonb_build_object('weight', v_weight, 'reps', v_reps);
      v_exercises := jsonb_set(v_exercises, array[v_e::text, 'sets', v_s::text], v_set);
      v_changed := true;

      -- The per-set row the history and personal bests read, kept in step.
      v_name := v_exercises -> v_e ->> 'name';
      v_unit := coalesce(v_set->>'unit', 'lb');
      update public.workout_sets
         set weight_lb = case when v_weight is null then null
                              when v_unit = 'kg' then round(v_weight * 2.20462, 1)
                              else v_weight end,
             reps = v_reps
       where log_id = p_log_id
         and exercise_name = v_name
         and set_number = coalesce((v_set->>'set')::int, v_s + 1);
    end loop;
  end if;

  update public.workout_logs
     set exercises       = case when v_changed then v_exercises else exercises end,
         coach_edited_at = case when v_changed then now() else coach_edited_at end,
         coach_note      = case when p_note is not null then nullif(btrim(p_note), '') else coach_note end,
         coach_note_at   = case when p_note is not null then now() else coach_note_at end
   where id = p_log_id;

  -- Tell the athlete, with the note itself so the phone shows it.
  if (p_note is not null and nullif(btrim(p_note), '') is not null) or v_changed then
    select name into v_coach from public.profiles where id = auth.uid();
    insert into public.notifications (user_id, actor_id, kind, title, body, data)
    values (
      v_owner, auth.uid(), 'session_note',
      coalesce(v_coach, 'Your coach') || case when p_note is not null and nullif(btrim(p_note), '') is not null
                                              then ' replied on ' else ' updated ' end || coalesce(v_day, 'your session'),
      coalesce(nullif(btrim(p_note), ''), 'Corrected a number you logged'),
      jsonb_build_object('logId', p_log_id, 'dayName', v_day, 'date', v_date, 'edited', v_changed)
    );
  end if;
end;
$function$;

revoke all on function public.coach_update_session(uuid, text, jsonb) from public, anon;
grant execute on function public.coach_update_session(uuid, text, jsonb) to authenticated;
