// Voice Log (Isaiah, 31 Oct): say the workout, the AI turns it into numbers,
// and only numbers that fit the exercise and the log ever reach the sets.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = fs.readFileSync(APP, "utf8");
const H = await load(APP, [
  { name: "VOICE_FIELDS", kind: "const" }, { name: "VOICE_LIMITS", kind: "const" },
  { name: "VOICE_MODE_WORDS", kind: "const" },
  "voiceLogSystem", "normalizeVoiceLog", "describeVoiceSet",
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

const squat = { id: "a", name: "Back Squat", mode: "load", sets: 3, reps: "5" };
const run = { id: "b", name: "Easy Run", mode: "time", sets: 1, reps: "20 min" };
const plank = { id: "c", name: "Plank", mode: "hold", sets: 2, reps: "45s" };
const scope = [squat, run, plank];

test("weight and reps land on the right sets", () => {
  const out = H.normalizeVoiceLog({ exercises: [{ id: "a", sets: [
    { set: 1, weight: 225, unit: "lb", reps: 5 }, { set: 2, weight: 225, reps: 5 }, { set: 3, weight: 225, reps: 4 },
  ] }] }, scope, "lb");
  assert.deepEqual(out.entries, [{ id: "a", sets: [
    { index: 0, weight: 225, reps: 5 }, { index: 1, weight: 225, reps: 5 }, { index: 2, weight: 225, reps: 4 },
  ] }]);
});

test("kilos said, pounds logged: converted, not relabelled", () => {
  const out = H.normalizeVoiceLog({ exercises: [{ id: "a", sets: [{ set: 1, weight: 100, unit: "kg", reps: 5 }] }] }, scope, "lb");
  assert.equal(out.entries[0].sets[0].weight, 220.5);
});

test("only the fields an exercise is measured by", () => {
  const out = H.normalizeVoiceLog({ exercises: [
    { id: "b", sets: [{ set: 1, minutes: 22, weight: 50, reps: 3 }] },
    { id: "c", sets: [{ set: 1, seconds: 50 }, { set: 2, seconds: 40 }] },
  ] }, scope, "lb");
  assert.deepEqual(out.entries[0], { id: "b", sets: [{ index: 0, minutes: 22 }] });
  assert.deepEqual(out.entries[1].sets.map(s => s.seconds), [50, 40]);
});

test("never more sets than the exercise has, never an unknown exercise", () => {
  const out = H.normalizeVoiceLog({ exercises: [
    { id: "a", sets: [1, 2, 3, 4, 5].map(n => ({ set: n, weight: 135, reps: 5 })) },
    { id: "zzz", sets: [{ set: 1, weight: 1, reps: 1 }] },
  ] }, scope, "lb");
  assert.equal(out.entries.length, 1);
  assert.equal(out.entries[0].sets.length, 3);
});

test("nonsense numbers are dropped, not logged", () => {
  const out = H.normalizeVoiceLog({ exercises: [{ id: "a", sets: [{ set: 1, weight: -5, reps: 5000 }, { set: 2, weight: "abc", reps: 5 }] }] }, scope, "lb");
  assert.deepEqual(out.entries[0].sets, [{ index: 1, reps: 5 }]);
});

test("a broken or empty reply fills nothing", () => {
  assert.deepEqual(H.normalizeVoiceLog(null, scope, "lb").entries, []);
  assert.deepEqual(H.normalizeVoiceLog({ exercises: "x" }, scope, "lb").entries, []);
});

test("the AI is told the exercises, how each is logged, and the unit", () => {
  const sys = H.voiceLogSystem(scope, "kg");
  assert.ok(sys.includes("id: a | Back Squat"));
  assert.ok(sys.includes("logged by: minutes"));
  assert.ok(/use "kg"/.test(sys));
  assert.ok(/correction/.test(sys), "corrections in speech are not handled");
});

test("read back in words", () => {
  assert.equal(H.describeVoiceSet({ weight: 225, reps: 5 }, "load", "lb"), "225 lb x 5");
  assert.equal(H.describeVoiceSet({ minutes: 20 }, "time", "lb"), "20 min");
  assert.equal(H.describeVoiceSet({ seconds: 45 }, "hold", "lb"), "45 s");
});

test("there is a Voice Log on each exercise and one for the whole workout, and nothing saves without a confirm", () => {
  assert.ok(/<Mic size=\{15\} \/> Voice Log/.test(src), "no Voice Log button on the exercise");
  assert.ok(/Voice Log the whole workout/.test(src), "no whole-workout Voice Log");
  assert.ok(/Save to my sets/.test(src), "what was heard is saved without being shown first");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`✖ ${name}\n  ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
