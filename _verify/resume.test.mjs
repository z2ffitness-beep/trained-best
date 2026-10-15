// Coming back to a workout you walked away from.
//
// The machinery to do this already existed — a draft of every ticked set and
// typed weight, written to the phone on each change and read back on mount —
// and it had never once worked, because both halves of its key were random.
//
//   * A program's days are stored with no id, so the app mints
//     "d" + Math.random() for each one every time a program is read back.
//     The draft was filed under that, so the key was different on every launch
//     and could never be found again.
//   * Each exercise in a day is likewise handed an "x" + Math.random() id, and
//     the sets inside the draft were filed under those. So even once the draft
//     WAS found, every weight and tick in it pointed at ids that no longer
//     existed.
//
// Two further things were wrong on top of that: walking through a warm-up was
// not considered worth saving, so position alone was never written down; and
// readSessionDraft took the date it was meant to check and ignored it.
//
// What this file pins is that both keys are derived from things the database
// actually stores — the program's id, the day's name, the exercise's position
// and name — so they survive a reload.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

const H = await load(APP, [
  "normalizeExerciseName",
  "sessionKey",
  "sessionIdentity",
  "stableExerciseKeys",
  "remapExerciseKeys",
  "draftHasContent",
]);

// A day as the app holds it in memory: ids freshly minted, names only
// reachable through the exercise library.
const launch = (names, seed) => ({
  id: "d" + seed,
  name: "Day 3 — Wednesday",
  exercises: names.map((n, i) => ({ id: `x${seed}${i}`, exerciseId: `e${seed}${i}` })),
});
const resolverFor = (day, names) => (x) => {
  const i = day.exercises.findIndex(e => e.id === x.id);
  return i === -1 ? "" : names[i];
};

// ---------- the session key ----------

test("the same session has the same identity on the next launch", () => {
  const a = H.sessionIdentity({ id: "prog-1" }, { id: "dAAA", name: "Day 3 — Wednesday" });
  const b = H.sessionIdentity({ id: "prog-1" }, { id: "dZZZ", name: "Day 3 — Wednesday" });
  assert.equal(a, b, "a fresh day id changed the key, which is the original bug");
});

test("two different days do not share a draft", () => {
  const a = H.sessionIdentity({ id: "p" }, { id: "d1", name: "Day 1" });
  const b = H.sessionIdentity({ id: "p" }, { id: "d2", name: "Day 2" });
  assert.notEqual(a, b);
});

test("the same day in two different programs does not share a draft", () => {
  const a = H.sessionIdentity({ id: "p1" }, { id: "d", name: "Day 1" });
  const b = H.sessionIdentity({ id: "p2" }, { id: "d", name: "Day 1" });
  assert.notEqual(a, b, "switching program would inherit the other one's half-done session");
});

test("zero padding does not orphan a session", () => {
  assert.equal(
    H.sessionIdentity({ id: "p" }, { id: "a", name: "Day 01" }),
    H.sessionIdentity({ id: "p" }, { id: "b", name: "Day 1" }),
  );
});

test("a nameless day still gets a key rather than none", () => {
  const k = H.sessionIdentity({ id: "p" }, { id: "dXYZ", name: "" });
  assert.ok(k && /dXYZ/.test(k), "no key at all means no draft at all");
});

test("no day means no key", () => {
  assert.equal(H.sessionIdentity({ id: "p" }, null), null);
});

// ---------- the exercise keys ----------

test("sets survive every id in the day being reissued", () => {
  const names = ["Ankle Rocks", "Leg Swings", "Box Jump", "Back Squat"];
  const first = launch(names, "A");
  const { toStable } = H.stableExerciseKeys(first, resolverFor(first, names));

  // what the athlete typed, keyed by THIS launch's ids
  const typed = { [first.exercises[3].id]: ["135", "140"] };
  const stored = H.remapExerciseKeys(typed, toStable);

  // next launch: same program, all new ids
  const second = launch(names, "B");
  const { toCurrent } = H.stableExerciseKeys(second, resolverFor(second, names));
  const restored = H.remapExerciseKeys(stored, toCurrent);

  assert.deepEqual(restored[second.exercises[3].id], ["135", "140"],
    "the weights came back attached to nothing");
  assert.equal(Object.keys(restored).length, 1);
});

test("the same movement twice in a day keeps its two sets apart", () => {
  const names = ["Back Squat", "Pull Up", "Back Squat"];
  const day = launch(names, "C");
  const { toStable } = H.stableExerciseKeys(day, resolverFor(day, names));
  const typed = {
    [day.exercises[0].id]: ["95"],
    [day.exercises[2].id]: ["225"],
  };
  const stored = H.remapExerciseKeys(typed, toStable);
  assert.equal(Object.keys(stored).length, 2, "the two squats collapsed into one entry");

  const next = launch(names, "D");
  const { toCurrent } = H.stableExerciseKeys(next, resolverFor(next, names));
  const back = H.remapExerciseKeys(stored, toCurrent);
  assert.deepEqual(back[next.exercises[0].id], ["95"]);
  assert.deepEqual(back[next.exercises[2].id], ["225"]);
});

test("a reordered day refuses to hand one lift's numbers to another", () => {
  // Safer to lose a draft than to tell somebody they squatted 225 when that
  // was their deadlift.
  const before = ["Back Squat", "Bench Press"];
  const dayA = launch(before, "E");
  const { toStable } = H.stableExerciseKeys(dayA, resolverFor(dayA, before));
  const stored = H.remapExerciseKeys({ [dayA.exercises[0].id]: ["225"] }, toStable);

  const after = ["Bench Press", "Back Squat"];   // coach swapped the order
  const dayB = launch(after, "F");
  const { toCurrent } = H.stableExerciseKeys(dayB, resolverFor(dayB, after));
  const restored = H.remapExerciseKeys(stored, toCurrent);

  assert.equal(restored[dayB.exercises[0].id], undefined,
    "225 was just attached to the bench press");
});

test("names are compared loosely enough to survive a variant note", () => {
  const a = launch(["Back Squat (Heavy)"], "G");
  const b = launch(["Back Squat"], "H");
  const ka = H.stableExerciseKeys(a, resolverFor(a, ["Back Squat (Heavy)"])).toStable.get(a.exercises[0].id);
  const kb = H.stableExerciseKeys(b, resolverFor(b, ["Back Squat"])).toStable.get(b.exercises[0].id);
  assert.equal(ka, kb, "a parenthetical note should not orphan the draft");
});

test("an entry with no match is dropped, not carried under a stale key", () => {
  const out = H.remapExerciseKeys({ "9:nothing here": ["100"] }, new Map());
  assert.deepEqual(out, {});
});

test("remapping an empty or missing map is harmless", () => {
  assert.deepEqual(H.remapExerciseKeys(null, new Map()), {});
  assert.deepEqual(H.remapExerciseKeys({}, new Map()), {});
});

// ---------- what counts as worth saving ----------

test("being partway through is worth saving on its own", () => {
  // A warm-up has no weights or reps to log. Somebody who worked through one
  // and then had the phone kill the tab came back to exercise one.
  assert.ok(H.draftHasContent({ exIdx: 3, setChecks: {}, setWeights: {}, setReps: {} }),
    "position alone is still thrown away");
});

test("an untouched session is still not saved", () => {
  // Writing a blank draft on the first render would overwrite the real one
  // before the restore ever ran.
  assert.ok(!H.draftHasContent({ exIdx: 0, setChecks: {}, setWeights: {}, setReps: {}, notes: "" }));
  assert.ok(!H.draftHasContent(null));
});

test("logged work is saved as it always was", () => {
  assert.ok(H.draftHasContent({ exIdx: 0, setWeights: { a: ["135"] } }));
  assert.ok(H.draftHasContent({ exIdx: 0, setChecks: { a: [0] } }));
  assert.ok(H.draftHasContent({ exIdx: 0, notes: "felt heavy" }));
});

// ---------- wiring, which no unit test can reach ----------

test("the draft key is the stable identity, not the day id", () => {
  assert.ok(/const dayKey = sessionIdentity\(myProgram, day\)/.test(src),
    "back to day.id, which is regenerated on every single load");
});

test("the restore retries once it knows who is training", () => {
  // The draft is stored per user. This effect fires the moment `day` resolves,
  // which on a cold start can be before the profile has hydrated — so without
  // the id in its dependencies it looked under "anon:" once and gave up.
  assert.ok(/\}, \[dayKey, state\.me\.id, state\.me\.intake\?\.workoutTimer\]\)/.test(src),
    "the restore no longer re-runs when the signed-in id arrives");
});

test("the draft only reattaches to the day it belongs to", () => {
  const at = src.indexOf("function readSessionDraft");
  const fn = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/dateStr && draft\.date && draft\.date !== dateStr/.test(fn),
    "the date is accepted and then ignored, so last night's session can reattach this morning");
});

test("both effects key through the same resolver", () => {
  const save = /const \{ toStable \} = stableExerciseKeys\(day, nameOfEntry\)/.test(src);
  const load_ = /const \{ toCurrent \} = stableExerciseKeys\(day, nameOfEntry\)/.test(src);
  assert.ok(save && load_,
    "save and restore build their keys differently, so nothing will ever match");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
