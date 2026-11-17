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
  { name: "JUMP_HEAVY_LB", kind: "const" }, { name: "JUMP_NONE_LB", kind: "const" }, "jumpTierOf",
  "trainingProfileOf", "jumpRuleText", "sessionShapeBlock", "smallJumpNote", { name: "capReps", kind: "const" },
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
  assert.match(block, /No power block/);
  assert.match(block, /AEROBIC WORK ON THEIR OWN TIME/);
});

test("fighters keep the jump and the throw", () => {
  const p = H.trainingProfileOf(fighter);
  assert.equal(p.shape, "athletic");
  assert.equal(p.power, "full");
  assert.equal(p.jumps, "full");
});

test("jumping scales with body weight: about 190 lb jumps, 250 lb hops small, 300 lb does not jump", () => {
  assert.equal(H.jumpTierOf({ ...fighter, weightLb: 192 }).tier, "full");
  assert.equal(H.jumpTierOf({ ...weightLoss, weightLb: 192 }).tier, "full");
  assert.equal(H.jumpTierOf({ ...fighter, weightLb: 260 }).tier, "small");
  assert.equal(H.jumpTierOf({ ...fighter, heightCm: 165, weightLb: 200 }).tier, "small", "BMI 33");
  assert.equal(H.jumpTierOf({ ...fighter, weightLb: 305 }).tier, "none");
  assert.equal(H.jumpTierOf({ ...fighter, heightCm: 160, weightLb: 230 }).tier, "none", "BMI 40");
  assert.match(H.jumpRuleText(H.trainingProfileOf({ ...fighter, weightLb: 260 })), /small forward hops at about half their normal distance/);
  assert.match(H.jumpRuleText(H.trainingProfileOf({ ...fighter, weightLb: 260 })), /NEVER repeated or continuous jumps/);
});

test("age, experience, injury and a doctor's clearance also shrink or stop the jumps", () => {
  assert.equal(H.jumpTierOf({ ...fighter, birthday: "1970-01-01" }).tier, "small");
  assert.equal(H.jumpTierOf({ ...fighter, birthday: "1955-01-01" }).tier, "none");
  assert.equal(H.jumpTierOf({ ...fighter, experience: "Beginner" }).tier, "small");
  assert.equal(H.jumpTierOf({ ...fighter, injuries: ["Knee"], injuryDetail: { Knee: { status: "now" } } }).tier, "small");
  assert.equal(H.jumpTierOf({ ...fighter, injuries: ["Knee"], injuryDetail: { Knee: { status: "past" } } }).tier, "full");
  assert.equal(H.jumpTierOf({ ...fighter, parq: { heart: true }, parqCleared: false }).tier, "none");
});

test("weight loss: no power block or jumps in the main work, but warm-up hops stay at a normal weight", () => {
  const out = H.fitProgramToPerson(day(
    ["warmup_general", "Jump Rope"], ["warmup_specific", "Pogo Jumps"],
    ["explosive", "Broad Jump"], ["explosive", "Med Ball Chest Pass"],
    ["compound", "Goblet Squat"], ["hypertrophy", "Jump Squat", "a"], ["hypertrophy", "Dumbbell Row", "a"],
    ["lactic", "Rower Intervals"],
  ), weightLoss)[0].exercises;
  const names = out.map(x => x.name);
  assert.deepEqual(names, ["Jump Rope", "Pogo Jumps", "Goblet Squat", "Dumbbell Row", "Rower Intervals"]);
  assert.equal(out.find(x => x.name === "Dumbbell Row").groupId, null, "a superset that lost its partner is a straight set");
});

test("a heavy athlete keeps the broad jump as small hops with a note, and nothing repeated", () => {
  const heavy = { ...fighter, weightLb: 265 };
  const out = H.fitProgramToPerson(day(
    ["warmup_specific", "Pogo Jumps"], ["explosive", "Broad Jump"], ["explosive", "Repeated Broad Jumps"],
    ["explosive", "Depth Jump"], ["explosive", "Ground Chest Pass"], ["lactic", "Burpees"],
  ), heavy)[0].exercises;
  assert.deepEqual(out.map(x => x.name), ["Pogo Jumps", "Broad Jump", "Ground Chest Pass", "Burpees"]);
  assert.match(out[1].note, /Small forward hops, about half your normal distance/);
  assert.match(out[0].note, /Small, quick hops/);
  assert.match(out[3].note, /Step back and step in/);
  assert.equal(out.find(x => x.name === "Ground Chest Pass").note, undefined, "throws are left alone");
});

test("at 300 lb nothing jumps, and the warm-up swaps to the bike", () => {
  const out = H.fitProgramToPerson(day(
    ["warmup_general", "Jump Rope"], ["warmup_specific", "Pogo Jumps"], ["explosive", "Broad Jump"],
    ["explosive", "Ground Chest Pass"], ["compound", "Trap Bar Deadlift"], ["lactic", "Burpees"],
  ), { ...fighter, weightLb: 310 })[0].exercises;
  assert.deepEqual(out.map(x => x.name), ["Easy Bike or Brisk Walk", "Bodyweight Box Squat", "Ground Chest Pass", "Trap Bar Deadlift"]);
});

test("a fighter at a normal weight keeps everything as written", () => {
  const full = H.fitProgramToPerson(day(["explosive", "Single Leg Bounds"], ["explosive", "Broad Jump"]), fighter)[0].exercises;
  assert.deepEqual(full.map(x => x.name), ["Single Leg Bounds", "Broad Jump"]);
  assert.ok(full.every(x => !x.note));
});

test("the prompt follows the profile", () => {
  const prompt = src.slice(src.indexOf("function buildAIPrompt(intake)"), src.indexOf("function buildAIPrompt(intake)") + 30000);
  assert.ok(prompt.includes("${sessionShapeBlock(intake)}"));
  assert.ok(prompt.includes("NO POWER BLOCK for this person"));
  assert.ok(!prompt.includes("For general fitness, 1 is enough."), "the general-fitness jump is gone");
  assert.ok(prompt.includes("there is no power block, so this is a bodyweight or band rehearsal"));
  assert.ok(prompt.includes('"note": "short coaching cue, or null"'), "the AI can write a cue");
});

test("both builds run the guard", () => {
  assert.equal((src.match(/fitProgramToPerson\(parsed\.days/g) || []).length, 2);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
