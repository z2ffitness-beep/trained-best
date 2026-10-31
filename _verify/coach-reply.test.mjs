// A coach replying to a logged session and fixing a wrong number (Isaiah,
// 28 Oct). Every change goes through coach_update_session, which allows only
// the note and a set's weight or reps (migration 012).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "src", "App.jsx"), "utf8");
const sql = fs.readFileSync(path.join(here, "..", "supabase", "migrations", "012_coach_session_reply.sql"), "utf8");

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);
const body = (name) => {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i > 0, `${name} is missing`);
  return src.slice(i, src.indexOf("\n}\n", i));
};

test("every place logs are read carries the coach's reply", () => {
  assert.equal((src.match(/coachNote: l\.coach_note \|\| null/g) || []).length, 3);
});

test("the coach's change goes through the one function, never a table update", () => {
  const b = body("CoachSessionModal");
  assert.match(b, /supabase\.rpc\("coach_update_session"/);
  assert.ok(!/from\("workout_logs"\)|from\("workout_sets"\)/.test(b), "the modal writes the tables directly");
});

test("only sets that actually changed are sent", () => {
  const b = body("CoachSessionModal");
  assert.match(b, /if \(weight === \(st\.weight \?\? null\) && reps === \(st\.reps \?\? null\)\) return;/);
});

test("the coach's page offers it, and the athlete sees it on Home", () => {
  assert.match(src, /<SessionLogRow key=\{l\.id\} log=\{l\} onCoachEdit=\{setReplyLog\} \/>/);
  assert.match(src, /\{!isCoach && <CoachReplyCard logs=\{state\.workoutLogs\} \/>\}/);
});

test("the database function only lets this athlete's coach in", () => {
  assert.match(sql, /where id = v_owner and coach_id = auth\.uid\(\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /revoke all on function public\.coach_update_session\(uuid, text, jsonb\) from public, anon;/);
});

test("the database function keeps the per-set rows in step and tells the athlete", () => {
  assert.match(sql, /update public\.workout_sets/);
  assert.match(sql, /'session_note'/);
});

test("the athlete's notification has a wording", () => {
  assert.match(body("describeNotification"), /n\?\.kind === "session_note"/);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`✖ ${name}\n  ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
