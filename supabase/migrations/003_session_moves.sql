-- 003: one-off changes to where a session sits in the week.
--
-- A programme day already carries a weekday and a list of skipRanges, which
-- between them answer "which day of the week is this on" and "is it paused
-- for a stretch". Neither answers the question the Plan screen is built
-- around: this ONE session, this ONE week, has been moved, skipped or pulled
-- forward to today.
--
-- Why a table rather than another field on the programme's jsonb: a
-- programme row can be shared by every athlete a coach has assigned it to.
-- Writing a move into it would move that session for all of them. This is
-- per-athlete by construction.
--
-- Keyed on the day's NAME, which is the same key workout_logs.program_day
-- already uses, so a move and the log that eventually satisfies it can be
-- lined up without a join through the programme.

create table if not exists public.session_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- The session this is about, by the name shown on screen.
  program_day text not null,
  -- The date it was originally scheduled for.
  from_date date not null,
  -- Where it went. Null means it is not happening on any date: skipped.
  to_date date,
  -- move  - the athlete chose another day for it, and it stays there.
  -- pull  - brought forward to today. If it is then stopped part-way, it
  --         goes back to from_date, so this is reversible and `move` is not.
  -- skip  - not doing it this week. to_date is null.
  kind text not null default 'move' check (kind in ('move', 'pull', 'skip')),
  created_at timestamptz not null default now(),
  -- One decision per session per scheduled date. Changing your mind updates
  -- the row rather than stacking a second one behind it.
  unique (user_id, program_day, from_date)
);

-- The Plan reads a week at a time, and Today reads the fortnight around it.
create index if not exists session_moves_user_from_idx
  on public.session_moves (user_id, from_date);
create index if not exists session_moves_user_to_idx
  on public.session_moves (user_id, to_date);

alter table public.session_moves enable row level security;

create policy "Owner can manage own session moves"
  on public.session_moves for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- A coach needs to see that Tuesday was moved to Thursday, or they will read
-- it as a missed session and ask about the wrong thing.
create policy "Coach can view their athletes' session moves"
  on public.session_moves for select
  using (exists (
    select 1 from public.profiles p
    where p.id = session_moves.user_id and p.coach_id = auth.uid()
  ));
