// Deleting a whole program, and the blank one that could never be created.
//
// I shipped the blank-program bug myself last turn. There is a guard that
// refuses to save a program with no exercises in it — it exists to catch an
// import or a generation that silently produced nothing. Then I added a "start
// from blank" button whose entire job is to create exactly that. It failed
// every single time, telling the coach to "try the import again" when there had
// been no import.
//
// My tests checked that the button existed and called the right function. They
// never ran the guard. That is the gap this file closes.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, ["programHasContent"]);

const bodyOf = (fn) => {
  const at = src.indexOf(fn);
  assert.notEqual(at, -1, `${fn} not found`);
  return src.slice(at, src.indexOf("\nfunction ", at + 1));
};

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// The guard, exercised directly against the shapes both paths produce.
const BLANK = [{ name: "Day 1", exercises: [] }];
const REAL = [{ name: "Day 1", exercises: [{ name: "Back Squat", phase: "compound" }] }];

// ---------- the bug I shipped ----------

test("a blank program is exactly what the empty-program guard rejects", () => {
  assert.equal(H.programHasContent(BLANK), false,
    "which is why 'start from blank' failed every time");
  assert.equal(H.programHasContent(REAL), true);
});

test("the assign path can be told an empty program is intended", () => {
  const body = bodyOf("async function assignTemplateToAthlete(");
  assert.ok(/allowEmpty = false/.test(body), "the option has to exist");
  assert.ok(/if \(!allowEmpty && !programHasContent\(scheduled\)\)/.test(body),
    "and the guard has to honour it");
});

test("a blank program still needs a day to put the first exercise in", () => {
  const body = bodyOf("async function assignTemplateToAthlete(");
  assert.ok(/allowEmpty && \(!Array\.isArray\(scheduled\) \|\| scheduled\.length === 0\)/.test(body));
  assert.ok(/A program needs at least one day/.test(body),
    "allowEmpty must not mean 'accept literally nothing'");
});

test("only the blank button passes allowEmpty", () => {
  const body = bodyOf("function CoachAthletes(");
  // assignBlank → assignGenerated(…, true); nothing else may.
  assert.ok(/}, true\);/.test(body), "the blank path opts in");
  assert.ok(/const assignGenerated = async \(athleteId, result, allowEmpty = false\)/.test(body),
    "and it defaults to off, so a failed import is still caught");
  const generated = body.slice(body.indexOf("const assignGenerated"), body.indexOf("const assignBlank"));
  assert.ok(/setState, allowEmpty \}\)/.test(generated), "the flag has to reach the save call");
  // The athlete's own page gained the same build-from-answers option. It has
  // no blank path of its own going through here, so it must never opt in: a
  // generation that came back with no days failed, and saving it leaves the
  // athlete opening an empty week with nothing to say so.
  const detail = src.slice(src.indexOf("function CoachAthleteDetail("));
  const call = detail.slice(detail.indexOf("saveGeneratedProgram({"));
  assert.ok(!/allowEmpty/.test(call.slice(0, 160)),
    "the athlete page must not pass allowEmpty");
});

test("the error no longer blames an import that never happened", () => {
  const body = bodyOf("async function assignTemplateToAthlete(");
  assert.ok(!/Nothing was saved — try the import again\./.test(body),
    "that message appeared when a coach pressed a button called 'start from blank'");
  assert.ok(/If you imported it, try again/.test(body), "conditional, not assumed");
});

// ---------- deleting a whole program ----------

test("deleting clears the profile pointer BEFORE removing the row", () => {
  // The other order leaves a profile pointing at a program that is gone, and
  // that athlete's next load asks for a row that no longer exists.
  const body = bodyOf("async function deleteProgramEverywhere(");
  const link = body.indexOf("active_program_id: null");
  const del = body.indexOf('.from("programs").delete()');
  assert.notEqual(link, -1, "the pointer must be cleared");
  assert.notEqual(del, -1, "the row must be deleted");
  assert.ok(link < del, "pointer first, row second");
});

test("a failed unassign stops before deleting anything", () => {
  const body = bodyOf("async function deleteProgramEverywhere(");
  const link = body.indexOf("if (linkError)");
  const del = body.indexOf('.from("programs").delete()');
  assert.notEqual(link, -1);
  assert.ok(link < del, "it must return, not carry on and orphan the row");
  assert.ok(/Couldn't unassign that program/.test(body));
});

test("a half-finished delete says so rather than claiming success", () => {
  const body = bodyOf("async function deleteProgramEverywhere(");
  assert.ok(/The program was unassigned but couldn't be deleted/.test(body),
    "the pointer is already gone at that point — the coach needs to know");
});

test("local state is cleaned up for the athlete, the roster and yourself", () => {
  const body = bodyOf("async function deleteProgramEverywhere(");
  assert.ok(/programs: s\.programs\.filter\(p => p\.id !== programId\)/.test(body));
  assert.ok(/a\.program === programId \? \{ \.\.\.a, program: null, customProgram: null \}/.test(body),
    "a client on the roster must stop pointing at it");
  assert.ok(/s\.me\?\.program === programId \? \{ \.\.\.s\.me, program: null, customProgram: null \}/.test(body),
    "and so must you, when it was your own");
});

test("nothing is attempted without a program", () => {
  const body = bodyOf("async function deleteProgramEverywhere(");
  assert.ok(/if \(!programId\) return \{ ok: false/.test(body));
});

// ---------- where you can do it ----------

test("a coach can delete a client's program", () => {
  const body = bodyOf("function CoachAthleteDetail(");
  assert.ok(/deleteProgramEverywhere\(program\.id, athlete\.id, state, setState\)/.test(body));
  assert.ok(/onClick=\{\(\) => setDeleteProgOpen\(true\)\}/.test(body), "and reach it");
  assert.ok(/<DeleteProgramModal/.test(body));
});

test("a coach can delete their own program", () => {
  const body = bodyOf("function AthleteProgram(");
  assert.ok(/deleteProgramEverywhere\(myProgram\.id, state\.me\.id, state, setState\)/.test(body));
  // Scoped to the delete button itself. `canEdit &&` appears all over this
  // component, so testing for it anywhere passed with the button ungated.
  const at = body.indexOf("Delete this program and start again");
  assert.notEqual(at, -1);
  const around = body.slice(at - 420, at);
  assert.ok(/\{canEdit && \(\s*\n\s*<button onClick=\{\(\) => setDeleteProgOpen\(true\)\}/.test(around),
    "a coached athlete must not be able to delete their coach's work");
});

test("the delete is guarded against a double tap", () => {
  for (const fn of ["function CoachAthleteDetail(", "function AthleteProgram("]) {
    const body = bodyOf(fn);
    assert.ok(/if \(deletingProg \|\| !(program|myProgram)\) return;/.test(body), fn);
  }
});

test("a failure is shown, not swallowed", () => {
  for (const fn of ["function CoachAthleteDetail(", "function AthleteProgram("]) {
    const body = bodyOf(fn);
    const at = body.indexOf("const removeProgram = async");
    assert.notEqual(at, -1, `${fn}: no removeProgram`);
    const handler = body.slice(at, at + 600);
    assert.ok(/if \(!res\.ok\) \{ setDeleteProgError\(res\.message\); return; \}/.test(handler),
      `${fn}: the handler must stop on failure, not close as if it worked`);
    assert.ok(/setDeleteProgOpen\(false\)/.test(handler));
    assert.ok(handler.indexOf("setDeleteProgError(res.message); return;") < handler.indexOf("setDeleteProgOpen(false)"),
      `${fn}: the failure branch must come before the close`);
    assert.ok(/error=\{deleteProgError\}/.test(body), `${fn}: and reach the modal`);
  }
});

test("the modal says what goes and what stays", () => {
  const body = bodyOf("function DeleteProgramModal(");
  assert.ok(/can't be undone/.test(body));
  assert.ok(/Logged workouts stay/.test(body),
    "deleting a program must not read as deleting their training history");
  assert.ok(/busy \? "Deleting…" : "Delete program"/.test(body));
});

test("deleting a template is still a different thing", () => {
  // That one leaves every athlete's copy alone, and its wording says so.
  assert.ok(/only this template goes/.test(src),
    "the two deletes must not be confused for each other");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
