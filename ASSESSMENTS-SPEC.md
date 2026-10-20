# Phase 7: assessments

Agreed with Isaiah 18-20 Oct, by popup. Not built yet. This file is the
spec; it lives in the repo so it does not rot in a chat log.

## Why

Every other fitness app does programming and logging. Almost none closes
the loop on "where is this person actually at, and has it moved". A coach
who wants to know ends up with a folder of PDFs, a spreadsheet, or
nothing.

## The honest limit, built in from the start

Movement screens are good for **tracking one person's change over time**
and as a **shared language with a client**. They are weak as injury
predictors - the research on FMS-style screens does not support that
claim, and neither will this app.

Two rules, not negotiable later:

1. **Never compare an athlete to a population.** No percentiles, no
   "below average for your age". The app has no normative data it has any
   right to, and inventing one is how a fitness app starts making medical
   claims.
2. **Never say "at risk of injury."** The app reports what was seen and
   whether it changed. The coach interprets.

Everything the app says should survive being read out loud to the client.

## The shape: a library, not a battery

The first draft was a fixed list of eleven tests. Isaiah's addition -
force plates, VBT, heart rate, and coaches adding their own methods -
changes it into a **test library**:

- **Built-in, no kit.** On by default. Any coach, any gym, a hallway.
- **Built-in, needs kit.** Shipped but hidden until the coach switches
  them on. A coach with no force plate never sees a force plate test.
- **Custom.** The coach writes their own, from scratch or by copying a
  built-in and editing it.

Once a test is "a thing with a definition", force plates and VBT stop
being special cases - they are entries with different kit and different
numbers. It also takes the app's author out of the loop: a coach who
wants a test nobody thought of adds it in two minutes.

## A test definition

```
key              stable slug for built-ins ('overhead_squat', 'cmj'),
                 'custom:<uuid>' for a coach's own
name             'Countermovement jump'
category         'screen' | 'performance' | 'kit'
equipment        ['force plate']        -- [] means nothing needed
needs_opt_in     true for kit tests
sided            false | true           -- true = scored per side
flags            ['knees cave in', ...] -- the checklist, [] if none
metrics          [ { key, label, unit, higher_is_better } ]
protocol         markdown: setup, what counts as a valid rep, common errors
owner_id         null for built-ins, the coach for custom
```

A test may have flags, metrics, or both. The overhead squat is flags
only. A broad jump is one metric. A countermovement jump on a plate is
four or five metrics from one effort.

### `higher_is_better` is load bearing

Three values, and the third is the one that gets forgotten:

- `true` - ankle wall test, jump height, mean velocity
- `false` - sprint time, resting heart rate, contact time, **asymmetry**
- `null` - **context, not a score.** The load a VBT rep was performed at
  is not better high or low; it is the thing the velocity is relative to.
  A metric with `null` is recorded and displayed and never described as
  improved or declined.

Without this the app will cheerfully tell somebody a slower sprint is an
improvement. A coach who sees that once stops trusting the whole feature,
and they would be right to.

## The built-in catalogue

### No kit - on by default

Kit for the whole set: a tape measure, a wall, a step, a phone timer,
and tape or chalk for a mark.

**Movement screen** (flags only; the coach ticks what they see, nothing
is typed):

| Test | Sided | Flags |
|---|---|---|
| Overhead squat | no | front: feet turn out · knees cave in · weight shifts left · weight shifts right. side: heels lift · excessive forward lean · arms fall forward · low back arches · low back rounds at the bottom |
| Single-leg squat | yes | knee caves in · hip drops on the free side · trunk leans · loses balance · cannot reach depth |
| Overhead reach at a wall | no | ribs flare · low back lifts off the wall · elbows bend · cannot get arms to the wall |
| Active straight leg raise | yes | opposite leg lifts · low back lifts · knee bends · under 45 degrees |

**Performance** (metrics):

| Test | Sided | Metric | Unit | Higher better |
|---|---|---|---|---|
| Ankle wall test | yes | distance | cm | yes |
| Broad jump | no | distance | cm | yes |
| Single-leg hop for distance | yes | distance | cm | yes |
| Push-ups to failure | no | reps | reps | yes |
| Side plank hold | yes | time | s | yes |
| Single-leg balance, eyes closed | yes | time | s | yes |
| Wall sit | no | time | s | yes |

### Needs kit - shipped, off until switched on

**Force plate / jump mat**

| Test | Metrics |
|---|---|
| Countermovement jump | jump height (cm, higher) · peak force (N, higher) · RSI-modified (ratio, higher) · left-right asymmetry (%, **lower**) |
| Drop jump | RSI (ratio, higher) · contact time (s, **lower**) · jump height (cm, higher) |
| Isometric mid-thigh pull | peak force (N, higher) · relative peak force (N/kg, higher) |

**Velocity-based training**

| Test | Metrics |
|---|---|
| Load-velocity profile | estimated 1RM (kg, higher) · load tested (kg, **context**) |
| Mean concentric velocity at load | mean velocity (m/s, higher) · load (kg, **context**) |
| Velocity loss across a set | velocity loss (%, **context** - it is a prescription, not a score) |

**Heart rate**

| Test | Metrics |
|---|---|
| Resting heart rate | bpm, **lower** |
| HRV (rMSSD) | ms, higher |
| 3-minute step test | recovery HR at 1 min (bpm, **lower**) |
| Submaximal HR at fixed workload | bpm, **lower** |

HRV carries a note in its protocol: a single reading is noisy, the trend
is the signal, and the app must not flag one bad morning as a decline.

## Custom tests

Two routes, because starting from blank every time is why custom-test
builders go unused:

- **From scratch** - name, category, kit, sided, flags, metrics,
  protocol.
- **Copy and edit** - duplicate any built-in or any of the coach's own.
  This is how most custom tests actually get made: somebody wants the
  overhead squat with one extra thing to look for.

A custom test belongs to the coach, is reusable across their whole
roster, and gets a `custom:<uuid>` key so it can never collide with a
built-in.

**Built-in definitions live in CODE, not in the database.** They version
with the app, so improving a protocol is a deploy rather than a
migration, and they cannot drift from what the code expects. Only custom
tests get rows. A result stores its `test_key` as plain text and renders
from whichever source owns it.

**Results must survive their definition changing.** Flags are stored on
the result as text, so a flag removed from a definition still renders on
the assessment where it was ticked. An old result is a record of what
happened, not a view onto the current definition.

## Batteries

A **battery** is which tests an athlete gets.

- **A default battery for the roster.** Set once.
- **Overridable per athlete.** A fighter, or somebody coming back from a
  knee, gets theirs adjusted.

Without this, every assessment starts by picking from a list of forty,
and two assessments of the same person are not comparable because the
picks differed.

## Where it lives

- **Athlete detail -> Progress tab.** Already exists, already the right
  tab. An Assessments section above the existing progress entries.
- **Coach Home -> "Who needs you".** A new row kind, `retest_due`. This
  is the "tells the coach automatically" part of the request, and it is
  already built: `coachAttention` needs one more case. Rank after `quiet`
  and before `due_today`, tone `warn` - it has a deadline and the coach
  can act, but it is not blocking the athlete from training.
- **Run Assessment screen.** One test at a time, big targets, a number
  pad where a measurement is needed, protocol collapsible so an
  experienced coach skips it. It gets used standing up in a gym with a
  client in front of you and a phone in one hand. That is the design
  constraint, not a nice-to-have.
- **Coach Profile -> Tests.** The library: switch kit tests on, add
  custom ones, set the default battery.
- **Athlete side -> Progress.** Their own results, the protocol when
  self-testing, and "your coach has asked for a retest" when one is due.

## Reading a result

Lead with the two things that are true without a reference population:

1. **Asymmetry**, where the test is sided, as a percentage difference.
   Six of the eleven no-kit tests are sided on purpose. "Your right ankle
   is 4cm and your left is 7cm" is a fact about this person, actionable,
   and needs nobody else's data.
2. **Change since last time**, per metric, using `higher_is_better` to
   decide which direction counts as better.

Never a percentile. Never a grade.

The asymmetry threshold worth flagging is a **named constant**, not a
number buried in a component - Isaiah will want to argue with it. Pencilled
at 10-15%, pending his number.

## Data model, migration 007 (additive)

```
assessments
  id            uuid pk
  athlete_id    uuid not null
  coach_id      uuid                   -- null for a self-guided athlete
  taken_on      date not null
  taken_by      uuid not null          -- who scored it
  source        text  'coach' | 'self'
  retest_due    date                   -- defaulted from the programme block
  notes         text
  created_at    timestamptz

assessment_results
  id            uuid pk
  assessment_id uuid not null -> assessments
  test_key      text not null          -- 'overhead_squat' | 'custom:<uuid>'
  side          text  'left' | 'right' | 'both'
  flags         text[]                 -- what was ticked, stored not referenced
  metrics       jsonb                  -- { "jump_height": 41.2, "load": 100 }
  media_path    text                   -- reuse the message-media shape
  media_kind    text  'image' | 'video'

custom_tests
  id            uuid pk
  coach_id      uuid not null
  definition    jsonb not null         -- the test definition above
  archived_at   timestamptz            -- never delete: results point at it
  created_at    timestamptz

coach_test_settings
  coach_id      uuid pk
  enabled_kit   text[]                 -- built-in kit tests switched on
  default_battery text[]               -- test keys
athlete_battery
  athlete_id    uuid pk
  tests         text[]                 -- null/absent = use the coach's default
```

`metrics` is jsonb rather than a row per metric because custom tests have
metrics nobody can predict, and a fixed column set cannot hold them.
Trends read `metrics->>'jump_height'`, which Postgres handles fine.

A custom test is **archived, never deleted** - results point at its key,
and deleting it would turn old assessments into orphans.

RLS: the athlete's own rows plus the coach's athletes, same shape as
everything else. A coach inserting for an athlete writes a row where
`athlete_id <> auth.uid()`, which needs a policy like the one
`bookings_coach_write` already has.

**Traps that apply here** (all learned the hard way - PROJECT-STATE
section 5):

- Any column-level grant on these tables means a new column must be added
  to the grant or writes fail looking like a bug, not a permission error.
- The coach's device loads nothing automatically. These tables must be
  added to the coach's data load or every coach screen reads them empty.
- Verify migration 007 with `_verify/sql` before it goes anywhere near
  production, and run the policy checks as a **non-superuser**.

## Build order

Smallest useful thing first, and prove each layer before building on it.

1. **Migration 007 + its SQL exercise.** Prove it against a throwaway
   Postgres before any UI exists.
2. **The pure functions**, which are the whole feature:
   `TESTS` (the built-in catalogue as data) · `assessmentAsymmetry` ·
   `assessmentChange` (respecting `higher_is_better`, including `null`) ·
   `retestDueFor(program)` · `batteryFor(athlete, coachSettings)`.
   Test these hard, mutation-test them.
3. **`retest_due` into `coachAttention`.** Smallest change, immediate
   value, and it is the thing Isaiah asked for by name.
4. **Run Assessment screen**, no-kit tests only.
5. **Results on the Progress tab.**
6. **The library screen**: kit opt-in, custom tests, default battery.
7. **Athlete self-test**, last. It is the only part needing video review,
   and everything above is useful without it.
