// Who needs the coach today.
//
// The coach's question on opening the app is "is anybody stuck". The answer
// used to be spread across four screens and one of the signals - an athlete
// whose programme never built - was on no screen at all.
//
// Everything here is about being WRONG in one of two directions, and both
// cost something real:
//
//   Accusing somebody who did nothing wrong. "Missed a session" for an
//   athlete who moved Tuesday to Thursday and trained on Thursday. The coach
//   messages them about it, and the athlete learns the app lies.
//
//   Missing somebody who is stuck. An athlete whose programme failed to
//   generate at signup can do nothing at all, and nothing anywhere said so.
//
// The ordering matters for the same reason: an athlete with no programme
// cannot train, so they cannot be below one who has not finished today's
// session yet.
import assert from "node:assert/strict";
import { readSource, load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);

const { coachAttention, attentionNeeded, QUIET_DAYS, addDaysISO, isDayScheduledOn } = await load(APP, [
  { name: "WEEKDAY_ORDER", kind: "const" },
  { name: "toLocalISO", kind: "const" },
  { name: "todayISO", kind: "const" },
  "daysBetweenISO", "addDaysISO",
  "weekStartFor", "shiftDays",
  "skipRangeEnd", "isDateInSkipRange", "isDayScheduledOn",
  "sessionKey", "sessionIdentity",
  { name: "PLAN_STATUS", kind: "const" },
  "moveFor", "logFor", "planForWeek", "missedSessions",
  { name: "COUNTS_THRESHOLD", kind: "const" }, "logCounts",
  "athleteNeedsProgram",
  { name: "formatLogDate", kind: "const" },
  { name: "ATTENTION_KINDS", kind: "const" },
  { name: "ATTENTION_RANK", kind: "const" },
  { name: "ATTENTION_TONE", kind: "const" },
  { name: "QUIET_DAYS", kind: "const" },
  "coachAttention", "attentionNeeded",
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// A Thursday, so "the rest of the week" and "earlier in the week" are both
// real rather than edge cases.
const TODAY = "2026-10-15"; // Thursday
const back = n => addDaysISO(TODAY, -n);

// A programme that trains Monday, Wednesday and Friday, started well before
// today so nothing is excluded for being before the beginning.
const mwf = {
  id: "p1", startedOn: "2026-09-01",
  days: [
    { id: "d1", name: "Lower Body", weekday: "Monday" },
    { id: "d2", name: "Upper Push", weekday: "Wednesday" },
    { id: "d3", name: "Full Body", weekday: "Friday" },
  ],
};

const athlete = (over = {}) => ({
  id: "a1", name: "Sam Okafor", avatar: "SO", photoUrl: null,
  program: "p1", intake: {}, workoutLogs: [], sessionMoves: [], lastActive: null,
  ...over,
});
const log = (date, programDay) => ({ date, programDay, setsCompleted: 8, setsPrescribed: 10 });

// Every scheduled day up to and including `upTo`, so an athlete can be built
// who is fully up to date and therefore on nobody's list.
const caughtUp = (upTo = TODAY) => {
  const out = [];
  for (let i = 0; i <= 21; i++) {
    const d = addDaysISO(upTo, -i);
    const day = mwf.days.find(x => isDayScheduledOn(x, d));
    if (day) out.push(log(d, day.name));
  }
  return out;
};

const stateOf = (athletes) => ({ athletes, programs: [mwf] });
const kindsFor = (athletes, today = TODAY) => coachAttention(stateOf(athletes), today).map(r => r.kind);

// ---------- somebody who cannot train at all ----------

test("an athlete with no programme is on the list", () => {
  const rows = coachAttention(stateOf([athlete({ program: null })]), TODAY);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "no_program");
  assert.equal(rows[0].tone, "bad");
});

test("a programme that failed to build is told apart from one nobody made", () => {
  // The two need different things from the coach: one is a retry, the other
  // is a programme. Showing them the same way means the coach builds one by
  // hand for somebody whose generation would have worked on a second try.
  const rows = coachAttention(stateOf([
    athlete({ id: "a1", name: "Ann", program: null }),
    athlete({ id: "a2", name: "Bo", program: null, intake: { programBuildFailed: { message: "timed out" } } }),
  ]), TODAY);
  assert.deepEqual(rows.map(r => r.kind), ["no_program", "program_failed"].sort());
  const bo = rows.find(r => r.athleteId === "a2");
  assert.equal(bo.kind, "program_failed");
  assert.match(bo.label, /failed/i);
});

test("an athlete pointing at a programme that did not load is not dropped", () => {
  // Silently skipping them is the worst option: a real athlete disappears
  // off the only screen that was supposed to find them.
  const rows = coachAttention({ athletes: [athlete({ program: "gone" })], programs: [] }, TODAY);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "no_program");
});

test("no programme is reported once, not alongside everything else", () => {
  // They have also never trained and also have nothing due. Listing three
  // rows for one athlete buries the one the coach can act on.
  assert.deepEqual(kindsFor([athlete({ program: null })]), ["no_program"]);
});

// ---------- missed, and not missed ----------

test("a missed session is reported", () => {
  // Trained Monday, programme also wanted Wednesday, today is Thursday.
  const a = athlete({ workoutLogs: [log(back(3), "Lower Body")], lastActive: back(3) });
  const rows = coachAttention(stateOf([a]), TODAY);
  assert.equal(rows[0].kind, "missed");
  assert.match(rows[0].label, /Missed/);
});

test("a session that was MOVED and then trained is not called missed", () => {
  // THE test here. Without the athlete's moves, a session shifted from
  // Wednesday to Thursday reads as missed on Wednesday, and the coach
  // messages somebody who did exactly what they said they would.
  // Up to date through Monday, then Wednesday's session was moved to today
  // and trained today.
  const moved = athlete({
    workoutLogs: [log(TODAY, "Upper Push"), ...caughtUp(back(3))],
    sessionMoves: [{ programDay: "Upper Push", fromDate: back(1), toDate: TODAY, kind: "move" }],
    lastActive: TODAY,
  });
  const kinds = kindsFor([moved]);
  assert.ok(!kinds.includes("missed"), `reported as missed: ${JSON.stringify(coachAttention(stateOf([moved]), TODAY))}`);
});

test("an athlete who is up to date is on nobody's list of problems", () => {
  const a = athlete({ workoutLogs: caughtUp(), lastActive: TODAY });
  const rows = coachAttention(stateOf([a]), TODAY);
  assert.equal(attentionNeeded(rows), 0, `flagged: ${rows.map(r => r.kind).join(", ")}`);
});

test("the number of missed sessions is counted, not just that there was one", () => {
  // "Missed 3 sessions" and "missed a session" are different conversations.
  const a = athlete({ workoutLogs: [], lastActive: null, intake: {} });
  // Give them one old log so they are not "never trained", then nothing.
  a.workoutLogs = [log(back(20), "Full Body")];
  a.lastActive = back(20);
  const rows = coachAttention(stateOf([a]), TODAY);
  assert.equal(rows[0].kind, "missed");
  assert.match(rows[0].label, /Missed \d+ sessions/);
});

// ---------- never started, and gone quiet ----------

test("somebody who never started is not described as having missed sessions", () => {
  // They have, technically. But "has not trained yet" is what is true and
  // what tells the coach what to do, and a brand-new athlete greeted with
  // "missed 4 sessions" is being told off for signing up on a Thursday.
  const joined = athlete({ workoutLogs: [], lastActive: null });
  const programFromToday = { ...mwf, startedOn: TODAY };
  const rows = coachAttention({ athletes: [joined], programs: [programFromToday] }, TODAY);
  assert.equal(rows[0].kind, "never_trained");
});

test("silence is reported once it has gone on long enough", () => {
  // A programme with no days this week cannot produce a missed session, so
  // without this an athlete could drift away unnoticed.
  const noDays = { id: "p1", startedOn: "2026-09-01", days: [] };
  const quiet = athlete({ workoutLogs: [log(back(QUIET_DAYS), "Full Body")], lastActive: back(QUIET_DAYS) });
  const rows = coachAttention({ athletes: [quiet], programs: [noDays] }, TODAY);
  assert.equal(rows[0].kind, "quiet");
  assert.match(rows[0].label, new RegExp(`${QUIET_DAYS} days`));

  const recent = athlete({ workoutLogs: [log(back(QUIET_DAYS - 1), "Full Body")], lastActive: back(QUIET_DAYS - 1) });
  const ok = coachAttention({ athletes: [recent], programs: [noDays] }, TODAY);
  assert.equal(attentionNeeded(ok), 0, "flagged one day before the threshold");
});

// ---------- today ----------

test("today's session shows as due, and as done once it is logged", () => {
  const fri = "2026-10-16"; // Friday, which this programme trains
  const due = athlete({ workoutLogs: caughtUp(back(1)), lastActive: back(1) });
  assert.ok(kindsFor([due], fri).includes("due_today"));

  const done = athlete({ workoutLogs: [...caughtUp(back(1)), log(fri, "Full Body")], lastActive: fri });
  const kinds = kindsFor([done], fri);
  assert.ok(kinds.includes("trained_today"));
  assert.ok(!kinds.includes("due_today"));
  // And having trained is never something the coach is asked to deal with.
  assert.equal(attentionNeeded(coachAttention(stateOf([done]), fri)), 0,
    "an athlete who trained today is counted as needing the coach");
});

test("due today is not counted as needing the coach", () => {
  // At 9am on a training day, every athlete is "due today". Counting those
  // would say "11 need you" on a morning when nothing is wrong, and the
  // number would mean nothing within a week.
  const fri = "2026-10-16";
  const due = athlete({ workoutLogs: caughtUp(back(1)), lastActive: back(1) });
  const rows = coachAttention(stateOf([due]), fri);
  assert.ok(rows.some(r => r.kind === "due_today"));
  assert.equal(attentionNeeded(rows), 0);
});

test("a rest day puts nobody on the list at all", () => {
  const sun = "2026-10-18";
  const a = athlete({ workoutLogs: caughtUp("2026-10-16"), lastActive: "2026-10-16" });
  assert.deepEqual(kindsFor([a], sun), []);
});

// ---------- the order ----------

test("whoever is most stuck is at the top", () => {
  // Names deliberately in the OPPOSITE order to how stuck they are, so a
  // plain alphabetical sort cannot pass this by accident.
  const fri = "2026-10-16";
  const rows = coachAttention(stateOf([
    athlete({ id: "d", name: "Ada", workoutLogs: caughtUp(back(1)), lastActive: back(1) }),            // due today
    athlete({ id: "c", name: "Mia", workoutLogs: [log(back(20), "Full Body")], lastActive: back(20) }), // missed
    athlete({ id: "b", name: "Zoe", program: null }),                                                   // no programme
  ]), fri);
  assert.deepEqual(rows.map(r => r.athleteId), ["b", "c", "d"]);
  assert.deepEqual(rows.map(r => r.name), ["Zoe", "Mia", "Ada"]);
});

test("two athletes in the same state are ordered by name, every time", () => {
  // Not by whatever order the roster loaded in. A list that reshuffles
  // between renders cannot be read at a glance.
  const rows = coachAttention(stateOf([
    athlete({ id: "z", name: "Zoe", program: null }),
    athlete({ id: "a", name: "Ada", program: null }),
    athlete({ id: "m", name: "Mia", program: null }),
  ]), TODAY);
  assert.deepEqual(rows.map(r => r.name), ["Ada", "Mia", "Zoe"]);
});

test("every kind has a rank and a tone, and the ranks say what they mean", () => {
  for (const { kind, rank, tone } of ATTENTION_KINDS_LIST()) {
    assert.equal(typeof rank, "number", `${kind} has no rank`);
    assert.ok(["bad", "warn", "info", "good"].includes(tone), `${kind} has tone "${tone}"`);
  }
  // Can't train < missed < drifting < today.
  assert.ok(rankOf("no_program") < rankOf("missed"));
  assert.ok(rankOf("missed") < rankOf("quiet"));
  assert.ok(rankOf("quiet") < rankOf("due_today"));
  assert.ok(rankOf("due_today") < rankOf("trained_today"));
});

function ATTENTION_KINDS_LIST() {
  const at = src.indexOf("const ATTENTION_KINDS = [");
  const block = src.slice(at, src.indexOf("];", at));
  return [...block.matchAll(/\{ kind: "(\w+)", rank: (\d+), tone: "(\w+)" \}/g)]
    .map(m => ({ kind: m[1], rank: Number(m[2]), tone: m[3] }));
}
const rankOf = k => ATTENTION_KINDS_LIST().find(x => x.kind === k).rank;

// ---------- counting ----------

test("the count is of problems, not of rows", () => {
  const fri = "2026-10-16";
  const rows = coachAttention(stateOf([
    athlete({ id: "b", name: "Bo", program: null }),
    athlete({ id: "d", name: "Dee", workoutLogs: caughtUp(back(1)), lastActive: back(1) }),
  ]), fri);
  assert.equal(rows.length, 2);
  assert.equal(attentionNeeded(rows), 1);
});

test("nothing wrong is zero, not an empty-looking one", () => {
  assert.equal(attentionNeeded([]), 0);
  assert.equal(attentionNeeded(null), 0);
  assert.equal(attentionNeeded(undefined), 0);
});

test("an empty roster is an empty list, not a crash", () => {
  assert.deepEqual(coachAttention({ athletes: [], programs: [] }, TODAY), []);
  assert.deepEqual(coachAttention({}, TODAY), []);
  assert.deepEqual(coachAttention(null, TODAY), []);
});

// ---------- the data it needs is actually loaded ----------

test("the coach's device loads its athletes' session moves", () => {
  // Without this query every move an athlete makes is invisible to
  // coachAttention, and the "moved, not missed" test above passes against
  // data the real app never has.
  assert.ok(/supabase\.from\("session_moves"\)\.select\("\*"\)\.in\("user_id", ids\)/.test(src),
    "athletes' session moves are never fetched, so every move reads as a missed session");
  assert.ok(/sessionMoves: movesByAthlete\[a\.id\] \|\| \[\]/.test(src),
    "the moves are fetched and then not put on the athlete");
  // Same shape as the athlete's own, so planForWeek reads both identically.
  assert.ok(/programDay: m\.program_day, fromDate: m\.from_date, toDate: m\.to_date, kind: m\.kind/.test(src));
});

test("the panel is on the dashboard, above the counts", () => {
  const dash = src.slice(src.indexOf("function CoachDashboard("), src.indexOf("function withNextSession("));
  const panelAt = dash.indexOf("<AttentionPanel");
  const statsAt = dash.indexOf("<StatCard icon={Users}");
  assert.ok(panelAt > 0, "the attention panel is not on the dashboard");
  assert.ok(statsAt > panelAt, "the athlete count is still the first thing a coach sees");
});

test("one definition of whether an athlete needs a programme", () => {
  assert.ok(/const needs = athleteNeedsProgram\(a\);/.test(src),
    "coachAttention decides this itself, so it can disagree with the roster about the same athlete");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
