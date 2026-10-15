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

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
