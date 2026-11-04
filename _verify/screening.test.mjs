// Screening (Isaiah, 4 Nov): the questions a CSCS asks before writing a
// program, and, the point of it all, that every answer changes the program.
// A question that changes nothing is a question that should not be asked.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "PARQ_QUESTIONS", kind: "const" }, { name: "MOVE_CHECKS", kind: "const" }, { name: "MOVE_RESULTS", kind: "const" },
  { name: "SLEEP_OPTIONS", kind: "const" }, { name: "OTHER_TRAINING_OPTIONS", kind: "const" },
  { name: "START_LEVELS", kind: "const" }, { name: "SESSION_BLOCKS", kind: "const" },
  "parqFlags", "needsClearance", "parqAnswered", "movementAnswered", "movementLimits", "screeningPromptBlock",
  "conditioningRestFloor", "parseRestSeconds", "blockForPhase",
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);
const allNo = Object.fromEntries(["heart", "chestPain", "dizzy", "chronic", "meds", "boneJoint", "supervised"].map(k => [k, false]));
const allEasy = { sitStand: "easy", toeTouch: "easy", overhead: "easy", balance: "easy", pushup: "easy" };

test("the seven PAR-Q+ questions, and a yes asks about clearance", () => {
  assert.equal(H.PARQ_QUESTIONS.length, 7);
  assert.equal(H.parqAnswered({ parq: allNo }), true);
  assert.equal(H.parqAnswered({ parq: { ...allNo, heart: true } }), false, "a yes with no clearance answer lets them past");
  assert.equal(H.parqAnswered({ parq: { ...allNo, heart: true }, parqCleared: false }), true);
  assert.equal(H.parqAnswered({ parq: { heart: false } }), false, "unanswered questions let them past");
});

test("not cleared: light to moderate only, and told to see a doctor", () => {
  const b = H.screeningPromptBlock({ parq: { ...allNo, chestPain: true }, parqCleared: false });
  assert.match(b, /NOT been cleared/);
  assert.match(b, /no prescription above 7 out of 10/);
  assert.match(b, /see their doctor/);
  assert.equal(H.needsClearance({ parq: { ...allNo, chestPain: true }, parqCleared: true }), false);
  assert.doesNotMatch(H.screeningPromptBlock({ parq: { ...allNo, chestPain: true }, parqCleared: true }), /NOT been cleared/);
});

test("every movement check result maps to an exercise rule", () => {
  for (const m of H.MOVE_CHECKS) for (const r of ["hard", "cant", "pain"]) {
    const b = H.screeningPromptBlock({ move: { ...allEasy, [m.key]: r } });
    assert.match(b, /MOVEMENT CHECK/, `${m.key} ${r} changes nothing`);
  }
  assert.equal(H.screeningPromptBlock({ parq: allNo, move: allEasy, otherTraining: "0", sleep: "7-8" }), "",
    "a clean screen should add nothing");
});

test("the rules are the ones a coach would apply", () => {
  assert.match(H.screeningPromptBlock({ move: { ...allEasy, overhead: "hard" } }), /no barbell overhead press/);
  assert.match(H.screeningPromptBlock({ move: { ...allEasy, toeTouch: "cant" } }), /No deadlift from the floor/);
  assert.match(H.screeningPromptBlock({ move: { ...allEasy, sitStand: "hard" } }), /box or bench squat/);
  assert.match(H.screeningPromptBlock({ move: { ...allEasy, balance: "cant" } }), /no single-leg jumps/);
  assert.match(H.screeningPromptBlock({ move: { ...allEasy, pushup: "cant" } }), /incline or knee push-ups/);
  assert.match(H.screeningPromptBlock({ move: { ...allEasy, sitStand: "pain" } }), /current injury/);
});

test("load and recovery outside the gym change the volume", () => {
  assert.match(H.screeningPromptBlock({ otherTraining: "6+" }), /That is their conditioning/);
  assert.match(H.screeningPromptBlock({ otherTraining: "3-5" }), /at most one short conditioning piece/);
  assert.match(H.screeningPromptBlock({ sleep: "<6" }), /2 to 3 sets/);
});

test("everything reaches the prompt", () => {
  const at = src.indexOf("function buildAIPrompt(intake)");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/\$\{screeningPromptBlock\(intake\)\}/.test(body));
  assert.ok(/intake\.sleep/.test(body) && /intake\.otherTraining/.test(body));
});

const cond = (o = {}) => ({ phase: "lactic", sets: 6, reps: "30s", rest: "30s", rpe: 8, startRamp: "foundation", ...o });
test("NSCA work to rest: 1:4 in week 1, 1:3 in week 2, 1:2 to the end of the ramp, then as written", () => {
  assert.equal(H.conditioningRestFloor(cond(), 1).rest, "2min");
  assert.equal(H.conditioningRestFloor(cond(), 2).rest, "90s");
  assert.equal(H.conditioningRestFloor(cond(), 3).rest, "1min");
  assert.equal(H.conditioningRestFloor(cond(), 4).rest, "1min");
  assert.equal(H.conditioningRestFloor(cond(), 5).rest, "30s");
  assert.equal(H.conditioningRestFloor(cond({ startRamp: "rebuilding" }), 3).rest, "30s", "Rebuilding is two weeks");
  assert.equal(H.conditioningRestFloor(cond({ reps: "45s" }), 1).rest, "3min");
});
test("only for the ramps, only for timed conditioning, never shortened", () => {
  assert.equal(H.conditioningRestFloor(cond({ startRamp: null }), 1).rest, "30s");
  assert.equal(H.conditioningRestFloor(cond({ phase: "compound" }), 1).rest, "30s");
  assert.equal(H.conditioningRestFloor(cond({ reps: "10" }), 1).rest, "30s");
  assert.equal(H.conditioningRestFloor(cond({ rest: "3min" }), 1).rest, "3min");
  assert.equal(H.conditioningRestFloor(cond({ reps: "20min" }), 1).rest, "30s", "a steady 20 minutes is not an interval");
});

test("one Health Check screen, with injuries on it, and a shorter signup", () => {
  assert.ok(/athlete: \["🔐 Create Account", "👤 About You", "🎯 Your Goal", "📅 Your Week", "🩺 Health Check"\]/.test(src));
  const at = src.indexOf('"🩺 Health Check": [');
  const block = src.slice(at, src.indexOf("],", at));
  for (const s of ["❤️ Health Questions", "🩹 Injuries", "🧍 Movement Check"]) assert.ok(block.includes(s), `${s} is not on it`);
});
test("the coach sees the health flag and the movement limits", () => {
  assert.ok(/needs a doctor's clearance/.test(src));
  assert.ok(/Movement check\. <\/span>/.test(src));
  assert.deepEqual(H.movementLimits({ move: { ...allEasy, overhead: "pain" } }).map(m => m.key), ["overhead"]);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
