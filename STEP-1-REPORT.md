# Step 1: what exists, what is new, what conflicts

Written 15 Oct 2026, against `src/App.jsx` on branch `redesign-branding` and
the live Supabase schema read the same day. No code was changed to produce it.

This is the report `design-handoff/CLAUDE-PROMPT.md` asks for before any build
starts. It also corrects one finding in `BACKEND-PLAN.md`.

---

## The short version

The spec is bigger than it looks, but less of it is new than it looks either.
Roughly a third already exists in some form, a third is front end only, and a
third needs new storage.

The two things that will cost the most are **per set storage** (phase 1) and
**Stripe** (phase 7). Everything else sits on data you already have.

---

## 1. Already built, keep it

| Spec item | Where it is now |
|---|---|
| Four check in scales | `CHECKIN_SCALES`: sleep, energy, recovery, stress. Exactly the four the spec asks for, already 1 to 5, already stored |
| Points 10 / 15 / 25 | `POINTS = { session: 10, compliance: 15, perfectWeek: 25 }`. The spec's numbers match what is already running |
| Streak | Computed in code. Note: this is a **day** streak, the spec wants a **Perfect Week** streak. Same word, different thing |
| Per set weight and reps | Already captured. Logs carry `sets: [{set, done, reps, unit, weight}]` plus `topWeight` |
| Rest timer | Built |
| Warm up and cool down, nothing to log | Built. "Mark as done" with no weight or rep boxes |
| Film a set for Coach | Built as `form_checks` with a private bucket and signed URLs. Extend it, do not rebuild it |
| Theme System / Light / Dark | `applyTheme` exists. Only the saved preference is missing |
| Adherence % | Computed already |
| Coach branding | Shipped on this branch. `profiles.brand_color`, `profiles.logo_path`, `coach-logos` bucket, six fixed swatches |
| Message deletion | Shipped. Hide for me, delete for everyone, tombstones, realtime |
| Last time's numbers | `lastLoggedSets` searches the athlete's whole history and shows the previous session's sets at the point of decision |

## 2. New, no database needed

Front end only. Cheapest wins in the whole spec.

- Weight box minus and plus buttons, 5 lb or 2.5 kg steps
- Weight fills down to later untouched sets
- Typo warning ("more than double your other sets")
- Print it for the gym, the one page sheet
- Rewards screen animation order, respecting `prefers-reduced-motion`
- Month calendar drawn over the bookings you already have
- Roster dots and the Needs you list, where the flags are derivable
- Signup reduced from 15 steps to 5, answers already land in `profiles.intake`
- Week 1 starts today: `programs.started_on` already exists and defaults to today

## 3. New, needs storage

| Item | Needs |
|---|---|
| Per set rows | `workout_sets`: log id, exercise name, set number, reps, `weight_lb`, done, `manually_set`, `is_pr` |
| lb / kg for lifted weight | `profiles.unit_pref`, default `lb` |
| Saved theme | `profiles.theme_pref` |
| Paused workouts | Sets so far, current exercise, elapsed seconds, the day it was stopped on |
| Pulled forward goes back | `original_day`, `pulled_from_day` on the planned session |
| 50% rule | Store the decision as `counts`, so two screens cannot compute it differently |
| Levels and badges | Neither exists. "Badge" in the code today is the red number on a nav tab, nothing to do with achievements |
| Kudos | A message kind plus a points entry |
| Pain reports | Derivable flags are fine; pain has nowhere to live |
| Message attachments | Type, storage path, poster, `video_note_at_seconds`, `reply_to_message_id` |
| Welcome video | Path plus an auto send setting |
| Stripe | Nothing exists. The only trace is the word "Stripe" in a list of payment method names |

## 4. Where the spec and the app disagree

Per the ground rules, these are listed rather than decided.

**Tabs.** Spec wants four: Today, Plan, Coach, My Info. The app has six:
Home, Program, Week, Book, Coach, Profile. Program and Week would merge into
Plan, and Book would fold into Coach. Book and Coach are currently static on
purpose, shown whether or not the athlete has a coach, because hiding them
made the app look emptier than it is. Collapsing to four tabs reverses a
decision that was made deliberately.

**Streak.** The app counts consecutive days trained. The spec counts
consecutive Perfect Weeks, with one shield a month. These are different
numbers and an athlete's streak will change the day this ships. Worth telling
them rather than letting it drop silently.

**Booking.** Already settled in BACKEND-PLAN as "both ways". Worth repeating
that `availability_slots.session_type_id` is NOT NULL, so a coach made direct
booking still needs a session type: either reuse one or create one first.

**Check ins.** The spec proposes one row per athlete per day with four scores.
That already exists on `progress_entries`. Do not build a second home for it.

**Pack sessions.** The spec says attended "uses up" a pack session. The app
computes credits from bookings rather than counting down a stored number,
which is the safer design. Keep it. Do not add a counter.

## 5. Database changes by phase

- **Phase 1**: `workout_sets` table, `profiles.unit_pref`, `profiles.theme_pref`,
  paused session storage, points ledger, badges earned. The biggest migration
  in the spec.
- **Phase 2**: none.
- **Phase 3**: pain reports, kudos. Everything else is computed.
- **Phase 4**: `no_show` as a booking status, a video link field, and INSERT
  plus UPDATE policies on `session_change_requests`, which today has only a
  SELECT policy and so cannot be written from the app.
- **Phase 5**: attachment rows, two message columns.
- **Phase 6**: done.
- **Phase 7**: all of Stripe.

## 6. Risks

**The correction.** `BACKEND-PLAN.md` says "your workout logs do not store
weight at all" and concludes there is nothing to migrate. That is not true
today. Of 8 workout logs, **7 carry per set arrays and 4 carry a real set
weight**, each with a `unit` already recorded. So:

- There is a small amount of real weight data, with units.
- When `workout_sets` is created, those 4 logs need backfilling from the
  existing jsonb. Without it, bests, "every set logged" and last time's
  numbers will all treat those sessions as if they never happened, and an
  athlete will be told "first time logging this" for a lift that has history.

The backfill is small and one time. It just has to be in the migration rather
than discovered later.

**Two sources of truth for a set.** Once `workout_sets` exists, the same set
lives in both the table and `workout_logs.exercises` jsonb. Decide now which
one the app reads. Writing both and reading whichever is handy is how the two
drift apart.

**Nav is load bearing.** Eight places link to the workout route. The tab merge
done on 7 Oct kept the route and removed only the bar entry, for that reason.
Any further tab change should do the same.

**The messages grant.** `messages` has column level UPDATE grants: only
`read_at`, `deleted_at`, `deleted_by` and `hidden_for` can be written, and a
trigger blocks edits to the body. Any new message column has to be added to
that grant or writes fail in a way that reads like a bug, not a permission
error. This will bite in phase 5.

**One stale test, now fixed.** The `_verify` suite was moved into this repo
today. 902 of 903 assertions passed. The one failure was a test anchored on
the first `} finally {` in `CoachProfile`, which the branding work's logo
upload pushed ahead of the migration's. The test was wrong, not the code. It
is re anchored and the fix was checked by breaking the code two ways to
confirm it still catches the real regression.

## 7. Suggested order

No change to the order already agreed, with one split:

1. **Phase 1a**: `workout_sets` plus the backfill, the 50% rule, the set table.
2. **Phase 1b**: points, levels, badges, rewards screen, on top of 1a.
3. Phase 2 signup, no migration.
4. Phase 3 coach home.
5. Phase 4 schedule.
6. Phase 5 messages, extending form checks.
7. Phase 7 Stripe, last and alone.

Phase 1 is two jobs. Treating it as one is the main way this slips.
