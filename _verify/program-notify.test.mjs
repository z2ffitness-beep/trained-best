// Telling the athlete their program changed.
//
// The mirror of the notice that already went athlete -> coach when a session
// was completed. Nothing went the other way, so a coach could rewrite an
// athlete's whole week and the athlete found out by opening Program and
// noticing it was different.
//
// Most of the real work is in the database function, where it belongs: who is
// allowed to send one, and not sending twenty while a coach reworks a session.
// What this file pins is the client half - that every path which writes a
// program sends one, that none of them send on a failed write, and that the
// notice renders rather than falling through to a bare "Notification".
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

const fnBody = (name) => {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at > -1, `${name} is gone`);
  const rest = src.slice(at);
  return rest.slice(0, rest.indexOf("\n}\n"));
};

// ---------- every write path sends one ----------

test("a manual edit notifies", () => {
  const b = fnBody("updateProgramRow");
  assert.ok(/notifyAthleteOfProgramChange\(programId, summary\)/.test(b),
    "the single path for every reorder and swap sends nothing");
});

test("a new program notifies", () => {
  const b = fnBody("createProgramRow");
  assert.ok(/notifyAthleteOfProgramChange\(data\.id/.test(b),
    "a brand new program is the biggest change there is");
});

test("a rename notifies", () => {
  const b = fnBody("queueProgramRename");
  assert.ok(/notifyAthleteOfProgramChange\(programId, `Renamed to \$\{name\}`\)/.test(b));
});

// ---------- but never on a write that failed ----------

test("a failed edit stays quiet", () => {
  const b = fnBody("updateProgramRow");
  assert.ok(/if \(!error\) notifyAthleteOfProgramChange/.test(b),
    "sending on a failed write points the athlete at something unchanged");
});

test("a failed rename stays quiet", () => {
  const b = fnBody("queueProgramRename");
  assert.ok(/else notifyAthleteOfProgramChange/.test(b),
    "the notice must be on the else of the error branch");
});

test("a program saved but not made active stays quiet", () => {
  const b = fnBody("createProgramRow");
  const link = b.indexOf("linkError");
  const notify = b.indexOf("notifyAthleteOfProgramChange");
  assert.ok(link > -1 && notify > link,
    "notifying before active_program_id is set points at a program they cannot open");
  // and the early return for a failed link has to come first
  const guard = b.indexOf("return null;", link);
  assert.ok(guard > -1 && guard < notify, "the failed-link return must come before the notice");
});

// ---------- it cannot fail the thing it reports on ----------

test("the sender swallows its own failure", () => {
  const b = fnBody("notifyAthleteOfProgramChange");
  assert.ok(/try \{/.test(b) && /catch/.test(b),
    "an unhandled rejection here fails the coach's save");
  assert.ok(/if \(!programId\) return;/.test(b), "no program id, nothing to send");
});

test("nothing awaits it", () => {
  // Deliberately not awaited at any call site: the coach's save must not wait
  // on a notification round trip.
  for (const m of src.match(/.*notifyAthleteOfProgramChange\(.*/g) || []) {
    if (/^async function/.test(m.trim())) continue;
    assert.ok(!/await notifyAthleteOfProgramChange/.test(m), `awaited at: ${m.trim()}`);
  }
});

test("it calls the function that was actually created", () => {
  const b = fnBody("notifyAthleteOfProgramChange");
  assert.ok(/supabase\.rpc\("notify_athlete_program_changed"/.test(b));
  assert.ok(/p_program_id:/.test(b) && /p_summary:/.test(b),
    "argument names must match the function signature or Postgres refuses the call");
});

test("permission is not decided in the client", () => {
  const b = fnBody("notifyAthleteOfProgramChange");
  assert.ok(!/coach_id|coachId|role ===/.test(b),
    "who may send one is the database's call; a client-side check can be skipped");
});

// ---------- it renders ----------

test("the new kind has its own wording", () => {
  const b = fnBody("describeNotification");
  assert.ok(/n\?\.kind === "program_changed"/.test(b),
    "without this it falls through to a generic Notification row");
});

test("the detail line is never empty", () => {
  const b = fnBody("describeNotification");
  const branch = b.slice(b.indexOf('"program_changed"'));
  assert.ok(/d\.summary \|\| d\.programName \|\| "/.test(branch),
    "a notice with no summary and no program name would render a blank line");
});

test("an unknown kind still degrades to its stored title", () => {
  const b = fnBody("describeNotification");
  assert.ok(/return \{ title: n\.title \|\| "Notification"/.test(b),
    "a kind written by a later build must not render blank in this one");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
