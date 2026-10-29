// What a finished session writes to the database.
//
// The log's jsonb keeps the session as it was typed, which is the honest
// record and the wrong shape for every question worth asking: what has this
// athlete done on this movement, is it going up, which set was the best one.
// workout_sets is the same numbers in a form Postgres can index — one row per
// prescribed set, always in pounds.
//
// Two flags ride along. `counts` decides whether the session feeds the
// streak, the level, the points and the badges, and it is stored rather than
// recomputed, because a coach editing a program must not retroactively take
// away a streak somebody earned. `is_pr` marks the one set that beat
// everything before it — one per movement per session, never three medals
// for one achievement.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  { name: "LB_PER_KG", kind: "const" },
  "convertWeight", "wasLifted",
  { name: "COUNTS_THRESHOLD", kind: "const" },
  "sessionCounts", "logCounts", "priorBest", "beatsBest",
  { name: "TYPO_MULTIPLE", kind: "const" },
  "looksLikeTypo", "workoutSetRows",
]);

const src = readSource(APP);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const set = (n, weight, reps, done = true, unit = "lb", manual = false) => ({
  set: n, done, weight, unit: weight == null ? null : unit, reps, manual,
});
const ex = (name, sets, extra = {}) => ({ name, sets, ...extra });
const log = (date, name, sets) => ({ date, exercises: [ex(name, sets)] });

// ---------- did it count ----------

test("half the prescribed sets is the bar, and it is inclusive", () => {
  assert.equal(H.COUNTS_THRESHOLD, 0.5);
  assert.equal(H.sessionCounts(10, 20), true, "exactly half has to count, or the bar is really 55%");
  assert.equal(H.sessionCounts(9, 20), false);
  assert.equal(H.sessionCounts(20, 20), true);
  assert.equal(H.sessionCounts(0, 20), false);
});

test("a session with nothing prescribed counts if anything was done", () => {
  // An extra workout the athlete added themselves. There is no bar to clear,
  // so anything done clears it. Written out as its own case rather than left
  // to floating-point division, which answers it with Infinity and NaN —
  // the right answers by accident, which is not a thing to build a streak on.
  assert.equal(H.sessionCounts(6, 0), true);
  assert.equal(H.sessionCounts(0, 0), false);
  assert.equal(H.sessionCounts(null, null), false);
});

test("a stored flag is believed, a missing one is worked out", () => {
  // Sessions logged before the column existed have no flag. Reading a missing
  // one as "did not count" would wipe out a streak somebody earned.
  assert.equal(H.logCounts({ counts: true, sets_completed: 1, sets_prescribed: 20 }), true,
    "a stored true was overruled by recomputing it");
  assert.equal(H.logCounts({ counts: false, sets_completed: 20, sets_prescribed: 20 }), false,
    "a stored false was overruled by recomputing it");
  assert.equal(H.logCounts({ counts: null, sets_completed: 12, sets_prescribed: 20 }), true);
  assert.equal(H.logCounts({ sets_completed: 3, sets_prescribed: 20 }), false);
  assert.equal(H.logCounts(null), false);
});

// ---------- the standing best ----------

const squatHistory = [
  log("2025-09-01", "Back Squat", [set(1, 185, 5), set(2, 205, 5)]),
  log("2025-09-08", "Back Squat", [set(1, 225, 3), set(2, 225, 5)]),
];

test("the best is the heaviest ticked set, with the most reps done at it", () => {
  assert.deepEqual(H.priorBest("Back Squat", squatHistory), { weightLb: 225, reps: 5 });
});

test("the best is held in pounds whatever it was typed in", () => {
  // The comparison the whole table exists for. 110 kg is 242.5 lb; compared
  // as bare numbers it loses to 225 and the athlete's real best vanishes.
  const mixed = [...squatHistory, log("2025-09-15", "Back Squat", [set(1, 110, 3, true, "kg")])];
  const best = H.priorBest("Back Squat", mixed);
  assert.ok(Math.abs(best.weightLb - 242.5) < 0.6, `came out as ${best.weightLb} lb`);
  assert.equal(best.reps, 3);
});

test("an untickled set is not a best, however heavy", () => {
  const withFail = [...squatHistory, log("2025-09-15", "Back Squat", [set(1, 315, 1, false)])];
  assert.equal(H.priorBest("Back Squat", withFail).weightLb, 225);
});

test("no history, and no movement by that name, are both null", () => {
  assert.equal(H.priorBest("Back Squat", []), null);
  assert.equal(H.priorBest("Front Squat", squatHistory), null);
  assert.equal(H.priorBest("", squatHistory), null);
  assert.equal(H.priorBest("Push-Up", [log("2025-09-01", "Push-Up", [set(1, null, 30)])]), null,
    "a reps-only movement has no weight to be a best");
});

// ---------- beating it ----------

test("heavier beats it, lighter does not", () => {
  const best = { weightLb: 225, reps: 5 };
  assert.equal(H.beatsBest(230, 3, best), true);
  assert.equal(H.beatsBest(220, 10, best), false, "ten reps at a lighter weight is not a weight PR");
});

test("the same weight for more reps beats it", () => {
  const best = { weightLb: 225, reps: 5 };
  assert.equal(H.beatsBest(225, 6, best), true);
  assert.equal(H.beatsBest(225, 5, best), false, "matching it is not beating it");
  assert.equal(H.beatsBest(225, 4, best), false);
});

test("the same weight with no rep count either side is not a best", () => {
  // Nothing to compare. Calling it a best means every repeat session of the
  // same weight sets off the confetti.
  assert.equal(H.beatsBest(225, null, { weightLb: 225, reps: 5 }), false);
  assert.equal(H.beatsBest(225, 6, { weightLb: 225, reps: null }), false);
});

test("the first loaded set of a movement is a best by definition", () => {
  assert.equal(H.beatsBest(95, 10, null), true);
  assert.equal(H.beatsBest(95, 10, { weightLb: null, reps: null }), true);
});

test("a set with no weight never beats anything", () => {
  assert.equal(H.beatsBest(null, 50, null), false);
  assert.equal(H.beatsBest(null, 50, { weightLb: 100, reps: 5 }), false);
});

// ---------- the rows themselves ----------

const rowsFor = (exercises, bests = {}) =>
  H.workoutSetRows({ logId: "log-1", userId: "user-1", exercises, bests });

test("one row per prescribed set, carrying the ids", () => {
  const rows = rowsFor([ex("Back Squat", [set(1, 225, 5), set(2, 225, 5), set(3, 225, 4)])]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.set_number), [1, 2, 3]);
  for (const r of rows) {
    assert.equal(r.log_id, "log-1");
    assert.equal(r.user_id, "user-1");
    assert.equal(r.exercise_name, "Back Squat");
  }
});

test("a set that was skipped is still a row, marked not done", () => {
  // Position is what makes "last time" line up. Dropping the skipped set
  // shifts every later one and hands set 3's weight to set 2.
  const rows = rowsFor([ex("Back Squat", [set(1, 225, 5), set(2, null, null, false), set(3, 225, 5)])]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].done, false);
  assert.equal(rows[1].weight_lb, null);
  assert.equal(rows[1].reps, null);
  assert.deepEqual(rows.map(r => r.set_number), [1, 2, 3]);
});

test("weights are converted to pounds on the way in", () => {
  const rows = rowsFor([ex("Back Squat", [set(1, 100, 5, true, "kg")])]);
  assert.ok(Math.abs(rows[0].weight_lb - 220.5) < 0.6, `stored ${rows[0].weight_lb}`);
});

test("warm-ups and cool-downs write no set rows at all", () => {
  // They are recorded as done or not on the log itself. Set rows would put
  // them into strength history as zero-weight lifts.
  // Given sets on purpose. The save path hands warm-ups an empty list today,
  // so a test built on that passes whether the guard is there or not.
  const rows = rowsFor([
    ex("Leg Swings", [set(1, null, 10), set(2, null, 10)], { tracked: false, done: true }),
    ex("Back Squat", [set(1, 225, 5)]),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].exercise_name, "Back Squat");
});

test("the hand-set flag survives into the row", () => {
  const rows = rowsFor([ex("Back Squat", [set(1, 225, 5), set(2, 185, 8, true, "lb", true)])]);
  assert.equal(rows[0].manually_set, false);
  assert.equal(rows[1].manually_set, true, "the deliberate drop set reads as a copied number");
});

test("a new best is flagged once, on the best set of the session", () => {
  const rows = rowsFor(
    [ex("Back Squat", [set(1, 235, 5), set(2, 245, 3), set(3, 240, 4)])],
    { "back squat": { weightLb: 225, reps: 5 } },
  );
  const flagged = rows.filter(r => r.is_pr);
  assert.equal(flagged.length, 1, "three sets over the old best is one new best, not three");
  assert.equal(flagged[0].weight_lb, 245);
});

test("ties on weight are broken by reps", () => {
  const rows = rowsFor(
    [ex("Back Squat", [set(1, 245, 3), set(2, 245, 6)])],
    { "back squat": { weightLb: 225, reps: 5 } },
  );
  assert.equal(rows.filter(r => r.is_pr).length, 1);
  assert.equal(rows.find(r => r.is_pr).reps, 6);
});

test("a session that beats nothing flags nothing", () => {
  const rows = rowsFor(
    [ex("Back Squat", [set(1, 205, 5), set(2, 215, 5)])],
    { "back squat": { weightLb: 225, reps: 5 } },
  );
  assert.equal(rows.some(r => r.is_pr), false);
});

test("a heavy set that was never ticked does not flag", () => {
  const rows = rowsFor(
    [ex("Back Squat", [set(1, 315, 1, false), set(2, 230, 5)])],
    { "back squat": { weightLb: 225, reps: 5 } },
  );
  const flagged = rows.filter(r => r.is_pr);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].weight_lb, 230, "the failed 315 was recorded as a personal best");
});

test("each movement is judged against its own best", () => {
  const rows = rowsFor(
    [ex("Back Squat", [set(1, 230, 5)]), ex("Bench Press", [set(1, 135, 5)])],
    { "back squat": { weightLb: 225, reps: 5 }, "bench press": { weightLb: 185, reps: 5 } },
  );
  assert.equal(rows.find(r => r.exercise_name === "Back Squat").is_pr, true);
  assert.equal(rows.find(r => r.exercise_name === "Bench Press").is_pr, false);
});

test("nothing at all is an empty list, not a crash", () => {
  assert.deepEqual(rowsFor([]), []);
  assert.deepEqual(H.workoutSetRows({ logId: "l", userId: "u", exercises: null }), []);
  assert.deepEqual(rowsFor([ex("Back Squat", [])]), []);
});

// ---------- the save path ----------

test("the save path still works out prior bests", () => {
  assert.ok(src.indexOf("    const priorBests = {};") > 0,
    "nothing computes the standing best, so is_pr can only ever be false");
  assert.ok(/priorBests\[key\] = priorBest\(entry\.name, state\.workoutLogs\)/.test(src),
    "the best is not read from the athlete's own history");
});

test("the rows are built before anything is sent", () => {
  // A session with no signal is queued. Building the rows after the insert
  // means a queued session reaches the server with no set rows behind it.
  // Inside finishWorkout, not anywhere in the file: logSessionAsDone also
  // inserts a workout_logs row, and it sits earlier.
  const finish = src.slice(src.indexOf("const finishWorkout = async () => {"));
  const buildAt = finish.indexOf("const setRows = workoutSetRows({");
  const insertAt = finish.indexOf('await supabase.from("workout_logs").insert(row)');
  assert.ok(buildAt > 0 && insertAt > 0, "the save path has moved");
  assert.ok(buildAt < insertAt, "the set rows are built after the log is sent");
});

test("a queued session carries its set rows into the queue", () => {
  assert.ok(/queuePendingLog\(\{ row, meta: notice, setRows \}\)/.test(src),
    "an offline session is queued without its sets, so they are lost when it drains");
  assert.ok(/if \(entry\.setRows\?\.length\)/.test(src),
    "the queue drains the log without the sets behind it");
});

test("the rows are upserted, not inserted", () => {
  // A retry after an ambiguous failure lands on the same log id, and the
  // unique key on (log_id, exercise_name, set_number) would reject the lot.
  const upserts = src.match(/from\("workout_sets"\)\s*\n?\s*\.upsert\(/g) || [];
  assert.equal(upserts.length, 2, `expected an upsert on save and on flush, found ${upserts.length}`);
  assert.equal((src.match(/onConflict: "log_id,exercise_name,set_number"/g) || []).length, 2,
    "an upsert is missing its conflict target, so it behaves as a plain insert");
  assert.ok(!/from\("workout_sets"\)\s*\n?\s*\.insert\(/.test(src),
    "something still inserts set rows directly");
});

test("a failed set write never turns a saved session into an error", () => {
  // The same numbers are in the log's jsonb. Refusing the save over a
  // secondary table would throw away an hour of work to protect an index.
  const at = src.indexOf('await supabase.from("workout_sets")');
  const around = src.slice(at - 400, at + 400);
  assert.ok(/catch \{/.test(around), "the set write can reject the whole save");
  assert.ok(!/setSaveError/.test(around), "a failed set write shows the athlete an error");
});

test("the log row stores whether it counted", () => {
  assert.ok(/counts: sessionCounts\(setsCompleted, setsPrescribed\)/.test(src),
    "the 50% flag is never written to the log row");
});

test("every loader reads the flag back", () => {
  // Three places load workout_logs: the athlete's own, the coach's roster and
  // the coach's athlete detail. A loader that forgets it leaves that screen
  // thinking nothing ever counted.
  const loaders = (src.match(/setsPrescribed: l\.sets_prescribed/g) || []).length;
  const flags = (src.match(/counts: logCounts\(l\)/g) || []).length;
  assert.equal(flags, loaders,
    `${loaders} places load a log row and ${flags} of them read the counts flag`);
});

test("the per-set hand-set flag reaches the log in the first place", () => {
  assert.ok(/const typedByHand = handSet\[item\.id\] \|\| \[\];/.test(src),
    "the save path never looks at which weights were typed by hand");
  assert.ok(/manual: typedByHand\[i\] === true,/.test(src),
    "the per-set log entry carries no hand-set flag, so workout_sets always says false");
});

// ---------- the typo guard ----------
//
// Typing 1350 where 135 was meant is the commonest entry mistake there is.
// It is queried rather than blocked, because one heavy single among lighter
// work is a real session - but it does not get to be a personal best, since
// once a mistyped 1350 is stored as one it sets the bar for the rest of the
// block and the athlete is told they are getting weaker every week after.

test("more than double every other set is queried", () => {
  assert.equal(H.TYPO_MULTIPLE, 2);
  assert.equal(H.looksLikeTypo(1350, [135, 135, 140]), true);
  assert.equal(H.looksLikeTypo(275, [135, 135]), true);
  assert.equal(H.looksLikeTypo(270, [135, 135]), false, "exactly double is not more than double");
});

test("a real heavy single is left alone", () => {
  // Working up: 135, 185, 225, 245. Nothing here is double anything.
  assert.equal(H.looksLikeTypo(245, [135, 185, 225]), false);
  // And a straight ramp from a warm-up set is not a typo either.
  assert.equal(H.looksLikeTypo(225, [135, 185]), false);
  // The comparison is against the HEAVIEST other set, not the lightest.
  // Against the lightest, every top set that follows a warm-up double is
  // queried, which is most heavy days.
  assert.equal(H.looksLikeTypo(300, [135, 185, 225]), false,
    "the top set is being compared against the warm-up");
});

test("the first set of an exercise is never a typo", () => {
  // There is nothing to compare it against, and flagging it would query
  // every opening set of every session.
  assert.equal(H.looksLikeTypo(1350, []), false);
  assert.equal(H.looksLikeTypo(1350, [null, undefined, 0]), false);
});

test("nothing typed is not a typo", () => {
  assert.equal(H.looksLikeTypo(null, [135]), false);
  assert.equal(H.looksLikeTypo(NaN, [135]), false);
});

test("a flagged set cannot become a personal best", () => {
  const rows = rowsFor(
    [ex("Back Squat", [set(1, 135, 5), set(2, 135, 5), set(3, 1350, 5)])],
    { "back squat": { weightLb: 225, reps: 5 } },
  );
  assert.equal(rows.some(r => r.is_pr), false,
    "a mistyped 1350 was stored as a personal best, which sets the bar for the whole block");
  // The row is still written. The number the athlete typed is what happened,
  // and quietly dropping it would lose the set as well as the mistake.
  assert.equal(rows.length, 3);
  assert.equal(rows[2].weight_lb, 1350);
});

test("the real best of a session with a typo in it still counts", () => {
  const rows = rowsFor(
    [ex("Back Squat", [set(1, 235, 5), set(2, 240, 5), set(3, 2400, 5)])],
    { "back squat": { weightLb: 225, reps: 5 } },
  );
  const flagged = rows.filter(r => r.is_pr);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].weight_lb, 240, "the typo took the PR with it");
});

test("the warning is on screen, in the words the design asks for", () => {
  assert.ok(/More than double your other sets\. Typo\?/.test(src),
    "nothing on screen queries a mistyped weight");
  const at = src.indexOf("More than double your other sets");
  const around = src.slice(at - 700, at + 200);
  assert.ok(/looksLikeTypo\(normalizeWeight\(typed\)/.test(around),
    "the warning is not driven by the same rule the personal best uses");
  assert.ok(/\.filter\(\(_, other\) => other !== i\)/.test(around),
    "the set is compared against itself, so nothing is ever flagged");
});

test("the Plan says when a session is paused", () => {
  // The home screen's card can be dismissed for the day. Without this there
  // would be a half-finished workout with nothing on the screen that lists
  // sessions saying so.
  assert.ok(/Paused \{pausedWhenLabel\(pausedHere\.date\) \|\| ""\} at exercise/.test(src),
    "the Plan never says a session is paused");
  assert.ok(/sessionIdentity\(myProgram, day\) === pausedWorkout\.dayKey/.test(src),
    "the Plan would mark the wrong day as paused");
});

// ---------- what the athlete is told ----------

test("a part session is named as one on the finish screen", () => {
  // Saved either way. An athlete who managed two sets of a hard session has
  // not failed at using the app, and a screen that behaves as if nothing
  // happened is how someone decides not to open it next time.
  const at = src.indexOf("Logged as a part session");
  assert.ok(at > 0, "the finish screen says nothing about falling short");
  const card = src.slice(at - 600, at + 800);
  assert.ok(/counts === false &&/.test(card),
    "the card shows for every session, or for none");
  assert.ok(/It's saved, and your coach can see it/.test(card),
    "it does not say the session was still saved, which is the part that matters");
  assert.ok(/counts=\{loggedSummary\?\.counts\}/.test(src),
    "the finish screen is never told whether the session counted");
});

test("the finish screen says nothing in em dashes", () => {
  // House rule: no em dashes in anything the athlete reads. A lone "\u2014" used
  // as a placeholder glyph in an empty slot is not prose and is left alone;
  // what this looks for is the dash used as punctuation, with a space either
  // side, which is the thing that reads as written-by-a-machine.
  const at = src.indexOf("function SessionLoggedScreen");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  const prose = body.split("\n").filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
  const offender = prose.find(l => / \u2014 /.test(l));
  assert.equal(offender, undefined, `em dash in athlete-facing text: ${offender}`);
});

test("the lifting unit can also be set in My Info", () => {
  // The spec asks for it in both places: the table header is for mid-set, My
  // Info is for someone setting the app up.
  const at = src.indexOf('<div className="text-[12.5px] uppercase tracking-[.16em] font-semibold mb-2.5" style={{ color: C.sub }}>Weights</div>');
  assert.ok(at > 0, "My Info has no weight-unit setting");
  const block = src.slice(at, at + 1400);
  assert.ok(/onChange=\{v => saveLiftUnit\(setState, state\.me\.id, v\)\}/.test(block),
    "the My Info switch does not go through the one writer");
  assert.ok(/stored in pounds and converted/.test(block),
    "nothing tells the athlete that switching will not change a logged weight");
});

test("appearance is stored in its own column, with the old copy kept", () => {
  // intake.theme is still written because it is what the pre-mount loader
  // reads; a light-mode user waiting for the profile would get a black flash
  // on every launch.
  assert.ok(/saveThemePref\(who, mode\)/.test(src), "theme_pref is never written");
  assert.ok(/saveProfileSetting\(setState, who, "theme", mode\)/.test(src),
    "intake.theme stopped being written, so the launch theme will flash");
  assert.ok(/const storedTheme = profile\.theme_pref \|\| profile\.intake\?\.theme/.test(src),
    "the column is not read back, or does not fall back to the older copy");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
