// Training offline: the storage layer, the retry queue and the rules about
// what is worth retrying. A session that reaches this code has already been
// trained - losing it here is the one failure the athlete cannot undo.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

// A localStorage good enough to test against, plus the ability to make it
// fail the way a real one does in private mode or at quota.
class FakeStorage {
  constructor() { this.map = new Map(); this.failWrites = false; this.failReads = false; }
  getItem(k) { if (this.failReads) throw new Error("blocked"); return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { if (this.failWrites) throw new Error("QuotaExceededError"); this.map.set(k, String(v)); }
  removeItem(k) { if (this.failWrites) throw new Error("blocked"); this.map.delete(k); }
}
const store = new FakeStorage();
globalThis.localStorage = store;
// Node 22 exposes a real `navigator` with only a getter, so it is redefined
// rather than assigned.
const fakeNavigator = { onLine: true };
Object.defineProperty(globalThis, "navigator", { value: fakeNavigator, configurable: true, writable: true });

const H = await load(APP, [
  "storageGet", "storageSet", "clientId", "isTransientError",
  "readAllDrafts", "draftKey", "readSessionDraft", "writeSessionDraft",
  "clearSessionDraft", "draftHasContent",
  "readPendingLogs", "queuePendingLog", "dropPendingLog", "pendingLogsFor",
  "markPendingLogBlocked", "pendingLogCount", "blockedLogCount",
  { name: "SESSION_DRAFT_KEY", kind: "const" },
  { name: "SESSION_DRAFT_MAX_AGE_MS", kind: "const" },
  { name: "PENDING_LOGS_KEY", kind: "const" },
  { name: "MAX_PENDING_LOGS", kind: "const" },
  { name: "PERMANENT_ERROR_CODES", kind: "const" },
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const reset = () => { store.map.clear(); store.failWrites = false; store.failReads = false; fakeNavigator.onLine = true; };

const rowFor = (id, user = "u1") => ({
  row: { id, user_id: user, date: "2025-09-08", program_day: "Day 1", exercises: [] },
  meta: { dayName: "Day 1", date: "2025-09-08" },
});

// ---------- storage that is allowed to fail ----------

test("blocked storage never throws, it just says no", () => {
  reset();
  store.failWrites = true;
  assert.equal(H.storageSet("k", { a: 1 }), false);
  store.failReads = true;
  assert.equal(H.storageGet("k"), null);
});

test("a value we didn't write is ignored rather than crashing", () => {
  reset();
  store.map.set("k", "not json{");
  assert.equal(H.storageGet("k"), null);
});

// ---------- ids ----------

test("clientId produces distinct uuid-shaped ids", () => {
  const a = H.clientId(), b = H.clientId();
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f-]{36}$/i);
});

// ---------- what is worth retrying ----------

test("a network failure is transient", () => {
  reset();
  assert.equal(H.isTransientError(new TypeError("Failed to fetch")), true);
  assert.equal(H.isTransientError({ message: "Load failed" }), true);
  assert.equal(H.isTransientError({ message: "network timeout" }), true);
});

test("a fault in the DATA is permanent", () => {
  reset();
  // These will fail identically tomorrow, so retrying forever helps nobody.
  assert.equal(H.isTransientError({ code: "23502", message: "null value violates not-null" }), false);
  assert.equal(H.isTransientError({ code: "42501", message: "row-level security" }), false);
  assert.equal(H.isTransientError({ code: "23514", message: "check violation" }), false);
});

test("a fault in the CONNECTION is retried even though it carries a code", () => {
  // The bug this replaces: every PostgREST answer has a code, so an expired
  // token counted as permanent - and a queued session was deleted unsent and
  // reported to the athlete as saved.
  reset();
  assert.equal(H.isTransientError({ code: "PGRST301", message: "JWT expired" }), true);
  assert.equal(H.isTransientError({ code: "503", message: "service unavailable" }), true);
});

test("an unrecognised failure is retried rather than discarded", () => {
  reset();
  // A captive portal answering with HTML produces a parse error that mentions
  // neither "fetch" nor "network".
  assert.equal(H.isTransientError(new SyntaxError("Unexpected token '<'")), true);
  assert.equal(H.isTransientError({ message: "something nobody predicted" }), true);
});

test("a known-offline device treats anything as transient", () => {
  reset();
  fakeNavigator.onLine = false;
  assert.equal(H.isTransientError({ code: "23502", message: "whatever" }), true);
});

test("no error is not an error", () => {
  reset();
  assert.equal(H.isTransientError(null), false);
});

// ---------- the in-progress draft ----------

test("a draft comes back for its own session and nobody else's", () => {
  reset();
  H.writeSessionDraft({ dayId: "d1", date: "2025-09-08", setChecks: { a: [0] } }, "u1");
  assert.ok(H.readSessionDraft("d1", "2025-09-08", "u1"));
  assert.equal(H.readSessionDraft("d2", "2025-09-08", "u1"), null);
  // A shared phone: one athlete's sets must not restore into another's
  // session, and day ids come from shared program templates so they collide.
  assert.equal(H.readSessionDraft("d1", "2025-09-08", "u2"), null);
});

test("two sessions can hold drafts at once", () => {
  // Stepping over to Day 2 to see what is coming used to overwrite the Day 1
  // draft you were six sets into.
  reset();
  H.writeSessionDraft({ dayId: "d1", setChecks: { a: [0, 1] } }, "u1");
  H.writeSessionDraft({ dayId: "d2", setChecks: { b: [0] } }, "u1");
  assert.deepEqual(H.readSessionDraft("d1", null, "u1").setChecks, { a: [0, 1] });
  assert.deepEqual(H.readSessionDraft("d2", null, "u1").setChecks, { b: [0] });
});

test("a draft survives midnight but not a fortnight", () => {
  // An evening lifter whose phone kills the tab at 00:05 must not lose the
  // session; a draft from last month must not resurface.
  reset();
  H.writeSessionDraft({ dayId: "d1", setChecks: { a: [0] } }, "u1");
  const all = H.readAllDrafts();
  const key = H.draftKey("d1", "u1");
  all[key] = { ...all[key], savedAt: Date.now() - 3 * 3600 * 1000 };
  store.map.set(H.SESSION_DRAFT_KEY, JSON.stringify(all));
  assert.ok(H.readSessionDraft("d1", null, "u1"), "three hours old is still live");

  all[key] = { ...all[key], savedAt: Date.now() - (H.SESSION_DRAFT_MAX_AGE_MS + 1000) };
  store.map.set(H.SESSION_DRAFT_KEY, JSON.stringify(all));
  assert.equal(H.readSessionDraft("d1", null, "u1"), null, "too old to be this session");
});

test("draftHasContent refuses to save a blank session over a real one", () => {
  reset();
  assert.equal(H.draftHasContent(null), false);
  assert.equal(H.draftHasContent({ setChecks: {}, setWeights: {}, setReps: {}, swappedMap: {}, notes: "" }), false);
  assert.equal(H.draftHasContent({ setChecks: { a: [] }, setWeights: { a: ["", null] }, notes: "   " }), false);
  assert.equal(H.draftHasContent({ setChecks: { a: [0] } }), true);
  assert.equal(H.draftHasContent({ setWeights: { a: ["135"] } }), true);
  assert.equal(H.draftHasContent({ setReps: { a: ["8"] } }), true);
  assert.equal(H.draftHasContent({ swappedMap: { a: "ex2" } }), true);
  assert.equal(H.draftHasContent({ notes: "left knee felt off" }), true);
});

test("clearing one session's draft leaves the others", () => {
  reset();
  H.writeSessionDraft({ dayId: "d1", setChecks: { a: [0] } }, "u1");
  H.writeSessionDraft({ dayId: "d2", setChecks: { b: [0] } }, "u1");
  H.clearSessionDraft("d1", "u1");
  assert.equal(H.readSessionDraft("d1", null, "u1"), null);
  assert.ok(H.readSessionDraft("d2", null, "u1"));
});

// ---------- the queue ----------

test("queued sessions come back out", () => {
  reset();
  assert.equal(H.queuePendingLog(rowFor("a")), true);
  H.queuePendingLog(rowFor("b"));
  assert.deepEqual(H.readPendingLogs().map(e => e.row.id), ["a", "b"]);
  assert.equal(H.pendingLogCount("u1"), 2);
});

test("re-queueing the same session replaces it rather than duplicating", () => {
  reset();
  H.queuePendingLog(rowFor("a"));
  H.queuePendingLog(rowFor("a"));
  assert.equal(H.readPendingLogs().length, 1);
});

test("the queue is bounded so it can never blow the storage quota", () => {
  reset();
  for (let i = 0; i < H.MAX_PENDING_LOGS + 5; i++) H.queuePendingLog(rowFor("id" + i));
  const list = H.readPendingLogs();
  assert.equal(list.length, H.MAX_PENDING_LOGS);
  // The oldest go, not the newest: the most recent training is the most
  // likely to still matter.
  assert.equal(list[list.length - 1].row.id, "id" + (H.MAX_PENDING_LOGS + 4));
});

test("dropping one leaves the rest", () => {
  reset();
  H.queuePendingLog(rowFor("a"));
  H.queuePendingLog(rowFor("b"));
  H.dropPendingLog("a");
  assert.deepEqual(H.readPendingLogs().map(e => e.row.id), ["b"]);
});

test("the count is per athlete on a shared device", () => {
  reset();
  H.queuePendingLog(rowFor("a", "u1"));
  H.queuePendingLog(rowFor("b", "u2"));
  assert.equal(H.pendingLogCount("u1"), 1);
  assert.equal(H.pendingLogCount("u2"), 1);
  assert.deepEqual(H.pendingLogsFor("u1").map(e => e.row.id), ["a"]);
});

test("nobody signed in means nothing of theirs is waiting", () => {
  // Not "everything on this device". A second athlete opening the app was
  // told three of somebody else's sessions were syncing for them.
  reset();
  H.queuePendingLog(rowFor("a", "u1"));
  assert.equal(H.pendingLogCount(null), 0);
  assert.equal(H.pendingLogCount(undefined), 0);
  assert.deepEqual(H.pendingLogsFor(null), []);
});

test("a session the server will never accept is set aside, not deleted", () => {
  // It is still the only copy of an hour of training. It stops being retried
  // and stops being counted as pending, and it is still there.
  reset();
  H.queuePendingLog(rowFor("a", "u1"));
  H.queuePendingLog(rowFor("b", "u1"));
  H.markPendingLogBlocked("a");
  assert.equal(H.readPendingLogs().length, 2);
  assert.equal(H.pendingLogCount("u1"), 1);
  assert.equal(H.blockedLogCount("u1"), 1);
});

test("a corrupted queue reads as empty rather than crashing the app", () => {
  reset();
  store.map.set(H.PENDING_LOGS_KEY, JSON.stringify([null, { row: null }, { nope: 1 }, rowFor("ok")]));
  assert.deepEqual(H.readPendingLogs().map(e => e.row.id), ["ok"]);
});

test("a full disk fails the queue honestly instead of pretending", () => {
  reset();
  store.failWrites = true;
  // The caller shows a real error rather than telling the athlete their
  // session is safe when nothing was written.
  assert.equal(H.queuePendingLog(rowFor("a")), false);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) {
    console.error(`✖ ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
