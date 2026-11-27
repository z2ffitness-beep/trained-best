// Isaiah, 27 Nov: "there needs to be an audio option here so I can verbally
// put in the changes I want for my client". Adjust with AI (coaches and solo
// athletes) gets the same mic the Voice Log and program builder use.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "src", "App.jsx"), "utf8");
const chat = src.slice(src.indexOf("function AdjustChat("), src.indexOf("// ---------- changing the program by hand, on the board ----------"));
let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);

test("Adjust with AI listens into its own box", () => {
  assert.ok(chat.includes("const speech = useSpeechToText(input, setInput);"));
  assert.ok(chat.includes('aria-label={speech.listening ? "Stop listening" : "Say the change"}'));
  assert.ok(chat.includes("{speech.supported && ("), "no mic on a browser that can't listen; the keyboard mic still works");
});

test("sending stops listening, and errors are shown", () => {
  assert.match(chat, /const send = async \(textArg\) => \{\s*speech\.stop\(\);/);
  assert.ok(chat.includes("{speech.error && <div"));
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
