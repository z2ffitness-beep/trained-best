-- Phase 6: coach branding
-- Adds business_name, brand_color, logo_path to profiles; a public
-- coach-logos storage bucket; and widens coach_by_invite_code to return the
-- new fields so the signed-out signup step can show a coach's branding
-- before the account exists.
--
-- Additive only. No existing column, row, or caller is changed in a way
-- that breaks it.

-- 1. New columns on profiles. Nullable, no default — a coach with nothing
-- set just shows "by Trained.Best" with no logo, same as today.
alter table public.profiles
  add column business_name text,
  add column brand_color text,
  add column logo_path text;

-- 2. Storage bucket for logos. Public read (same as exercise-photos, so the
-- signed-out signup card can load a logo with no auth header), capped at
-- 10 MB, images only (same limit and mime list as exercise-photos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coach-logos',
  'coach-logos',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/heic']
);

-- Write access is scoped to the coach's own folder (path must start with
-- their own uid), same pattern as form-checks and progress-photos. Unlike
-- exercise-photos (a shared library any coach may edit), a logo is personal
-- — one coach must not be able to overwrite another's.
create policy "coach_logo_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'coach-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "coach_logo_update"
  on storage.objects for update
  using (
    bucket_id = 'coach-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "coach_logo_delete"
  on storage.objects for delete
  using (
    bucket_id = 'coach-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No select policy: the bucket is public, so reads go through the public
-- CDN URL and never touch storage.objects RLS — same as exercise-photos.

-- 3. Widen coach_by_invite_code to also return branding. Postgres won't let
-- CREATE OR REPLACE change a function's return type, so the old signature is
-- dropped first. The argument (p_code text) is unchanged and every existing
-- caller destructures named fields, so this is safe for current call sites.
drop function coach_by_invite_code(text);

create function public.coach_by_invite_code(p_code text)
returns table(
  id uuid,
  name text,
  avatar text,
  photo_url text,
  accountability_enabled boolean,
  business_name text,
  brand_color text,
  logo_path text
)
language sql
stable security definer
set search_path to 'public'
as $$
  select
    p.id,
    p.name,
    p.avatar,
    p.photo_url,
    coalesce((p.intake->>'accountabilityEnabled')::boolean, true),
    p.business_name,
    p.brand_color,
    p.logo_path
  from profiles p
  where p.role = 'coach'
    and p.invite_code = upper(btrim(p_code))
    and length(btrim(p_code)) = 6
  limit 1;
$$;

-- DROP FUNCTION removed the live grants along with the old function. Without
-- this, anon loses EXECUTE and the invite-code lookup — which runs before
-- login, as anon — breaks for every athlete mid-signup with no other symptom.
grant execute on function public.coach_by_invite_code(text)
  to anon, authenticated, service_role;
