// The scope picker, and the block strip that gives it something to scope to.
//
// The dangerous part of this feature is not the picker, it is the possibility
// that a RESOLVED day — one week's flattened view of the program — reaches a
// save path. That would burn a single week's numbers into the stored template
// and destroy every other week, silently and permanently. It nearly shipped
// once already. The last test here walks every component that resolves a day
// and checks the resolved copy is only ever rendered.
import assert from "node:assert/strict";
import { readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);

const bodyOf = (fn) => {
  const at = src.indexOf(fn);
  assert.notEqual(at, -1, `${fn} not found`);
  return src.slice(at, src.indexOf("\nfunction ", at + 1));
};

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// ---------- the picker exists and is honest ----------

test("the picker offers every scope the engine implements", () => {
  const body = bodyOf("function EditScopeModal(");
  assert.ok(/EDIT_SCOPES\.map/.test(body), "it must render the real list, not a hardcoded copy");
  assert.ok(/DEFAULT_EDIT_SCOPE/.test(body), "and mark the usual answer");
});

test("it shows what each block currently holds", () => {
  // Otherwise "pick blocks" is a row of identical checkboxes and the coach is
  // guessing which one has the front squat in it.
  const body = bodyOf("function EditScopeModal(");
  assert.ok(/blockSummaryFor\(exercise, blocks\)/.test(body));
  assert.ok(/r\.skipped \? "not in this block" : r\.value/.test(body));
});

test("Apply is dead until at least one block is picked", () => {
  const body = bodyOf("function EditScopeModal(");
  assert.ok(/const ready = scope !== "blocks" \|\| picked\.length > 0;/.test(body));
  assert.ok(/disabled=\{!ready\}/.test(body));
});

test("reopening it for a different movement does not inherit the last answer", () => {
  const body = bodyOf("function EditScopeModal(");
  const eff = body.slice(body.indexOf("useEffect(("), body.indexOf("}, [open,"));
  assert.ok(/setScope\(DEFAULT_EDIT_SCOPE\)/.test(eff));
  assert.ok(/setPicked\(/.test(eff));
  assert.ok(/\}, \[open, week, exercise\?\.id\]\)/.test(body),
    "it must reset per movement, not only per open");
});

test("the every-week choice warns before it overwrites written blocks", () => {
  const body = bodyOf("function EditScopeModal(");
  assert.ok(/scope === "all" && \(/.test(body));
  assert.ok(/Sets, reps and loading are left alone/.test(body),
    "and say what it does NOT touch, since that is the fear");
});

// ---------- wiring on the athlete's own program ----------

test("a swap asks for scope before it writes", () => {
  const body = bodyOf("function AthleteProgram(");
  assert.ok(/setScopeTarget\(\{ \.\.\.swapTarget, newEx \}\)/.test(body),
    "the swap must hand off to the picker, not write straight away");
  assert.ok(/<EditScopeModal/.test(body));
});

test("the write goes through the tested engine, with the real blocks", () => {
  const body = bodyOf("function AthleteProgram(");
  assert.ok(/applyExerciseEdit\(x, patch, \{ \.\.\.scopeOpts, blocks: plan\.blocks, totalWeeks: plan\.weeks, nameFor:/.test(body));
});

test("the swap carries exerciseId, not just the name", () => {
  // The screen looks a movement up by exerciseId. A name-only swap renames the
  // row and goes on showing the old exercise.
  const body = bodyOf("function AthleteProgram(");
  assert.ok(/const patch = \{ exerciseId: newExercise\.id, name: newExercise\.name, phase: newExercise\.phase \};/.test(body));
});

test("a one-block program is not asked a question with one answer", () => {
  const body = bodyOf("function AthleteProgram(");
  assert.ok(/if \(plan\.blocks\.length > 1\) \{ setScopeTarget/.test(body),
    "a program that is one repeating week has nothing to scope to");
});

// ---------- wiring on the coach's editor ----------

test("a coach changing one exercise on the board picks this week or every week", () => {
  // 29 Oct: the per-day editor with its block strip is gone; the board is
  // the one place, and a change there is week-only unless the coach says so.
  const body = bodyOf("function BoardExerciseEditor(");
  assert.match(body, /setScope\("week"\)/);
  assert.match(body, /scope === "week" && total > 1 \? \[target\.week, target\.week\] : undefined/);
  assert.match(body, /applyAdjustOps\(program, ops/);
});

test("the coach's plan honours authored blocks and the fight taper", () => {
  const body = bodyOf("function CoachAthleteDetail(");
  assert.ok(/programBlocks\(program\)/.test(body),
    "an imported program's own blocks, but guarded so an edit cannot collapse them");
  assert.ok(/planForFight\(/.test(body), "and a camp's taper replaces the deload here too");
  assert.ok(/athlete\?\.intake\?\.fightDate/.test(body), "read from the ATHLETE, not the signed-in coach");
});

test("typing in a sets box does not pop a modal, but is still block-scoped", () => {
  const body = bodyOf("function CoachAthleteDetail(");
  const fn = body.slice(body.indexOf("const updateExerciseField ="), body.indexOf("const multiBlock") + 400);
  assert.ok(/scope: "block", week: editBlock\.startWeek/.test(body),
    "a keystroke cannot ask a question, and the block on screen is what the coach means");
  assert.ok(/multiBlock\(\) \? \{ scope: "block"/.test(body));
});

test("a movement swap in the coach editor DOES ask", () => {
  const body = bodyOf("function CoachAthleteDetail(");
  assert.ok(/if \(multiBlock\(\)\) \{ setScopeTarget/.test(body));
  assert.ok(/<EditScopeModal/.test(body));
});

test("both writers share one scoped path", () => {
  const body = bodyOf("function CoachAthleteDetail(");
  assert.ok(/const scopedEdit = \(dayId, xId, patch, scopeOpts\)/.test(body));
  // Neither may still write the exercise row directly.
  assert.ok(!/exercises: d\.exercises\.map\(x => x\.id === xId \? \{ \.\.\.x, \[field\]: value \}/.test(body),
    "updateExerciseField must not bypass the engine");
  assert.ok(/applyExerciseEdit\(x, patch, \{ \.\.\.scopeOpts, blocks: coachPlan\.blocks, totalWeeks: coachPlan\.weeks, nameFor:/.test(body),
    "the coach's writes must go through the tested engine too, with the coach's own blocks");
});

// ---------- the thing that must never happen ----------

test("no resolved day ever reaches a save", () => {
  // resolveDayForWeek / resolveExerciseForWeek / programForDate flatten the
  // program to ONE week. Saving that burns that week's numbers into the
  // template and destroys every other week. This walks every component that
  // resolves and checks the resolved value is only rendered.
  const WRITERS = ["updateProgramRow", "queueProgramSave", "ensureCustom", "createProgramRow", "denormalizeDays"];
  const RESOLVERS = ["resolveDayForWeek", "resolveExerciseForWeek", "programForDate", "dayForEdit"];
  const comps = [...src.matchAll(/^function ([A-Z]\w+)\(/gm)].map(m => m[1]);
  const offenders = [];
  for (const name of comps) {
    const body = bodyOf(`function ${name}(`);
    const resolved = RESOLVERS.filter(r => body.includes(r + "("));
    if (!resolved.length) continue;
    // Every assignment of a resolved value must be consumed by JSX, never
    // handed to a writer in the same expression.
    for (const line of body.split("\n")) {
      if (!RESOLVERS.some(r => line.includes(r + "("))) continue;
      if (WRITERS.some(w => line.includes(w + "("))) offenders.push(`${name}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, [],
    "a resolved single-week day was handed straight to a save path");
});

test("dayForEdit is documented as display-only", () => {
  const at = src.indexOf("const dayForEdit =");
  const near = src.slice(at - 420, at + 160);
  assert.ok(/[Dd]isplay only/.test(near),
    "the next person to touch this needs to know why it must not be saved");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
