// What you did last microcycle: the helpers behind the numbers the athlete
// reads standing over the bar. A wrong number here is worse than no number,
// because it looks authoritative and gets loaded onto a barbell.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  "normalizeWeight", "formatWeight", "normalizeReps", "formatSetResult",
  "wasLifted", "topSetWeight", "lastLoggedSets", "lastWeightForSet",
  "sessionKey", "sessionLabel", "logProgramWeek", "sessionHistoryForDay", "setsFromSession",
  "lastPerformance", "lastMicrocycleSession", "formatSetHistory",
  "isTrackedPhase", "isTrackedExercise",
  { name: "UNTRACKED_PHASES", kind: "const" },
  "daysBetweenISO", "absoluteProgramWeek", "currentProgramWeek", "programWeekFor",
  { name: "toLocalISO", kind: "const" },
  { name: "todayISO", kind: "const" },
  { name: "LOAD_STEP_PERCENT", kind: "const" },
  "roundToPlate", "completedLastTime", "suggestLoad",
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const set = (n, weight, reps, done = true) => ({
  set: n, done, weight, unit: weight == null ? null : "lb", reps: reps ?? null,
});

// A program starting Monday 1 Sep 2025, so week 1 = Sep 1-7, week 2 = Sep 8-14.
const program = { weeks: 8, startedOn: "2025-09-01" };

const log = (date, day, exercises) => ({ date, programDay: day, exercises });
const ex = (name, sets, extra = {}) => ({
  name, sets,
  setsCompleted: sets.filter(s => s.done).length,
  setsPrescribed: sets.length,
  ...extra,
});

// ---------- reps ----------

test("normalizeReps keeps a whole count", () => {
  assert.equal(H.normalizeReps("8"), 8);
  assert.equal(H.normalizeReps(8.4), 8);
  assert.equal(H.normalizeReps("12"), 12);
});

test("normalizeReps treats blank, zero and nonsense as not recorded", () => {
  // A field the athlete never touched must not log as a failed set.
  for (const v of ["", null, undefined, "0", 0, -3, "abc", NaN, 1000]) {
    assert.equal(H.normalizeReps(v), null, `expected null for ${JSON.stringify(v)}`);
  }
});

test("formatSetResult shows weight and reps together", () => {
  assert.equal(H.formatSetResult({ weight: 135, unit: "lb", reps: 8 }), "135 lb × 8");
});

test("formatSetResult still reads cleanly with no reps recorded", () => {
  // Every session logged before reps existed looks like this.
  assert.equal(H.formatSetResult({ weight: 135, unit: "lb" }), "135 lb");
  assert.equal(H.formatSetResult({ weight: 135, unit: "lb", reps: null }), "135 lb");
});

test("formatSetResult handles reps with no weight, and nothing at all", () => {
  assert.equal(H.formatSetResult({ weight: null, reps: 12 }), "12 reps");
  assert.equal(H.formatSetResult({ weight: null, reps: null }), null);
  assert.equal(H.formatSetResult(null), null);
});

// ---------- session identity ----------

test("sessionKey matches on the day number, so a rename doesn't lose history", () => {
  assert.equal(H.sessionKey("Day 1 — Lower"), "day 1");
  assert.equal(H.sessionKey("Day 1 — Lower Power"), "day 1");
  assert.equal(H.sessionKey("day1 — whatever"), "day 1");
  assert.equal(H.sessionKey("Day 1 — Lower"), H.sessionKey("Day 1 — Squat Focus"));
});

test("sessionKey keeps distinct days distinct", () => {
  assert.notEqual(H.sessionKey("Day 1 — Lower"), H.sessionKey("Day 2 — Upper"));
  // Day 1 and Day 10 must not collide.
  assert.notEqual(H.sessionKey("Day 1 — A"), H.sessionKey("Day 10 — B"));
});

test("sessionKey falls back to the whole name when there is no number", () => {
  assert.equal(H.sessionKey("  Upper   Body  "), "upper body");
  assert.equal(H.sessionKey(null), "");
});

// ---------- which microcycle a log belongs to ----------

test("logProgramWeek derives the week from the date", () => {
  assert.equal(H.logProgramWeek(program, "2025-09-01"), 1);
  assert.equal(H.logProgramWeek(program, "2025-09-07"), 1);
  assert.equal(H.logProgramWeek(program, "2025-09-08"), 2);
  assert.equal(H.logProgramWeek(program, "2025-09-15"), 3);
});

test("logProgramWeek refuses sessions logged before the block began", () => {
  // Otherwise the last program's final week presents itself as this one's
  // week 1, and week 2 compares against a different block entirely.
  assert.equal(H.logProgramWeek(program, "2025-08-30"), null);
});

test("logProgramWeek is null without a start date", () => {
  assert.equal(H.logProgramWeek({ weeks: 8 }, "2025-09-08"), null);
  assert.equal(H.logProgramWeek(program, null), null);
});

// ---------- history for one session ----------

const history = [
  log("2025-09-15", "Day 1 — Lower", [ex("Back Squat", [set(1, 155, 8)])]),   // week 3
  log("2025-09-08", "Day 1 — Lower", [ex("Back Squat", [set(1, 145, 8)])]),   // week 2
  log("2025-09-10", "Day 2 — Upper", [ex("Back Squat", [set(1, 999, 1)])]),   // week 2, other day
  log("2025-09-01", "Day 1 — Lower", [ex("Back Squat", [set(1, 135, 8)])]),   // week 1
  log("2025-08-25", "Day 1 — Lower", [ex("Back Squat", [set(1, 95, 8)])]),    // pre-program
];

test("sessionHistoryForDay returns only this session, newest first", () => {
  const found = H.sessionHistoryForDay(program, history, "Day 1 — Lower", 4);
  assert.deepEqual(found.map(f => f.date), ["2025-09-15", "2025-09-08", "2025-09-01"]);
  assert.deepEqual(found.map(f => f.week), [3, 2, 1]);
});

test("sessionHistoryForDay excludes the current week", () => {
  // A session logged earlier this week is this microcycle, not the last one.
  const found = H.sessionHistoryForDay(program, history, "Day 1 — Lower", 3);
  assert.deepEqual(found.map(f => f.date), ["2025-09-08", "2025-09-01"]);
});

test("sessionHistoryForDay drops pre-program sessions", () => {
  const found = H.sessionHistoryForDay(program, history, "Day 1 — Lower", 9);
  assert.ok(!found.some(f => f.date === "2025-08-25"));
});

test("sessionHistoryForDay survives the coach renaming the session", () => {
  const found = H.sessionHistoryForDay(program, history, "Day 1 — Lower Power", 4);
  assert.equal(found.length, 3);
});

test("sessionHistoryForDay ignores other days entirely", () => {
  const found = H.sessionHistoryForDay(program, history, "Day 1 — Lower", 4);
  assert.ok(!found.some(f => f.date === "2025-09-10"));
});

// ---------- what to compare against ----------

test("lastPerformance prefers the same session in the previous microcycle", () => {
  const found = H.lastPerformance({
    exerciseName: "Back Squat", program, logs: history,
    dayName: "Day 1 — Lower", currentWeek: 3,
  });
  assert.equal(found.scope, "same-day");
  assert.equal(found.week, 2);
  assert.equal(found.weeksAgo, 1);
  assert.equal(found.sets[0].weight, 145);
});

test("lastPerformance does not borrow another day's numbers", () => {
  // Day 2 logged 999 lb on the same movement two days before Day 1's session.
  // A plain most-recent search hands that to Day 1; this must not.
  const found = H.lastPerformance({
    exerciseName: "Back Squat", program, logs: history,
    dayName: "Day 1 — Lower", currentWeek: 3,
  });
  assert.notEqual(found.sets[0].weight, 999);
});

test("lastPerformance skips a microcycle where the exercise wasn't logged", () => {
  const withGap = [
    log("2025-09-08", "Day 1 — Lower", [ex("Leg Press", [set(1, 200, 10)])]),
    log("2025-09-01", "Day 1 — Lower", [ex("Back Squat", [set(1, 135, 8)])]),
  ];
  const found = H.lastPerformance({
    exerciseName: "Back Squat", program, logs: withGap,
    dayName: "Day 1 — Lower", currentWeek: 3,
  });
  assert.equal(found.scope, "same-day");
  assert.equal(found.week, 1);
  assert.equal(found.weeksAgo, 2);
});

test("lastPerformance falls back to any session, and says so", () => {
  const elsewhere = [
    log("2025-09-10", "Day 2 — Upper", [ex("Bench Press", [set(1, 185, 5)])]),
  ];
  const found = H.lastPerformance({
    exerciseName: "Bench Press", program, logs: elsewhere,
    dayName: "Day 1 — Lower", currentWeek: 3,
  });
  assert.equal(found.scope, "other-session");
  assert.equal(found.sets[0].weight, 185);
});

test("lastPerformance returns null with no history at all", () => {
  assert.equal(H.lastPerformance({
    exerciseName: "Back Squat", program, logs: [],
    dayName: "Day 1 — Lower", currentWeek: 2,
  }), null);
});

test("lastPerformance ignores sets that were never ticked off", () => {
  // A weight typed into a set the athlete then failed is a plan, not a record.
  const planned = [
    log("2025-09-08", "Day 1 — Lower", [ex("Back Squat", [set(1, 225, 5, false)])]),
    log("2025-09-01", "Day 1 — Lower", [ex("Back Squat", [set(1, 135, 8)])]),
  ];
  const found = H.lastPerformance({
    exerciseName: "Back Squat", program, logs: planned,
    dayName: "Day 1 — Lower", currentWeek: 3,
  });
  assert.equal(found.sets[0].weight, 135);
});

test("lastPerformance keeps set numbers rather than compacting them", () => {
  // Compacting shifts every later hint one set lighter, and that hint is the
  // number the bar gets loaded from.
  const sparse = [
    log("2025-09-08", "Day 1 — Lower", [ex("Back Squat", [
      set(1, null, null, true), set(2, 145, 8), set(3, 155, 6),
    ])]),
  ];
  const found = H.lastPerformance({
    exerciseName: "Back Squat", program, logs: sparse,
    dayName: "Day 1 — Lower", currentWeek: 3,
  });
  assert.equal(found.scope, "same-day");
  assert.deepEqual(found.sets.map(s => s.set), [2, 3]);
  assert.equal(H.lastWeightForSet(found, 2).weight, 145);
  assert.equal(H.lastWeightForSet(found, 3).weight, 155);
  assert.equal(H.lastWeightForSet(found, 1), null);
});

test("lastPerformance output still drives suggestLoad", () => {
  const found = H.lastPerformance({
    exerciseName: "Back Squat", program, logs: history,
    dayName: "Day 1 — Lower", currentWeek: 3,
  });
  const suggestion = H.suggestLoad({ lastSets: found, setNumber: 1, prescribedSets: 1, unit: "lb" });
  assert.equal(suggestion.change, "up");
  assert.equal(suggestion.weight, 150); // 145 + 2.5%, rounded to a 5 lb plate
});

test("lastPerformance carries the rep target it was logged against", () => {
  const withTarget = [
    log("2025-09-08", "Day 1 — Lower", [ex("Back Squat", [set(1, 145, 8)], { reps: "8-10" })]),
  ];
  const found = H.lastPerformance({
    exerciseName: "Back Squat", program, logs: withTarget,
    dayName: "Day 1 — Lower", currentWeek: 3,
  });
  assert.equal(found.scope, "same-day");
  assert.equal(found.repsTarget, "8-10");
});

test("lastPerformance marks a program with no start date as unscoped", () => {
  // Nothing to compare microcycles against, which is not the same thing as
  // having looked for this session and found a different one. The screen
  // colours the two differently, so the helper has to tell them apart.
  const noStart = { weeks: 8 };
  const logs = [log("2025-09-10", "Day 2 — Upper", [ex("Bench Press", [set(1, 185, 5)])])];
  const found = H.lastPerformance({
    exerciseName: "Bench Press", program: noStart, logs,
    dayName: "Day 1 — Lower", currentWeek: 3,
  });
  assert.equal(found.scope, "no-schedule");
  assert.equal(found.sets[0].weight, 185);
});

// ---------- the session recap ----------

test("lastMicrocycleSession returns the previous run of the whole session", () => {
  const recap = H.lastMicrocycleSession(program, history, "Day 1 — Lower", 3);
  assert.equal(recap.week, 2);
  assert.equal(recap.weeksAgo, 1);
  assert.equal(recap.date, "2025-09-08");
  assert.equal(recap.exercises.length, 1);
  assert.equal(recap.exercises[0].name, "Back Squat");
});

test("lastMicrocycleSession drops movements with nothing logged against them", () => {
  const mixed = [
    log("2025-09-08", "Day 1 — Lower", [
      ex("Back Squat", [set(1, 145, 8)]),
      { name: "Foam Roll", sets: [], setsCompleted: 0, setsPrescribed: 0 },
    ]),
  ];
  const recap = H.lastMicrocycleSession(program, mixed, "Day 1 — Lower", 3);
  assert.deepEqual(recap.exercises.map(e => e.name), ["Back Squat"]);
});

test("lastMicrocycleSession keeps sets ticked without a weight", () => {
  // Bodyweight work is still work; it must not vanish from the recap.
  const bodyweight = [
    log("2025-09-08", "Day 1 — Lower", [ex("Push-Up", [set(1, null, 20, true)])]),
  ];
  const recap = H.lastMicrocycleSession(program, bodyweight, "Day 1 — Lower", 3);
  assert.equal(recap.exercises.length, 1);
  assert.equal(recap.exercises[0].setsCompleted, 1);
});

test("lastMicrocycleSession is null before there is a previous microcycle", () => {
  assert.equal(H.lastMicrocycleSession(program, history, "Day 1 — Lower", 1), null);
  assert.equal(H.lastMicrocycleSession(program, [], "Day 1 — Lower", 5), null);
});

test("lastMicrocycleSession is null for a session never run before", () => {
  assert.equal(H.lastMicrocycleSession(program, history, "Day 4 — Conditioning", 5), null);
});

// ---------- regressions on what this was built on ----------

test("wasLifted still requires a ticked set with a weight", () => {
  assert.equal(H.wasLifted({ done: true, weight: 135 }), true);
  assert.equal(H.wasLifted({ done: false, weight: 135 }), false);
  assert.equal(H.wasLifted({ done: true, weight: null }), false);
});

test("topSetWeight is unaffected by reps being added to a set", () => {
  const sets = [set(1, 135, 10), set(2, 155, 5), set(3, 145, 8)];
  assert.deepEqual(H.topSetWeight(sets), { weight: 155, unit: "lb" });
});

test("lastLoggedSets still searches the whole history by name", () => {
  const found = H.lastLoggedSets("Back Squat", history);
  assert.equal(found.date, "2025-09-15");
});

// ---------- week arithmetic ----------

test("daysBetweenISO is immune to daylight saving", () => {
  // Parsed as local midnight, a DST boundary eats an hour and Math.floor
  // turns it into a whole lost day - which moved the start of the program
  // week from Monday to Tuesday for eight months of the year.
  assert.equal(H.daysBetweenISO("2025-01-06", "2025-06-02"), 147);
  assert.equal(H.daysBetweenISO("2025-03-01", "2025-03-31"), 30);
  assert.equal(H.daysBetweenISO("2025-11-01", "2025-11-30"), 29);
});

test("currentProgramWeek rolls over on Monday whatever the season", () => {
  const p = { weeks: 52, startedOn: "2025-01-06" };
  assert.equal(H.currentProgramWeek(p, "2025-06-01"), 21); // Sunday
  assert.equal(H.currentProgramWeek(p, "2025-06-02"), 22); // Monday
});

test("absoluteProgramWeek keeps counting past the end of the program", () => {
  // The clamp is right for a prescription and wrong for history: it collapsed
  // every session after week 8 into "week 8", so the previous microcycle
  // excluded itself and last Monday became unreachable forever.
  const p = { weeks: 8, startedOn: "2025-09-01" };
  assert.equal(H.currentProgramWeek(p, "2025-12-01"), 8);
  assert.equal(H.absoluteProgramWeek(p, "2025-12-01"), 14);
});

test("an athlete running a block over still sees last week", () => {
  const p = { weeks: 8, startedOn: "2025-09-01" };
  const logs = [
    log("2025-11-24", "Day 1 — Lower", [ex("Back Squat", [set(1, 225, 5)])]),
    log("2025-10-13", "Day 1 — Lower", [ex("Back Squat", [set(1, 185, 5)])]),
  ];
  const week = H.absoluteProgramWeek(p, "2025-12-01");
  const found = H.lastPerformance({
    exerciseName: "Back Squat", program: p, logs, dayName: "Day 1 — Lower", currentWeek: week,
  });
  assert.equal(found.scope, "same-day");
  assert.equal(found.sets[0].weight, 225);
  assert.equal(found.weeksAgo, 1);
});

test("absoluteProgramWeek doesn't care that weeks is missing", () => {
  // currentProgramWeek pins a program with no `weeks` to week 1 forever,
  // which silently switched the whole feature off for those programs.
  const p = { startedOn: "2025-09-01" };
  assert.equal(H.currentProgramWeek(p, "2025-09-22"), 1);
  assert.equal(H.absoluteProgramWeek(p, "2025-09-22"), 4);
});

// ---------- the fallback ladder ----------

test("a session repeated in the same week is labelled as this week", () => {
  // Not "from a different session" - it is this session, two days ago. The
  // old fallback said the opposite, in amber, and was wrong twice over.
  const sameWeek = [log("2025-09-01", "Day 1 — Lower", [ex("Back Squat", [set(1, 225, 5)])])];
  const found = H.lastPerformance({
    exerciseName: "Back Squat", program, logs: sameWeek,
    dayName: "Day 1 — Lower", currentWeek: 1,
  });
  assert.equal(found.scope, "this-week");
  assert.equal(found.sets[0].weight, 225);
});

test("a number from before this program is marked as a previous block", () => {
  const older = [log("2025-07-12", "Day 3 — Peak", [ex("Back Squat", [set(1, 405, 1)])])];
  const found = H.lastPerformance({
    exerciseName: "Back Squat", program, logs: older,
    dayName: "Day 1 — Lower", currentWeek: 1,
  });
  assert.equal(found.scope, "earlier-block");
  assert.equal(found.week, null);
});

test("a previous block never drives a load increase", () => {
  // 405 after a seven-week layoff in a different block must not become 415.
  const lastSets = { sets: [set(1, 405, 1)] };
  const suggestion = H.suggestLoad({ lastSets, setNumber: 1, prescribedSets: 1, unit: "lb", layoff: true });
  assert.equal(suggestion.change, "hold");
  assert.equal(suggestion.weight, 405);
});

test("another day's numbers are labelled as another day's", () => {
  const otherDay = [log("2025-09-02", "Day 2 — Upper", [ex("Back Squat", [set(1, 999, 1)])])];
  const found = H.lastPerformance({
    exerciseName: "Back Squat", program, logs: otherDay,
    dayName: "Day 1 — Lower", currentWeek: 2,
  });
  assert.equal(found.scope, "other-session");
});

// ---------- reps-only work ----------

test("a ticked set with reps and no weight is still a set", () => {
  // Push-ups, bands, sleds, carries. Requiring a weight erased all of it: the
  // athlete typed the reps and next week the screen said nothing was logged.
  assert.equal(H.wasLifted({ done: true, weight: null, reps: 20 }), true);
  assert.equal(H.wasLifted({ done: true, weight: null, reps: null }), false);
  assert.equal(H.wasLifted({ done: false, weight: null, reps: 20 }), false);
});

test("bodyweight history reaches the screen", () => {
  const bw = [log("2025-09-01", "Day 1 — Lower", [ex("Push-Up", [set(1, null, 20), set(2, null, 18)])])];
  const found = H.lastPerformance({
    exerciseName: "Push-Up", program, logs: bw, dayName: "Day 1 — Lower", currentWeek: 2,
  });
  assert.equal(found.scope, "same-day");
  assert.equal(H.formatSetHistory(found.sets), "20 reps \u00b7 18 reps");
});

test("topSetWeight ignores sets that carry no weight", () => {
  // wasLifted now admits reps-only sets, and Math.max over a null is NaN.
  assert.deepEqual(H.topSetWeight([set(1, null, 20), set(2, 135, 8)]), { weight: 135, unit: "lb" });
  assert.equal(H.topSetWeight([set(1, null, 20)]), null);
});

// ---------- reading a set list ----------

test("formatSetHistory numbers the sets only when there is a gap", () => {
  assert.equal(
    H.formatSetHistory([set(1, 135, 8), set(2, 145, 8)]),
    "135 lb \u00d7 8 \u00b7 145 lb \u00d7 8"
  );
  // A missing set 1 must not let set 2's weight sit where set 1's belongs.
  assert.equal(
    H.formatSetHistory([set(2, 145, 8), set(3, 155, 6)]),
    "Set 2: 145 lb \u00d7 8 \u00b7 Set 3: 155 lb \u00d7 6"
  );
  assert.equal(H.formatSetHistory([]), null);
});

// ---------- naming ----------

test("sessionKey ignores zero padding", () => {
  assert.equal(H.sessionKey("Day 01 — Lower"), H.sessionKey("Day 1 — Lower"));
});

test("sessionHistoryForDay refuses to match on an empty key", () => {
  // A blank day name would otherwise match every log with no programDay.
  const orphans = [log("2025-09-01", null, [ex("Back Squat", [set(1, 135, 8)])])];
  assert.deepEqual(H.sessionHistoryForDay(program, orphans, "   ", 3), []);
});

test("sessionLabel handles every dash a coach might type", () => {
  assert.equal(H.sessionLabel("Day 1 — Lower"), "Day 1");
  assert.equal(H.sessionLabel("Day 1 - Lower"), "Day 1");
  assert.equal(H.sessionLabel("Day 1 \u2013 Lower"), "Day 1");
  assert.equal(H.sessionLabel("Leg Day"), "Leg Day");
  assert.equal(H.sessionLabel(null), "this session");
});

// ---------- warm-ups and cool-downs are not tracked ----------

test("warm-up and cool-down phases are untracked, everything else is tracked", () => {
  for (const phase of ["warmup_general", "warmup_specific", "cooldown"]) {
    assert.equal(H.isTrackedPhase(phase), false, phase);
  }
  for (const phase of ["explosive", "compound", "hypertrophy", "lactic", "aerobic"]) {
    assert.equal(H.isTrackedPhase(phase), true, phase);
  }
});

test("an unknown or missing phase stays tracked", () => {
  // The lookup this could have used files unknown phases under the cool-down,
  // which would have silently stripped weight tracking from them.
  assert.equal(H.isTrackedPhase(undefined), true);
  assert.equal(H.isTrackedPhase(null), true);
  assert.equal(H.isTrackedPhase("strength_endurance"), true);
  assert.equal(H.isTrackedExercise({ phase: undefined }), true);
  assert.equal(H.isTrackedExercise(null), false);
});

test("the recap leaves out warm-ups even from sessions logged before this change", () => {
  const withWarmup = [
    log("2025-09-08", "Day 1 \u2014 Lower", [
      { ...ex("World's Greatest Stretch", [set(1, null, 5)]), phase: "warmup_general" },
      { ...ex("Back Squat", [set(1, 145, 8)]), phase: "compound" },
      { ...ex("Couch Stretch", [set(1, null, 1)]), phase: "cooldown" },
    ]),
  ];
  const recap = H.lastMicrocycleSession(program, withWarmup, "Day 1 \u2014 Lower", 3);
  assert.deepEqual(recap.exercises.map(e => e.name), ["Back Squat"]);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) {
    console.error(`✖ ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
