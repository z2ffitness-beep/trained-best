// The screen signup ends on.
//
// Before this there was a spinner and then the dashboard, which meant the
// twenty questions and the programme they produced were never connected for
// the person who answered them. This screen says what was chosen and what is
// left of the week, and then gets out of the way.
//
// Two things here are easy to get wrong and both are worth a test. The first
// is showing the WHOLE week: a programme generated on a Thursday that opens
// with "Monday — Lower Body" reads as three sessions already missed, on day
// one, before the athlete has done anything. The second is announcing a plan
// that was not saved: the generation can fail, and a confident "your plan is
// ready" over a programme that does not exist is worse than the error.
import assert from "node:assert/strict";
import { readSource, load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);

const { planReadySummary, planReadyWeek, WEEKDAY_ORDER } = await load(APP, [
  { name: "SPLIT_STYLES", kind: "const" },
  { name: "DEFAULT_SPLIT", kind: "const" },
  "deriveSplit",
  { name: "WEEKDAY_ORDER", kind: "const" },
  "planReadySummary", "planReadyWeek",
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const intake = {
  "🥊 Sport / Focus": "MMA",
  goals: ["Build muscle", "Get stronger"],
  trainingDays: ["Monday", "Wednesday", "Friday"],
  sessionMinutes: 60,
  equipment: ["Full gym access", "Kettlebells"],
  injuries: ["Left knee"],
};
const valueOf = (rows, label) => rows.find(r => r.label === label)?.value;

// ---------- what was chosen ----------

test("the summary says back what was actually answered", () => {
  const rows = planReadySummary(intake);
  assert.equal(valueOf(rows, "Training for"), "MMA");
  assert.equal(valueOf(rows, "Goals"), "Build muscle, Get stronger");
  assert.equal(valueOf(rows, "Days a week"), "3 — Mon, Wed, Fri");
  assert.equal(valueOf(rows, "Session length"), "About 60 minutes");
  assert.equal(valueOf(rows, "Equipment"), "Full gym access, Kettlebells");
  assert.equal(valueOf(rows, "Working around"), "Left knee");
});

test("one goal is not labelled Goals", () => {
  // Small, but this screen is the first thing the app ever says to somebody
  // and "Goals: Build muscle" reads as written by a form.
  assert.ok(planReadySummary({ ...intake, goals: ["Build muscle"] }).some(r => r.label === "Goal"));
  assert.ok(planReadySummary(intake).some(r => r.label === "Goals"));
});

test("a question that was not answered gets no row at all", () => {
  // An empty value reads as an answer that failed to save, which is exactly
  // the fear somebody has just after typing twenty of them.
  const rows = planReadySummary({});
  for (const r of rows) {
    assert.ok(r.value && String(r.value).trim(), `"${r.label}" has an empty value`);
  }
  const labels = rows.map(r => r.label);
  assert.ok(!labels.includes("Training for"));
  assert.ok(!labels.includes("Days a week"));
  assert.ok(!labels.includes("Session length"));
  assert.ok(!labels.includes("Equipment"));
});

test("no injuries is said out loud rather than left off", () => {
  // The opposite of the rule above, deliberately. Having just spent a screen
  // listing what hurts, "Working around: nothing" is worth reading - a
  // missing row looks like the answer was lost.
  for (const inj of [undefined, [], ["None currently"]]) {
    const v = valueOf(planReadySummary({ ...intake, injuries: inj }), "Working around");
    assert.equal(v, "Nothing you told us about", JSON.stringify(inj));
  }
});

test("the split shown is the one the programme was built on", () => {
  // Shown because it is the one answer nobody gave: it comes from the days.
  // If this row and the generator ever disagree, the athlete is told their
  // week is one shape and trains another.
  const five = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  assert.equal(valueOf(planReadySummary({ ...intake, trainingDays: five }), "Week split"),
    "Upper / lower");
  assert.equal(valueOf(planReadySummary(intake), "Week split"),
    "Full body every session");
  // An explicit choice wins here too, the same as everywhere else.
  assert.equal(valueOf(planReadySummary({ ...intake, trainingDays: five }, "push_pull_legs"), "Week split"),
    "Push / pull / legs");
});

test("a split nobody recognises shows nothing rather than a raw key", () => {
  const rows = planReadySummary(intake, "upper-lower");
  assert.equal(valueOf(rows, "Week split"), undefined);
});

test("a long equipment list is cut down instead of filling the screen", () => {
  const kit = ["Full gym access", "Barbell + rack", "Dumbbells", "Kettlebells", "Pull-up bar"];
  assert.equal(valueOf(planReadySummary({ ...intake, equipment: kit }), "Equipment"),
    "Full gym access, Barbell + rack, Dumbbells +2 more");
  // Exactly three is still the whole list, not "+0 more".
  assert.equal(valueOf(planReadySummary({ ...intake, equipment: kit.slice(0, 3) }), "Equipment"),
    "Full gym access, Barbell + rack, Dumbbells");
});

// ---------- what is left of the week ----------

const days = [
  { name: "Lower Body", weekday: "Monday" },
  { name: "Upper Push", weekday: "Wednesday" },
  { name: "Full Body", weekday: "Friday" },
];

test("only the days still to come are shown", () => {
  // THE test here. On a Thursday, showing Monday and Wednesday tells a
  // brand-new athlete they are already two sessions behind.
  assert.deepEqual(planReadyWeek(days, "Monday").map(d => d.weekday),
    ["Monday", "Wednesday", "Friday"]);
  assert.deepEqual(planReadyWeek(days, "Thursday").map(d => d.weekday), ["Friday"]);
  assert.deepEqual(planReadyWeek(days, "Tuesday").map(d => d.weekday), ["Wednesday", "Friday"]);
});

test("today counts as still to come", () => {
  // Signing up on a Wednesday morning and being told Wednesday has passed is
  // the version of this bug that costs a first session.
  assert.deepEqual(planReadyWeek(days, "Wednesday").map(d => d.weekday), ["Wednesday", "Friday"]);
});

test("a week with nothing left is an empty list, not the whole week", () => {
  // The screen has a message for this. Falling back to "show everything"
  // would be the easy mistake and it says the opposite of the truth.
  assert.deepEqual(planReadyWeek(days, "Saturday"), []);
  assert.deepEqual(planReadyWeek(days, "Sunday"), []);
});

test("the sessions come back in the order they will be trained", () => {
  const scrambled = [
    { name: "Full Body", weekday: "Friday" },
    { name: "Lower Body", weekday: "Monday" },
    { name: "Upper Push", weekday: "Wednesday" },
  ];
  assert.deepEqual(planReadyWeek(scrambled, "Monday").map(d => d.name),
    ["Lower Body", "Upper Push", "Full Body"]);
});

test("two sessions on one day both survive", () => {
  // attachWeekdays wraps when a programme has more days than the week, so
  // this is reachable rather than theoretical, and a de-dupe here would drop
  // a real session off the list.
  const twice = [...days, { name: "Conditioning", weekday: "Friday" }];
  assert.deepEqual(planReadyWeek(twice, "Friday").map(d => d.name), ["Full Body", "Conditioning"]);
});

test("nothing, nonsense or a missing weekday does not throw", () => {
  assert.deepEqual(planReadyWeek(null, "Monday"), []);
  assert.deepEqual(planReadyWeek(undefined, "Monday"), []);
  assert.deepEqual(planReadyWeek(days, "Caturday"), []);
  assert.deepEqual(planReadyWeek(days, undefined), []);
  // A day that never got a weekday is a ghost elsewhere in the app too; it
  // must not appear here as an undated session.
  assert.deepEqual(planReadyWeek([{ name: "Orphan" }, null, ...days], "Monday").map(d => d.name),
    ["Lower Body", "Upper Push", "Full Body"]);
});

// ---------- how it is wired ----------

test("the screen only appears when a programme was actually saved", () => {
  // setPlanReady is inside the try, after createProgramRow and after the
  // state is applied. A failed generation must land on the dashboard with
  // the retry the Program tab offers, not on "your plan is ready".
  const at = src.indexOf("setPlanReady({ intake: data");
  assert.ok(at > 0, "the plan-ready screen is never shown");
  const catchAt = src.indexOf("console.error(\"Program generation failed:\"", at - 4000);
  assert.ok(catchAt > at, "setPlanReady happens after the catch block, so a failure announces a plan");
  const before = src.slice(at - 900, at);
  assert.ok(/await clearProgramFailure\(userId\);/.test(before),
    "the screen is set before the programme is finished saving");
});

test("the day the week starts from is today, worked out from the real date", () => {
  // getDay() is Sunday-first and WEEKDAY_ORDER is Monday-first. Getting that
  // wrong shifts the whole week by one and is invisible six days out of
  // seven to anyone testing on a Monday.
  const at = src.indexOf("function PlanReadyScreen(");
  const fn = src.slice(at, at + 1200);
  assert.ok(/WEEKDAY_ORDER\[\(new Date\(\)\.getDay\(\) \+ 6\) % 7\]/.test(fn),
    "today's weekday is read in a way that does not match WEEKDAY_ORDER");
  // Proves the conversion rather than trusting the shape of it.
  for (let js = 0; js < 7; js++) {
    const expected = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][js];
    assert.equal(WEEKDAY_ORDER[(js + 6) % 7], expected, `getDay() === ${js}`);
  }
});

test("dismissing it leaves the athlete on the dashboard", () => {
  assert.ok(/setView\("athlete-dashboard"\);/.test(src));
  assert.ok(/onStart=\{\(\) => setPlanReady\(null\)\}/.test(src),
    "there is no way off the plan-ready screen");
});

test("the button does not scroll away on a long summary", () => {
  const at = src.indexOf("function PlanReadyScreen(");
  const fn = src.slice(at, src.indexOf("\n}", at));
  assert.ok(/position: "sticky", bottom: 0/.test(fn), "Start training scrolls off a long week");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
