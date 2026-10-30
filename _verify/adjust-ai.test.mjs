// Adjust with AI (Isaiah, 27 Oct). The AI sends a list of operations and the
// app applies them. These check that the weeks, days and exercises named are
// the ONLY things that change, that a bad reply changes nothing, and that
// phases can be named and stored.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  { name: "SESSION_BLOCKS", kind: "const" },
  { name: "WEEKDAY_ORDER", kind: "const" },
  { name: "PHASE_WEEKS", kind: "const" },
  { name: "MIN_WEEKS_FOR_DELOAD", kind: "const" },
  { name: "DELOAD_SET_FACTOR", kind: "const" },
  { name: "DELOAD_DIFFICULTY_DROP", kind: "const" },
  { name: "MIN_AUTHORED_BLOCK_WEEKS", kind: "const" },
  { name: "WEEK_FIELDS", kind: "const" },
  { name: "ADJUST_FIELDS", kind: "const" },
  { name: "ADJUST_SECTION_KEYS", kind: "const" },
  { name: "ADJUST_MAX_WEEKS", kind: "const" },
  { name: "newAdjustId", kind: "const" },
  "storedPhasesValid", "fitPhasesToWeeks", "bakeGeneratedProgression", "skipExerciseInRange",
  "limitNewExerciseToRange", "limitNewExerciseToSpans", "programForAI", "applyAdjustOps", "validateAdjustedProgram",
  "adjustDiff", "formatWeekList", "buildAdjustMessages",
  "buildProgramPlan", "prescribeForWeek", "weekWithinPhase", "applyPhaseIntent", "applyProgression", "applyDeload",
  "programHasWeeklyPlan", "dayHasWeeklyPlan", "programBlocks", "authoredBlocks", "authoredBlockStarts", "authoredBlocksLookReal",
  "weekEntryFor", "resolveExerciseForWeek", "resolveDayForWeek", "weekKeys", "resolvedFields", "tidyByWeek",
  "setWeekEntry", "setFieldsInRange", "clearFieldsInRange", "pinAt", "applyExerciseEdit",
  "insertProgramWeeks", "removeProgramWeeks", "shiftExerciseWeeks", "reassignWeekday", "pruneModeOverrides", "blockForPhase", "phaseIntent", "progressionStep", "shiftReps",
  { name: "PHASE_INTENTS", kind: "const" }, { name: "PROGRESSION_FLOOR", kind: "const" }, { name: "PROGRESSION_MAX_STEP", kind: "const" }, { name: "REP_FLOOR", kind: "const" },
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

const LIB = [
  { id: "e1", name: "Back Squat", phase: "compound" },
  { id: "e2", name: "Bench Press", phase: "compound" },
  { id: "e3", name: "Bike", phase: "aerobic" },
  { id: "e4", name: "Rower", phase: "aerobic" },
  { id: "e5", name: "Pogo Jumps", phase: "explosive" },
];
// A written-out 12 week program: squat changes its numbers in week 7.
const written = () => ({
  id: "p1", name: "Camp", weeks: 12,
  days: [
    { id: "d1", name: "Lower A", weekday: "Monday", exercises: [
      { id: "x1", exerciseId: "e1", phase: "compound", sets: 4, reps: "6", rpe: 7, rest: "2m", byWeek: { "7": { sets: 5, reps: "3" } } },
      { id: "x2", exerciseId: "e5", phase: "explosive", sets: 3, reps: "10", rpe: 6, rest: "60s", byWeek: null },
    ] },
    { id: "d2", name: "Upper A", weekday: "Tuesday", exercises: [
      { id: "x3", exerciseId: "e2", phase: "compound", sets: 4, reps: "8", rpe: 7, rest: "2m", byWeek: null },
      { id: "x4", exerciseId: "e3", phase: "aerobic", sets: 1, reps: "20 min", rpe: 5, rest: null, byWeek: null },
    ] },
  ],
});
// The same with no per-week plan: the app works out each week itself.
const generated = () => {
  const p = written();
  p.days[0].exercises[0].byWeek = null;
  return p;
};
const at = (p, exId, w) => {
  for (const d of p.days) {
    const x = d.exercises.find(e => e.id === exId);
    if (x) return H.resolveExerciseForWeek(x, w);
  }
  return undefined;
};

test("weeks 5 to 8 change, and only weeks 5 to 8", () => {
  const { program } = H.applyAdjustOps(written(), [{ op: "update_exercises", exercises: ["x3"], set: { sets: 3, reps: "5" }, weeks: [5, 8] }], { exercises: LIB });
  assert.equal(at(program, "x3", 4).sets, 4);
  assert.equal(at(program, "x3", 5).sets, 3);
  assert.equal(at(program, "x3", 8).reps, "5");
  assert.equal(at(program, "x3", 9).sets, 4);
  assert.equal(at(program, "x3", 9).reps, "8");
});

test("an existing later change inside the span gets the new value, and after it comes back", () => {
  const { program } = H.applyAdjustOps(written(), [{ op: "update_exercises", exercises: ["x1"], set: { sets: 3 }, weeks: [5, 8] }], { exercises: LIB });
  assert.equal(at(program, "x1", 7).sets, 3, "week 7's own entry was not overridden");
  assert.equal(at(program, "x1", 7).reps, "3", "week 7 lost its reps");
  assert.equal(at(program, "x1", 9).sets, 5, "week 9 should show week 7's plan again");
});

test("on a program the app progresses itself, untouched weeks keep the numbers they showed", () => {
  const before = generated();
  const plan = H.buildProgramPlan(12);
  const shown = (p, id, w) => {
    const x = p.days.flatMap(d => d.exercises).find(e => e.id === id);
    return H.programHasWeeklyPlan(p) ? H.resolveExerciseForWeek(x, w) : H.prescribeForWeek(x, plan, w, false);
  };
  const { program } = H.applyAdjustOps(before, [{ op: "update_exercises", exercises: ["x3"], set: { sets: 2 }, weeks: [4, 4] }], { exercises: LIB });
  for (let w = 1; w <= 12; w++) {
    for (const id of ["x1", "x2", "x4"]) {
      const a = shown(before, id, w), b = shown(program, id, w);
      for (const f of ["sets", "reps", "rpe", "rest"]) assert.equal(String(b[f]), String(a[f]), `${id} week ${w} ${f}`);
    }
    if (w !== 4) assert.equal(String(shown(program, "x3", w).sets), String(shown(before, "x3", w).sets), `x3 week ${w}`);
  }
  assert.equal(shown(program, "x3", 4).sets, 2);
});

test("removing for some weeks leaves the others alone", () => {
  const { program } = H.applyAdjustOps(written(), [{ op: "remove_exercises", exercises: ["x2"], weeks: [3, 4] }], { exercises: LIB });
  assert.ok(at(program, "x2", 2));
  assert.equal(at(program, "x2", 3), null);
  assert.equal(at(program, "x2", 4), null);
  assert.equal(at(program, "x2", 5).sets, 3);
});

test("removing for every week takes it out of the day", () => {
  const { program } = H.applyAdjustOps(written(), [{ op: "remove_exercises", exercises: ["x2"] }], { exercises: LIB });
  assert.equal(program.days[0].exercises.length, 1);
});

test("an added exercise for weeks 1 to 6 is gone from week 7", () => {
  const { program, newExercises } = H.applyAdjustOps(written(),
    [{ op: "add_exercise", days: ["d1"], exercise: { name: "Nordic Curl", section: "hypertrophy", sets: 3, reps: "5" }, weeks: [1, 6] }], { exercises: LIB });
  const x = program.days[0].exercises[2];
  assert.equal(newExercises[0].name, "Nordic Curl");
  assert.equal(x.exerciseId, newExercises[0].id);
  assert.ok(H.resolveExerciseForWeek(x, 6));
  assert.equal(H.resolveExerciseForWeek(x, 7), null);
});

test("an added exercise that is already in the library reuses it", () => {
  const { program, newExercises } = H.applyAdjustOps(written(),
    [{ op: "add_exercise", days: ["d1", "d2"], exercise: { name: "rower", section: "aerobic" } }], { exercises: LIB });
  assert.equal(newExercises.length, 0);
  assert.equal(program.days[1].exercises[2].exerciseId, "e4");
});

test("swapping for every week clears the old name from the per-week entries", () => {
  const { program } = H.applyAdjustOps(written(), [{ op: "update_exercises", exercises: ["x1"], set: { name: "Rower" } }], { exercises: LIB });
  const x = program.days[0].exercises[0];
  assert.equal(x.exerciseId, "e4");
  assert.equal(at(program, "x1", 9).exerciseId, "e4");
  assert.ok(!x.byWeek?.["7"]?.name, "week 7 still names the old movement");
});

test("phases can be named, and the app reads them back", () => {
  const ops = [{ op: "set_phases", phases: [{ name: "Foundation", startWeek: 1, endWeek: 6 }, { name: "Speed-Strength", startWeek: 7, endWeek: 12 }] }];
  const { program } = H.applyAdjustOps(written(), ops, { exercises: LIB });
  const blocks = H.programBlocks(program);
  assert.deepEqual(blocks.map(b => [b.name, b.startWeek, b.endWeek]), [["Foundation", 1, 6], ["Speed-Strength", 7, 12]]);
});

test("phases with a gap are refused", () => {
  assert.throws(() => H.applyAdjustOps(written(), [{ op: "set_phases", phases: [{ name: "A", startWeek: 1, endWeek: 5 }, { name: "B", startWeek: 7, endWeek: 12 }] }], { exercises: LIB }),
    /no gaps/);
});

test("adding weeks stretches the last phase", () => {
  const p = written();
  p.phases = [{ name: "A", startWeek: 1, endWeek: 6 }, { name: "B", startWeek: 7, endWeek: 12 }];
  const { program } = H.applyAdjustOps(p, [{ op: "add_weeks", at: 13, count: 4 }], { exercises: LIB });
  assert.equal(program.weeks, 16);
  assert.deepEqual(program.phases[1], { name: "B", startWeek: 7, endWeek: 16 });
});

test("removing weeks trims the phases to fit", () => {
  const p = written();
  p.phases = [{ name: "A", startWeek: 1, endWeek: 6 }, { name: "B", startWeek: 7, endWeek: 12 }];
  const { program } = H.applyAdjustOps(p, [{ op: "remove_weeks", from: 9, count: 4 }], { exercises: LIB });
  assert.equal(program.weeks, 8);
  assert.deepEqual(program.phases[1], { name: "B", startWeek: 7, endWeek: 8 });
});

test("an id that isn't in the program fails the whole reply and changes nothing", () => {
  const p = written();
  const copy = JSON.stringify(p);
  assert.throws(() => H.applyAdjustOps(p, [
    { op: "update_exercises", exercises: ["x1"], set: { sets: 9 } },
    { op: "update_exercises", exercises: ["nope"], set: { sets: 1 } },
  ], { exercises: LIB }), /isn't in this program/);
  assert.equal(JSON.stringify(p), copy, "the program passed in was changed");
});

test("weeks outside the program are refused", () => {
  assert.throws(() => H.applyAdjustOps(written(), [{ op: "update_exercises", exercises: ["x1"], set: { sets: 2 }, weeks: [11, 14] }], { exercises: LIB }), /outside/);
});

test("a day left empty in some week fails the check", () => {
  const { program } = H.applyAdjustOps(written(), [{ op: "remove_exercises", exercises: ["x3", "x4"], weeks: [2, 2] }], { exercises: LIB });
  assert.match(H.validateAdjustedProgram(program, LIB), /Week 2 of Upper A/);
});

test("a normal change passes the check", () => {
  const { program, newExercises } = H.applyAdjustOps(written(), [{ op: "add_exercise", days: ["d1"], exercise: { name: "Nordic Curl", section: "hypertrophy" } }], { exercises: LIB });
  assert.equal(H.validateAdjustedProgram(program, [...LIB, ...newExercises]), null);
});

test("weekday moves and renames", () => {
  const { program } = H.applyAdjustOps(written(), [
    { op: "update_day", day: "d2", weekday: "Thursday", name: "Upper Power" },
    { op: "rename_program", name: "Fight Camp" },
  ], { exercises: LIB });
  assert.equal(program.days[1].weekday, "Thursday");
  assert.equal(program.days[1].name, "Upper Power");
  assert.equal(program.name, "Fight Camp");
});

test("a new day, copied from another, with fresh exercise ids", () => {
  const { program } = H.applyAdjustOps(written(), [{ op: "add_day", id: "new1", name: "Lower B", weekday: "Friday", copyFrom: "d1" }], { exercises: LIB });
  const d = program.days.find(x => x.id === "new1");
  assert.equal(d.exercises.length, 2);
  assert.notEqual(d.exercises[0].id, "x1");
});

test("the change card counts workouts: one day in one week each", () => {
  const before = written();
  const { program } = H.applyAdjustOps(before, [{ op: "update_exercises", exercises: ["x3"], set: { sets: 3 }, weeks: [5, 8] }], { exercises: LIB });
  const diff = H.adjustDiff(before, program, LIB);
  assert.equal(diff.workouts, 4);
  assert.deepEqual(diff.rows[0].weeks, [5, 6, 7, 8]);
  assert.equal(H.formatWeekList(diff.rows[0].weeks), "Weeks 5 to 8");
  assert.equal(H.formatWeekList([2, 3, 4, 9]), "Weeks 2 to 4, 9");
  assert.equal(H.formatWeekList([3]), "Week 3");
});

test("on a program the app progresses itself, only the weeks really changed are counted", () => {
  const before = generated();
  const { program } = H.applyAdjustOps(before, [{ op: "update_exercises", exercises: ["x3"], set: { sets: 9 }, weeks: [4, 4] }], { exercises: LIB });
  const diff = H.adjustDiff(before, program, LIB);
  assert.equal(diff.workouts, 1);
  assert.deepEqual(diff.rows.map(r => [r.dayId, r.weeks]), [["d2", [4]]]);
});

test("weeks 2, 3 and 5 only, and nothing in between", () => {
  const { program } = H.applyAdjustOps(written(), [{ op: "update_exercises", exercises: ["x3"], set: { sets: 2 }, weeks: [[2, 3], [5, 5]] }], { exercises: LIB });
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(w => at(program, "x3", w).sets), [4, 2, 2, 4, 2, 4]);
});

test("a list of single weeks works too", () => {
  const { program } = H.applyAdjustOps(written(), [{ op: "update_exercises", exercises: ["x3"], set: { reps: "3" }, weeks: [2, 4, 6] }], { exercises: LIB });
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(w => at(program, "x3", w).reps), ["8", "3", "8", "3", "8", "3", "8"]);
});

test("two weeks written as [from, to] is still a range", () => {
  const { program } = H.applyAdjustOps(written(), [{ op: "update_exercises", exercises: ["x3"], set: { sets: 2 }, weeks: [2, 4] }], { exercises: LIB });
  assert.deepEqual([1, 2, 3, 4, 5].map(w => at(program, "x3", w).sets), [4, 2, 2, 2, 4]);
});

test("removed from weeks 3 and 6 only", () => {
  const { program } = H.applyAdjustOps(written(), [{ op: "remove_exercises", exercises: ["x2"], weeks: [[3, 3], [6, 6]] }], { exercises: LIB });
  assert.deepEqual([2, 3, 4, 5, 6, 7].map(w => !!at(program, "x2", w)), [true, false, true, true, false, true]);
});

test("added for weeks 2 and 4 only", () => {
  const { program } = H.applyAdjustOps(written(), [{ op: "add_exercise", days: ["d1"], exercise: { name: "Rower", section: "aerobic" }, weeks: [[2, 2], [4, 4]] }], { exercises: LIB });
  const x = program.days[0].exercises[2];
  assert.deepEqual([1, 2, 3, 4, 5].map(w => !!H.resolveExerciseForWeek(x, w)), [false, true, false, true, false]);
});

test("the newest request carries the program as it is now", () => {
  const msgs = H.buildAdjustMessages([{ role: "assistant", text: "hi" }, { role: "user", text: "a" }, { role: "assistant", text: "b" }], written(), LIB, "make week 4 a deload");
  assert.equal(msgs[0].role, "user", "a conversation has to start with the person");
  const last = msgs[msgs.length - 1];
  assert.match(last.content, /"id":"x1"/);
  assert.match(last.content, /Request: make week 4 a deload$/);
  assert.match(last.content, /"name":"Back Squat"/);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`✖ ${name}\n  ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
