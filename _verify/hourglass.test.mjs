// Loading is a turning hourglass, not a number (Isaiah, 31 Oct), and the
// program build tells people what the app can do while they wait.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "App.jsx"), "utf8");
let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

test("no percentage on any loading screen", () => {
  assert.ok(!/<LoadingPercent\b/.test(src), "a percentage is back on a loading screen");
  assert.ok(!/function estimatedFraction/.test(src), "the estimated percentage is back");
});
test("the hourglass turns, and holds still for people who turn motion off", () => {
  assert.ok(/@keyframes tb-hourglass/.test(src));
  assert.ok(/prefers-reduced-motion: reduce/.test(src));
});
test("the program build rotates encouragement and features", () => {
  assert.ok(/<LoadingEstimate big label="Building your program" tips=\{BUILD_TIPS_CLIENT\}/.test(src));
  const list = src.slice(src.indexOf("const BUILD_TIPS_CLIENT"), src.indexOf("];", src.indexOf("const BUILD_TIPS_CLIENT")));
  assert.ok((list.match(/^\s+"/gm) || []).length >= 5, "fewer than five messages");
  assert.ok(/Voice Log/.test(list), "Voice Log is not mentioned");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`✖ ${name}\n  ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
