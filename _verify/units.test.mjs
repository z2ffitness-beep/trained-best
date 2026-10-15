// Pounds underneath, whichever unit is on the screen.
//
// Two separate things used to be one setting. The number an athlete gave for
// their bodyweight at signup also decided what unit the bar was read in, so
// someone who weighs themselves in kilos and loads plates in pounds — which
// around here is most people — had no way to say so. `unit_pref` is the
// lifting one; `intake.weightUnit` stays the bodyweight one.
//
// The part that has to be right is the conversion. Weights going into
// workout_sets are stored in pounds whatever was typed, so a best set and
// today's set can be compared as numbers instead of as a units puzzle. Get
// this wrong in the quiet direction and the app tells someone 60 kg is
// lighter than 135 lb, which is exactly the kind of wrong that gets loaded
// onto a barbell.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  { name: "LB_PER_KG", kind: "const" },
  "convertWeight",
  { name: "KG_DISPLAY_STEP", kind: "const" },
  "displayWeight", "setInUnit",
  { name: "weightStepFor", kind: "const" },
  "normalizeWeight", "wasLifted", "bestLoggedWeight",
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const set = (n, weight, unit = "lb", reps = 5, done = true) => ({
  set: n, done, weight, unit: weight == null ? null : unit, reps,
});
const log = (date, name, sets) => ({ date, exercises: [{ name, sets }] });

// ---------- converting for the screen ----------

test("pounds pass through untouched", () => {
  assert.equal(H.displayWeight(135, "lb", "lb"), 135);
  // Micro-plates are real, so one decimal survives.
  assert.equal(H.displayWeight(137.5, "lb", "lb"), 137.5);
});

test("kilos are shown to the nearest half, because plates are", () => {
  // 135 lb is 61.236... kg. Printing that claims a precision no gym has.
  assert.equal(H.displayWeight(135, "lb", "kg"), 61);
  assert.equal(H.displayWeight(100, "lb", "kg"), 45.5);
  assert.equal(H.KG_DISPLAY_STEP, 0.5);
  // Every kilo figure the app prints must land on a half.
  for (const lb of [45, 95, 135, 185, 225, 275, 315, 405]) {
    const kg = H.displayWeight(lb, "lb", "kg");
    assert.equal(kg * 2, Math.round(kg * 2), `${lb} lb came out as ${kg} kg, which is not a half`);
  }
});

test("a round trip through kilos does not drift the stored pounds", () => {
  // The display rounds. The STORE must not, or a lifter in kilos watches
  // their squat creep up or down by itself every time they open the app.
  const shown = H.displayWeight(225, "lb", "kg");          // 102 kg
  const backToLb = H.convertWeight(shown, "kg", "lb");     // ~224.9
  assert.ok(Math.abs(backToLb - 225) < 1.5,
    `225 lb round-tripped to ${backToLb} lb`);
});

test("nothing in, nothing out", () => {
  assert.equal(H.displayWeight(null, "lb", "kg"), null);
  assert.equal(H.displayWeight(undefined, "lb", "lb"), null);
  // A bodyweight set carries reps and no weight. It must not read as zero.
  assert.equal(H.displayWeight(NaN, "lb", "lb"), null);
});

test("a missing unit is taken as pounds, not as 'no conversion'", () => {
  // Sets logged before units existed have no `unit` field at all.
  assert.equal(H.displayWeight(135, null, "kg"), 61);
  assert.equal(H.displayWeight(61, "kg", null), 134.5);
});

// ---------- a set, converted and relabelled together ----------

test("setInUnit moves the number and the label as one", () => {
  const out = H.setInUnit(set(1, 135, "lb"), "kg");
  assert.equal(out.weight, 61);
  assert.equal(out.unit, "kg");
  // The rest of the set is untouched — the reps did not change units.
  assert.equal(out.reps, 5);
  assert.equal(out.set, 1);
  assert.equal(out.done, true);
});

test("setInUnit never leaves a number wearing the wrong label", () => {
  // This is the whole reason it exists. Converting the weight and forgetting
  // the unit prints "61 lb" for a 135 lb set.
  for (const [stored, from, to] of [[135, "lb", "kg"], [60, "kg", "lb"], [100, "lb", "lb"]]) {
    const out = H.setInUnit(set(1, stored, from), to);
    assert.equal(out.unit, to);
    assert.equal(out.weight, H.displayWeight(stored, from, to));
  }
});

test("a weightless set keeps its reps and still gets the right label", () => {
  const out = H.setInUnit({ set: 2, done: true, weight: null, unit: null, reps: 20 }, "kg");
  assert.equal(out.weight, null);
  assert.equal(out.reps, 20);
  assert.equal(out.unit, "kg");
});

test("setInUnit on nothing is nothing, not a crash", () => {
  assert.equal(H.setInUnit(null, "kg"), null);
  assert.equal(H.setInUnit(undefined, "lb"), null);
});

// ---------- the step the buttons move by ----------

test("the minus and plus buttons move by the smallest real plate change", () => {
  // Not a converted step. 5 lb is 2.27 kg, and a button that moved 2.27 kg
  // would put a number on screen that cannot be loaded onto a bar.
  assert.equal(H.weightStepFor("lb"), 5);
  assert.equal(H.weightStepFor("kg"), 2.5);
  assert.equal(H.weightStepFor(undefined), 5, "an unset preference must behave as pounds");
});

test("the kilo step lands on halves, like the display does", () => {
  const step = H.weightStepFor("kg");
  assert.equal((step * 4) % H.KG_DISPLAY_STEP, 0);
});

// ---------- best so far ----------

const history = [
  log("2025-09-01", "Back Squat", [set(1, 185), set(2, 205), set(3, 225)]),
  log("2025-09-08", "Back Squat", [set(1, 195), set(2, 215)]),
];

test("the best is the heaviest ticked set across every session", () => {
  assert.equal(H.bestLoggedWeight("Back Squat", history, "lb"), 225);
});

test("the best is reported in the unit being read", () => {
  assert.equal(H.bestLoggedWeight("Back Squat", history, "kg"), 102);
});

test("a weight typed into a set that was never ticked is not a best", () => {
  // The athlete loaded 315, failed it, and left the tick off. Offering that
  // back as their best is the app congratulating them for a missed lift.
  const withFail = [...history, log("2025-09-15", "Back Squat", [set(1, 315, "lb", 1, false)])];
  assert.equal(H.bestLoggedWeight("Back Squat", withFail, "lb"), 225);
});

test("a best set logged in kilos still wins against pounds", () => {
  // The comparison this whole file exists for. 110 kg is 242 lb; compared as
  // bare numbers, 110 loses to 225 and the athlete's real best disappears.
  const mixed = [...history, log("2025-09-15", "Back Squat", [set(1, 110, "kg")])];
  assert.equal(H.bestLoggedWeight("Back Squat", mixed, "lb"), 242.5);
});

test("the name is matched without regard to case, and nothing else is", () => {
  assert.equal(H.bestLoggedWeight("back squat", history, "lb"), 225);
  assert.equal(H.bestLoggedWeight("Front Squat", history, "lb"), null);
});

test("no history is null, not zero", () => {
  // Zero would draw a placeholder of "0" over an empty weight box, which
  // reads as a logged lift of nothing.
  assert.equal(H.bestLoggedWeight("Back Squat", [], "lb"), null);
  assert.equal(H.bestLoggedWeight("Back Squat", null, "lb"), null);
  assert.equal(H.bestLoggedWeight("", history, "lb"), null);
});

test("a reps-only movement has no best weight", () => {
  const pushups = [log("2025-09-01", "Push-Up", [{ set: 1, done: true, weight: null, unit: null, reps: 30 }])];
  assert.equal(H.bestLoggedWeight("Push-Up", pushups, "lb"), null);
});

// ---------- the two settings stay apart ----------

const src = readSource(APP);

test("the workout screen reads the lifting preference, not the bodyweight one", () => {
  const at = src.indexOf("const weightUnit = state.me.");
  assert.ok(at > 0, "the workout screen no longer resolves a unit at all");
  const line = src.slice(at, src.indexOf("\n", at));
  assert.ok(/state\.me\.unitPref/.test(line),
    `the bar is still read in the bodyweight unit: ${line.trim()}`);
  assert.ok(!/intake\?\.weightUnit/.test(line),
    `intake.weightUnit is the BODYWEIGHT setting: ${line.trim()}`);
});

test("the bodyweight unit is still its own setting and still editable", () => {
  // Splitting them must not quietly delete the one that was there first.
  assert.ok(/const \[weightUnit, setWeightUnit\] = useState\(m\.intake\?\.weightUnit \|\| "lb"\)/.test(src),
    "the profile editor no longer holds a bodyweight unit");
});

test("the preference arrives from the profile row on sign-in", () => {
  assert.ok(/unitPref: profile\.unit_pref === "kg" \? "kg" : "lb"/.test(src),
    "unit_pref is never read out of the profile, so the switch resets on every login");
  assert.ok(/themePref: profile\.theme_pref/.test(src),
    "theme_pref is never read out of the profile");
});

test("there is a default before anyone has signed in", () => {
  // Without it the first render of the workout screen reads undefined and
  // silently falls back — which works, until someone writes `unitPref === "lb"`.
  const at = src.indexOf("me: { id: null, name: \"You\"");
  assert.ok(at > 0, "the initial state no longer has a `me`");
  const line = src.slice(at, src.indexOf("\n", at));
  assert.ok(/unitPref: "lb"/.test(line), "no default lifting unit");
  assert.ok(/themePref: "system"/.test(line), "no default appearance");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
