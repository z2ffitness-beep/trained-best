-- Phase 1a: per-set storage
--
-- Until now a workout log held one jsonb entry per EXERCISE, with the sets
-- nested inside it. That shape cannot answer the questions phase 1 is built
-- on: what is this athlete's best on this lift, did they log every set, how
-- has the top set moved over six sessions. Each one becomes a jsonb crawl
-- across every log the athlete has ever written.
--
-- So sets become rows. The existing workout_logs.exercises jsonb is left
-- exactly as it is and keeps working: nothing reads it differently, nothing
-- is dropped, and the app can move over one screen at a time.
--
-- Additive only. No existing column, row or policy is changed.

-- 1. The table.
--
-- user_id is denormalised from workout_logs on purpose. Every important
-- query here is "this athlete's history for this lift", and carrying the
-- owner on the row keeps both the index and the RLS check single-table.
-- A join to workout_logs for RLS would be evaluated per row.
create table public.workout_sets (
  id            uuid primary key default gen_random_uuid(),
  log_id        uuid not null references public.workout_logs(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  exercise_name text not null,
  set_number    integer not null,
  reps          integer,
  -- Always lb. The athlete's chosen unit is a display setting, never a
  -- storage one: two athletes on the same programme must be comparable, and
  -- a coach reads every athlete in the coach's own unit.
  weight_lb     numeric(7,2),
  done          boolean not null default false,
  -- The athlete typed this weight rather than inheriting it from fill-down.
  -- Fill-down must not overwrite a hand-set value.
  manually_set  boolean not null default false,
  -- Decided when the workout is saved, not recomputed on read, so a best
  -- cannot quietly change later because the rule changed.
  is_pr         boolean not null default false,
  created_at    timestamptz not null default now(),
  -- One row per set per exercise per log. Makes a re-save idempotent via
  -- upsert instead of creating duplicate sets.
  unique (log_id, exercise_name, set_number)
);

-- 2. Indexes for the three real queries.
-- Bests and "top set over the last 6 sessions" both scan one athlete's
-- history of one lift.
create index workout_sets_user_exercise_idx
  on public.workout_sets (user_id, exercise_name, created_at desc);
-- Loading a single workout's sets.
create index workout_sets_log_idx on public.workout_sets (log_id);

-- 3. RLS, matching workout_logs exactly: the athlete owns their rows, their
-- coach may read them, nobody else sees anything.
alter table public.workout_sets enable row level security;

create policy "Owner can manage own workout sets"
  on public.workout_sets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Coach can view their athletes' workout sets"
  on public.workout_sets for select
  using (exists (
    select 1 from public.profiles p
    where p.id = workout_sets.user_id and p.coach_id = auth.uid()
  ));

-- 4. Display preferences on the profile.
-- Both nullable with a default, so every existing row reads as lb / system
-- without being touched.
alter table public.profiles
  add column unit_pref  text not null default 'lb',
  add column theme_pref text not null default 'system';

alter table public.profiles
  add constraint profiles_unit_pref_check  check (unit_pref in ('lb','kg')),
  add constraint profiles_theme_pref_check check (theme_pref in ('system','light','dark'));

-- 5. The 50% decision, stored rather than recomputed.
--
-- A workout counts toward streak, level, points and badges only if at least
-- half its sets are ticked. Storing the answer means the rewards screen, the
-- coach's adherence figure and the points ledger cannot disagree, and that
-- changing the threshold later does not silently rewrite history.
alter table public.workout_logs
  add column counts boolean;

comment on column public.workout_logs.counts is
  'Did this session meet the 50% of prescribed sets bar. Decided at save time; null for logs written before the rule existed.';

-- 6. Backfill.
--
-- BACKEND-PLAN.md recorded that the logs hold no weight and that the new
-- table could start empty. That is not true: of the logs present on
-- 15 Oct 2026, most carry a per-set array and several carry a real weight
-- with a unit beside it. Starting empty would make those sessions invisible
-- to bests, to "every set logged" and to last time's numbers, so an athlete
-- would be told "first time logging this" for a lift they have already done.
--
-- Only sets that were actually performed are carried over: ticked done, and
-- with a number of some kind against them. That matches wasLifted() in the
-- app, so the table agrees with what the screens already show.
insert into public.workout_sets
  (log_id, user_id, exercise_name, set_number, reps, weight_lb, done, manually_set, is_pr, created_at)
select
  w.id,
  w.user_id,
  e->>'name',
  (s->>'set')::int,
  case when jsonb_typeof(s->'reps') = 'number' then (s->>'reps')::numeric::int end,
  case
    when jsonb_typeof(s->'weight') <> 'number' then null
    -- Stored in whatever unit was on the set. kg rows become lb.
    when lower(coalesce(s->>'unit','lb')) = 'kg'
      then round((s->>'weight')::numeric * 2.2046226218, 2)
    else round((s->>'weight')::numeric, 2)
  end,
  true,
  -- Everything historic counts as hand-entered: fill-down did not exist when
  -- these were written, so no value here was inherited from another set.
  true,
  -- Bests are decided on save. Marking history as a PR would hand out badges
  -- for sessions that happened before the rule existed.
  false,
  w.created_at
from public.workout_logs w,
     lateral jsonb_array_elements(w.exercises) e,
     lateral jsonb_array_elements(
       case when jsonb_typeof(e->'sets') = 'array' then e->'sets' else '[]'::jsonb end
     ) s
where w.exercises is not null
  and jsonb_typeof(w.exercises) = 'array'
  and (s->>'done')::boolean is true
  and (jsonb_typeof(s->'weight') = 'number' or jsonb_typeof(s->'reps') = 'number')
  and (s->>'set') ~ '^[0-9]+$'
on conflict (log_id, exercise_name, set_number) do nothing;

-- 7. Backfill `counts` for sessions already saved, using the same bar the
-- app will apply from now on. A log with nothing prescribed cannot be judged
-- on a ratio, so it counts.
update public.workout_logs
set counts = case
  when coalesce(sets_prescribed, 0) <= 0 then true
  else coalesce(sets_completed, 0)::numeric / sets_prescribed >= 0.5
end
where counts is null;
