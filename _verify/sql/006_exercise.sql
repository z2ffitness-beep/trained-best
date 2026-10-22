-- Exercising migration 006 against a real Postgres.
--
-- Two things to prove, and the first matters more than the feature:
--
--   1. `form_check_files_read` and `progress_photo_read` were broken on the
--      live database. The coach branch compared a profile's id against the
--      first path segment of that profile's NAME instead of the file's path,
--      so it could never be true and a coach could not open an athlete's
--      form check or progress photo at all. The scaffold creates those two
--      policies exactly as they read live, so this file can show the before
--      as well as the after.
--
--   2. Media in a thread is readable by both people in that thread and by
--      nobody else, and the column-level INSERT grant actually covers the
--      new columns - the trap that makes sending a photo fail as a
--      permission error on a column the sender can see on screen.
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.expect_fail(sql text, what text) returns text
language plpgsql as $$
begin
  execute sql;
  return 'FAIL  ' || what || ' (it was allowed)';
exception when others then
  return 'PASS  ' || what;
end $$;

create or replace function pg_temp.expect_ok(sql text, what text) returns text
language plpgsql as $$
begin
  execute sql;
  return 'PASS  ' || what;
exception when others then
  return 'FAIL  ' || what || ' -> ' || sqlerrm;
end $$;

truncate public.messages;
delete from storage.objects;
truncate public.profiles cascade;

insert into public.profiles (id, name, coach_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'Coach Isaiah', null, 'coach'),
  ('22222222-2222-2222-2222-222222222222', 'Dana Ruiz', '11111111-1111-1111-1111-111111111111', 'athlete_coached'),
  ('44444444-4444-4444-4444-444444444444', 'Other Coach', null, 'coach'),
  ('55555555-5555-5555-5555-555555555555', 'Not Mine', '44444444-4444-4444-4444-444444444444', 'athlete_coached');

-- Files, filed under the athlete they belong to, which is the convention
-- every one of these buckets uses.
insert into storage.objects (bucket_id, name) values
  ('form-checks',     '22222222-2222-2222-2222-222222222222/clip.mp4'),
  ('progress-photos', '22222222-2222-2222-2222-222222222222/front.jpg'),
  ('message-media',   '22222222-2222-2222-2222-222222222222/photo.jpg'),
  ('message-media',   '55555555-5555-5555-5555-555555555555/other.jpg');

grant execute on function public.in_thread_with(uuid) to rls_tester;

create or replace function pg_temp.can_read(p_uid uuid, p_bucket text, p_name text) returns boolean
language plpgsql security invoker as $$
declare n integer;
begin
  update auth.state set uid = p_uid;
  select count(*) into n from storage.objects where bucket_id = p_bucket and name = p_name;
  return n = 1;
end $$;

set role rls_tester;

select '--- the policy that never worked ---';

select case when pg_temp.can_read('22222222-2222-2222-2222-222222222222','form-checks','22222222-2222-2222-2222-222222222222/clip.mp4')
  then 'PASS  an athlete can still open their own form check'
  else 'FAIL  the fix locked the athlete out of their own clip' end;

-- The one the bug broke.
select case when pg_temp.can_read('11111111-1111-1111-1111-111111111111','form-checks','22222222-2222-2222-2222-222222222222/clip.mp4')
  then 'PASS  a coach can open their own athlete''s form check (this was impossible before 006)'
  else 'FAIL  the coach still cannot open their athlete''s form check' end;

select case when pg_temp.can_read('11111111-1111-1111-1111-111111111111','progress-photos','22222222-2222-2222-2222-222222222222/front.jpg')
  then 'PASS  a coach can open their own athlete''s progress photo (also impossible before 006)'
  else 'FAIL  the coach still cannot open their athlete''s progress photo' end;

-- And the fix must not have opened it up to everyone.
select case when not pg_temp.can_read('44444444-4444-4444-4444-444444444444','form-checks','22222222-2222-2222-2222-222222222222/clip.mp4')
  then 'PASS  another coach cannot open it'
  else 'FAIL  the fix lets any coach read any athlete''s clips' end;
select case when not pg_temp.can_read('55555555-5555-5555-5555-555555555555','progress-photos','22222222-2222-2222-2222-222222222222/front.jpg')
  then 'PASS  another coach''s client cannot open it'
  else 'FAIL  any signed-in athlete can read other people''s progress photos' end;

select '--- media in a thread ---';

select case when pg_temp.can_read('22222222-2222-2222-2222-222222222222','message-media','22222222-2222-2222-2222-222222222222/photo.jpg')
  then 'PASS  the athlete can open media in their own thread'
  else 'FAIL  the athlete cannot open media in their own thread' end;
select case when pg_temp.can_read('11111111-1111-1111-1111-111111111111','message-media','22222222-2222-2222-2222-222222222222/photo.jpg')
  then 'PASS  their coach can open it'
  else 'FAIL  the coach cannot open media in a thread they are in' end;
select case when not pg_temp.can_read('44444444-4444-4444-4444-444444444444','message-media','22222222-2222-2222-2222-222222222222/photo.jpg')
  then 'PASS  a coach outside the thread cannot'
  else 'FAIL  any coach can read any thread''s media' end;
select case when not pg_temp.can_read('22222222-2222-2222-2222-222222222222','message-media','55555555-5555-5555-5555-555555555555/other.jpg')
  then 'PASS  an athlete cannot read another thread''s media'
  else 'FAIL  an athlete can read another athlete''s photos' end;

update auth.state set uid = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_ok(
  $q$ insert into storage.objects (bucket_id, name) values ('message-media','22222222-2222-2222-2222-222222222222/new.jpg') $q$,
  'the athlete can upload into their own thread');
select pg_temp.expect_fail(
  $q$ insert into storage.objects (bucket_id, name) values ('message-media','55555555-5555-5555-5555-555555555555/sneak.jpg') $q$,
  'the athlete cannot upload into somebody else''s thread');

update auth.state set uid = '11111111-1111-1111-1111-111111111111';
select pg_temp.expect_ok(
  $q$ insert into storage.objects (bucket_id, name) values ('message-media','22222222-2222-2222-2222-222222222222/coach.jpg') $q$,
  'the coach can upload into their athlete''s thread');

update auth.state set uid = '44444444-4444-4444-4444-444444444444';
select pg_temp.expect_fail(
  $q$ insert into storage.objects (bucket_id, name) values ('message-media','22222222-2222-2222-2222-222222222222/sneak.jpg') $q$,
  'a coach outside the thread cannot upload into it');

-- Delete, which is what makes "delete for everyone" true of a photo.
update auth.state set uid = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_ok(
  $q$ delete from storage.objects where bucket_id='message-media' and name='22222222-2222-2222-2222-222222222222/new.jpg' $q$,
  'the athlete can remove media from their own thread');
-- Checked by whether the row SURVIVES, not by whether the statement
-- raised. A delete the policy filters out of simply affects no rows and
-- succeeds, so expect_fail here reported a working policy as broken - and
-- would have reported a broken one as working the moment the wording
-- changed.
delete from storage.objects where bucket_id='message-media' and name='55555555-5555-5555-5555-555555555555/other.jpg';
set role postgres;
select case when exists (select 1 from storage.objects where name='55555555-5555-5555-5555-555555555555/other.jpg')
  then 'PASS  the athlete cannot remove somebody else''s media'
  else 'FAIL  an athlete deleted another thread''s photo' end;
set role rls_tester;

select '--- the column grant, which is the trap ---';

-- THE one that would otherwise be found by a client reporting a permission
-- error on a column they can see on screen.
select case when has_column_privilege('authenticated','public.messages','media_path','insert')
            and has_column_privilege('authenticated','public.messages','media_kind','insert')
  then 'PASS  a signed-in user may insert the new columns'
  else 'FAIL  sending a photo fails as a permission error - the grant was not extended' end;

-- Not granted UPDATE, deliberately: media cannot be swapped under a message
-- after it is sent, for the same reason the body cannot be edited.
select case when not has_column_privilege('authenticated','public.messages','media_path','update')
  then 'PASS  media cannot be swapped under a message after it is sent'
  else 'FAIL  a sent message''s media can be replaced' end;

-- The tombstone path still has to work.
select case when has_column_privilege('authenticated','public.messages','deleted_at','update')
  then 'PASS  deleting for everyone still works'
  else 'FAIL  the new grant disturbed the existing update grants' end;

reset role;

select '--- properties behaviour cannot reach ---';

-- The delete policy's thread check cannot be caught by deleting things: a
-- row the read policy hides is invisible to the DELETE as well, so a wide
-- open delete policy behaves identically. It is defence in depth, and the
-- only honest way to hold it is to read the policy itself.
select case when (select qual from pg_policies
                  where schemaname='storage' and tablename='objects'
                    and policyname='message_media_delete') like '%in\_thread\_with%'
  then 'PASS  the delete policy is scoped to the thread, not just the bucket'
  else 'FAIL  anybody who can see a thread''s media can delete it' end;

-- Same reasoning for security definer. in_thread_with reads profiles, which
-- has RLS of its own since 004, and today the coach can see the row it
-- needs. The day that policy is narrowed, a function that is not definer
-- starts returning false and every coach silently loses every photo in
-- every thread.
select case when (select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='in_thread_with')
  then 'PASS  in_thread_with is security definer, so it does not depend on the caller''s view of profiles'
  else 'FAIL  in_thread_with reads profiles as the caller' end;

select case when (select array_to_string(proconfig,',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='in_thread_with') like '%search_path=public%'
  then 'PASS  it has a fixed search_path, which is how a definer function avoids being hijacked'
  else 'FAIL  in_thread_with is security definer with no fixed search_path' end;

select case when not has_function_privilege('anon','public.in_thread_with(uuid)','execute')
  then 'PASS  an anonymous caller cannot ask who is in which thread'
  else 'FAIL  anyone can ask whether two people are in a thread together' end;
select case when has_function_privilege('authenticated','public.in_thread_with(uuid)','execute')
  then 'PASS  a signed-in user can, which the storage policies need'
  else 'FAIL  nobody can call it, so no thread media is readable at all' end;

select '--- neither or both ---';

select pg_temp.expect_ok(
  $q$ insert into public.messages (athlete_id, sender_id, body) values
      ('22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222','just text') $q$,
  'a message with no media is still fine');
select pg_temp.expect_ok(
  $q$ insert into public.messages (athlete_id, sender_id, body, media_path, media_kind) values
      ('22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222','', '22222222-2222-2222-2222-222222222222/photo.jpg', 'image') $q$,
  'a photo with no caption is fine');
select pg_temp.expect_fail(
  $q$ insert into public.messages (athlete_id, sender_id, body, media_path) values
      ('22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222','x','a/b.jpg') $q$,
  'a path with no kind is refused, instead of rendering as a broken frame');
select pg_temp.expect_fail(
  $q$ insert into public.messages (athlete_id, sender_id, body, media_kind) values
      ('22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222','x','image') $q$,
  'a kind with no path is refused');
select pg_temp.expect_fail(
  $q$ insert into public.messages (athlete_id, sender_id, body, media_path, media_kind) values
      ('22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222','x','a/b.pdf','document') $q$,
  'a kind the thread cannot render is refused');

update auth.state set uid = null;
