-- 014: a coach can update a client's goals, injuries, body metrics and
-- training days.
--
-- A coach can read their athletes' profiles but not change them, so goals
-- and injuries stayed whatever the athlete typed at signup, even after the
-- coach learned the knee was better or the fight date moved.
--
-- As with 012, this is ONE function rather than an UPDATE policy: a policy
-- would let a coach change any column on the athlete's row (their name,
-- their coach, their role). This changes only:
--   profiles.goals, profiles.injuries, profiles.weight_kg, profiles.height_cm
--   and these keys inside profiles.intake: goals, injuries, injuryDetail,
--   injuryNotes, trainingDays, sessionMinutes, heightCm, weightLb, heightUnit,
--   weightUnit
-- and only for an athlete on the caller's own roster. No new columns.

create or replace function public.coach_update_athlete(
  p_athlete_id uuid,
  p_goals text[] default null,
  p_injuries text[] default null,
  p_weight_kg numeric default null,
  p_height_cm numeric default null,
  p_intake jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_allowed constant text[] := array['goals', 'injuries', 'injuryDetail', 'injuryNotes', 'trainingDays',
                                     'sessionMinutes', 'heightCm', 'weightLb', 'heightUnit', 'weightUnit'];
  v_patch jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from public.profiles where id = p_athlete_id and coach_id = auth.uid()) then
    raise exception 'Only this athlete''s coach can do that.' using errcode = '42501';
  end if;
  if p_weight_kg is not null and (p_weight_kg < 25 or p_weight_kg > 350) then
    raise exception 'That weight doesn''t look right.';
  end if;
  if p_height_cm is not null and (p_height_cm < 100 or p_height_cm > 250) then
    raise exception 'That height doesn''t look right.';
  end if;

  if p_intake is not null and jsonb_typeof(p_intake) = 'object' then
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_patch
      from jsonb_each(p_intake) where key = any(v_allowed);
  end if;

  update public.profiles
     set goals     = coalesce(p_goals, goals),
         injuries  = coalesce(p_injuries, injuries),
         weight_kg = coalesce(p_weight_kg, weight_kg),
         height_cm = coalesce(p_height_cm, height_cm),
         intake    = coalesce(intake, '{}'::jsonb) || v_patch
   where id = p_athlete_id;
end;
$function$;

revoke all on function public.coach_update_athlete(uuid, text[], text[], numeric, numeric, jsonb) from public, anon;
grant execute on function public.coach_update_athlete(uuid, text[], text[], numeric, numeric, jsonb) to authenticated;
