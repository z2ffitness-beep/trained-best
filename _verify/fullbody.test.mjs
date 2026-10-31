// Full body by default, and the assignment that makes it stick.
//
// Every program built on this account so far came out as a split — "Monday is a
// lower-body day, Wednesday is upper-body" — and the coach's whole objection is
// that a fighter training three days a week should not have a leg day. The
// cause was not a bad rule. The prompt contained NO rule about splitting the
// week at all, so the model used the commonest convention in its training data.
//
// Describing the rule in prose would leave the same latitude, so the day-by-day
// pattern assignment is computed here and handed over as an instruction.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "SPLIT_STYLES", kind: "const" }, { name: "DEFAULT_SPLIT", kind: "const" },
  "splitStyleOf", "fullBodyPatternPlan", "fullBodyPlanText",
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

const LOWER = ["Squat", "Hinge"];
const PUSH = ["Horizontal Push", "Vertical Push"];
const PULL = ["Vertical Pull", "Horizontal Pull"];

// ---------- the coach's own worked example ----------

test("three days, three main lifts — exactly what the coach described", () => {
  // His words: "day one it's a squat, a pull up, a bench press. Day two:
  // RDL, horizontal pull, push press."
  const plan = H.fullBodyPatternPlan(3, 3);
  assert.deepEqual(plan[0].patterns, ["Squat", "Horizontal Push", "Vertical Pull"]);
  assert.deepEqual(plan[1].patterns, ["Hinge", "Vertical Push", "Horizontal Pull"]);
});

test("the short-session example too", () => {
  // "Day one, box squat and a bench press. Day two, an RDL and a pull up."
  const plan = H.fullBodyPatternPlan(3, 2);
  assert.deepEqual(plan[0].patterns, ["Squat", "Horizontal Push"]);
  assert.deepEqual(plan[1].patterns, ["Hinge", "Vertical Pull"]);
});

// ---------- the properties that make it full body ----------

test("every day has a lower-body lift", () => {
  for (const slots of [1, 2, 3, 4]) {
    for (const days of [2, 3, 4, 5, 6]) {
      for (const d of H.fullBodyPatternPlan(days, slots)) {
        assert.ok(LOWER.includes(d.patterns[0]),
          `${days}d/${slots}s day ${d.day}: no lower-body lift — that is an upper day`);
      }
    }
  }
});

test("with three or more slots every day presses AND pulls", () => {
  for (const slots of [3, 4]) {
    for (const days of [2, 3, 4, 5, 6]) {
      for (const d of H.fullBodyPatternPlan(days, slots)) {
        assert.ok(d.patterns.some(p => PUSH.includes(p)), `${days}d/${slots}s day ${d.day}: no press`);
        assert.ok(d.patterns.some(p => PULL.includes(p)), `${days}d/${slots}s day ${d.day}: no pull`);
      }
    }
  }
});

test("each day pairs one horizontal with one vertical", () => {
  // The criss-cross the coach confirmed: bench with a pull-up, push press
  // with a row. Never two horizontals or two verticals in a session.
  for (const days of [2, 3, 4, 5, 6]) {
    for (const d of H.fullBodyPatternPlan(days, 3)) {
      const horiz = d.patterns.filter(p => p.startsWith("Horizontal")).length;
      const vert = d.patterns.filter(p => p.startsWith("Vertical")).length;
      assert.equal(horiz, 1, `day ${d.day}: ${d.patterns.join(", ")}`);
      assert.equal(vert, 1, `day ${d.day}: ${d.patterns.join(", ")}`);
    }
  }
});

test("squat and hinge alternate, so neither is ever on back-to-back days", () => {
  for (const days of [2, 3, 4, 5, 6]) {
    const lowers = H.fullBodyPatternPlan(days, 3).map(d => d.patterns[0]);
    for (let i = 1; i < lowers.length; i++) {
      assert.notEqual(lowers[i], lowers[i - 1], `days ${i} and ${i + 1} are both ${lowers[i]}`);
    }
  }
});

test("a two-slot week still covers both planes and both directions", () => {
  // The first cut of this alternated the upper lift on the same parity as the
  // lower one, which left a three-day week with NO vertical work in it.
  const upper = H.fullBodyPatternPlan(4, 2).map(d => d.patterns[1]);
  assert.deepEqual([...upper].sort(), [...PUSH, ...PULL].sort(),
    "over four days a two-slot week must cover all four combinations");
  const three = H.fullBodyPatternPlan(3, 2).map(d => d.patterns[1]);
  assert.ok(three.some(p => p.startsWith("Vertical")), "a three-day week needs vertical work too");
  assert.ok(three.some(p => PUSH.includes(p)) && three.some(p => PULL.includes(p)),
    "and both a press and a pull");
});

test("a four-slot day takes the other lower-body pattern, not more upper work", () => {
  const plan = H.fullBodyPatternPlan(2, 4);
  assert.deepEqual(plan[0].patterns, ["Squat", "Horizontal Push", "Vertical Pull", "Hinge"]);
  assert.deepEqual(plan[1].patterns, ["Hinge", "Vertical Push", "Horizontal Pull", "Squat"]);
});

test("slots are filled in priority order — the lower lift is never the one dropped", () => {
  for (let slots = 1; slots <= 4; slots++) {
    const day = H.fullBodyPatternPlan(1, slots)[0];
    assert.equal(day.patterns.length, slots);
    assert.equal(day.patterns[0], "Squat", `${slots} slots`);
  }
});

test("lunge is never a main lift", () => {
  for (const slots of [1, 2, 3, 4]) {
    for (const d of H.fullBodyPatternPlan(6, slots)) {
      assert.ok(!d.patterns.includes("Lunge"),
        "the coach's own examples never used a lunge as a main — it is Secondary work");
    }
  }
});

// ---------- bounds ----------

test("nonsense day counts and slot counts do not throw", () => {
  assert.deepEqual(H.fullBodyPatternPlan(0, 3), []);
  assert.deepEqual(H.fullBodyPatternPlan(null, null), []);
  assert.deepEqual(H.fullBodyPatternPlan(-2, 3), []);
  assert.equal(H.fullBodyPatternPlan(1, 99)[0].patterns.length, 4, "capped at four slots");
  assert.equal(H.fullBodyPatternPlan(1, 0)[0].patterns.length, 1, "floored at one");
  assert.equal(H.fullBodyPatternPlan(1, -5)[0].patterns.length, 1);
});

test("days are numbered from one, in order", () => {
  assert.deepEqual(H.fullBodyPatternPlan(4, 3).map(d => d.day), [1, 2, 3, 4]);
});

// ---------- what the generator is handed ----------

test("the plan text is one line per day, naming real pattern names", () => {
  const text = H.fullBodyPlanText(3, 3);
  assert.equal(text.split("\n").length, 3);
  assert.match(text, /^- Day 1 main lifts: Squat, Horizontal Push, Vertical Pull$/m);
  // The names must match PATTERNS exactly or the app cannot swap by pattern.
  const declared = src.slice(src.indexOf("const PATTERNS = ["), src.indexOf("];", src.indexOf("const PATTERNS = [")));
  for (const d of H.fullBodyPatternPlan(6, 4)) {
    for (const p of d.patterns) {
      assert.ok(declared.includes(`"${p}"`), `"${p}" is not one of the app's PATTERNS`);
    }
  }
});

test("an empty day list still produces a usable plan", () => {
  assert.equal(H.fullBodyPlanText(0, 3), "", "and the prompt falls back to four days");
});

// ---------- the athlete's choice ----------

test("full body is the default for anyone who never answered", () => {
  assert.equal(H.DEFAULT_SPLIT, "full_body");
  [undefined, null, {}, { splitStyle: null }, { splitStyle: "" }, { splitStyle: "bro_split" }]
    .forEach(i => assert.equal(H.splitStyleOf(i), "full_body", JSON.stringify(i)));
});

test("a choice the athlete actually made is honoured", () => {
  assert.equal(H.splitStyleOf({ splitStyle: "push_pull_legs" }), "push_pull_legs");
  assert.equal(H.splitStyleOf({ splitStyle: "upper_lower" }), "upper_lower");
});

test("every offered style is a real key, and full body is among them", () => {
  assert.ok(H.SPLIT_STYLES.some(s => s.key === H.DEFAULT_SPLIT));
  H.SPLIT_STYLES.forEach(s => {
    assert.ok(s.key && s.label && s.hint, JSON.stringify(s));
    assert.equal(H.splitStyleOf({ splitStyle: s.key }), s.key);
  });
});

// ---------- wiring: the prompt ----------

test("the generator is told how to split the week — it never was before", () => {
  const at = src.indexOf("function buildAIPrompt(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/HOW TO SPLIT THE WEEK/.test(body),
    "the prompt said nothing either way, so it defaulted to upper/lower every time");
  assert.ok(/EVERY SESSION IS A FULL-BODY SESSION/.test(body));
  assert.ok(/fullBodyPlanText\(\(intake\.trainingDays \|\| \[\]\)\.length \|\| 4, exerciseBudget\(intake\.sessionMinutes\)\.strength\)/.test(body),
    "the day assignment must be computed from the athlete's real days and session length");
});

test("the assignment is driven by the athlete's choice, not hardcoded", () => {
  const at = src.indexOf("function buildAIPrompt(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/splitStyleOf\(intake\) !== "full_body"/.test(body),
    "someone who asked for push/pull/legs must get it");
});

test("the prompt forbids repeating the same lift within a week", () => {
  const at = src.indexOf("A pattern that appears on more than one day");
  assert.notEqual(at, -1, "a three-day week reuses a pattern — the exercise must differ");
  assert.match(src.slice(at, at + 260), /DIFFERENT exercise each time/);
});

test("the prompt keeps lunges and carries out of the main lifts", () => {
  const at = src.indexOf("LUNGE is a priority pattern but NOT a main lift");
  assert.notEqual(at, -1);
  assert.match(src.slice(at, at + 300), /Secondary Movements/);
});

test("day names may not reintroduce a split through the back door", () => {
  assert.ok(/"Day 1 — Lower Body" is not/.test(src),
    "a full-body day called 'Lower Body' is the same failure with extra steps");
});

// ---------- wiring: the camp stage reaches the generator ----------

test("a fighter in camp gets a program built for their stage", () => {
  const at = src.indexOf("THIS ATHLETE IS IN A FIGHT CAMP");
  assert.notEqual(at, -1, "a 3-week camp must not be handed maximal strength work");
  // The stage is computed just above the block, in the IIFE that chooses it.
  const near = src.slice(at - 1200, at + 2200);
  assert.ok(/taperStageOn\(intake\.fightDate\)/.test(near), "keyed off the fight date");
  assert.ok(/NO LOADED STRENGTH WORK AT ALL/.test(near), "two weeks out the weights are gone");
  assert.ok(/Leave the "compound" phase EMPTY/.test(near),
    "and it needs to say where the work goes instead");
  assert.ok(/speed-strength/.test(near) && /never RPE 9-10|never 9-10/.test(near),
    "speed-strength means moderate load with maximal intent, not grinding");
});

test("power work is never the thing that gets cut", () => {
  const at = src.indexOf("Jumps, throws and power work are in EVERY session");
  assert.notEqual(at, -1,
    "the coach was explicit: power work is always integrated regardless of stage");
  assert.match(src.slice(at, at + 220), /MORE emphasis, not less/);
});

test("a program with no fight date ends on a test week", () => {
  const at = src.indexOf("NO EVENT TO TAPER TO");
  assert.notEqual(at, -1);
  const near = src.slice(at, at + 500);
  assert.ok(/TEST WEEK/.test(near));
  assert.ok(/personal record/.test(near), "the final week is what the program was building toward");
});

// ---------- wiring: the setup step ----------

test("the athlete is asked, so full body is a default and not a cage", () => {
  const at = src.indexOf("const athleteSteps = [");
  const body = src.slice(at, src.indexOf("];", at));
  assert.ok(body.includes("🧩 Session Style"));
  assert.ok(body.indexOf("📅 Training Schedule") < body.indexOf("🧩 Session Style"),
    "asking how to arrange the days only makes sense after they pick them");
});

test("a coach programming for himself is asked the same thing", () => {
  const at = src.indexOf("const TRAINING_INTAKE_STEPS");
  const body = src.slice(at, src.indexOf("];", at));
  assert.ok(body.includes("🧩 Session Style"), "the two questionnaires must not drift apart");
});

test("the step renders and cannot block anyone", () => {
  const at = src.indexOf('case "🧩 Session Style": {');
  assert.notEqual(at, -1, "a step with no body shows a blank screen");
  const body = src.slice(at, src.indexOf('case "🎂 Birthday": {', at));
  assert.ok(/SPLIT_STYLES\.map/.test(body), "it must offer the real list, not a hardcoded copy");
  assert.ok(/set\("splitStyle", opt\.key\)/.test(body));
  // Isaiah, 31 Oct: the suggestion for their number of days is the one marked
  // and pre-picked, so tapping nothing still gets a sensible split.
  assert.ok(/opt\.key === suggested/.test(body), "the suggested split should be marked");
  assert.ok(/deriveSplit\(data\.trainingDays\)/.test(body), "the suggestion must come from their days");
  const gates = (src.match(/case "🧩 Session Style": return true;/g) || []).length;
  assert.equal(gates, 2, "it defaults to full body, so Next is never blocked — in both flows");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
