// Extra activities (Isaiah, 1 Nov): logged by voice or typing, kept in the
// athlete's history and shown to their coach, never counted as a session.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "App.jsx");
const src = fs.readFileSync(APP, "utf8");
const H = await load(APP, [
  { name: "ACTIVITY_FIELDS", kind: "const" }, { name: "fmtNum", kind: "const" },
  "fmtDistance", "activityFromRow", "splitLogRows", "describeActivity", "describeActivityItem",
  "normalizeActivityItem", "normalizeActivity", "activityRow",
]);
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

test("each thing done keeps its own measure, and reads back the same (Isaiah, 1 Nov)", () => {
  const a = {
    name: "Home workout", minutes: 40, rpe: 7, date: "2026-11-01", note: "",
    items: [
      { name: "Push-ups", metric: "reps", sets: [{ reps: 20 }, { reps: 20 }, { reps: 15 }] },
      { name: "Deadlift", metric: "load", sets: [{ weight: 225, unit: "lb", reps: 5 }, { weight: 225, unit: "lb", reps: 5 }] },
      { name: "Plank", metric: "hold", sets: [{ seconds: 60 }] },
      { name: "Run", metric: "distance", sets: [{ meters: 3219 }] },
      { name: "Bike", metric: "time", sets: [{ minutes: 20 }] },
    ],
  };
  const row = H.activityRow("u1", a);
  assert.equal(row.kind, "activity");
  assert.equal(row.counts, false, "it would count as a session");
  assert.equal(row.duration, 40);
  const back = H.activityFromRow({ id: "x", ...row });
  assert.equal(back.rpe, 7);
  assert.equal(back.minutes, 40);
  assert.deepEqual(back.items.map(it => H.describeActivityItem(it, "lb")), [
    "Push-ups 20, 20, 15 reps", "Deadlift 225 lb x 5 (2 sets)", "Plank 60 s", "Run 2 mi", "Bike 20 min",
  ]);
  // A walk with just a time keeps how hard it felt.
  const walk = H.activityFromRow({ id: "w", ...H.activityRow("u1", { name: "Walk", minutes: 30, rpe: 3, date: "2026-11-01", items: [] }) });
  assert.equal(walk.rpe, 3);
  assert.deepEqual(walk.items, []);
});

test("what the AI hears is cleaned before it is shown", () => {
  const a = H.normalizeActivity({ name: "Mixed", minutes: "45", rpe: 7, date: "2099-01-01", items: [
    { name: "Squat", metric: "load", sets: [{ weight: 100, unit: "kg", reps: 5 }] },
    { name: "Run", metric: "distance", sets: [{ distance: { value: 5, unit: "km" } }] },
    { name: "Nonsense", metric: "juggling", sets: [{ reps: 3 }] },
    { name: "Plank", metric: "hold", sets: [{ seconds: -4 }] },
  ] }, "2026-11-01", "lb");
  assert.equal(a.date, "2026-11-01", "a date in the future was kept");
  assert.equal(a.minutes, 45);
  assert.deepEqual(a.items.map(i => i.name), ["Squat", "Run"], "unknown measures and empty sets were kept");
  assert.deepEqual(a.items[0].sets[0], { weight: 100, unit: "kg", reps: 5 }, "a kilo lift was relabelled as pounds");
  assert.equal(a.items[1].sets[0].meters, 5000);
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
