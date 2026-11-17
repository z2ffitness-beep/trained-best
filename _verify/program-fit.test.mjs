// Isaiah, 17 Nov: a mock client who picked general fitness and weight loss got
// broad jumps. Every program followed the athlete template (warm-up, plyos and
// ballistics, lifts, conditioning). Now the goal decides the session's shape,
// jumping is earned by the goal and by the body doing it, and a guard takes
// out anything the model slips through anyway.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load, readSource } from "./extract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  "parseDateParts", { name: "toLocalISO", kind: "const" }, { name: "todayISO", kind: "const" }, "ageFromBirthday",
  "focusTypeOf", "isCombatFocus", "sportProfileApplies", "sportProgramOn",
  { name: "START_LEVELS", kind: "const" }, "startLevelOf",
  { name: "PARQ_QUESTIONS", kind: "const" }, "parqFlags", "needsClearance",
  "injuryDetailFor", { name: "PROFILE_SHAPES", kind: "const" }, "bmiOf", "currentInjuryAreas",
  "trainingProfileOf", "sessionShapeBlock",
  { name: "JUMP_RE", kind: "const" }, { name: "HIGH_PLYO_RE", kind: "const" }, { name: "IMPACT_RE", kind: "const" },
  "fitProgramToPerson",
]);

let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);

const weightLoss = { focusType: "general", "🥊 Sport / Focus": "General Fitness", goals: ["Weight Loss"], heightCm: 178, weightLb: 200, birthday: "1995-03-01", experience: "Intermediate" };
const fighter = { "🥊 Sport / Focus": "Combat Sports", isFighter: true, goals: ["Strength"], heightCm: 178, weightLb: 170, birthday: "1998-03-01", experience: "Advanced", lastConsistent: "now" };

const day = (...ex) => [{ name: "Day 1", exercises: ex.map(([phase, name, groupId]) => ({ phase, name, sets: 3, reps: "5", groupId: groupId || null, groupKind: groupId ? "superset" : null })) }];

test("weight loss and general fitness get no power block at all", () => {
  for (const g of [["Weight Loss"], ["Build Muscle"], ["Strength"], [], ["Conditioning / Endurance"]]) {
    const p = H.trainingProfileOf({ ...weightLoss, goals: g });
    assert.equal(p.power, "none", g.join());
    assert.notEqual(p.shape, "athletic");
  }
  assert.equal(H.trainingProfileOf(weightLoss).shape, "fat_loss");
});

test("a weight-loss session is lift, superset, conditioning, with aerobic work on their own time", () => {
  const block = H.sessionShapeBlock(weightLoss);
  assert.match(block, /Strength first/);
  assert.match(block, /supersets or a short circuit/);
  assert.match(block, /No plyometrics anywhere/);
  assert.match(block, /AEROBIC WORK ON THEIR OWN TIME/);
  assert.match(block, /low impact/i);
});

test("fighters keep the jump and the throw", () => {
  const p = H.trainingProfileOf(fighter);
  assert.equal(p.shape, "athletic");
  assert.equal(p.power, "full");
});

test("a heavy, older or brand-new athlete gets low-level jumps only, or none", () => {
  assert.equal(H.trainingProfileOf({ ...fighter, weightLb: 235 }).power, "low");   // BMI 33.6
  assert.equal(H.trainingProfileOf({ ...fighter, weightLb: 225 }).power, "low");   // BMI 32
  assert.equal(H.trainingProfileOf({ ...fighter, weightLb: 260 }).power, "none");  // BMI 37
  assert.equal(H.trainingProfileOf({ ...fighter, birthday: "1970-01-01" }).power, "low");
  assert.equal(H.trainingProfileOf({ ...fighter, birthday: "1955-01-01" }).power, "none");
  assert.equal(H.trainingProfileOf({ ...fighter, experience: "Beginner" }).power, "low");
  assert.equal(H.trainingProfileOf({ ...fighter, injuries: ["Knee"], injuryDetail: { Knee: { status: "now" } } }).power, "low");
  assert.equal(H.trainingProfileOf({ ...fighter, injuries: ["Knee"], injuryDetail: { Knee: { status: "past" } } }).power, "full");
});

test("the guard strips jumps the profile does not allow", () => {
  const out = H.fitProgramToPerson(day(
    ["warmup_general", "Jump Rope"], ["warmup_specific", "Pogo Jumps"],
    ["explosive", "Broad Jump"], ["explosive", "Med Ball Chest Pass"],
    ["compound", "Goblet Squat"], ["hypertrophy", "Jump Squat", "a"], ["hypertrophy", "Dumbbell Row", "a"],
    ["lactic", "Burpees"], ["lactic", "Rower Intervals"],
  ), weightLoss)[0].exercises;
  const names = out.map(x => x.name);
  assert.ok(!names.some(n => /jump|burpee|pogo/i.test(n) && !/Easy Bike/.test(n)), names.join(", "));
  assert.ok(!out.some(x => x.phase === "explosive"));
  assert.ok(names.includes("Easy Bike or Brisk Walk"));
  assert.ok(names.includes("Goblet Squat") && names.includes("Rower Intervals"));
  assert.equal(out.find(x => x.name === "Dumbbell Row").groupId, null, "a superset that lost its partner is a straight set");
});

test("the guard leaves a fighter's power alone and tones it down when power is low", () => {
  const full = H.fitProgramToPerson(day(["explosive", "Single Leg Bounds"], ["explosive", "Broad Jump"]), fighter)[0].exercises;
  assert.deepEqual(full.map(x => x.name), ["Single Leg Bounds", "Broad Jump"]);
  const low = H.fitProgramToPerson(day(["explosive", "Single Leg Bounds"], ["explosive", "Depth Jump"], ["explosive", "Ground Chest Pass"]), { ...fighter, experience: "Beginner" })[0].exercises;
  assert.deepEqual(low.map(x => x.name), ["Pogo Jumps", "Ground Chest Pass"]);
});

test("the prompt follows the profile", () => {
  const prompt = src.slice(src.indexOf("function buildAIPrompt(intake)"), src.indexOf("function buildAIPrompt(intake)") + 30000);
  assert.ok(prompt.includes("${sessionShapeBlock(intake)}"));
  assert.ok(prompt.includes("NO POWER BLOCK for this person"));
  assert.ok(!prompt.includes("For general fitness, 1 is enough."), "the general-fitness jump is gone");
  assert.ok(prompt.includes("there is no power block, so this is a bodyweight or band rehearsal"));
});

test("both builds run the guard", () => {
  assert.equal((src.match(/fitProgramToPerson\(parsed\.days/g) || []).length, 2);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
