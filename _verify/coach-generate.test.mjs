// "Build from their answers", on the athlete's own page.
//
// It already existed on the roster's Assign sheet, and nowhere else. A coach
// deciding somebody needs a programme is almost always looking AT that
// person, not at the list, and from there the only option was a blank
// programme to type out by hand. The answers they gave at signup were sitting
// unused one screen away.
//
// Three things are worth a test rather than a look:
//
//   1. The shape handed to the saver, including every fallback. The AI
//      decides what comes back; a missing programName or weeks must not
//      become "undefined's Program" or a zero-week plan.
//   2. Whether the button can be pressed at all. An athlete who stopped
//      halfway through signup has no training days and no equipment, and
//      generating from that produces confident nonsense.
//   3. That the button and the explanation under it agree. A live button
//      over the words "hasn't finished the questionnaire" is worse than
//      either on its own, and they are two separate expressions in the
//      source that could drift.
import assert from "node:assert/strict";
import { readSource, load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);

const { programFromResult, intakeIsUsable } = await load(APP, [
  "programFromResult", "intakeIsUsable",
]);

let n = 0;
const ok = (label, fn) => { fn(); n++; };

// ---- 1. the shape, and the fallbacks -----------------------------------
const athlete = { id: "a1", name: "Marcus Webb", sport: "Rugby" };

ok("a full result passes through intact", () => {
  const t = programFromResult(
    { programName: "Off-season Build", weeks: 12, rationale: "Pre-season", days: [{ name: "Day 1" }] },
    athlete,
  );
  assert.equal(t.name, "Off-season Build");
  assert.equal(t.weeks, 12);
  assert.equal(t.rationale, "Pre-season");
  assert.equal(t.days.length, 1);
  assert.equal(t.sport, "Rugby");
});

ok("no name from the AI falls back to the athlete's first name", () => {
  assert.equal(programFromResult({ weeks: 8, days: [] }, athlete).name, "Marcus's Program");
});

ok("a one-word name still works", () => {
  assert.equal(programFromResult({}, { id: "a", name: "Fenley" }).name, "Fenley's Program");
});

ok("extra spaces in the name do not leak into the programme title", () => {
  assert.equal(programFromResult({}, { id: "a", name: "  Dana   Lowe " }).name, "Dana's Program");
});

ok("no name at all does not produce \"undefined's Program\"", () => {
  const t = programFromResult({}, { id: "a" });
  assert.ok(!/undefined/.test(t.name), `got ${t.name}`);
  assert.equal(t.name, "New Program");
});

ok("no weeks from the AI falls back to 8, never 0", () => {
  assert.equal(programFromResult({ days: [] }, athlete).weeks, 8);
  assert.equal(programFromResult({ weeks: 0, days: [] }, athlete).weeks, 8);
});

ok("a missing days list becomes an empty array, not undefined", () => {
  assert.deepEqual(programFromResult({}, athlete).days, []);
});

ok("an athlete with no sport gets null rather than undefined", () => {
  assert.equal(programFromResult({}, { id: "a", name: "Jo" }).sport, null);
});

ok("a null result does not throw", () => {
  const t = programFromResult(null, athlete);
  assert.equal(t.name, "Marcus's Program");
  assert.deepEqual(t.days, []);
});

// ---- 2. when the button may be pressed ---------------------------------
ok("a finished questionnaire is usable", () => {
  assert.equal(intakeIsUsable({ trainingDays: ["Mon", "Wed"], equipment: ["barbell"] }), true);
});

ok("no training days is not usable", () => {
  assert.equal(intakeIsUsable({ trainingDays: [], equipment: ["barbell"] }), false);
});

ok("no equipment is not usable", () => {
  assert.equal(intakeIsUsable({ trainingDays: ["Mon"], equipment: [] }), false);
});

ok("no intake at all is not usable, rather than throwing", () => {
  assert.equal(intakeIsUsable(undefined), false);
  assert.equal(intakeIsUsable({}), false);
});

// ---- 3. the screen is actually wired up --------------------------------
//
// extract.mjs runs the pure functions in isolation, where a button that is
// never rendered passes every test above. These read the source.
const detail = src.slice(src.indexOf("function CoachAthleteDetail("));
const detailBody = detail.slice(0, detail.indexOf("\nfunction ", 1));

ok("the athlete page offers the build-from-answers button", () => {
  assert.match(detailBody, /"Use their answers"/);
  // The name belongs in the sentence, not the button: Btn never wraps, and
  // "Build from Christopher's answers" pushed the page sideways at 320px.
  assert.match(detailBody, /\$\{firstName\}'s goals, injuries/);
});

ok("none of the three start buttons share a row", () => {
  // Btn carries whitespace-nowrap AND shrink-0, so two side by side beat
  // flex-1 and refuse to shrink. Measured: they spilled past the card.
  // Bounded by the next thing on the page, NOT by a character count. A
  // fixed window cut the third button off the end the first time, and the
  // same mistake once reported half a word as a missing signup key.
  const card = detailBody.slice(detailBody.indexOf("No program yet"));
  const block = card.slice(0, card.indexOf("{/* One place to change a program"));
  assert.ok(!/<div className="flex gap-2\.5">[\s\S]*?<Btn/.test(block),
    "the start options must each be on their own full-width row");
  assert.equal((block.match(/className="w-full/g) || []).length, 3);
});

ok("it opens the generator, and the generator is rendered on this page", () => {
  assert.match(detailBody, /setGenerateOpen\(true\)/);
  assert.match(detailBody, /<AIProgramGenerator/);
});

ok("the generator is fed this athlete's own intake, not an example", () => {
  const gen = detailBody.slice(detailBody.indexOf("<AIProgramGenerator"));
  assert.match(gen.slice(0, 200), /intake=\{athleteIntake\}/);
});

ok("the button and the sentence under it read the SAME condition", () => {
  // Both must come from canBuildFromAnswers. If one is ever rewritten to
  // test something else by hand, a coach gets a live button over a sentence
  // saying there is nothing to build from.
  assert.match(detailBody, /disabled=\{generating \|\| !canBuildFromAnswers\}/);
  assert.match(detailBody, /\{canBuildFromAnswers\s*\n?\s*\?/);
  // One definition, then a button and its sentence per place the option is
  // offered: the empty Program tab, and (26 Oct) the "Make a new program"
  // sheet. Every button must have its sentence and vice versa.
  const buttons = (detailBody.match(/disabled=\{generating \|\| !canBuildFromAnswers\}/g) || []).length;
  const sentences = (detailBody.match(/\{canBuildFromAnswers\s*\n?\s*\?/g) || []).length;
  assert.equal(buttons, sentences);
  assert.equal((detailBody.match(/canBuildFromAnswers/g) || []).length, 1 + buttons + sentences);
});

ok("a generated programme is NOT saved with allowEmpty", () => {
  // allowEmpty exists for the blank-start path. A generation that came back
  // with no days failed, and saving it leaves the athlete opening an empty
  // week with nothing to say anything went wrong.
  const call = detailBody.slice(detailBody.indexOf("saveGeneratedProgram({"));
  assert.ok(!/allowEmpty/.test(call.slice(0, 160)), "allowEmpty must not be passed here");
});

ok("the button only exists where there is no programme yet", () => {
  const card = detailBody.slice(detailBody.indexOf("No program yet"));
  const end = card.indexOf("{/* One place to change a program");
  assert.ok(end > 0, "could not find the end of the no-programme card");
  assert.ok(card.slice(0, end).includes('"Use their answers"'),
    "the button must sit inside the !program card, so it disappears once they have one");
  // And nowhere else on the page.
  assert.equal((detailBody.match(/"Use their answers"/g) || []).length, 1);
  // The card itself has to be gated on there being no programme. Without
  // this, the three assertions above still pass while the card sits over a
  // programme the coach has already written, one tap from replacing it.
  assert.match(detailBody, /\{!program && \(\s*\n\s*<div className="rounded-2xl p-6 text-center"/);
});

ok("the roster and the athlete page share one save path", () => {
  // Two copies of this drifted once already. Both screens must call the
  // module-level helper rather than keeping their own version.
  assert.equal((src.match(/async function saveGeneratedProgram\b/g) || []).length, 1);
  assert.ok((src.match(/saveGeneratedProgram\(\{/g) || []).length >= 2);
});

console.log(`${n} passed`);
