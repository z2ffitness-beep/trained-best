// The coach Dashboard's Sessions Today / Upcoming Sessions panel. It answers
// "who am I seeing today, and who is coming up this week", so a cancelled
// booking, a cancelled time, or yesterday's session showing here would send a
// coach to meet nobody.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  "localDayKey", "coachSessionsByDay",
  { name: "HOLDS_SPOT", kind: "const" },
  { name: "UPCOMING_SESSION_DAYS", kind: "const" },
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const now = new Date(2026, 9, 26, 11, 0); // Mon 26 Oct, 11 AM local
const at = (month, day, hour) => new Date(2026, month, day, hour, 0).toISOString();
const athletes = [{ id: "a", name: "Ann" }, { id: "b", name: "Ben" }];
const types = [{ id: "t", durationMin: 60, delivery: "virtual" }];

const build = (slots, bookings) => H.coachSessionsByDay({ sessionTypes: types, slots, bookings }, athletes, now);

test("today's sessions are listed in time order, with everyone in a shared slot", () => {
  const r = build(
    [{ id: "s1", startsAt: at(9, 26, 17), sessionTypeId: "t" }, { id: "s2", startsAt: at(9, 26, 8), sessionTypeId: "t" }],
    [
      { id: "b1", slotId: "s1", athleteId: "b", status: "booked" },
      { id: "b2", slotId: "s1", athleteId: "a", status: "booked" },
      { id: "b3", slotId: "s2", athleteId: "a", status: "attended" },
    ],
  );
  assert.deepEqual(r.today.map(x => x.id), ["b3", "b2", "b1"]);
  assert.equal(r.upcomingByDay.length, 0);
});

test("a session that has already finished today is still shown, marked over", () => {
  const r = build([{ id: "s", startsAt: at(9, 26, 8), sessionTypeId: "t" }], [{ id: "b", slotId: "s", athleteId: "a", status: "booked" }]);
  assert.equal(r.today[0].over, true);
});

test("cancelled bookings, cancelled times and past days are left out", () => {
  const r = build(
    [
      { id: "s1", startsAt: at(9, 27, 9), sessionTypeId: "t" },
      { id: "s2", startsAt: at(9, 28, 9), sessionTypeId: "t", cancelledAt: "2026-10-20T00:00:00Z" },
      { id: "s3", startsAt: at(9, 25, 9), sessionTypeId: "t" },
    ],
    [
      { id: "b1", slotId: "s1", athleteId: "a", status: "cancelled" },
      { id: "b2", slotId: "s2", athleteId: "a", status: "booked" },
      { id: "b3", slotId: "s3", athleteId: "a", status: "booked" },
    ],
  );
  assert.equal(r.today.length, 0);
  assert.equal(r.upcomingByDay.length, 0);
});

test("upcoming is grouped by day and stops after seven days", () => {
  const r = build(
    [
      { id: "s1", startsAt: at(9, 27, 9), sessionTypeId: "t" },
      { id: "s2", startsAt: at(9, 27, 18), sessionTypeId: "t" },
      { id: "s3", startsAt: at(10, 2, 9), sessionTypeId: "t" },  // 7 days out: in
      { id: "s4", startsAt: at(10, 3, 9), sessionTypeId: "t" },  // 8 days out: out
    ],
    ["s1", "s2", "s3", "s4"].map((s, i) => ({ id: "b" + i, slotId: s, athleteId: "a", status: "booked" })),
  );
  assert.deepEqual(r.upcomingByDay.map(g => [g.key, g.rows.length]), [["2026-10-27", 2], ["2026-11-02", 1]]);
});

test("open times nobody booked, and bookings for someone not on the roster, are left out", () => {
  const r = build(
    [{ id: "s1", startsAt: at(9, 26, 15), sessionTypeId: "t" }, { id: "s2", startsAt: at(9, 26, 16), sessionTypeId: "t" }],
    [{ id: "b", slotId: "s2", athleteId: "zz", status: "booked" }],
  );
  assert.equal(r.today.length, 0);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) {
    console.error(`✖ ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
