// Cutting the program description down to something an athlete reads.
//
// The generator writes two thorough paragraphs. On the five programs on this
// account that came out at 429 to 3,004 characters — roughly seventy lines on
// a phone — sitting at the very top of the program page, ahead of a single
// exercise. The coach's words: "two big ass paragraphs."
//
// The reasoning is worth keeping, so nothing is deleted and nothing in the
// database is rewritten. The same stored text renders as a synopsis with the
// rest behind a tap. These tests pin the cut.
import assert from "node:assert/strict";
import fs from "node:fs";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "SYNOPSIS_MAX", kind: "const" }, { name: "SYNOPSIS_WHOLE", kind: "const" },
  "splitSentences", "clauseBreak", "programSynopsis",
]);

// The real rationales, pulled from the programs table. Fixtures invented for a
// test would have been shorter and better behaved than the ones that caused
// the complaint.
const LIVE = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "rationales.json"), "utf8"));

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// ---------- the thing the coach actually asked for ----------

test("every real program's description fits on a phone screen", () => {
  for (const p of LIVE) {
    const { synopsis } = H.programSynopsis(p.rationale);
    assert.ok(synopsis.length <= H.SYNOPSIS_MAX + 1,  // +1 for the ellipsis
      `${p.name}: ${synopsis.length} chars is still a wall\n  ${synopsis.slice(0, 120)}…`);
  }
});

test("the longest one drops from 3,004 characters to under 250", () => {
  const knee = LIVE.find(p => p.name.startsWith("Knee-Smart"));
  assert.ok(knee.rationale.length > 2900, "fixture drifted");
  const { synopsis, truncated } = H.programSynopsis(knee.rationale);
  assert.ok(synopsis.length < 250, `${synopsis.length}`);
  assert.equal(truncated, true);
});

test("nothing is lost — the full text is still there to expand to", () => {
  for (const p of LIVE) {
    const { synopsis, truncated } = H.programSynopsis(p.rationale);
    if (!truncated) assert.equal(synopsis, p.rationale.trim());
    // The component renders program.rationale itself when expanded, so the
    // only thing that could lose text is the database. Nothing here writes.
    assert.ok(p.rationale.length > 0);
  }
});

test("whole sentences are preferred — no ellipsis when they fit the budget", () => {
  const five = Array.from({ length: 5 }, (_, i) =>
    `Sentence ${i} ` + "word ".repeat(17) + "end.").join(" ");
  assert.ok(five.length > H.SYNOPSIS_WHOLE, "fixture must be long enough to cut");
  const { synopsis } = H.programSynopsis(five);
  assert.ok(!synopsis.endsWith("\u2026"),
    `cut mid-sentence when whole ones fit: …${synopsis.slice(-50)}`);
  assert.ok(synopsis.endsWith("end."));
  assert.ok(synopsis.length <= H.SYNOPSIS_MAX, `${synopsis.length} over budget`);
});

test("the two longest real programs still end on a full stop", () => {
  for (const name of ["Knee-Smart", "3-Day Fight Prep"]) {
    const p = LIVE.find(x => x.name.includes(name));
    const { synopsis } = H.programSynopsis(p.rationale);
    assert.ok(synopsis.endsWith("."),
      `${name} was cut mid-sentence though its opening sentence fits: …${synopsis.slice(-50)}`);
  }
});

test("a synopsis always ends somewhere a reader would stop", () => {
  for (const p of LIVE) {
    const { synopsis } = H.programSynopsis(p.rationale);
    assert.ok(/[.!?…]$/.test(synopsis),
      `${p.name} ends mid-phrase: …${synopsis.slice(-60)}`);
  }
});

test("a cut sentence never strands an open bracket", () => {
  for (const p of LIVE) {
    const { synopsis } = H.programSynopsis(p.rationale);
    const opens = (synopsis.match(/[([]/g) || []).length;
    const closes = (synopsis.match(/[)\]]/g) || []).length;
    assert.equal(opens, closes, `${p.name}: unbalanced brackets in "${synopsis.slice(-80)}"`);
  }
});

test("a 598-character opening sentence is cut, not shown whole", () => {
  // This one is why whole-sentences-only was not enough on its own.
  const split = LIVE.find(p => p.name.includes("3-Day Split"));
  const firstSentence = H.splitSentences(split.rationale.split(/\n\s*\n/)[0])[0];
  assert.ok(firstSentence.length > 500, `fixture drifted: ${firstSentence.length}`);
  const { synopsis } = H.programSynopsis(split.rationale);
  assert.ok(synopsis.length < 200, `${synopsis.length} chars`);
  assert.ok(synopsis.endsWith("…"), "a mid-sentence cut must say so");
  assert.ok(synopsis.startsWith("This program is built to make you hit harder"));
});

// ---------- when NOT to cut ----------

test("a description that is already short is left alone and gets no toggle", () => {
  const short = "Eight weeks, four days a week, built around the squat and the bench.";
  const { synopsis, truncated } = H.programSynopsis(short);
  assert.equal(synopsis, short);
  assert.equal(truncated, false, "a toggle hiding nothing is just a dead button");
});

test("the whole-text threshold is honoured to the character", () => {
  const filler = (n) => "a".repeat(n - 1) + ".";
  assert.equal(H.programSynopsis(filler(H.SYNOPSIS_WHOLE)).truncated, false);
  assert.equal(H.programSynopsis(filler(H.SYNOPSIS_WHOLE + 1)).truncated, true);
});

test("a short first paragraph does not spill into the second", () => {
  // Paragraph 1 is the plan, paragraph 2 is the physiology. A synopsis that
  // starts the physiology and stops two words in is worse than a short one.
  // Paragraph 2 opens with two short sentences on purpose: if they were one
  // long one the budget would stop the walk anyway and the test would pass
  // whether or not the first-paragraph rule was there at all.
  const full = "The plan, in one line." + "\n\n"
    + "The physiology. Heavy lifts drive it. " + "word ".repeat(80);
  const { synopsis } = H.programSynopsis(full);
  assert.equal(synopsis, "The plan, in one line.");
  assert.ok(!synopsis.includes("physiology"));
  assert.ok(!synopsis.includes("\n"), "a synopsis is never two paragraphs");
});

test("no real program's synopsis contains a paragraph break", () => {
  for (const p of LIVE) {
    const { synopsis } = H.programSynopsis(p.rationale);
    assert.ok(!/\n\s*\n/.test(synopsis), p.name);
  }
});

test("an empty or missing rationale produces nothing, not 'undefined'", () => {
  [null, undefined, "", "   ", "\n\n"].forEach(v => {
    const r = H.programSynopsis(v);
    assert.equal(r.synopsis, "", JSON.stringify(v));
    assert.equal(r.truncated, false);
  });
});

// ---------- sentence splitting, without a lookbehind regex ----------

test("it splits on real sentence ends", () => {
  assert.deepEqual(
    H.splitSentences("One thing. Then another. And a third."),
    ["One thing.", "Then another.", "And a third."]);
});

test("a decimal is not a sentence end", () => {
  assert.deepEqual(H.splitSentences("Work up to 1.5 times bodyweight."),
    ["Work up to 1.5 times bodyweight."]);
});

test("an abbreviation followed by a lowercase word is not a sentence end", () => {
  // The real job of the capital-letter rule. The decimal case above is caught
  // by the whitespace requirement instead, so it does not test this at all.
  const t = "Use a hinge pattern, e.g. the trap bar deadlift, before the squat.";
  assert.deepEqual(H.splitSentences(t), [t]);
  assert.deepEqual(H.splitSentences("Rest approx. 90 seconds between sets."),
    ["Rest approx. 90 seconds between sets."]);
});

test("a percentage before a lowercase word is not a sentence end", () => {
  assert.deepEqual(H.splitSentences("Volume drops by 40% and the target eases."),
    ["Volume drops by 40% and the target eases."]);
});

test("a parenthetical day list survives intact", () => {
  const t = "You train five days (Mon, Tue, Thu, Fri, Sun) in a rotation.";
  assert.deepEqual(H.splitSentences(t), [t]);
});

test("an initial is not a sentence end", () => {
  // The guard exists for this shape: a lone capital before the dot.
  assert.deepEqual(H.splitSentences("Programmed by I. Fearon for the camp."),
    ["Programmed by I. Fearon for the camp."]);
  assert.deepEqual(H.splitSentences("Built for the U.S. Open. Then the tour."),
    ["Built for the U.S. Open.", "Then the tour."]);
  // And it must not swallow a genuine sentence end after a normal word.
  assert.deepEqual(H.splitSentences("Four S&C days. Two hard, two easy."),
    ["Four S&C days.", "Two hard, two easy."]);
});

test("'...' and '?!' are one terminator, not three", () => {
  assert.deepEqual(H.splitSentences("Wait... Then go."), ["Wait...", "Then go."]);
  assert.deepEqual(H.splitSentences("Really?! Yes."), ["Really?!", "Yes."]);
});

test("a sentence opening with a quote is recognised", () => {
  assert.deepEqual(H.splitSentences('He stopped. "That is enough."'),
    ['He stopped.', '"That is enough."']);
});

test("text with no terminator at all is one sentence", () => {
  assert.deepEqual(H.splitSentences("no full stop here"), ["no full stop here"]);
});

test("empty input yields no sentences, not one empty one", () => {
  assert.deepEqual(H.splitSentences(""), []);
  assert.deepEqual(H.splitSentences("   "), []);
  assert.deepEqual(H.splitSentences(null), []);
});

test("splitting loses no words", () => {
  for (const p of LIVE) {
    const first = p.rationale.split(/\n\s*\n/)[0].trim();
    const rejoined = H.splitSentences(first).join(" ").replace(/\s+/g, " ");
    assert.equal(rejoined, first.replace(/\s+/g, " "), `${p.name}: text lost in the split`);
  }
});

// ---------- where the cut lands ----------

test("a clause break is preferred over a comma", () => {
  const t = "a".repeat(100) + ", then more words here" + "b".repeat(20) + "; and the rest " + "c".repeat(200);
  assert.equal(t[H.clauseBreak(t, 200)], ";");
});

test("a comma is used when there is no stronger break", () => {
  const t = "a".repeat(100) + ", then more words " + "c".repeat(200);
  assert.equal(t[H.clauseBreak(t, 200)], ",");
});

test("an unclosed bracket does not get cut through", () => {
  // No closing bracket inside the budget, so every comma and space after it is
  // unsafe. The old version fell back to the last space, which was inside.
  const t = "a".repeat(100) + " (aaa, bbb, ccc, ddd, eee, fff, ggg, hhh, iii, jjj, kkk, lll, mmm";
  const head = t.slice(0, H.clauseBreak(t, 200));
  assert.equal((head.match(/\(/g) || []).length, (head.match(/\)/g) || []).length,
    `strands an open bracket: "${head.slice(-60)}"`);
});

test("a break inside brackets is skipped", () => {
  // Cutting at the comma inside the parenthesis strands the "(".
  const t = "a".repeat(120) + " (one, two, three) " + "c".repeat(200);
  const at = H.clauseBreak(t, 200);
  const head = t.slice(0, at);
  assert.equal((head.match(/\(/g) || []).length, (head.match(/\)/g) || []).length);
});

test("with no safe break at all it stops before the bracket opened", () => {
  // The last resort, and an edge case: an unbroken run of characters up to an
  // unclosed bracket leaves no comma, dash or space to cut at. Rare in prose,
  // but the alternative is a synopsis ending "…(one, two".
  const t = "a".repeat(100) + "(one, two, three, four, five, six, seven, eight";
  const head = t.slice(0, H.clauseBreak(t, 200));
  assert.equal((head.match(/\(/g) || []).length, (head.match(/\)/g) || []).length,
    `strands an open bracket: "${head.slice(-40)}"`);
});

test("a bracket that closes releases the text after it", () => {
  // Tracking "(" without tracking ")" leaves every later break looking unsafe,
  // so the cut retreats to before the bracket and throws away good clause.
  const t = "a".repeat(100) + " (one, two) " + "b".repeat(40) + "; the rest " + "c".repeat(200);
  assert.equal(t[H.clauseBreak(t, 200)], ";",
    "the semicolon after the closed bracket is the right cut");
});

test("it never cuts so early the synopsis says nothing", () => {
  const t = "Short, " + "a".repeat(400);
  assert.ok(H.clauseBreak(t, 200) >= 200 * 0.4,
    "the comma at character 6 would leave the athlete with one word");
});

test("with no punctuation at all it still falls back to a whole word", () => {
  const t = "word ".repeat(100);
  const at = H.clauseBreak(t, 200);
  assert.ok(at <= 200);
  assert.ok(t[at] === " " || at === 200, "must land on a boundary, not mid-word");
});

// ---------- wiring ----------

test("the program page shows the synopsis, not the whole rationale", () => {
  const at = src.indexOf("function ProgramExplainer(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/const \{ synopsis, truncated \} = programSynopsis\(program\.rationale\)/.test(body),
    "the page must go through the synopsis");
  assert.ok(!/String\(program\.rationale\)\.split\(\/\\n\\s\*\\n\/\)\.map/.test(body),
    "the old unconditional full-text render must be gone");
});

test("expanding shows the original text, not synopsis plus remainder", () => {
  const at = src.indexOf("function ProgramExplainer(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/showAll \? String\(program\.rationale\)\.trim\(\) : synopsis/.test(body),
    "re-joining a cut at a colon leaves a seam that reads like a bug");
});

test("the toggle only appears when something is hidden", () => {
  const at = src.indexOf("function ProgramExplainer(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/\{truncated && \(/.test(body), "a toggle that reveals nothing is a dead button");
});

test("the generate-preview card is shortened too", () => {
  assert.ok(/programSynopsis\(result\.rationale\)\.synopsis/.test(src),
    "the confirm card is a yes/no on the program, not a reading exercise");
});

test("the generator is told its first sentence stands alone", () => {
  const at = src.indexOf("ITS FIRST SENTENCE IS THE SYNOPSIS");
  assert.notEqual(at, -1,
    "without this the collapsed view is only accidentally readable");
  const near = src.slice(at, at + 700);
  assert.ok(/stand on its own/.test(near));
  assert.ok(/Under 40 words/.test(near));
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
