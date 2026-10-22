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
