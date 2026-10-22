// Last session's total volume, and two things that were on screen but unseeable.
//
// The app already told you what you did set by set. What it never told you was
// the total, which is the number that actually moves across a block: set by set
// tells you what to load, tonnage tells you whether the session was more work
// than last time.
//
// The trap is that reps are OPTIONAL when logging, deliberately - somebody who
// only records weight loses nothing. So any total can only cover the sets that
// recorded both weight and reps, and a total that quietly leaves sets out looks
// exactly like a drop in work when it is really a gap in logging. That is what
// most of this file is about.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, ["setsVolume", "formatVolume"]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

const S = (...pairs) => pairs.map(([weight, reps], i) => ({ set: i + 1, weight, reps }));

// ---------- the arithmetic ----------

test("volume is weight times reps, summed", () => {
  const v = H.setsVolume(S([100, 10], [100, 10], [100, 5]));
  assert.equal(v.volume, 2500);
  assert.equal(v.counted, 3);
  assert.equal(v.total, 3);
});

test("a set with no reps cannot contribute, and says so", () => {
  const v = H.setsVolume(S([100, 10], [100, null], [100, 10]));
  assert.equal(v.volume, 2000, "the repless set must not be guessed at");
  assert.equal(v.counted, 2);
  assert.equal(v.total, 3, "it still counts toward how many sets there were");
});

test("a set with no weight is not volume either", () => {
  const v = H.setsVolume(S([null, 10], [100, 10]));
  assert.equal(v.volume, 1000);
  assert.equal(v.counted, 1);
});

test("zero and negative numbers are ignored, not added", () => {
  assert.equal(H.setsVolume(S([0, 10], [100, 10])).volume, 1000);
  assert.equal(H.setsVolume(S([-100, 10], [100, 10])).volume, 1000);
  assert.equal(H.setsVolume(S([100, 0], [100, 10])).volume, 1000);
});

test("junk in the log does not produce NaN on screen", () => {
  // A number input can hand back "" or a stray string. NaN would render as
  // "NaN lb total volume" next to someone's training.
  const v = H.setsVolume([{ set: 1, weight: "", reps: "" }, { set: 2, weight: "abc", reps: "10" }, { set: 3, weight: 100, reps: 10 }]);
  assert.equal(v.volume, 1000);
  assert.ok(Number.isFinite(v.volume));
});

test("string numbers still count, because that is what the inputs give back", () => {
  const v = H.setsVolume([{ set: 1, weight: "185", reps: "8" }]);
  assert.equal(v.volume, 1480);
});

test("nothing countable returns null rather than a zero", () => {
  // A zero total would read as "you did no work", which is a different claim
  // from "nothing was recorded".
  assert.equal(H.setsVolume([]), null);
  assert.equal(H.setsVolume(null), null);
  assert.equal(H.setsVolume(S([100, null], [90, null])), null);
});

test("nulls in the list are survived", () => {
  const v = H.setsVolume([null, { set: 1, weight: 100, reps: 10 }, undefined]);
  assert.equal(v.volume, 1000);
});

// ---------- the wording ----------

test("it reads as a sentence, with a thousands separator", () => {
  assert.equal(H.formatVolume(H.setsVolume(S([185, 8], [185, 8], [185, 8], [185, 8]), "lb")),
    "4 sets · 5,920 lb total volume");
});

test("one set is not 1 sets", () => {
  assert.equal(H.formatVolume(H.setsVolume(S([100, 10]), "lb")), "1 set · 1,000 lb total volume");
});

test("the unit follows the athlete, not the code", () => {
  assert.ok(H.formatVolume(H.setsVolume(S([100, 10]), "kg")).includes("kg"));
  assert.ok(!H.formatVolume(H.setsVolume(S([100, 10]), "kg")).includes("lb"));
});

test("a partial total admits it is partial", () => {
  const out = H.formatVolume(H.setsVolume(S([100, 10], [100, null], [100, null]), "lb"));
  assert.match(out, /reps were logged on 1 of 3/,
    "a silent partial total looks like a drop in work that never happened");
});

test("a complete total carries no caveat", () => {
  const out = H.formatVolume(H.setsVolume(S([100, 10], [100, 10]), "lb"));
  assert.ok(!/reps were logged on/.test(out), `unnecessary caveat: ${out}`);
});

test("nothing to say renders nothing", () => {
  assert.equal(H.formatVolume(null), null);
});

// ---------- it is actually on screen ----------

test("the last-time panel shows the total", () => {
  assert.ok(/formatVolume\(setsVolume\(/.test(src),
    "the helper exists but the panel never calls it");
});

test("the total uses the athlete's own unit", () => {
  // Two separate mistakes, and the panel has to avoid both. Passing no unit
  // prints pounds to someone working in kilos. Passing the unit but handing
  // over the raw stored sets is worse: history can hold both units for the
  // same lift, so a 100 kg set and a 100 lb set get added together as 200 of
  // whatever the label happens to say.
  assert.ok(!/setsVolume\(lastSets\.sets\)/.test(src),
    "called without weightUnit it would print lb to someone working in kg");
  assert.ok(!/setsVolume\(lastSets\.sets,/.test(src),
    "the raw stored sets are summed without converting them to the screen unit first");
  assert.ok(/setsVolume\(lastSets\.sets\.map\(entry => setInUnit\(entry, weightUnit\)\), weightUnit\)/.test(src),
    "the total is not computed from sets converted into the unit on screen");
});

test("the set-by-set line is converted too, not just the total", () => {
  assert.ok(/formatSetHistory\(lastSets\.sets\.map\(entry => setInUnit\(entry, weightUnit\)\)\)/.test(src),
    "last time's individual sets still print in whichever unit they were typed in");
});

// ---------- the two things that were invisible ----------

test("the workout column clears its own fixed bar", () => {
  // Back / Next is position:fixed and floats over the end of the column, so
  // the column has to leave room for it. This used to be a hard-coded 184px
  // guessed from one device — it covered "Send this to my coach", was tuned
  // until that fitted, and then covered "Swap This Exercise" instead. The
  // clearance is now measured from the bar itself.
  assert.ok(/paddingBottom: workoutBarPad/.test(src),
    "the column is back to a guessed padding instead of the measured one");
  assert.ok(/const \[workoutBarRef, workoutBarPad\] = useBarClearance\(\)/.test(src),
    "nothing produces the measurement");
});

test("the bar the column measures is the bar that covers it", () => {
  // The hook can only measure an element it is attached to. Without the ref on
  // the fixed bar it silently keeps its fallback forever, which is exactly the
  // guess this replaced.
  const at = src.indexOf("...bottomBarBox(wideWorkout),");
  assert.ok(at > 0, "could not find the workout bottom bar");
  const opening = src.lastIndexOf("<div", at);
  assert.ok(/ref=\{workoutBarRef\}/.test(src.slice(opening, at)),
    "the fixed bar is not the element being measured");
});

test("the phone case clears the navigation too", () => {
  // On a phone the bar floats ABOVE the nav and the home indicator, so the
  // bar's own height is not the whole obstruction. The measurement has to add
  // whatever sits below it.
  const at = src.indexOf("function useBarClearance");
  assert.ok(at > 0, "the measuring hook is gone");
  const fn = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/window\.innerHeight - r\.bottom/.test(fn),
    "only the bar's height is counted, so the nav and home indicator still cover the column");
  assert.ok(/r\.height/.test(fn), "the bar's own height is not counted");
});

test("the clearance survives rotation and a text-size change", () => {
  const at = src.indexOf("function useBarClearance");
  const fn = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/ResizeObserver/.test(fn), "a bar that grows mid-session goes unnoticed");
  assert.ok(/orientationchange/.test(fn), "turning the phone sideways leaves the old clearance");
});

test("a zero-height measurement never removes the clearance", () => {
  // Mid-layout the bar can measure 0. Writing that through would briefly put
  // the controls back under the bar, which is the whole bug.
  const at = src.indexOf("function useBarClearance");
  const fn = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/if \(next > gap\) setPad\(next\)/.test(fn),
    "an unlaid-out bar can zero the padding");
});

test("swap and send-to-coach sit on one row", () => {
  // Two full-width buttons at the end of the column is what pushed the second
  // one under the bar in the first place.
  // Anchored on the handler, not the label: the label also appears in a
  // comment explaining why this row exists, and indexOf would find that first.
  const at = src.indexOf("onClick={() => setSwapItem(x)}");
  assert.ok(at > 0, "the swap control is gone");
  const around = src.slice(Math.max(0, at - 900), at + 900);
  assert.ok(/flex flex-wrap gap-2/.test(around),
    "the two controls are stacked again rather than sharing a row");
  assert.ok(/Send this to my coach/.test(around),
    "send-to-coach is no longer beside swap");
});

test("the selected weekday is a ring, not a filled block", () => {
  const at = src.indexOf("function DayWeekdayPicker");
  const fn = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(!/background: isActive \? activeColor :/.test(fn),
    "the solid fill is back");
  assert.ok(/boxShadow: isActive \? `inset 0 0 0 1px \$\{activeColor\}`/.test(fn),
    "selection has to stay visible once the fill is gone");
  assert.ok(!/color: isActive \? "#fff"/.test(fn),
    "white text only works on a solid fill");
});

test("the ring does not move the squares when selection changes", () => {
  const at = src.indexOf("function DayWeekdayPicker");
  const fn = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/border: `1px solid \$\{isActive \?/.test(fn),
    "a thicker border on the selected square would shift the whole row by a pixel");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
