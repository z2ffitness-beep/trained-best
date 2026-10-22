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
  // The key is what matters, not the variable: these answers go UNDER
  // intake.training so they cannot collide with the coach's own settings -
  // accountability, cancellation window, payment methods - which live at the
  // top level of the same column.
  assert.ok(/const merged = \{ \.\.\.\(row\?\.intake \|\| \{\}\), training: \w+ \};/.test(src),
    "the intake must nest under intake.training");
  // Read-modify-write. A blind update of the column would take the coach's
  // settings with it.
  assert.ok(/\.from\("profiles"\)\.select\("intake"\)\.eq\("id", state\.me\.id\)\.single\(\)/.test(src),
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

// ---------- the switch between coaching and training ----------
//
// "My Own Training" is not a thinner copy of the athlete screens inside the
// coach app. It is the athlete app, entered by a switch - which is what lets
// a coach use the thing they are asking their athletes to use.
//
// None of this was pinned by a test, and all of it is the kind of wiring
// that breaks silently: a switch that changes a flag and leaves you on the
// screen you were on, or a flag that survives a logout so the next person to
// sign in on that phone lands somewhere that means nothing for them.

test("switching modes also moves you to the right screen", () => {
  // Flipping the flag and leaving the coach on the coach dashboard is the
  // obvious bug here, and it looks exactly like the switch not working.
  const at = src.indexOf("const setTraining = (on) => {");
  assert.ok(at > 0, "the mode switch is gone");
  const fn = src.slice(at, src.indexOf("\n  };", at));
  assert.ok(/setTrainingMode\(on\)/.test(fn), "the switch does not change the mode");
  assert.ok(/setView\(on \? "athlete-dashboard" : "coach-dashboard"\)/.test(fn),
    "the switch leaves the coach on whatever screen they were already on");
  // A stale parameter would carry an athlete id from the coach side into the
  // training side, where it means something else entirely.
  assert.ok(/setNavParam\(null\)/.test(fn), "the previous screen's parameter survives the switch");
});

test("the mode is remembered on the device, and only on the device", () => {
  const at = src.indexOf("const setTraining = (on) => {");
  const fn = src.slice(at, src.indexOf("\n  };", at));
  assert.ok(/localStorage\.setItem\(TRAINING_MODE_KEY/.test(fn),
    "a coach who closes the app mid-session comes back as a coach");
  assert.ok(/catch \{ \/\* per-device nicety \*\/ \}/.test(fn),
    "storage being unavailable throws instead of being shrugged off");
  // Read back the same way at startup, and a failure there must not stop the
  // app loading.
  assert.ok(/try \{ return localStorage\.getItem\(TRAINING_MODE_KEY\) === "1"; \} catch \{ return false; \}/.test(src),
    "the remembered mode is read without a fallback");
});

test("logging out leaves the phone in coach mode for nobody in particular", () => {
  // A shared or handed-over phone: the next person to sign in is usually an
  // athlete, and training mode means nothing for them.
  const at = src.indexOf("logout: () => {");
  const fn = src.slice(at, src.indexOf("\n    },", at));
  assert.ok(/setTrainingMode\(false\)/.test(fn), "training mode survives a logout");
  assert.ok(/localStorage\.setItem\(TRAINING_MODE_KEY, "0"\)/.test(fn),
    "training mode is cleared in memory but not on the device, so it comes back on reload");
});

test("the switch is reachable from both sides", () => {
  // A one-way door is the version of this bug that strands a coach in their
  // own training with no way back to their roster.
  const dash = src.slice(src.indexOf("function CoachDashboard("), src.indexOf("function withNextSession("));
  assert.ok(/<ModeSwitch training=\{false\} onChange=\{onSwitchMode\} \/>/.test(dash),
    "there is no way into your own training from the coach dashboard");
  const home = src.slice(src.indexOf("function AthleteDashboard("));
  assert.ok(/<ModeSwitch training=\{true\} onChange=\{onSwitchMode\} \/>/.test(home.slice(0, 20000)),
    "there is no way back to coaching from your own training");
  // And on a wide screen, where neither dashboard shows its own copy.
  assert.ok(/modeSwitch=\{authed === "coach" \? <ModeSwitch training=\{trainingMode\} onChange=\{setTrainingMode\} className="" \/> : null\}/.test(src),
    "the desktop sidebar has no mode switch");
});

test("a coach who has not answered the training questions is asked them first", () => {
  // Otherwise they land on an athlete dashboard built from nothing: no
  // programme, no days, and no explanation of why.
  assert.ok(/\(authed === "coach" && trainingMode && !state\.me\?\.intake && view !== "athlete-profile"\)\n\s*\? pages\["coach-training-intake"\]/.test(src),
    "the training intake no longer gates the athlete screens for a coach");
});

test("the profile is the one screen the intake gate lets through", () => {
  // The gate is unconditional apart from this, and without the exception a
  // coach who taps "Not now" has no way to reach their own settings, log
  // out, or switch back - the intake is the only screen they can see.
  const at = src.indexOf('view !== "athlete-profile"');
  assert.ok(at > 0, "a coach who declines the training questions is trapped on them");
});

test("a coach's split is derived if they never picked one", () => {
  // This screen still asks the question, but the step can be passed without
  // tapping anything and the default is full body. A coach training six days
  // a week would be programmed six full-body sessions.
  const page = src.indexOf("function CoachTrainingIntake(");
  const at = src.indexOf("const save = async () => {", page);
  assert.ok(page > 0 && at > page, "CoachTrainingIntake no longer has the shape this test reads");
  const fn = src.slice(at, at + 1800);
  assert.ok(/const answers = withDerivedSplit\(data\);/.test(fn),
    "the coach's own training skips the derivation every athlete gets");
  assert.ok(/training: answers/.test(fn), "the derived split is worked out and then not saved");
  assert.ok(!/intake: data,/.test(fn), "the in-memory copy still holds the answers without the split");
});

for (const [name, fn] of tests) {
  try { fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
