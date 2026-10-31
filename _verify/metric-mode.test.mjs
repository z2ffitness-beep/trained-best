// Not everything is pounds (Isaiah, 29 Oct). Cardio is timed, holds are
// seconds, carries and sprints are distance; only lifts are weight and reps.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const H = await load(APP, [
  { name: "TIME_PHASES", kind: "const" }, { name: "INTERVAL_PHASES", kind: "const" },
  { name: "LEAD_NUMBER", kind: "const" }, { name: "LEAD_MINUTES", kind: "const" },
  { name: "LEAD_SECONDS", kind: "const" }, { name: "LEAD_DISTANCE", kind: "const" },
  "metricModeFor", "prescribedMeters",
]);

const await_src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "App.jsx"), "utf8");
let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);
const mode = (phase, reps) => H.metricModeFor({ phase, reps });

// Every case below is a real prescription from a program in the app.
test("cardio is timed", () => {
  assert.equal(mode("aerobic", "25min"), "time");
  assert.equal(mode("aerobic", "60 min swim"), "time");
  assert.equal(mode("aerobic", "15–20 min easy steady state"), "time");
  assert.equal(mode("compound", "40+ min easy"), "time");
});

test("intervals stay intervals", () => {
  assert.equal(mode("lactic", "30s on/30s off"), "intervals");
  assert.equal(mode("lactic", "10s all-out"), "intervals");
});

test("a sled push or hill sprint in conditioning is distance", () => {
  assert.equal(mode("lactic", "20m"), "distance");
  assert.equal(mode("lactic", "20–30 m @ 90–95% — full recovery"), "distance");
});

test("holds are seconds", () => {
  for (const r of ["30–45 sec/side", "20 s", "7 sec", "30s", "7s, or 25 m push — best sled time 8.31", "20-30 sec/side", "15 s/side"]) {
    assert.equal(mode("hypertrophy", r), "hold", r);
  }
});

test("carries and sprints are distance", () => {
  for (const r of ["20 m/side", "20–30 m/side", "10 m @ 80-85%", "25 yd"]) {
    assert.equal(mode("explosive", r), "distance", r);
  }
});

test("lifts are still weight and reps", () => {
  for (const r of ["6", "8-10", "5 @ 60–65%", "8/side, 2-sec hold", "3 × 3–5 sec", "4/side", "12/side", "6–10/side, 3-sec eccentric", "3/side, 2-4 kg"]) {
    assert.equal(mode("compound", r), "load", r);
  }
  assert.equal(mode("compound", 5), "load");
  assert.equal(mode("compound", null), "load");
});

test("distance in metres", () => {
  assert.equal(H.prescribedMeters("20 m/side"), 20);
  assert.equal(H.prescribedMeters("25 yd"), 23);
  assert.equal(H.prescribedMeters("1 km"), 1000);
  assert.equal(H.prescribedMeters("15 min"), null);
});

test("the coach sees timed, held and distance results, not only lifts", () => {
  const src = (await_src);
  const row = src.slice(src.indexOf("function SessionLogRow("), src.indexOf("function CoachReplyCard("));
  for (const k of ['any("minutes")', 'any("seconds")', 'any("workSec")', 'any("meters")']) assert.ok(row.includes(k), k);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`✖ ${name}\n  ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
