// The month, filling a time, and who turned up.
//
// Three gaps in a booking system that was otherwise complete:
//
//   The schedule showed the FUTURE only. groupSlotsByDay drops anything
//   that has already started, which is right for "what is coming up" and is
//   also why no-show could never be recorded: by the time a coach wanted to
//   mark a session, it had dropped off the only screen that listed it.
//
//   The coach could not put anybody in a time. Most sessions in a real gym
//   are agreed in person, and the coach then has to ask the client to go and
//   tap it into an app. Everyone forgets, and the schedule drifts away from
//   the gym until it is worth nothing - which also quietly breaks the
//   ledger, because a session trained and never booked is never counted.
//
//   The month could not be seen at all, only the next few days as a list.
//   "How full is the back half of November" is the question that decides
//   whether to open more times, and a list cannot answer it.
//
// The two new server functions live in migration 005 and are NOT applied.
// What this file can check about them is their shape and that the client
// calls them correctly; what it cannot check is Postgres, so the rules that
// matter most are also written out here as prose next to the assertion.
import assert from "node:assert/strict";
import { readSource, load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const MIG = path.join(here, "..", "supabase", "migrations", "005_direct_booking_and_no_show.sql");
const src = readSource(APP);
const sql = readSource(MIG);
// Assertions about what the migration DOES look at the statements, not at
// the prose above them.
const code = sql.split("\n").filter(l => !/^\s*--/.test(l)).join("\n");

const { sessionsToMark, calendarMonth, groupSlotsByDay } = await load(APP, [
  { name: "toLocalISO", kind: "const" },
  { name: "todayISO", kind: "const" },
  { name: "WEEKDAY_ORDER", kind: "const" },
  "groupSlotsByDay", "sessionsToMark", "calendarMonth",
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const NOW = new Date("2026-10-15T18:00:00").getTime(); // a Thursday evening
const at = (iso) => new Date(iso).toISOString();
const slot = (id, startsAt, over = {}) => ({ id, startsAt, sessionTypeId: "t1", cancelledAt: null, ...over });
const bk = (id, slotId, status = "booked") => ({ id, slotId, athleteId: "a1", status });

// ---------- sessions still to mark ----------

const marking = {
  slots: [
    slot("s1", at("2026-10-15T09:00:00")),   // this morning
    slot("s2", at("2026-10-14T09:00:00")),   // yesterday
    slot("s3", at("2026-10-16T09:00:00")),   // tomorrow
  ],
  bookings: [bk("b1", "s1"), bk("b2", "s2"), bk("b3", "s3")],
};

test("a session that has happened and is unmarked needs marking", () => {
  const rows = sessionsToMark(marking, { nowMs: NOW });
  assert.deepEqual(rows.map(r => r.slot.id), ["s1", "s2"]);
});

test("a session that has not happened is not on the list", () => {
  // Marking somebody absent from a session that has not started is the one
  // thing this screen must never let a coach do by accident.
  const rows = sessionsToMark(marking, { nowMs: NOW });
  assert.ok(!rows.some(r => r.slot.id === "s3"), "tomorrow's session is asking to be marked");
});

test("the most recent session is first", () => {
  // The one that just finished is the one the coach is thinking about.
  const rows = sessionsToMark(marking, { nowMs: NOW });
  assert.deepEqual(rows.map(r => r.slot.id), ["s1", "s2"]);
});

test("marking it either way takes it off the list", () => {
  // Not just no-show. A list that only empties on one of the two answers
  // would nag the coach for ever about sessions everyone attended.
  for (const status of ["attended", "no_show"]) {
    const done = { ...marking, bookings: [{ ...bk("b1", "s1"), status }, bk("b2", "s2")] };
    const rows = sessionsToMark(done, { nowMs: NOW });
    assert.deepEqual(rows.map(r => r.slot.id), ["s2"], status);
  }
});

test("a cancelled booking is not waiting to be marked", () => {
  for (const status of ["cancelled", "late_cancelled"]) {
    const rows = sessionsToMark({ ...marking, bookings: [{ ...bk("b1", "s1"), status }] }, { nowMs: NOW });
    assert.deepEqual(rows, [], status);
  }
});

test("a time the coach cancelled is not waiting to be marked", () => {
  // Nobody was expected, so there is nobody to mark absent.
  const off = { ...marking, slots: [slot("s1", at("2026-10-15T09:00:00"), { cancelledAt: at("2026-10-14T10:00:00") })] };
  assert.deepEqual(sessionsToMark(off, { nowMs: NOW }), []);
});

test("an empty session is not on the list", () => {
  // A time that was open and nobody took is not an attendance question.
  assert.deepEqual(sessionsToMark({ slots: [slot("s9", at("2026-10-15T09:00:00"))], bookings: [] }, { nowMs: NOW }), []);
});

test("the list has a horizon, so coming back from holiday is not a wall", () => {
  const old = { slots: [slot("s0", at("2026-09-01T09:00:00"))], bookings: [bk("b0", "s0")] };
  assert.deepEqual(sessionsToMark(old, { nowMs: NOW }), [], "a session six weeks old is still being asked about");
  assert.equal(sessionsToMark(old, { nowMs: NOW, withinDays: 60 }).length, 1,
    "the horizon cannot be widened when it is wanted");
});

test("everybody in one session is grouped under it", () => {
  const group = {
    slots: [slot("s1", at("2026-10-15T09:00:00"))],
    bookings: [bk("b1", "s1"), { ...bk("b2", "s1"), athleteId: "a2" }],
  };
  const rows = sessionsToMark(group, { nowMs: NOW });
  assert.equal(rows.length, 1, "one session is listed twice");
  assert.equal(rows[0].bookings.length, 2);
});

test("nothing, or nonsense, does not throw", () => {
  for (const b of [null, undefined, {}, { slots: null, bookings: null }]) {
    assert.deepEqual(sessionsToMark(b, { nowMs: NOW }), [], JSON.stringify(b));
  }
  assert.deepEqual(sessionsToMark({ slots: [slot("x", "not a date")], bookings: [bk("b", "x")] }, { nowMs: NOW }), []);
});

test("the coming-up list still shows the future only", () => {
  // The two lists answer different questions and must not drift into each
  // other. If groupSlotsByDay started including the past, "Coming Up" would
  // open with last Tuesday.
  const ids = groupSlotsByDay(marking.slots, { fromMs: NOW }).flatMap(g => g.slots).map(s => s.id);
  assert.deepEqual(ids, ["s3"]);
});

// ---------- the month ----------

test("a month is always six rows of seven days", () => {
  // Whatever the month. A grid that changes height makes everything below
  // it jump as you page through.
  for (const [y, m] of [[2026, 0], [2026, 1], [2026, 9], [2027, 1], [2024, 1]]) {
    const weeks = calendarMonth({ slots: [], year: y, month: m });
    assert.equal(weeks.length, 6, `${y}-${m + 1} has ${weeks.length} rows`);
    for (const w of weeks) assert.equal(w.length, 7);
  }
});

test("the week starts on Monday, like every other week in the app", () => {
  // getDay() is Sunday-first. Getting this wrong shifts the whole grid by a
  // day and is invisible in any month that happens to begin on a Sunday.
  // October 2026 begins on a Thursday.
  const weeks = calendarMonth({ slots: [], year: 2026, month: 9 });
  assert.equal(weeks[0][0].dateIso, "2026-09-28", "the grid does not start on the Monday before the 1st");
  assert.equal(weeks[0][3].dateIso, "2026-10-01");
  assert.equal(weeks[0][3].inMonth, true);
  assert.equal(weeks[0][0].inMonth, false);
});

test("a month that begins on a Monday is not pushed a week out", () => {
  // June 2026 begins on a Monday: lead must be 0, not 7.
  const weeks = calendarMonth({ slots: [], year: 2026, month: 5 });
  assert.equal(weeks[0][0].dateIso, "2026-06-01");
  assert.equal(weeks[0][0].inMonth, true);
});

test("a month that begins on a Sunday gets a full leading week", () => {
  // February 2026 begins on a Sunday, the worst case for a Monday-first
  // grid: six days of the previous month in front of it.
  const weeks = calendarMonth({ slots: [], year: 2026, month: 1 });
  assert.equal(weeks[0][0].dateIso, "2026-01-26");
  assert.equal(weeks[0][6].dateIso, "2026-02-01");
});

test("times land on the day they happen", () => {
  const weeks = calendarMonth({
    slots: [slot("s1", at("2026-10-15T09:00:00")), slot("s2", at("2026-10-15T17:30:00")), slot("s3", at("2026-10-20T09:00:00"))],
    year: 2026, month: 9,
  });
  const byIso = Object.fromEntries(weeks.flat().map(c => [c.dateIso, c]));
  assert.equal(byIso["2026-10-15"].slots.length, 2);
  assert.equal(byIso["2026-10-20"].slots.length, 1);
  assert.equal(byIso["2026-10-16"].slots.length, 0);
});

test("a day's times come back in the order they happen", () => {
  const weeks = calendarMonth({
    slots: [slot("pm", at("2026-10-15T17:30:00")), slot("am", at("2026-10-15T09:00:00"))],
    year: 2026, month: 9,
  });
  const day = weeks.flat().find(c => c.dateIso === "2026-10-15");
  assert.deepEqual(day.slots.map(s => s.id), ["am", "pm"]);
});

test("a cancelled time leaves no dot behind", () => {
  // Otherwise a month looks full of sessions that are not happening.
  const weeks = calendarMonth({
    slots: [slot("s1", at("2026-10-15T09:00:00"), { cancelledAt: at("2026-10-14T10:00:00") })],
    year: 2026, month: 9,
  });
  assert.equal(weeks.flat().find(c => c.dateIso === "2026-10-15").slots.length, 0);
});

test("today is marked, and only today", () => {
  const weeks = calendarMonth({ slots: [], year: 2026, month: 9, todayIso: "2026-10-15" });
  const marked = weeks.flat().filter(c => c.isToday).map(c => c.dateIso);
  assert.deepEqual(marked, ["2026-10-15"]);
});

test("the days either side of the month are shown, not blanked", () => {
  const weeks = calendarMonth({ slots: [], year: 2026, month: 9 });
  const cells = weeks.flat();
  assert.equal(cells.length, 42);
  assert.ok(cells.every(c => c.day >= 1 && c.day <= 31), "a cell has no date on it");
  assert.ok(cells.some(c => !c.inMonth), "the grid pretends the other weeks are empty");
});

test("a time with an unreadable date is dropped, not filed under a nonsense day", () => {
  // Counting the good one is not enough: toLocalISO of an invalid date
  // returns a string rather than throwing, so a skipped guard files the bad
  // slot under a key no cell ever looks up and the count still comes to one.
  const onlyBad = calendarMonth({ slots: [slot("bad", "nonsense")], year: 2026, month: 9 });
  assert.equal(onlyBad.flat().reduce((n, c) => n + c.slots.length, 0), 0,
    "a slot with an unreadable date was filed somewhere");
  const mixed = calendarMonth({ slots: [slot("bad", "nonsense"), slot("ok", at("2026-10-15T09:00:00"))], year: 2026, month: 9 });
  assert.deepEqual(mixed.flat().flatMap(c => c.slots.map(s => s.id)), ["ok"]);
});

// ---------- the two new server functions ----------

test("the migration says out loud that it is not applied", () => {
  assert.ok(/NOT YET APPLIED/.test(sql), "nothing warns that this one has not been run");
});

test("only the coach can fill their own time, and only with their own athlete", () => {
  // book_slot checks the CALLER is on the coach's roster. Here the caller is
  // the coach and the athlete is somebody else, so both ends need checking -
  // without the second, a coach could book a stranger, or another coach's
  // client, into their session.
  const fn = code.slice(code.indexOf("function public.book_athlete_into_slot"), code.indexOf("$$;"));
  assert.ok(/v_slot\.coach_id <> auth\.uid\(\)/.test(fn), "anybody can fill anybody's time");
  assert.ok(/where id = p_athlete_id and coach_id = auth\.uid\(\)/.test(fn),
    "a coach can book somebody who is not on their roster");
});

test("filling a time still respects capacity, and locks while it counts", () => {
  // Counting then acting without the lock is how two devices both read
  // "one space left" and both take it.
  const fn = code.slice(code.indexOf("function public.book_athlete_into_slot"), code.indexOf("$$;"));
  assert.ok(/from public\.availability_slots where id = p_slot_id for update/.test(fn),
    "capacity is counted without locking the slot");
  assert.ok(/if v_taken >= v_capacity then/.test(fn), "a coach can overfill a session");
  assert.ok(/raise exception 'That session is full\.'/.test(fn));
});

test("filling a time is allowed with no sessions left, on purpose", () => {
  // The opposite of book_slot, deliberately. A coach doing this is the
  // person who is owed, usually with "pay me next week" already said out
  // loud; refusing would send them back to paper. The booking still spends
  // a session, so the balance goes negative and the Packs screen shows it.
  const fn = code.slice(code.indexOf("function public.book_athlete_into_slot"), code.indexOf("$$;"));
  assert.ok(!/credits_remaining/.test(fn),
    "the coach is blocked by the athlete's balance, so they will book it on paper instead");
  assert.ok(/uses_credit = true|'booked', true/.test(fn), "the session is not counted against the pack");
});

test("the athlete is told when somebody else books for them", () => {
  const fn = code.slice(code.indexOf("function public.book_athlete_into_slot"), code.indexOf("$$;"));
  assert.ok(/insert into public\.notifications/.test(fn),
    "the athlete finds out by turning up, or not");
  assert.ok(/p_athlete_id, auth\.uid\(\), 'session_confirmed'/.test(fn),
    "the notification goes to the wrong person, or uses a kind the table refuses");
});

test("no-show takes a boolean, so it can be undone where it was done", () => {
  // One tap beside somebody's name, costing them a session they paid for
  // and a line on their record. A one-way door is not acceptable for that.
  assert.ok(/function public\.mark_no_show\(p_booking_id uuid, p_no_show boolean default true\)/.test(code),
    "marking a no-show cannot be undone");
  const fn = code.slice(code.indexOf("function public.mark_no_show"), code.lastIndexOf("$$;"));
  assert.ok(/case when p_no_show then 'no_show' else 'attended' end/.test(fn),
    "undoing a no-show does not settle on a status");
  // 'attended', not 'booked': the session is in the past either way, and
  // 'booked' would put it straight back on the list of things to mark.
  assert.ok(!/else 'booked'/.test(fn), "undoing puts the session back on the list to be marked again");
});

test("only the coach records who turned up", () => {
  const fn = code.slice(code.indexOf("function public.mark_no_show"), code.lastIndexOf("$$;"));
  assert.ok(/v_booking\.coach_id <> auth\.uid\(\)/.test(fn),
    "an athlete can mark themselves present, which makes the record worthless");
});

test("nobody can be marked absent from a session that has not happened", () => {
  const fn = code.slice(code.indexOf("function public.mark_no_show"), code.lastIndexOf("$$;"));
  assert.ok(/v_starts > now\(\)/.test(fn), "a future session can be marked as a no-show");
  assert.ok(/status in \('cancelled', 'late_cancelled'\)/.test(fn),
    "a cancelled session can be marked as a no-show, which charges twice");
});

test("the athlete is told about a no-show, and not about being marked present", () => {
  // Finding out from a balance one lower than expected is how a coach loses
  // a client over a misunderstanding. Being told you attended is noise.
  const fn = code.slice(code.indexOf("function public.mark_no_show"), code.lastIndexOf("$$;"));
  assert.ok(/if p_no_show then\n\s*insert into public\.notifications/.test(fn),
    "the no-show notification is unconditional or missing");
});

test("both functions are locked down the same way as the ten before them", () => {
  for (const sig of ["book_athlete_into_slot(uuid, uuid)", "mark_no_show(uuid, boolean)"]) {
    assert.ok(code.includes(`revoke all on function public.${sig} from public, anon;`), `${sig} is callable by anon`);
    assert.ok(code.includes(`grant execute on function public.${sig} to authenticated;`), `${sig} cannot be called at all`);
    const revokeAt = code.indexOf(`revoke all on function public.${sig}`);
    const grantAt = code.indexOf(`grant execute on function public.${sig}`);
    assert.ok(revokeAt < grantAt, `${sig}: the revoke comes after the grant and undoes it`);
  }
  assert.equal((code.match(/security definer/g) || []).length, 2, "a function is not security definer");
  assert.equal((code.match(/set search_path = public/g) || []).length, 2,
    "a security definer function has no fixed search_path, which is how it gets hijacked");
});

// ---------- the client calls them ----------

test("the client calls both functions, with the arguments they take", () => {
  assert.ok(/supabase\.rpc\("book_athlete_into_slot", \{\s*p_slot_id: slotId, p_athlete_id: athleteId,\s*\}\)/.test(src),
    "the direct-booking RPC is not called, or is called with the wrong arguments");
  assert.ok(/supabase\.rpc\("mark_no_show", \{\s*p_booking_id: bookingId, p_no_show: noShow,\s*\}\)/.test(src),
    "no-show is not called, or does not pass which way it is being marked");
});

test("a refused booking still refreshes the screen", () => {
  // "That session is full" means the screen was out of date. Leaving it
  // stale lets the coach tap straight into the same refusal.
  // Bounded by the end of the `if`, not by the end of the function. The
  // happy path refreshes too, so reading to the end of the function made
  // this assertion true whether or not the error path refreshed at all.
  const fn = src.slice(src.indexOf("async function bookAthleteIntoSlot("), src.indexOf("async function markNoShow("));
  const from = fn.indexOf("if (error) {");
  const errBlock = fn.slice(from, fn.indexOf("\n  }", from));
  assert.ok(/await loadBooking\(setState\);/.test(errBlock), "a stale screen stays stale after a refusal");
  assert.ok(/return error\.message/.test(errBlock), "the error block is not where this test thinks it is");
});

test("both answers are offered, in the same place", () => {
  const row = src.slice(src.indexOf("function AttendanceRow("), src.indexOf("function AddToSlotRow("));
  assert.ok(/onMark\(b\.id, false\)/.test(row), "there is no way to say somebody turned up");
  assert.ok(/onMark\(b\.id, true\)/.test(row), "there is no way to record a no-show");
});

test("the coach is warned before booking somebody who has nothing left", () => {
  // The server allows it on purpose. This is what makes sure it is a
  // decision rather than an accident.
  const row = src.slice(src.indexOf("function AddToSlotRow("), src.indexOf("function ScheduleMonth("));
  assert.ok(/const none = credits <= 0;/.test(row), "a zero balance looks the same as any other");
  assert.ok(/none \? "none left"/.test(row), "nothing says who is out of sessions");
  assert.ok(/balance goes negative/.test(row), "nothing explains what booking them anyway does");
});

test("somebody already in the session is not offered again", () => {
  const row = src.slice(src.indexOf("function AddToSlotRow("), src.indexOf("function ScheduleMonth("));
  assert.ok(/const already = new Set\(heldBookings\(bookings, slot\.id\)\.map\(b => b\.athleteId\)\)/.test(row),
    "the list offers people who are already booked in");
  assert.ok(/if \(left === 0 \|\| free\.length === 0\) return null;/.test(row),
    "a full session still invites the coach to add somebody to it");
});

test("the attendance list is above the forms, and the month above the list", () => {
  const tab = src.slice(src.indexOf('{tab === "schedule" && ('), src.indexOf('{tab === "types" && ('));
  const markAt = tab.indexOf("{toMark.length > 0 && (");
  const formAt = tab.indexOf("<NewSlotForm");
  const monthAt = tab.indexOf("<ScheduleMonth");
  const listAt = tab.indexOf("{dayList.length === 0 ? (");
  assert.ok(markAt > 0 && formAt > markAt, "the sessions waiting to be marked are below the forms");
  assert.ok(monthAt > formAt && listAt > monthAt, "the month is not above the list of times");
});

test("picking a day shows that whole day, past times included", () => {
  // The grid shows dots on days that have already happened. Tapping one and
  // getting an empty list because the day list only holds the future is the
  // obvious bug here, and it reads as the grid lying.
  const block = src.slice(src.indexOf("const dayList = pickedDay"), src.indexOf("const tabs = ["));
  assert.ok(/toLocalISO\(new Date\(s\.startsAt\)\) === pickedDay/.test(block),
    "a picked day is filtered by something other than its date");
  assert.ok(!/groupSlotsByDay/.test(block),
    "a picked day goes through the future-only grouping, so past days come back empty");
  assert.ok(/: days;/.test(block), "with no day picked the list is no longer what is coming up");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
