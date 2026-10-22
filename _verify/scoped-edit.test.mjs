// Changing one movement, across a span the coach chooses.
//
// The coach's case: in a new phase you swap the primary lift for a new one.
// That is a BLOCK change. Cutting the sets because someone turned up beaten up
// is a THIS WEEK change. Fixing a movement that was wrong from the start is an
// EVERY WEEK change. The edit looks identical in all three; only the coach
// knows which it is, so the app asks.
//
// Getting it wrong is expensive both ways. Too narrow and a coach fixes one
// typo twenty times. Too wide and a single tweak silently overwrites six
// months of authored progression — which is exactly what the app did before.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "EDIT_SCOPES", kind: "const" }, { name: "DEFAULT_EDIT_SCOPE", kind: "const" },
  { name: "WEEK_FIELDS", kind: "const" },
  "weekEntryFor", "resolveExerciseForWeek",
  "weekKeys", "resolvedFields", "tidyByWeek", "setWeekEntry",
  "setFieldsInRange", "clearFieldsInRange", "pinAt", "applyExerciseEdit", "blockSummaryFor",
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// A 12-week program in three 4-week blocks.
const BLOCKS = [
  { index: 1, startWeek: 1, endWeek: 4 },
  { index: 2, startWeek: 5, endWeek: 8 },
  { index: 3, startWeek: 9, endWeek: 12 },
];
const OPTS = (over = {}) => ({ blocks: BLOCKS, totalWeeks: 12, ...over });

// Front squat throughout, with real per-week loading already written.
const SQUAT = () => ({
  id: "x1", exerciseId: "e-front", name: "Front Squat", phase: "compound",
  sets: 3, reps: "8 @ 65%", rpe: 7,
  byWeek: { "5": { sets: 4, reps: "5 @ 80%", rpe: 8 }, "9": { sets: 3, reps: "3 @ 90%", rpe: 9 } },
});
const shown = (ex, week, field) => {
  const at = H.resolveExerciseForWeek(ex, week);
  return at ? at[field] : null;
};
const across = (ex, field) => [1,2,3,4,5,6,7,8,9,10,11,12].map(w => shown(ex, w, field));

// ---------- this block only ----------

test("swapping the lift for one block leaves the others alone", () => {
  // The coach's own example: a new primary movement for a new phase.
  const out = H.applyExerciseEdit(SQUAT(), { exerciseId: "e-back", name: "Back Squat" },
    OPTS({ scope: "block", week: 6 }));
  assert.deepEqual(across(out, "name"),
    ["Front Squat","Front Squat","Front Squat","Front Squat",
     "Back Squat","Back Squat","Back Squat","Back Squat",
     "Front Squat","Front Squat","Front Squat","Front Squat"]);
});

test("and the exercise the screen looks up changes with it", () => {
  // The screen resolves the movement by exerciseId, not by name. A name-only
  // change would have renamed the row and gone on showing the old exercise.
  const out = H.applyExerciseEdit(SQUAT(), { exerciseId: "e-back", name: "Back Squat" },
    OPTS({ scope: "block", week: 6 }));
  assert.equal(shown(out, 6, "exerciseId"), "e-back");
  assert.equal(shown(out, 9, "exerciseId"), "e-front");
});

test("a block change does not disturb the loading written inside other blocks", () => {
  const out = H.applyExerciseEdit(SQUAT(), { name: "Back Squat" }, OPTS({ scope: "block", week: 6 }));
  assert.deepEqual(across(out, "reps"),
    ["8 @ 65%","8 @ 65%","8 @ 65%","8 @ 65%",
     "5 @ 80%","5 @ 80%","5 @ 80%","5 @ 80%",
     "3 @ 90%","3 @ 90%","3 @ 90%","3 @ 90%"]);
  assert.deepEqual(across(out, "rpe"), [7,7,7,7,8,8,8,8,9,9,9,9]);
});

test("editing the last block needs no pin — there is nothing after it", () => {
  const out = H.applyExerciseEdit(SQUAT(), { name: "Speed Squat" }, OPTS({ scope: "block", week: 11 }));
  assert.deepEqual(across(out, "name").slice(8), ["Speed Squat","Speed Squat","Speed Squat","Speed Squat"]);
  assert.equal(shown(out, 8, "name"), "Front Squat");
  assert.equal(out.byWeek["13"], undefined, "no entry past the end of the program");
});

test("editing block 1 changes block 1 only", () => {
  const out = H.applyExerciseEdit(SQUAT(), { sets: 5 }, OPTS({ scope: "block", week: 2 }));
  assert.deepEqual(across(out, "sets"), [5,5,5,5,4,4,4,4,3,3,3,3]);
});


test("a block change reaches every week of the block, not just the first", () => {
  // The bug the fallback test exposed. Entries do not cascade: deleting a
  // field from a mid-block entry drops that week to the BASE value, so the
  // edit applied to week 5 and silently stopped at week 6.
  const ex = SQUAT();
  ex.byWeek["6"] = { rpe: 9 };            // an entry mid-block naming another field
  const out = H.applyExerciseEdit(ex, { sets: 7 }, OPTS({ scope: "block", week: 5 }));
  assert.deepEqual(across(out, "sets").slice(4, 8), [7, 7, 7, 7],
    "weeks 6-8 fell back to the base instead of taking the change");
  assert.equal(shown(out, 6, "rpe"), 9, "and the entry's own field survived");
});

test("setFieldsInRange writes the value; clearFieldsInRange removes it", () => {
  // Two nearly identical helpers, used for opposite reasons. Pin the
  // difference so neither gets "simplified" into the other.
  const ex = { id: "x", sets: 3, byWeek: { "5": { sets: 4, rpe: 8 } } };
  assert.equal(H.setFieldsInRange(ex, 1, 12, { sets: 9 }, ["sets"]).byWeek["5"].sets, 9);
  assert.equal(H.clearFieldsInRange(ex, 1, 12, ["sets"]).byWeek["5"].sets, undefined);
  assert.equal(H.clearFieldsInRange(ex, 1, 12, ["sets"]).byWeek["5"].rpe, 8, "other fields kept");
});

// ---------- this week only ----------

test("a one-week change reverts the week after", () => {
  const out = H.applyExerciseEdit(SQUAT(), { sets: 1 }, OPTS({ scope: "week", week: 6 }));
  assert.deepEqual(across(out, "sets"), [3,3,3,3,4,1,4,4,3,3,3,3]);
});

test("a one-week change on the last week of a block does not bleed into the next", () => {
  const out = H.applyExerciseEdit(SQUAT(), { sets: 1 }, OPTS({ scope: "week", week: 8 }));
  assert.deepEqual(across(out, "sets"), [3,3,3,3,4,4,4,1,3,3,3,3],
    "week 9 must still be the block-3 prescription");
});

test("a one-week change in the final week writes no pin past the end", () => {
  const out = H.applyExerciseEdit(SQUAT(), { sets: 1 }, OPTS({ scope: "week", week: 12 }));
  assert.deepEqual(across(out, "sets"), [3,3,3,3,4,4,4,4,3,3,3,1]);
  assert.equal(out.byWeek["13"], undefined);
});

// ---------- every week ----------

test("every week rewrites the base and releases the field everywhere", () => {
  const out = H.applyExerciseEdit(SQUAT(), { name: "Box Squat" }, OPTS({ scope: "all", week: 6 }));
  assert.deepEqual(new Set(across(out, "name")), new Set(["Box Squat"]));
  assert.equal(out.name, "Box Squat", "the base template is the change");
});

test("every week leaves progression in OTHER fields completely intact", () => {
  // The dangerous one. Changing the movement must not flatten the loading.
  const out = H.applyExerciseEdit(SQUAT(), { name: "Box Squat" }, OPTS({ scope: "all", week: 1 }));
  assert.deepEqual(across(out, "reps"),
    ["8 @ 65%","8 @ 65%","8 @ 65%","8 @ 65%",
     "5 @ 80%","5 @ 80%","5 @ 80%","5 @ 80%",
     "3 @ 90%","3 @ 90%","3 @ 90%","3 @ 90%"],
    "six months of authored loading must survive a movement swap");
  assert.deepEqual(across(out, "rpe"), [7,7,7,7,8,8,8,8,9,9,9,9]);
});

test("every week on a field that IS progressed flattens only that field", () => {
  const out = H.applyExerciseEdit(SQUAT(), { rpe: 6 }, OPTS({ scope: "all", week: 1 }));
  assert.deepEqual(across(out, "rpe"), [6,6,6,6,6,6,6,6,6,6,6,6]);
  assert.deepEqual(across(out, "reps").slice(4, 6), ["5 @ 80%", "5 @ 80%"], "reps untouched");
});

// ---------- pick blocks ----------

test("picking blocks 2 and 3 changes both and leaves block 1", () => {
  // His words: "if a front squat is on block two and block three, a coach can
  // change that by selecting multiple blocks."
  const out = H.applyExerciseEdit(SQUAT(), { name: "Back Squat" },
    OPTS({ scope: "blocks", selected: [5, 9] }));
  assert.deepEqual(across(out, "name"),
    ["Front Squat","Front Squat","Front Squat","Front Squat",
     "Back Squat","Back Squat","Back Squat","Back Squat",
     "Back Squat","Back Squat","Back Squat","Back Squat"]);
});

test("picking non-adjacent blocks skips the one between them", () => {
  const out = H.applyExerciseEdit(SQUAT(), { name: "Back Squat" },
    OPTS({ scope: "blocks", selected: [1, 9] }));
  assert.deepEqual(across(out, "name"),
    ["Back Squat","Back Squat","Back Squat","Back Squat",
     "Front Squat","Front Squat","Front Squat","Front Squat",
     "Back Squat","Back Squat","Back Squat","Back Squat"]);
});

test("picking every block is the same as every week, as far as the athlete sees", () => {
  const picked = H.applyExerciseEdit(SQUAT(), { name: "Back Squat" },
    OPTS({ scope: "blocks", selected: [1, 5, 9] }));
  const all = H.applyExerciseEdit(SQUAT(), { name: "Back Squat" }, OPTS({ scope: "all", week: 1 }));
  assert.deepEqual(across(picked, "name"), across(all, "name"));
  assert.deepEqual(across(picked, "reps"), across(all, "reps"));
});

test("picking nothing changes nothing", () => {
  const ex = SQUAT();
  assert.deepEqual(H.applyExerciseEdit(ex, { name: "X" }, OPTS({ scope: "blocks", selected: [] })), ex);
});

// ---------- the pin must not overwrite a week that already decided ----------

test("a block that already pins the field for itself is not overwritten", () => {
  const ex = SQUAT();
  ex.byWeek["9"].name = "Speed Squat";       // block 3 already has its own movement
  const out = H.applyExerciseEdit(ex, { name: "Back Squat" }, OPTS({ scope: "block", week: 6 }));
  assert.equal(shown(out, 9, "name"), "Speed Squat", "block 3 chose already — leave it");
  assert.equal(shown(out, 6, "name"), "Back Squat");
});

test("an entry written INSIDE the block cannot override the block change", () => {
  const ex = SQUAT();
  ex.byWeek["7"] = { name: "Pause Squat" };  // mid-block override
  const out = H.applyExerciseEdit(ex, { name: "Back Squat" }, OPTS({ scope: "block", week: 5 }));
  assert.deepEqual(across(out, "name").slice(4, 8),
    ["Back Squat","Back Squat","Back Squat","Back Squat"],
    "the whole block was asked for, so the whole block changes");
});

test("rewriting a field mid-block leaves that entry's other fields alone", () => {
  const ex = SQUAT();
  ex.byWeek["7"] = { name: "Pause Squat", sets: 6 };
  const out = H.applyExerciseEdit(ex, { name: "Back Squat" }, OPTS({ scope: "block", week: 5 }));
  assert.equal(shown(out, 7, "sets"), 6, "only the patched field is released");
});

// ---------- a movement skipped in some weeks ----------

test("a skipped week stays skipped when a later block is edited", () => {
  const ex = SQUAT();
  ex.byWeek["9"] = { skip: true };
  const out = H.applyExerciseEdit(ex, { sets: 5 }, OPTS({ scope: "block", week: 5 }));
  assert.equal(H.resolveExerciseForWeek(out, 9), null, "block 3 dropped this movement — keep it dropped");
  assert.equal(shown(out, 6, "sets"), 5);
});

// ---------- hygiene ----------

test("the input is never mutated", () => {
  const ex = SQUAT();
  const snapshot = JSON.stringify(ex);
  H.applyExerciseEdit(ex, { name: "X" }, OPTS({ scope: "block", week: 6 }));
  H.applyExerciseEdit(ex, { name: "X" }, OPTS({ scope: "all", week: 1 }));
  H.applyExerciseEdit(ex, { name: "X" }, OPTS({ scope: "week", week: 3 }));
  assert.equal(JSON.stringify(ex), snapshot);
});

test("empty entries are cleaned up rather than accumulating", () => {
  const ex = { id: "x", name: "A", sets: 3, byWeek: { "5": { name: "B" } } };
  const out = H.applyExerciseEdit(ex, { name: "C" }, OPTS({ scope: "all", week: 1 }));
  assert.equal(out.byWeek, null, "an exercise with no plan left must say so, not carry {}");
});

test("a field nothing reads back is refused", () => {
  const ex = SQUAT();
  assert.deepEqual(H.applyExerciseEdit(ex, { colour: "red" }, OPTS({ scope: "block", week: 6 })), ex,
    "writing a field resolveExerciseForWeek ignores is a silent no-op");
  assert.deepEqual(H.WEEK_FIELDS.slice().sort(),
    ["exerciseId", "name", "phase", "reps", "rest", "rpe", "sets"]);
});

test("the writable fields match what the resolver reads back", () => {
  // Two lists again. The last time two lists disagreed in this file, every
  // program silently lost its progression.
  const at = src.indexOf("function resolveExerciseForWeek(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  const read = body.match(/\["exerciseId"[^\]]*\]/)[0];
  H.WEEK_FIELDS.forEach(f => assert.ok(read.includes(`"${f}"`), `${f} is written but never read`));
});

test("junk arguments do not throw", () => {
  assert.equal(H.applyExerciseEdit(null, { sets: 1 }, OPTS({ scope: "block", week: 1 })), null);
  assert.equal(H.applyExerciseEdit(SQUAT(), null, OPTS({ scope: "block", week: 1 })).name, "Front Squat");
  const ex = SQUAT();
  assert.deepEqual(H.applyExerciseEdit(ex, {}, OPTS({ scope: "block", week: 1 })), ex);
  assert.ok(H.applyExerciseEdit(ex, { sets: 1 }, {}), "no options at all must still return something");
});

test("no blocks supplied falls back to treating the program as one span", () => {
  const out = H.applyExerciseEdit(SQUAT(), { sets: 9 }, { scope: "block", week: 6, totalWeeks: 12 });
  assert.deepEqual(across(out, "sets"), [9,9,9,9,9,9,9,9,9,9,9,9]);
});

// ---------- what the picker is shown ----------

test("the block picker can show what each block currently uses", () => {
  const ex = SQUAT();
  ex.byWeek["9"] = { name: "Speed Squat" };
  const rows = H.blockSummaryFor(ex, BLOCKS);
  assert.deepEqual(rows.map(r => r.value), ["Front Squat", "Front Squat", "Speed Squat"]);
  assert.deepEqual(rows.map(r => r.startWeek), [1, 5, 9]);
});

test("a block that drops the movement is flagged, not shown as blank", () => {
  const ex = SQUAT();
  ex.byWeek["9"] = { skip: true };
  const rows = H.blockSummaryFor(ex, BLOCKS);
  assert.equal(rows[2].skipped, true);
  assert.equal(rows[2].value, null);
});

// ---------- the scopes offered ----------

test("the default is this block — the commonest intent, and reversible", () => {
  assert.equal(H.DEFAULT_EDIT_SCOPE, "block");
  assert.ok(H.EDIT_SCOPES.some(s => s.key === H.DEFAULT_EDIT_SCOPE));
});

test("every offered scope is one applyExerciseEdit actually implements", () => {
  const ex = SQUAT();
  H.EDIT_SCOPES.forEach(s => {
    assert.ok(s.key && s.label && s.hint, JSON.stringify(s));
    const out = H.applyExerciseEdit(ex, { sets: 2 },
      OPTS({ scope: s.key, week: 6, selected: [5] }));
    assert.notDeepEqual(out, ex, `scope "${s.key}" did nothing`);
  });
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
