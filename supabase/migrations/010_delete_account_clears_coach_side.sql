-- 010: deleting an account also clears it from the coach's side.
--
-- Every table that holds a user's data already cascades when the account is
-- deleted. The one gap is notifications: a coach's "X completed a session" and
-- "X confirmed today's session" notices belong to the coach (user_id), name the
-- athlete only in actor_id and data.athleteId, and actor_id is ON DELETE SET
-- NULL. So the athlete's name and sessions stayed in the coach's list after the
-- athlete had asked to be removed.
--
-- This replaces the function body only. No table or column changes.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  -- Athletes coached by this person are released, not deleted. Their training
  -- history belongs to them, and profiles.coach_id has no ON DELETE action, so
  -- without this the delete below fails outright for any coach with a roster.
  update public.profiles
     set coach_id = null,
         role = case when role = 'athlete_coached' then 'athlete' else role end
   where coach_id = me;

  -- Notices about this person sitting in someone else's list.
  delete from public.notifications
   where actor_id = me
      or data->>'athleteId' = me::text;

  delete from auth.users where id = me;
end;
$function$;
