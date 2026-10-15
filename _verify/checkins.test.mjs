// Daily check-ins: what gets stored, and what a coach is told about a week of
// them. These numbers decide whether someone gets pushed or backed off next
// week, so an invented one is worse than a missing one.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  "normalizeScale", "normalizeSleepHours", "checkinHasContent", "checkinSummary",
  { name: "mapCheckin", kind: "const" },
  { name: "CHECKIN_SCALES", kind: "const" },
  { name: "CHECKIN_SCALE_MAX", kind: "const" },
  { name: "CHECKIN_CONCERN_BELOW", kind: "const" },
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const entry = (date, over = {}) => ({
  date, weightKg: null, sleepQuality: null, sleepHours: null,
  soreness: null, energy: null, stress: null, note: null, ...over,
});

// ---------- what a field accepts ----------

test("a scale takes 1 to 5 and nothing else", () => {
  assert.equal(H.normalizeScale(1), 1);
  assert.equal(H.normalizeScale(5), 5);
  assert.equal(H.normalizeScale("3"), 3);
  assert.equal(H.normalizeScale(0), null);
  assert.equal(H.normalizeScale(6), null);
  assert.equal(H.normalizeScale(-2), null);
  assert.equal(H.normalizeScale(null), null);
  assert.equal(H.normalizeScale(""), null);
  assert.equal(H.normalizeScale("fine"), null);
});

test("sleep is rounded to the quarter hour", () => {
  // Nobody slept 7.328 hours, and storing it implies a precision the answer
  // does not have.
  assert.equal(H.normalizeSleepHours(7.328), 7.25);
  assert.equal(H.normalizeSleepHours("8"), 8);
  assert.equal(H.normalizeSleepHours(6.6), 6.5);
});

test("an impossible night's sleep is refused", () => {
  assert.equal(H.normalizeSleepHours(30), null);
  assert.equal(H.normalizeSleepHours(-3), null);
  assert.equal(H.normalizeSleepHours(""), null);
  assert.equal(H.normalizeSleepHours(null), null);
  assert.equal(H.normalizeSleepHours(24), 24);
  assert.equal(H.normalizeSleepHours(0), 0);
});

// ---------- an empty check-in is not a check-in ----------

test("a date on its own is not worth saving", () => {
  assert.equal(H.checkinHasContent(entry("2025-09-08")), false);
  assert.equal(H.checkinHasContent(null), false);
  assert.equal(H.checkinHasContent({ note: "   " }), false);
});

test("any one field makes it a check-in", () => {
  assert.equal(H.checkinHasContent(entry("d", { weightKg: 82 })), true);
  assert.equal(H.checkinHasContent(entry("d", { sleepQuality: 3 })), true);
  assert.equal(H.checkinHasContent(entry("d", { sleepHours: 7 })), true);
  assert.equal(H.checkinHasContent(entry("d", { note: "shoulder sore" })), true);
  assert.equal(H.checkinHasContent(entry("d", { photoPath: "a/x.jpg" })), true);
});

test("a zero is a real answer, not an empty one", () => {
  // Zero hours of sleep is a thing a person can report, and it is exactly the
  // thing a coach most needs to see.
  assert.equal(H.checkinHasContent(entry("d", { sleepHours: 0 })), true);
});

// ---------- what the coach is shown ----------

const week = [
  entry("2025-09-02", { sleepQuality: 4, energy: 4, soreness: 3, stress: 3, sleepHours: 7 }),
  entry("2025-09-03", { sleepQuality: 2, energy: 3, soreness: 2, stress: 2, sleepHours: 6 }),
  entry("2025-09-04", { sleepQuality: 2, energy: 2, soreness: 2, stress: 2, sleepHours: 5, note: "wrecked" }),
];

test("averages cover the window and round to one place", () => {
  const s = H.checkinSummary(week, { today: "2025-09-08" });
  assert.equal(s.entries, 3);
  assert.equal(s.averages.sleepQuality, 2.7);
  assert.equal(s.sleepHours, 6);
});

test("a run of low scores is named, not just flagged", () => {
  // So the coach knows what to ask about rather than being told something
  // vague is wrong.
  const s = H.checkinSummary(week, { today: "2025-09-08" });
  assert.ok(s.concerns.includes("recovery"));
  assert.ok(s.concerns.includes("stress"));
  assert.ok(!s.concerns.includes("sleep quality"), "2.7 is above the line");
});

test("a good week raises nothing", () => {
  const good = [entry("2025-09-07", { sleepQuality: 5, energy: 4, soreness: 4, stress: 4 })];
  assert.deepEqual(H.checkinSummary(good, { today: "2025-09-08" }).concerns, []);
});

test("entries outside the window are left out", () => {
  const withOld = [...week, entry("2025-07-01", { sleepQuality: 1, energy: 1, soreness: 1, stress: 1 })];
  const s = H.checkinSummary(withOld, { today: "2025-09-08" });
  assert.equal(s.entries, 3);
});

test("a future-dated entry does not count toward this week", () => {
  const withFuture = [...week, entry("2025-12-25", { sleepQuality: 5 })];
  assert.equal(H.checkinSummary(withFuture, { today: "2025-09-08" }).entries, 3);
});

test("no check-ins means no summary rather than a row of dashes", () => {
  assert.equal(H.checkinSummary([], { today: "2025-09-08" }), null);
  assert.equal(H.checkinSummary(null, { today: "2025-09-08" }), null);
  assert.equal(H.checkinSummary([entry("2025-01-01", { energy: 3 })], { today: "2025-09-08" }), null);
});

test("a scale nobody filled in has no average at all", () => {
  // Rather than a zero, which would read as the worst possible answer.
  const partial = [entry("2025-09-07", { sleepQuality: 4 })];
  const s = H.checkinSummary(partial, { today: "2025-09-08" });
  assert.equal(s.averages.sleepQuality, 4);
  assert.equal(s.averages.energy, null);
  assert.equal(s.sleepHours, null);
  assert.deepEqual(s.concerns, []);
});

test("the latest entry in the window is the one surfaced", () => {
  const s = H.checkinSummary(week, { today: "2025-09-08" });
  assert.equal(s.latest.date, "2025-09-04");
  assert.equal(s.latest.note, "wrecked");
});

// ---------- rows in, entries out ----------

test("a database row maps to what the screens read", () => {
  const row = H.mapCheckin({
    id: "1", entry_date: "2025-09-08", created_at: "2025-09-08T06:00:00Z",
    weight_kg: 82.5, body_fat: 14, sleep_quality: 4, sleep_hours: "7.5",
    soreness: 2, energy: 4, stress: 2, note: "legs heavy", photo_path: null,
  });
  assert.equal(row.date, "2025-09-08");
  assert.equal(row.sleepHours, 7.5);
  assert.equal(typeof row.sleepHours, "number", "numeric comes back as a string from postgres");
  assert.equal(row.soreness, 2);
  assert.equal(row.note, "legs heavy");
});

test("an older row with no entry_date falls back to when it was created", () => {
  // Every row that predates the check-in columns looks like this.
  const row = H.mapCheckin({ id: "1", created_at: "2025-06-01T09:30:00Z", weight_kg: 80 });
  assert.equal(row.date, "2025-06-01");
  assert.equal(row.sleepQuality, undefined);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) {
    console.error(`✖ ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
