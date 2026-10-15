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
| Test suite | `_verify/`. `sh _verify/run.sh` from the repo root. 38 suites, 903 assertions |
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
| 1a. Per-set storage | **Migration applied** (`002_workout_sets`). UI not built yet |
| 1b. Points, levels, badges | Not started |
| 2. Signup in 5 steps | Not started |
| 3. Coach home | Not started |
| 4. Schedule | Not started |
| 5. Messages with media | Not started |

Never applied, still only written down in the Drive doc `app-jsx-changes.md`:
**the coach roster sorted by next session** (`groupAthletesBySession`). The
message-deletion half of that doc did ship; this half did not.

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

## 6. Corrections to earlier documents

`BACKEND-PLAN.md` says "your workout logs do not store weight at all" and
concludes the new table can start empty. That was wrong. The backfill in
migration 002 recovered **29 real sets across 4 logs, all with weights**.
Had it started empty, bests and last-time's numbers would have treated those
sessions as if they never happened.

## 7. Next action

Build the phase 1a UI against the new table: set table columns SET / REPS /
WEIGHT / DONE, the weight box with minus and plus, fill-down that respects
hand-set values, the lb/kg switch reading `profiles.unit_pref`, and writing
sets to `workout_sets` on save. Then 1b.

Run `sh _verify/run.sh` before every commit. It was 903/903 on 15 Oct.
