// Stopping a workout part-way through, and picking it back up.
//
// Leaving a session used to mean navigating away and hoping. It survived in
// the fourteen-hour draft, which nothing on screen said, so an athlete who
// had to leave the gym after three exercises had no way to know whether their
// sets were safe — and after a night's sleep they were not.
//
// A paused workout is the deliberate version: the athlete pressed Stop and
// chose to keep it. Its own key, no expiry, and the home screen asks about it
// every day until it is finished or dropped.
//
// Two older bugs are pinned here too, both the same shape. The draft and the
// stored timer are written under the durable session key and were being read
// and cleared under `day.id`, which is a fresh random string on every launch —
// so a finished session was never cleared out of the draft, and a stopped
// stopwatch came back as "shall I time this?" with the time gone.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

class FakeStorage {
  constructor() { this.map = new Map(); this.failWrites = false; this.failReads = false; }
  getItem(k) { if (this.failReads) throw new Error("blocked"); return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { if (this.failWrites) throw new Error("QuotaExceededError"); this.map.set(k, String(v)); }
  removeItem(k) { if (this.failWrites) throw new Error("blocked"); this.map.delete(k); }
}
const store = new FakeStorage();
globalThis.localStorage = store;

const H = await load(APP, [
  "storageGet", "storageSet",
  { name: "PAUSED_WORKOUT_KEY", kind: "const" },
  { name: "todayISO", kind: "const" },
  { name: "toLocalISO", kind: "const" },
  "readAllPaused", "readPausedWorkout", "writePausedWorkout", "clearPausedWorkout",
  "snoozePausedWorkout", "pausedWorkoutToShow", "pausedWhenLabel",
]);

const src = readSource(APP);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const reset = () => { store.map.clear(); store.failWrites = false; store.failReads = false; };

const paused = (extra = {}) => ({
  dayKey: "p1|Day 1", dayName: "Day 1 — Lower Power", date: "2025-09-08",
  exIdx: 2, notes: "", setChecks: { "0:back squat": [0, 1] },
  setWeights: {}, setReps: {}, handSet: {}, swappedMap: {}, seconds: 1240,
  ...extra,
});

// ---------- it survives ----------

test("what goes in comes back out", () => {
  reset();
  H.writePausedWorkout(paused(), "u1");
  const back = H.readPausedWorkout("u1");
  assert.equal(back.dayKey, "p1|Day 1");
  assert.equal(back.exIdx, 2);
  assert.equal(back.seconds, 1240);
  assert.deepEqual(back.setChecks, { "0:back squat": [0, 1] });
});

test("it has no expiry, unlike the draft", () => {
  // The whole point. A draft older than fourteen hours is yesterday's
  // accident; a paused workout is a decision, and it has to survive a
  // weekend away from the gym.
  reset();
  H.writePausedWorkout(paused({ savedAt: Date.now() - 30 * 24 * 60 * 60 * 1000 }), "u1");
  assert.ok(H.readPausedWorkout("u1"), "a month-old paused workout was dropped");
});

test("one athlete's paused workout is not another's", () => {
  // A shared phone at a gym's front desk is a real thing.
  reset();
  H.writePausedWorkout(paused(), "u1");
  assert.equal(H.readPausedWorkout("u2"), null);
  H.writePausedWorkout(paused({ dayKey: "p1|Day 3", dayName: "Day 3" }), "u2");
  assert.equal(H.readPausedWorkout("u1").dayKey, "p1|Day 1");
  assert.equal(H.readPausedWorkout("u2").dayKey, "p1|Day 3");
});

test("one per athlete: pausing a second session replaces the first", () => {
  reset();
  H.writePausedWorkout(paused(), "u1");
  H.writePausedWorkout(paused({ dayKey: "p1|Day 2", dayName: "Day 2" }), "u1");
  assert.equal(Object.keys(H.readAllPaused()).length, 1);
  assert.equal(H.readPausedWorkout("u1").dayKey, "p1|Day 2");
});

test("a record with no durable key is refused, not stored", () => {
  // Without a key there is nothing to match the card back to a session, so
  // storing it would produce an offer that cannot be accepted. Worse, since
  // there is one slot per athlete, it would do that by evicting a real
  // paused workout.
  reset();
  H.writePausedWorkout(paused(), "u1");
  H.writePausedWorkout({ dayName: "Day 1", exIdx: 1 }, "u1");
  const kept = H.readPausedWorkout("u1");
  assert.ok(kept, "a keyless record wiped out a real paused workout");
  assert.equal(kept.dayKey, "p1|Day 1");
});

test("the stored time of pausing is not reset by later writes", () => {
  reset();
  const then = Date.now() - 100000;
  H.writePausedWorkout(paused({ savedAt: then }), "u1");
  H.snoozePausedWorkout("u1", "2025-09-09");
  assert.equal(H.readPausedWorkout("u1").savedAt, then,
    "dismissing the card for a day made the workout look freshly paused");
});

test("dropping it leaves nothing behind", () => {
  reset();
  H.writePausedWorkout(paused(), "u1");
  H.clearPausedWorkout("u1");
  assert.equal(H.readPausedWorkout("u1"), null);
  assert.deepEqual(H.readAllPaused(), {});
});

test("blocked storage is a silent no, not a crash mid-workout", () => {
  reset();
  store.failWrites = true;
  H.writePausedWorkout(paused(), "u1");
  store.failWrites = false;
  assert.equal(H.readPausedWorkout("u1"), null);
  store.failReads = true;
  assert.equal(H.readPausedWorkout("u1"), null);
});

test("junk in the key is ignored rather than rendered", () => {
  reset();
  store.map.set(H.PAUSED_WORKOUT_KEY, JSON.stringify([1, 2, 3]));
  assert.deepEqual(H.readAllPaused(), {});
  store.map.set(H.PAUSED_WORKOUT_KEY, "not json");
  assert.deepEqual(H.readAllPaused(), {});
});

// ---------- "not today" ----------

test("dismissing it hides the card for that day only", () => {
  reset();
  H.writePausedWorkout(paused(), "u1");
  H.snoozePausedWorkout("u1", "2025-09-09");
  assert.equal(H.pausedWorkoutToShow("u1", "2025-09-09"), null);
  assert.ok(H.pausedWorkoutToShow("u1", "2025-09-10"), "it stayed hidden the next day too");
});

test("dismissing it does not drop it", () => {
  // The difference between "not today" and "throw it away" is the whole
  // reason there are three buttons on that card.
  reset();
  H.writePausedWorkout(paused(), "u1");
  H.snoozePausedWorkout("u1", "2025-09-09");
  const kept = H.readPausedWorkout("u1");
  assert.ok(kept, "the workout was deleted by being dismissed for the day");
  assert.deepEqual(kept.setChecks, { "0:back squat": [0, 1] });
});

test("dismissing nothing does nothing", () => {
  reset();
  H.snoozePausedWorkout("u1", "2025-09-09");
  assert.deepEqual(H.readAllPaused(), {});
});

// ---------- how long ago ----------

test("the first week reads as a weekday, after that as a date", () => {
  assert.equal(H.pausedWhenLabel("2025-09-09", "2025-09-09"), "earlier today");
  assert.equal(H.pausedWhenLabel("2025-09-08", "2025-09-09"), "yesterday");
  assert.equal(H.pausedWhenLabel("2025-09-04", "2025-09-09"), "on Thursday");
  // A fortnight on, "on Tuesday" implies a Tuesday that has since come round
  // again, so the date is spelled out.
  assert.equal(H.pausedWhenLabel("2025-08-26", "2025-09-09"), "on Tuesday, Aug 26");
});

test("a missing or broken date is left out rather than printed as Invalid Date", () => {
  assert.equal(H.pausedWhenLabel(null), null);
  assert.equal(H.pausedWhenLabel(""), null);
  assert.equal(H.pausedWhenLabel("not a date"), null);
});

// ---------- the two key-mismatch bugs ----------

test("the stored timer is written under the same key it is read under", () => {
  // restoreSessionTimer(dayKey, ...) is the only reader. Writing under
  // day.id — a fresh random string every launch — meant a stopped stopwatch
  // was filed where nothing would ever look for it.
  assert.ok(/writeSessionTimer\(\{ dayId: dayKey, date: todayISO\(\), \.\.\.patch \}\)/.test(src),
    "rememberTimer is still writing the timer under this launch's day id");
  assert.ok(!/writeSessionTimer\(\{ dayId: day\.id/.test(src),
    "something still writes the timer under day.id");
});

test("the draft is cleared under the key it was written under", () => {
  assert.ok(!/clearSessionDraft\(day\.id,/.test(src),
    "a draft is still being cleared under day.id, so it is never actually cleared");
  // Call sites only — the declaration names its parameter `dayId`.
  const clears = (src.match(/(?<!function )clearSessionDraft\(/g) || []).length;
  const byKey = (src.match(/clearSessionDraft\((dayKey|pausedWorkout\.dayKey)/g) || []).length;
  assert.ok(clears >= 3, `only ${clears} call sites found — the anchor has drifted`);
  assert.equal(byKey, clears, `${clears} calls clear a draft and ${byKey} use a durable key`);
});

test("a finished session stops being a paused one", () => {
  const at = src.indexOf("    clearSessionDraft(dayKey, state.me.id);\n    // It is logged");
  assert.ok(at > 0, "the finish path no longer clears the draft by key");
  assert.ok(/clearPausedWorkout\(state\.me\.id\);/.test(src.slice(at, at + 400)),
    "finishing a workout leaves it sitting on the home screen asking to be finished");
});

// ---------- the Stop sheet ----------

test("there is a Stop button, and it is red", () => {
  assert.ok(/onClick=\{openStop\} aria-label="Stop this workout"/.test(src),
    "the workout header has no Stop button");
  const at = src.indexOf('aria-label="Stop this workout"');
  const button = src.slice(at, at + 400);
  assert.ok(/C\.red/.test(button), "the Stop button is not red");
});

test("the header has room for the session's name", () => {
  // Stop, a 25px title and a labelled Back / Next Day control do not fit
  // across a 320px phone, and what was being squeezed out was the title —
  // the only thing up here that says which session this is. Measured: the
  // name truncated to "D...".
  assert.ok(!/aria-label="Next training day"/.test(src),
    "the day arrows are back in the header, which truncates the session name");
  assert.ok(!/requestDaySwitch\b(?!To)/.test(src),
    "requestDaySwitch is still being computed with nothing calling it");
});

test("the workout screen is about this workout only, the way back to other days is the Week tab", () => {
  // Isaiah, 23 Oct: no day strip, week/phase bubble or last-session recap
  // once a workout has started.
  assert.ok(!/Day \{dayIdx \+ 1\} of \{allDays\.length\}/.test(src), "the day strip is back");
  assert.ok(!/<LastSessionRecap /.test(src), "the last-session recap is back on the workout screen");
  // 26 Oct: the whole program lives on Week > Program, reached from the
  // bottom bar; the My Program switch at the top of the workout is gone.
  assert.ok(!/<ProgramWorkoutTabs/.test(src), "the My Program switch is back on the workout screen");
  assert.ok(/\{ key: "calendar", label: "Week"/.test(src), "there is no Week tab to reach the program from");
});

test("the Stop sheet offers two things: Pause and Finish", () => {
  // Isaiah, 28 Oct: two choices. Pausing the clock is on the timer strip;
  // closing the sheet is "keep going".
  const at = src.indexOf('title="Stop workout"');
  assert.ok(at > 0, "there is no Stop sheet");
  const sheet = src.slice(at, src.indexOf("</Modal>", at));
  assert.ok(/onClick=\{stopAndSave\}>Pause</.test(sheet), "Pause does not save the session for later");
  assert.ok(/onClick=\{stopAndLog\}/.test(sheet) && /"Finish"/.test(sheet), "Finish does not log the session");
  assert.equal((sheet.match(/<Btn /g) || []).length, 2, "the sheet has more than two choices again");
  assert.ok(/Nothing is logged yet/.test(sheet), "the sheet does not say that pausing logs nothing");
});

test("stopping and saving logs nothing and keeps everything", () => {
  const at = src.indexOf("const stopAndSave = () => {");
  assert.ok(at > 0, "stopAndSave is gone");
  const body = src.slice(at, src.indexOf("\n  };", at));
  assert.ok(/writePausedWorkout\(pauseSnapshot\(\), state\.me\.id\)/.test(body),
    "stopping does not store the session");
  assert.ok(/writeSessionTimer\(null\)/.test(body),
    "the stopwatch is left running, so it is still ticking tomorrow");
  assert.ok(/clearSessionDraft\(dayKey, state\.me\.id\)/.test(body),
    "the draft is left behind, so the same session can be restored two ways");
  assert.ok(!/finishWorkout\(/.test(body) && !/workout_logs/.test(body),
    "stopping and saving writes a session to the record");
});

test("the snapshot keeps the sets, the place and the clock", () => {
  const at = src.indexOf("const pauseSnapshot = () => {");
  assert.ok(at > 0, "pauseSnapshot is gone");
  const body = src.slice(at, src.indexOf("\n  };", at));
  for (const field of ["setChecks", "setWeights", "setReps", "handSet", "swappedMap"]) {
    assert.ok(new RegExp(`${field}: remapExerciseKeys\\(${field}, toStable\\)`).test(body),
      `${field} is not kept, or is kept under this launch's ids`);
  }
  assert.ok(/exIdx/.test(body), "where they were in the session is not kept");
  assert.ok(/seconds: timerIsLive \? liveTimerSeconds\(\) : 0/.test(body),
    "the time so far is not kept, or is read a second behind");
});

test("replacing another paused workout is said out loud", () => {
  // One per athlete. Silently overwriting an hour of someone's work because
  // they stopped a second session is not a thing to do quietly.
  const at = src.indexOf("const openStop = () => {");
  assert.ok(at > 0, "openStop is gone");
  const body = src.slice(at, src.indexOf("\n  };", at));
  assert.ok(/existing\.dayKey !== dayKey/.test(body),
    "a paused workout for THIS session would be reported as a replacement");
  assert.ok(/This replaces your paused/.test(src),
    "the sheet never warns that another paused workout is about to be replaced");
});

// ---------- the card on Today ----------

test("the card offers exactly the three answers from the spec", () => {
  const at = src.indexOf("Do you want to finish your {sessionLabel(pausedWorkout.dayName)} workout?");
  assert.ok(at > 0, "the paused card is not on the home screen");
  const card = src.slice(at - 600, at + 2200);
  for (const label of ["Yes, finish it", "No, save it as is", "Drop it"]) {
    assert.ok(card.includes(label), `the card is missing "${label}"`);
  }
});

test("dropping it asks twice", () => {
  const at = src.indexOf("Do you want to finish your {sessionLabel(pausedWorkout.dayName)} workout?");
  const card = src.slice(at - 600, at + 2200);
  assert.ok(/onClick=\{\(\) => setConfirmDrop\(true\)\}/.test(card),
    "Drop it deletes the session on the first tap");
  assert.ok(/onClick=\{dropPaused\}/.test(card), "there is no second step to confirm with");
  assert.ok(/Yes, drop it/.test(card), "the confirm step has no confirm button");
});

test("resuming hands the session to the ordinary draft rather than a second restore path", () => {
  const at = src.indexOf("const resumePaused = () => {");
  assert.ok(at > 0, "resumePaused is gone");
  const body = src.slice(at, src.indexOf("\n  };", at));
  assert.ok(/writeSessionDraft\(\{/.test(body), "resuming does not seed the draft");
  assert.ok(/dayId: pausedWorkout\.dayKey/.test(body), "the draft is seeded under the wrong key");
  assert.ok(/date: todayISO\(\)/.test(body),
    "the draft is seeded under the day it was paused, so today's restore will not find it");
  for (const field of ["setChecks", "setWeights", "setReps", "handSet", "swappedMap"]) {
    assert.ok(new RegExp(`${field}: pausedWorkout\\.${field}`).test(body), `${field} is not restored`);
  }
  assert.ok(/clearPausedWorkout\(state\.me\.id\)/.test(body),
    "it stays on the home screen asking to be finished while it is being finished");
});

test("the clock picks up where it stopped", () => {
  const at = src.indexOf("const resumePaused = () => {");
  const body = src.slice(at, src.indexOf("\n  };", at));
  assert.ok(/startedAt: Date\.now\(\) - seconds \* 1000/.test(body),
    "the timer restarts from zero, so a session that took an hour reports minutes");
  assert.ok(/if \(seconds > 0\)/.test(body),
    "a session that was never timed gets a stopwatch it did not ask for");
});

test("the card hides when the program no longer has that day", () => {
  // A coach replacing the program leaves a stored key that matches nothing.
  // Offering to resume a session that does not exist is a dead button.
  assert.ok(/\{pausedWorkout && pausedDay && \(/.test(src),
    "the card renders without checking the session still exists");
  assert.ok(/sessionIdentity\(myProgram, d\) === pausedWorkout\.dayKey/.test(src),
    "the stored key is never translated back to a day of the live program");
});

test("the workout clock lives in the header, not floating over the Stop button", () => {
  assert.ok(!/function SessionTimerBadge/.test(src), "the floating timer badge is back");
  assert.ok(/below=\{timerIsLive\s*\?\s*<SessionTimerStrip/.test(src), "the timer strip is not in the header");
  const at = src.indexOf("const resumeTimer = () => {");
  assert.ok(at > 0, "there is no way to resume the timer");
  const body = src.slice(at, src.indexOf("\n  };", at));
  assert.ok(/Date\.now\(\) - sofar \* 1000/.test(body), "resuming does not carry the time already on the clock");
  assert.ok(/mode: "running"/.test(body), "resuming is not remembered across a reload");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
