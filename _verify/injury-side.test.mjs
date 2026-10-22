// Which side the injury is on.
//
// You have two of nearly everything, and the app only ever let somebody type
// the side into a free-text note, where nothing could read it. So a one-sided
// knee problem reached the generator as "Knee" and the program either guessed
// a leg or quietly treated both as injured. The example in the old code
// comment said it out loud: Knee - Tendon pain ("right side, worse on stairs").
// The side was right there in the string and no machine could use it.
//
// This file pins three things:
//   1. the side is asked for everywhere it exists, and NOT on the midline
//      (nobody should be asked which side their neck is on);
//   2. it is the one answer on the step that Continue actually waits for, and
//      the screen says so, because a dead button with no reason loses people;
//   3. it reaches injuryLines(), which is the single string the generator
//      prompt and both coach screens all read.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "INJURY_AREAS", kind: "const" }, { name: "INJURY_KINDS", kind: "const" },
  { name: "INJURY_SIDES", kind: "const" }, { name: "INJURY_MIDLINE", kind: "const" },
  { name: "injuryNeedsSide", kind: "const" }, { name: "injurySideLabel", kind: "const" },
  { name: "injuryKindLabel", kind: "const" },
  "injuryDetailFor", "setInjuryDetail",
  "injuryLines", "injurySidesMissing", "injurySidesAnswered",
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

const intake = (injuries, detail = {}) => ({ injuries, injuryDetail: detail });

// ---------- what gets asked ----------

test("three answers, and Both is one of them", () => {
  assert.deepEqual(H.INJURY_SIDES.map(s => s.key), ["left", "right", "both"]);
  // Without Both, somebody with two bad knees has no honest answer and the
  // step cannot be completed at all.
  assert.ok(H.INJURY_SIDES.some(s => s.key === "both"));
});

test("paired areas are asked, midline areas are not", () => {
  for (const a of ["Shoulder", "Elbow / Wrist", "Hip / Groin", "Thigh / Hamstring", "Knee", "Ankle / Foot / Shin"]) {
    assert.ok(H.injuryNeedsSide(a), `${a} comes in pairs and should be asked`);
  }
  for (const a of ["Neck", "Low back"]) {
    assert.ok(!H.injuryNeedsSide(a), `${a} is on the midline; asking looks careless`);
  }
});

test("every area in the list is decided one way or the other", () => {
  // A new area added to INJURY_AREAS and forgotten here would default to being
  // asked, which is the safe direction, but it should be a deliberate choice.
  for (const a of H.INJURY_AREAS) {
    assert.equal(typeof H.injuryNeedsSide(a), "boolean", a);
  }
});

test('"None currently" is never asked for a side', () => {
  assert.ok(!H.injuryNeedsSide("None currently"));
  assert.deepEqual(H.injurySidesMissing(intake(["None currently"])), []);
});

// ---------- the gate ----------

test("a paired area with no side blocks, and names itself", () => {
  const i = intake(["Knee"]);
  assert.deepEqual(H.injurySidesMissing(i), ["Knee"]);
  assert.equal(H.injurySidesAnswered(i), false);
});

test("one tap unblocks it", () => {
  const i = intake(["Knee"], { Knee: { side: "right" } });
  assert.deepEqual(H.injurySidesMissing(i), []);
  assert.equal(H.injurySidesAnswered(i), true);
});

test("a midline area alone never blocks", () => {
  assert.equal(H.injurySidesAnswered(intake(["Low back"])), true);
  assert.equal(H.injurySidesAnswered(intake(["Neck", "Low back"])), true);
});

test("one missing side out of three still blocks, and only that one is named", () => {
  const i = intake(["Knee", "Low back", "Shoulder"], { Knee: { side: "left" } });
  assert.deepEqual(H.injurySidesMissing(i), ["Shoulder"]);
  assert.equal(H.injurySidesAnswered(i), false);
});

test("no injuries at all does not block", () => {
  assert.equal(H.injurySidesAnswered(intake([])), true);
  assert.equal(H.injurySidesAnswered({}), true);
});

test("Continue is actually wired to it", () => {
  assert.ok(/case "🩹 Injuries": return \(data\.injuries \|\| \[\]\)\.length > 0 && injurySidesAnswered\(data\);/.test(src),
    "the gate exists but the step does not use it");
});

test("the screen says what is missing", () => {
  assert.ok(/Still needed: which side for \{injurySidesMissing\(data\)/.test(src),
    "a disabled Continue with nothing on screen explaining it");
});

test("the side control is only rendered for paired areas", () => {
  assert.ok(/\{injuryNeedsSide\(area\) && \(/.test(src),
    "the control must be behind injuryNeedsSide, or the neck gets a Left/Right");
});

// ---------- it reaches the coach and the generator ----------

test("the side leads the line", () => {
  assert.equal(
    H.injuryLines(intake(["Knee"], { Knee: { side: "right", kind: "tendon", status: "current" } })),
    'Right knee — Tendon pain, bothering them now');
});

test("Both reads as English, not as a label stuck on a word", () => {
  assert.equal(
    H.injuryLines(intake(["Knee"], { Knee: { side: "both", status: "current" } })),
    'Both knees, bothering them now');
  assert.equal(
    H.injuryLines(intake(["Shoulder"], { Shoulder: { side: "both", status: "current" } })),
    'Both shoulders, bothering them now');
  // Already plural or a region: adding an s would be wrong.
  assert.equal(
    H.injuryLines(intake(["Hip / Groin"], { "Hip / Groin": { side: "both", status: "current" } })),
    'Both hip / groin, bothering them now');
});

test("a midline injury is not given a side it does not have", () => {
  const line = H.injuryLines(intake(["Low back"], { "Low back": { side: "left", status: "current" } }));
  assert.ok(!/left/i.test(line), `a stale side leaked into: ${line}`);
  assert.ok(line.startsWith("Low back"));
});

test("an unanswered side degrades to the old wording rather than breaking", () => {
  // Old accounts have injuries recorded with no side at all. They still have
  // to render, for the coach looking at a roster built last year.
  assert.equal(
    H.injuryLines(intake(["Knee"], { Knee: { kind: "joint", status: "past" } })),
    'Knee — Joint pain or arthritis, had it before, fine now');
});

test("the note still rides along behind the side", () => {
  assert.equal(
    H.injuryLines(intake(["Ankle / Foot / Shin"], { "Ankle / Foot / Shin": { side: "left", status: "current", note: "rolled it in June" } })),
    'Left ankle / foot / shin, bothering them now ("rolled it in June")');
});

test("several injuries stay separated", () => {
  const line = H.injuryLines(intake(["Knee", "Shoulder"],
    { Knee: { side: "right" }, Shoulder: { side: "left" } }));
  assert.ok(line.includes("Right knee"), line);
  assert.ok(line.includes("Left shoulder"), line);
  assert.ok(line.includes(";"), "two injuries must not run together");
});

test("no injuries still reads None, which the generator prompt relies on", () => {
  assert.equal(H.injuryLines(intake([])), "None");
  assert.equal(H.injuryLines(intake(["None currently"])), "None");
});

test("the side survives setInjuryDetail alongside the other fields", () => {
  let d = { injuryDetail: {} };
  d = { injuryDetail: H.setInjuryDetail(d, "Knee", { side: "left" }) };
  d = { injuryDetail: H.setInjuryDetail(d, "Knee", { kind: "tendon" }) };
  assert.equal(H.injuryDetailFor(d, "Knee").side, "left", "setting the kind wiped the side");
  assert.equal(H.injuryDetailFor(d, "Knee").kind, "tendon");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
