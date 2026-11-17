// Isaiah, 17 Nov: a coach in the room runs the client's session on the
// coach's own phone and ticks it off. Same workout screen, pointed at the
// client; saved through coach_log_session; marked as logged by the coach.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load, readSource } from "./extract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const sql = fs.readFileSync(path.join(here, "..", "supabase", "migrations", "021_coach_logs_session.sql"), "utf8");
const H = await load(APP, ["clientWorkoutView", "loggedToday"]);

let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);

const coachState = {
  me: { id: "coach1", name: "Isaiah", unitPref: "lb", program: null, intake: { equipment: [] } },
  programs: [{ id: "p1", days: [] }], workoutLogs: [], sessionMoves: [], exercises: [],
  coachProfile: { id: "coach1" },
  athletes: [{ id: "a1", name: "Mitch Lee", program: "p1", streak: 4, intake: { trainingDays: ["Monday"], workoutTimer: false },
    workoutLogs: [{ id: "l1", date: "2026-11-17", programDay: "Day 1 — Full Body" }], sessionMoves: [] }],
};

test("the workout screen sees the client, not the coach", () => {
  const v = H.clientWorkoutView(coachState, coachState.athletes[0]);
  assert.equal(v.me.id, "a1");
  assert.equal(v.me.program, "p1");
  assert.equal(v.me.coachId, "coach1");
  assert.equal(v.me.selfGuided, false);
  assert.equal(v.me.unitPref, "lb", "the coach's unit, since the coach is typing");
  assert.equal(v.workoutLogs, coachState.athletes[0].workoutLogs, "last time comes from the client's history");
  assert.equal(v.coachProfile, null);
});

test("a session already logged today is spotted", () => {
  assert.ok(H.loggedToday(coachState.athletes[0], "Day 1 — Full Body", "2026-11-17"));
  assert.equal(H.loggedToday(coachState.athletes[0], "Day 2 — Full Body", "2026-11-17"), null);
});

test("the save goes through coach_log_session, not a direct insert, and skips the client-only writes", () => {
  assert.ok(src.includes('supabase.rpc("coach_log_session", { p_athlete: coachFor.id, p_log: row, p_sets: setRows })'));
  assert.ok(src.includes("if (!coachFor && isTransientError(error) && queuePendingLog("));
  assert.ok(src.includes("if (!queued && !coachFor) {"), "no second sets write, no streak write, no notify-the-coach");
  assert.ok(src.includes("if (!coachFor) await saveLiftUnit("), "the coach's unit switch does not change the client's setting");
  assert.ok(src.includes("{state.me.coachId && !coachFor && ("), "no form check video from the coach's phone");
});

test("the coach can get in and out", () => {
  assert.ok(src.includes('"coach-session": <CoachSession state={state} setState={setState} nav={nav} athleteId={navParam} />'));
  assert.ok(src.includes('onClick={() => nav.go("coach-session", athlete.id)}'));
  assert.ok(src.includes("{coachFor && <CoachSessionBanner name={coachFor.name} onExit={onExit} />}"));
  assert.ok(src.includes('"coach-session": "coach-athletes"'));
});

test("both sides see who logged it", () => {
  assert.equal((src.match(/loggedBy: l\.logged_by \|\| null/g) || []).length, 3);
  assert.ok(src.includes("Logged by the coach during the session"));
});

test("the database side: new nullable column, roster-only function, nothing existing changed", () => {
  assert.match(sql, /add column if not exists logged_by uuid references public\.profiles\(id\) on delete set null/);
  assert.match(sql, /where id = p_athlete and coach_id = me/);
  assert.match(sql, /security definer/);
  assert.match(sql, /revoke execute on function public\.coach_log_session\(uuid, jsonb, jsonb\) from public, anon/);
  assert.ok(!/drop |alter column|update public\.workout_logs|delete from/i.test(sql), "nothing existing is changed or dropped");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
