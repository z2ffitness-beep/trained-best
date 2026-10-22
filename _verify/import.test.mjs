// Importing a coach's existing program.
//
// The whole value of this feature is that it does NOT program. A coach who
// wrote 4x6 @ RPE 8 must get 4x6 @ RPE 8 - if the numbers drift even slightly
// the feature is worse than useless, because the coach will trust it and the
// athlete will train the wrong thing. So the prompt is checked for the
// instructions that hold that line, and the structure it produces is checked
// against what the app actually stores.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  "buildImportPrompt", "buildSessionBlocks", "blockForPhase", "estimateExerciseSeconds", "parseRestSeconds",
  { name: "SESSION_BLOCKS", kind: "const" },
  { name: "SET_SECONDS", kind: "const" },
  { name: "PHASES", kind: "const" },
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const doc = `Upper A
Barbell Bench Press 4x6 @ RPE 8, rest 2min
A1 Incline DB Press 3x10
A2 Chest Supported Row 3x10
Face Pulls 3x15`;

const prompt = H.buildImportPrompt(doc, { name: "Jess Taylor" });

// ---------- the prompt has to forbid improvisation ----------

test("the document is quoted into the prompt verbatim", () => {
  assert.ok(prompt.includes("Barbell Bench Press 4x6 @ RPE 8, rest 2min"));
  assert.ok(prompt.includes("A1 Incline DB Press 3x10"));
});

test("it is told to transcribe, not to program", () => {
  assert.match(prompt, /TRANSCRIBE, DO NOT PROGRAM/);
  assert.match(prompt, /not improving this program/i);
});

test("numbers are explicitly protected from being tidied", () => {
  assert.match(prompt, /copied EXACTLY as written/);
  assert.match(prompt, /Never round, never normalise/i);
});

test("it may not invent work the document doesn't contain", () => {
  assert.match(prompt, /Do not add warm-ups, cool-downs/i);
  assert.match(prompt, /no warm-up imports with no warm-up/i);
});

test("and may not silently drop any either", () => {
  assert.match(prompt, /Do not drop anything/i);
});

test("substituting a different movement is ruled out", () => {
  assert.match(prompt, /Never substitute a different movement/i);
});

test("a weekly split is not multiplied out into every week", () => {
  assert.match(prompt, /Do not multiply it out by the number of weeks/i);
});

test("the athlete's name reaches the prompt", () => {
  assert.ok(prompt.includes("Jess Taylor"));
  assert.ok(!H.buildImportPrompt(doc, null).includes("undefined"));
});

// ---------- every phase the app knows must be offered ----------

test("the prompt lists exactly the phases the app stores", () => {
  for (const ph of H.PHASES) {
    assert.ok(prompt.includes(ph.key), `phase ${ph.key} is never offered to the importer`);
  }
});

test("the JSON shape it asks for is the shape the app reads", () => {
  for (const field of ['"programName"', '"weeks"', '"rationale"', '"days"', '"exercises"', '"sets"', '"reps"', '"rpe"', '"rest"', '"groupId"']) {
    assert.ok(prompt.includes(field), `${field} missing from the requested shape`);
  }
});

// ---------- what comes back has to survive into sections ----------

test("an imported day groups into sections like any other", () => {
  const imported = [
    { name: "Barbell Bench Press", phase: "compound", sets: 4, reps: "6", rpe: 8, rest: "2min" },
    { name: "Incline DB Press", phase: "hypertrophy", sets: 3, reps: "10", rpe: 7, rest: "60s" },
    { name: "Chest Supported Row", phase: "hypertrophy", sets: 3, reps: "10", rpe: 7, rest: "60s" },
    { name: "Face Pulls", phase: "hypertrophy", sets: 3, reps: "15", rpe: 7, rest: "60s" },
  ];
  assert.deepEqual(
    H.buildSessionBlocks(imported).map(b => [b.label, b.items.length]),
    [["Primary Movements", 1], ["Secondary Movements", 3]],
  );
});

test("a program with no warm-up imports with no warm-up section", () => {
  const imported = [{ name: "Back Squat", phase: "compound", sets: 5, reps: "5", rpe: 8, rest: "3min" }];
  assert.ok(!H.buildSessionBlocks(imported).some(b => b.label === "Warm-Up"));
});

test("the coach's own numbers pass through the section grouping untouched", () => {
  const imported = [{ name: "Barbell Bench Press", phase: "compound", sets: 4, reps: "6", rpe: 8, rest: "2min" }];
  const [item] = H.buildSessionBlocks(imported)[0].items;
  assert.equal(item.sets, 4);
  assert.equal(item.reps, "6");
  assert.equal(item.rpe, 8);
  assert.equal(item.rest, "2min");
});

// ---------- an empty program must never reach the database ----------
//
// Found on the coach's own account: a program row with zero days, pointed at by
// active_program_id, so switching to training mode showed a blank screen. It
// came from a generation that returned nothing and was saved regardless.

const { programHasContent } = await load(APP, ["programHasContent"]);
const src = readSource(APP);

test("a program with no days at all is not a program", () => {
  assert.equal(programHasContent([]), false);
  assert.equal(programHasContent(null), false);
  assert.equal(programHasContent(undefined), false);
});

test("days that are all empty are not a program either", () => {
  assert.equal(programHasContent([{ name: "Day 1", exercises: [] }]), false);
  assert.equal(programHasContent([{ name: "Day 1" }, { name: "Day 2" }]), false);
});

test("one real day is enough to save", () => {
  assert.equal(programHasContent([{ name: "Day 1", exercises: [{ name: "Back Squat" }] }]), true);
  assert.equal(programHasContent([{ exercises: [] }, { exercises: [{ name: "KB Swings" }] }]), true);
});

test("both save paths refuse rather than write a blank", () => {
  const assign = src.slice(src.indexOf("async function assignTemplateToAthlete"));
  const assignBody = assign.slice(0, assign.indexOf("\n}\n"));
  // The guard now has an opt-out, for the one case where an empty program is
  // the point: "start from blank". It stays ON for an import or a generation,
  // which is what this test is about.
  assert.ok(/if \(!allowEmpty && !programHasContent\(scheduled\)\)/.test(assignBody),
    "a coach could still assign an empty import");
  assert.ok(/allowEmpty = false/.test(assignBody),
    "and it must default to on, or a failed import saves nothing in silence");
  const create = src.slice(src.indexOf("async function createProgramRow"));
  const body = create.slice(0, create.indexOf("\n}\n"));
  assert.ok(/if \(!programHasContent\(rawDays\)\)/.test(body), "the generator could still save a blank");
  assert.ok(body.indexOf("programHasContent") < body.indexOf('.insert('),
    "the check has to run BEFORE the insert, or the row exists and is already active");
});

// ---------- adding a movement that is not in the library yet ----------
//
// "I'm looking at my warm-up and there are no Scorpions in there." No library
// covers every coach's vocabulary, and leaving the session to go and add one
// is how a movement quietly gets dropped instead.

const picker = src.slice(src.indexOf("function ExercisePickerModal"),
                         src.indexOf("function CoachPrograms"));

test("the create option only appears when nothing already matches", () => {
  assert.ok(/const existsAlready = typed/.test(picker));
  assert.ok(/exercises\.some\(e => normalizeExerciseName\(e\.name\) === normalizeExerciseName\(typed\)\)/.test(picker),
    "the check must compare normalised names, or 'Dead Bugs' and 'dead bugs' both get created");
  assert.ok(/const canCreate = !!typed && !existsAlready/.test(picker));
});

test("it searches the whole library, not the filtered view", () => {
  const line = picker.slice(picker.indexOf("const existsAlready"), picker.indexOf("const canCreate"));
  assert.ok(/exercises\.some/.test(line) && !/list\.some/.test(line),
    "checking only the filtered list would offer to create a movement that exists under another section");
});

test("a new movement lands in the open section, not a guess", () => {
  assert.ok(/phaseFilter !== "all" \? phaseFilter : \(defaultPhase \|\| PHASES\[0\]\.key\)/.test(picker),
    "added from inside the warm-up section it should be a warm-up");
});

test("creating also drops it straight into the session", () => {
  const fn = picker.slice(picker.indexOf("const createAndPick"), picker.indexOf("return ("));
  assert.ok(fn.indexOf("onCreated(res.exercise)") < fn.indexOf("onPick(res.exercise)"),
    "the library has to know about it before the day references it");
  assert.ok(/onClose\(\)/.test(fn), "the picker should close once it has been added");
});

test("a failed save does not pretend to have worked", () => {
  const fn = picker.slice(picker.indexOf("const createAndPick"), picker.indexOf("return ("));
  assert.ok(/if \(!res\.ok\) \{ setCreateError\(res\.message\); return; \}/.test(fn));
  assert.ok(fn.indexOf("if (!res.ok)") < fn.indexOf("onCreated("),
    "an exercise that never saved must not be added to the day");
});

test("it can't be double-tapped into two rows", () => {
  assert.ok(/if \(creating \|\| !canCreate\) return;/.test(picker));
});

test("every picker in the app can create, not just one", () => {
  const n = (src.match(/<ExercisePickerModal/g) || []).length;
  const wired = (src.match(/onCreated=\{\(ex\) => setState/g) || []).length;
  assert.equal(wired, n, `${n} pickers but only ${wired} can create - one of them is a dead end`);
});

test("the creator is the only way an exercise row is written", () => {
  const inserts = (src.match(/from\("exercises"\)\s*\.insert/g) || []).length;
  assert.equal(inserts, 1, "two insert paths will drift on duplicate handling and ownership");
});

test("a duplicate is explained, not reported as a failure", () => {
  const fn = src.slice(src.indexOf("async function createCustomExercise"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(/error\.code === "23505"/.test(body));
  assert.ok(/already in your library/.test(body));
});

test("a blank name and a signed-out user are both refused before the insert", () => {
  const fn = src.slice(src.indexOf("async function createCustomExercise"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(body.indexOf("if (!clean)") < body.indexOf(".insert("));
  assert.ok(body.indexOf("if (!ownerId)") < body.indexOf(".insert("));
});

for (const [name, fn] of tests) {
  try { fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
