// Reading the generator's reply.
//
// This is the last step between a good program and an error message, and it
// has now failed in the wild twice: once because a truncated reply reached the
// browser's own parser, and once because the app REWROTE a valid reply into an
// invalid one. Typographic quotes are legal inside a JSON string, and the
// generator writes them - "your “big three” lifts" - so normalising them to
// straight quotes splits one string into three and the browser says
// "Unterminated string" about a payload that was never broken.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, ["parseAIJson", "repairTruncatedJson"]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const program = (over = {}) => ({
  programName: "MMA Foundations",
  weeks: 8,
  rationale: "Two paragraphs.\n\nSecond one.",
  days: [{ name: "Day 1", why: "Heavy day.", exercises: [{ name: "Back Squat", phase: "compound", sets: 4, reps: "4", rpe: 8, rest: "3min" }] }],
  ...over,
});

// ---------- the regression that broke a real generation ----------

test("prose containing curly quotes parses, and keeps them", () => {
  const payload = program({ rationale: "Builds your \u201Cbig three\u201D lifts first." });
  const out = H.parseAIJson(JSON.stringify(payload));
  assert.equal(out.rationale, "Builds your \u201Cbig three\u201D lifts first.");
});

test("curly quotes in a day's why don't break the program either", () => {
  const payload = program({ days: [{ name: "Day 1", why: "Your \u201Cheavy\u201D day.", exercises: [] }] });
  assert.equal(H.parseAIJson(JSON.stringify(payload)).days[0].why, "Your \u201Cheavy\u201D day.");
});

test("curly apostrophes survive too", () => {
  const payload = program({ rationale: "Here\u2019s the plan." });
  assert.equal(H.parseAIJson(JSON.stringify(payload)).rationale, "Here\u2019s the plan.");
});

// ---------- everything it already had to cope with ----------

test("markdown fences are stripped", () => {
  const out = H.parseAIJson("```json\n" + JSON.stringify(program()) + "\n```");
  assert.equal(out.programName, "MMA Foundations");
});

test("a preamble before the JSON is ignored", () => {
  const out = H.parseAIJson("Here is your program:\n\n" + JSON.stringify(program()));
  assert.equal(out.weeks, 8);
});

test("trailing commas are tolerated", () => {
  assert.equal(H.parseAIJson('{"programName":"X","weeks":8,}').weeks, 8);
});

test("a curly quote used as a DELIMITER still parses, via the fallback", () => {
  assert.equal(H.parseAIJson('{\u201CprogramName\u201D:\u201CX\u201D,"weeks":8}').weeks, 8);
});

// ---------- truncation ----------

test("a reply cut off mid-exercise keeps the days that finished", () => {
  const full = JSON.stringify(program());
  const cut = full.slice(0, full.indexOf('"rest"'));
  const out = H.parseAIJson(cut);
  assert.equal(out.programName, "MMA Foundations");
});

test("a reply cut off mid-sentence is still readable", () => {
  const full = JSON.stringify(program({ rationale: "A long explanation that gets chopped" }));
  const cut = full.slice(0, full.indexOf("chopped"));
  const out = H.parseAIJson(cut);
  assert.equal(out.programName, "MMA Foundations");
});

test("an unreadable reply says what to do, not what a parser thinks", () => {
  assert.throws(() => H.parseAIJson("{{{ not json at all"), (err) => {
    assert.ok(/Try Again/i.test(err.message), `unhelpful message: ${err.message}`);
    assert.ok(!/JSON|token|position|Unterminated/i.test(err.message), `leaks parser jargon: ${err.message}`);
    return true;
  });
});

test("an empty reply is reported as empty", () => {
  assert.throws(() => H.parseAIJson(""), /No response content/);
});

for (const [name, fn] of tests) {
  try { fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
