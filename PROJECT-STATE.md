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
| Test suite | `_verify/`. `sh _verify/run.sh` from the repo root. 45 suites, 1194 assertions |
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
| Plan rebuild | **Done.** `session_moves` (migration 003), `planForWeek`, the ring/strip/list panel, the day action sheet, the missed card on Today, "pulled-forward goes back", and "I did it on Mon, log it" |
| `src/` and the repo root | **Cleaned 15 Oct.** Seven stale duplicates deleted. `src/` holds exactly five files |
| `api/chat.js` | **Fallback added.** A retired model id now retries once on a model we know exists, instead of taking every program generation down at once |
| 2. Signup in 5 steps | **Started.** `SIGNUP_KEYS`, `SIGNUP_V2_STEPS` and the contract test are in; `SIGNUP_V2` is **false** and the live flow is untouched. The screens themselves are the next job |
| 3. Coach home | **Not started.** Coach Home and athlete detail (4 tabs), adjust plan, My Own Training |
| 4. Schedule | **Not started.** Month calendar, direct booking, requests, no-show |
| 5. Messages with media | **Not started.** Extends `form_checks` |
| 7. Billing with Stripe | **Excluded** by Isaiah, 15 Oct |

**In one line: the athlete side is built, the coach side is not.** Phases 1
and 6 are done and the Plan rebuild with them; 2 is started; 3, 4 and 5 are
untouched.

Never applied, still only written down in the Drive doc `app-jsx-changes.md`:
**the coach roster sorted by next session** (`groupAthletesBySession`). The
message-deletion half of that doc did ship; this half did not.

## 4b. Decisions Isaiah made on 15 Oct

- **"I did it on Mon, log it" is one tap and counts for nothing.** It writes
  a log on the day it happened with no sets and no weights, `counts: false`.
  It buys the truth about the calendar - the session stops being missed, the
  coach stops seeing a gap, nobody is nagged about a workout they did - and
  nothing else. An athlete who cannot remember what they lifted has not
  earned the same credit as one who wrote it down, and inventing numbers to
  make the maths tidy would poison every best and every trend downstream.
  The Plan labels it "Done, not logged" rather than plain "Done".

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
- **`src/index.css` is the stylesheet that is built.** `main.jsx` imports
  it. There used to be a byte-identical `index.css` at the repo ROOT that
  nothing imported, and the rewards animations went in there first and did
  nothing at all. **Deleted on 15 Oct**, along with the stale
  `src/App_1.jsx`, `App_2.jsx`, `App_22.jsx`, `App_23.jsx`, `index_1.css`
  and `index_OLD.css` - none of them were imported by anything, all of them
  were a trap for a hand upload. `src/` now holds exactly five files:
  `App.jsx`, `exerciseImages.js`, `index.css`, `main.jsx`,
  `supabaseClient.js`. If a duplicate ever reappears there, it is a mistake,
  not a backup - git is the backup.
- **`_verify/hooks.mjs` earns its keep.** It caught a `useState` below an
  early return in `AthleteProgram` during the print-sheet work - the
  "Rendered fewer hooks than expected" crash, before it ever ran.
- **`chat.js` at the repo root is NOT the file that runs.** `api/chat.js`
  is. They had drifted 265 lines apart and each had something the other
  lacked. The one thing worth keeping - a 404 retry on a known model - was
  ported into `api/chat.js` on 15 Oct. The root copy is still there, left
  deliberately until the fallback has been seen working in production, and
  should be deleted after that.
- **Measure layouts at 320px rather than reasoning about them.** Three real
  bugs came out of doing it: the workout header truncating the session name
  to "D...", the level bar rendering as an empty track because an `<i>` is
  inline, and the Plan's day strip trying to fit "Upcoming" into 30px.

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

## 7b. Picking up phase 2

The groundwork is done and it is the part that was easy to get wrong. Read
`SIGNUP_KEYS` in `src/App.jsx` before writing a line of UI.

**The one rule.** The new screens are a different arrangement of inputs over
the SAME data model. `writeProfileAndContinue`, `buildMeFromOnboarding` and
`buildAIPrompt` all read the answers by key and none of them cares which
screen a key was typed on. Keep every key and nothing downstream changes at
all. Drop one and it fails silently - `"🥊 Sport / Focus"` is the dangerous
one, because without it every generated programme becomes General Fitness
with no error anywhere.

`signup.test.mjs` enforces this: it reads the keys `buildAIPrompt` and the
profile write actually use and fails if any is missing from `SIGNUP_KEYS`.

**What is left:**

1. Four new step bodies, in `OnboardingStepBody`: `👤 About You`,
   `🎯 Your Goal`, `📅 Your Week`, and the new one-screen `🩹 Injuries`.
   Each sets the keys `SIGNUP_KEYS` lists for it.
2. The coach path's two screens: `🏅 Your Coaching Business` and
   `📩 Invite Your Athletes`.
3. The coached path's coach card: once six characters are entered, show the
   logo, business name, coach name and "by Trained.Best" before the account
   screen.
4. Session style stops being asked. Derive the split from
   `trainingDays.length` where the old `"🧩 Session Style"` answer was read.
5. The plan-ready screen: what was chosen, then this week's workouts,
   scheduling from today on only.
6. Flip `SIGNUP_V2` to true, in its own commit, and delete the v1 lists in
   the one after - not the same one, so the revert stays a one-liner.

## 8. Next action

**Phase 1 and the Plan rebuild are both complete.** What is left:

1. **Phase 2: signup in 5 steps** - started, see section 7b.
2. **Phase 3: coach home** and athlete detail (4 tabs), adjust plan, My Own
   Training.
3. **Phase 4: schedule.** Month calendar, direct booking, requests,
   no-show. Needs INSERT and UPDATE policies on `session_change_requests`.
4. **Phase 5: messages with media**, extending `form_checks`. Mind the
   column-level UPDATE grant on `messages`.

Stripe stays out.

Two small things worth doing once this has been seen running:

- The **Caught Up** badge can become the spec's **Comeback**, now that
  "missed" is a real concept rather than an approximation of one.
- Delete the root `chat.js` once the 404 fallback has been seen working in
  production.

Run `sh _verify/run.sh` before every commit. It was 1187/1187 on 15 Oct.
Isaiah pushes: `cd ~/Desktop/trained-best-live && git push origin redesign-branding`
