// Giving a client a program, and the message box you could only half see.
//
// The coach's report: assigning a program to Moses offered only two options,
// both of them the demo programs the app ships with — even though Moses had
// answered every question at signup. And the one other place a coach could
// generate was handed a HARDCODED example intake, so it wrote a program for an
// imaginary MMA fighter whoever the client actually was.
//
// Also: three screens that fill the height with a composer pinned at the bottom
// used 100vh, which on iOS measures the viewport as if the browser's bars were
// hidden. The bottom of the column sat below the visible screen.
import assert from "node:assert/strict";
import fs from "node:fs";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const CSS = path.join(here, "..", "src", "index.css");
const src = readSource(APP);
const css = fs.readFileSync(CSS, "utf8");
const H = await load(APP, [
  { name: "lbToKg", kind: "const" }, { name: "kgToLb", kind: "const" },
  "intakeForAthlete", "intakeIsUsable",
]);

const bodyOf = (fn) => {
  const at = src.indexOf(fn);
  assert.notEqual(at, -1, `${fn} not found`);
  return src.slice(at, src.indexOf("\nfunction ", at + 1));
};

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// Moses, as the database actually holds him: coached, no program, questionnaire
// answered.
const MOSES = {
  id: "m", name: "Moses", sport: "General Fitness", sex: "male", program: null,
  goals: ["Build Muscle"], injuries: [], isFighter: false,
  weightKg: 84, heightCm: 183,
  intake: { experience: "Beginner", trainingDays: ["Monday", "Wednesday", "Friday"],
    equipment: ["Full gym access"], sessionMinutes: 60, goals: ["Build Muscle"],
    "🥊 Sport / Focus": "General Fitness", sex: "Male" },
};

// ---------- the athlete's own answers ----------

test("a real athlete's answers are usable as-is", () => {
  assert.equal(H.intakeIsUsable(H.intakeForAthlete(MOSES)), true);
});

test("the intake blob wins over the profile columns", () => {
  // The blob is what they actually answered. The columns are the app's own copy.
  const a = { ...MOSES, sport: "MMA", intake: { ...MOSES.intake, "🥊 Sport / Focus": "Boxing" } };
  assert.equal(H.intakeForAthlete(a)["🥊 Sport / Focus"], "Boxing");
});

test("the columns fill in what the blob is missing", () => {
  // An account whose questionnaire predates a question still has these.
  const a = { ...MOSES, intake: { trainingDays: ["Monday"], equipment: ["Dumbbells"] } };
  const i = H.intakeForAthlete(a);
  assert.equal(i["🥊 Sport / Focus"], "General Fitness");
  assert.equal(i.heightCm, 183);
  assert.equal(i.weightLb, H.kgToLb(84), "weight is stored in kilos and the prompt wants pounds");
  assert.equal(i.sex, "Male");
  assert.deepEqual(i.goals, ["Build Muscle"]);
  assert.equal(i.isFighter, false);
});

test("an empty list in the blob does not hide a real one on the profile", () => {
  const a = { ...MOSES, goals: ["Fat Loss"], intake: { ...MOSES.intake, goals: [] } };
  assert.deepEqual(H.intakeForAthlete(a).goals, ["Fat Loss"]);
});

test("isFighter false is kept, not treated as missing", () => {
  const a = { ...MOSES, isFighter: true, intake: { ...MOSES.intake, isFighter: false } };
  assert.equal(H.intakeForAthlete(a).isFighter, false,
    "false is an answer; only null or undefined should fall through");
});

test("a half-finished questionnaire is refused rather than guessed at", () => {
  assert.equal(H.intakeIsUsable({ trainingDays: ["Monday"] }), false, "no equipment");
  assert.equal(H.intakeIsUsable({ equipment: ["Full gym access"] }), false, "no training days");
  assert.equal(H.intakeIsUsable({ trainingDays: [], equipment: [] }), false);
  assert.equal(H.intakeIsUsable({}), false);
  assert.equal(H.intakeIsUsable(null), false);
});

test("no athlete at all does not throw", () => {
  assert.equal(H.intakeIsUsable(H.intakeForAthlete(null)), false);
  assert.equal(H.intakeIsUsable(H.intakeForAthlete(undefined)), false);
  const i = H.intakeForAthlete({});
  assert.equal(i.weightLb, undefined, "no weight is undefined, not NaN");
  assert.equal(i.sex, undefined);
});

// ---------- the assign screen ----------

test("assigning offers to build from the athlete's own answers", () => {
  const body = bodyOf("function CoachAthletes(");
  assert.ok(/Build from \{first\}'s answers/.test(body),
    "two demo templates were the only options a coach had");
  assert.ok(/intakeForAthlete\(athlete\)/.test(body), "and it must use THEIR answers");
  assert.ok(/setGenerateFor\(assignOpen\)/.test(body));
});

test("it is disabled, with a reason, when the questionnaire is unfinished", () => {
  const body = bodyOf("function CoachAthletes(");
  assert.ok(/const usable = intakeIsUsable\(intake\)/.test(body));
  assert.ok(/disabled=\{assigning \|\| !usable\}/.test(body));
  assert.ok(/hasn't finished the questionnaire/.test(body),
    "a dead button with no explanation is worse than no button");
});

test("a blank program is offered too", () => {
  const body = bodyOf("function CoachAthletes(");
  assert.ok(/Start from blank/.test(body));
  assert.ok(/const assignBlank = async \(athleteId\)/.test(body));
});

test("saved programs are still offered, below", () => {
  const body = bodyOf("function CoachAthletes(");
  assert.ok(/Or use a saved program/.test(body));
  assert.ok(/state\.programs\.filter\(isTemplate\)\.map/.test(body));
  assert.ok(/state\.programs\.filter\(isTemplate\)\.length > 0 && \(/.test(body),
    "and the heading must not show when there are none");
});

test("a generated program is assigned through the same path as a template", () => {
  // That path handles the weekday pinning, setting the active program, and
  // cleaning up if it fails halfway. A second copy of it would drift.
  const body = bodyOf("function CoachAthletes(");
  const fn = body.slice(body.indexOf("const assignGenerated"), body.indexOf("const assignBlank"));
  // `allowEmpty` joined this call so a deliberately blank program can be
  // created; the guard it bypasses is still on by default.
  assert.ok(/assignTemplateToAthlete\(\{ template, athlete, coachId: myUserId, state, allowEmpty \}\)/.test(fn));
  assert.ok(/setAssignError\(res\.message\)/.test(fn), "a failure has to be reported");
  assert.ok(/athletes: s\.athletes\.map\(a => a\.id === athleteId \? \{ \.\.\.a, program: created\.id/.test(fn),
    "and the athlete has to end up pointing at it");
});

// ---------- the hardcoded example intake ----------

test("no generator is fed an invented athlete any more", () => {
  assert.ok(!/intake=\{\{ "🥊 Sport \/ Focus": "MMA", isFighter: true/.test(src),
    "this wrote a program for an imaginary fighter whoever the client was");
  // Every call site must read a real person's answers: intakeForAthlete for a
  // coach building for a client, state.me.intake for an athlete building their
  // own. A literal object is the bug — it describes nobody.
  const uses = [...src.matchAll(/<AIProgramGenerator[\s\S]{0,200}?intake=\{([\s\S]*?)\}\s*\n/g)]
    .map(m => m[1].trim());
  assert.ok(uses.length >= 3, `expected all three call sites, found ${uses.length}`);
  uses.forEach(u => {
    const real = /intakeForAthlete\(/.test(u) || /state\.me\.intake/.test(u);
    assert.ok(real, `a generator must read a real person's answers, got: ${u.slice(0, 80)}`);
    assert.ok(!/"🥊 Sport \/ Focus":\s*"/.test(u),
      `a hardcoded intake describes nobody: ${u.slice(0, 80)}`);
  });
});

test("the programs screen asks who the program is for first", () => {
  const body = bodyOf("function CoachPrograms(");
  assert.ok(/Who is this program for\?/.test(body));
  assert.ok(/setAiFor\(a\.id\)/.test(body));
  assert.ok(/aiOpen && aiFor/.test(body), "and only generates once one is picked");
  assert.ok(/disabled=\{!usable\}/.test(body), "an unfinished questionnaire cannot be chosen");
});

// ---------- the message box ----------

test("the chat screens no longer measure themselves with 100vh", () => {
  assert.equal((src.match(/className="flex flex-col h-screen pb-16"/g) || []).length, 0,
    "h-screen is 100vh, and on iOS that is taller than what you can see");
  assert.equal((src.match(/className="flex flex-col app-screen"/g) || []).length, 3,
    "coach messages, athlete messages, and Community");
});

test("the height rule uses the visible viewport, with a fallback", () => {
  const at = css.indexOf(".app-screen");
  assert.notEqual(at, -1, "the class has to exist or those screens have no height at all");
  const rule = css.slice(at, css.indexOf("}", at));
  assert.ok(/height:\s*100vh/.test(rule), "a fallback for browsers without dvh");
  assert.ok(/height:\s*100dvh/.test(rule), "and the real one");
  assert.ok(rule.indexOf("100vh") < rule.indexOf("100dvh"),
    "the fallback must come first or it overrides the fix");
});

test("it clears the bottom bar including the home indicator", () => {
  const at = css.indexOf(".app-screen");
  const rule = css.slice(at, css.indexOf("}", at));
  assert.ok(/padding-bottom:\s*calc\(4rem \+ env\(safe-area-inset-bottom, 0px\)\)/.test(rule),
    "the bar pads itself by the inset, so this has to add the same or it under-clears");
});

test("the bottom bar still pads itself by the inset", () => {
  assert.ok(/paddingBottom: "calc\(8px \+ env\(safe-area-inset-bottom\)\)"/.test(src),
    "if this changes, the 4rem above is wrong");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
