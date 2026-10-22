// Three changes, all about not making somebody work to use the thing.
//
//   * injury detail now opens under the body part it belongs to. It used to
//     collect in a stack below the whole list, so after tapping "Knee" you
//     scrolled past nine other body parts to say what was wrong with it, and
//     with two areas picked nothing tied a card to its area.
//   * "Bodyweight only" is just "Bodyweight". It sits in a list you tick
//     several of, where "only" contradicts the instruction above it.
//   * the App / Web / Auto switch is gone. The layout is read off the device.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, ["storedView", { name: "EQUIPMENT_WORDS", kind: "const" }]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

const injuryCase = (() => {
  const a = src.indexOf('case "\u{1FA79} Injuries": {');
  return src.slice(a, src.indexOf("\n    case \"", a + 10));
})();

// ---------- injury detail opens in place ----------

test("the card is rendered from inside the area list", () => {
  assert.ok(/\{isActive && opt !== "None currently" && injuryCard\(opt\)\}/.test(injuryCase),
    "the detail has to be emitted beside its own button, not after the loop");
});

test("nothing collects below the list any more", () => {
  assert.ok(!/\{picked\.map\(area => \{/.test(injuryCase),
    "the old stack below the grid is still there, so detail renders twice");
});

test("each row is keyed once, on the fragment", () => {
  // Key on the fragment and NOT on the button: two keyed siblings inside one
  // fragment is how React starts reusing the wrong row when the list changes.
  assert.ok(/<React\.Fragment key=\{opt\}>/.test(injuryCase), "the fragment carries the key");
  assert.ok(!/<button key=\{opt\}/.test(injuryCase), "the button must not also be keyed");
});

test('"None currently" never grows a detail card', () => {
  assert.ok(/opt !== "None currently" && injuryCard/.test(injuryCase),
    "asking what kind of problem your absence of injury is");
});

test("the card is still only built for areas that are selected", () => {
  assert.ok(/\{isActive && opt !== "None currently"/.test(injuryCase));
});

test("injuryCard takes the area it is drawing", () => {
  assert.ok(/const injuryCard = \(area\) => \{/.test(injuryCase),
    "a card that reads anything other than its own argument renders the wrong injury");
});

test("the card still carries the side question", () => {
  const at = injuryCase.indexOf("const injuryCard");
  const card = injuryCase.slice(at, injuryCase.indexOf("\n      };", at));
  assert.ok(/injuryNeedsSide\(area\)/.test(card), "the side control was lost in the move");
  assert.ok(/INJURY_KINDS\.map/.test(card), "the kind buttons were lost in the move");
  assert.ok(/INJURY_STATUS\.map/.test(card), "the status buttons were lost in the move");
  assert.ok(/setInjuryDetail\(d, area,/.test(card), "the card must write against its own area");
});

// ---------- bodyweight ----------

test('the option reads "Bodyweight"', () => {
  assert.ok(/"Cardio equipment \(bike, rower, etc\.\)", "Bodyweight"/.test(src));
  assert.ok(!/"Bodyweight only"/.test(src), '"only" contradicts a tick-everything list');
});

test("the generator still recognises it", () => {
  // The equipment string is matched by regex to decide what an exercise needs.
  // Renaming the option without checking this would quietly stop bodyweight
  // exercises being selectable for somebody who has nothing else.
  const rule = H.EQUIPMENT_WORDS.find(r => r.equipment === "bodyweight");
  assert.ok(rule, "no bodyweight rule at all");
  assert.ok(rule.re.test("bodyweight"), "the renamed option no longer matches");
  assert.ok(rule.re.test("Bodyweight".toLowerCase()));
});

// ---------- the layout is detected ----------

test("no stored view preference is read", () => {
  const fn = src.slice(src.indexOf("function storedView"), src.indexOf("\n}\n", src.indexOf("function storedView")));
  assert.ok(!/localStorage\.getItem\(VIEW_PREF_KEY\)/.test(fn),
    "a saved choice is how somebody ends up stuck in the wrong layout on a phone");
  assert.ok(/return "auto";\n\}?$|return "auto";/.test(fn), "it has to fall through to auto");
});

test("a link can still force a view, for support", () => {
  const fn = src.slice(src.indexOf("function storedView"), src.indexOf("\n}\n", src.indexOf("function storedView")));
  assert.ok(/forced === "app"/.test(fn) && /forced === "web"/.test(fn),
    "?view= is the only way left to reproduce what somebody else is seeing");
});

test("the floating switch is gone entirely", () => {
  assert.equal((src.match(/ViewSwitch/g) || []).length, 0,
    "a component left behind but never rendered is dead weight that still ships");
});

test("the phone still gets the app layout, whatever the width", () => {
  const fn = src.slice(src.indexOf("function isWideScreen"), src.indexOf("\n}\n", src.indexOf("function isWideScreen")));
  assert.ok(/if \(isNativeApp\(\)\) return false;/.test(fn),
    "the native build must never be given the desktop layout");
  assert.ok(/DESKTOP_MIN/.test(fn), "width is what decides it in a browser");
});

test("storedView answers auto with nothing in the address", () => {
  assert.equal(H.storedView(), "auto");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
