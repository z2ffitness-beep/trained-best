// The fight camp taper, and why it overrules the block deload.
//
// The coach's rule, in his words: power work is always in, but the strength
// work converts and then stops. Maximal strength far out; around six weeks it
// becomes speed-strength derivatives; three to four weeks out they get
// progressively lighter and the point is speed; at two weeks out "the weights
// are pretty much fully out of the picture".
//
// The app already backed athletes off on its own schedule — a deload on the
// last week of every 4-week block. On a camp that fires wherever the grid
// happens to land. Two systems backing the same athlete off on two different
// calendars is worse than either alone.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "toLocalISO", kind: "const" }, { name: "todayISO", kind: "const" },
  { name: "PHASE_WEEKS", kind: "const" }, { name: "MIN_WEEKS_FOR_DELOAD", kind: "const" },
  "parseDateParts", "daysBetweenISO", "addDaysISO", "buildProgramPlan",
  { name: "TAPER_STAGES", kind: "const" },
  "taperStageOn", "taperStageForWeek", "programHasTaper", "planForFight",
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// Lia's real camp: 5 weeks, started 22 September, fight 24 October 2026.
const FIGHT = "2026-10-24";
const LIA = { weeks: 5, startedOn: "2026-09-22" };

// ---------- the curve, in days out ----------

test("the day of the fight is fight week", () => {
  assert.equal(H.taperStageOn(FIGHT, FIGHT).key, "peak");
});

test("two weeks out the weights come out", () => {
  // 14 days is the line. This is the one the coach was most specific about.
  assert.equal(H.taperStageOn(FIGHT, "2026-10-10").key, "peak", "14 days out");
  assert.equal(H.taperStageOn(FIGHT, "2026-10-10").lifting, "none");
  assert.equal(H.taperStageOn(FIGHT, "2026-10-09").key, "speed", "15 days out is still lifting");
});

test("three to four weeks out is speed-strength, getting lighter", () => {
  assert.equal(H.taperStageOn(FIGHT, "2026-09-26").key, "speed", "28 days out");
  assert.equal(H.taperStageOn(FIGHT, "2026-10-01").key, "speed", "23 days out");
  assert.equal(H.taperStageOn(FIGHT, "2026-09-26").lifting, "speed-strength");
});

test("five to six weeks out is the conversion", () => {
  assert.equal(H.taperStageOn(FIGHT, "2026-09-25").key, "convert", "29 days out");
  assert.equal(H.taperStageOn(FIGHT, "2026-09-12").key, "convert", "42 days out");
  assert.equal(H.taperStageOn(FIGHT, "2026-09-11").key, "base", "43 days out is still building");
});

test("far out is maximal strength", () => {
  assert.equal(H.taperStageOn(FIGHT, "2026-06-01").key, "base");
  assert.equal(H.taperStageOn(FIGHT, "2026-06-01").lifting, "maximal");
});

test("every boundary is exact — one day either side changes the stage", () => {
  const boundaries = [[14, "peak", "speed"], [28, "speed", "convert"], [42, "convert", "base"]];
  for (const [days, inside, outside] of boundaries) {
    assert.equal(H.taperStageOn(FIGHT, H.addDaysISO(FIGHT, -days)).key, inside, `${days} days out`);
    assert.equal(H.taperStageOn(FIGHT, H.addDaysISO(FIGHT, -(days + 1))).key, outside, `${days + 1} days out`);
  }
});

// ---------- the live case the coach signed off on ----------

test("Lia is on speed-strength today, and loses the weights on 10 October", () => {
  // Checked against the coach directly: "for Lia, that actually makes sense."
  assert.equal(H.daysBetweenISO("2026-09-26", FIGHT), 28, "she is exactly four weeks out");
  assert.equal(H.taperStageOn(FIGHT, "2026-09-26").key, "speed");
  assert.equal(H.taperStageOn(FIGHT, "2026-10-10").lifting, "none");
  assert.equal(H.taperStageOn(FIGHT, "2026-10-09").lifting, "speed-strength");
});

test("her five camp weeks land on the stages you'd expect", () => {
  const stages = [1, 2, 3, 4, 5].map(w => H.taperStageForWeek(LIA, w, FIGHT).key);
  // Camp starts 22 Sep (32 days out) and the fight is in week 5.
  assert.deepEqual(stages, ["convert", "speed", "speed", "peak", "peak"]);
});

// ---------- no fight, or a fight that has been and gone ----------

test("no fight date means no taper at all", () => {
  assert.equal(H.taperStageOn(null, "2026-09-26"), null);
  assert.equal(H.taperStageOn("", "2026-09-26"), null);
  assert.equal(H.taperStageOn(undefined), null);
});

test("a fight in the past does not strand someone in fight week forever", () => {
  // An athlete who never updated their date would otherwise never lift again.
  assert.equal(H.taperStageOn(FIGHT, "2026-10-25"), null);
  assert.equal(H.taperStageOn(FIGHT, "2027-03-01"), null);
});

test("daysBetweenISO rejects malformed dates but NOT impossible ones", () => {
  // Worth pinning, because it is the reason taperStageOn cannot rely on it
  // alone. Date.parse happily accepts 30 February and rolls it into March.
  ["garbage", "24/10/2026", "2026-13-01", "2026-9-26", "", "2026-10-24T10:00:00"]
    .forEach(d => assert.equal(H.daysBetweenISO("2026-09-26", d), null, d));
  assert.notEqual(H.daysBetweenISO("2026-09-26", "2027-02-30"), null,
    "Date.parse rolls this to 2 March — which is why parseDateParts is also needed");
  assert.equal(H.daysBetweenISO("2026-09-26", "2026-10-24"), 28);
});

test("an impossible fight date in the FUTURE is refused, not rolled over", () => {
  // The past-date cases below pass for the wrong reason — the negative-days
  // check catches them. This is the one that actually exercises the guard.
  assert.equal(H.taperStageOn("2027-02-30", "2027-02-20"), null, "30 February");
  assert.equal(H.taperStageOn("2027-13-01", "2027-01-01"), null, "month 13");
  assert.equal(H.taperStageOn("2027-04-31", "2027-04-20"), null, "31 April");
  assert.equal(H.taperStageOn("2027-02-28", "2027-02-20").key, "peak", "a real one still works");
});

test("a junk date is refused rather than taken as today", () => {
  ["garbage", "24/10/2026", "2026-13-01", "2026-02-30"].forEach(d =>
    assert.equal(H.taperStageOn(d, "2026-09-26"), null, d));
  assert.equal(H.taperStageOn(FIGHT, "garbage"), null);
});

test("a fight two years out is not a camp", () => {
  const far = { weeks: 12, startedOn: "2026-09-22" };
  assert.equal(H.programHasTaper(far, "2028-10-24"), false,
    "every week reads as base — there is nothing to taper");
  assert.equal(H.programHasTaper(LIA, FIGHT), true);
  assert.equal(H.programHasTaper(LIA, null), false);
  assert.equal(H.programHasTaper(null, FIGHT), false);
});

test("a program with no start date cannot place its weeks and does not try", () => {
  assert.equal(H.taperStageForWeek({ weeks: 5 }, 1, FIGHT), null);
  assert.equal(H.taperStageForWeek({ weeks: 5, startedOn: "garbage" }, 1, FIGHT), null);
  assert.equal(H.taperStageForWeek(LIA, 0, FIGHT), null, "there is no week zero");
});

// ---------- the collision this exists to settle ----------

test("a fight date switches the block deload off", () => {
  const twelve = { weeks: 12, startedOn: "2026-09-22" };
  const plan = H.buildProgramPlan(12);
  assert.ok(plan.deloadWeeks.length > 0, "a 12-week program normally deloads");
  const camp = H.planForFight(plan, twelve, "2026-11-30");
  assert.deepEqual(camp.deloadWeeks, [],
    "two systems backing the same athlete off on two different calendars");
  // Weeks 11 and 12 of this program start on 1 and 8 December — after the
  // fight. They get no stage, which is right: the camp is over by then.
  assert.deepEqual(camp.taper.map(t => t.week), [1,2,3,4,5,6,7,8,9,10]);
  assert.equal(camp.taper.find(t => t.week === 10).key, "peak", "fight week");
});

test("weeks that fall after the fight carry no stage", () => {
  const twelve = { weeks: 12, startedOn: "2026-09-22" };
  const camp = H.planForFight(H.buildProgramPlan(12), twelve, "2026-11-30");
  assert.equal(camp.taper.some(t => t.week > 10), false,
    "a program that runs past the fight is not still tapering to it");
  assert.equal(H.taperStageForWeek(twelve, 12, "2026-11-30"), null);
});

test("without a fight date the plan is returned untouched, by reference", () => {
  const plan = H.buildProgramPlan(12);
  assert.equal(H.planForFight(plan, { weeks: 12, startedOn: "2026-09-22" }, null), plan);
  assert.equal(H.planForFight(plan, { weeks: 12 }, FIGHT), plan, "no start date, no taper");
});

test("the blocks survive — only the deload weeks are dropped", () => {
  const twelve = { weeks: 12, startedOn: "2026-09-22" };
  const plan = H.buildProgramPlan(12);
  const camp = H.planForFight(plan, twelve, "2026-11-30");
  assert.deepEqual(camp.blocks, plan.blocks, "the block structure still describes the program");
  assert.equal(camp.weeks, plan.weeks);
  assert.equal(camp.fightDate, "2026-11-30");
});

// ---------- the constant underneath it all ----------

test("no stage ever removes power work", () => {
  // "The jumps and the throws and the power work will always be integrated
  // regardless of the time of the program."
  for (const stage of H.TAPER_STAGES) {
    assert.ok(!/no (plyo|power|jump|throw)/i.test(stage.note),
      `${stage.key} must not cut power work`);
  }
  const peak = H.TAPER_STAGES.find(s => s.key === "peak");
  assert.match(peak.note, /[Pp]lyo/, "fight week is plyos and ballistics, not rest");
  assert.equal(peak.lifting, "none", "but no loaded strength work");
});

test("the stages are ordered so the first match wins", () => {
  const caps = H.TAPER_STAGES.map(s => s.maxDaysOut);
  assert.deepEqual(caps, [...caps].sort((a, b) => a - b),
    "find() takes the first match — an out-of-order list silently mis-stages everyone");
  assert.equal(caps[caps.length - 1], Infinity, "the last stage must catch everything else");
});

test("every day from a year out to the fight lands in exactly one stage", () => {
  for (let d = 0; d <= 365; d++) {
    const on = H.addDaysISO(FIGHT, -d);
    const stage = H.taperStageOn(FIGHT, on);
    assert.ok(stage, `${d} days out fell through`);
    const matches = H.TAPER_STAGES.filter(s => d <= s.maxDaysOut);
    assert.equal(stage.key, matches[0].key, `${d} days out`);
  }
});

// ---------- wiring ----------

test("the program page runs the plan through the taper", () => {
  const at = src.indexOf("function AthleteProgram(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/const plan = planForFight\(base, myProgram, state\.me\.intake\?\.fightDate\)/.test(body),
    "the fight date is captured at signup — it has to reach the plan");
});

test("dates are shifted in UTC, like every other date in this file", () => {
  const at = src.indexOf("function addDaysISO(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/T00:00:00Z/.test(body), "local time loses a day across a DST boundary");
  assert.ok(!/getDate\(\)|setDate\(/.test(body));
  // And prove it rather than trusting the read.
  const saved = process.env.TZ;
  try {
    const answers = ["UTC", "America/Toronto", "Pacific/Kiritimati"].map(tz => {
      process.env.TZ = tz;
      return H.addDaysISO("2026-11-01", -14);
    });
    assert.deepEqual(answers, ["2026-10-18", "2026-10-18", "2026-10-18"],
      "a DST boundary sits inside this range in Toronto");
  } finally {
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
  }
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
