// A coach's own training program is generated from the same prompt as an
// athlete's, so the coach intake has to collect everything that prompt reads.
// Miss one question and nothing breaks loudly - the coach just quietly gets a
// generic program, with no equipment filter or no injury handling, and no
// indication why. So this checks the coverage directly against the source
// rather than trusting the two lists to stay in step by hand.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "src", "App.jsx"), "utf8");

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const arrayLiteral = (name) => {
  const at = src.indexOf(`const ${name} = [`);
  assert.notEqual(at, -1, `${name} not found`);
  const body = src.slice(at, src.indexOf("];", at));
  return [...body.matchAll(/"([^"]+)"/g)].map(m => m[1]);
};

const TRAINING = arrayLiteral("TRAINING_INTAKE_STEPS");
const ATHLETE = (() => {
  const at = src.indexOf("const athleteSteps = [");
  const body = src.slice(at, src.indexOf("];", at));
  return [...body.matchAll(/"([^"]+)"/g)].map(m => m[1]);
})();

// Everything buildAIPrompt actually reads off the intake.
const promptKeys = (() => {
  const at = src.indexOf("function buildAIPrompt");
  const body = src.slice(at, src.indexOf("\n}", at));
  const dotted = [...body.matchAll(/intake\.([a-zA-Z][a-zA-Z0-9]*)/g)].map(m => m[1]);
  const bracket = [...body.matchAll(/intake\["([^"]+)"\]/g)].map(m => m[1]);
  return [...new Set([...dotted, ...bracket])].filter(k => k && k !== "length");
})();

// Where each answer is captured: the nearest enclosing `case "<step>":` above
// the set() call that writes it.
const stepThatSets = (key) => {
  const steps = new Set();
  const patterns = [
    new RegExp(`set\\("${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"`, "g"),
    new RegExp(`setData\\(d => \\(\\{ \\.\\.\\.d, ${key}:`, "g"),
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      const before = src.slice(0, m.index);
      const lastCase = before.lastIndexOf('case "');
      if (lastCase === -1) continue;
      const label = src.slice(lastCase + 6, src.indexOf('"', lastCase + 6));
      steps.add(label);
    }
  }
  return steps;
};

// ---------- the two question sets can't drift apart ----------

test("every coach training step is a real athlete signup step", () => {
  const strays = TRAINING.filter(s => !ATHLETE.includes(s));
  assert.deepEqual(strays, [], `steps that no athlete is ever asked: ${strays.join(", ")}`);
});

test("the coach intake skips exactly the photo and the account", () => {
  // A coach already has a name, a photo and a login, so their own training
  // questionnaire skips those and asks everything else the athlete is asked.
  // The name used to be its own step and is now part of the account screen,
  // which is why it is no longer listed here.
  // Sorted: this is about WHICH steps are skipped, not where they sit. The
  // signup order is pinned by its own test and is free to change without
  // dragging this one with it.
  const missing = ATHLETE.filter(s => !TRAINING.includes(s)).sort();
  assert.deepEqual(missing, ["🔐 Create Account", "📸 Profile Photo"].sort(),
    "the coach's own intake must skip only the things a coach already has");
});

// ---------- and it collects everything the generator reads ----------

test("buildAIPrompt reads a non-trivial set of intake fields", () => {
  assert.ok(promptKeys.length >= 10, `only found ${promptKeys.length}: ${promptKeys.join(", ")}`);
});

test("every field the prompt reads is asked for in the coach intake", () => {
  // Height and weight carry unit state set outside a case block; they're
  // covered by their own steps, which are in the list.
  const byOwnStep = { heightCm: "📏 Height", weightLb: "⚖️ Weight" };
  const uncovered = [];

  for (const key of promptKeys) {
    if (byOwnStep[key]) {
      if (!TRAINING.includes(byOwnStep[key])) uncovered.push(`${key} (needs ${byOwnStep[key]})`);
      continue;
    }
    const steps = stepThatSets(key);
    if (!steps.size) continue;                       // derived, not asked directly
    if (![...steps].some(st => TRAINING.includes(st))) {
      uncovered.push(`${key} (asked only in ${[...steps].join(" / ")})`);
    }
  }
  assert.deepEqual(uncovered, [], `the coach would be asked nothing for: ${uncovered.join("; ")}`);
});

// ---------- the coach's own training stays theirs ----------

test("a coach's training answers are namespaced, not written over their settings", () => {
  assert.ok(src.includes("training: data"), "the intake must nest under intake.training");
  assert.ok(/const merged = \{ \.\.\.\(row\?\.intake \|\| \{\}\), training: data \}/.test(src),
    "saving must merge into the existing intake, not replace it");
});

test("a coach's own program is fetched by their own id", () => {
  assert.ok(src.includes("athlete_id.eq.${profile.id}"),
    "the coach program query must ask for programs owned by the coach themselves");
});

test("a coach training themselves has no coach above them", () => {
  const at = src.indexOf("const training = profile.intake?.training || null;");
  assert.notEqual(at, -1);
  const block = src.slice(at, at + 1200);
  assert.ok(/coachId: null/.test(block), "a coach must not be linked to themselves as an athlete");
  assert.ok(/selfGuided: true/.test(block), "a coach coaches their own training");
});

for (const [name, fn] of tests) {
  try { fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
