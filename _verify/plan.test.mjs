// What became of each day in a week.
//
// One function answers it, read by the Plan screen and by the home screen's
// missed card, so the two cannot disagree about whether Tuesday was missed.
// This file is where the awkward cases get written down instead of being
// reproduced by hand in a gym: a session moved and then logged on the day it
// moved to, a session moved and then not done, a week that straddles the
// programme's start, a session trained on a day nobody planned it for.
//
// The failure that matters most is "missed". It is the only status that
// accuses the athlete of something, and it is the one with the most ways to
// be wrong: before the programme began, after a skip, after a move, on a day
// that was logged under another name.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  { name: "WEEKDAY_ORDER", kind: "const" },
  { name: "toLocalISO", kind: "const" },
  "weekStartFor", "shiftDays",
  "skipRangeEnd", "isDateInSkipRange", "isDayScheduledOn",
  "sessionKey", "sessionIdentity",
  { name: "PLAN_STATUS", kind: "const" },
  "moveFor", "logFor", "planForWeek", "weekProgress", "missedSessions",
  "pullToUndo", "isTickedOffLog", "planLabel",
  { name: "COUNTS_THRESHOLD", kind: "const" }, "sessionCounts", "logCounts",
  "isTrackedPhase", "isTrackedExercise", { name: "UNTRACKED_PHASES", kind: "const" },
]);

const src = (await import("node:fs")).readFileSync(APP, "utf8");

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// Monday 1 June 2026 through Sunday the 7th.
const MON = "2026-06-01";
const d = (n) => H.shiftDays(MON, n);          // 0 = Mon, 1 = Tue, ...
const TODAY = d(4);                             // Friday

const program = {
  id: "p1", weeks: 8, startedOn: MON,
  days: [
    { id: "d1", name: "Day 1 — Lower", weekday: "Monday", exercises: [] },
    { id: "d2", name: "Day 2 — Upper", weekday: "Wednesday", exercises: [] },
    { id: "d3", name: "Day 3 — Full", weekday: "Saturday", exercises: [] },
  ],
};

const log = (date, programDay) => ({ date, programDay, setsCompleted: 10, setsPrescribed: 10, exercises: [] });
const move = (programDay, fromDate, toDate, kind = "move") => ({ programDay, fromDate, toDate, kind });

const week = (opts = {}) => H.planForWeek({ program, weekStart: MON, today: TODAY, ...opts });
const row = (rows, n) => rows[n];
const statuses = (rows) => rows.map(r => r.sessions.map(x => x.status).join("+") || "rest");

// ---------- the shape of a week ----------

test("a week is seven rows, Monday first", () => {
  const rows = week();
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map(r => r.weekday), H.WEEKDAY_ORDER);
  assert.equal(rows[0].date, MON);
  assert.equal(rows[6].date, d(6));
});

test("a day with nothing scheduled is a rest day", () => {
  const rows = week();
  assert.equal(row(rows, 1).status, "rest", "Tuesday has no session and is not marked rest");
  assert.equal(row(rows, 1).sessions.length, 0);
  assert.equal(row(rows, 0).status, null, "Monday has a session and was marked rest anyway");
});

test("today, the past and the future are each marked", () => {
  const rows = week();
  assert.equal(row(rows, 4).isToday, true);
  assert.equal(row(rows, 0).isPast, true);
  assert.equal(row(rows, 5).isPast, false);
});

// ---------- done, missed, upcoming ----------

test("a session with a log on its own day is done", () => {
  const rows = week({ logs: [log(MON, "Day 1 — Lower")] });
  assert.equal(row(rows, 0).sessions[0].status, "done");
  assert.ok(row(rows, 0).sessions[0].log, "the log is not carried through, so nothing can show what was done");
});

test("a session in the past with no log is missed", () => {
  const rows = week();
  assert.equal(row(rows, 0).sessions[0].status, "missed", "Monday went by untrained and is not marked missed");
  assert.equal(row(rows, 2).sessions[0].status, "missed", "Wednesday too");
});

test("today's session is today, not missed", () => {
  const rows = H.planForWeek({ program, weekStart: MON, today: MON });
  assert.equal(row(rows, 0).sessions[0].status, "today",
    "a session is marked missed on the morning it is due");
});

test("a session still to come is upcoming", () => {
  const rows = week();
  assert.equal(row(rows, 5).sessions[0].status, "upcoming");
});

test("a log on the wrong day does not satisfy the day it was planned for", () => {
  // Monday's session, trained on Thursday. Monday is still missed; Thursday
  // shows it as extra. Saying otherwise would hide the move entirely.
  const rows = week({ logs: [log(d(3), "Day 1 — Lower")] });
  assert.equal(row(rows, 0).sessions[0].status, "missed");
  assert.equal(row(rows, 3).sessions[0].status, "extra");
  assert.equal(row(rows, 3).sessions[0].day.name, "Day 1 — Lower");
});

test("a session nobody planned still appears", () => {
  // Work that happened and appears nowhere is how an athlete stops trusting
  // the screen.
  const rows = week({ logs: [log(d(1), "Extra conditioning")] });
  assert.equal(row(rows, 1).sessions.length, 1);
  assert.equal(row(rows, 1).sessions[0].status, "extra");
  assert.equal(row(rows, 1).status, null, "the day still reads as a rest day");
});

// ---------- before the programme began ----------

test("days before the start date are never missed", () => {
  // A plan that starts the day someone signs up has no history behind it.
  // Marking the Monday before as missed is the app telling a new athlete
  // they are already behind before they begin.
  const started = { ...program, startedOn: d(3) };      // started Thursday
  const rows = H.planForWeek({ program: started, weekStart: MON, today: TODAY });
  assert.equal(row(rows, 0).sessions[0].status, "upcoming", "Monday before the start reads as missed");
  assert.equal(row(rows, 0).beforeStart, true);
  assert.equal(row(rows, 2).sessions[0].status, "upcoming", "Wednesday before the start reads as missed");
});

test("the day the programme starts is not before the start", () => {
  const started = { ...program, startedOn: MON };
  const rows = H.planForWeek({ program: started, weekStart: MON, today: TODAY });
  assert.equal(row(rows, 0).beforeStart, false);
  assert.equal(row(rows, 0).sessions[0].status, "missed");
});

test("a programme with no start date treats nothing as too early", () => {
  const loose = { ...program, startedOn: null };
  const rows = H.planForWeek({ program: loose, weekStart: MON, today: TODAY });
  assert.equal(row(rows, 0).sessions[0].status, "missed");
});

// ---------- skipping ----------

test("a skipped session is skipped, not missed", () => {
  const rows = week({ moves: [move("Day 1 — Lower", MON, null, "skip")] });
  assert.equal(row(rows, 0).sessions[0].status, "skipped");
});

test("a skip with no destination is a skip whatever it calls itself", () => {
  // The kind and the null destination say the same thing twice. If they ever
  // disagree, the destination wins - there is nowhere for it to have gone.
  const rows = week({ moves: [move("Day 1 — Lower", MON, null, "move")] });
  assert.equal(row(rows, 0).sessions[0].status, "skipped");
});

test("a session that was skipped and then trained anyway is done", () => {
  // Work that happened beats a plan that said it would not. Letting the skip
  // win means a session the athlete actually did shows as skipped, which is
  // the app contradicting them about their own week.
  const rows = week({
    moves: [move("Day 1 \u2014 Lower", MON, null, "skip")],
    logs: [log(MON, "Day 1 \u2014 Lower")],
  });
  assert.equal(row(rows, 0).sessions[0].status, "done");
});

test("a session moved away and then trained on its old day is done there", () => {
  const rows = week({
    moves: [move("Day 1 \u2014 Lower", MON, d(1))],
    logs: [log(MON, "Day 1 \u2014 Lower")],
  });
  assert.equal(row(rows, 0).sessions[0].status, "done",
    "the athlete changed their mind back and the screen still says it moved");
});

test("the programme's own skip ranges still work", () => {
  // A coach clearing a fortnight is a different mechanism and must not have
  // been broken by adding one-off moves.
  const paused = {
    ...program,
    days: [{ ...program.days[0], skipRanges: [{ start: MON, weeks: 1 }] }, ...program.days.slice(1)],
  };
  const rows = H.planForWeek({ program: paused, weekStart: MON, today: TODAY });
  assert.equal(row(rows, 0).sessions.length, 0, "a cleared range still put a session on the calendar");
  assert.equal(row(rows, 0).status, "rest");
});

// ---------- moving ----------

test("a moved session leaves its own day and lands on another", () => {
  const rows = week({ moves: [move("Day 1 — Lower", MON, d(1))] });
  assert.equal(row(rows, 0).sessions[0].status, "moved-away");
  assert.equal(row(rows, 0).sessions[0].movedTo, d(1));
  assert.equal(row(rows, 1).sessions.length, 1, "it never arrived where it was moved to");
  assert.equal(row(rows, 1).sessions[0].movedFrom, MON);
});

test("a session moved into the past with no log is missed there", () => {
  // Moving it does not make it done. Tuesday has been and gone.
  const rows = week({ moves: [move("Day 3 — Full", d(5), d(1))] });
  assert.equal(row(rows, 1).sessions[0].status, "missed");
  assert.equal(row(rows, 5).sessions[0].status, "moved-away");
});

test("a session moved and then trained is done where it landed", () => {
  const rows = week({
    moves: [move("Day 1 — Lower", MON, d(1))],
    logs: [log(d(1), "Day 1 — Lower")],
  });
  assert.equal(row(rows, 1).sessions[0].status, "done");
  assert.equal(row(rows, 0).sessions[0].status, "moved-away", "it is counted on both days");
});

test("a pull forward is a move that remembers where it came from", () => {
  // The difference between pull and move is reversibility, and the row has
  // to carry which it was or the goes-back rule has nothing to read.
  const rows = week({ moves: [move("Day 3 — Full", d(5), TODAY, "pull")] });
  assert.equal(row(rows, 4).sessions[0].moveKind, "pull");
  assert.equal(row(rows, 4).sessions[0].movedFrom, d(5));
  assert.equal(row(rows, 5).sessions[0].moveKind, "pull");
});

test("a move for a session the programme no longer has is ignored", () => {
  // A coach replacing the programme leaves moves pointing at nothing.
  const rows = week({ moves: [move("Day 9 — Deleted", MON, d(1))] });
  assert.equal(row(rows, 1).sessions.length, 0);
});

test("a move only applies to the date it was made for", () => {
  // Next week's Monday is untouched by this week's move, or one move would
  // delete a session from the programme for ever.
  const rows = H.planForWeek({ program, weekStart: H.shiftDays(MON, 7), today: H.shiftDays(TODAY, 7),
                               moves: [move("Day 1 — Lower", MON, d(1))] });
  assert.equal(row(rows, 0).sessions[0].status, "missed");
  assert.equal(row(rows, 0).sessions[0].movedTo, null);
});

// ---------- paused ----------

test("a session stopped part-way reads as paused, not missed", () => {
  const key = H.sessionIdentity(program, program.days[0]);
  const rows = week({ pausedDayKey: key });
  assert.equal(row(rows, 0).sessions[0].status, "paused");
});

test("a paused session that then gets finished is done", () => {
  const key = H.sessionIdentity(program, program.days[0]);
  const rows = week({ pausedDayKey: key, logs: [log(MON, "Day 1 — Lower")] });
  assert.equal(row(rows, 0).sessions[0].status, "done", "a logged session still shows as paused");
});

test("only the paused session is paused", () => {
  const key = H.sessionIdentity(program, program.days[0]);
  const rows = week({ pausedDayKey: key });
  assert.equal(row(rows, 2).sessions[0].status, "missed");
});

// ---------- the week's progress ring ----------

test("the ring counts what was asked for and what was done", () => {
  const rows = week({ logs: [log(MON, "Day 1 — Lower")] });
  const p = H.weekProgress(rows);
  assert.equal(p.planned, 3);
  assert.equal(p.done, 1);
  assert.ok(Math.abs(p.ratio - 1 / 3) < 0.001);
});

test("a skipped session is not counted against the week", () => {
  // Skipping is a decision, not a failure. Counting it as a shortfall turns
  // every planned rest into a mark on the record.
  const rows = week({ moves: [move("Day 3 — Full", d(5), null, "skip")] });
  assert.equal(H.weekProgress(rows).planned, 2);
});

test("a moved session is counted once, where it landed", () => {
  const rows = week({ moves: [move("Day 1 — Lower", MON, d(1))] });
  const p = H.weekProgress(rows);
  assert.equal(p.planned, 3, "a move made the week longer or shorter than it is");
});

test("an extra session counts as done without raising the target", () => {
  // Doing more than the plan is not a reason for the ring to read as less
  // full than it did before.
  const rows = week({ logs: [log(MON, "Day 1 — Lower"), log(d(1), "Extra conditioning")] });
  const p = H.weekProgress(rows);
  assert.equal(p.planned, 3);
  assert.equal(p.done, 2);
});

test("a full week is one, and never more than one", () => {
  const rows = week({
    logs: [log(MON, "Day 1 — Lower"), log(d(2), "Day 2 — Upper"),
           log(d(5), "Day 3 — Full"), log(d(6), "Extra conditioning")],
  });
  assert.equal(H.weekProgress(rows).ratio, 1);
});

test("a week with nothing planned is not a divide by zero", () => {
  const empty = { ...program, days: [] };
  const p = H.weekProgress(H.planForWeek({ program: empty, weekStart: MON, today: TODAY }));
  assert.deepEqual(p, { planned: 0, done: 0, ratio: 0 });
});

// ---------- the missed list ----------

test("missed sessions come back newest first", () => {
  const list = H.missedSessions({ program, logs: [], moves: [], today: TODAY });
  assert.ok(list.length >= 2);
  assert.deepEqual(list.map(x => x.date), [...list.map(x => x.date)].sort().reverse());
});

test("the missed list reaches back a fortnight and no further", () => {
  // A card offering to catch up on something five weeks old is noise.
  const list = H.missedSessions({ program, logs: [], moves: [], today: TODAY, weeksBack: 2 });
  const oldest = list[list.length - 1].date;
  assert.ok(oldest >= H.shiftDays(TODAY, -21), `reached back to ${oldest}`);
});

test("a session that was done, skipped or moved is not in the missed list", () => {
  const logs = [log(MON, "Day 1 — Lower")];
  const moves = [move("Day 2 — Upper", d(2), null, "skip")];
  const list = H.missedSessions({ program, logs, moves, today: TODAY });
  const thisWeek = list.filter(x => x.date >= MON && x.date <= d(6));
  assert.equal(thisWeek.length, 0, `still offering to catch up on ${JSON.stringify(thisWeek)}`);
});

// ---------- the small print ----------

test("a move is found by session and date together, never by either alone", () => {
  const moves = [move("Day 1 — Lower", MON, d(1)), move("Day 2 — Upper", d(2), d(3))];
  assert.equal(H.moveFor(moves, "Day 1 — Lower", MON).toDate, d(1));
  assert.equal(H.moveFor(moves, "Day 1 — Lower", d(2)), null);
  assert.equal(H.moveFor(moves, "Day 2 — Upper", MON), null);
  assert.equal(H.moveFor(null, "Day 1 — Lower", MON), null);
});

test("a log is found by session and date together too", () => {
  const logs = [log(MON, "Day 1 — Lower"), log(d(2), "Day 2 — Upper")];
  assert.ok(H.logFor(logs, "Day 1 — Lower", MON));
  assert.equal(H.logFor(logs, "Day 1 — Lower", d(2)), null);
  assert.equal(H.logFor(logs, "Day 2 — Upper", MON), null);
});

test("every status the screen can draw has a word for it", () => {
  const drawn = new Set();
  for (const rows of [
    week(),
    week({ logs: [log(MON, "Day 1 — Lower"), log(d(1), "Extra")] }),
    week({ moves: [move("Day 1 — Lower", MON, d(1)), move("Day 3 — Full", d(5), null, "skip")] }),
    week({ pausedDayKey: H.sessionIdentity(program, program.days[2]) }),
  ]) {
    for (const r of rows) {
      if (r.status) drawn.add(r.status);
      for (const x of r.sessions) drawn.add(x.status);
    }
  }
  for (const status of drawn) {
    if (status === "moved-away") continue;       // drawn as "Moved to <date>"
    assert.ok(H.PLAN_STATUS[status], `no label for the "${status}" status`);
  }
});

test("no week is missing a date", () => {
  // shiftDays across a daylight-saving boundary is the classic way to get
  // six days or two Sundays.
  for (const start of ["2026-03-02", "2026-03-30", "2026-10-26", "2026-12-28"]) {
    const rows = H.planForWeek({ program, weekStart: start, today: TODAY });
    assert.equal(new Set(rows.map(r => r.date)).size, 7, `week of ${start} has a repeated date`);
    assert.equal(rows[6].date, H.shiftDays(start, 6));
  }
});

// ---------- a pulled-forward session goes back ----------
//
// The difference between a pull and a move is what they are decisions ABOUT.
// "Do it today instead" is a decision about today, and stopping part-way
// through unmakes it. "Move" is a decision about the week, and stopping does
// not.

test("a session pulled to today and stopped is the one that goes back", () => {
  const moves = [move("Day 3 \u2014 Full", d(5), TODAY, "pull")];
  const found = H.pullToUndo(moves, "Day 3 \u2014 Full", TODAY);
  assert.ok(found, "the pull is not found, so the session never goes home");
  assert.equal(found.fromDate, d(5));
});

test("a session MOVED to today and stopped stays where it was moved", () => {
  const moves = [move("Day 3 \u2014 Full", d(5), TODAY, "move")];
  assert.equal(H.pullToUndo(moves, "Day 3 \u2014 Full", TODAY), null,
    "stopping a moved session dragged it back to its old day");
});

test("another session's pull, or another day's, is not undone", () => {
  const moves = [move("Day 3 \u2014 Full", d(5), TODAY, "pull")];
  assert.equal(H.pullToUndo(moves, "Day 1 \u2014 Lower", TODAY), null);
  assert.equal(H.pullToUndo(moves, "Day 3 \u2014 Full", d(1)), null);
  assert.equal(H.pullToUndo(null, "Day 3 \u2014 Full", TODAY), null);
});

test("stopping a workout undoes the pull and nothing else", () => {
  const at = src.indexOf("const stopAndSave = () => {");
  assert.ok(at > 0, "stopAndSave is gone");
  const body = src.slice(at, src.indexOf("\n  };", at));
  assert.ok(/pullToUndo\(state\.sessionMoves, day\.name, todayISO\(\)\)/.test(body),
    "stopping never checks whether the session was pulled forward");
  assert.ok(/clearSessionMove\(setState, state\.me\.id, pulled\.programDay, pulled\.fromDate\)/.test(body),
    "the pull is found and then not cleared");
  assert.ok(/writePausedWorkout\(pauseSnapshot\(\), state\.me\.id\)/.test(body),
    "the session goes home but does not stay paused, so the sets are lost");
});

// ---------- the moves survive a reload ----------

test("one decision per session per date, replaced rather than stacked", () => {
  const at = src.indexOf("async function saveSessionMove(");
  assert.ok(at > 0, "saveSessionMove is gone");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/onConflict: "user_id,program_day,from_date"/.test(body),
    "a second decision stacks behind the first and the screen has to pick");
  assert.ok(/\.filter\(\s*\n?\s*m => !\(m\.programDay === next\.programDay && m\.fromDate === next\.fromDate\)\)/.test(body),
    "the local copy keeps both, so the screen disagrees with the database");
});

test("moves are loaded with everything else and renamed on the way in", () => {
  assert.ok(/supabase\.from\("session_moves"\)\.select\("\*"\)\.eq\("user_id", profile\.id\)/.test(src),
    "the moves are never loaded, so the week resets on every login");
  assert.ok(/programDay: m\.program_day, fromDate: m\.from_date, toDate: m\.to_date, kind: m\.kind/.test(src),
    "the rows stay in snake_case, so the plan logic cannot read them");
  assert.ok(/sessionMoves: \[\],/.test(src), "there is no default before anything has loaded");
});

// ---------- what the week looks like on screen ----------

const panel = (() => {
  const at = src.indexOf("function WeekPlanPanel(");
  assert.ok(at > 0, "the week panel is gone");
  return src.slice(at, src.indexOf("\n// Tapping a day", at));
})();

test("nothing is left to colour alone", () => {
  // A row of coloured squares says nothing to someone seeing it for the
  // first time, and nothing at all to someone who cannot tell the green from
  // the amber. The strip carries position, the list carries meaning, and
  // every strip cell names its status to a screen reader.
  assert.ok(/aria-label=\{`\$\{row\.weekday\}: \$\{session \? planLabel\(session\) : "Rest day"\}`\}/.test(panel),
    "the strip cells do not announce what they mean");
  assert.ok(/\{planLabel\(session\)\}/.test(panel), "the list shows no status word");
});

test("the strip does not try to fit a word into thirty pixels", () => {
  // Measured: a seventh of the card at 320px is 30px, and "Upcoming" at 9pt
  // is 40. The first version put the word there and it overflowed.
  const strip = panel.slice(panel.indexOf("grid-cols-7"), panel.indexOf("The list:"));
  // The aria-label still names the status, deliberately - that costs no
  // pixels. What must not come back is the word drawn into the cell.
  assert.ok(!/planLabel\(session\)\.split/.test(strip),
    "the status word is back in the strip, truncated to its first word");
  assert.ok(!/>\s*\{planLabel\(session\)/.test(strip), "the status word is drawn in the strip cell");
  assert.ok(/borderRadius: "50%"/.test(strip), "there is no dot to carry the status");
});

test("the ring is a real fraction of the week, and never more than one", () => {
  assert.ok(/strokeDashoffset=\{CIRC \* \(1 - progress\.ratio\)\}/.test(panel),
    "the ring is not driven by the week's progress");
  assert.ok(/rotate\(-90 34 34\)/.test(panel), "the ring starts somewhere other than the top");
  assert.ok(/\{pct\}%/.test(panel), "the ring has no number in it for anyone who cannot read an arc");
});

test("a week with nothing in it says so", () => {
  assert.ok(/Nothing scheduled this week/.test(panel), "an empty week shows '0 of 0 sessions done'");
  assert.ok(/No sessions scheduled this week\. Tap a day to train anyway\./.test(panel),
    "an empty list is silent, so there is no way to know it is tappable");
});

test("a moved session says where it went, briefly", () => {
  const at = src.indexOf("function planLabel(");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/Moved \\u2192 \$\{to\}/.test(body) || /Moved \u2192 \$\{to\}/.test(body),
    "a moved session does not say where it went");
  assert.ok(/to \? `Moved/.test(body), "a move with no destination prints 'Moved to undefined'");
});

// ---------- the action sheet ----------

const sheet = (() => {
  const at = src.indexOf("function DayActionSheet(");
  assert.ok(at > 0, "the day action sheet is gone");
  return src.slice(at, src.indexOf("\nfunction AthleteProgram", at));
})();

test("every action the design asks for is there", () => {
  for (const label of ["Do it today instead", "Move it to another day", "Skip it this week", "Train anyway"]) {
    assert.ok(sheet.includes(label), `the sheet is missing "${label}"`);
  }
});

test("a skipped session can be put back", () => {
  // Skipping with no way to unskip is a one-way door on a mis-tap.
  assert.ok(/Put it back/.test(sheet), "a skipped session cannot be unskipped");
  assert.ok(/onUnskip/.test(sheet) && /clearSessionMove\(setState, state\.me\.id, dayAction\.sessions\[0\]\.day\.name, dayAction\.date\)/.test(src),
    "putting it back does not clear the move");
});

test("a finished session offers nothing to change", () => {
  assert.ok(/Already done\. Nothing to change\./.test(sheet),
    "a session that is done still offers to be moved, skipped or pulled forward");
});

test("today's session offers Start, not 'do it today'", () => {
  assert.ok(/row\.date !== today &&/.test(sheet), "'Do it today instead' shows on today itself");
  assert.ok(/row\.date === today &&/.test(sheet), "today's session has no way to start it");
});

test("moving is a two-step pick, not a drag", () => {
  // A drag is the obvious design for moving a session and the wrong one
  // here: one-handed, in a gym, on a phone often lying on a bench, where a
  // mis-drag silently rewrites the week.
  assert.ok(/setMoving\(true\)/.test(sheet), "there is no step between tapping Move and the week changing");
  assert.ok(/WEEKDAY_ORDER\.map\(\(weekday, i\) =>/.test(sheet), "there is no day to pick");
  assert.ok(/disabled=\{isHere\}/.test(sheet), "a session can be moved onto the day it is already on");
  assert.ok(/for this week only/.test(sheet), "nothing says the move is one week, not for ever");
});

test("the sheet resets when it closes", () => {
  // Reopening it half-way through a move is how someone moves the wrong
  // session to the wrong day.
  assert.ok(/useEffect\(\(\) => \{ if \(!open\) setMoving\(false\); \}, \[open\]\)/.test(sheet),
    "the move picker stays open behind the scenes");
});

test("all three changes go through one writer", () => {
  // Move, skip and pull write the same kind of row. Three paths is how they
  // drift apart.
  const at = src.indexOf("const changeDay = (session, fromDate, toDate, kind) =>");
  assert.ok(at > 0, "the one writer is gone");
  const body = src.slice(at, src.indexOf("\n  };", at));
  assert.ok(/saveSessionMove\(setState, state\.me\.id/.test(body), "it does not save");
  for (const kind of ['"move"', '"skip"', '"pull"']) {
    assert.ok(src.includes(`dayAction.date, ${kind === '"skip"' ? "null, " : ""}`) || src.includes(kind),
      `nothing ever writes a ${kind} row`);
  }
});

test("the panel shows the week being looked at, not always this one", () => {
  // An athlete looking ahead at week 6 should see week 6, and nothing in it
  // should be marked missed - which falls out for free, because every date
  // in it is in the future.
  assert.ok(/programWeekStart\(myProgram, shownWeek\)/.test(src),
    "the panel is pinned to the current week whatever the athlete is looking at");
  assert.ok(/weekStart: planWeekStart/.test(src), "the rows are built from a different week than the panel shows");
});

// ---------- the missed card on Today ----------

test("what did not happen comes before the card that assumes carrying on", () => {
  // An athlete with a missed Wednesday is deciding between catching it up
  // and carrying on, and that decision belongs above the card that has
  // already made it for them.
  const home = (() => {
    const at = src.indexOf("function AthleteDashboard(");
    assert.ok(at > 0, "the home screen is gone");
    return src.slice(at, src.indexOf("\nfunction ", at + 10));
  })();
  const missedAt = home.indexOf("You missed {sessionLabel(item.day.name)}");
  // The rendered heading, not the comments above that mention it by name.
  const todayAt = home.indexOf(">Today's Workout</div>");
  assert.ok(missedAt > 0, "there is no missed card on the home screen");
  assert.ok(todayAt > 0, "today's workout card is gone");
  assert.ok(missedAt < todayAt, "the missed card sits below today's workout");
});

test("the card is capped, not a wall of red", () => {
  // The whole list is on the Plan. A home screen that leads with five red
  // cards is a home screen people stop opening.
  assert.ok(/missed\.slice\(0, 2\)\.map/.test(src),
    "every missed session gets its own card on the home screen");
});

test("catching up is a pull, so stopping sends it home", () => {
  const at = src.indexOf("You missed {sessionLabel(item.day.name)}");
  const card = src.slice(at - 400, at + 2200);
  assert.ok(/kind: "pull"/.test(card),
    "'Do it today' writes a move, so stopping part-way would quietly rewrite the week");
  assert.ok(/fromDate: item\.date, toDate: today/.test(card),
    "the pull does not record where the session came from");
});

test("all three answers are offered, and letting go is the destructive-looking one", () => {
  const at = src.indexOf("You missed {sessionLabel(item.day.name)}");
  const card = src.slice(at - 400, at + 2200);
  for (const label of ["Do it today", "Move it", "Let it go"]) {
    assert.ok(card.includes(label), `the missed card is missing "${label}"`);
  }
  assert.ok(/variant="danger"[\s\S]{0,400}Let it go/.test(card),
    "letting a session go looks like the safe option");
  assert.ok(/kind: "skip"/.test(card), "letting it go does not actually skip it");
});

test("the card says when it was due, in words", () => {
  const at = src.indexOf("You missed {sessionLabel(item.day.name)}");
  const card = src.slice(at, at + 700);
  assert.ok(/pausedWhenLabel\(item\.date, today\)/.test(card),
    "the missed card shows a raw date, or no date at all");
});

test("the missed list is recomputed when anything it reads changes", () => {
  const at = src.indexOf("const missed = useMemo(");
  assert.ok(at > 0, "the missed list is not memoised, so it walks three weeks on every keystroke");
  const deps = src.slice(src.indexOf("[myProgram, state.workoutLogs", at), src.indexOf("]," , src.indexOf("[myProgram, state.workoutLogs", at)));
  for (const dep of ["state.workoutLogs", "state.sessionMoves", "today"]) {
    assert.ok(deps.includes(dep), `${dep} is not a dependency, so the card goes stale`);
  }
});

// ---------- "I did it on Monday, log it" ----------
//
// One tap, deliberately thin. It records that the session happened, on the
// day it happened, and nothing else. No sets and no weights, so it does not
// count toward the streak, the level or the points: an athlete who cannot
// remember what they lifted has not earned the same credit as one who wrote
// it down, and inventing numbers to make the maths tidy would poison every
// best and every trend downstream of it.

const ticked = (date, programDay, prescribed = 12) =>
  ({ date, programDay, setsCompleted: 0, setsPrescribed: prescribed, counts: false, exercises: [] });

test("a ticked-off session is told apart from a trained one", () => {
  assert.equal(H.isTickedOffLog(ticked(MON, "Day 1 \u2014 Lower")), true);
  assert.equal(H.isTickedOffLog(log(MON, "Day 1 \u2014 Lower")), false,
    "a real session was mistaken for a tick");
  assert.equal(H.isTickedOffLog(null), false);
});

test("a session with nothing prescribed is not a tick either", () => {
  // "0 of 0" is an extra session somebody added, not a missed one caught up.
  assert.equal(H.isTickedOffLog({ setsCompleted: 0, setsPrescribed: 0, exercises: [] }), false);
});

test("a session with sets logged but a count of zero is not a tick", () => {
  // Defensive: if the detail is there, it was trained.
  assert.equal(H.isTickedOffLog({
    setsCompleted: 0, setsPrescribed: 12,
    exercises: [{ name: "Back Squat", sets: [{ set: 1, done: false }] }],
  }), false);
});

test("it reads as done on the plan, and says it was not logged", () => {
  const rows = week({ logs: [ticked(MON, "Day 1 \u2014 Lower")] });
  const session = row(rows, 0).sessions[0];
  assert.equal(session.status, "done", "a ticked-off session still reads as missed");
  assert.equal(H.planLabel(session), "Done, not logged",
    "it reads as a plain Done, which next to no numbers at all looks like a bug");
});

test("a trained session still just says Done", () => {
  const rows = week({ logs: [log(MON, "Day 1 \u2014 Lower")] });
  assert.equal(H.planLabel(row(rows, 0).sessions[0]), "Done");
});

test("it stops the session being chased", () => {
  const list = H.missedSessions({ program, logs: [ticked(MON, "Day 1 \u2014 Lower")], moves: [], today: TODAY });
  assert.equal(list.some(x => x.date === MON), false,
    "the athlete said they did it and the card is still asking about it");
});

test("it counts for nothing", () => {
  // The whole bargain. It buys the truth about the calendar and nothing else.
  assert.equal(H.logCounts(ticked(MON, "Day 1 \u2014 Lower")), false);
  const rows = week({ logs: [ticked(MON, "Day 1 \u2014 Lower")] });
  assert.equal(H.weekProgress(rows).done, 1, "the week's ring ignores it entirely");
});

test("the row it writes carries no numbers and says so", () => {
  const at = src.indexOf("async function logSessionAsDone(");
  assert.ok(at > 0, "logSessionAsDone is gone");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  // The row that goes to the database, and the local copy beside it, are
  // checked separately. They say the same thing twice, and a test that
  // matches either one passes while the other is wrong.
  const dbRow = body.slice(body.indexOf("const row = {"), body.indexOf("};", body.indexOf("const row = {")));
  const localRow = body.slice(body.indexOf("const local = {"), body.indexOf("};", body.indexOf("const local = {")));
  for (const [what, row] of [["the database row", dbRow], ["the local copy", localRow]]) {
    assert.ok(/sets_?[cC]ompleted: 0/.test(row), `${what} claims sets were completed`);
    assert.ok(/counts: false/.test(row), `${what} leaves the flag null or true`);
    assert.ok(/exercises: \[\]/.test(row), `${what} invents exercise detail`);
    assert.ok(/sets_?[pP]rescribed: prescribed/.test(row),
      `${what} records 0 of 0, which reads as a session that asked for nothing`);
    assert.ok(/\bdate\b/.test(row), `${what} does not carry the day it was done`);
  }
  assert.ok(!/todayISO\(\)/.test(body), "it logs against today rather than the day it was done");
});

test("a tick on a bad connection is queued, not lost", () => {
  // An athlete who has already stopped expecting to be asked about it will
  // not notice it vanish.
  const at = src.indexOf("async function logSessionAsDone(");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.equal((body.match(/queuePendingLog\(/g) || []).length, 2,
    "only one of the two failure paths queues the tick");
  assert.ok(/isTransientError/.test(body), "a permanent rejection is queued and retried for ever");
});

test("what was prescribed is counted the same way the save path counts it", () => {
  // Otherwise a ticked session says 0 of 18 and a trained one 0 of 12, for
  // the same Monday.
  const at = src.indexOf("function prescribedSetCount(");
  assert.ok(at > 0, "prescribedSetCount is gone");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/prescribeForWeek\(raw, plan, week, weekly\)/.test(body),
    "it reads the programme's baseline rather than the week's prescription");
  assert.ok(/isTrackedExercise\(item\)/.test(body),
    "warm-ups are counted, so the target is higher than the one the save path uses");
});

test("the button names the day it is logging against", () => {
  // "Log it" alone invites "log what, when".
  assert.ok(/I did it on \{new Date\(`\$\{item\.date\}T00:00:00`\)\.toLocaleDateString\("en-US", \{ weekday: "short" \}\)\}, log it/.test(src),
    "the missed card has no way to say the session already happened");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
