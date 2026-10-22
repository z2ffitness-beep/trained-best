# Trained.best redesign: what touches the back end

Checked against the live database on 2026-10-14, not against the spec's
assumptions. Agree this before any code is written or anything goes to GitHub.

Nothing here has been run. No migration is applied until you say so.

---

## The headline finding

**Your workout logs do not store weight at all.**

`workout_logs.exercises` is jsonb shaped like this, one entry per exercise:

```json
{ "name": "Trap Bar Deadlift", "phase": "compound", "reps": "4",
  "rpe": 8, "setsCompleted": 0, "setsPrescribed": 4 }
```

Per exercise, not per set. `reps` is free text ("10 each direction",
"20 meters", "45s each leg"). There is no weight field anywhere, and no
record of which individual set was ticked.

Two consequences, one good and one not:

**Good:** the kg-to-lb migration the spec worries about does not exist.
There is no stored set weight to convert. Profile body weight is in kg and
stays that way; it is a different number from lifted weight and nothing in
the spec says otherwise. The risky data migration is off the table.

**Not good:** nearly all of phase 1 needs per-set storage that has no home
today. The weight box, fill-down, personal bests, the typo warning, "every
set logged" and the print sheet all assume a row per set. That is the real
phase 1 back-end job, and it is bigger than the spec implies.

---

## Phase by phase

### Phase 1: workout screen and rules

| Spec item | Back end | Notes |
|---|---|---|
| Set table, weight box, fill-down | **New** | Needs per-set rows: set number, reps done, weight in lb, done flag, `manually_set`, `is_pr` |
| lb/kg switch saved to profile | **New column** | `profiles.unit_pref` text default `'lb'` |
| Display settings System/Light/Dark | **Already built** | Theme functions exist in App.jsx. Only the saved preference is new: `profiles.theme_pref` |
| Stop and save / paused workouts | **New** | Needs somewhere to hold a part-finished session: sets so far, current exercise, elapsed seconds, which day it was stopped on |
| Pulled-forward goes back | **New** | Needs `original_day` and `pulled_from_day` on whatever holds a planned session |
| 50% rule for rewards | **New** | Derivable once sets are rows. Store the decision as `counts` so it is not recomputed differently in two places |
| Points, levels, badges, Perfect Week | **New** | A points ledger plus earned badges. Level and streak are computed, not stored |
| New best + typo warning | **New** | Best per athlete per exercise. Flagged sets excluded |
| Print sheet | **No back end** | Pure front end |

**Decision needed:** per-set data as a new `workout_sets` table, or as richer
jsonb inside `workout_logs.exercises`. My recommendation is a table. Bests,
"every set logged", and adherence all become simple queries, and your
existing jsonb is already hard to query. A table is more work now and much
less later.

### Phase 2: signup

| Spec item | Back end | Notes |
|---|---|---|
| 5 steps instead of 15 | **None** | Answers already land in `profiles.intake` jsonb |
| Week 1 starts today | **Already possible** | `programs.started_on` exists and defaults to today |
| Days before signup never missed | **None** | Front end, reads `started_on` |

Lightest phase. No migration.

### Phase 3: coach Home and athlete detail

| Spec item | Back end | Notes |
|---|---|---|
| 4-week adherence, roster dots | **None** | Computed from workout logs |
| Needs you flags | **Mostly none** | Missed, paused, low check-ins all derivable. Pain reports and form checks need storing |
| Wins / kudos | **New** | Kudos is a message kind plus points. Fits phase 1's ledger |
| Check-ins tab | **Already exists** | On `progress_entries`, which already has sleep, soreness, energy, stress. The spec assumes these are new. They are not |

**Decision needed:** what counts as "your roster". Five of your ten profiles
are role `athlete` with no coach. They are not yours, but nothing currently
excludes them.

### Phase 4: Schedule

| Spec item | Back end | Notes |
|---|---|---|
| Month calendar, agenda | **None** | Reads existing slots and bookings |
| Attended / no-show | **Already supported** | `bookings.status` is free text; the app uses `booked` and `attended`. Add `no_show` |
| Pack session used on attended | **Already correct** | Credits are computed from bookings, never counted. Do not add a counter |
| In person vs virtual | **Partly** | `session_types.delivery` has `in_person`, `remote`, `in_app_live`. A video link field is new |
| Repeating sessions | **Ready** | `availability_slots.recurrence_id` was added on 9 October and nothing writes it yet |

**The conflict.** Your live app has coaches opening times that clients book.
The prototype has coaches booking sessions directly. These are opposite
models. Also `availability_slots.session_type_id` is NOT NULL, so no time can
exist without a session type. **This is yours to decide and it blocks phase 4.**

### Phase 5: messages with media

| Spec item | Back end | Notes |
|---|---|---|
| Photo and video both ways | **New** | Attachment rows: type, storage path, poster |
| Note pinned to a second in a video | **New** | `video_note_at_seconds`, `reply_to_message_id` |
| Film a set for Coach | **Already exists** | `form_checks` plus a private bucket with signed URLs. Extend it, do not rebuild it |
| Welcome video | **New** | Path plus an auto-send setting on the coach profile |

**Trap worth knowing.** `messages` now has column-level UPDATE grants: only
`read_at`, `deleted_at`, `deleted_by`, `hidden_for` can be written, and a
trigger blocks edits to the body. Any new message column must be added to
that grant or writes will fail in a way that looks like a bug, not a
permission error.

### Phase 6: coach branding

| Spec item | Back end | Notes |
|---|---|---|
| Logo, business name, colour | **New** | Three columns on the coach profile plus a storage bucket for logos |

Small and self-contained. Good candidate to do early if you want a visible
win.

### Phase 7: billing with Stripe

**Nothing exists.** No Stripe anywhere in your code or database.
`coaching_rates` and `client_billing` are empty and sit behind a flag that
is off. Actual pricing lives on `session_types.price_cents`.

So the spec's question 3 is answered: Connect is not set up, because Stripe
is not set up.

This is the largest phase by a distance: Connect Express onboarding,
products and prices, checkout, the billing portal, webhooks, and a Supabase
Edge Function to hold the secret key. It also has real money consequences if
it is wrong.

**Recommendation: do this last and on its own.** Nothing else depends on it.

---

## What I would actually do

1. **Phase 6 first** (branding). Small, visible, no risk, proves the branch
   and preview flow works end to end.
2. **Phase 1 next**, but split it: the per-set storage and the 50% rule
   first, then points and badges on top. It is two jobs, not one.
3. **Phase 2** (signup). No migration.
4. **Phase 3**, after you decide what the roster means.
5. **Phase 4**, after you decide the booking model.
6. **Phase 5**, extending form checks rather than starting over.
7. **Phase 7** last, alone.

## Three decisions only you can make

1. Per-set storage: new table, or jsonb? (I say table.)
2. Booking: coaches open times for clients, coaches book directly, or both?
3. Roster: do coachless athletes appear anywhere on a coach's screens?

## Rules for every migration from here

- Written as a numbered `.sql` file, run in order, never by hand in the
  dashboard. You have no migration history and three leftover backup tables
  because of hand-run changes.
- Add columns and tables only. Never drop or change an existing column.
- RLS on every new table, following the existing pattern: coach access
  through `profiles.coach_id` or `is_my_coach()`.
- Each one reviewed before it runs.

---

# DECISIONS MADE (2026-10-14) — these are settled, build to them

**1. Scope: build the prototype's behaviour in full.**
Sets, reps, weight, lb/kg, the lot. Not a reduced version. This confirms the
per-set storage job below is required, not optional.

**2. Per-set storage: a new `workout_sets` table.**
One row per set: workout log, exercise name, set number, reps done,
`weight_lb`, done flag, `manually_set`, `is_pr`. Existing
`workout_logs.exercises` jsonb stays exactly as it is and keeps working.
Nothing is migrated or removed. The five existing logs simply have no set
rows, which is correct, since they never recorded any.

**3. Booking works BOTH ways.**
- Keep what exists: a coach opens times, clients book them.
- Add: a coach books a client directly into a session.
- Add: a client requests a time that is not currently open, and the coach
  accepts or declines.

This is additive. No existing behaviour is replaced. `session_change_requests`
already exists for the request-and-decide pattern and currently has only a
SELECT policy, so it needs INSERT and UPDATE policies before it can be used
from the app.

Note `availability_slots.session_type_id` is NOT NULL. A coach-made direct
booking still needs a session type, so either reuse one or the UI must create
one first.

**4. Coachless athletes are invisible to coaches.**
A profile with `coach_id` null appears nowhere on any coach screen. The
roster is `profiles where coach_id = <the coach>`. No grey section, no
"unassigned" list.

**5. Order: branding first.**
Phase 6 first as a small proving run for the branch-and-preview flow, then
phase 1 in full, then the rest.

## Still open

Nothing blocking. Build can start.
