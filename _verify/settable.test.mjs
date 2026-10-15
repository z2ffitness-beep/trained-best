// The set table: SET, REPS, WEIGHT, DONE, and the two rules that make it
// usable with chalky hands.
//
// Fill-down is the one with teeth. Nobody does five sets at five different
// weights, so typing a number into set 1 copies it down — but a set already
// ticked is history and a set the athlete typed into themselves is a
// decision, and overwriting either of those turns a convenience into a
// reason to stop trusting the app. Both exclusions are tested here, in both
// directions, because a fill that never overwrites anything is just as
// broken as one that overwrites everything and far harder to notice.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  "normalizeWeight",
  { name: "weightStepFor", kind: "const" },
  "fillWeightDown", "stepWeight",
]);

const src = readSource(APP);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const fill = (opts) => H.fillWeightDown({ total: 5, ...opts });

// ---------- filling down ----------

test("typing into set 1 fills every set below it", () => {
  assert.deepEqual(fill({ weights: [], index: 0, value: "135" }),
    ["135", "135", "135", "135", "135"]);
});

test("typing into set 3 leaves sets 1 and 2 alone", () => {
  // Fill-down, not fill-everywhere. An athlete correcting set 3 has not said
  // anything about the two sets they already finished.
  assert.deepEqual(
    fill({ weights: ["135", "135", "135", "135", "135"], index: 2, value: "155" }),
    ["135", "135", "155", "155", "155"]);
});

test("a ticked set keeps the weight it was done at", () => {
  // Set 2 was done at 135. Changing set 1 afterwards must not rewrite
  // history into something the athlete never lifted.
  assert.deepEqual(
    fill({ weights: ["135", "135", "", "", ""], checks: [1], index: 0, value: "145" }),
    ["145", "135", "145", "145", "145"]);
});

test("a hand-set set keeps its value forever after", () => {
  // The drop set at the end. They typed 95 into set 5 on purpose; fixing a
  // typo in set 1 must not take it away.
  assert.deepEqual(
    fill({ weights: ["135", "", "", "", "95"], handSet: [true, false, false, false, true], index: 0, value: "145" }),
    ["145", "145", "145", "145", "95"]);
});

test("a set that is both ticked and hand-set is still left alone", () => {
  assert.deepEqual(
    fill({ weights: ["135", "225", "", ""], handSet: [false, true], checks: [1], total: 4, index: 0, value: "145" }),
    ["145", "225", "145", "145"]);
});

test("clearing a box clears only that box", () => {
  // The data-loss bug wearing a feature's clothes: blanking set 1 and
  // watching four sets of work empty out behind it.
  assert.deepEqual(
    fill({ weights: ["135", "135", "135", "135", "135"], index: 0, value: "" }),
    ["", "135", "135", "135", "135"]);
  assert.deepEqual(
    fill({ weights: ["135", "135"], total: 2, index: 0, value: null }),
    [null, "135"]);
});

test("the last set has nothing below it and nothing breaks", () => {
  assert.deepEqual(
    fill({ weights: ["135", "135", "135"], total: 3, index: 2, value: "185" }),
    ["135", "135", "185"]);
});

test("the array comes back the length of the prescription", () => {
  // Sets are keyed by index. An array shorter than the prescription means
  // set 5's box reads undefined and the save writes nothing for it.
  assert.equal(fill({ weights: [], index: 0, value: "100", total: 5 }).length, 5);
  // And a prescription that shrank mid-session must not truncate what was
  // already typed into the sets that are gone — they are still in the draft.
  assert.equal(fill({ weights: ["1", "2", "3", "4", "5"], total: 3, index: 0, value: "9" }).length, 5);
});

test("a half-typed number fills down as it stands", () => {
  // Weights are held as the raw typed string so "13" isn't rounded out from
  // under the cursor. The fill works on strings for the same reason.
  assert.deepEqual(fill({ weights: [], total: 3, index: 0, value: "13" }),
    ["13", "13", "13"]);
});

// ---------- the minus and plus buttons ----------

test("plus and minus move by one pair of plates", () => {
  assert.equal(H.stepWeight("135", 1, "lb"), 140);
  assert.equal(H.stepWeight("135", -1, "lb"), 130);
  assert.equal(H.stepWeight("60", 1, "kg"), 62.5);
  assert.equal(H.stepWeight("60", -1, "kg"), 57.5);
});

test("the first press on an empty box lands on their best so far", () => {
  // Starting at zero means holding the plus button down forty times to get
  // to a working weight, which is not a feature anyone uses twice.
  assert.equal(H.stepWeight("", 1, "lb", 225), 225);
  assert.equal(H.stepWeight(null, -1, "lb", 225), 225);
  assert.equal(H.stepWeight(undefined, 1, "kg", 100), 100);
});

test("with no history at all, plus starts one step up and minus stays at zero", () => {
  assert.equal(H.stepWeight("", 1, "lb", null), 5);
  assert.equal(H.stepWeight("", -1, "lb", null), 0);
  assert.equal(H.stepWeight("", 1, "kg", null), 2.5);
});

test("minus never goes below zero", () => {
  // A negative weight is not a lighter lift, it is a number that breaks
  // every total downstream of it.
  assert.equal(H.stepWeight("2", -1, "lb"), 0);
  assert.equal(H.stepWeight("0", -1, "kg"), 0);
});

test("stepping keeps one decimal and does not accumulate float dust", () => {
  // 2.5 added thirty times in floating point is 75.00000000000001, and that
  // is what would get written to the database.
  let v = "0";
  for (let i = 0; i < 30; i++) v = String(H.stepWeight(v, 1, "kg"));
  assert.equal(Number(v), 75);
});

test("a half-typed box steps from nothing rather than from NaN", () => {
  // parseFloat(".") is NaN. Without the guard the button writes NaN into the
  // field and the set logs as no weight at all.
  assert.equal(H.stepWeight(".", 1, "lb", 100), 100);
  assert.equal(H.stepWeight("abc", 1, "lb", null), 5);
});

// ---------- what is actually on the screen ----------

const table = (() => {
  const at = src.indexOf("        {/* SET · REPS · WEIGHT · DONE");
  assert.ok(at > 0, "the set table is gone");
  // To the close of the table container, found by the map that ends it.
  const end = src.indexOf("\n          })}\n        </div>\n", at);
  assert.ok(end > at, "the set table never closes");
  return src.slice(at, end);
})();

test("the columns are in the order the design asks for", () => {
  const order = ["Set</span>", "Reps</span>", '<span className="truncate">Weight</span>', "Done</span>"];
  let cursor = 0;
  for (const heading of order) {
    const at = table.indexOf(heading, cursor);
    assert.ok(at > 0, `the ${heading} column heading is missing`);
    cursor = at;
  }
});

test("the unit switch is in the weight heading, not buried in a profile screen", () => {
  // With a bar loaded, walking to a settings page to change units is the
  // same as not having the setting.
  const header = table.slice(0, table.indexOf("{Array.from({ length: totalSets })"));
  assert.ok(/\["lb", "kg"\]\.map\(option =>/.test(header),
    "the lb/kg switch is not in the table header");
  assert.ok(/onClick=\{\(\) => changeLiftUnit\(option\)\}/.test(header),
    "the switch does not change the unit");
  assert.ok(/aria-pressed=\{weightUnit === option\}/.test(header),
    "the switch does not announce which unit is selected");
});

test("the switch is small enough that nothing in the header collides", () => {
  // Measured, not guessed. At 320px the header has roughly sixty pixels
  // spare once SET, REPS, WEIGHT and DONE have had theirs; the shared
  // UnitToggle is 72px and put "kg" on top of "DONE".
  const header = table.slice(0, table.indexOf("{Array.from({ length: totalSets })"));
  assert.ok(/padding: "3px 7px", borderRadius: 7, fontSize: 10/.test(header),
    "the unit switch has grown back to the full-size control");
  assert.ok(/letterSpacing: 0, textTransform: "none"/.test(header),
    "the switch inherits the header's uppercase tracking and reads as 'L B / K G'");
  assert.ok(/<span className="truncate">Weight<\/span>/.test(header),
    "the Weight label cannot shrink, so a narrow screen pushes the switch into the Done column");
  assert.ok(/tracking-\[\.08em\]/.test(header),
    "the header tracking is wide enough that WEIGHT truncates to WEIG... at 320px");
});

test("every weight box has a minus and a plus beside it", () => {
  assert.ok(/<Minus size=\{14\} \/>/.test(table), "no minus button");
  assert.ok(/<Plus size=\{14\} \/>/.test(table), "no plus button");
  assert.ok(/stepWeight\(typed, -1, weightUnit, bestSoFar\)/.test(table), "minus does not step");
  assert.ok(/stepWeight\(typed, 1, weightUnit, bestSoFar\)/.test(table), "plus does not step");
});

test("the weight placeholder is their best so far", () => {
  assert.ok(/placeholder=\{bestSoFar != null \? String\(bestSoFar\) : "\\u2014"\}/.test(table),
    "the weight box no longer offers their best as a placeholder");
});

test("every way of changing a weight goes through the same door", () => {
  // Typing, the buttons and the suggestion chip all call writeWeight, so the
  // fill-down rule cannot be true of the keyboard and false of the buttons.
  assert.ok(/onChange=\{e => writeWeight\(x, i, e\.target\.value\)\}/.test(table),
    "typing bypasses writeWeight, so it will not fill down");
  assert.ok(!/setSetWeights\(/.test(table),
    "something in the table still writes setSetWeights directly, which skips the fill and the hand-set flag");
});

test("the tick is a sibling of the inputs, never a wrapper round them", () => {
  // A button inside a button is invalid markup, and it made typing a weight
  // also mark the set done.
  assert.ok(/<button onClick=\{\(\) => toggleSet\(i\)\}/.test(table), "the done control is gone");
  const tick = table.slice(table.indexOf("<button onClick={() => toggleSet(i)}"));
  assert.ok(!/<input/.test(tick.slice(0, tick.indexOf("</button>"))),
    "an input is nested inside the done button again");
});

test("the controls say what they are for, one set at a time", () => {
  for (const label of [
    "`Reps completed for set ${i + 1}`",
    "`Weight for set ${i + 1} in ${weightUnit}`",
    "`Take weight off set ${i + 1}`",
    "`Add weight to set ${i + 1}`",
  ]) {
    assert.ok(table.includes(`aria-label={${label}}`), `no label on ${label}`);
  }
  assert.ok(/aria-pressed=\{checked\}/.test(table),
    "the done control does not announce whether it is on");
});

test("the tick stays a real target, not a 20px dot", () => {
  assert.ok(/style=\{\{ width: 44, height: 40 \}\}/.test(table),
    "the done button has shrunk below a thumb");
});

// ---------- the hand-set flag survives the phone ----------

test("hand-set boxes are written into the session draft", () => {
  // Without this a reload mid-session turns every deliberately different set
  // back into a box the next fill stamps over.
  assert.ok(/handSet: remapExerciseKeys\(handSet, toStable\)/.test(src),
    "handSet is never saved to the draft");
  assert.ok(/setHandSet\(remapExerciseKeys\(draft\?\.handSet, toCurrent\)\)/.test(src),
    "handSet is never restored from the draft");
});

test("the draft effect re-runs when a box is hand-set", () => {
  const at = src.indexOf("}, [dayKey, sessionDay, exIdx, setChecks, setWeights, setReps");
  assert.ok(at > 0, "the draft effect's dependency list has moved");
  const deps = src.slice(at, src.indexOf("]", at));
  assert.ok(/\bhandSet\b/.test(deps),
    `handSet is not a dependency, so it is saved a beat late: ${deps}`);
});

test("the fill reads the flags from before this edit, not after", () => {
  // Marking the box hand-set first and then reading the flags would make no
  // difference to the sets below — but it would mean the fill depends on a
  // state update React has not committed yet, which is the bug that made a
  // quick double tap misbehave elsewhere in this screen.
  const at = src.indexOf("const writeWeight = (item, i, value, byHand = true) =>");
  assert.ok(at > 0, "writeWeight is gone");
  const body = src.slice(at, src.indexOf("\n  };", at));
  assert.ok(/handSet: handSet\[item\.id\] \|\| \[\]/.test(body),
    "the fill is reading the hand-set flags from somewhere other than render state");
  assert.ok(/checks: checksRef\.current\[item\.id\] \|\| \[\]/.test(body),
    "the fill reads ticked sets from render state, which lags a fast tap");
});

// ---------- changing units ----------

test("switching units converts what is already typed", () => {
  // Relabelling instead would turn a typed 135 into 135 kg — a
  // three-hundred-pound bench press, logged and sent to the coach.
  const at = src.indexOf("const changeLiftUnit = async (next) =>");
  assert.ok(at > 0, "the unit switch has no handler");
  const body = src.slice(at, src.indexOf("\n  };", at));
  assert.ok(/displayWeight\(normalizeWeight\(v\), weightUnit, to\)/.test(body),
    "the typed weights are not converted when the unit changes");
  assert.ok(/converted == null \? v : String\(converted\)/.test(body),
    "a half-typed number is blanked out instead of being left alone");
  assert.ok(/unit_pref: to/.test(body), "the choice is never stored, so it resets on reload");
  assert.ok(/if \(to === weightUnit\) return;/.test(body),
    "pressing the unit already selected still writes to the database");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
