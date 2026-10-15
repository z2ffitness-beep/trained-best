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
  "sessionCounts", "logCounts", "priorBest", "beatsBest", "workoutSetRows",
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
  const buildAt = src.indexOf("const setRows = workoutSetRows({");
  const insertAt = src.indexOf('await supabase.from("workout_logs").insert(row)');
  assert.ok(buildAt > 0 && insertAt > 0);
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

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
