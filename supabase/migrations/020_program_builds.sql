-- 020: program builds that keep going when you leave the app (Isaiah, 15 Nov).
--
-- A program takes two to four minutes to build. It used to stream straight to
-- the phone, so switching apps or locking the screen killed the connection and
-- the build with it ("the request timed out"). Now the server builds it and
-- writes the result here, and the phone just checks this row until it is done,
-- whenever it comes back.
--
-- New table only. Nothing existing is changed or dropped.

begin;

create table public.program_builds (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Who the program is for when a coach builds it for a client. Null when it
  -- is for the person building it.
  for_athlete_id uuid references public.profiles(id) on delete set null,
  status        text not null default 'running' check (status in ('running', 'done', 'failed')),
  -- How far along: days and exercises written so far, for the percentage.
  progress      jsonb not null default '{}'::jsonb,
  -- The model's raw reply. The phone parses and saves it as a program.
  result        text check (result is null or length(result) <= 400000),
  error         text check (error is null or length(error) <= 1000),
  stop_reason   text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index program_builds_user_created on public.program_builds (user_id, created_at desc);

alter table public.program_builds enable row level security;

-- Only the person who started a build can see or touch it. The server writes
-- to it with that person's own sign-in, so no service key is involved.
create policy program_builds_own_read on public.program_builds
  for select to authenticated using (user_id = auth.uid());

create policy program_builds_own_insert on public.program_builds
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      for_athlete_id is null
      or for_athlete_id = auth.uid()
      or exists (select 1 from public.profiles p where p.id = for_athlete_id and p.coach_id = auth.uid())
    )
  );

create policy program_builds_own_update on public.program_builds
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy program_builds_own_delete on public.program_builds
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.program_builds from anon;
grant select, insert, update, delete on public.program_builds to authenticated;

commit;
