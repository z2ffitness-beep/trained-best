// Isaiah, 15 Nov: signup should move down to the next question by itself
// after a one-answer question is answered, instead of making people scroll.
// Checked in a real browser too (scrolls measured); this guards the wiring.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSource } from "./extract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readSource(path.join(here, "..", "src", "App.jsx"));
let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);

test("the signup screen listens for answers and moves to the next question", () => {
  assert.ok(src.includes('className="flex-1 px-6 overflow-y-auto pb-4" onClickCapture={onStepClick} onChangeCapture={onStepChange}'));
  assert.ok(/const advanceFrom = \(el, skipSection\) =>/.test(src));
  assert.ok(/if \(delta <= 4\) return;/.test(src), "never scrolls back up");
});
test("every question is a stop: fields, sections, health and movement rows, the terms", () => {
  assert.ok(src.includes('<div className="mb-4" data-q="">'), "Field");
  assert.ok(src.includes('<div key={s.step} data-q=""'), "sections");
  assert.ok(src.includes('<div key={q.key} data-q="" className="rounded-lg px-3 py-2.5'), "health rows");
  assert.ok(src.includes('<div key={m.key} data-q="" className="rounded-lg px-3.5 py-3"'), "movement rows");
  assert.ok(src.includes('<div className="mt-6" data-q="">'), "terms");
});
test("one-answer questions move on; answers that open another box do not", () => {
  for (const k of ['grid grid-cols-4 gap-2" data-advance=""', 'grid grid-cols-2 gap-3" data-advance=""', 'aria-label="Your sport" style={inputStyle} data-advance=""', 'data-advance={on ? undefined : ""}'])
    assert.ok(src.includes(k), k);
  assert.ok(src.includes('data-advance="" data-skip-to-next-section="" onClick={() => setData(d => ({ ...d, parq:'), "None of these skips the rows");
});
test("multi-pick questions never move the screen", () => {
  const goals = src.slice(src.indexOf('    case "🎯 Goals": {'), src.indexOf('    case "🩹 Injuries": {'));
  assert.ok(!/data-advance/.test(goals));
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
