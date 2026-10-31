// Doing a future workout today (Isaiah, 28 Oct): a wedding on Saturday, so
// Saturday's session is done on Thursday. It is a "pull": the session leaves
// Saturday and shows on Thursday.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = fs.readFileSync(APP, "utf8");
const H = await load(APP, [
  { name: "WEEKDAY_ORDER", kind: "const" }, { name: "toLocalISO", kind: "const" },
  "shiftDays", "skipRangeEnd", "isDateInSkipRange", "isDayScheduledOn", "moveFor", "upcomingSessions", "sessionForToday",
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// Thursday 29 Oct 2026. Sessions Monday, Thursday and Saturday.
const THU = "2026-10-29";
const program = { days: [
  { id: "d1", name: "Lower", weekday: "Monday" },
  { id: "d2", name: "Upper", weekday: "Thursday" },
  { id: "d3", name: "Conditioning", weekday: "Saturday" },
] };

test("upcoming sessions, nearest first", () => {
  const list = H.upcomingSessions(program, [], THU, 7);
  assert.deepEqual(list.map(x => [x.day.name, x.iso]), [["Conditioning", "2026-10-31"], ["Lower", "2026-11-02"], ["Upper", "2026-11-05"]]);
});

test("once Saturday's is pulled to today it is no longer upcoming", () => {
  const moves = [{ programDay: "Conditioning", fromDate: "2026-10-31", toDate: THU, kind: "pull" }];
  const list = H.upcomingSessions(program, moves, THU, 7);
  assert.ok(!list.some(x => x.iso === "2026-10-31"));
});

test("a pulled session is today's session, ahead of the one already scheduled", () => {
  const moves = [{ programDay: "Conditioning", fromDate: "2026-10-31", toDate: THU, kind: "pull" }];
  assert.equal(H.sessionForToday(program, moves, [], THU).name, "Conditioning");
  assert.equal(H.sessionForToday(program, [], [], THU).name, "Upper");
});

test("once the pulled one is logged, today goes back to its own session", () => {
  const moves = [{ programDay: "Conditioning", fromDate: "2026-10-31", toDate: THU, kind: "pull" }];
  const logs = [{ date: THU, programDay: "Conditioning" }];
  assert.equal(H.sessionForToday(program, moves, logs, THU).name, "Upper");
});

test("the calendar shows a moved session on the day it will happen", () => {
  assert.match(src, /const arriving = calMoves\.find\(m => m\?\.toDate === ds && m\?\.kind !== "skip"\);/);
  assert.match(src, /days\.find\(d => isDayScheduledOn\(d, ds\) && !moveFor\(calMoves, d\.name, ds\)\)/);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`✖ ${name}\n  ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
