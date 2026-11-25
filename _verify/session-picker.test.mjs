// Isaiah, 24 Nov: from today's workout he wants to switch to tomorrow's,
// Wednesday's, or one he missed. The workout screen now has "Change", which
// lists today's, missed (last fortnight) and the next two weeks' sessions.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "./extract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = fs.readFileSync(APP, "utf8");
const H = await load(APP, [
  { name: "WEEKDAY_ORDER", kind: "const" }, { name: "toLocalISO", kind: "const" },
  "weekStartFor", "shiftDays", "skipRangeEnd", "isDateInSkipRange", "isDayScheduledOn",
  "sessionKey", "sessionIdentity", { name: "PLAN_STATUS", kind: "const" },
  "moveFor", "logFor", "planForWeek", "missedSessions", "pullToUndo", "isTickedOffLog",
  { name: "COUNTS_THRESHOLD", kind: "const" }, "sessionCounts", "logCounts",
  "isTrackedPhase", "isTrackedExercise", { name: "UNTRACKED_PHASES", kind: "const" },
  "upcomingSessions", "sessionChoices",
]);
let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);

const MON = "2026-06-01";
const d = (n) => H.shiftDays(MON, n);
const TODAY = d(7);   // the next Monday
const program = { id: "p1", weeks: 8, startedOn: MON, days: [
  { id: "d1", name: "Day 1 — Lower", weekday: "Monday", exercises: [] },
  { id: "d2", name: "Day 2 — Upper", weekday: "Wednesday", exercises: [] },
  { id: "d3", name: "Day 3 — Full", weekday: "Friday", exercises: [] },
] };
const log = (date, programDay) => ({ date, programDay, setsCompleted: 10, setsPrescribed: 10, exercises: [] });

test("today's, missed and coming-up sessions, each with its date", () => {
  const c = H.sessionChoices({ program, logs: [log(d(0), "Day 1 — Lower"), log(d(2), "Day 2 — Upper")], moves: [], today: TODAY, currentDayName: "Day 1 — Lower" });
  const today = c.filter(x => x.when === "today");
  assert.deepEqual(today.map(x => x.day.id), ["d1"]);
  assert.ok(today[0].current);
  const missed = c.filter(x => x.when === "missed");
  assert.deepEqual(missed.map(x => [x.day.id, x.iso]), [["d3", d(4)]], "last Friday's, not the ones that were done");
  const up = c.filter(x => x.when === "upcoming");
  assert.deepEqual(up.slice(0, 3).map(x => [x.day.id, x.iso]), [["d2", d(9)], ["d3", d(11)], ["d2", d(16)]], "tomorrow-onward, in order, without the session already open");
});

test("a missed copy of the session already open isn't offered again", () => {
  const c = H.sessionChoices({ program, logs: [], moves: [], today: TODAY, currentDayName: "Day 1 — Lower" });
  assert.ok(!c.some(x => x.when === "missed" && x.day.id === "d1"));
  assert.equal(c.filter(x => x.when === "missed" && x.day.id === "d3").length, 1, "the newest missed copy only");
});

test("a session already pulled to today shows under today, not as coming up", () => {
  const moves = [{ programDay: "Day 2 — Upper", fromDate: d(9), toDate: TODAY, kind: "pull" }];
  const c = H.sessionChoices({ program, logs: [], moves, today: TODAY, currentDayName: "Day 2 — Upper" });
  assert.ok(c.some(x => x.when === "today" && x.day.id === "d2"));
  assert.ok(!c.some(x => x.when === "upcoming" && x.iso === d(9)));
});

test("the workout screen offers it, records a pull, and puts the old pull back", () => {
  assert.ok(src.includes("<SessionSwitchButton isToday={isToday || (!coachFor && !!pullToUndo(state.sessionMoves, day.name, todayISO()))} onClick={() => setPickerOpen(true)} />"));
  assert.ok(src.includes('saveSessionMove(setState, state.me.id, { programDay: picked.day.name, fromDate: picked.iso, toDate: today, kind: "pull" });'));
  assert.ok(src.includes("if (leaving) clearSessionMove(setState, state.me.id, leaving.programDay, leaving.fromDate);"));
  assert.ok(/if \(!coachFor\) \{\s*const today = todayISO\(\);/.test(src), "a coach running a client's session doesn't write the client's moves");
  assert.ok(src.includes("if (hasProgress) setPendingDay(id);"), "switching mid-session still asks first");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
