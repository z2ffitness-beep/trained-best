// 30 Oct: templates on, message everyone, ask for more sessions, Stop only
// while timing, no Roster Overview, no athlete "More" section.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "src", "App.jsx"), "utf8");
let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);
const body = (name) => { const i = src.indexOf(`function ${name}(`); assert.ok(i > 0, `${name} missing`); return src.slice(i, src.indexOf("\n}\n", i)); };

test("templates are on", () => assert.match(src, /programTemplates: true,/));

test("giving a program makes a copy per client, never shares one row", () => {
  assert.match(body("giveProgramToAthlete"), /assignTemplateToAthlete\(\{ template: source, athlete, coachId, state \}\)/);
  assert.match(body("GiveProgramModal"), /for \(const id of picked\)/);
});

test("a client can start from a template or another client's program", () => {
  const b = body("CopyProgramModal");
  assert.match(b, /isTemplate\(p\) && isSavedTemplate\(p\)/);
  assert.match(b, /a\.id !== athlete\.id && a\.program/);
});

test("a client's program can be saved as a template", () => {
  assert.match(body("saveProgramAsTemplate"), /athlete_id: null/);
});

test("templates are changed in the same one place: the board and the AI", () => {
  const b = body("CoachPrograms");
  assert.match(b, /<ProgramBoardWithAI state=\{state\} setState=\{setState\} program=\{prog\} authorId=\{myUserId\}/);
});

test("message everyone writes one row per client, in their own thread", () => {
  const b = body("BroadcastModal");
  assert.match(b, /picked\.map\(id => \(\{ athlete_id: id, sender_id: myUserId, body \}\)\)/);
});

test("a client out of sessions can ask for more in one tap", () => {
  assert.match(body("AthleteBooking"), /Can I get another pack\?/);
});

test("Stop only shows while the workout is timed", () => {
  assert.match(src, /\(timerIsLive \|\| timerMode === "counting"\) &&\n\s*<button onClick=\{openStop\}/);
});

test("no Roster Overview on the coach, no More on the athlete Profile", () => {
  assert.ok(!/>Roster Overview</.test(src));
  const p = body("AthleteProfile");
  assert.ok(!/>More</.test(p));
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`✖ ${name}\n  ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
