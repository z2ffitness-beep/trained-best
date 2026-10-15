// Moving a movement between sections, and who is allowed to.
//
// The coach opened his own program, found he could not delete a single
// exercise, and could not move a trap bar jump out of Power into Primary
// Movements. Three separate defects, all of which presented as "nothing
// happens when I tap".
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "PHASES", kind: "const" }, { name: "SESSION_BLOCKS", kind: "const" },
  { name: "phaseIndex", kind: "const" }, "blockForPhase",
  { name: "blockOrderOf", kind: "const" },
  "sessionOrder", "moveExerciseInDay", "canMoveExercise",
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

const ex = (id, phase) => ({ id, phase, exerciseId: "e" + id, sets: 3, reps: "5" });
const shape = (list) => list.map(x => `${x.id}:${x.phase}`);
// A realistic day, in the order the generator writes one.
const DAY = () => [
  ex("w1", "warmup_general"), ex("w2", "warmup_general"),
  ex("p1", "warmup_specific"),
  ex("x1", "explosive"), ex("x2", "explosive"),
  ex("c1", "compound"), ex("c2", "compound"),
  ex("h1", "hypertrophy"),
  ex("l1", "lactic"),
];

// ---------- the thing he asked for ----------

test("a movement moves from Power into Primary Movements", () => {
  // x2 is the last item in Power; down takes it into the section below.
  const out = H.moveExerciseInDay(DAY(), "x2", 1);
  const moved = out.find(x => x.id === "x2");
  assert.equal(moved.phase, "compound", "the phase IS the section — it has to change");
  assert.equal(H.blockForPhase(moved.phase).label, "Primary Movements");
});

test("and back again", () => {
  const once = H.moveExerciseInDay(DAY(), "x2", 1);
  const back = H.moveExerciseInDay(once, "x2", -1);
  assert.equal(back.find(x => x.id === "x2").phase, "explosive");
  assert.deepEqual(shape(back), shape(DAY()), "a round trip must restore the day exactly");
});

test("it lands at the near edge, so one more tap carries it through", () => {
  const down = H.moveExerciseInDay(DAY(), "x2", 1);
  const strength = down.filter(x => x.phase === "compound").map(x => x.id);
  assert.deepEqual(strength, ["x2", "c1", "c2"], "entering from above lands at the top");

  const up = H.moveExerciseInDay(DAY(), "c1", -1);
  const power = up.filter(x => x.phase === "explosive").map(x => x.id);
  assert.deepEqual(power, ["x1", "x2", "c1"], "entering from below lands at the bottom");
});

test("tapping down repeatedly walks a movement through every section", () => {
  let day = DAY();
  const seen = [];
  // Generous: it swaps past each neighbour inside a section before leaving it.
  for (let i = 0; i < 60; i++) {
    const next = H.moveExerciseInDay(day, "w1", 1);
    if (next === day) break;
    day = next;
    seen.push(H.blockForPhase(day.find(x => x.id === "w1").phase).key);
  }
  // It should reach the last section and then refuse to go further.
  assert.equal(seen[seen.length - 1], H.SESSION_BLOCKS[H.SESSION_BLOCKS.length - 1].key);
  assert.equal(H.canMoveExercise(day, "w1", 1), false, "nothing below the last section");
});

test("an empty section is entered, not skipped over", () => {
  // No hypertrophy in this day, so Secondary Movements does not exist yet.
  const day = [ex("c1", "compound"), ex("l1", "lactic")];
  const out = H.moveExerciseInDay(day, "c1", 1);
  assert.equal(out.find(x => x.id === "c1").phase, "hypertrophy",
    "it must stop in the empty section — that is where someone is aiming");
});

// ---------- reordering inside a section ----------

test("inside a section it swaps with its neighbour and keeps its phase", () => {
  const out = H.moveExerciseInDay(DAY(), "c2", -1);
  assert.deepEqual(out.filter(x => x.phase === "compound").map(x => x.id), ["c2", "c1"]);
  assert.equal(out.find(x => x.id === "c2").phase, "compound", "a reorder must not change the section");
});

test("the warm-up's two phases are one section — moving inside it keeps each phase", () => {
  const out = H.moveExerciseInDay(DAY(), "w2", -1);
  assert.equal(out.find(x => x.id === "w2").phase, "warmup_general",
    "a dynamic warm-up swapped with another must not become a primer");
  assert.deepEqual(out.slice(0, 2).map(x => x.id), ["w2", "w1"]);
});

test("reordering across the two halves of one section keeps each phase", () => {
  // The Warm-Up section holds two phases, and the Conditioning section holds
  // two. A reorder inside a section is a reorder — it must not quietly retype
  // a primer as a dynamic warm-up just because it moved above one.
  const out = H.moveExerciseInDay(DAY(), "p1", -1);
  assert.equal(out.find(x => x.id === "p1").phase, "warmup_specific",
    "a primer moved up past a dynamic warm-up is still a primer");
  assert.equal(out.find(x => x.id === "w2").phase, "warmup_general",
    "and the one it passed is unchanged too");
  assert.deepEqual(out.slice(0, 3).map(x => x.id), ["w1", "p1", "w2"]);
});

test("the same holds in the conditioning section", () => {
  const day = [ex("a1", "lactic"), ex("a2", "aerobic")];
  assert.equal(H.blockForPhase("lactic").key, H.blockForPhase("aerobic").key,
    "fixture assumes these share a section");
  const out = H.moveExerciseInDay(day, "a2", -1);
  assert.equal(out.find(x => x.id === "a2").phase, "aerobic");
  assert.equal(out.find(x => x.id === "a1").phase, "lactic");
  assert.deepEqual(out.map(x => x.id), ["a2", "a1"]);
});

test("leaving the warm-up downwards starts from the primer, not the top", () => {
  const out = H.moveExerciseInDay(DAY(), "p1", 1);
  assert.equal(H.blockForPhase(out.find(x => x.id === "p1").phase).key, "power");
});

test("entering the warm-up from below becomes a primer, not a dynamic warm-up", () => {
  const out = H.moveExerciseInDay(DAY(), "x1", -1);
  assert.equal(out.find(x => x.id === "x1").phase, "warmup_specific",
    "arriving at the bottom of the warm-up means the primer half");
});

// ---------- the silent data corruption ----------

test("an exercise is found by row id, never by position", () => {
  // This is the bug that mattered. The screen filters out exercises a
  // per-week entry skips, so a position taken from the screen pointed at a
  // different exercise in the stored day — and the wrong two were swapped
  // and saved. Two live programs on this account carry skips.
  const stored = DAY();
  const out = H.moveExerciseInDay(stored, "c2", -1);
  assert.deepEqual(out.filter(x => x.phase === "compound").map(x => x.id), ["c2", "c1"]);
  // Same call against a day where earlier exercises were removed must still
  // move c2, not whatever now sits at c2's old index.
  const filtered = stored.filter(x => !["w1", "x1"].includes(x.id));
  const out2 = H.moveExerciseInDay(filtered, "c2", -1);
  assert.deepEqual(out2.filter(x => x.phase === "compound").map(x => x.id), ["c2", "c1"]);
});

test("an id that isn't in the day changes nothing, by reference", () => {
  const day = DAY();
  assert.equal(H.moveExerciseInDay(day, "nope", 1), day);
  assert.equal(H.moveExerciseInDay(day, undefined, 1), day);
});

test("a junk direction changes nothing", () => {
  const day = DAY();
  [0, 2, -2, null, undefined, "up"].forEach(d =>
    assert.equal(H.moveExerciseInDay(day, "c1", d), day, String(d)));
});

test("a missing or empty day does not throw", () => {
  assert.equal(H.moveExerciseInDay(null, "c1", 1), null);
  assert.equal(H.moveExerciseInDay(undefined, "c1", 1), undefined);
  const empty = [];
  assert.equal(H.moveExerciseInDay(empty, "c1", 1), empty);
});

test("no move ever loses, duplicates or mutates an exercise", () => {
  let day = DAY();
  const before = day.map(x => x.id).sort();
  const snapshot = JSON.stringify(day);
  for (const id of ["w1", "p1", "x2", "c1", "h1", "l1"]) {
    for (const dir of [1, -1, 1, 1, -1]) {
      const next = H.moveExerciseInDay(day, id, dir);
      assert.deepEqual(next.map(x => x.id).sort(), before, `${id} ${dir} lost or duplicated a row`);
      day = next;
    }
  }
  assert.equal(JSON.stringify(DAY()), snapshot, "the input array must never be mutated");
});

// ---------- the arrow's enabled state ----------

test("the arrow is live exactly when the tap would do something", () => {
  const day = DAY();
  for (const x of day) {
    for (const dir of [1, -1]) {
      const claims = H.canMoveExercise(day, x.id, dir);
      const actually = H.moveExerciseInDay(day, x.id, dir) !== day;
      assert.equal(claims, actually, `${x.id} dir ${dir}: the arrow lies about what it will do`);
    }
  }
});

test("the very first movement cannot go up and the last cannot go down", () => {
  const day = DAY();
  assert.equal(H.canMoveExercise(day, "w1", -1), false);
  assert.equal(H.canMoveExercise(day, "l1", 1), true, "lactic still has sections below it");
  const only = [ex("a", "cooldown")];
  assert.equal(H.canMoveExercise(only, "a", 1), false, "nothing below the last section");
  assert.equal(H.canMoveExercise(only, "a", -1), true, "but it can climb back out");
});

// ---------- the display order this has to agree with ----------

test("sessionOrder matches how the screen groups the day", () => {
  // buildSessionBlocks groups by SECTION and keeps array order within one, so
  // the arrows must walk the day that way or they disagree with what is shown.
  const scrambled = [ex("l1", "lactic"), ex("w1", "warmup_general"), ex("c1", "compound"), ex("w2", "warmup_general")];
  const order = H.sessionOrder(scrambled).map(i => scrambled[i].id);
  assert.deepEqual(order, ["w1", "w2", "c1", "l1"]);
});

// ---------- who is allowed to edit ----------

test("a coach can edit the program on his own account", () => {
  const at = src.indexOf("function AthleteProgram(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/const canEdit = !state\.me\.coachId;/.test(body),
    "selfGuided is false for a coach, which locked him out of his own program");
  assert.ok(!/const canEdit = !!state\.me\.selfGuided/.test(body));
});

test("an athlete with a coach still cannot rewrite their coach's program", () => {
  const at = src.indexOf("function AthleteProgram(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  const gate = /const canEdit = ([^;]+);/.exec(body)[1];
  // Simulate the two accounts the gate has to tell apart.
  const evalGate = (me) => Function("state", `return ${gate};`)({ me });
  assert.equal(evalGate({ coachId: null }), true, "a coach on his own program");
  assert.equal(evalGate({ coachId: undefined }), true, "a self-guided athlete");
  assert.equal(evalGate({ coachId: "some-coach-id" }), false, "a coached athlete must not edit");
});

// ---------- wiring ----------

test("the arrows pass the row id, not a position", () => {
  const at = src.indexOf("function SessionBlock(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/onMove\(x\.id, -1\)/.test(body) && /onMove\(x\.id, 1\)/.test(body),
    "a position taken from the filtered view points at the wrong stored exercise");
  assert.ok(!/x\._index/.test(body), "no index-based addressing may remain");
});

test("the enabled state is asked of the stored day, not the filtered one", () => {
  assert.ok(/canMoveUp=\{\(x\) => canMoveExercise\(day\.exercises, x\.id, -1\)\}/.test(src));
  assert.ok(/canMoveDown=\{\(x\) => canMoveExercise\(day\.exercises, x\.id, 1\)\}/.test(src));
  assert.ok(!/canMoveDown=\{\(i\) => i < weekExercises\.length/.test(src),
    "weekExercises is the filtered list — its length is the wrong bound");
});

test("a move that changes nothing does not write to the database", () => {
  const at = src.indexOf("const moveExercise = (rowId, dir)");
  const body = src.slice(at, src.indexOf("\n  };", at));
  assert.ok(/if \(!changed\) return;/.test(body));
  assert.ok(body.indexOf("if (!changed) return;") < body.indexOf("updateProgramRow"),
    "the guard must come before the write, not after");
});

// ---------- the warm-up load rule ----------

test("the generator is told a warm-up carries no working weight", () => {
  const at = src.indexOf("LOAD CEILING, both warm-up phases");
  assert.notEqual(at, -1, "a barbell glute bridge was landing in the warm-up");
  const near = src.slice(at, at + 500);
  assert.ok(/No barbell, dumbbell, kettlebell or machine work loaded for effect/.test(near));
  assert.ok(/empty bar/.test(near), "an unloaded rehearsal of the day's main lift is still allowed");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
