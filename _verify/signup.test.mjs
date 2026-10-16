// Signup: what it collects, in what order, and what must never leave the device.
//
// The account is created at step one now, so these answers are typed by
// somebody who already has a login. Two things follow, and both are pinned
// here because both fail silently:
//
//   * the password is typed twice, because a typo locks a person out of their
//     own account and the way back is a reset email sent to an address they may
//     have mistyped in the same sitting;
//   * neither password field may reach the database. The intake blob is built
//     by destructuring everything NOT named in one list, so a field added to
//     the form and forgotten in that list is written to Postgres in plain text.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
// Run the real validator rather than reading its body. The gate moved into a
// helper once the screen needed to SAY what was wrong, and a test that greps
// for the old expression fails on a refactor that changed nothing.
const H = await load(APP, [
  { name: "EMAIL_RE", kind: "const" },
  { name: "looksLikeEmail", kind: "const" },
  "accountStepProblems", "accountStepValid",
]);

const ok = { name: "Sam Okafor", email: "sam@example.com", password: "hunter2x", confirmPassword: "hunter2x" };

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// ---------- nothing secret reaches the database ----------

const stripped = (pattern) => {
  const m = src.match(pattern);
  assert.ok(m, `could not find the destructure: ${pattern}`);
  return m[1].split(",").map(n => n.trim()).filter(Boolean);
};

test("the intake written to Postgres strips both password fields", () => {
  const names = stripped(/const \{ ([^}]*)\.\.\.rest \} = data;/);
  for (const secret of ["password", "confirmPassword"]) {
    assert.ok(names.includes(secret),
      `${secret} is not stripped, so it lands in profiles.intake as plain text`);
  }
});

test("the saved signup draft strips both password fields", () => {
  const names = stripped(/const \{ ([^}]*)\.\.\.keep \} = data \|\| \{\};/);
  for (const secret of ["password", "confirmPassword"]) {
    assert.ok(names.includes(secret),
      `${secret} is not stripped, so it sits in localStorage in plain text`);
  }
});

// ---------- the password is confirmed ----------

test("the account screen asks for the password twice", () => {
  assert.ok(/set\("confirmPassword"/.test(src), "there must be a confirm field");
  assert.ok(/autoComplete="new-password"/.test(src),
    "both password boxes want new-password, or the browser offers the saved one");
});

test("a complete account passes", () => {
  assert.equal(H.accountStepProblems(ok), null);
  assert.equal(H.accountStepValid(ok), true);
});

test("a mismatch blocks the step", () => {
  const bad = { ...ok, confirmPassword: "hunter2X" };
  assert.equal(H.accountStepValid(bad), false, "Continue must be gated on the two matching");
  assert.match(H.accountStepProblems(bad).confirmPassword, /match/i, "and it must say so");
});

test("a malformed email blocks the step AND says why", () => {
  // The exact complaint: an address with no provider or no dot was refused
  // silently, so people poked a dead Continue with nothing on screen telling
  // them what was wrong.
  for (const bad of ["sam", "sam@", "sam@gmail", "@gmail.com", "sam gmail.com", "sam@.com"]) {
    const p = H.accountStepProblems({ ...ok, email: bad });
    assert.ok(p && p.email, `"${bad}" must be refused`);
    assert.match(p.email, /email address/i, `"${bad}" must be told it is not an email`);
  }
});

test("an empty email asks for one rather than calling it malformed", () => {
  const p = H.accountStepProblems({ ...ok, email: "" });
  assert.ok(p.email && !/doesn't look like/i.test(p.email),
    "an untouched field is not a mistake; it is unfinished");
});

test("ordinary addresses are accepted, whoever the provider is", () => {
  for (const good of ["sam@gmail.com", "sam@hotmail.co.uk", "s.okafor+gym@niagara-strength.ca", "SAM@EXAMPLE.COM"]) {
    assert.equal(H.looksLikeEmail(good), true, `${good} is a real address`);
  }
});

test("a short password blocks the step and says the minimum", () => {
  const p = H.accountStepProblems({ ...ok, password: "abc", confirmPassword: "abc" });
  assert.match(p.password, /6/, "say the number rather than 'too short'");
});

test("a missing name blocks the step", () => {
  assert.ok(H.accountStepProblems({ ...ok, name: "" }).name);
  assert.ok(H.accountStepProblems({ ...ok, name: "A" }).name, "one letter is not a name");
});

test("the message and the gate cannot disagree", () => {
  // Every case where Continue is dead must carry a reason, and vice versa.
  const cases = [ok, { ...ok, email: "nope" }, { ...ok, password: "x" },
                 { ...ok, confirmPassword: "y" }, { ...ok, name: "" }, {}];
  for (const c of cases) {
    assert.equal(H.accountStepValid(c), H.accountStepProblems(c) === null,
      `a disabled Continue with no message, or a message with a live Continue: ${JSON.stringify(c)}`);
  }
});

// ---------- the sport list ----------

test("sport offers Other rather than a third named discipline", () => {
  const at = src.indexOf("const SPORTS = [");
  const body = src.slice(at, src.indexOf("];", at));
  assert.ok(body.includes('"Other"'), "the catch-all must be there");
  assert.ok(!/New to training \(weightlifting focus\)/.test(body),
    "the old third option read as an experience level, not a sport");
});

test("the sport goes into the generator prompt verbatim", () => {
  // So anything added to SPORTS later has to be a phrase the model can act on.
  assert.ok(/Sport \/ Focus/.test(src), "the prompt reads the sport the athlete picked");
});

// ---------- the short signup, and the contract that makes it safe ----------
//
// Fourteen screens down to six, by asking fewer questions per screen rather
// than fewer questions. The new screens are a different arrangement of
// inputs over an IDENTICAL data model: everything downstream reads `data` by
// key and none of it knows which screen a key was typed on.
//
// So the rewrite is safe exactly as long as every key still gets set, and
// dangerous the moment one quietly stops being asked for. This is the test
// that makes that true rather than hoped for: it reads the keys buildAIPrompt
// and the profile write ACTUALLY use, and fails if any of them is missing
// from SIGNUP_KEYS. A key added to the prompt and forgotten in the new
// screens fails here instead of silently degrading someone's programme.

const V2 = (() => {
  const at = src.indexOf("const SIGNUP_KEYS = {");
  assert.ok(at > 0, "the signup contract is gone");
  return src.slice(at, src.indexOf("\nconst SIGNUP_V2 = ", at));
})();

const allContractKeys = () => {
  const keys = new Set();
  for (const m of V2.matchAll(/"([^"]+)"/g)) keys.add(m[1]);
  return keys;
};

test("every intake key the AI prompt reads is in the contract", () => {
  // The one that matters. Drop "Sport / Focus" and every generated programme
  // silently becomes General Fitness - no error, no warning, just worse
  // training for everyone including the fighters.
  const at = src.indexOf("function buildAIPrompt(intake)");
  assert.ok(at > 0, "buildAIPrompt is gone");
  const prompt = src.slice(at, src.indexOf("\n}\n", at));
  const read = new Set();
  for (const m of prompt.matchAll(/intake\.([A-Za-z_$][\w$]*)/g)) read.add(m[1]);
  for (const m of prompt.matchAll(/intake\["([^"]+)"\]/g)) read.add(m[1]);

  // Derived inside the prompt from keys that ARE collected, or supplied by
  // the app rather than the athlete.
  const derived = new Set(["length", "map", "join", "includes", "filter", "slice"]);
  const keys = allContractKeys();
  const missing = [...read].filter(k => !derived.has(k) && !keys.has(k));
  assert.deepEqual(missing, [],
    `the prompt reads ${missing.join(", ")}, which the new signup never asks for`);
});

test("every key the profile row reads is in the contract", () => {
  // Bounded by what comes next, not by a character count. A fixed window got
  // longer than the thing it was framing the moment a comment was added above
  // it, cut `data.weightLb` in half, and reported a missing key called "w".
  const at = src.indexOf("const writeProfileAndContinue = async");
  const end = src.indexOf('if (role === "athlete" || role === "athlete_coached") {', at);
  assert.ok(at > 0 && end > at, "writeProfileAndContinue no longer has the shape this test reads");
  const body = src.slice(at, end);
  const read = new Set();
  for (const m of body.matchAll(/\bdata\.([A-Za-z_$][\w$]*)/g)) read.add(m[1]);
  for (const m of body.matchAll(/\bdata\["([^"]+)"\]/g)) read.add(m[1]);
  const keys = allContractKeys();
  const ignore = new Set(["user", "photoUrl"]);   // photoUrl is stripped before the write
  const missing = [...read].filter(k => !ignore.has(k) && !keys.has(k));
  assert.deepEqual(missing, [],
    `the profile write reads ${missing.join(", ")}, which the new signup never asks for`);
});

test("sport did not get dropped on the way to six screens", () => {
  // It has no screen of its own in the design and it feeds the prompt, so it
  // sits on the goal screen. Isaiah's call, 15 Oct.
  assert.ok(/goal: \[[^\]]*"🥊 Sport \/ Focus"/.test(V2),
    "Sport / Focus is not collected anywhere in the new signup");
});

test("the three paths are the three in the design", () => {
  const at = src.indexOf("const SIGNUP_V2_STEPS = {");
  const steps = src.slice(at, src.indexOf("\n};", at));
  for (const role of ["athlete", "athlete_coached", "coach"]) {
    assert.ok(new RegExp(`${role}: \\[`).test(steps), `the ${role} path has no screens`);
  }
  assert.ok(/athlete: \["🔐 Create Account", "👤 About You", "🎯 Your Goal", "📅 Your Week", "🩹 Injuries"\]/.test(steps),
    "the solo athlete path is not the five screens the design asks for");
});

test("a coached athlete sees whose app this is before typing a password", () => {
  const at = src.indexOf("const SIGNUP_V2_STEPS = {");
  const steps = src.slice(at, src.indexOf("\n};", at));
  const coached = /athlete_coached: \[([^\]]*)\]/.exec(steps);
  assert.ok(coached, "the coached path is gone");
  const order = coached[1];
  assert.ok(order.indexOf("Coach Invite Code") < order.indexOf("Create Account"),
    "the account comes before the code, so somebody joins a coach they have not seen yet");
});

test("the new flow is still switched off", () => {
  // Signup is the one path where a bug costs a real person's first
  // impression and there is no way to ask them to try again. This flips in
  // one commit, once the screens exist and the suite covers them.
  assert.ok(/const SIGNUP_V2 = false;/.test(src),
    "the new signup is live before its screens have been built");
});

test("the old flow is untouched while the new one is built", () => {
  assert.ok(/const athleteSteps = \[/.test(src), "the existing athlete steps are gone");
  assert.ok(/const coachSteps = \[/.test(src), "the existing coach steps are gone");
  assert.ok(/const coachedAthleteSteps = \[/.test(src), "the existing coached steps are gone");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
