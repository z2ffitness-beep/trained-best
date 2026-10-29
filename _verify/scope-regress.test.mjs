// The bug the coach found, and the two behind it.
//
// What he did: week 1, swapped Leg Swings for a 90/90 Hip Switch, chose "this
// week only". Went to week 2, tried the same swap. It asked him nothing, and
// nothing changed.
//
// The chain: the "this week only" edit pins week 2 back to the old movement.
// An exercise ROW carries a reference to the library, not a name, so the pin
// was written with no name on it. Block detection looks for name changes, so
// it found none, and collapsed a 12-week program to ONE block. One block means
// nothing to scope to, so the second swap asked nothing and wrote to the base
// template — where week 2's pin overruled it. Both symptoms, one chain.
//
// A third bug sat behind those: a per-week entry stored the library reference,
// which is minted fresh on every load. His per-block swaps would have pointed
// at nothing the next morning.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "PHASE_WEEKS", kind: "const" }, { name: "MIN_WEEKS_FOR_DELOAD", kind: "const" },
  { name: "MIN_AUTHORED_BLOCK_WEEKS", kind: "const" }, { name: "WEEK_FIELDS", kind: "const" },
  { name: "phaseIndex", kind: "const" },
  "weekEntryFor", "resolveExerciseForWeek", "weekKeys", "resolvedFields", "tidyByWeek",
  "setWeekEntry", "setFieldsInRange", "clearFieldsInRange", "pinAt", "applyExerciseEdit",
  "buildProgramPlan", "authoredBlockStarts", "authoredBlocks", "authoredBlocksLookReal",
  "dayHasWeeklyPlan", "programHasWeeklyPlan", "programBlocks", "storedPhasesValid",
  "buildDaysWithExerciseIds", "denormalizeByWeek", "denormalizeDays",
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// An exercise row exactly as the app builds it: a reference, and NO name.
const ROW = () => ({ id: "x1", exerciseId: "e-legswings", phase: "warmup_general",
  sets: 1, reps: "10/side", rpe: 3, rest: "—", byWeek: null });
const LIB = { "e-legswings": "Leg Swings", "e-9090": "90/90 Hip Switch" };
const nameFor = id => LIB[id];
const SWAP = { exerciseId: "e-9090", name: "90/90 Hip Switch", phase: "warmup_general" };
const opts = (over) => ({ blocks: H.buildProgramPlan(12).blocks, totalWeeks: 12, nameFor, ...over });
const progOf = (ex) => ({ weeks: 12, days: [{ id: "d1", exercises: [ex] }] });

// ---------- his exact sequence ----------

test("a this-week-only swap does not collapse the program to one block", () => {
  const after = H.applyExerciseEdit(ROW(), SWAP, opts({ scope: "week", week: 1 }));
  assert.equal(H.programBlocks(progOf(after)).length, 3,
    "one block means no scope question, and the next edit goes global in silence");
});

test("the pin records the movement's name, not just its reference", () => {
  const after = H.applyExerciseEdit(ROW(), SWAP, opts({ scope: "week", week: 1 }));
  assert.equal(after.byWeek["2"].name, "Leg Swings",
    "a nameless pin is invisible to block detection and dead after a reload");
  assert.equal(after.byWeek["2"].exerciseId, "e-legswings");
});

test("and the second swap, on week 2, now actually lands", () => {
  const first = H.applyExerciseEdit(ROW(), SWAP, opts({ scope: "week", week: 1 }));
  const blocks = H.programBlocks(progOf(first));
  const second = H.applyExerciseEdit(first, SWAP, { blocks, totalWeeks: 12, nameFor, scope: "week", week: 2 });
  const at = w => H.resolveExerciseForWeek(second, w).exerciseId;
  assert.equal(at(2), "e-9090", "this is what did nothing before");
  assert.equal(at(1), "e-9090");
  assert.equal(at(3), "e-legswings", "and week 3 is still the original");
});

// ---------- when authored blocks are trusted ----------

test("a real imported program keeps its own blocks", () => {
  // The 26-week program's document changes movements at 1, 5, 9, 14, 18, 23.
  const ex = { id: "x", exerciseId: "e1", byWeek: {
    "5": { name: "B" }, "9": { name: "C" }, "14": { name: "D" }, "18": { name: "E" }, "23": { name: "F" } } };
  const blocks = H.programBlocks({ weeks: 26, days: [{ exercises: [ex] }] });
  assert.deepEqual(blocks.map(b => b.startWeek), [1, 5, 9, 14, 18, 23],
    "these are real phases and must not be replaced by a 4-week grid");
});

test("a five-week camp that swaps at week 3 keeps that split", () => {
  const ex = { id: "x", exerciseId: "e1", byWeek: { "3": { name: "Speed Skaters" } } };
  const blocks = H.programBlocks({ weeks: 5, days: [{ exercises: [ex] }] });
  assert.deepEqual(blocks.map(b => b.startWeek), [1, 3]);
});

test("a one-week block is an edit, not a phase, and is rejected", () => {
  assert.equal(H.authoredBlocksLookReal([{ startWeek: 1, endWeek: 1 }, { startWeek: 2, endWeek: 12 }]), false);
  assert.equal(H.authoredBlocksLookReal([{ startWeek: 1, endWeek: 4 }, { startWeek: 5, endWeek: 12 }]), true);
  assert.equal(H.authoredBlocksLookReal([{ startWeek: 1, endWeek: 12 }]), false, "one block is not a split");
  assert.equal(H.authoredBlocksLookReal([]), false);
  assert.equal(H.authoredBlocksLookReal(null), false);
});

test("the shortest allowed block matches the constant", () => {
  const n = H.MIN_AUTHORED_BLOCK_WEEKS;
  assert.equal(H.authoredBlocksLookReal([{ startWeek: 1, endWeek: n }, { startWeek: n + 1, endWeek: 12 }]), true);
  assert.equal(H.authoredBlocksLookReal([{ startWeek: 1, endWeek: n - 1 }, { startWeek: n, endWeek: 12 }]), false);
});

test("a program with no per-week plan just gets the regular phases", () => {
  assert.deepEqual(H.programBlocks({ weeks: 12, days: [{ exercises: [{ id: "x" }] }] }).map(b => b.startWeek),
    [1, 5, 9]);
});

// ---------- surviving a reload ----------

test("a swapped movement survives a save and reload", () => {
  // The reference in a per-week entry is minted fresh on every load. Storing
  // it would point at nothing tomorrow — the movement would revert or blank.
  const state0 = { exercises: [{ id: "e-legswings", name: "Leg Swings", phase: "warmup_general" }] };
  const raw = [{ name: "Day 1", exercises: [
    { name: "Leg Swings", phase: "warmup_general", sets: 1, reps: "10/side", rpe: 3, rest: "—" }] }];

  const { days, newExercises } = H.buildDaysWithExerciseIds(raw, state0);
  let state = { exercises: [...state0.exercises, ...newExercises] };
  const row = days[0].exercises[0];

  const edited = H.applyExerciseEdit(row, { exerciseId: "e-9090", name: "90/90 Hip Switch", phase: "warmup_general" },
    { blocks: H.buildProgramPlan(12).blocks, totalWeeks: 12, scope: "week", week: 1,
      nameFor: id => [...state.exercises, { id: "e-9090", name: "90/90 Hip Switch" }].find(e => e.id === id)?.name });
  state = { exercises: [...state.exercises, { id: "e-9090", name: "90/90 Hip Switch", phase: "warmup_general" }] };

  // Save, then load again from what was saved.
  const saved = H.denormalizeDays([{ ...days[0], exercises: [edited] }], state);
  assert.equal(saved[0].exercises[0].byWeek["1"].name, "90/90 Hip Switch",
    "the movement must be stored by name");
  assert.equal(saved[0].exercises[0].byWeek["1"].exerciseId, undefined,
    "and the local reference must NOT be stored");

  const reloaded = H.buildDaysWithExerciseIds(saved, { exercises: [] });
  const back = reloaded.days[0].exercises[0];
  const wk1 = H.resolveExerciseForWeek(back, 1);
  const wk2 = H.resolveExerciseForWeek(back, 2);
  const nameOf = id => reloaded.newExercises.find(e => e.id === id)?.name;
  assert.equal(nameOf(wk1.exerciseId), "90/90 Hip Switch", "week 1 reverted after a reload");
  assert.equal(nameOf(wk2.exerciseId), "Leg Swings", "week 2 lost its pin after a reload");
});

test("loading resolves every per-week movement to something real", () => {
  const raw = [{ name: "D", exercises: [
    { name: "Back Squat", phase: "compound", byWeek: { "5": { name: "Front Squat" }, "9": { sets: 4 } } }] }];
  const { days, newExercises } = H.buildDaysWithExerciseIds(raw, { exercises: [] });
  const by = days[0].exercises[0].byWeek;
  assert.ok(by["5"].exerciseId, "an entry that names a movement must get a reference");
  assert.equal(newExercises.find(e => e.id === by["5"].exerciseId).name, "Front Squat");
  assert.equal(by["9"].exerciseId, undefined, "an entry that only changes sets must NOT get one");
  assert.equal(by["9"].sets, 4);
});

test("the same movement in two per-week entries shares one library entry", () => {
  const raw = [{ name: "D", exercises: [
    { name: "Back Squat", phase: "compound", byWeek: { "5": { name: "Front Squat" } } },
    { name: "Bench", phase: "compound", byWeek: { "5": { name: "Front Squat" } } }] }];
  const { newExercises } = H.buildDaysWithExerciseIds(raw, { exercises: [] });
  assert.equal(newExercises.filter(e => e.name === "Front Squat").length, 1,
    "a duplicate library entry per use came back on every login last time");
});

test("saving drops an entry that has nothing left in it", () => {
  assert.equal(H.denormalizeByWeek(null, { exercises: [] }), null);
  assert.equal(H.denormalizeByWeek({}, { exercises: [] }), null);
});

test("saving keeps a skip", () => {
  const out = H.denormalizeByWeek({ "3": { skip: true } }, { exercises: [] });
  assert.equal(out["3"].skip, true, "a week that drops the movement must stay dropped");
});

test("saving keeps an entry's other fields alongside the movement name", () => {
  const out = H.denormalizeByWeek(
    { "5": { exerciseId: "e1", sets: 4, reps: "5 @ 80%", rpe: 8 } },
    { exercises: [{ id: "e1", name: "Front Squat" }] });
  assert.equal(out["5"].name, "Front Squat");
  assert.equal(out["5"].sets, 4, "the loading must not be dropped along with the reference");
  assert.equal(out["5"].reps, "5 @ 80%");
  assert.equal(out["5"].rpe, 8);
  assert.equal(out["5"].exerciseId, undefined);
});

test("a sets-only edit does not invent a block boundary", () => {
  // Pinning a name on every edit would make "drop the sets this week" look
  // like a phase change, and one bogus one-week phase discards the whole
  // authored block list for a plain 4-week grid.
  const ex = { id: "x", exerciseId: "e1", sets: 3, byWeek: {
    "5": { name: "B" }, "9": { name: "C" }, "14": { name: "D" }, "18": { name: "E" }, "23": { name: "F" } } };
  const blocks = H.programBlocks({ weeks: 26, days: [{ exercises: [ex] }] });
  const edited = H.applyExerciseEdit(ex, { sets: 1 },
    { blocks, totalWeeks: 26, nameFor: () => "Back Squat", scope: "week", week: 6 });
  assert.equal(edited.byWeek["7"].name, undefined,
    "a sets pin must not carry a movement name");
  assert.deepEqual(H.programBlocks({ weeks: 26, days: [{ exercises: [edited] }] }).map(b => b.startWeek),
    [1, 5, 9, 14, 18, 23], "the document's real phases must survive an unrelated edit");
});

// ---------- wiring ----------

test("both screens ask programBlocks, not authoredBlocks directly", () => {
  for (const fn of ["function AthleteProgram(", "function CoachAthleteDetail("]) {
    const at = src.indexOf(fn);
    const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
    assert.ok(/blocks: programBlocks\(/.test(body), `${fn} must go through the guarded list`);
    assert.ok(!/blocks: authoredBlocks\(/.test(body), `${fn} must not use the raw detection`);
  }
});

test("both screens hand the engine a way to look up movement names", () => {
  const uses = (src.match(/nameFor: id => exById\(id\)\?\.name/g) || []).length;
  assert.equal(uses, 2, "without this the pins go back to being nameless");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
