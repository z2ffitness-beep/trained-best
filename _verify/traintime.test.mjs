// Time trained, totalled over the windows an athlete thinks in.
//
// The trap this file guards is a quiet one. Every workout log carries TWO
// time figures:
//
//   duration      — how long the workout screen was open. Always recorded,
//                   and it keeps counting while the phone sits in a locker.
//   timedSeconds  — the stopwatch the athlete deliberately started. Null when
//                   they did not.
//
// The profile used to show an "All Time · minutes" tile built from `duration`,
// labelled as time trained. It was really a total of how long the app had been
// left open. These tests pin the totals to the stopwatch, and pin the app to
// saying out loud how many sessions the figure does not cover.
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

const H = await load(APP, [
  { name: "MIN_TIMED_SECONDS", kind: "const" },
  // An arrow bound to a const, not a function declaration.
  { name: "toLocalISO", kind: "const" },
  "weekStartFor",
  "shiftDays",
  "isTimedLog",
  "timedSessions",
  "formatTrainedTime",
  "trainingTotals",
]);

const MIN = H.MIN_TIMED_SECONDS;
const log = (date, timedSeconds, extra = {}) => ({ date, timedSeconds, duration: 60, ...extra });

// ---------- the format ----------

test("minutes alone below an hour", () => {
  assert.equal(H.formatTrainedTime(0), "0m");
  assert.equal(H.formatTrainedTime(60), "1m");
  assert.equal(H.formatTrainedTime(45 * 60), "45m");
});

test("hours and minutes above one", () => {
  assert.equal(H.formatTrainedTime(3600), "1h");
  assert.equal(H.formatTrainedTime(3600 + 20 * 60), "1h 20m");
  assert.equal(H.formatTrainedTime(41 * 3600 + 7 * 60), "41h 7m");
});

test("a year of training does not come out as a stopwatch reading", () => {
  // formatClock would render this as 41:07:12, which is not how anybody says
  // forty-one hours.
  const out = H.formatTrainedTime(41 * 3600 + 7 * 60 + 12);
  assert.ok(!/:/.test(out), `reads as a stopwatch: ${out}`);
});

test("rounding up to sixty minutes becomes the next hour", () => {
  // 3h 59m 40s rounds the minutes to 60, which must not print as "3h 60m".
  assert.equal(H.formatTrainedTime(3 * 3600 + 59 * 60 + 40), "4h");
});

test("rubbish in does not print rubbish out", () => {
  assert.equal(H.formatTrainedTime(null), "0m");
  assert.equal(H.formatTrainedTime(undefined), "0m");
  assert.equal(H.formatTrainedTime(-500), "0m");
  assert.equal(H.formatTrainedTime("nonsense"), "0m");
});

// ---------- the totals ----------

const TODAY = "2026-06-17";          // a Wednesday
const WEEK_START = H.weekStartFor(TODAY);

test("the week runs Monday to Sunday around today", () => {
  assert.equal(WEEK_START, "2026-06-15");
  assert.equal(H.shiftDays(WEEK_START, 6), "2026-06-21");
});

test("a session counts in every window that contains it", () => {
  const t = H.trainingTotals([log(TODAY, 3600)], TODAY);
  assert.equal(t.week.seconds, 3600);
  assert.equal(t.month.seconds, 3600);
  assert.equal(t.year.seconds, 3600);
  assert.equal(t.all.seconds, 3600);
});

test("last week is in the month and the year but not the week", () => {
  const t = H.trainingTotals([log("2026-06-10", 1800)], TODAY);
  assert.equal(t.week.seconds, 0, "a session from last week is being counted as this week");
  assert.equal(t.month.seconds, 1800);
  assert.equal(t.year.seconds, 1800);
});

test("last month is in the year but not the month", () => {
  const t = H.trainingTotals([log("2026-05-20", 1800)], TODAY);
  assert.equal(t.month.seconds, 0, "May is being counted into June");
  assert.equal(t.year.seconds, 1800);
});

test("the same month a year ago is not this month", () => {
  // Comparing only the month digits would fold every June that ever happened
  // into this one. The year has to be part of the test.
  const t = H.trainingTotals([log("2025-06-17", 1800)], TODAY);
  assert.equal(t.month.seconds, 0, "June 2025 is being counted into June 2026");
  assert.equal(t.year.seconds, 0);
  assert.equal(t.all.seconds, 1800);
});

test("the same week a year ago is not this week", () => {
  const t = H.trainingTotals([log("2025-06-18", 1800)], TODAY);
  assert.equal(t.week.seconds, 0);
});

test("last year is in all time but not this year", () => {
  const t = H.trainingTotals([log("2025-12-30", 1800)], TODAY);
  assert.equal(t.year.seconds, 0, "December 2025 is being counted into 2026");
  assert.equal(t.all.seconds, 1800);
});

test("a session on the last day of the week still counts in it", () => {
  const t = H.trainingTotals([log("2026-06-21", 1200)], TODAY);
  assert.equal(t.week.seconds, 1200, "the Sunday of this week is falling outside it");
});

test("a session the day after the week does not", () => {
  const t = H.trainingTotals([log("2026-06-22", 1200)], TODAY);
  assert.equal(t.week.seconds, 0);
});

test("several sessions add up", () => {
  const t = H.trainingTotals(
    [log(TODAY, 3600), log("2026-06-16", 1800), log("2026-06-15", 900)], TODAY);
  assert.equal(t.week.seconds, 6300);
  assert.equal(t.week.sessions, 3);
});

// ---------- the honesty of the number ----------

test("an untimed session never contributes time", () => {
  // This is the whole point. `duration` is sitting right there on the log and
  // adding it would make the year total mostly idle screen time.
  const t = H.trainingTotals([log(TODAY, null, { duration: 90 })], TODAY);
  assert.equal(t.all.seconds, 0, "untimed session time leaked into the total");
  assert.equal(t.all.sessions, 0);
});

test("untimed sessions are counted and reported, not silently dropped", () => {
  const t = H.trainingTotals(
    [log(TODAY, 3600), log(TODAY, null), log("2026-06-16", null)], TODAY);
  assert.equal(t.all.seconds, 3600);
  assert.equal(t.untimed, 2, "the athlete is never told what the figure leaves out");
});

test("a stopwatch reading too short to be real is not counted", () => {
  const t = H.trainingTotals([log(TODAY, Math.max(0, MIN - 1))], TODAY);
  assert.equal(t.all.sessions, 0, "a mis-tap on the timer counts as a session");
});

test("no logs at all is zero rather than a crash", () => {
  for (const input of [[], null, undefined]) {
    const t = H.trainingTotals(input, TODAY);
    assert.equal(t.all.seconds, 0);
    assert.equal(t.all.sessions, 0);
    assert.equal(t.untimed, 0);
  }
});

test("a log with no date does not land in a window by accident", () => {
  const t = H.trainingTotals([{ date: null, timedSeconds: 3600 }], TODAY);
  assert.equal(t.week.seconds, 0);
  assert.equal(t.month.seconds, 0);
  assert.equal(t.year.seconds, 0);
  assert.equal(t.all.seconds, 3600, "all time should still hold it");
});

// ---------- the wiring ----------

test("the screen-open total is no longer presented as time trained", () => {
  assert.ok(!/label="All Time" value=\{totalMinutes\}/.test(src),
    "the tile built from `duration` is back, labelled as time trained");
  assert.ok(!/const totalMinutes =/.test(src), "the misleading total is still being computed");
});

test("the totals panel is on the profile", () => {
  const at = src.indexOf("function AthleteProfile");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/<TrainingTotalsPanel logs=\{state\.workoutLogs\} \/>/.test(body),
    "the panel exists but nothing renders it");
});

test("the panel reads the stopwatch, not the screen timer", () => {
  const at = src.indexOf("function trainingTotals");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/timedSessions\(logs\)/.test(body), "it no longer filters to timed sessions");
  assert.ok(!/\.duration/.test(body), "`duration` is being summed again");
});

// ---------- the role card ----------

test("the solo role is called Solo training", () => {
  assert.ok(/roleCard\("athlete", Zap, C\.olive, "Solo training"/.test(src),
    "the role picker still says Self-guided athlete");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
