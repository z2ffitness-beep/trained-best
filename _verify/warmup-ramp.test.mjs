// Isaiah, 15 Nov: his first program's day 1 warm-up was "Back Squat 2x8,
// Scapular Push Ups, Band External Rotation" before a squat day, and the
// power block was one broad jump. The generator now writes an NSCA RAMP
// warm-up where every piece prepares that day, and a jump plus a throw. And
// the "needs a photo" notes are the coach's, not the athlete's.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSource } from "./extract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readSource(path.join(here, "..", "src", "App.jsx"));
let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);
const prompt = src.slice(src.indexOf("function buildAIPrompt(intake)"), src.indexOf("function buildAIPrompt(intake)") + 30000);

test("the warm-up is Raise, Mobilise, Activate, Potentiate", () => {
  for (const w of ["RAISE (", "MOBILISE (", "ACTIVATE (", "POTENTIATE ("]) assert.ok(prompt.includes(w), w);
});
test("every primer has to prepare something on that day", () => {
  assert.match(prompt, /EVERY primer must prepare a main lift, a power exercise or a listed injury on THAT day/);
  assert.match(prompt, /Band External Rotation belongs before pressing or overhead work, or with a listed shoulder issue/);
});
test("no main lift and no loaded ramp-up sets in the warm-up", () => {
  assert.match(prompt, /NEVER a main lift/);
  assert.match(prompt, /do not list "Back Squat 2x8"/);
  assert.ok(!/A primer may use the day.s first main lift as an unloaded or empty-bar rehearsal/.test(prompt), "the old barbell exception is gone");
});
test("sport and fight athletes get a jump and a throw every day, and power is never what gets cut", () => {
  assert.match(prompt, /one jump, bound or sprint, and one med ball throw/);
  assert.match(prompt, /drop an accessory, never the power/);
});
test("photo gaps show for coaches, not athletes", () => {
  assert.ok(src.includes("{showPhotoGaps && <NoPhotoFlag name={x.name} size=\"xs\" />}"));
  assert.ok(src.includes("{showPhotoGaps && <NoPhotoFlag name={ex?.name} size=\"xs\" />}"));
  assert.ok(src.includes("{showPhotoGaps && (() => {\n            const missing = missingImageNames("));
  assert.equal((src.match(/showPhotoGaps=\{!!state\.coachProfile\?\.id && state\.coachProfile\.id === state\.me\?\.id\}/g) || []).length, 2);
});

test("the weight room does not copy the sport (Isaiah, 15 Nov)", () => {
  assert.match(prompt, /GENERAL PREPARATION, NOT THE SPORT/);
  assert.match(prompt, /no shadow boxing, bag work, sprawls/);
  assert.ok(!/snap downs/.test(src), "no snap downs anywhere");
  assert.ok(!/shadow boxing for a fighter/.test(src));
  assert.ok(!/include striking\/conditioning elements \(bag work/.test(src), "the old MMA rule is gone");
});
test("an athlete's Coach tab is headed with their coach's name", () => {
  assert.ok(src.includes('header={<TopBar title={hasCoach ? (state.coachProfile?.name || "Coach") : "Coach"} />} />;'));
});

test("a brand-new athlete gets their coach's name straight after signup, not at the next login", () => {
  const at = src.indexOf("const writeProfileAndContinue = async");
  const body = src.slice(at, at + 9000);
  assert.ok(/await supabase\.rpc\("coach_card", \{ p_id: coachId \}\)/.test(body));
  assert.ok(/id: c\.id, name: c\.name/.test(body));
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
