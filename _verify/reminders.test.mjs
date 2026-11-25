// Isaiah, 25 Nov: reminders "just like any other app, nothing overbearing",
// message alerts, and a Home card that gets people to add the app to their
// home screen and turn notifications on.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = fs.readFileSync(path.join(root, "src", "App.jsx"), "utf8");
const sql = fs.readFileSync(path.join(root, "supabase", "migrations", "022_reminders_and_message_alerts.sql"), "utf8");
const pilot = fs.readFileSync(path.join(root, "public", "pilot.html"), "utf8");
let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);

test("the migration only adds: three kinds, a trigger, two functions and a job", () => {
  for (const k of ["'message'", "'session_reminder'", "'session_missed'"]) assert.ok(sql.includes(k), k);
  for (const k of ["'session_completed'", "'session_due'", "'coach_message'", "'program_changed'", "'session_confirmed'", "'sessions_today'", "'session_today'", "'session_note'"]) assert.ok(sql.includes(k), "keeps " + k);
  assert.ok(!/drop\s+(table|column)|delete\s+from|truncate|alter\s+column/i.test(sql));
  assert.match(sql, /after insert on public\.messages/);
  assert.match(sql, /cron\.schedule\('athlete-reminders', '5 \* \* \* \*'/);
});

test("never overbearing: one reminder a day, 7 am and 6 pm only, switchable, bursts collapse", () => {
  assert.match(sql, /if v_hour not in \(7, 18\) then/);
  assert.match(sql, /kind in \('session_reminder', 'session_missed'\)\s+and \(created_at at time zone v_tz\)::date = v_today/);
  assert.match(sql, /intake->'notify'->>'reminders', 'true'\) <> 'false'/);
  assert.match(sql, /intake->'notify'->>'messages' = 'false'/);
  assert.match(sql, /interval '2 minutes'/);
});

test("nobody in the app can run the job or the trigger function", () => {
  assert.match(sql, /revoke execute on function public\.notify_athlete_reminders\(\) from public, anon, authenticated/);
  assert.match(sql, /revoke execute on function public\.messages_notify\(\) from public, anon, authenticated/);
});

test("Home asks to add it to the home screen and turn notifications on, for clients and coaches", () => {
  assert.ok(src.includes("{!isCoach && <div className=\"px-5 pt-3\"><SetupPhoneCard userId={state.me.id} /></div>}"));
  assert.ok(src.includes("<SetupPhoneCard userId={state.me.id} forCoach />"));
  assert.ok(src.includes("Add to Home Screen"));
  assert.ok(src.includes("Add to Home screen"));
  assert.ok(src.includes('if (snoozed || status === "on" || status === "checking") return null;'), "gone once it's on");
});

test("Profile has a switch for each kind, and the phone's time zone is saved", () => {
  assert.equal((src.match(/onNotifyChange=\{\(next\) => saveNotifyPrefs\(setState, next\)\}/g) || []).length, 2);
  assert.ok(src.includes('supabase.rpc("set_profile_setting", { p_key: "timezone", p_value: tz })'));
  assert.ok(src.includes("savePhoneTimeZone(state.me?.intake)"));
});

test("the pilot guide puts the home screen first and notifications after signup", () => {
  const a = pilot.indexOf("Add it to your home screen first"), b = pilot.indexOf("Pick \"I have a coach\""), c = pilot.indexOf("Turn on notifications");
  assert.ok(a > 0 && b > a && c > b);
  assert.ok(pilot.includes("Already signed up?"));
});

test("signup asks on the program-building screen, and the icon picks the build back up", () => {
  assert.ok(src.includes("{authUserId && <div className=\"w-full max-w-md mt-6\"><SetupPhoneCard userId={authUserId} atSignup /></div>}"));
  assert.ok(src.includes('"While you wait: turn on notifications"'));
  assert.ok(src.includes('.eq("user_id", id).is("for_athlete_id", null).gt("created_at", since)'), "a build started in Safari is found from the home screen app");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
