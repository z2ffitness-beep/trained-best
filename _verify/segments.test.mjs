// Deleting a section of a session, and taking it back.
//
// The unit the athlete deletes is a SECTION - "Conditioning", "Warm-Up" - and
// sections don't map one-to-one onto the phase keys stored on each exercise:
// Warm-Up covers warmup_general AND warmup_specific, Conditioning covers
// lactic AND aerobic. Getting that mapping wrong deletes half a section and
// leaves the rest sitting there, which reads as the delete being broken.
//
// Shapes here are taken from the program the live generator actually produced
// (MMA Foundations, 8 weeks): 5 warm-ups, 3 primers, 7 of main work, 2 to
// cool down, on each of three days.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  "buildSessionBlocks", "blockForPhase", "estimateExerciseSeconds", "parseRestSeconds",
  { name: "SESSION_BLOCKS", kind: "const" },
  { name: "SET_SECONDS", kind: "const" },
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

let n = 0;
const ex = (phase) => ({ id: "x" + (++n), exerciseId: "e" + n, phase, sets: 3, reps: "10", rpe: 7, rest: "90s" });

const realDay = () => ({
  id: "d1",
  name: "Day 1 — Squat Pattern, Upper Push/Pull & Power",
  exercises: [
    ...Array.from({ length: 5 }, () => ex("warmup_general")),
    ...Array.from({ length: 3 }, () => ex("warmup_specific")),
    ex("explosive"), ex("explosive"),
    ex("compound"), ex("compound"),
    ex("hypertrophy"), ex("hypertrophy"),
    ex("lactic"),
    ex("cooldown"), ex("cooldown"),
  ],
});

// The app's own delete, lifted verbatim: filter out every phase the section owns.
const removeSegment = (days, block, dayId) => {
  const phases = new Set(block.phases);
  const strip = d => ({ ...d, exercises: d.exercises.filter(e => !phases.has(e.phase)) });
  return days.map(d => (dayId && d.id !== dayId) ? d : strip(d));
};
const blockNamed = (label) => H.SESSION_BLOCKS.find(b => b.label === label);

// ---------- the sections match what the generator produced ----------

test("a real generated day groups into the six sections", () => {
  const blocks = H.buildSessionBlocks(realDay().exercises);
  assert.deepEqual(
    blocks.map(b => [b.label, b.items.length]),
    [["Warm-Up", 8], ["Power", 2], ["Primary Movements", 2], ["Secondary Movements", 2], ["Conditioning", 1], ["Cool-Down", 2]],
  );
});

test("sections appear in session order, never by when they were added", () => {
  const scrambled = [ex("cooldown"), ex("compound"), ex("warmup_general"), ex("lactic")];
  assert.deepEqual(
    H.buildSessionBlocks(scrambled).map(b => b.label),
    ["Warm-Up", "Primary Movements", "Conditioning", "Cool-Down"],
  );
});

test("an empty section is not offered for deletion", () => {
  const noConditioning = realDay().exercises.filter(e => e.phase !== "lactic");
  assert.ok(!H.buildSessionBlocks(noConditioning).some(b => b.label === "Conditioning"));
});

// ---------- deleting a section takes ALL of its phases ----------

test("deleting Warm-Up removes the primers too, not just the dynamic work", () => {
  const [day] = removeSegment([realDay()], blockNamed("Warm-Up"), "d1");
  assert.equal(day.exercises.length, 9);
  assert.ok(!day.exercises.some(e => e.phase === "warmup_general"));
  assert.ok(!day.exercises.some(e => e.phase === "warmup_specific"), "primers were left behind");
});

test("deleting Conditioning removes both lactic and aerobic work", () => {
  const day = realDay();
  day.exercises.push(ex("aerobic"));
  const [after] = removeSegment([day], blockNamed("Conditioning"), "d1");
  assert.ok(!after.exercises.some(e => ["lactic", "aerobic"].includes(e.phase)));
});

test("deleting a section leaves every other section untouched", () => {
  const before = realDay();
  const [after] = removeSegment([before], blockNamed("Power"), "d1");
  const kept = H.buildSessionBlocks(after.exercises).map(b => [b.label, b.items.length]);
  assert.deepEqual(kept, [["Warm-Up", 8], ["Primary Movements", 2], ["Secondary Movements", 2], ["Conditioning", 1], ["Cool-Down", 2]]);
});

// ---------- this session versus every session ----------

test("'just this session' leaves the other days alone", () => {
  const days = [realDay(), { ...realDay(), id: "d2" }, { ...realDay(), id: "d3" }];
  const after = removeSegment(days, blockNamed("Conditioning"), "d1");
  assert.equal(after[0].exercises.filter(e => e.phase === "lactic").length, 0);
  assert.equal(after[1].exercises.filter(e => e.phase === "lactic").length, 1);
  assert.equal(after[2].exercises.filter(e => e.phase === "lactic").length, 1);
});

test("'every session' clears the section across the whole program", () => {
  const days = [realDay(), { ...realDay(), id: "d2" }, { ...realDay(), id: "d3" }];
  const after = removeSegment(days, blockNamed("Conditioning"), null);
  assert.ok(after.every(d => !d.exercises.some(e => e.phase === "lactic")));
  assert.ok(after.every(d => d.exercises.length === 16), "other sections were hit as well");
});

// ---------- undo ----------

test("undo restores the exact list, order included", () => {
  const before = [realDay()];
  const snapshot = before[0].exercises;          // what the app hands to Undo
  const idsBefore = snapshot.map(e => e.id);

  const after = removeSegment(before, blockNamed("Primary Movements"), "d1");
  assert.equal(after[0].exercises.length, 15);

  // Restoring is assigning the snapshot back, so it has to still be intact
  // and in its original order - not a rebuilt list with survivors appended.
  assert.deepEqual(snapshot.map(e => e.id), idsBefore);
  assert.deepEqual(H.buildSessionBlocks(snapshot).map(b => b.label),
    ["Warm-Up", "Power", "Primary Movements", "Secondary Movements", "Conditioning", "Cool-Down"]);
});

test("deleting does not mutate the snapshot Undo is holding", () => {
  const before = [realDay()];
  const lengthBefore = before[0].exercises.length;
  removeSegment(before, blockNamed("Warm-Up"), "d1");
  assert.equal(before[0].exercises.length, lengthBefore, "the delete mutated the array Undo would restore");
});


// ---------- adding, which has to be the mirror of deleting ----------

// The app's own rule: a section owns the phase, so an exercise added under
// Conditioning IS conditioning even when the library files it as power.
const phaseForBlock = (block, exercise) =>
  (block && !block.phases.includes(exercise.phase)) ? block.phases[0] : exercise.phase;

test("an exercise added to a section lands in that section", () => {
  const day = realDay();
  const swing = { id: "e99", phase: "explosive" };            // library says power
  day.exercises.push({ id: "xNew", exerciseId: swing.id, phase: phaseForBlock(blockNamed("Conditioning"), swing), sets: 3, reps: "10", rpe: 7, rest: "90s" });
  const conditioning = H.buildSessionBlocks(day.exercises).find(b => b.label === "Conditioning");
  assert.equal(conditioning.items.length, 2, "the added exercise did not join Conditioning");
});

test("an exercise already belonging to the section keeps its own phase", () => {
  const swing = { id: "e99", phase: "lactic" };
  assert.equal(phaseForBlock(blockNamed("Conditioning"), swing), "lactic");
});

test("added from the day rather than a section, the library's phase stands", () => {
  const swing = { id: "e99", phase: "explosive" };
  assert.equal(phaseForBlock(null, swing), "explosive");
});

test("a deleted section can be rebuilt by adding one exercise back", () => {
  let days = [realDay()];
  days = removeSegment(days, blockNamed("Conditioning"), "d1");
  assert.ok(!H.buildSessionBlocks(days[0].exercises).some(b => b.label === "Conditioning"));

  const run = { id: "e98", phase: "compound" };
  days[0].exercises.push({ id: "xBack", exerciseId: run.id, phase: phaseForBlock(blockNamed("Conditioning"), run), sets: 3, reps: "10", rpe: 7, rest: "90s" });
  const back = H.buildSessionBlocks(days[0].exercises).find(b => b.label === "Conditioning");
  assert.ok(back, "the section could not be brought back");
  assert.equal(back.items.length, 1);
});

test("adding to one section leaves the others exactly as they were", () => {
  const day = realDay();
  const before = H.buildSessionBlocks(day.exercises).map(b => [b.label, b.items.length]);
  const ex = { id: "e97", phase: "hypertrophy" };
  day.exercises.push({ id: "xAcc", exerciseId: ex.id, phase: phaseForBlock(blockNamed("Secondary Movements"), ex), sets: 3, reps: "10", rpe: 7, rest: "90s" });
  const after = H.buildSessionBlocks(day.exercises).map(b => [b.label, b.items.length]);
  for (const [label, count] of before) {
    const now = after.find(a => a[0] === label)[1];
    assert.equal(now, label === "Secondary Movements" ? count + 1 : count, `${label} changed`);
  }
});

// ---------- in person or online, per session ----------
//
// Not every client is one or the other. The per-day control already existed;
// what was missing was setting the whole program at once, which is what a coach
// actually wants for a client who is entirely online.

const MODE = await load(APP, ["setAllDayModes", "programSessionMode", "setDayDefaultMode",
                              { name: "DEFAULT_SESSION_MODE", kind: "const" }]);

const prog = () => ([
  { id: "d1", mode: "in_person", modeByDate: { "2026-10-01": "online" }, exercises: [] },
  { id: "d2", mode: "in_person", modeByDate: {}, exercises: [] },
  { id: "d3", modeByDate: {}, exercises: [] },
]);

test("one tap moves every session online", () => {
  const out = MODE.setAllDayModes(prog(), "online");
  assert.deepEqual(out.map(d => d.mode), ["online", "online", "online"]);
});

test("a date the coach already decided on is not wiped", () => {
  const out = MODE.setAllDayModes(prog(), "online");
  assert.deepEqual(out[0].modeByDate, { "2026-10-01": "online" },
    "'she's away that Thursday' is a specific decision and must survive a default change");
});

test("the program reads as one mode only when every day agrees", () => {
  assert.equal(MODE.programSessionMode(MODE.setAllDayModes(prog(), "online")), "online");
  assert.equal(MODE.programSessionMode([{ id: "a", mode: "online" }, { id: "b", mode: "in_person" }]), null,
    "two of three online is mixed, and the control must not claim otherwise");
});

test("a day that never had a mode counts as the default", () => {
  assert.equal(MODE.programSessionMode([{ id: "a" }, { id: "b", mode: MODE.DEFAULT_SESSION_MODE }]),
    MODE.DEFAULT_SESSION_MODE);
});

test("an empty program has no mode to report", () => {
  assert.equal(MODE.programSessionMode([]), null);
  assert.equal(MODE.programSessionMode(null), null);
});

test("setting all days does not disturb the exercises", () => {
  const before = prog();
  const after = MODE.setAllDayModes(before, "online");
  assert.deepEqual(after.map(d => d.id), before.map(d => d.id));
  assert.equal(before[0].mode, "in_person", "the original array must not be mutated");
});

test("one day can still differ afterwards", () => {
  let days = MODE.setAllDayModes(prog(), "online");
  days = MODE.setDayDefaultMode(days, "d2", "in_person");
  assert.deepEqual(days.map(d => d.mode), ["online", "in_person", "online"]);
  assert.equal(MODE.programSessionMode(days), null);
});

for (const [name, fn] of tests) {
  try { fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
