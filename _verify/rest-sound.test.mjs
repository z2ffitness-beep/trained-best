// The athlete's own rest-timer sound (Isaiah, 28 Oct). Kept on the phone so it
// plays with no signal, cut off after a few seconds, and never leaves the
// alert silent: a phone without the file falls back to Beep.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "src", "App.jsx"), "utf8");

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const fnBody = (name) => {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i > 0, `${name} is missing`);
  return src.slice(i, src.indexOf("\n}\n", i));
};

test("the alert hands 'custom' to the athlete's own sound", () => {
  assert.match(fnBody("playAlert"), /soundKey === CUSTOM_ALERT\) \{ playCustomAlert\(\); return; \}/);
});

test("no file on this phone means Beep, not silence", () => {
  const b = fnBody("playCustomAlert");
  assert.match(b, /playTones\(DEFAULT_ALERT\)/);
  assert.equal((b.match(/playTones\(DEFAULT_ALERT\)/g) || []).length, 2, "both the missing-file and failed-decode paths fall back");
});

test("a long file is cut off so it never plays over the next set", () => {
  assert.match(fnBody("playBuffer"), /Math\.min\(buffer\.duration, CUSTOM_SOUND_MAX_SECONDS\)/);
});

test("a file is checked before it is kept", () => {
  const b = fnBody("saveCustomSound");
  assert.ok(b.indexOf("decodeSound(bytes)") < b.indexOf("writeCustomSound("), "stored before it was known to play");
  assert.match(b, /CUSTOM_SOUND_MAX_BYTES/);
});

test("the sound stays on the phone, it is not uploaded", () => {
  for (const n of ["saveCustomSound", "loadCustomBuffer", "playCustomAlert"]) {
    assert.ok(!/supabase/.test(fnBody(n)), `${n} talks to the server`);
  }
});

test("removing the sound while it is chosen goes back to Beep", () => {
  assert.match(src, /if \(alert === CUSTOM_ALERT\) saveSetting\("restAlert", DEFAULT_ALERT\);/);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`✖ ${name}\n  ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
