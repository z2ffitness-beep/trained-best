# Trained.best: read this first

**Last updated 15 Oct 2026.** Anyone picking this project up, in any chat, on
any machine, starts here. Keep it current: if you change something in this
repo or the database, update this file in the same commit.

It exists because context was lost between 7 and 15 Oct and a week of work
had to be reconstructed from file timestamps.

---

## 1. Where things are

| Thing | Where |
|---|---|
| The code | `~/Desktop/trained-best-live` on Isaiah's Mac. Git repo, origin `github.com/z2ffitness-beep/trained-best` |
| The app file | `src/App.jsx` only. ~3.15 MB, one file |
| Working branch | `redesign-branding`. Not merged to main. Main is the deployed app |
| Live site | trained-best.vercel.app |
| Database | Supabase project `pkujygyibuiyyrryrswr` |
| Design handoff | `design-handoff/` (gitignored): spec, clickable prototype, 22 screens, and `CLAUDE-PROMPT.md`, the build brief |
| Test suite | `_verify/`. `sh _verify/run.sh` from the repo root. 43 suites, 1102 assertions |
| Media gap tracker | Live page, updated daily at 06:50 Toronto by a scheduled task. 220 exercises still flagged |

**Stale copies that must never be uploaded:** `~/vercelsim` (6 Oct, retired),
`~/Desktop/Claude outputs/App.jsx` (4 Oct), `~/Desktop/Claude outputs/tb-upload-set/App.jsx`
(6 Oct), `~/Downloads/AppJsx_OLD/App-2.jsx`. See `WHICH-APP-JSX-IS-LIVE.md` on
the Desktop.

## 2. How Isaiah wants to work

- Plain language. No jargon without explaining it.
- **Say back what he asked for before building it.** He has been burned by
  work going the wrong way.
- Tell him exactly which file goes where, every single time. He uploads by
  hand through the GitHub web UI.
- Be concise. Don't pad.
- Questions as multiple-choice options where possible.
- No em dashes in anything the user sees in the app.

## 3. Standing decisions

**Scope agreed 15 Oct: phases 1 to 6. Stripe (phase 7) is out.** Billing
stays manual for now.

**Checkpoints: only stop when genuinely necessary.** Write up each phase and
keep going; don't wait for a reply unless something would change existing
behaviour.

**Migrations: additive-only is pre-approved.** Adding tables and columns with
RLS may be run without asking. Anything that drops or alters an existing
column stops and asks. Every migration is still a numbered `.sql` file here.

Taken 14 Oct, in `BACKEND-PLAN.md`:
1. Build the prototype's behaviour in full, not a reduced version.
2. Per-set storage is a table, not richer jsonb.
3. Booking works both ways: coach opens times AND coach books directly AND
   client requests a time.
4. Coachless athletes appear nowhere on a coach's screens.
5. Branding first, then phase 1.

## 4. Status

| Phase | State |
|---|---|
| 6. Coach branding | **Done.** `profiles.business_name/brand_color/logo_path`, `coach-logos` bucket, UI on this branch |
| Message deletion | **Done.** Hide for me, delete for everyone, tombstones, realtime |
| 1a. Per-set storage | **Migration applied and the UI is built.** Set table, lb/kg, fill-down, minus/plus, best-so-far placeholder, rows written to `workout_sets`, `counts` and `is_pr` filled |
| 1a. Stop and save | **Done.** Red Stop button, three-way sheet, paused workout stored with no expiry, the card on Today, "Paused on [day]" on the Plan |
| 1a. Typo warning | **Done.** More than double the other sets is queried, and barred from being a personal best |
| 1a. lb/kg in My Info | **Done.** Same writer as the table header |
| 1a. Appearance | **Done** (it already existed). Now stored in `profiles.theme_pref`, with `intake.theme` kept as the pre-mount copy |
| 1b. Points, levels, badges | **Done.** Levels (one per 5 counted), perfect-week streaks with one shield a month, 13 badges, all derived from the logs and nothing stored |
| 1b. Rewards screen | **Done.** Medal, points counting up, week dots, level bar, badges, new bests, See summary. Reduced motion skips the movement AND the waiting |
| 1b. Print sheet | **Done.** One A4 page, black and white, from the home card and the Plan |
| **Phase 1 overall** | **Complete**, except pull-forward, which Isaiah moved to the Plan rebuild |
| Plan rebuild | Not started. Week ring, 7-day strip, day list with Done/Missed/Moved/Paused/Skipped, Move, Skip, Do it today, add a workout. **"Pulled-forward goes back" belongs here** - Isaiah chose 15 Oct to do it with the rebuild rather than bolt it onto the current screen |
| 1b. Points, levels, badges | Not started |
| 2. Signup in 5 steps | Not started |
| 3. Coach home | Not started |
| 4. Schedule | Not started |
| 5. Messages with media | Not started |

Never applied, still only written down in the Drive doc `app-jsx-changes.md`:
**the coach roster sorted by next session** (`groupAthletesBySession`). The
message-deletion half of that doc did ship; this half did not.

## 4b. Decisions Isaiah made on 15 Oct

- **The 50% rule is split.** The spec says a workout counts toward streak,
  level, points and badges only if half its sets are ticked. The app already
  scored short sessions. Points stay as they were; streak and the
  perfect-week bonus follow the spec. Reasoning: a score of zero for an
  honest four-of-twelve session teaches people to stay home or to tick sets
  they did not do, whereas a streak a two-set session keeps alive means
  nothing. Do not quietly change either half.
- **Pull-forward waits for the Plan rebuild.** "Do it today instead" does not
  exist, so neither does the rule about a pulled-forward workout going back
  to its own day when stopped. Both land together with the Plan screen.

## 5. Traps that have already cost time

- **`messages` has column-level UPDATE grants.** Only `read_at`,
  `deleted_at`, `deleted_by`, `hidden_for` can be written, and a trigger
  blocks edits to the body. A new message column must be added to that grant
  or writes fail looking like a bug, not a permission error. This will bite
  in phase 5.
- **A set now lives in two places**: `workout_sets` rows and the older
  `workout_logs.exercises` jsonb. Decide per screen which one is read. Writing
  both and reading whichever is handy is how they drift.
- **Nav is load bearing.** Eight places link to the workout route. When the
  Workout tab was merged into Program, the route stayed and only the bar
  entry went. Do the same for any further tab change.
- **The spec's streak is not the app's streak.** The app counts consecutive
  days trained; the spec counts consecutive Perfect Weeks. Shipping the
  spec's version changes every athlete's number. Tell them.
- **The sandbox is not the Mac.** Commands run in an isolated Linux VM with
  Isaiah's Desktop mounted. Git there has no identity and no GitHub
  credentials, and cannot delete files without permission, which leaves
  `.git` lock files that break his own git. Identity is now set repo-locally.
  **Pushing must be done by Isaiah**: `cd ~/Desktop/trained-best-live &&
  git push origin redesign-branding`.
- **`availability_slots.session_type_id` is NOT NULL.** A coach-made direct
  booking still needs a session type.
- **`session_change_requests` has only a SELECT policy.** It needs INSERT and
  UPDATE before phase 4 can use it.
- **The draft, the timer and a paused workout are three different things.**
  The session draft (`tb_session_draft`) is a crash net and expires after 14
  hours. The stored timer (`tb_session_timer`) is one stopwatch. A paused
  workout (`tb_paused_workout`) is a deliberate Stop, has no expiry, and is
  what the home screen asks about. All three are keyed by
  `sessionIdentity(program, day)` and NOT by `day.id`, which is a fresh
  random string on every launch. Two bugs of exactly that shape were fixed on
  15 Oct; if a restore ever silently does nothing, check the key first.
- **`device_commit_files` can write a stale copy** when the same
  `stagedPath` was committed earlier in a session. Use a fresh filename, or
  `force`, and check with md5sum. It silently cost a test file once.
- **`src/index.css` is the stylesheet that is built.** `main.jsx` imports it.
  There is a BYTE-IDENTICAL `index.css` at the repo root that nothing
  imports or links; editing it changes nothing at all. The rewards
  animations went in there first and did nothing. Same shape as the stale
  `src/App_1.jsx`, `App_2.jsx`, `App_22.jsx`, `App_23.jsx`, `index_1.css`
  and `index_OLD.css` sitting in `src/` - none of them are built, all of
  them are a trap for a hand upload. Worth deleting, but that is Isaiah's
  call, not a thing to do quietly.
- **`_verify/hooks.mjs` earns its keep.** It caught a `useState` below an
  early return in `AthleteProgram` during the print-sheet work - the
  "Rendered fewer hooks than expected" crash, before it ever ran.

## 6. Corrections to earlier documents

`BACKEND-PLAN.md` says "your workout logs do not store weight at all" and
concludes the new table can start empty. That was wrong. The backfill in
migration 002 recovered **29 real sets across 4 logs, all with weights**.
Had it started empty, bests and last-time's numbers would have treated those
sessions as if they never happened.

## 7. What phase 1a's UI actually does now

Three commits on `redesign-branding`, 15 Oct:

- **`unit_pref` is the LIFTING unit.** `intake.weightUnit` stays the
  bodyweight one and the profile editor still owns it. They used to be the
  same setting, which left anyone who weighs in kilos and lifts in pounds
  with no way to say so.
- **Pounds are the store of record.** `displayWeight` converts on the way
  out and rounds kilos to the nearest half, because plates come in 1.25 kg
  pairs. Every comparison - bests, PRs, totals - happens in pounds, or a
  110 kg squat ranks below a 225 lb one.
- **The set table** replaced the stack of cards. SET / REPS / WEIGHT / DONE,
  the lb/kg switch in the WEIGHT heading, minus and plus at 5 lb or 2.5 kg,
  the placeholder is their best so far. Laid out against a 320px screen, not
  guessed at.
- **Fill-down**: a weight typed into one set copies to every set below it,
  except ones already ticked (history) and ones typed by hand (a decision).
  Clearing a box clears only that box. The hand-set flags are saved in the
  session draft and end up in `workout_sets.manually_set`.
- **On finish**: one `workout_sets` row per prescribed set in pounds,
  `workout_logs.counts` from the 50% rule, and `is_pr` on the one set per
  movement that beat the standing best. Offline sessions carry their set
  rows into the queue.

## 8. Next action

**Phase 1 is done.** What is left, in order:

1. **The Plan rebuild.** Week ring, 7-day strip, day list showing Done /
   Missed / Moved from / Paused / Skipped / Rest, and tapping a day to Move
   it, Skip it, Do it today instead, or add a workout. **"Pulled-forward
   goes back" lands here** - it is the rule that a workout pulled to today
   with "Do it today instead" and then stopped returns to its own planned
   day, still paused, while one moved with Move stays where it was moved.
   This is also where "missed" becomes a real concept, at which point the
   Caught Up badge can become the spec's Comeback.
2. **Phase 2: signup in 5 steps**, three paths. No migration.
3. **Phase 3: coach home** and athlete detail (4 tabs), adjust plan, My Own
   Training.
4. **Phase 4: schedule.** Month calendar, direct booking, requests,
   no-show. Needs INSERT and UPDATE policies on `session_change_requests`.
5. **Phase 5: messages with media**, extending `form_checks`. Mind the
   column-level UPDATE grant on `messages`.

Stripe stays out.

Run `sh _verify/run.sh` before every commit. It was 1102/1102 on 15 Oct.
Isaiah pushes: `cd ~/Desktop/trained-best-live && git push origin redesign-branding`
