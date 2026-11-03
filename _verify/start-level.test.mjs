// Starting level (Isaiah, 3 Nov). The days someone CAN train are not the days
// they ARE training. Someone months out of training starts on a lighter ramp
// (CSCCa/NSCA 2019 transition guidelines: 50/30/20/10), so tendons, cardio and
// the habit catch up before the full load.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "START_LEVELS", kind: "const" }, { name: "RECENT_TRAINING_OPTIONS", kind: "const" },
  { name: "LAST_CONSISTENT_OPTIONS", kind: "const" }, { name: "SESSION_BLOCKS", kind: "const" },
  "startLevelOf", "startLevelReason", "tagStartRamp", "programStartRamp", "applyStartRamp", "startRampNotice",
  "startLevelPromptBlock", "blockForPhase",
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

test("3 months or more out, or never trained: Foundation", () => {
  for (const last of ["3to12m", "over1y", "never"]) assert.equal(H.startLevelOf({ lastConsistent: last, recentDaysPerWeek: "0" }), "foundation", last);
});
test("a short break: Rebuilding", () => {
  for (const last of ["under1m", "1to3m"]) assert.equal(H.startLevelOf({ lastConsistent: last, recentDaysPerWeek: "1" }), "rebuilding", last);
  assert.equal(H.startLevelOf({ lastConsistent: "now", recentDaysPerWeek: "0" }), "rebuilding", "says 'training now' but did nothing in 4 weeks");
});
test("training now: Ready", () => {
  assert.equal(H.startLevelOf({ lastConsistent: "now", recentDaysPerWeek: "3+" }), "ready");
});
test("never asked (older accounts): nothing changes", () => {
  assert.equal(H.startLevelOf({}), null);
  assert.equal(H.startLevelOf(null), null);
});
test("a level picked on the generator screen wins", () => {
  assert.equal(H.startLevelOf({ lastConsistent: "never", startLevel: "ready" }), "ready");
});

const ex = (o = {}) => ({ phase: "compound", sets: 4, reps: "5", rpe: 8, startRamp: "foundation", ...o });

test("Foundation: 50, 70, 80, 90% of the sets, difficulty capped 6, 6, 7, 7", () => {
  const out = [1, 2, 3, 4].map(w => H.applyStartRamp(ex({ sets: 10 }), w));
  assert.deepEqual(out.map(x => x.sets), [5, 7, 8, 9]);
  assert.deepEqual(out.map(x => x.rpe), [6, 6, 7, 7]);
});
test("Rebuilding: two weeks, then the full program", () => {
  const out = [1, 2, 3].map(w => H.applyStartRamp(ex({ sets: 10, startRamp: "rebuilding" }), w));
  assert.deepEqual(out.map(x => x.sets), [5, 7, 10]);
  assert.equal(out[2].rpe, 8);
});
test("after the ramp, and for Ready, the program is as written", () => {
  assert.deepEqual(H.applyStartRamp(ex(), 5), ex());
  assert.deepEqual(H.applyStartRamp(ex({ startRamp: null }), 1), ex({ startRamp: null }));
});
test("never below one set, and an easy target is not raised", () => {
  assert.equal(H.applyStartRamp(ex({ sets: 1 }), 1).sets, 1);
  assert.equal(H.applyStartRamp(ex({ rpe: 4 }), 1).rpe, 4);
});
test("warm-ups and cool-downs are left alone", () => {
  assert.deepEqual(H.applyStartRamp(ex({ phase: "warmup_general" }), 1), ex({ phase: "warmup_general" }));
  assert.deepEqual(H.applyStartRamp(ex({ phase: "cooldown" }), 1), ex({ phase: "cooldown" }));
});

test("the level is stamped on a new program and read back from it", () => {
  const days = H.tagStartRamp([{ name: "A", exercises: [{ name: "Squat" }, { name: "Row" }] }], "foundation");
  assert.ok(days[0].exercises.every(x => x.startRamp === "foundation"));
  assert.equal(H.programStartRamp({ days }), "foundation");
  assert.equal(H.programStartRamp({ days: H.tagStartRamp(days, "ready") }), null);
});
test("the stamp survives saving and loading", () => {
  const save = src.slice(src.indexOf("function denormalizeDays"), src.indexOf("function applyGeneratedProgram"));
  const load = src.slice(src.indexOf("function buildDaysWithExerciseIds"), src.indexOf("function denormalizeByWeek"));
  assert.ok(/startRamp: x\.startRamp \|\| null/.test(save), "saving drops it");
  assert.ok(/startRamp: x\.startRamp \|\| null/.test(load), "loading drops it");
});
test("the week's prescription applies the ramp", () => {
  const body = src.slice(src.indexOf("function prescribeForWeek"), src.indexOf("function describeWeekProgression"));
  assert.ok(/applyStartRamp\(applyProgression\(forPhase, info\), week\)/.test(body));
  assert.ok(/applyStartRamp\(applyDeload\(forPhase, true\), week\)/.test(body));
});

test("the AI is told, and told the app does the cutting", () => {
  const b = H.startLevelPromptBlock({ lastConsistent: "over1y", recentDaysPerWeek: "0" });
  assert.match(b, /STARTING LEVEL: FOUNDATION/);
  assert.match(b, /last trained consistently over a year ago/);
  assert.match(b, /do not shrink it yourself/);
  assert.match(b, /No depth jumps/);
  assert.equal(H.startLevelPromptBlock({ lastConsistent: "now", recentDaysPerWeek: "3+" }), "");
  assert.ok(/\$\{startLevelPromptBlock\(intake\)\}/.test(src), "the block never reaches the prompt");
});

test("asked at signup, and in a coach's own training intake", () => {
  assert.ok(/\{ step: "🔋 Training Lately", label: "Your training lately" \}/.test(src));
  assert.ok(/case "🔋 Training Lately": return !!data\.recentDaysPerWeek && !!data\.lastConsistent;/.test(src));
  assert.ok(/"💪 Training Experience", "🔋 Training Lately", "🧬 Sex"/.test(src), "coach's own intake does not ask");
  assert.ok(/how many days a week did you actually train\?/.test(src));
});
test("every program build carries the level", () => {
  assert.ok(/tagStartRamp\(attachWeekdays\(parsed\.days, data\.trainingDays\), startLevelOf\(data\)\)/.test(src), "the signup build ignores it");
  assert.ok(/parsed\.days = tagStartRamp\(parsed\.days, level\);/.test(src), "the generator ignores it");
});
test("the athlete is told why it's lighter, and the coach sees the flag", () => {
  const n = H.startRampNotice("foundation", 1);
  assert.equal(n.title, "Foundation week 1 of 4");
  assert.match(n.text, /about 50% of the sets/);
  assert.equal(H.startRampNotice("foundation", 5), null);
  assert.ok((src.match(/startRampNotice\(programStartRamp\(myProgram\)/g) || []).length >= 2);
  assert.ok(/const level = startLevelOf\(athlete\.intake\);/.test(src), "the coach sees nothing");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
