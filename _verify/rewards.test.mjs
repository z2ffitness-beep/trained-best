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

// ---------- the screen it all lands on ----------

const screen = (() => {
  const at = src.indexOf("function RewardsScreen(");
  assert.ok(at > 0, "the rewards screen is gone");
  return src.slice(at, src.indexOf("\nfunction SessionLoggedScreen", at));
})();

test("the sequence is in the order the design asks for", () => {
  const order = ["medal", "points", "perfect", "level", "badges", "bests"];
  const at = screen.indexOf("const sections = useMemo");
  const list = screen.slice(at, screen.indexOf("), [", at));
  let cursor = 0;
  for (const key of order) {
    const found = list.indexOf(`"${key}"`, cursor);
    assert.ok(found > 0, `the ${key} step is missing from the sequence`);
    cursor = found;
  }
});

test("a step with nothing in it is left out, not shown empty", () => {
  // A heading that says "New badges" above a gap is worse than no heading,
  // and waiting a second for it is worse again.
  const at = screen.indexOf("const sections = useMemo");
  const list = screen.slice(at, screen.indexOf("), [", at));
  assert.ok(/points > 0 \? "points" : null/.test(list), "the points step shows for a session that scored none");
  assert.ok(/badges\?\.length \? "badges" : null/.test(list), "the badges step shows with no badges");
  assert.ok(/bests\?\.length \? "bests" : null/.test(list), "the bests step shows with no bests");
  assert.ok(/\.filter\(Boolean\)/.test(list), "the empty steps are not filtered out");
});

test("reduced motion skips the waiting as well as the movement", () => {
  // Two halves of one promise. The stylesheet stops the animation; this stops
  // someone who asked for less motion sitting through six still frames
  // arriving a second apart.
  assert.ok(/const \[still\] = useState\(prefersReducedMotion\)/.test(screen),
    "the screen never asks whether the device wants less movement");
  assert.ok(/useState\(still \? sections\.length : 1\)/.test(screen),
    "reduced motion still steps through the sequence one card at a time");
  assert.ok(/if \(still \|\| shown >= sections\.length\) return;/.test(screen),
    "the timer keeps running under reduced motion");
});

test("confetti is not rendered at all under reduced motion", () => {
  // Rendering it and freezing it leaves eighteen rectangles stuck along the
  // top edge, which is not a quieter version of confetti.
  assert.ok(/\{!still && \(\s*\n\s*<div aria-hidden="true" className="fixed inset-0 overflow-hidden pointer-events-none"/.test(screen),
    "the confetti is rendered regardless, or is not in its own layer");
});

test("the clipping is on the confetti layer, never on the column", () => {
  // Clipping the column is the obvious way to write it and it silently
  // breaks the screen: three badges and two new bests is taller than a
  // phone, and overflow:hidden on the too-tall thing means the athlete
  // cannot reach the button at the bottom of it.
  const at = screen.indexOf('<div className="min-h-screen');
  assert.ok(at > 0, "the rewards column is gone");
  const openingTag = screen.slice(at, screen.indexOf(">", at));
  assert.ok(!/overflow-hidden/.test(openingTag),
    `the rewards column clips its own overflow, so a tall session loses its button: ${openingTag}`);
  assert.ok(/py-10/.test(openingTag), "the column has no breathing room top and bottom");
});

test("there is always a way out, from the first frame", () => {
  // A sequence an athlete cannot leave is a sequence they resent by the
  // third session.
  assert.ok(/\{finished \? "See summary" : "Skip"\}/.test(screen),
    "the button only appears at the end, or never says Skip");
  const at = screen.indexOf("<Btn className=\"mt-8\"");
  assert.ok(at > 0, "the button is gone");
  const before = screen.slice(0, at);
  assert.ok(!/\{finished && \(\s*$/.test(before.trim()), "the button is behind a condition");
});

test("new bests are read in the athlete's own unit", () => {
  assert.ok(/displayWeight\(b\.weightLb, "lb", unit\)/.test(screen),
    "the bests are printed in pounds whatever the athlete reads in");
  assert.ok(/unit=\{weightUnit\}/.test(src), "the screen is never told which unit to use");
});

test("the points number climbs rather than appearing", () => {
  assert.ok(/useCountUp\(points, !still && seen\("points"\)\)/.test(screen),
    "the count-up is gone, or runs before the step it belongs to is visible");
});

test("a session that earned nothing skips the whole sequence", () => {
  // A medal and six seconds of waiting for a blank screen is worse than no
  // sequence at all.
  const at = src.indexOf("setShowRewards(\n      rewards.points");
  assert.ok(at > 0, "nothing decides whether to show the sequence");
  const decision = src.slice(at, src.indexOf(");", at));
  for (const part of ["rewards.points > 0", "rewards.levelUp", "rewards.badges.length > 0", "rewards.bests.length > 0"]) {
    assert.ok(decision.includes(part), `the decision ignores ${part}`);
  }
});

test("the rewards the screen shows are the ones the database recorded", () => {
  // The bests come from the rows that were just written, not from a second
  // pass over the logs, so the medal and the table cannot disagree about
  // which set was the best one.
  assert.ok(/bests: setRows\.filter\(r => r\.is_pr\)/.test(src),
    "the new bests are worked out separately from the rows that were saved");
});

test("the session's own log is built once and reused", () => {
  // The rewards need to ask what the history looks like WITH this session in
  // it. A second hand-written copy of the same shape is how the two end up
  // disagreeing about what was just logged.
  assert.ok(/const loggedRow = \{/.test(src), "the logged row is no longer built as one object");
  assert.ok(/const logsAfter = \[loggedRow, \.\.\.logsBefore\]/.test(src),
    "the rewards are computed against a different list than the one state gets");
  assert.ok(/workoutLogs: \[loggedRow, \.\.\.s\.workoutLogs\]/.test(src),
    "state is given a different object than the rewards were computed from");
});

// ---------- where an athlete reads it afterwards ----------

test("the level panel shows the level, the gap to the next one, and the bar", () => {
  const at = src.indexOf("function LevelPanel(");
  assert.ok(at > 0, "there is no level panel on the profile");
  const panel = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/levelFor\(logs\)/.test(panel), "the panel does not work out the level");
  assert.ok(/\{level\.toNext\}/.test(panel), "it never says how far the next level is");
  assert.ok(/rw-bar/.test(panel), "there is no progress bar");
  assert.ok(/WORKOUTS_PER_LEVEL/.test(panel),
    "the rule is written as a number in prose rather than read from the constant");
});

test("the panel names the weeks a shield covered, not just how many", () => {
  // "One shield used" tells an athlete nothing. The week it covered tells
  // them why the run did not break, which is the only reason it exists.
  const at = src.indexOf("function LevelPanel(");
  const panel = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/shieldsUsed\.map\(week =>/.test(panel), "the shields are counted rather than named");
  assert.ok(/week of \{formatSessionDate\(week, \{ withWeekday: false \}\)/.test(panel),
    "a shielded week is printed as a raw date or with a weekday that means nothing");
});

test("a streak of zero reads as a sentence, not as a bare 0", () => {
  const at = src.indexOf("function LevelPanel(");
  const panel = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/weeks === 0 \? "No perfect weeks in a row yet"/.test(panel),
    "an athlete with no streak is shown a zero with no explanation");
});

test("the wall shows all thirteen, locked ones included", () => {
  // A wall that shows only what has been earned says nothing about what
  // there is to earn, and the hint under a locked badge is the only place
  // the rules are written where an athlete will read them.
  const at = src.indexOf("function BadgeWall(");
  assert.ok(at > 0, "there is no badge wall");
  const wall = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/BADGES\.map\(badge =>/.test(wall), "the wall renders only the earned ones");
  assert.ok(/\{badge\.hint\}/.test(wall), "the hints are not shown, so a locked badge explains nothing");
  assert.ok(/\{earned\.size\} of \{BADGES\.length\}/.test(wall), "the wall does not say how many of how many");
  assert.ok(/opacity: has \? 1 : 0\.72/.test(wall),
    "locked badges are hidden or dimmed to the point of being unreadable");
});

test("the stubbed PR counter is gone rather than switched on over nothing", () => {
  // It read a hard-coded zero behind a feature flag. The wall replaces it.
  assert.ok(!/achievements:/.test(src), "the achievements feature flag is still there");
  assert.ok(!/StatCard icon=\{Award\} label="PRs" value=\{0\}/.test(src),
    "the hard-coded PR counter is still on the profile");
});

test("both panels are actually on the profile, with the programme's week", () => {
  assert.ok(/<LevelPanel logs=\{state\.workoutLogs\} sessionsPerWeek=\{pointsPerWeekTarget\}/.test(src),
    "the level panel is written but never rendered");
  assert.ok(/<BadgeWall logs=\{state\.workoutLogs\} sessionsPerWeek=\{pointsPerWeekTarget\}/.test(src),
    "the badge wall is written but never rendered");
  assert.ok(/program=\{pointsProgram\}/.test(src),
    "the wall is not given the programme, so Week One and Caught Up can never be earned");
});

// ---------- the session on paper ----------
//
// Not a nicety. A phone in a chalked-up hand, in a gym with no signal, is a
// phone that does not get used - and an athlete who cannot log a session is
// an athlete the coach cannot see.

const sheet = (() => {
  const at = src.indexOf("function PrintSheet(");
  assert.ok(at > 0, "there is no print sheet");
  return src.slice(at, src.indexOf("\nfunction SessionLoggedScreen", at));
})();

test("the sheet carries everything the design asks for", () => {
  assert.ok(/Start <span/.test(sheet) && /Finish <span/.test(sheet), "no start and finish lines");
  assert.ok(/CHECKIN_SCALES\.map/.test(sheet), "the check-in is not on the sheet");
  assert.ok(/CHECKIN_SCALE_MAX/.test(sheet), "the check-in scale length is hard-coded rather than read");
  assert.ok(/EFFORT_LEVELS\.map/.test(sheet), "there is nowhere to say how hard it was");
  assert.ok(/Notes/.test(sheet), "there is nowhere to write notes");
  assert.ok(/Type it in later/.test(sheet), "nothing explains how to get the numbers back into the app");
});

test("every set gets an empty reps box and an empty weight box", () => {
  assert.ok(/Array\.from\(\{ length: Math\.max\(0, Number\(x\.sets\) \|\| 0\) \}\)/.test(sheet),
    "the boxes are not drawn one per prescribed set");
  assert.ok(/>reps<\/span>/.test(sheet) && /<span>weight<\/span>/.test(sheet),
    "the boxes are not labelled, so there is no telling which is which");
  assert.ok(/target \{x\.reps\} reps/.test(sheet), "the target reps are not printed in small print");
});

test("the photos are black and white, and small", () => {
  // A colour photo costs ink and tells the athlete nothing a grey one does
  // not.
  assert.ok(/filter: "grayscale\(1\)/.test(sheet), "the demonstration photos print in colour");
  assert.ok(/width: 46, height: 46/.test(sheet), "the photos are not thumbnail sized");
});

test("the effort options are separate elements, not one padded string", () => {
  // HTML collapses runs of whitespace. Padded with spaces it prints as
  // "Hard Moderate Easy" with nothing to circle between them.
  const at = sheet.indexOf("How hard was it?");
  assert.ok(at > 0, "the effort question is gone");
  const row = sheet.slice(at, at + 500);
  assert.ok(!/\.join\(/.test(row), "the effort labels are joined into one padded string");
  assert.ok(/display: "inline-flex", gap: 20/.test(row), "the effort labels have no gap between them");
  assert.ok(/EFFORT_LEVELS\.map\(e => <span key=\{e\.key\}>\{e\.label\}<\/span>\)/.test(row),
    "the labels are not separate elements");
});

test("the preview's own buttons never print", () => {
  // A printed sheet with a Print button drawn on it is the detail that makes
  // the whole thing look unfinished.
  assert.ok(/className="tb-print-hide sticky top-0/.test(sheet),
    "the preview toolbar is not marked as screen-only");
  const live = readSource(path.join(here, "..", "src", "index.css"));
  assert.ok(/\.tb-print-hide \{ display: none !important; \}/.test(live),
    "nothing hides the toolbar when printing");
});

test("printing hides the app by visibility, not by display", () => {
  // Hiding by display collapses the layout and takes the sheet's own
  // ancestors with it, so the sheet lands a third of the way down page two.
  const live = readSource(path.join(here, "..", "src", "index.css"));
  const at = live.indexOf("@media print");
  assert.ok(at > 0, "there is no print stylesheet");
  const block = live.slice(at, at + 900);
  assert.ok(/body \* \{ visibility: hidden !important; \}/.test(block),
    "the rest of the app is hidden some other way");
  assert.ok(/\.tb-print, \.tb-print \* \{ visibility: visible !important; \}/.test(block),
    "the sheet itself is never made visible again");
  assert.ok(/break-inside: avoid/.test(block),
    "an exercise can be split across two pages");
});

test("the sheet is offered from both places an athlete would look", () => {
  assert.ok(/Printer size=\{14\} \/> Print it for the gym/.test(src),
    "the home screen's workout card does not offer a sheet");
  assert.ok(/aria-label="Print this session"/.test(src),
    "the Plan's session header does not offer a sheet");
  assert.equal((src.match(/<PrintSheet/g) || []).length, 2,
    "the sheet is wired up in a different number of places than the buttons that open it");
});

test("the Plan prints this week's prescription, not the baseline", () => {
  // A deload week printed at full load is a sheet that tells the athlete to
  // ignore the week they are in.
  assert.ok(/exercises=\{printableExercises\(weekExercises, state\.exercises\)\}/.test(src),
    "the Plan's sheet prints the programme's baseline rather than this week");
});

test("names are resolved once, for both screens", () => {
  // The home screen holds the day straight off the programme and the Plan
  // holds this week's prescription. The sheet should not have to know which
  // it was handed.
  const at = src.indexOf("function printableExercises(");
  assert.ok(at > 0, "printableExercises is gone");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/e\.id === x\?\.exerciseId/.test(body), "the exercise name is never looked up");
  assert.ok(/\|\| x\?\.name \|\| "Exercise"/.test(body),
    "a movement the library has lost prints as nothing at all");
});

// ---------- the stylesheet that is actually built ----------

test("the animations live in the stylesheet that is built", () => {
  // src/index.css is imported by main.jsx. There is a byte-identical
  // index.css at the repo root that nothing imports or links, and editing
  // that one changes nothing at all - which cost an afternoon once.
  const live = readSource(path.join(here, "..", "src", "index.css"));
  for (const rule of ["rw-pop", "rw-rise", "rw-flip", "rw-rays", "rw-fall", "rw-bar"]) {
    assert.ok(live.includes(rule), `${rule} is not in src/index.css`);
  }
  assert.ok(/prefers-reduced-motion: reduce[\s\S]*rw-fall/.test(live),
    "the animations are not switched off under reduced motion");
});

test("the level bar's fill is a block, or it has no width at all", () => {
  // `i` is inline by default. An inline element ignores width, so the bar
  // renders as an empty track and the level looks permanently stuck at zero.
  const live = readSource(path.join(here, "..", "src", "index.css"));
  const at = live.indexOf(".rw-bar > i");
  assert.ok(at > 0, "the bar fill has no rule");
  const rule = live.slice(at, live.indexOf("}", at));
  assert.ok(/display:\s*block/.test(rule), "the bar fill is still inline, so it has no width");
  assert.ok(/height:\s*100%/.test(rule), "the bar fill has no height");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
