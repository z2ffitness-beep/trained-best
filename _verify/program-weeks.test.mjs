// Adding and removing weeks, and the phases made of them.
//
// A coach must be able to delete any part of a program: the whole thing, a
// phase, a week, a session, a section, one movement — and add any of them
// back. The parts that already existed were program, session, section and
// movement. Weeks and phases did not, and they are the two that need real
// care, because removing week 6 renumbers every week above it.
//
// The trap: a week that moves up into the gap. If the deleted span held the
// entry that week was reading, deleting it drops the week back to the base
// template — it keeps its number and quietly loses its prescription.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const bodyOf = (fn) => {
  const at = src.indexOf(fn);
  assert.notEqual(at, -1, `${fn} not found`);
  return src.slice(at, src.indexOf("\nfunction ", at + 1));
};
const H = await load(APP, [
  { name: "PHASE_WEEKS", kind: "const" }, { name: "MIN_WEEKS_FOR_DELOAD", kind: "const" },
  "weekEntryFor", "resolveExerciseForWeek", "weekKeys",
  "shiftExerciseWeeks", "removeProgramWeeks", "insertProgramWeeks",
  "removeProgramBlock", "appendProgramBlock", "buildProgramPlan",
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// A 12-week squat: 65% for the first block, 80% for the second, 90% for the third.
const EX = () => ({ id: "x1", exerciseId: "e1", sets: 3, reps: "8 @ 65%", rpe: 7,
  byWeek: { "5": { reps: "5 @ 80%", rpe: 8 }, "9": { reps: "3 @ 90%", rpe: 9 } } });
const PROG = () => ({ id: "p", weeks: 12, days: [{ id: "d1", name: "Day 1", exercises: [EX()] }] });
const across = (prog, field) => {
  const ex = prog.days[0].exercises[0];
  return Array.from({ length: prog.weeks }, (_, i) => H.resolveExerciseForWeek(ex, i + 1)[field]);
};

// ---------- removing weeks ----------

test("deleting one week shortens the program and closes the gap", () => {
  const out = H.removeProgramWeeks(PROG(), 6, 1);
  assert.equal(out.weeks, 11);
  assert.deepEqual(across(out, "reps"), [
    "8 @ 65%","8 @ 65%","8 @ 65%","8 @ 65%",
    "5 @ 80%","5 @ 80%","5 @ 80%",      // week 6 gone, block 2 is now 3 weeks
    "3 @ 90%","3 @ 90%","3 @ 90%","3 @ 90%"]);
});

test("deleting a whole phase removes exactly its weeks", () => {
  const plan = H.buildProgramPlan(12);
  const out = H.removeProgramBlock(PROG(), plan.blocks[1]);   // weeks 5-8
  assert.equal(out.weeks, 8);
  assert.deepEqual(across(out, "reps"), [
    "8 @ 65%","8 @ 65%","8 @ 65%","8 @ 65%",
    "3 @ 90%","3 @ 90%","3 @ 90%","3 @ 90%"], "block 3 must move up intact");
});

test("deleting the first phase leaves the rest reading correctly", () => {
  const plan = H.buildProgramPlan(12);
  const out = H.removeProgramBlock(PROG(), plan.blocks[0]);   // weeks 1-4
  assert.equal(out.weeks, 8);
  assert.deepEqual(across(out, "reps"), [
    "5 @ 80%","5 @ 80%","5 @ 80%","5 @ 80%",
    "3 @ 90%","3 @ 90%","3 @ 90%","3 @ 90%"]);
});

test("deleting the last phase just shortens the program", () => {
  const plan = H.buildProgramPlan(12);
  const out = H.removeProgramBlock(PROG(), plan.blocks[2]);   // weeks 9-12
  assert.equal(out.weeks, 8);
  assert.deepEqual(across(out, "reps").slice(4), ["5 @ 80%","5 @ 80%","5 @ 80%","5 @ 80%"]);
});

test("the week that moves up keeps what it was actually showing", () => {
  // THE trap. Deleting weeks 5-6 destroys the entry at week 5, and old week 7
  // was reading it. Without a pin, new week 5 falls back to the base and the
  // whole of block 2 silently reverts to 65%.
  const out = H.removeProgramWeeks(PROG(), 5, 2);
  assert.equal(out.weeks, 10);
  assert.deepEqual(across(out, "reps"), [
    "8 @ 65%","8 @ 65%","8 @ 65%","8 @ 65%",
    "5 @ 80%","5 @ 80%",              // must NOT have reverted to 65%
    "3 @ 90%","3 @ 90%","3 @ 90%","3 @ 90%"]);
  assert.deepEqual(across(out, "rpe"), [7,7,7,7,8,8,9,9,9,9]);
});

test("no pin is invented when the surviving weeks already read correctly", () => {
  // Deleting weeks 2-3 touches no entry, so nothing extra should be written.
  const out = H.removeProgramWeeks(PROG(), 2, 2);
  assert.deepEqual(H.weekKeys(out.days[0].exercises[0]), [3, 7],
    "the two original entries, shifted — and no third one");
});

test("no pin when the surviving week already reads a surviving entry", () => {
  // Deleting weeks 6-7: old week 8 was reading the entry at week 5, which
  // survives untouched, so new week 6 reads it naturally. Writing a pin here
  // would duplicate that entry for no reason and clutter the block detection.
  const out = H.removeProgramWeeks(PROG(), 6, 2);
  assert.deepEqual(H.weekKeys(out.days[0].exercises[0]), [5, 7],
    "exactly the two original entries, one of them shifted");
  assert.deepEqual(across(out, "reps"), [
    "8 @ 65%","8 @ 65%","8 @ 65%","8 @ 65%",
    "5 @ 80%","5 @ 80%",
    "3 @ 90%","3 @ 90%","3 @ 90%","3 @ 90%"]);
});

test("deleting from partway to the end needs no pin", () => {
  const out = H.removeProgramWeeks(PROG(), 10, 3);
  assert.equal(out.weeks, 9);
  assert.equal(across(out, "reps")[8], "3 @ 90%");
});

test("a program cannot be deleted down to nothing", () => {
  const p = PROG();
  assert.equal(H.removeProgramWeeks(p, 1, 12), p, "that is what Delete program is for");
  assert.equal(H.removeProgramWeeks(p, 1, 99), p);
  assert.equal(H.removeProgramWeeks(p, 1, 11).weeks, 1, "but down to one is allowed");
});

test("deleting past the end of the program does nothing", () => {
  const p = PROG();
  assert.equal(H.removeProgramWeeks(p, 13, 2), p);
  assert.equal(H.removeProgramWeeks(p, 99, 1), p);
});

test("an overlong span is clamped to the end rather than overrunning", () => {
  const out = H.removeProgramWeeks(PROG(), 10, 99);
  assert.equal(out.weeks, 9);
});

// ---------- adding weeks ----------

test("inserting a week lengthens the program and pushes later weeks along", () => {
  const out = H.insertProgramWeeks(PROG(), 5, 1);
  assert.equal(out.weeks, 13);
  assert.deepEqual(across(out, "reps"), [
    "8 @ 65%","8 @ 65%","8 @ 65%","8 @ 65%",
    "8 @ 65%",                        // the new week carries on from week 4
    "5 @ 80%","5 @ 80%","5 @ 80%","5 @ 80%",
    "3 @ 90%","3 @ 90%","3 @ 90%","3 @ 90%"]);
});

test("adding a phase puts it on the end at the usual length", () => {
  const out = H.appendProgramBlock(PROG());
  assert.equal(out.weeks, 12 + H.PHASE_WEEKS);
  const reps = across(out, "reps");
  assert.equal(reps[12], "3 @ 90%", "a new phase carries on from the last one until it is written");
  assert.deepEqual(H.weekKeys(out.days[0].exercises[0]), [5, 9], "and writes no entries of its own");
});

test("inserting at the very start pushes everything down", () => {
  const out = H.insertProgramWeeks(PROG(), 1, 2);
  assert.equal(out.weeks, 14);
  assert.deepEqual(H.weekKeys(out.days[0].exercises[0]), [7, 11]);
});

test("insert then remove the same span puts the program back exactly", () => {
  const before = PROG();
  const round = H.removeProgramWeeks(H.insertProgramWeeks(before, 5, 3), 5, 3);
  assert.equal(round.weeks, before.weeks);
  assert.deepEqual(across(round, "reps"), across(before, "reps"));
  assert.deepEqual(H.weekKeys(round.days[0].exercises[0]),
    H.weekKeys(before.days[0].exercises[0]));
});

// ---------- not breaking anything else ----------

test("every day and every movement is carried through", () => {
  const prog = { id: "p", weeks: 12, days: [
    { id: "d1", name: "Mon", weekday: "Monday", skipRanges: [{ from: "2026-10-01", to: "2026-10-07" }],
      exercises: [EX(), { id: "x2", exerciseId: "e2" }] },
    { id: "d2", name: "Thu", exercises: [{ id: "x3", exerciseId: "e3", byWeek: { "9": { sets: 2 } } }] },
  ] };
  const out = H.removeProgramWeeks(prog, 5, 4);
  assert.equal(out.days.length, 2);
  assert.deepEqual(out.days.map(d => d.name), ["Mon", "Thu"]);
  assert.equal(out.days[0].exercises.length, 2);
  assert.equal(out.days[0].weekday, "Monday", "the weekday pinning must survive");
  assert.deepEqual(out.days[0].skipRanges, [{ from: "2026-10-01", to: "2026-10-07" }],
    "skip ranges are dates, not week numbers, and must be left alone");
  assert.deepEqual(H.weekKeys(out.days[1].exercises[0]), [5], "week 9 becomes week 5");
});

test("a movement with no per-week plan is untouched", () => {
  const ex = { id: "x", exerciseId: "e", sets: 3 };
  assert.equal(H.shiftExerciseWeeks(ex, 5, 8, 12), ex);
});

test("an exercise left with no entries reports none rather than an empty map", () => {
  const ex = { id: "x", exerciseId: "e", byWeek: { "6": { sets: 9 } } };
  const out = H.shiftExerciseWeeks(ex, 5, 8, 8);
  assert.equal(out.byWeek, null, "an empty map would claim the program still has a plan");
});

test("nothing is mutated", () => {
  const p = PROG();
  const snap = JSON.stringify(p);
  H.removeProgramWeeks(p, 5, 4);
  H.insertProgramWeeks(p, 3, 2);
  H.appendProgramBlock(p);
  H.removeProgramBlock(p, { startWeek: 1, endWeek: 4 });
  assert.equal(JSON.stringify(p), snap);
});

test("junk arguments do not throw", () => {
  assert.equal(H.removeProgramWeeks(null, 1, 1), null);
  assert.equal(H.insertProgramWeeks(null, 1, 1), null);
  assert.equal(H.removeProgramBlock(PROG(), null).weeks, 12);
  const p = PROG();
  assert.equal(H.removeProgramWeeks(p, 0, 1).weeks, 11, "week 0 reads as week 1");
  assert.equal(H.insertProgramWeeks(p, 99, 1).weeks, 13, "past the end appends");
  assert.equal(H.removeProgramWeeks(p, 5, 0).weeks, 11, "a count of zero reads as one");
});


// ---------- wiring ----------

test("both screens can add and remove weeks and phases", () => {
  // 29 Oct: the coach's per-day editor is gone. A coach adds and removes
  // weeks and phases with Adjust with AI (add_weeks, remove_weeks,
  // set_phases), which adjust-ai.test.mjs covers.
  assert.match(src, /case "add_weeks": \{/);
  assert.match(src, /case "remove_weeks": \{/);
  for (const fn of ["function AthleteProgram("]) {
    const at = src.indexOf(fn);
    const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
    assert.ok(/<WeeksModal/.test(body), `${fn} must offer it`);
    // A modal nobody can open is the same as no modal.
    assert.ok(/onClick=\{\(\) => setWeeksOpen\(true\)\}/.test(body), `${fn} needs a way in`);
    assert.ok(/open=\{weeksOpen\}/.test(body), `${fn}: the modal must read that state`);
    assert.ok(/insertProgramWeeks\(prog, at, 1\)/.test(body), `${fn}: add a week`);
    assert.ok(/appendProgramBlock\(prog\)/.test(body), `${fn}: add a phase`);
    assert.ok(/removeProgramWeeks\(prog, w, 1\)/.test(body), `${fn}: remove a week`);
    assert.ok(/removeProgramBlock\(prog, b\)/.test(body), `${fn}: remove a phase`);
  }
});

test("the program's new LENGTH is saved, not just its days", () => {
  // Every save path before this wrote days alone, so a program that got
  // shorter stayed the old length in the database and grew back on reload.
  const saves = (src.match(/updateProgramRow\([^)]*\{ weeks: updated\.weeks \}\)/g) || []).length;
  assert.equal(saves, 2, "both screens must save the length");
  const at = src.indexOf("async function updateProgramRow(");
  const body = src.slice(at, src.indexOf("\n}", at));
  assert.ok(/extra = null/.test(body) && /\.\.\.\(extra \|\| \{\}\)/.test(body),
    "the save has to accept fields outside the days");
});

test("the week on screen cannot outlive the program", () => {
  const at = src.indexOf("function AthleteProgram(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/setViewWeek\(w => \(w \? Math\.min\(w, updated\.weeks\) : w\)\)/.test(body),
    "deleting the last week while looking at it must not strand the screen");
  const cat = src.indexOf("function CoachAthleteDetail(");
  const cbody = src.slice(cat, src.indexOf("\nfunction ", cat + 1));
  assert.ok(/setEditBlockStart\(w => Math\.min\(w, updated\.weeks\)\)/.test(cbody),
    "same for the block strip");
});

test("the modal refuses to delete the only week", () => {
  const body = bodyOf("function WeeksModal(");
  assert.ok(/const lastWeek = weeks <= 1;/.test(body));
  assert.ok(/disabled=\{lastWeek\}/.test(body));
  assert.ok(/A program needs at least one week/.test(body));
});

test("the modal says what will happen before it happens", () => {
  const body = bodyOf("function WeeksModal(");
  assert.ok(/The program becomes \$\{weeks - 1\} weeks/.test(body), "deleting a week");
  assert.ok(/Weeks \$\{here\.startWeek\}–\$\{here\.endWeek\} go/.test(body), "deleting a phase");
  assert.ok(/the weeks after move up and keep what they were prescribed/.test(body));
});

test("deleting a phase is offered only when there is more than one", () => {
  const body = bodyOf("function WeeksModal(");
  assert.ok(/here && blocks\.length > 1 && \(/.test(body),
    "deleting the only phase is deleting the program, which is a different button");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
