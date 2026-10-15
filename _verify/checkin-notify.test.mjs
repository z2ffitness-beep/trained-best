// Telling the coach the athlete turned up.
//
// There are two separate moments a coach cares about, and only one of them was
// wired. Finishing a workout wrote a workout_logs row and notified the coach
// (notify_coach_session_complete). CONFIRMING today's session — the athlete
// saying "I'm doing this one" — wrote a session_checkins row and told nobody.
//
// The gap was invisible because both halves look identical from the athlete's
// side. Zay confirmed a session on 5 Oct 2026 at 15:14 and Isaiah's bell stayed
// empty, because a check-in is not a workout log and only the log had a notice
// attached to it.
//
// The database owns the rules — who may send, and not sending twice for one
// day. What this file pins is the client half: that the call exists, that it is
// made, that it is made only after the check-in is safely saved, and that the
// notice renders as something a coach can read rather than falling through to a
// bare "Notification".
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

const fnBody = (name) => {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at > -1, `${name} is gone`);
  const rest = src.slice(at);
  return rest.slice(0, rest.indexOf("\n}\n"));
};

// ---------- the call exists and is correct ----------

test("the wrapper calls the right database function", () => {
  const b = fnBody("notifyCoachOfCheckin");
  assert.ok(/notify_coach_session_confirmed/.test(b),
    "pointed at the wrong RPC, or none");
});

test("it sends the day and the date the function expects", () => {
  const b = fnBody("notifyCoachOfCheckin");
  // Named parameters: a mismatch here is not a crash, it is a silent null in
  // the coach's notification where the session name should be.
  assert.ok(/p_program_day:/.test(b), "no program day sent");
  assert.ok(/p_date:/.test(b), "no date sent — the per-day dedupe keys on it");
});

test("a failed notice cannot fail the check-in", () => {
  const b = fnBody("notifyCoachOfCheckin");
  assert.ok(/try\s*\{/.test(b) && /catch/.test(b),
    "an unreachable server would turn a saved check-in into an error on screen");
});

// ---------- it is actually wired ----------

test("confirming a check-in notifies the coach", () => {
  // The bug was never a broken function. It was a function nobody called.
  // confirmCheckin is an arrow bound to a const, so fnBody (which looks for a
  // `function` declaration) cannot find it — slice from the const instead.
  const at = src.indexOf("const confirmCheckin = async () =>");
  assert.ok(at > 0, "confirmCheckin is gone");
  const body = src.slice(at, at + 2000);
  assert.ok(/notifyCoachOfCheckin\(/.test(body),
    "the check-in saves and still tells nobody");
});

test("the notice is sent after the row is saved, not before", () => {
  const at = src.indexOf("const confirmCheckin = async () =>");
  const body = src.slice(at, at + 2000);
  const upsert = body.indexOf('.from("session_checkins")');
  const notify = body.indexOf("notifyCoachOfCheckin(");
  assert.ok(upsert > 0 && notify > 0, "could not find both the write and the notice");
  assert.ok(notify > upsert,
    "the coach is told before the check-in is written, so a failed write still sends one");
});

test("a failed write sends nothing at all", () => {
  // The error branch returns early. If that return is ever removed the coach
  // gets told about a check-in that does not exist.
  const at = src.indexOf("const confirmCheckin = async () =>");
  const body = src.slice(at, at + 2000);
  const errAt = body.indexOf("Couldn't save your check-in");
  const notify = body.indexOf("notifyCoachOfCheckin(");
  assert.ok(errAt > 0, "the save-failure branch is gone");
  const between = body.slice(errAt, notify);
  assert.ok(/return;/.test(between),
    "nothing stops a failed save from falling through into the notification");
});

test("the notice is not awaited", () => {
  const at = src.indexOf("const confirmCheckin = async () =>");
  const body = src.slice(at, at + 2000);
  assert.ok(!/await notifyCoachOfCheckin\(/.test(body),
    "awaiting it makes the athlete wait on a message meant for somebody else");
});

// ---------- it renders ----------

const H = await load(APP, ["describeNotification"]);

// describeNotification reaches for the palette and for icon components, which
// are not part of the extracted slice. Minimal stand-ins let the branch run.
globalThis.C = { olive: "#6b8e23", orange: "#ff8c00", blue: "#2E86FF" };
globalThis.CheckCircle2 = "CheckCircle2";
globalThis.Dumbbell = "Dumbbell";
globalThis.Bell = "Bell";
globalThis.Calendar = "Calendar";
globalThis.formatClock = (s) => `${s}s`;

const confirmed = (data = {}) => ({
  kind: "session_confirmed",
  title: "Zay confirmed today's session",
  data,
});

test("a confirmation renders as itself, not as a bare Notification", () => {
  const out = H.describeNotification(confirmed({ programDay: "Day 3 — Wednesday" }));
  assert.equal(out.title, "Zay confirmed today's session");
  assert.equal(out.detail, "Day 3 — Wednesday");
  assert.notEqual(out.title, "Notification");
});

test("a confirmation with no day name still says something useful", () => {
  const out = H.describeNotification(confirmed({}));
  assert.ok(out.detail && out.detail.length > 0,
    "an empty second line reads as a rendering bug to the coach");
});

test("confirmed and completed are told apart on sight", () => {
  // They arrive in the same list, minutes apart, about the same session. If
  // they look identical the coach cannot tell who has started from who has
  // finished — which is the entire reason for adding the first one.
  const a = H.describeNotification(confirmed({ programDay: "Day 3" }));
  const b = H.describeNotification({
    kind: "session_completed",
    title: "Zay completed a session",
    data: { dayName: "Day 3", timedSeconds: 3600, setsCompleted: 12, setsPrescribed: 12 },
  });
  assert.notEqual(a.icon, b.icon, "same icon for starting and finishing");
  assert.notEqual(a.accent, b.accent, "same colour for starting and finishing");
});

test("an unknown kind still falls through to the generic shape", () => {
  const out = H.describeNotification({ kind: "something_new", title: "Hello", body: "There" });
  assert.equal(out.title, "Hello");
  assert.equal(out.detail, "There");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
