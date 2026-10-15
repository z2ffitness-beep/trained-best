// Levels, perfect-week streaks and the thirteen badges.
//
// None of this is stored. A stored level or badge list is a second copy of
// the truth, and the moment the two disagree the athlete is the one who finds
// out: a badge that vanishes, a level that goes backwards after a coach edits
// a programme. So it is all derived from the logs, every time, and these
// tests are what make that safe to do.
//
// The failure mode worth most of the attention here is the generous one.
// Handing out a Perfect Week that was not perfect, or a hundred-session badge
// at sixty, is worse than withholding one: the first time an athlete notices,
// every other number on the screen stops being worth reading.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  { name: "LB_PER_KG", kind: "const" },
  "convertWeight", "wasLifted",
  { name: "TYPO_MULTIPLE", kind: "const" },
  "looksLikeTypo", "beatsBest",
  { name: "COUNTS_THRESHOLD", kind: "const" },
  "sessionCounts", "logCounts",
  { name: "toLocalISO", kind: "const" },
  "weekStartFor", "shiftDays", "perfectWeeks",
  { name: "WEEKDAY_ORDER", kind: "const" },
  "daysBetweenISO", "absoluteProgramWeek", "programWeekFor",
  { name: "WORKOUTS_PER_LEVEL", kind: "const" },
  "levelFor", "leveledUp", "perfectWeekStreak",
  "hasNewBest", "hasCaughtUp",
  { name: "BADGES", kind: "const" },
  "badgesEarned", "newlyEarnedBadges",
]);

const src = readSource(APP);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const log = (date, done = 12, asked = 12, extra = {}) =>
  ({ date, setsCompleted: done, setsPrescribed: asked, exercises: [], ...extra });
const set = (n, weight, reps, unit = "lb") =>
  ({ set: n, done: true, weight, unit: weight == null ? null : unit, reps });
const lifted = (date, name, sets, extra = {}) =>
  ({ date, setsCompleted: sets.length, setsPrescribed: sets.length, exercises: [{ name, sets }], ...extra });

// Monday-anchored weeks. 2026-06-01 is a Monday.
const MON = (n) => H.shiftDays("2026-06-01", (n - 1) * 7);

// ---------- levels ----------

test("an athlete starts at level 1, not level 0", () => {
  // Zero would mean the number before the first session is the same as the
  // number after it, which makes the first session feel like it did nothing.
  const l = H.levelFor([]);
  assert.equal(l.level, 1);
  assert.equal(l.counted, 0);
  assert.equal(l.toNext, H.WORKOUTS_PER_LEVEL);
  assert.equal(l.progress, 0);
});

test("one level every five counted sessions", () => {
  assert.equal(H.WORKOUTS_PER_LEVEL, 5);
  const five = Array.from({ length: 5 }, (_, i) => log(MON(i + 1)));
  assert.equal(H.levelFor(five).level, 2);
  assert.equal(H.levelFor(five).into, 0);
  assert.equal(H.levelFor(five).toNext, 5, "standing exactly on a level says zero to the next one");
  assert.equal(H.levelFor([...five, log("2026-07-06")]).level, 2);
  assert.equal(H.levelFor(Array.from({ length: 10 }, (_, i) => log(MON(i + 1)))).level, 3);
});

test("part sessions do not move the level", () => {
  const logs = [log(MON(1)), log(MON(2), 1, 12), log(MON(3), 1, 12)];
  assert.equal(H.levelFor(logs).counted, 1);
  assert.equal(H.levelFor(logs).level, 1);
});

test("the bar fills across the level rather than across all time", () => {
  const three = Array.from({ length: 3 }, (_, i) => log(MON(i + 1)));
  assert.equal(H.levelFor(three).progress, 0.6);
  const eight = Array.from({ length: 8 }, (_, i) => log(MON(i + 1)));
  assert.equal(H.levelFor(eight).progress, 0.6, "the bar did not reset at the level boundary");
});

test("levelling up is worked out from before and after, not from a stored number", () => {
  assert.equal(H.leveledUp(4, 5), true);
  assert.equal(H.leveledUp(3, 4), false);
  assert.equal(H.leveledUp(9, 10), true);
  assert.equal(H.leveledUp(5, 5), false, "a session that did not count announced a level-up");
});

// ---------- perfect-week streaks ----------

// Three sessions a week. A "full" week is three counted sessions in it.
const fullWeek = (weekNo) => [
  log(H.shiftDays(MON(weekNo), 0)),
  log(H.shiftDays(MON(weekNo), 2)),
  log(H.shiftDays(MON(weekNo), 4)),
];
const shortWeek = (weekNo) => [log(H.shiftDays(MON(weekNo), 0))];

// "Today" is in week 5, so weeks 1 to 4 are finished.
const TODAY = H.shiftDays(MON(5), 2);

test("consecutive full weeks are a streak", () => {
  const logs = [...fullWeek(1), ...fullWeek(2), ...fullWeek(3), ...fullWeek(4)];
  assert.equal(H.perfectWeekStreak(logs, 3, TODAY).weeks, 4);
});

test("the week in progress cannot break a streak", () => {
  // A Tuesday is not a failed week. A number that drops to zero every Monday
  // and climbs back by Sunday is an anxiety generator, not a streak.
  const logs = [...fullWeek(3), ...fullWeek(4), log(H.shiftDays(MON(5), 0))];
  assert.equal(H.perfectWeekStreak(logs, 3, TODAY).weeks, 2);
});

test("a short week is covered by that month's shield, and bridges the run", () => {
  // Weeks 1 to 4 are all in June 2026, so there is one shield between them.
  const logs = [...fullWeek(1), ...fullWeek(2), ...shortWeek(3), ...fullWeek(4)];
  const out = H.perfectWeekStreak(logs, 3, TODAY);
  assert.equal(out.weeks, 3, "the shielded week was counted as perfect, or broke the run");
  assert.deepEqual(out.shieldsUsed, [MON(3)]);
});

test("a second short week in the same month ends it", () => {
  const logs = [...fullWeek(1), ...shortWeek(2), ...shortWeek(3), ...fullWeek(4)];
  const out = H.perfectWeekStreak(logs, 3, TODAY);
  assert.equal(out.weeks, 1, "two short weeks in one month were both forgiven");
  assert.equal(out.shieldsUsed.length, 1);
});

test("a shielded week does not count itself as a perfect week", () => {
  // Saying otherwise is a lie about their training, and the number is only
  // worth anything because it is not.
  const logs = [...fullWeek(1), ...shortWeek(2), ...fullWeek(3), ...fullWeek(4)];
  assert.equal(H.perfectWeekStreak(logs, 3, TODAY).weeks, 3);
});

test("the walk back stops at the first week there is any history for", () => {
  // Without a floor it walks backwards for ever through weeks that never
  // existed, handing out a shield in each new month as it goes.
  const logs = [...fullWeek(4)];
  const out = H.perfectWeekStreak(logs, 3, TODAY);
  assert.equal(out.weeks, 1);
  assert.equal(out.shieldsUsed.length, 0);
});

test("no history, or no schedule, is a streak of zero rather than a crash", () => {
  assert.deepEqual(H.perfectWeekStreak([], 3, TODAY), { weeks: 0, shieldsUsed: [] });
  assert.deepEqual(H.perfectWeekStreak(fullWeek(1), 0, TODAY), { weeks: 0, shieldsUsed: [] });
  assert.deepEqual(H.perfectWeekStreak(fullWeek(1), null, TODAY), { weeks: 0, shieldsUsed: [] });
  assert.deepEqual(H.perfectWeekStreak(fullWeek(1), 3, null), { weeks: 0, shieldsUsed: [] });
});

test("a part session does not fill a slot in a perfect week", () => {
  const logs = [
    log(H.shiftDays(MON(4), 0)),
    log(H.shiftDays(MON(4), 2)),
    log(H.shiftDays(MON(4), 4), 1, 12),   // turned up, did one set
  ];
  assert.equal(H.perfectWeekStreak(logs, 3, TODAY).weeks, 0,
    "a week was called perfect on the back of a one-set Friday");
});

// ---------- new bests ----------

test("beating your own heaviest set is a new best", () => {
  const logs = [
    lifted("2026-06-01", "Back Squat", [set(1, 225, 5)]),
    lifted("2026-06-08", "Back Squat", [set(1, 235, 5)]),
  ];
  assert.equal(H.hasNewBest(logs), true);
});

test("a first ever session is not a new best", () => {
  // There is nothing behind it to beat, and treating it as one means every
  // athlete's first week is a wall of confetti that means nothing.
  assert.equal(H.hasNewBest([lifted("2026-06-01", "Back Squat", [set(1, 225, 5)])]), false);
});

test("repeating the same weight is not a new best", () => {
  const logs = [
    lifted("2026-06-01", "Back Squat", [set(1, 225, 5)]),
    lifted("2026-06-08", "Back Squat", [set(1, 225, 5)]),
  ];
  assert.equal(H.hasNewBest(logs), false);
});

test("the same weight for more reps is", () => {
  const logs = [
    lifted("2026-06-01", "Back Squat", [set(1, 225, 5)]),
    lifted("2026-06-08", "Back Squat", [set(1, 225, 8)]),
  ];
  assert.equal(H.hasNewBest(logs), true);
});

test("sessions are read oldest first, whatever order they arrive in", () => {
  // The app holds logs newest-first. Walking them in that order means every
  // athlete's oldest session looks like a personal best.
  const logs = [
    lifted("2026-06-08", "Back Squat", [set(1, 225, 5)]),
    lifted("2026-06-01", "Back Squat", [set(1, 235, 5)]),
  ];
  assert.equal(H.hasNewBest(logs), false, "a lighter later session was read as beating a heavier earlier one");
});

test("a mistyped weight is not a new best", () => {
  const logs = [
    lifted("2026-06-01", "Back Squat", [set(1, 135, 5), set(2, 135, 5)]),
    lifted("2026-06-08", "Back Squat", [set(1, 135, 5), set(2, 135, 5), set(3, 1350, 5)]),
  ];
  assert.equal(H.hasNewBest(logs), false,
    "a 1350 where 135 was meant handed out a New Best badge and reset the bar for the block");
});

test("units are reconciled before anything is compared", () => {
  const logs = [
    lifted("2026-06-01", "Back Squat", [set(1, 225, 5)]),
    lifted("2026-06-08", "Back Squat", [set(1, 100, 5, "kg")]),   // 220 lb, lighter
  ];
  assert.equal(H.hasNewBest(logs), false, "100 kg was read as lighter... or heavier... than it is");
  const up = [
    lifted("2026-06-01", "Back Squat", [set(1, 225, 5)]),
    lifted("2026-06-08", "Back Squat", [set(1, 110, 5, "kg")]),   // 242 lb
  ];
  assert.equal(H.hasNewBest(up), true);
});

test("a reps-only movement never produces a best", () => {
  const logs = [
    lifted("2026-06-01", "Push-Up", [{ set: 1, done: true, weight: null, unit: null, reps: 20 }]),
    lifted("2026-06-08", "Push-Up", [{ set: 1, done: true, weight: null, unit: null, reps: 40 }]),
  ];
  assert.equal(H.hasNewBest(logs), false);
});

test("each movement is judged against itself", () => {
  const logs = [
    lifted("2026-06-01", "Back Squat", [set(1, 315, 5)]),
    lifted("2026-06-08", "Bench Press", [set(1, 135, 5)]),
  ];
  assert.equal(H.hasNewBest(logs), false, "a first bench press beat a squat");
});

// ---------- caught up ----------

const program = { id: "p1", weeks: 8, startedOn: MON(1), days: [
  { id: "d1", name: "Day 1 — Lower", weekday: "Monday" },
  { id: "d2", name: "Day 2 — Upper", weekday: "Wednesday" },
] };

test("a session trained later in the week than it was planned for counts", () => {
  // Wednesday's session, done on Friday.
  const logs = [log(H.shiftDays(MON(2), 4), 12, 12, { programDay: "Day 2 — Upper" })];
  assert.equal(H.hasCaughtUp(logs, program), true);
});

test("training early is being ahead, not catching up", () => {
  const logs = [log(H.shiftDays(MON(2), 1), 12, 12, { programDay: "Day 2 — Upper" })];
  assert.equal(H.hasCaughtUp(logs, program), false);
});

test("on the day is neither", () => {
  const logs = [log(H.shiftDays(MON(2), 2), 12, 12, { programDay: "Day 2 — Upper" })];
  assert.equal(H.hasCaughtUp(logs, program), false);
});

test("a part session does not earn it", () => {
  const logs = [log(H.shiftDays(MON(2), 4), 1, 12, { programDay: "Day 2 — Upper" })];
  assert.equal(H.hasCaughtUp(logs, program), false);
});

test("a session whose day is no longer in the programme is skipped, not crashed on", () => {
  const logs = [log(H.shiftDays(MON(2), 4), 12, 12, { programDay: "Day 9 — Deleted" })];
  assert.equal(H.hasCaughtUp(logs, program), false);
  assert.equal(H.hasCaughtUp(logs, null), false);
  assert.equal(H.hasCaughtUp([{ date: null }], program), false);
});

// ---------- the wall ----------

const opts = { sessionsPerWeek: 3, program, todayIso: TODAY };

test("there are thirteen badges and every key is distinct", () => {
  assert.equal(H.BADGES.length, 13);
  assert.equal(new Set(H.BADGES.map(b => b.key)).size, 13);
  for (const b of H.BADGES) {
    assert.ok(b.name && b.hint, `${b.key} has no name or no hint`);
  }
});

test("every badge says how to get it, in a sentence", () => {
  // A locked badge with no explanation is a tease. Each hint has to be an
  // instruction, not a label.
  for (const b of H.BADGES) {
    assert.ok(b.hint.split(" ").length >= 3, `${b.key}'s hint is not a sentence: ${b.hint}`);
  }
});

test("nothing is earned before the first session", () => {
  assert.equal(H.badgesEarned([], opts).size, 0);
  assert.equal(H.badgesEarned(null, opts).size, 0);
});

test("the first counted session earns the first badge", () => {
  const earned = H.badgesEarned([log(MON(1), 12, 12, { programDay: "Day 1 — Lower" })], opts);
  assert.ok(earned.has("first"));
  assert.ok(earned.has("week1"), "a session in week 1 of the programme did not earn Week One");
  assert.ok(earned.has("everyset"), "every prescribed set was ticked and Every Set was not earned");
});

test("a part session earns nothing at all", () => {
  const earned = H.badgesEarned([log(MON(1), 1, 12)], opts);
  assert.equal(earned.has("first"), false);
  assert.equal(earned.has("everyset"), false);
});

test("milestones count only sessions that counted", () => {
  // A wall that counts part sessions says "100 sessions" to someone who has
  // done sixty, and the first time they notice, every number stops being
  // worth reading.
  const ten = Array.from({ length: 10 }, (_, i) => log(H.shiftDays(MON(1), i * 2)));
  assert.ok(H.badgesEarned(ten, opts).has("w10"));
  const nineAndAPart = [...ten.slice(0, 9), log(H.shiftDays(MON(1), 20), 1, 12)];
  assert.equal(H.badgesEarned(nineAndAPart, opts).has("w10"), false);
});

test("a session with nothing prescribed does not hand out Every Set", () => {
  // An extra workout the athlete added themselves. Five sets done against
  // nothing asked for passes "did everything that was asked" on the
  // arithmetic, and it has not earned the badge for it.
  assert.equal(H.badgesEarned([log(MON(1), 5, 0)], opts).has("everyset"), false);
  assert.ok(H.badgesEarned([log(MON(1), 5, 0)], opts).has("first"),
    "the extra session stopped counting as a session at all");
});

test("the Perfect Week badge needs an actual perfect week", () => {
  assert.equal(H.badgesEarned(fullWeek(1).slice(0, 2), opts).has("perfect"), false);
  assert.ok(H.badgesEarned(fullWeek(1), opts).has("perfect"));
});

test("the wall is in a fixed order so it does not reshuffle as it fills", () => {
  const keys = H.BADGES.map(b => b.key);
  assert.deepEqual(keys.slice(0, 6), ["first", "week1", "perfect", "caughtup", "everyset", "newbest"]);
  const counts = H.BADGES.filter(b => b.count).map(b => b.count);
  assert.deepEqual(counts, [...counts].sort((a, b) => a - b), "the milestones are out of order");
});

// ---------- what this session just earned ----------

test("only what is new is announced", () => {
  const before = [log(MON(1), 12, 12, { programDay: "Day 1 — Lower" })];
  const after = [...before, log(H.shiftDays(MON(1), 2), 12, 12, { programDay: "Day 2 — Upper" })];
  const fresh = H.newlyEarnedBadges(before, after, opts);
  assert.equal(fresh.some(b => b.key === "first"), false,
    "the First Workout badge was announced a second time");
});

test("a session that earns nothing announces nothing", () => {
  const before = Array.from({ length: 3 }, (_, i) => log(H.shiftDays(MON(1), i * 2)));
  const after = [...before, log(H.shiftDays(MON(1), 6))];
  assert.deepEqual(H.newlyEarnedBadges(before, after, opts), []);
});

test("a session that earns several announces them in wall order", () => {
  const before = Array.from({ length: 9 }, (_, i) => log(H.shiftDays(MON(1), i * 2)));
  const after = [...before, log(H.shiftDays(MON(1), 18))];
  const fresh = H.newlyEarnedBadges(before, after, opts);
  const order = H.BADGES.map(b => b.key);
  const indices = fresh.map(b => order.indexOf(b.key));
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
  assert.ok(fresh.some(b => b.key === "w10"));
});

test("it is the same code that fills the wall, not a second set of rules", () => {
  // Two implementations of "has this badge" is how a badge gets awarded on
  // the rewards screen and is missing from the wall a minute later.
  const at = src.indexOf("function newlyEarnedBadges");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok((body.match(/badgesEarned\(/g) || []).length === 2,
    "newlyEarnedBadges no longer works by running badgesEarned twice");
});

// ---------- none of it is stored ----------

test("no level, badge or streak column is written to the database", () => {
  // Derived every time, on purpose. A stored copy is a second truth, and when
  // the two disagree it is the athlete who finds out.
  for (const column of ["level:", "badges:", "badge_keys", "perfect_weeks"]) {
    assert.ok(!new RegExp(`update\\(\\{[^}]*${column}`).test(src),
      `${column} is being written to a profile row`);
  }
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
