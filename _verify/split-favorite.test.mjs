// "What's your favorite way to train?" (Isaiah, 9 Nov): full body, upper /
// lower, push / pull / legs, or "not sure, you decide". Whatever they pick is
// what they get.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "SPLIT_STYLES", kind: "const" }, { name: "SPLIT_AUTO", kind: "const" }, { name: "SPLIT_CHOICES", kind: "const" },
  { name: "DEFAULT_SPLIT", kind: "const" }, "deriveSplit", "splitStyleOf", "splitDayTypes", "splitPromptText",
]);
let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);
const days = (n) => ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].slice(0, n);

test("four choices: the three splits and 'you decide'", () => {
  assert.deepEqual(H.SPLIT_CHOICES.map(c => c.key), ["full_body", "upper_lower", "push_pull_legs", "auto"]);
  assert.equal(H.SPLIT_CHOICES[3].label, "Not sure, you decide");
});
test("a split they picked is the split they get, whatever the days", () => {
  for (const k of ["full_body", "upper_lower", "push_pull_legs"]) for (const n of [2, 3, 5, 6]) {
    assert.equal(H.splitStyleOf({ splitStyle: k, trainingDays: days(n) }), k, `${k} on ${n} days`);
  }
});
test("'you decide' follows the days, and changes when the days change", () => {
  assert.equal(H.splitStyleOf({ splitStyle: "auto", trainingDays: days(3) }), "full_body");
  assert.equal(H.splitStyleOf({ splitStyle: "auto", trainingDays: days(5) }), "upper_lower");
  assert.equal(H.splitStyleOf({ splitStyle: "auto", trainingDays: days(6) }), "push_pull_legs");
});
test("the AI is told each day's type, in order", () => {
  assert.deepEqual(H.splitDayTypes("push_pull_legs", 4), ["Push", "Pull", "Legs", "Push"]);
  assert.deepEqual(H.splitDayTypes("upper_lower", 3), ["Upper", "Lower", "Upper"]);
  const ppl = H.splitPromptText({ splitStyle: "push_pull_legs", trainingDays: days(3) });
  assert.match(ppl, /THE ATHLETE CHOSE PUSH \/ PULL \/ LEGS/);
  assert.match(ppl, /Day 1: Push\nDay 2: Pull\nDay 3: Legs/);
  assert.match(ppl, /A different split is a FAILED response/);
  assert.match(ppl, /once a week/, "few days for the split, and no word on volume");
  assert.doesNotMatch(H.splitPromptText({ splitStyle: "push_pull_legs", trainingDays: days(6) }), /once a week/);
  assert.match(H.splitPromptText({ splitStyle: "upper_lower", trainingDays: days(4) }), /Day 4: Lower/);
});
test("the prompt uses it for every non-full-body week; full body keeps its slot plan", () => {
  assert.ok(/\$\{splitStyleOf\(intake\) !== "full_body" \? splitPromptText\(intake\) : `HOW TO SPLIT THE WEEK/.test(src));
});
test("asked in signup, in those words, from the real list", () => {
  assert.ok(/\{ step: "🧩 Session Style", label: "Your favorite way to train" \}/.test(src));
  assert.ok(/Pick how you like to train\. Your program is built this way\./.test(src));
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
