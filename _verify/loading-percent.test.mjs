// The percentage on long waits (program builds and imports). It is read from
// the program text as the AI streams it, so it must climb steadily, never go
// backwards, never claim 100% before the save, and land near the right number
// for a given day of the program.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  "programBuildProgress", "countPastedDays",
  { name: "EXERCISES_PER_DAY_GUESS", kind: "const" },
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// A program shaped like the generator's output: 4 days, 9 exercises each.
const exercise = (i) => ({ phase: "compound", name: `Move ${i}`, sets: 3, reps: "8", rpe: 7, rest: "90s", groupId: null, groupKind: null });
const program = {
  programName: "Fight Camp Strength",
  weeks: 6,
  rationale: "Built around three striking sessions a week, so lifting sits on the other days and stays short.",
  days: [1, 2, 3, 4].map(d => ({ name: `Day ${d}`, exercises: Array.from({ length: 9 }, (_, i) => exercise(i)) })),
};
const full = JSON.stringify(program, null, 2);

test("climbs from near zero to 99% as the program streams in, never backwards", () => {
  let prev = -1;
  for (let n = 0; n <= full.length; n += 37) {
    const f = H.programBuildProgress(full.slice(0, n), 4);
    assert.ok(f >= prev, `went backwards at ${n}: ${prev} -> ${f}`);
    prev = f;
  }
  assert.ok(H.programBuildProgress("", 4) < 0.01);
  const end = H.programBuildProgress(full, 4);
  assert.ok(end >= 0.9 && end <= 0.99, `finished at ${end}`);
});

test("never says 100% on its own: the save is the last step", () => {
  assert.ok(H.programBuildProgress(full + full, 4) <= 0.99);
});

test("halfway through the days reads roughly halfway", () => {
  const cut = full.indexOf('"exercises"', full.indexOf('"Day 3"'));
  const f = H.programBuildProgress(full.slice(0, cut), 4);
  assert.ok(f > 0.4 && f < 0.6, `day 3 starting read ${f}`);
});

test("a program with more days than expected still stops below 100%", () => {
  assert.ok(H.programBuildProgress(full, 2) <= 0.99);
});

test("pasted programs: counts day headers, four when there are none", () => {
  assert.equal(H.countPastedDays("Day 1 Upper\nBench 4x6\nDay 2 Lower\nSquat 5x5\nDay 3\nPull ups"), 3);
  assert.equal(H.countPastedDays("Monday: push\nbench\nWednesday: pull\nrows"), 2);
  assert.equal(H.countPastedDays("bench 4x6\nsquat 5x5"), 4);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) {
    console.error(`✖ ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
