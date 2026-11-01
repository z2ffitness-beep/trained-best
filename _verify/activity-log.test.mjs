// Extra activities (Isaiah, 1 Nov): logged by voice or typing, kept in the
// athlete's history and shown to their coach, never counted as a session.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "App.jsx");
const src = fs.readFileSync(APP, "utf8");
const H = await load(APP, ["activityFromRow", "splitLogRows", "describeActivity", "normalizeActivity", "activityRow"]);
let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

test("activities never land in the session list", () => {
  const { sessions, activities } = H.splitLogRows([{ id: 1, kind: "session" }, { id: 2, kind: "activity" }, { id: 3 }]);
  assert.deepEqual(sessions.map(r => r.id), [1, 3], "an old row with no kind is a session");
  assert.deepEqual(activities.map(r => r.id), [2]);
  for (const [i, line] of src.split("\n").entries()) {
    if (/workoutLogs: (logRows|rows)\.map/.test(line)) assert.fail(`line ${i + 1} puts every row, activities included, into workoutLogs`);
  }
});

test("a saved activity reads back the same", () => {
  const row = H.activityRow("u1", { name: "Walk", minutes: 30, meters: 2400, rpe: 3, date: "2026-11-01", note: "with the dog" });
  assert.equal(row.kind, "activity");
  assert.equal(row.counts, false, "it would count as a session");
  const back = H.activityFromRow({ id: "x", ...row });
  assert.deepEqual({ name: back.name, minutes: back.minutes, meters: back.meters, rpe: back.rpe, notes: back.notes },
    { name: "Walk", minutes: 30, meters: 2400, rpe: 3, notes: "with the dog" });
});

test("what the AI hears is cleaned before it is shown", () => {
  const a = H.normalizeActivity({ name: "Walk", minutes: "30", distance: { value: 2, unit: "mi" }, rpe: 3, date: "2099-01-01" }, "2026-11-01");
  assert.equal(a.minutes, 30);
  assert.equal(a.meters, 3219);
  assert.equal(a.date, "2026-11-01", "a date in the future was kept");
  const b = H.normalizeActivity({ name: "Yoga", minutes: -5, rpe: 40, date: "2026-10-30" }, "2026-11-01");
  assert.equal(b.minutes, null);
  assert.equal(b.rpe, null);
  assert.equal(b.date, "2026-10-30");
});

test("read back in words, in the athlete's units", () => {
  assert.equal(H.describeActivity({ minutes: 30, meters: 5000, rpe: 6 }, "kg"), "30 min · 5 km · felt 6/10");
  assert.equal(H.describeActivity({ minutes: 30, meters: 1609.34 }, "lb"), "30 min · 1 mi");
});

test("on Home under today's workout, and on the coach's view of the client", () => {
  assert.ok(/<ExtraActivityCard state=\{state\} setState=\{setState\} \/>\}\n\s+\{!isCoach && <CoachReplyCard/.test(src));
  assert.ok(/<ChalkDivider label="Extra activities" \/>/.test(src), "the coach never sees them");
});

test("no coach colours: the app is the standard blue in dark or light", () => {
  assert.ok(!/saveBrandColor/.test(src), "coaches can still pick a colour");
  assert.ok(/function setBrandAccent\(hex\) \{\n  const next = null;/.test(src), "a coach colour still repaints the app");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`✖ ${name}\n  ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
