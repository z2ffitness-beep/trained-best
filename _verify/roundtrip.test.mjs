// Does a program survive a trip to the database and back?
//
// buildDaysWithExerciseIds (database → app) and denormalizeDays (app →
// database) each enumerate the fields they carry, by hand, in two separate
// lists. The comments above both lists warn that a field missing from either
// one "appears to save and then reverts on reload".
//
// It happened anyway, to the most important field in the file. `byWeek` — the
// per-week plan, the thing that makes week 9 different from week 1 — was in
// neither list. So every program loaded as its first week repeated forever
// however much progression the row held, and the first save from inside the
// app deleted that progression from the database for good. The coach's own
// 26-week program had 22 weekly entries on a single squat and not one of them
// reached his screen.
//
// A comment is not a test. These are.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "PHASES", kind: "const" }, { name: "phaseIndex", kind: "const" },
  "denormalizeByWeek", "buildDaysWithExerciseIds", "denormalizeDays",
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// A day as the database holds it: names, no local ids.
const RAW = () => [{
  name: "Monday Hard A",
  weekday: "Monday",
  why: "Lower-body strength and sprint work.",
  mode: "in_person",
  exercises: [
    { name: "Full-Range Back Squat", phase: "compound", sets: 3, reps: "8 @ 65%", rpe: 7, rest: "3 min",
      byWeek: { "5": { sets: 4, reps: "5 @ 80%", rpe: 8 }, "9": { name: "Speed Squat", reps: "3 @ 60%" } } },
    { name: "Pull-Up", phase: "compound", sets: 2, reps: "8", rpe: 6, rest: "90s",
      groupId: "a", groupKind: "superset", groupRounds: 3 },
  ],
}];
const STATE = { exercises: [{ id: "e1", name: "Full-Range Back Squat", phase: "compound" }] };

// ---------- the bug ----------

test("the per-week plan survives the trip in from the database", () => {
  const { days } = H.buildDaysWithExerciseIds(RAW(), STATE);
  const squat = days[0].exercises[0];
  assert.ok(squat.byWeek, "byWeek was dropped — the program loads flat");
  assert.deepEqual(Object.keys(squat.byWeek).sort(), ["5", "9"]);
  assert.equal(squat.byWeek["5"].reps, "5 @ 80%");
  assert.equal(squat.byWeek["9"].name, "Speed Squat");
});

test("and the trip back out to the database", () => {
  const { days, newExercises } = H.buildDaysWithExerciseIds(RAW(), STATE);
  const state = { exercises: [...STATE.exercises, ...newExercises] };
  const out = H.denormalizeDays(days, state);
  assert.ok(out[0].exercises[0].byWeek, "the first save would have deleted it permanently");
  assert.deepEqual(out[0].exercises[0].byWeek, RAW()[0].exercises[0].byWeek);
});

test("a full round trip changes nothing about the plan", () => {
  // Load, save, load again. The coach reorders one warm-up; six months of
  // authored progression must still be there afterwards.
  const { days: d1, newExercises: n1 } = H.buildDaysWithExerciseIds(RAW(), STATE);
  const s1 = { exercises: [...STATE.exercises, ...n1] };
  const saved = H.denormalizeDays(d1, s1);
  const { days: d2, newExercises: n2 } = H.buildDaysWithExerciseIds(saved, s1);
  const s2 = { exercises: [...s1.exercises, ...n2] };
  const saved2 = H.denormalizeDays(d2, s2);
  assert.deepEqual(saved2, saved, "the second round trip must be identical to the first");
  assert.deepEqual(saved2[0].exercises[0].byWeek, RAW()[0].exercises[0].byWeek);
});

test("an exercise with no per-week plan round-trips as null, not undefined", () => {
  const { days, newExercises } = H.buildDaysWithExerciseIds(RAW(), STATE);
  const state = { exercises: [...STATE.exercises, ...newExercises] };
  assert.equal(days[0].exercises[1].byWeek, null);
  assert.equal(H.denormalizeDays(days, state)[0].exercises[1].byWeek, null,
    "undefined disappears from JSON and reads back differently");
});

// ---------- the class of bug, not just this instance ----------

test("the two field lists agree — neither may carry what the other drops", () => {
  // The structural test that would have caught byWeek before it shipped, and
  // catches the next field someone adds to one list and forgets in the other.
  const grab = (fn, marker) => {
    const at = src.indexOf(fn);
    assert.notEqual(at, -1, fn);
    const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
    const ret = body.indexOf(marker);
    assert.notEqual(ret, -1, `${fn}: could not find the exercise return`);
    const chunk = body.slice(ret, body.indexOf("};", ret));
    // Keys at the start of a line or after "{ " / ", ", ignoring comments.
    return new Set(chunk.split("\n").filter(l => !l.trim().startsWith("//"))
      .join("\n").match(/(\w+):/g)?.map(k => k.slice(0, -1)) || []);
  };
  const inbound = grab("function buildDaysWithExerciseIds(", 'id: "x" + Math.random()');
  const outbound = grab("function denormalizeDays(", 'name: ex?.name || "Unknown Exercise"');

  // Legitimately asymmetric: the app addresses exercises by a local id that
  // the database does not store, and the database stores a name the app
  // resolves to that id.
  const appOnly = new Set(["id", "exerciseId"]);
  const dbOnly = new Set(["name"]);

  const missingOutbound = [...inbound].filter(k => !outbound.has(k) && !appOnly.has(k));
  const missingInbound = [...outbound].filter(k => !inbound.has(k) && !dbOnly.has(k));
  assert.deepEqual(missingOutbound, [],
    `carried in but not saved — these revert on the next reload: ${missingOutbound.join(", ")}`);
  assert.deepEqual(missingInbound, [],
    `saved but not carried in — these are invisible in the app: ${missingInbound.join(", ")}`);
});

test("byWeek is named in both lists explicitly", () => {
  for (const fn of ["function buildDaysWithExerciseIds(", "function denormalizeDays("]) {
    const at = src.indexOf(fn);
    const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
    assert.ok(/byWeek: (x\.byWeek \|\| null|byWeek|denormalizeByWeek\()/.test(body), `${fn} must carry byWeek`);
  }
});

// ---------- the rest of the day must round-trip too ----------

test("the day's own fields survive both directions", () => {
  const { days, newExercises } = H.buildDaysWithExerciseIds(RAW(), STATE);
  const state = { exercises: [...STATE.exercises, ...newExercises] };
  const out = H.denormalizeDays(days, state)[0];
  assert.equal(out.name, "Monday Hard A");
  assert.equal(out.weekday, "Monday");
  assert.equal(out.why, "Lower-body strength and sprint work.");
  assert.equal(out.mode, "in_person", "in-person vs online must not be lost on a save");
});

test("superset grouping survives", () => {
  const { days, newExercises } = H.buildDaysWithExerciseIds(RAW(), STATE);
  const state = { exercises: [...STATE.exercises, ...newExercises] };
  const out = H.denormalizeDays(days, state)[0].exercises[1];
  assert.equal(out.groupId, "a");
  assert.equal(out.groupKind, "superset");
  assert.equal(out.groupRounds, 3);
});

test("the saved order is kept, not re-sorted by phase", () => {
  // Reordering that crossed a phase boundary used to stick and then snap back.
  const raw = [{ name: "D", exercises: [
    { name: "Full-Range Back Squat", phase: "compound" },
    { name: "Leg Swings", phase: "warmup_general" },
  ] }];
  const { days } = H.buildDaysWithExerciseIds(raw, STATE);
  assert.deepEqual(days[0].exercises.map(x => x.phase), ["compound", "warmup_general"],
    "a reload must not reorder what the coach arranged");
});

test("a freshly generated program IS sorted by phase", () => {
  const raw = [{ name: "D", exercises: [
    { name: "Full-Range Back Squat", phase: "compound" },
    { name: "Leg Swings", phase: "warmup_general" },
  ] }];
  const { days } = H.buildDaysWithExerciseIds(raw, STATE, { sortByPhase: true });
  assert.deepEqual(days[0].exercises.map(x => x.phase), ["warmup_general", "compound"]);
});

test("a repeated exercise does not mint a duplicate library entry per use", () => {
  const raw = [{ name: "A", exercises: [{ name: "Scorpions", phase: "warmup_general" }] },
               { name: "B", exercises: [{ name: "Scorpions", phase: "warmup_general" }] }];
  const { days, newExercises } = H.buildDaysWithExerciseIds(raw, { exercises: [] });
  assert.equal(newExercises.length, 1, "one new library entry, used twice");
  assert.equal(days[0].exercises[0].exerciseId, days[1].exercises[0].exerciseId);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
