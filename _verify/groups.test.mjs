// Supersets and circuits. The grouping rules decide what the athlete sees on
// screen and when the rest timer fires, so getting them wrong either hides
// work or sends someone to sit down in the middle of a pair.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  "defaultGroupKind", "groupKindMeta", "groupSessionExercises",
  "blockPrescribedSets", "blockRoundItems", "blockRestAfter", "blockItemLabel",
  { name: "GROUP_KINDS", kind: "const" },
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const item = (id, over = {}) => ({ id, exerciseId: "e" + id, sets: 3, reps: "10", rest: "90s", rpe: 7, ...over });

// ---------- what counts as what ----------

test("two movements is a superset, three or more is a circuit", () => {
  assert.equal(H.defaultGroupKind(2), "superset");
  assert.equal(H.defaultGroupKind(3), "circuit");
  assert.equal(H.defaultGroupKind(5), "circuit");
});

test("an unknown kind falls back rather than rendering nothing", () => {
  assert.equal(H.groupKindMeta("nonsense", 2).key, "superset");
  assert.equal(H.groupKindMeta(null, 4).key, "circuit");
  assert.equal(H.groupKindMeta("circuit", 2).key, "circuit");
});

// ---------- turning a day into blocks ----------

test("an ungrouped day becomes one block per exercise", () => {
  const blocks = H.groupSessionExercises([item("a"), item("b"), item("c")]);
  assert.equal(blocks.length, 3);
  assert.ok(blocks.every(b => !b.grouped));
  assert.ok(blocks.every(b => b.label === null));
});

test("consecutive exercises sharing a group become one block", () => {
  const blocks = H.groupSessionExercises([
    item("a"),
    item("b", { groupId: "g1" }),
    item("c", { groupId: "g1" }),
    item("d"),
  ]);
  assert.deepEqual(blocks.map(b => b.items.map(i => i.id)), [["a"], ["b", "c"], ["d"]]);
  assert.equal(blocks[1].grouped, true);
  assert.equal(blocks[1].kind, "superset");
});

test("a group id reappearing later starts a new block", () => {
  // After a reorder, a repeated id must not yank a movement out of its place
  // in the session and staple it to something three exercises earlier.
  const blocks = H.groupSessionExercises([
    item("a", { groupId: "g1" }),
    item("b", { groupId: "g1" }),
    item("c"),
    item("d", { groupId: "g1" }),
  ]);
  assert.deepEqual(blocks.map(b => b.items.map(i => i.id)), [["a", "b"], ["c"], ["d"]]);
  // The stranded single is not a group of one.
  assert.equal(blocks[2].grouped, false);
});

test("labels run A, B, C down the session and skip straight sets", () => {
  const blocks = H.groupSessionExercises([
    item("w"),
    item("a", { groupId: "g1" }), item("b", { groupId: "g1" }),
    item("x"),
    item("c", { groupId: "g2" }), item("d", { groupId: "g2" }),
  ]);
  assert.deepEqual(blocks.map(b => b.label), [null, "A", null, "B"]);
});

test("labels come from position, so deleting a block renumbers the rest", () => {
  // A stored label would leave a superset called "C" sitting second in the day.
  const after = H.groupSessionExercises([
    item("c", { groupId: "g2" }), item("d", { groupId: "g2" }),
  ]);
  assert.equal(after[0].label, "A");
});

test("a movement's label is its group letter plus its position", () => {
  const [block] = H.groupSessionExercises([item("a", { groupId: "g" }), item("b", { groupId: "g" })]);
  assert.equal(H.blockItemLabel(block, 0), "A1");
  assert.equal(H.blockItemLabel(block, 1), "A2");
  // A straight set has no label to give.
  const [solo] = H.groupSessionExercises([item("z")]);
  assert.equal(H.blockItemLabel(solo, 0), null);
});

test("an explicit kind beats the count", () => {
  const [block] = H.groupSessionExercises([
    item("a", { groupId: "g", groupKind: "circuit" }),
    item("b", { groupId: "g", groupKind: "circuit" }),
  ]);
  assert.equal(block.kind, "circuit");
});

// ---------- rounds ----------

test("rounds default to the most sets any movement in the block is given", () => {
  const [block] = H.groupSessionExercises([
    item("a", { groupId: "g", sets: 3 }),
    item("b", { groupId: "g", sets: 4 }),
  ]);
  assert.equal(block.rounds, 4);
});

test("a stored round count no longer overrides the sets", () => {
  // A second number nothing kept in step with the sets: "5 rounds" of
  // 3-set movements rendered two empty rounds, and "2 rounds" logged a
  // circuit done exactly as written as 67% adherence.
  const [block] = H.groupSessionExercises([
    item("a", { groupId: "g", sets: 3, groupRounds: 5 }),
    item("b", { groupId: "g", sets: 3 }),
  ]);
  assert.equal(block.rounds, 3);
  for (let r = 1; r <= block.rounds; r++) {
    assert.ok(H.blockRoundItems(block, r).length > 0, `round ${r} is empty`);
  }
});

test("rounds are a whole, non-negative number whatever the data says", () => {
  const [block] = H.groupSessionExercises([
    item("a", { groupId: "g", sets: "3.5" }),
    item("b", { groupId: "g", sets: -2 }),
  ]);
  assert.equal(block.rounds, 3);
  const [none] = H.groupSessionExercises([
    item("a", { groupId: "g2", sets: null }), item("b", { groupId: "g2", sets: undefined }),
  ]);
  assert.equal(none.rounds, 0);
});

test("a movement sits out the rounds it was not prescribed", () => {
  // Rather than being silently handed a fourth set nobody asked for.
  const [block] = H.groupSessionExercises([
    item("a", { groupId: "g", sets: 4 }),
    item("b", { groupId: "g", sets: 2 }),
  ]);
  assert.deepEqual(H.blockRoundItems(block, 1).map(i => i.id), ["a", "b"]);
  assert.deepEqual(H.blockRoundItems(block, 2).map(i => i.id), ["a", "b"]);
  assert.deepEqual(H.blockRoundItems(block, 3).map(i => i.id), ["a"]);
  assert.deepEqual(H.blockRoundItems(block, 4).map(i => i.id), ["a"]);
});

test("a straight block's round count is just its sets", () => {
  const [block] = H.groupSessionExercises([item("a", { sets: 5 })]);
  assert.equal(block.rounds, 5);
  assert.equal(H.blockPrescribedSets(block), 5);
});

test("a block's prescribed sets add up across its movements", () => {
  const [block] = H.groupSessionExercises([
    item("a", { groupId: "g", sets: 3 }),
    item("b", { groupId: "g", sets: 3 }),
  ]);
  assert.equal(H.blockPrescribedSets(block), 6);
});

// ---------- where the rest goes ----------

test("there is no rest inside a superset", () => {
  // The entire point of the format. A timer firing after A1 sends the athlete
  // to sit down in the middle of the pair.
  const [block] = H.groupSessionExercises([
    item("a", { groupId: "g", rest: "15s" }),
    item("b", { groupId: "g", rest: "90s" }),
  ]);
  assert.equal(H.blockRestAfter(block, block.items[0], 1), null);
  assert.equal(H.blockRestAfter(block, block.items[1], 1), "90s");
});

test("the rest follows the last movement actually on in that round", () => {
  const [block] = H.groupSessionExercises([
    item("a", { groupId: "g", sets: 4, rest: "15s" }),
    item("b", { groupId: "g", sets: 2, rest: "120s" }),
  ]);
  // Rounds 1-2 end on B.
  assert.equal(H.blockRestAfter(block, block.items[1], 2), "120s");
  assert.equal(H.blockRestAfter(block, block.items[0], 2), null);
  // Round 3 has only A left, so A ends the round and carries its rest.
  assert.equal(H.blockRestAfter(block, block.items[0], 3), "15s");
});

test("a straight set rests after every set, as it always did", () => {
  const [block] = H.groupSessionExercises([item("a", { rest: "90s" })]);
  assert.equal(H.blockRestAfter(block, block.items[0], 1), "90s");
  assert.equal(H.blockRestAfter(block, block.items[0], 3), "90s");
});

// ---------- nothing breaks for programs that predate all this ----------

test("an exercise with no group fields behaves exactly as before", () => {
  const legacy = { id: "old", exerciseId: "e1", sets: 3, reps: "8", rest: "2m", rpe: 8 };
  const [block] = H.groupSessionExercises([legacy]);
  assert.equal(block.grouped, false);
  assert.equal(block.rounds, 3);
  assert.equal(H.blockRestAfter(block, legacy, 1), "2m");
  assert.deepEqual(H.blockRoundItems(block, 2).map(i => i.id), ["old"]);
});

test("an empty or missing day produces no blocks rather than throwing", () => {
  assert.deepEqual(H.groupSessionExercises([]), []);
  assert.deepEqual(H.groupSessionExercises(null), []);
  assert.deepEqual(H.groupSessionExercises(undefined), []);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) {
    console.error(`✖ ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
