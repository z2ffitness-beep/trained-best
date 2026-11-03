// Regenerate with changes (Isaiah, 3 Nov). Whoever builds a program, a coach
// for a client or someone for themselves, can type or say what to change
// before building again. Every way in uses the one AIProgramGenerator.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, ["summarizeProgramForChanges", "regenerationRequest"]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

const prev = { programName: "Strength Block", weeks: 8, days: [
  { name: "Day 1 — Lower", exercises: [{ name: "Back Squat", sets: 4, reps: "5" }, { name: "Nordic Curl", sets: 3, reps: "6" }] },
  { name: "Day 2 — Upper", exercises: [{ name: "Bench Press", sets: 4, reps: "6" }] }] };

test("the request and the last version both reach the model", () => {
  const out = H.regenerationRequest(prev, "  swap back squats for trap bar deadlifts ");
  assert.match(out, /swap back squats for trap bar deadlifts/);
  assert.match(out, /Back Squat 4x5/, "the model is not shown what it built last time");
  assert.match(out, /Day 2 — Upper: Bench Press 4x6/);
  assert.match(out, /Keep everything they did not ask to change/);
});

test("a request never overrides an injury", () => {
  assert.match(H.regenerationRequest(prev, "more jumping"), /never overrides an injury, pain or medical limit/);
});

test("nothing is added when the box is empty, or there is no earlier version", () => {
  assert.equal(H.regenerationRequest(prev, "   "), "");
  assert.equal(H.regenerationRequest(null, "more conditioning"), "");
});

test("a very long request or program is capped", () => {
  const big = { programName: "X", days: Array.from({ length: 7 }, (_, i) => ({ name: `Day ${i}`, exercises: Array.from({ length: 40 }, (_, j) => ({ name: `Exercise number ${j}`, sets: 3, reps: "10" })) })) };
  assert.ok(H.summarizeProgramForChanges(big).length <= 4000);
  assert.ok(H.regenerationRequest(prev, "x".repeat(5000)).length < 2000 + 4000);
});

test("the generator has the box, the mic, and sends the request", () => {
  const at = src.indexOf("function AIProgramGenerator");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/Want anything changed\?/.test(body), "no change box");
  assert.ok(/useSpeechToText\(changes, setChanges\)/.test(body), "no way to say it");
  assert.ok(/buildAIPrompt\(intake\) \+ regenerationRequest\(previous, asked\)/.test(body), "the request never reaches the model");
  assert.ok(/onClick=\{regenerate\}/.test(body), "Regenerate ignores the box");
  assert.ok(/Rebuild with changes/.test(body));
});

test("every way of building a program uses that generator", () => {
  const uses = src.match(/<AIProgramGenerator\b/g) || [];
  assert.ok(uses.length >= 4, `only ${uses.length} places use the generator`);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
