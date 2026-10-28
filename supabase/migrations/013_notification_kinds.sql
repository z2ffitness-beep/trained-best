-- 013: let the newer notification kinds through.
--
-- notifications.kind has a check that lists the kinds allowed. It was never
-- widened when new kinds were added, so:
--   * 'sessions_today' and 'session_today' (the 7 AM notices, migration 009)
--     would fail the first morning a coach has a booked session. The job has
--     run every hour since and succeeded only because no session was booked
--     on those mornings yet.
--   * 'session_note' (a coach's reply on a logged session, migration 012)
--     fails every time, and the whole reply is rolled back with it.
--
-- Widened, not loosened: still a fixed list, with every kind the app writes.
-- No rows change.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'session_completed', 'session_due', 'coach_message', 'program_changed', 'session_confirmed',
    'sessions_today', 'session_today', 'session_note'
  ]));
