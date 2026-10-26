// The program board (Week tab and the coach's client page). Days must run
// Monday to Sunday whatever order they were saved in. Each week's numbers come
// from prescribeForWeek, which weeks.test.mjs already covers, including a
// movement dropped for one week.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const H = await load(APP, ["boardDayOrder", { name: "WEEKDAY_ORDER", kind: "const" }]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("days run Monday to Sunday, unscheduled days last in saved order", () => {
  const days = [{ id: "f", weekday: "Friday" }, { id: "x" }, { id: "m", weekday: "Monday" }, { id: "y" }, { id: "w", weekday: "Wednesday" }];
  assert.deepEqual(H.boardDayOrder(days).map(d => d.id), ["m", "w", "f", "x", "y"]);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`✖ ${name}\n  ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
