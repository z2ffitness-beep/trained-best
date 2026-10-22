# Trained.best — live Supabase schema

Project `pkujygyibuiyyrryrswr`. Read directly from the running database on
2026-10-14. This is the real state, not what migrations or code imply.
There is no `supabase/` folder and no migration files: every change so far
was made by hand in the dashboard.

Use this to check section 6 of TRAINEDBEST-REDESIGN-SPEC.md against what
actually exists before proposing any migration.

## Things worth knowing before you plan

- **No Stripe anywhere.** No tables, columns or webhooks. `coaching_rates`
  and `client_billing` exist but hold zero rows and sit behind a feature
  flag that is off. Phase 7 starts from nothing, and the spec's question 3
  is answered: Connect is not set up.
- **Booking model is coach-opens-times.** `availability_slots` holds times a
  coach opens; `bookings` joins a slot to an athlete. The prototype has
  coaches booking sessions directly, which is the opposite. This is the
  conflict in spec question 2 and it needs a decision before phase 4.
  Note `availability_slots.session_type_id` is NOT NULL, so no time can be
  opened until the coach has created a session type.
- **`recurrence_id` on `availability_slots` is new and unused.** Added for
  repeating open times; nothing writes it yet.
- **Message deletion shipped at the database level.** `deleted_at`,
  `deleted_by`, `hidden_for` plus a `deleted_messages` archive, a guard
  trigger and column-level UPDATE grants. Whether the matching App.jsx code
  is deployed is unconfirmed.
- **`session_checkins` is not what the spec assumes.** It records only that
  a session was confirmed on a date. The four daily scores the spec wants
  (sleep, soreness, energy, stress) are on `progress_entries` instead,
  one row per entry_date.
- **Weights are stored in kg**, not lb. `profiles.weight_kg`,
  `progress_entries.weight_kg`. Set weights live inside
  `workout_logs.exercises` as jsonb, with no declared unit. The spec wants
  everything stored in lb. That is a data migration, not a column add.
- **No `unit_pref` or `theme_pref` on profiles.** Theme is currently kept in
  browser storage only.
- **No paused-workout storage.** Nothing in `workout_logs` can hold a
  part-finished session, the current exercise or elapsed time.
- **No points, badges, levels or shields tables.** `profiles.streak` is a
  single integer.
- **`programs.started_on` exists** (defaults to today), which the spec's
  "Week 1 starts today" rule can build on.
- **RLS is on for every table.** Most policies route coach access through
  `profiles.coach_id` or an `is_my_coach()` helper. Follow that pattern for
  anything new.
- **Roles are `athlete`, `athlete_coached` and `coach`.** Five of ten
  profiles are plain `athlete` with no coach, so "the roster" needs
  defining before the coach Home work in phase 3.

## Every table, column and policy

Row counts are planner estimates; `-1` means never analysed (effectively
empty or tiny). Backup tables are left out.

### athlete_groups  (0 rows, feature flag off)
```
id  uuid  NOT NULL  default gen_random_uuid()
coach_id  uuid  NOT NULL
name  text  NOT NULL
color  text
sort_order  integer  NOT NULL  default 0
created_at  timestamptz  NOT NULL  default now()
```
- `ALL` Coaches manage their own groups — using/check: `auth.uid() = coach_id`
- `SELECT` Athletes can view their own group — via `profiles.group_id`

### availability_slots  (2 rows, both in the past)
```
id  uuid  NOT NULL  default gen_random_uuid()
coach_id  uuid  NOT NULL
session_type_id  uuid  NOT NULL        <-- blocks opening a time with no session type
starts_at  timestamptz  NOT NULL
capacity_override  integer
cancelled_at  timestamptz
note  text
created_at  timestamptz  NOT NULL  default now()
recurrence_id  uuid                    <-- added 2026-10-09, nothing writes it yet
```
- `ALL` availability_coach_all — using/check: `coach_id = auth.uid()`
- `SELECT` availability_athlete_read — using: `is_my_coach(coach_id)`

### bookings  (1 row)
```
id  uuid  NOT NULL  default gen_random_uuid()
slot_id  uuid  NOT NULL
athlete_id  uuid  NOT NULL
coach_id  uuid  NOT NULL
status  text  NOT NULL  default 'booked'
uses_credit  boolean  NOT NULL  default true
created_at  timestamptz  NOT NULL  default now()
cancelled_at  timestamptz
```
- `SELECT` bookings_read — `athlete_id = auth.uid() OR coach_id = auth.uid()`
- `INSERT` bookings_coach_write — coach only, athlete must be on their roster
- `UPDATE` bookings_coach_update — coach only

Note: the app's `mapBooking` does NOT map `cancelled_at`, so in the client,
`status` is the only signal a booking is live. App code uses
`HOLDS_SPOT = ["booked", "attended"]`.

### client_billing  (0 rows, flag off)
```
athlete_id  uuid  NOT NULL
coach_id  uuid  NOT NULL
rate_id  uuid
paid_count  integer  NOT NULL  default 0
last_paid_at  timestamptz
next_due  date
created_at  timestamptz  NOT NULL  default now()
```

### coach_invites  (0 rows, unused — athletes join with profiles.invite_code)
```
id, coach_id, token, label, created_at, expires_at, revoked_at,
accepted_by, accepted_at
```

### coaching_rates  (0 rows, flag off — pricing actually lives on session_types)
```
id  uuid  NOT NULL  default gen_random_uuid()
coach_id  uuid  NOT NULL
label  text  NOT NULL
amount  numeric(10,2)  NOT NULL
cycle  text  NOT NULL
created_at  timestamptz  NOT NULL  default now()
```

### community_posts / community_replies / community_likes  (0 rows, flag off)

### credit_packs  (1 row)
```
id  uuid  NOT NULL  default gen_random_uuid()
athlete_id  uuid  NOT NULL
coach_id  uuid  NOT NULL
session_type_id  uuid
sessions_total  integer  NOT NULL
amount_cents  integer
status  text  NOT NULL  default 'paid'
source  text  NOT NULL  default 'manual'
note  text
created_at  timestamptz  NOT NULL  default now()
paid_at  timestamptz
expires_on  date
```
Credits remaining are COMPUTED (paid sessions_total minus credit-consuming
bookings), never stored. Don't add a counter.

### deleted_messages  (0 rows)
```
message_id  uuid  NOT NULL
athlete_id  uuid  NOT NULL
sender_id  uuid  NOT NULL
body  text  NOT NULL
created_at  timestamptz  NOT NULL
deleted_at  timestamptz  NOT NULL  default now()
deleted_by  uuid  NOT NULL
```
- no policies, deliberately: RLS on with none means only service_role reads it.

### exercise_photos  (66 rows)
```
name_key  text  NOT NULL        <-- normalised exercise name, the match key
display_name  text  NOT NULL
storage_path  text  NOT NULL
uploaded_by  uuid
created_at  timestamptz  NOT NULL  default now()
updated_at  timestamptz  NOT NULL  default now()
```
- `SELECT` any signed-in user; `INSERT`/`UPDATE`/`DELETE` coaches only.

### exercises  (4 rows)
```
id, owner_id, name, phase, pattern, has_media, created_at
```

### form_checks  (0 rows)
```
id  uuid  NOT NULL  default gen_random_uuid()
athlete_id  uuid  NOT NULL
coach_id  uuid
exercise_name  text
program_day  text
storage_path  text  NOT NULL
duration_seconds  integer
note  text
status  text  NOT NULL  default 'awaiting'
coach_reply  text
reviewed_at  timestamptz
created_at  timestamptz  NOT NULL  default now()
```
Videos live in a private bucket under the athlete's uuid, signed URLs only.
Phase 5 should extend this pattern rather than invent a new one.

### messages  (8 rows)
```
id  uuid  NOT NULL  default gen_random_uuid()
athlete_id  uuid  NOT NULL      <-- the thread key
sender_id  uuid  NOT NULL
body  text  NOT NULL
created_at  timestamptz  NOT NULL  default now()
read_at  timestamptz
deleted_at  timestamptz          <-- added 2026-10-09
deleted_by  uuid                 <-- added 2026-10-09
hidden_for  uuid[]  NOT NULL  default '{}'   <-- added 2026-10-09
```
- `SELECT`/`INSERT`/`UPDATE` for thread participants (athlete or their coach).
- UPDATE is additionally restricted by COLUMN GRANT to
  `read_at, deleted_at, deleted_by, hidden_for` only, and by a BEFORE UPDATE
  trigger `messages_guard_update` which enforces: sender/thread/created_at
  immutable, body not editable, only the sender may set deleted_at, you may
  only add or remove your own id from hidden_for. Phase 5 attachments must
  be added to that grant list or writes will fail silently-looking.

### notifications  (8 rows)
```
id, user_id (recipient), actor_id, kind, title, body,
data jsonb default '{}', read_at, created_at
```
Written by SECURITY DEFINER functions so an athlete can notify their coach.

### profiles  (10 rows: 1 coach, 4 athlete_coached, 5 athlete)
```
id  uuid  NOT NULL
role  text  NOT NULL            <-- 'athlete' | 'athlete_coached' | 'coach'
name  text  NOT NULL  default 'You'
photo_url  text
sport  text
sex  text
is_fighter  boolean  default false
injuries  text[]  default '{}'
goals  text[]  default '{}'
weight_kg  numeric              <-- KG, not lb
height_cm  numeric
streak  integer  default 0
coach_id  uuid
intake  jsonb                   <-- all onboarding answers
created_at  timestamptz  default now()
active_program_id  uuid
avatar  text
invite_code  text               <-- the coach's 6-char join code
group_id  uuid
```
- `SELECT` is open to ANY authenticated user. Worth reviewing before the
  redesign adds more personal fields here.
- No `unit_pref`, no `theme_pref`.

### programs  (13 rows)
```
id  uuid  NOT NULL  default gen_random_uuid()
athlete_id  uuid
coach_id  uuid
name  text  NOT NULL
weeks  integer  default 6
sport  text
days  jsonb  NOT NULL  default '[]'   <-- exercises live here; AI-invented names
created_at  timestamptz  default now()
rationale  text
started_on  date  default (now() at time zone 'utc')::date
```

### progress_entries  (0 rows)  <-- the real home of daily scores
```
id, user_id, weight_kg, body_fat, created_at,
sleep_quality smallint, sleep_hours numeric, soreness smallint,
energy smallint, stress smallint, note, entry_date date NOT NULL,
photo_path
```

### session_change_requests  (0 rows)
```
id, booking_id, athlete_id, coach_id, kind, requested_slot_id, note,
status default 'pending', coach_note, created_at, decided_at
```
Only a SELECT policy exists. No INSERT/UPDATE policy, so nothing can
currently be written from the client.

### session_checkins  (4 rows)  <-- NOT the 4-score check-in
```
id, user_id, date default CURRENT_DATE, program_day,
confirmed_at timestamptz NOT NULL default now()
```

### session_types  (1 row: "1-1", 60 min, in_person, 7000 cents)
```
id  uuid  NOT NULL  default gen_random_uuid()
coach_id  uuid  NOT NULL
name  text  NOT NULL
capacity  integer  NOT NULL  default 1     -- 1 private, 2+ semi-private
duration_min  integer  NOT NULL  default 60
delivery  text  NOT NULL  default 'in_person'  -- in_person | remote | in_app_live
price_cents  integer
location  text
active  boolean  NOT NULL  default true
created_at  timestamptz  NOT NULL  default now()
```
`in_app_live` is constrained to capacity 1: one-to-few live in-app services
would require Apple in-app purchase. in_person and remote are consumed
outside the app and carry no commission.

### workout_logs  (5 rows)
```
id  uuid  NOT NULL  default gen_random_uuid()
user_id  uuid  NOT NULL
date  date  NOT NULL  default CURRENT_DATE
program_day  text
duration  integer
mood  text
created_at  timestamptz  default now()
sets_completed  integer
sets_prescribed  integer
exercises  jsonb  default '[]'      <-- set data, no declared weight unit
notes  text
timed_seconds  integer
```

## Storage buckets

- exercise photos (public read for signed-in users)
- form checks (private, signed URLs, path prefixed by athlete uuid)
