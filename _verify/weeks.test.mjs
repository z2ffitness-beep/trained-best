// Which week of the program is it, and what does that make today's session?
//
// Both real programs on this account are periodised and both were imported as
// their first week repeated forever. Lia's fight camp swaps movements at week 3
// and rewrites its conditioning every week; the 26-week plan moves the squat
// from 65% to 90% and changes the movements six times. The coach looked at his
// own program in the app and concluded it had no progression in it.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  "programWeekFor", "weekEntryFor", "resolveExerciseForWeek",
  "resolveDayForWeek", "dayHasWeeklyPlan", "programHasWeeklyPlan", "weekChanges",
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// ---------- counting the week ----------

test("the start date is week 1, all week", () => {
  const p = { startedOn: "2026-09-28" };
  ["2026-09-28", "2026-09-30", "2026-10-04"].forEach(d =>
    assert.equal(H.programWeekFor(p, d), 1, d));
});

test("the eighth day is week 2", () => {
  assert.equal(H.programWeekFor({ startedOn: "2026-09-28" }, "2026-10-05"), 2);
});

test("week 26 of the real program lands where the document says", () => {
  // The source document dates week 26 as Mar 22.
  assert.equal(H.programWeekFor({ startedOn: "2026-09-28" }, "2026-03-22"), 1,
    "a date before the start reads as week 1, not a negative");
  assert.equal(H.programWeekFor({ startedOn: "2026-09-28" }, "2027-03-22"), 26);
});

test("weeks are counted from the start date, not from attendance", () => {
  // An athlete who trains nothing for a fortnight is in week 3, not week 1.
  assert.equal(H.programWeekFor({ startedOn: "2026-09-28" }, "2026-10-12"), 3);
});

test("a program with no start date has no week", () => {
  assert.equal(H.programWeekFor({}, "2026-10-05"), null);
  assert.equal(H.programWeekFor({ startedOn: "2026-09-28" }, null), null);
  assert.equal(H.programWeekFor(null, "2026-10-05"), null);
});

test("the database spelling of the column works too", () => {
  assert.equal(H.programWeekFor({ started_on: "2026-09-28" }, "2026-10-05"), 2);
});

// ---------- picking the entry that applies ----------

const depthDrop = {
  id: "x1", name: "Depth Drop", sets: 3, reps: "6", rpe: 7, phase: "explosive",
  byWeek: { "3": { name: "Depth Drop Jump" } },
};

test("an entry applies from its week onward, not only in that week", () => {
  assert.equal(H.resolveExerciseForWeek(depthDrop, 1).name, "Depth Drop");
  assert.equal(H.resolveExerciseForWeek(depthDrop, 2).name, "Depth Drop");
  assert.equal(H.resolveExerciseForWeek(depthDrop, 3).name, "Depth Drop Jump");
  assert.equal(H.resolveExerciseForWeek(depthDrop, 9).name, "Depth Drop Jump",
    "a block change must hold until the next one, or week 4 silently reverts");
});

test("the latest applicable entry wins, whatever order the keys are in", () => {
  const e = { name: "Squat", sets: 3, byWeek: { "9": { sets: 4 }, "1": { sets: 3 }, "5": { sets: 5 } } };
  assert.equal(H.resolveExerciseForWeek(e, 7).sets, 5);
  assert.equal(H.resolveExerciseForWeek(e, 9).sets, 4);
  assert.equal(H.resolveExerciseForWeek(e, 40).sets, 4, "past the last entry it holds, not resets");
});

test("an entry only changes what it mentions", () => {
  const out = H.resolveExerciseForWeek(depthDrop, 3);
  assert.equal(out.sets, 3);
  assert.equal(out.reps, "6");
  assert.equal(out.rpe, 7);
  assert.equal(out.phase, "explosive");
});

test("the exercise keeps its id so logs still line up", () => {
  assert.equal(H.resolveExerciseForWeek(depthDrop, 3).id, "x1");
});

test("a week can drop a movement entirely", () => {
  const nordic = { id: "n", name: "Nordic Curl", sets: 3, byWeek: { "4": { skip: true }, "5": { skip: false } } };
  assert.equal(H.resolveExerciseForWeek(nordic, 3).name, "Nordic Curl");
  assert.equal(H.resolveExerciseForWeek(nordic, 4), null, "deloads omit Nordics");
  assert.ok(H.resolveExerciseForWeek(nordic, 5), "and week 5 brings it back");
});

test("an exercise with no plan is returned untouched", () => {
  const plain = { id: "p", name: "Back Squat", sets: 3, reps: "8" };
  assert.equal(H.resolveExerciseForWeek(plain, 14), plain);
  assert.equal(H.weekEntryFor(plain, 14), null);
});

test("a week of zero or null resolves to the base program", () => {
  assert.equal(H.resolveExerciseForWeek(depthDrop, null).name, "Depth Drop");
  assert.equal(H.resolveExerciseForWeek(depthDrop, 0).name, "Depth Drop");
});

test("junk week keys are ignored rather than crashing", () => {
  const e = { name: "X", sets: 1, byWeek: { "abc": { sets: 9 }, "0": { sets: 8 }, "-3": { sets: 7 }, "2": { sets: 2 } } };
  assert.equal(H.resolveExerciseForWeek(e, 5).sets, 2);
});

// ---------- a whole session ----------

const day = {
  id: "d1", name: "Monday Hard A", weekday: "Monday",
  exercises: [
    { id: "a", name: "Acceleration Sprints", sets: 4, reps: "10 m @ 80-85%",
      byWeek: { "2": { sets: 4, reps: "15 m @ 85-90%" }, "3": { sets: 5, reps: "15 m @ 90%" } } },
    { id: "b", name: "Full-Range Back Squat", sets: 3, reps: "8 @ 65%",
      byWeek: { "3": { reps: "8 @ 70%" }, "14": { name: "Tempo Back Squat with Fast Ascent", reps: "3 @ 65%" } } },
    { id: "c", name: "Nordic Curl", sets: 2, reps: "6", byWeek: { "4": { skip: true } } },
  ],
};

test("a session resolves to the week being trained", () => {
  const w3 = H.resolveDayForWeek(day, 3);
  assert.deepEqual(w3.exercises.map(e => [e.name, e.sets, e.reps]), [
    ["Acceleration Sprints", 5, "15 m @ 90%"],
    ["Full-Range Back Squat", 3, "8 @ 70%"],
    ["Nordic Curl", 2, "6"],
  ]);
});

test("a dropped movement leaves the session, not a hole", () => {
  const w4 = H.resolveDayForWeek(day, 4);
  assert.equal(w4.exercises.length, 2);
  assert.ok(!w4.exercises.some(e => e.name === "Nordic Curl"));
});

test("resolving does not mutate the program", () => {
  H.resolveDayForWeek(day, 14);
  assert.equal(day.exercises[1].name, "Full-Range Back Squat");
  assert.equal(day.exercises.length, 3);
});

test("week 14 picks up the block's movement change", () => {
  const w14 = H.resolveDayForWeek(day, 14);
  assert.equal(w14.exercises[1].name, "Tempo Back Squat with Fast Ascent");
  assert.equal(w14.exercises[1].reps, "3 @ 65%");
  assert.equal(w14.exercises[0].reps, "15 m @ 90%", "the sprint entry from week 3 still holds at 14");
});

// ---------- does this program have weeks at all ----------

test("a flat program is not given a week control", () => {
  const flat = { days: [{ exercises: [{ name: "Back Squat", sets: 3 }] }] };
  assert.equal(H.programHasWeeklyPlan(flat), false);
  assert.equal(H.dayHasWeeklyPlan(flat.days[0]), false);
});

test("one planned movement is enough to earn the control", () => {
  assert.equal(H.programHasWeeklyPlan({ days: [day] }), true);
});

test("an empty byWeek does not count", () => {
  assert.equal(H.dayHasWeeklyPlan({ exercises: [{ name: "X", byWeek: {} }] }), false);
});

// ---------- what changed since last week ----------

test("a movement swap is reported as a swap", () => {
  const c = H.weekChanges(day, 14);
  const m = c.find(x => x.kind === "movement");
  assert.ok(m, "week 14 changes the squat");
  assert.equal(m.was.name, "Full-Range Back Squat");
  assert.equal(m.now.name, "Tempo Back Squat with Fast Ascent");
});

test("a load change is reported as a load change", () => {
  const c = H.weekChanges(day, 3);
  assert.ok(c.some(x => x.kind === "load" && x.now.name === "Full-Range Back Squat"));
});

test("a week that changes nothing reports nothing", () => {
  assert.deepEqual(H.weekChanges(day, 10), []);
});

test("week 1 has no previous week to compare against", () => {
  assert.deepEqual(H.weekChanges(day, 1), []);
});

// ---------- the resolver must never reach a save ----------
//
// The dangerous version of this feature resolves the program for display, the
// athlete edits one exercise, and the whole resolved week is written back as
// THE program - this week's numbers burned in and the other 25 weeks gone. It
// is silent, it is permanent, and it would look like the feature working.

const { programForDate } = await load(APP, ["programForDate", "programWeekFor",
  "programHasWeeklyPlan", "dayHasWeeklyPlan", "resolveDayForWeek",
  "resolveExerciseForWeek", "weekEntryFor"]);

function componentBody(name) {
  const at = src.indexOf("function " + name + "(");
  const end = src.indexOf("\nfunction ", at + 1);
  return src.slice(at, end === -1 ? undefined : end);
}
const SAVES = ["persistMyProgramDays", "persistMyDays", "queueProgramSave",
               "updateProgramRow", "ensureCustom"];

test("no component both resolves a week and writes the program", () => {
  const offenders = [];
  const re = /function ([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const body = componentBody(m[1]);
    if (!/const myProgram = programForDate/.test(body)) continue;
    const writes = SAVES.filter(w => body.includes(w));
    if (writes.length) offenders.push(`${m[1]} writes via ${writes.join(", ")}`);
  }
  assert.deepEqual(offenders, [],
    "a screen that resolves for display must not also save, or the week gets burned in");
});

test("the save helper itself reads the raw program", () => {
  assert.ok(!/const myProgram = programForDate/.test(componentBody("persistMyProgramDays")),
    "persistMyProgramDays is THE save path and must never see a resolved program");
});

test("a flat program comes back as the very same object", () => {
  const flat = { days: [{ exercises: [{ name: "Back Squat", sets: 3 }] }], startedOn: "2026-09-28" };
  assert.equal(programForDate(flat, "2026-11-01"), flat,
    "identity, so nothing about an existing program can shift");
});

test("a planned program resolves and reports its week", () => {
  const p = {
    startedOn: "2026-09-28",
    days: [{ exercises: [{ id: "a", name: "Squat", sets: 3, reps: "8 @ 65%",
                           byWeek: { "3": { reps: "8 @ 70%" } } }] }],
  };
  const out = programForDate(p, "2026-10-12");   // week 3
  assert.equal(out.currentWeek, 3);
  assert.equal(out.days[0].exercises[0].reps, "8 @ 70%");
  assert.equal(p.days[0].exercises[0].reps, "8 @ 65%", "the source must be untouched");
});

test("no start date means no resolution rather than a wrong week", () => {
  const p = { days: [{ exercises: [{ name: "X", byWeek: { "2": { sets: 9 } } }] }] };
  assert.equal(programForDate(p, "2026-10-12"), p);
});

// ---------- authored weeks beat generated ones ----------
//
// The app already had a week system, but a GENERATED one: it invents blocks
// every few weeks, invents deloads, and ramps sets and reps mechanically. For a
// program the coach wrote out week by week that is worse than showing week 1
// forever - it puts numbers on the screen that nobody prescribed, and they look
// deliberate. Authored data has to switch the generator off.

const P = await load(APP, ["prescribeForWeek", "buildProgramPlan", "weekWithinPhase",
  { name: "SESSION_BLOCKS", kind: "const" },
  "applyPhaseIntent", "applyProgression", "applyDeload", "blockForPhase", "resolveExerciseForWeek",
  "weekEntryFor", "currentProgramWeek", "programWeekFor",
  { name: "todayISO", kind: "const" },
  { name: "PHASE_WEEKS", kind: "const" }, { name: "MIN_WEEKS_FOR_DELOAD", kind: "const" }]);

const authored = { id: "s", name: "Full-Range Back Squat", sets: 3, reps: "8 @ 65%", rpe: 7,
                   byWeek: { "9": { sets: 4, reps: "3 @ 82.5%" } } };
const plan26 = P.buildProgramPlan(26);

test("an authored week is used exactly as written", () => {
  const out = P.prescribeForWeek(authored, plan26, 9, true);
  assert.equal(out.sets, 4);
  assert.equal(out.reps, "3 @ 82.5%");
});

test("the generator does not touch an authored program", () => {
  // Week 9 is deep enough into a 26-week plan that the generated progression
  // would certainly have altered it.
  const generated = P.prescribeForWeek(authored, plan26, 9, false);
  const written = P.prescribeForWeek(authored, plan26, 9, true);
  assert.notDeepEqual(generated, written,
    "if these matched the test would prove nothing");
  assert.equal(written.reps, "3 @ 82.5%", "the coach's number, untouched");
});

test("an authored week with no entry keeps the base, not a ramp", () => {
  const out = P.prescribeForWeek(authored, plan26, 2, true);
  assert.equal(out.reps, "8 @ 65%");
  assert.equal(out.sets, 3);
});

test("a program with no authored plan still gets the generated progression", () => {
  const plain = { id: "p", name: "Back Squat", sets: 3, reps: "8", rpe: 7 };
  const out = P.prescribeForWeek(plain, plan26, 9, false);
  assert.ok(out, "existing programs must keep working exactly as before");
});

test("an authored skip returns nothing for callers to filter", () => {
  const dropped = { id: "n", name: "Nordic Curl", sets: 3, byWeek: { "4": { skip: true } } };
  assert.equal(P.prescribeForWeek(dropped, plan26, 4, true), null);
});

test("every caller drops the holes at its own site", () => {
  // Each of the three call sites, checked where it actually is - counting
  // .filter(Boolean) across the whole file passes even after one is deleted.
  const sites = [...src.matchAll(/prescribeForWeek\(/g)].map(m => m.index);
  // Five call sites since 26 Oct: the program board (programBoardWeek).
  // Seven since 28 Oct: Adjust with AI writes the shown weeks out first
  // (bakeGeneratedProgression) and counts what changed (adjustDiff).
  assert.equal(sites.length, 8, "one declaration plus seven call sites");

  const [, ...calls] = sites;
  calls.forEach((at) => {
    const window = src.slice(at, at + 420);
    // Three shapes of the same decision: filter the nulls out of a list,
    // bail out of a map, or skip the iteration. What is not acceptable is
    // reading `.sets` off a movement this week dropped.
    assert.ok(/\.filter\(Boolean\)|if \(!item\) return null;|if \(!item \|\|/.test(window),
      "a dropped movement would leave a hole at:\n" + src.slice(at, at + 140));
  });

  // And the log that collects those nulls has to drop them before counting.
  const detail = src.slice(src.indexOf("const exerciseDetail = sortedExercises.map"));
  const end = detail.indexOf("const setsCompleted");
  assert.ok(/\}\)\.filter\(Boolean\);/.test(detail.slice(0, end)),
    "a null in exerciseDetail crashes the set count on finish");
});

test("there is one week calculation in the app, not two", () => {
  const body = src.slice(src.indexOf("function currentProgramWeek"));
  assert.ok(/programWeekFor\(program, todayStr\)/.test(body.slice(0, body.indexOf("\n}\n"))),
    "currentProgramWeek must delegate, or the two answers drift apart");
});

test("currentProgramWeek keeps its own contract", () => {
  assert.equal(P.currentProgramWeek({ weeks: 26 }, "2026-10-05"), 1, "unstarted reads as week 1");
  assert.equal(P.currentProgramWeek({ weeks: 5, startedOn: "2026-09-23" }, "2027-01-01"), 5,
    "nothing runs past the final week");
  assert.equal(P.currentProgramWeek({ weeks: 26, startedOn: "2026-09-28" }, "2026-10-05"), 2);
});

// ---------- blocks and deloads read off the plan, not invented ----------
//
// buildProgramPlan invents regular blocks and deloads from the week COUNT.
// The real 26-week plan runs blocks of 4, 4, 5, 4, 5, 4 and puts its deloads
// where the coach put them. Telling an athlete week 12 is a deload when the
// coach wrote week 13 is worse than saying nothing.

const B = await load(APP, ["authoredBlockStarts", "authoredBlocks", "weekSetVolume",
  "authoredDeloadWeeks", "resolveDayForWeek", "resolveExerciseForWeek", "weekEntryFor",
  { name: "DELOAD_DROP", kind: "const" }]);

// The shape of the real program: movements turn over at 5, 9, 14, 18 and 23.
const real = { weeks: 26, days: [{ exercises: [
  { id: "sq", name: "Full-Range Back Squat", sets: 3,
    byWeek: { "5": { sets: 3 }, "9": { sets: 4 },
              "14": { name: "Tempo Back Squat with Fast Ascent" },
              "18": { name: "Speed Back Squat" }, "23": { sets: 3 } } },
  // Week 23 turns the jump over - that is what makes it a block start, and the
  // live program really does carry this entry.
  { id: "cmj", name: "Countermovement Jump", sets: 2,
    byWeek: { "14": { name: "Low Drop Landing and Stick" },
              "18": { name: "Low Depth Jump" },
              "23": { name: "Approach Vertical Jump" } } },
  { id: "pu", name: "Pull-Up or Assisted Pull-Up", sets: 2,
    byWeek: { "5": { name: "Pull-Up with Load as Needed" },
              "9": { name: "Weighted or Bodyweight Pull-Up" },
              "18": { name: "Pull-Up with Fast Controlled Ascent" } } },
]}]};

test("a block starts where a movement changes", () => {
  assert.deepEqual(B.authoredBlockStarts(real), [1, 5, 9, 14, 18, 23]);
});

test("a week that only changes numbers does not start a block", () => {
  const numbersOnly = { weeks: 8, days: [{ exercises: [
    { id: "a", name: "Squat", sets: 3, byWeek: { "2": { sets: 4 }, "3": { reps: "5" } } }]}]};
  assert.deepEqual(B.authoredBlockStarts(numbersOnly), [1],
    "otherwise every week of a weekly wave becomes its own block");
});

test("blocks cover the whole program with no gaps", () => {
  const blocks = B.authoredBlocks(real);
  assert.equal(blocks.length, 6);
  assert.deepEqual(blocks.map(b => [b.startWeek, b.endWeek]),
    [[1,4],[5,8],[9,13],[14,17],[18,22],[23,26]],
    "these are the real block boundaries from the source document");
  assert.equal(blocks[blocks.length - 1].isFinal, true);
});

test("a program with no plan is one block", () => {
  assert.deepEqual(B.authoredBlocks({ weeks: 12, days: [{ exercises: [{ name: "Squat", sets: 3 }] }] }),
    [{ index: 1, startWeek: 1, endWeek: 12, isFinal: true }]);
});

test("a change past the end of the program is ignored", () => {
  const over = { weeks: 4, days: [{ exercises: [
    { id: "a", name: "Squat", sets: 3, byWeek: { "9": { name: "Front Squat" } } }]}]};
  assert.deepEqual(B.authoredBlockStarts(over).filter(w => w <= 4), [1]);
  assert.equal(B.authoredBlocks(over).length, 1);
});

// ---------- deloads ----------

const waved = { weeks: 5, days: [{ exercises: [
  { id: "a", name: "Squat", sets: 4, byWeek: { "4": { sets: 1 } } },
  { id: "b", name: "Press", sets: 4, byWeek: { "4": { sets: 1 } } },
]}]};

test("a real drop in work is a deload", () => {
  assert.equal(B.weekSetVolume(waved, 3), 8);
  assert.equal(B.weekSetVolume(waved, 4), 2);
  assert.deepEqual(B.authoredDeloadWeeks(waved), [4]);
});

test("the week after a deload is not one, even though work rose", () => {
  assert.ok(!B.authoredDeloadWeeks(waved).includes(5));
});

test("ordinary variation is not a deload", () => {
  const jitter = { weeks: 3, days: [{ exercises: [
    { id: "a", name: "Squat", sets: 10, byWeek: { "2": { sets: 9 } } }]}]};
  assert.deepEqual(B.authoredDeloadWeeks(jitter), [],
    `a 10% dip must not be called a deload; the threshold is ${B.DELOAD_DROP}`);
});

test("a dropped movement counts as less work", () => {
  const dropped = { weeks: 3, days: [{ exercises: [
    { id: "a", name: "Squat", sets: 5 },
    { id: "b", name: "Nordic", sets: 5, byWeek: { "2": { skip: true } } }]}]};
  assert.deepEqual(B.authoredDeloadWeeks(dropped), [2]);
});

test("a flat program has no deloads to report", () => {
  assert.deepEqual(B.authoredDeloadWeeks({ weeks: 6, days: [{ exercises: [{ name: "Squat", sets: 3 }] }] }), []);
});

test("the program screen uses the authored blocks, not the generated ones", () => {
  const at = src.indexOf("function AthleteProgram(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  // `base` is what the authored branch produces; the fight-camp taper then
  // wraps it. Renamed from `plan` when the taper went in — the assertion is
  // about the authored branch, not the variable it lands in.
  // programBlocks, not authoredBlocks: the raw detection reads movement-name
  // changes, which a coach's own per-week edit does not write, and it
  // collapsed a 12-week program to a single block.
  assert.ok(/const base = authoredWeeks\s*\n\s*\? \{ \.\.\.generated, blocks: programBlocks\(myProgram\), deloadWeeks: authoredDeloadWeeks\(myProgram\) \}\s*\n\s*: generated;/.test(body),
    "a written plan must supply its own blocks and back-off weeks, or the week "
    + "strip labels the wrong weeks");
  assert.ok(/const plan = planForFight\(base,/.test(body),
    "and whatever the authored branch produced must still reach `plan`");
});

test("the generated ramp narration is hidden for an authored program", () => {
  const at = src.indexOf("function AthleteProgram(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/\{!shownIsDeload && !authoredWeeks && \(\(\) => \{/.test(body),
    "'Building up' / 'Peak week' describes a ramp an authored program is not doing");
});

test("the back-off copy does not claim a 40% cut it did not make", () => {
  const at = src.indexOf("function AthleteProgram(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  const claim = body.indexOf("about 40% fewer sets");
  assert.ok(claim === -1 || /authoredWeeks\s*\n?\s*\?/.test(body.slice(claim - 300, claim)),
    "that number is generated; it must only be shown for a generated plan");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
