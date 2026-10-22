// Am I getting stronger? The helpers behind the Progress screen's strength
// half. Every number here is one a person will compare themselves against, so
// a wrong one is worse than a missing one.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  "wasLifted", "topSetWeight", "formatWeight", "convertWeight",
  { name: "LB_PER_KG", kind: "const" },
  "estimateOneRepMax", "exerciseHistory", "trainedExercises",
  "strengthSummary", "trendPoints",
  { name: "E1RM_REP_CEILING", kind: "const" },
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const set = (n, weight, reps, done = true) => ({
  set: n, done, weight, unit: weight == null ? null : "lb", reps: reps ?? null,
});
const log = (date, day, exercises) => ({ date, programDay: day, exercises });
const ex = (name, sets) => ({
  name, sets,
  setsCompleted: sets.filter(s => s.done).length,
  setsPrescribed: sets.length,
});

// ---------- estimated one-rep max ----------

test("a single at a weight is that weight", () => {
  assert.equal(H.estimateOneRepMax(225, 1), 225);
});

test("Epley for a normal working set", () => {
  // 185 x 5 -> 185 * (1 + 5/30) = 215.8
  assert.equal(H.estimateOneRepMax(185, 5), 216);
  assert.equal(H.estimateOneRepMax(100, 10), 133);
});

test("a long set is not converted at all", () => {
  // Past about ten reps Epley overestimates badly. A wrong one-rep max is
  // worse than none, because people load bars from it.
  assert.equal(H.estimateOneRepMax(95, H.E1RM_REP_CEILING + 1), null);
  assert.equal(H.estimateOneRepMax(95, 30), null);
});

test("missing or nonsense inputs give nothing", () => {
  assert.equal(H.estimateOneRepMax(225, null), null);
  assert.equal(H.estimateOneRepMax(null, 5), null);
  assert.equal(H.estimateOneRepMax(0, 5), null);
  assert.equal(H.estimateOneRepMax(-100, 5), null);
  assert.equal(H.estimateOneRepMax(225, 0), null);
  assert.equal(H.estimateOneRepMax("abc", 5), null);
});

// ---------- one movement's history ----------

const logs = [
  log("2025-09-01", "Day 1 - Lower", [ex("Back Squat", [set(1, 135, 8), set(2, 135, 8)])]),
  log("2025-09-08", "Day 1 - Lower", [ex("Back Squat", [set(1, 145, 8), set(2, 155, 5)])]),
  log("2025-09-15", "Day 1 - Lower", [ex("Back Squat", [set(1, 150, 8)])]),
];

test("history is oldest first, one row per session", () => {
  const rows = H.exerciseHistory("Back Squat", logs);
  assert.deepEqual(rows.map(r => r.date), ["2025-09-01", "2025-09-08", "2025-09-15"]);
  assert.deepEqual(rows.map(r => r.topWeight), [135, 155, 150]);
});

test("volume counts only sets that have both numbers", () => {
  const rows = H.exerciseHistory("Back Squat", logs);
  assert.equal(rows[0].volume, 135 * 8 * 2);
  // Half a volume figure is not a smaller one, it is a misleading one.
  const partial = [log("2025-09-01", "D", [ex("Row", [set(1, 100, 10), set(2, 100, null)])])];
  assert.equal(H.exerciseHistory("Row", partial)[0].volume, 1000);
});

test("a session where nothing was logged is a gap, not a zero", () => {
  // A zero on a trend line reads as a catastrophic regression.
  const withBlank = [
    log("2025-09-01", "D", [ex("Back Squat", [set(1, 135, 8)])]),
    log("2025-09-08", "D", [ex("Back Squat", [set(1, null, null, false)])]),
  ];
  const rows = H.exerciseHistory("Back Squat", withBlank);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, "2025-09-01");
});

test("bodyweight sessions still make history", () => {
  const bw = [log("2025-09-01", "D", [ex("Push-Up", [set(1, null, 20)])])];
  const rows = H.exerciseHistory("Push-Up", bw);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].topWeight, null);
  assert.equal(rows[0].repsDone, 20);
  assert.equal(rows[0].volume, null);
});

test("an exercise never trained has no history", () => {
  assert.deepEqual(H.exerciseHistory("Deadlift", logs), []);
  assert.deepEqual(H.exerciseHistory(null, logs), []);
  assert.deepEqual(H.exerciseHistory("Back Squat", []), []);
});

// ---------- the movement list ----------

test("trained movements are listed most recent first", () => {
  const mixed = [
    log("2025-09-01", "D", [ex("Back Squat", [set(1, 135, 8)]), ex("Bench Press", [set(1, 95, 8)])]),
    log("2025-09-08", "D", [ex("Back Squat", [set(1, 145, 8)])]),
  ];
  const list = H.trainedExercises(mixed);
  assert.deepEqual(list.map(e => e.name), ["Back Squat", "Bench Press"]);
  assert.equal(list[0].sessions, 2);
  assert.equal(list[0].lastDate, "2025-09-08");
});

test("a movement with nothing logged never appears", () => {
  const skipped = [log("2025-09-01", "D", [ex("Foam Roll", [])])];
  assert.deepEqual(H.trainedExercises(skipped), []);
});

// ---------- the summary ----------

test("summary finds the best session and the change since the first", () => {
  const rows = H.exerciseHistory("Back Squat", logs);
  const s = H.strengthSummary(rows);
  assert.equal(s.sessions, 3);
  assert.equal(s.bestTop.topWeight, 155);
  assert.equal(s.bestTop.date, "2025-09-08");
  assert.equal(s.latest.topWeight, 150);
  assert.equal(s.change, 15); // 150 now vs 135 at the start
});

test("a personal record needs more than one session", () => {
  const rows = H.exerciseHistory("Back Squat", logs);
  // The best was two weeks ago, so the latest session is not a record.
  assert.equal(H.strengthSummary(rows).isPR, false);

  const rising = H.exerciseHistory("Back Squat", [
    log("2025-09-01", "D", [ex("Back Squat", [set(1, 135, 5)])]),
    log("2025-09-08", "D", [ex("Back Squat", [set(1, 185, 5)])]),
  ]);
  assert.equal(H.strengthSummary(rising).isPR, true);

  // A first-ever session is a starting point, not a record to celebrate.
  const firstEver = H.exerciseHistory("Back Squat", [logs[0]]);
  assert.equal(H.strengthSummary(firstEver).isPR, false);
});

test("summary of nothing is nothing", () => {
  assert.equal(H.strengthSummary([]), null);
  assert.equal(H.strengthSummary(null), null);
});

test("best estimated 1RM can come from a different session than the best set", () => {
  // 155 x 5 beats 165 x 1 as an estimate, even though 165 is the heavier bar.
  const rows = H.exerciseHistory("Back Squat", [
    log("2025-09-01", "D", [ex("Back Squat", [set(1, 155, 5)])]),   // e1RM 181
    log("2025-09-08", "D", [ex("Back Squat", [set(1, 165, 1)])]),   // e1RM 165
  ]);
  const s = H.strengthSummary(rows);
  assert.equal(s.bestTop.topWeight, 165);
  assert.equal(s.bestE1rm.e1rm, 181);
  assert.equal(s.bestE1rm.date, "2025-09-01");
});

// ---------- plotting ----------

test("points are spaced by real dates, not by session number", () => {
  // A fortnight off has to look like a fortnight off. Even spacing would
  // quietly turn a layoff into a plateau.
  const rows = H.exerciseHistory("Back Squat", [
    log("2025-09-01", "D", [ex("Back Squat", [set(1, 100, 5)])]),
    log("2025-09-08", "D", [ex("Back Squat", [set(1, 110, 5)])]),
    log("2025-09-29", "D", [ex("Back Squat", [set(1, 120, 5)])]),
  ]);
  const pts = H.trendPoints(rows);
  assert.equal(pts[0].x, 0);
  assert.equal(pts[2].x, 1);
  assert.equal(Math.round(pts[1].x * 100) / 100, 0.25); // 7 days of 28
});

test("an unchanged series sits in the middle instead of dividing by zero", () => {
  const rows = H.exerciseHistory("Back Squat", [
    log("2025-09-01", "D", [ex("Back Squat", [set(1, 135, 5)])]),
    log("2025-09-08", "D", [ex("Back Squat", [set(1, 135, 5)])]),
  ]);
  const pts = H.trendPoints(rows);
  assert.ok(pts.every(p => Number.isFinite(p.y)));
  assert.ok(pts.every(p => p.y > 0.3 && p.y < 0.7));
});

test("the highest point is flagged so it can be labelled", () => {
  const rows = H.exerciseHistory("Back Squat", logs);
  const pts = H.trendPoints(rows);
  assert.deepEqual(pts.map(p => p.isMax), [false, true, false]);
  assert.equal(pts[pts.length - 1].isLast, true);
});

test("points skip sessions with no value for that measure", () => {
  const rows = H.exerciseHistory("Push-Up", [
    log("2025-09-01", "D", [ex("Push-Up", [set(1, null, 20)])]),
  ]);
  assert.deepEqual(H.trendPoints(rows, "topWeight"), []);
  assert.deepEqual(H.trendPoints([], "topWeight"), []);
});

test("every plotted y stays inside the plot", () => {
  const rows = H.exerciseHistory("Back Squat", logs);
  for (const p of H.trendPoints(rows)) {
    assert.ok(p.y >= 0 && p.y <= 1, `y out of range: ${p.y}`);
    assert.ok(p.x >= 0 && p.x <= 1, `x out of range: ${p.x}`);
  }
});

// ---------- review fixes ----------

const kgSet = (n, w, r) => ({ set: n, done: true, weight: w, unit: "kg", reps: r });

test("a switch from lb to kg does not read as a collapse", () => {
  // 225 lb then 102 kg is the same squat. Plotted raw it was a -123 drop.
  const rows = H.exerciseHistory("Back Squat", [
    log("2025-09-01", "D", [ex("Back Squat", [set(1, 225, 5)])]),
    log("2025-09-08", "D", [ex("Back Squat", [kgSet(1, 102, 5)])]),
  ]);
  assert.ok(rows.every(r => r.unit === "kg"), "one unit across the history");
  assert.equal(rows[0].topWeight, 102.1);
  const s = H.strengthSummary(rows);
  assert.ok(Math.abs(s.change) < 1, `change should be ~0, got ${s.change}`);
});

test("converted sessions keep their set weights in the same unit", () => {
  const rows = H.exerciseHistory("Back Squat", [
    log("2025-09-01", "D", [ex("Back Squat", [set(1, 220, 5)])]),
    log("2025-09-08", "D", [ex("Back Squat", [kgSet(1, 100, 5)])]),
  ]);
  assert.equal(rows[0].sets[0].unit, "kg");
  assert.equal(rows[0].sets[0].weight, 99.8);
  assert.equal(rows[0].convertedFrom, "lb");
});

test("convertWeight leaves same-unit and non-numbers alone", () => {
  assert.equal(H.convertWeight(100, "kg", "kg"), 100);
  assert.equal(H.convertWeight(null, "kg", "lb"), null);
  assert.equal(H.convertWeight(100, "kg", "lb"), 220.5);
});

test("a first session reports no change rather than +0", () => {
  const rows = H.exerciseHistory("Back Squat", [logs[0]]);
  assert.equal(H.strengthSummary(rows).change, null);
});

test("one row with a bad date does not blank the chart", () => {
  const rows = [
    { date: "2025-09-01", topWeight: 135 },
    { date: null, topWeight: 140 },
    { date: "2025-9-8", topWeight: 145 },
    { date: "2025-09-15", topWeight: 150 },
  ];
  const pts = H.trendPoints(rows);
  assert.equal(pts.length, 2);
  assert.ok(pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test("the movement list merges names that differ only by case", () => {
  const list = H.trainedExercises([
    log("2025-09-01", "D", [ex("Back Squat", [set(1, 135, 5)])]),
    log("2025-09-08", "D", [ex("back squat", [set(1, 145, 5)])]),
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].sessions, 2);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) {
    console.error(`✖ ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
