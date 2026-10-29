// The points an athlete earns for a session.
//
// The rule, in one line: ten for turning up, up to fifteen for doing the sets
// that were prescribed, twenty-five for a week where every scheduled session
// got done.
//
// What these tests mostly guard is what the score must NOT do. A score that
// rises with weight or volume tells an athlete to ignore a deload — the one
// week of a block that most needs obeying — and to treat the prescription as a
// floor. So beating the plan earns nothing extra, and a light week scores full
// marks when it was followed. If that ever changes, the programme stops being
// the thing the app rewards.
//
// Points are also a promise. Once an athlete has a score, changing how it is
// calculated reads as taking something away, so the arithmetic here is pinned
// deliberately tightly.
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
  { name: "POINTS", kind: "const" },
  { name: "toLocalISO", kind: "const" },
  "weekStartFor",
  "shiftDays",
  "sessionPoints",
  { name: "COUNTS_THRESHOLD", kind: "const" },
  "sessionCounts", "logCounts", "computeStreak",
  "perfectWeeks",
  "pointsTotals",
]);

const P = H.POINTS;
const MAX = P.session + P.compliance;
const log = (date, setsCompleted, setsPrescribed) => ({ date, setsCompleted, setsPrescribed });

const TODAY = "2026-06-17";          // Wednesday
const WEEK = H.weekStartFor(TODAY);  // 2026-06-15

// ---------- one session ----------

test("a session done exactly as prescribed scores the maximum", () => {
  assert.equal(H.sessionPoints(log(TODAY, 12, 12)), MAX);
});

test("turning up and doing nothing still scores the turning-up part", () => {
  // The base is for showing up. An athlete who walked in, managed none of it
  // and logged it honestly should not be scored the same as one who stayed home.
  assert.equal(H.sessionPoints(log(TODAY, 0, 12)), P.session);
});

test("half the sets scores half the compliance share", () => {
  assert.equal(H.sessionPoints(log(TODAY, 6, 12)), P.session + Math.round(P.compliance / 2));
});

test("beating the prescription earns nothing extra", () => {
  // The whole argument for this scheme. Extra credit for volume is an
  // instruction to ignore the deload.
  assert.equal(H.sessionPoints(log(TODAY, 24, 12)), MAX);
  assert.equal(H.sessionPoints(log(TODAY, 1000, 12)), MAX);
});

test("a light week followed properly scores the same as a heavy one", () => {
  // A deload prescribes fewer sets. Doing all of them is a perfect session.
  const deload = H.sessionPoints(log(TODAY, 6, 6));
  const heavy = H.sessionPoints(log(TODAY, 18, 18));
  assert.equal(deload, heavy, "the deload week scores less than the hard week");
});

test("a session with nothing prescribed is not punished for it", () => {
  // A mobility day or a walk cannot be under-completed.
  assert.equal(H.sessionPoints(log(TODAY, 0, 0)), MAX);
  assert.equal(H.sessionPoints(log(TODAY, null, null)), MAX);
  assert.equal(H.sessionPoints({ date: TODAY }), MAX);
});

test("rubbish in a log cannot produce a negative or absurd score", () => {
  for (const l of [log(TODAY, -5, 12), log(TODAY, "x", 12), log(TODAY, 5, -1), log(TODAY, 5, "x")]) {
    const pts = H.sessionPoints(l);
    assert.ok(pts >= P.session && pts <= MAX, `scored ${pts} for ${JSON.stringify(l)}`);
  }
});

test("no log is worth nothing", () => {
  assert.equal(H.sessionPoints(null), 0);
  assert.equal(H.sessionPoints(undefined), 0);
});

// ---------- the perfect week ----------

test("doing every scheduled session earns the week", () => {
  const logs = [log(WEEK, 10, 10), log("2026-06-17", 10, 10), log("2026-06-19", 10, 10)];
  assert.deepEqual(H.perfectWeeks(logs, 3), [WEEK]);
});

test("one short of the schedule earns nothing", () => {
  const logs = [log(WEEK, 10, 10), log("2026-06-17", 10, 10)];
  assert.deepEqual(H.perfectWeeks(logs, 3), []);
});

test("extra sessions do not earn the week twice", () => {
  const logs = [log(WEEK, 10, 10), log("2026-06-16", 10, 10), log("2026-06-17", 10, 10), log("2026-06-18", 10, 10)];
  assert.deepEqual(H.perfectWeeks(logs, 3), [WEEK], "a fourth session minted a second bonus");
});

test("sessions spread across two weeks do not add up to one perfect week", () => {
  const logs = [log("2026-06-13", 10, 10), log("2026-06-14", 10, 10), log(WEEK, 10, 10)];
  assert.deepEqual(H.perfectWeeks(logs, 3), [], "two weeks were pooled into one");
});

test("no programme means no bonus rather than a free one", () => {
  const logs = [log(TODAY, 10, 10)];
  assert.deepEqual(H.perfectWeeks(logs, 0), []);
  assert.deepEqual(H.perfectWeeks(logs, null), []);
  assert.deepEqual(H.perfectWeeks(logs, undefined), []);
});

test("a log with no date cannot earn a week", () => {
  assert.deepEqual(H.perfectWeeks([{ date: null, setsCompleted: 5, setsPrescribed: 5 }], 1), []);
});

// ---------- the totals ----------

test("one perfect session this week", () => {
  const t = H.pointsTotals([log(TODAY, 10, 10)], 3, TODAY);
  assert.equal(t.week.points, MAX);
  assert.equal(t.week.sessions, 1);
  assert.equal(t.week.bonuses, 0);
});

test("a full week adds the bonus on top of the sessions", () => {
  const logs = [log(WEEK, 10, 10), log("2026-06-17", 10, 10), log("2026-06-19", 10, 10)];
  const t = H.pointsTotals(logs, 3, TODAY);
  assert.equal(t.week.bonuses, 1);
  assert.equal(t.week.points, MAX * 3 + P.perfectWeek);
});

test("the bonus lands in the same month and year as the sessions", () => {
  const logs = [log(WEEK, 10, 10), log("2026-06-17", 10, 10), log("2026-06-19", 10, 10)];
  const t = H.pointsTotals(logs, 3, TODAY);
  assert.equal(t.month.bonuses, 1);
  assert.equal(t.year.bonuses, 1);
  assert.equal(t.all.bonuses, 1);
});

test("last week's sessions are outside this week but inside the month", () => {
  const t = H.pointsTotals([log("2026-06-10", 10, 10)], 3, TODAY);
  assert.equal(t.week.points, 0);
  assert.equal(t.month.points, MAX);
});

test("the same month a year earlier is not this month", () => {
  const t = H.pointsTotals([log("2025-06-17", 10, 10)], 3, TODAY);
  assert.equal(t.month.points, 0, "June 2025 is being counted into June 2026");
  assert.equal(t.year.points, 0);
  assert.equal(t.all.points, MAX);
});

test("no logs is zero everywhere rather than a crash", () => {
  for (const input of [[], null, undefined]) {
    const t = H.pointsTotals(input, 3, TODAY);
    for (const window of ["week", "month", "year", "all"]) {
      assert.equal(t[window].points, 0);
      assert.equal(t[window].sessions, 0);
    }
  }
});

test("all time holds everything, including a log with no date", () => {
  const t = H.pointsTotals([log(TODAY, 10, 10), { date: null, setsCompleted: 5, setsPrescribed: 5 }], 3, TODAY);
  assert.equal(t.all.sessions, 2);
});

// ---------- the wiring ----------

test("the score is shown where it was earned", () => {
  // One finish screen since 28 Oct: the rewards screen, which counts the
  // points up, fed from what the save path recorded.
  const at = src.indexOf("function RewardsScreen(");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/\+\{climbing\}/.test(body), "the earned score is never shown");
  assert.ok(/points: sessionPoints\(loggedRow\)/.test(src), "the score is not worked out from the logged session");
  assert.ok(/points=\{r\.points \|\| 0\}/.test(src), "the finish screen is not handed the score");
});

test("the totals are on the profile with a real weekly target", () => {
  const at = src.indexOf("function AthleteProfile");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/<PointsPanel logs=\{state\.workoutLogs\} sessionsPerWeek=\{pointsPerWeekTarget\} \/>/.test(body),
    "the panel is missing, or not told how long a week is");
  assert.ok(/pointsProgram\?\.days\?\.length \|\| 0/.test(body),
    "the weekly target no longer comes from the programme");
});

test("the rule is explained on screen, not just in the code", () => {
  const at = src.indexOf("function PointsPanel");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/for finishing a session/.test(body), "nothing tells the athlete how the score works");
  assert.ok(/does not score extra/.test(body),
    "the one thing athletes will try to game is left unstated");
});

// ---------- the half-the-sets line, and which side of it each thing sits ----------
//
// The spec says a workout counts toward streak, level, points and badges only
// if at least half its sets are ticked. The app already scored short sessions,
// and the two were reconciled deliberately rather than by overwriting one with
// the other: points stay as they were, streak and the perfect-week bonus
// follow the spec.
//
// The reasoning, so it is not quietly undone later. A score of zero for an
// honest four-of-twelve session teaches two things, and both are bad: stay
// home, or tick sets you did not do. A STREAK is a different promise - its
// only value is what it means, and a number a two-set session keeps alive
// means nothing.

test("an honest short session still scores the turning-up part", () => {
  assert.equal(H.sessionPoints(log(TODAY, 2, 12)), P.session + Math.round(P.compliance * 2 / 12));
  assert.ok(H.sessionPoints(log(TODAY, 2, 12)) > 0,
    "a part session scores nothing, which teaches people not to log one");
});

test("but it does not extend the streak", () => {
  // Trained Monday and Tuesday properly, two sets on Wednesday.
  const logs = [log("2026-06-15", 12, 12), log("2026-06-16", 12, 12)];
  assert.equal(H.computeStreak(logs, "2026-06-17", false), 2,
    "a part session extended the streak to three");
  assert.equal(H.computeStreak(logs, "2026-06-17", true), 3,
    "a full session today failed to extend it");
});

test("a part session in the middle breaks the run rather than bridging it", () => {
  const logs = [
    log("2026-06-15", 12, 12),
    log("2026-06-16", 1, 12),   // the part session
    log("2026-06-17", 12, 12),
  ];
  assert.equal(H.computeStreak(logs, "2026-06-17", true), 1,
    "Tuesday's two sets held a streak together across a day that did not count");
});

test("a stored flag overrides the arithmetic, both ways", () => {
  // A coach editing the programme afterwards must not retroactively take away
  // a streak somebody earned, which is why the flag is stored at all.
  const logs = [{ date: "2026-06-15", setsCompleted: 1, setsPrescribed: 12, counts: true }];
  assert.equal(H.computeStreak(logs, "2026-06-16", false), 1,
    "the stored flag was ignored in favour of recomputing it");
  const other = [{ date: "2026-06-15", setsCompleted: 12, setsPrescribed: 12, counts: false }];
  assert.equal(H.computeStreak(other, "2026-06-16", false), 0);
});

test("logCounts reads a database row and the app's own copy alike", () => {
  // Two shapes of the same thing. A helper that knew only one would answer
  // "no" for the other, which here means silently wiping out a streak.
  assert.equal(H.logCounts({ sets_completed: 6, sets_prescribed: 12 }), true);
  assert.equal(H.logCounts({ setsCompleted: 6, setsPrescribed: 12 }), true);
  assert.equal(H.logCounts({ setsCompleted: 5, setsPrescribed: 12 }), false);
});

test("a part session costs the week its perfect-week bonus", () => {
  const logs = [log("2026-06-15", 12, 12), log("2026-06-16", 12, 12), log("2026-06-17", 2, 12)];
  assert.deepEqual(H.perfectWeeks(logs, 3), [],
    "three sessions counted as a perfect week when one of them was two sets");
  const proper = [log("2026-06-15", 12, 12), log("2026-06-16", 12, 12), log("2026-06-17", 6, 12)];
  assert.deepEqual(H.perfectWeeks(proper, 3), [WEEK],
    "exactly half the sets failed to count, so the bar is really more than half");
});

test("the short session still shows up in the week's points", () => {
  // It loses the bonus, not the session. Dropping it from the tally would
  // make a week with a short day look like a week with a missed day.
  const logs = [log("2026-06-15", 12, 12), log("2026-06-16", 2, 12)];
  const totals = H.pointsTotals(logs, 3, TODAY);
  assert.equal(totals.week.sessions, 2);
  assert.ok(totals.week.points > MAX, "the part session scored nothing at all");
  assert.equal(totals.week.bonuses, 0);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
