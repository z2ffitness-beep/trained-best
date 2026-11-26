// Isaiah, 25 Nov: coaches need alerts about their clients, in layers apart
// from what athletes get: who trains today, who missed, who logged, who joined,
// and a weekly nudge to check in on anyone who has gone quiet.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = fs.readFileSync(path.join(root, "src", "App.jsx"), "utf8");
const sql = fs.readFileSync(path.join(root, "supabase", "migrations", "023_coach_alerts.sql"), "utf8");
let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);

test("the migration only adds, and keeps every existing kind", () => {
  for (const k of ["coach_today", "coach_missed", "coach_checkin", "client_joined"]) assert.ok(sql.includes(`'${k}'`), k);
  for (const k of ["session_completed", "session_due", "coach_message", "program_changed", "session_confirmed", "sessions_today", "session_today", "session_note", "message", "session_reminder", "session_missed"]) assert.ok(sql.includes(`'${k}'`), "keeps " + k);
  assert.ok(!/drop\s+(table|column)|delete\s+from|truncate|alter\s+column/i.test(sql));
});

test("never overbearing: once a day each, at set hours, in the coach's time zone, each switchable", () => {
  assert.match(sql, /if v_hour = 7 and coalesce\(c\.intake->'notify'->>'today', 'true'\) <> 'false'/);
  assert.match(sql, /if v_hour = 20 and coalesce\(c\.intake->'notify'->>'missed', 'true'\) <> 'false'/);
  assert.match(sql, /if v_hour = 9 and extract\(isodow from v_today\) = 1/);
  assert.match(sql, /intake->'notify'->>'sessions' = 'false'/);
  assert.match(sql, /intake->'notify'->>'joined' = 'false'/);
  assert.equal((sql.match(/\(created_at at time zone v_tz\)::date = v_today\)/g) || []).length, 3, "one of each a day");
  assert.match(sql, /cron\.schedule\('coach-digests', '7 \* \* \* \*'/);
});

test("nobody in the app can run the jobs", () => {
  assert.match(sql, /revoke execute on function public\.notify_coach_digests\(\) from public, anon, authenticated/);
  assert.match(sql, /revoke execute on function public\.profiles_notify_joined\(\) from public, anon, authenticated/);
});

test("coach Profile has a switch for each alert; solo athletes don't see a coach-messages switch", () => {
  for (const k of ['["today", "Clients training today"', '["missed", "Missed sessions"', '["sessions", "Sessions logged"', '["joined", "New clients"', '["checkin", "Weekly check-in"']) assert.ok(src.includes(k), k);
  assert.ok(src.includes("...(notify?.solo ? [] : [[\"messages\", \"Messages\", \"When your coach messages you\"]]),"));
  assert.ok(src.includes('const NOTIFY_KEYS = ["reminders", "messages", "today", "missed", "sessions", "joined", "checkin"];'));
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
