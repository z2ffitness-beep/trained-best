-- 017: tell a program session apart from an extra activity (Isaiah approved,
-- 1 Nov).
--
-- "Log an activity" records things outside the program: a 30 minute walk on a
-- Tuesday, a pickup game, a yoga class. They are kept in workout_logs so the
-- athlete's history and their coach see them, but they must not count as a
-- planned session done, or a missed one made up.
--
-- New column only. Every existing row reads 'session', which is what it is.
alter table public.workout_logs
  add column if not exists kind text not null default 'session';

alter table public.workout_logs drop constraint if exists workout_logs_kind_check;
alter table public.workout_logs add constraint workout_logs_kind_check
  check (kind in ('session', 'activity'));
