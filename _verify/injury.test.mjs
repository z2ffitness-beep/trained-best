// What the injury actually is, and a program build that failed in silence.
//
// "Knee" told a coach almost nothing. Patellar tendinopathy, a meniscus tear
// and arthritis are three different programs — one wants loading, one wants
// range limited, one wants the joint out of deep flexion — and the app asked
// only for the body part, so all three arrived as "knee" and the generator
// guessed.
//
// Separately: an athlete signed up self-guided, his program build failed, and
// the error was held only in the tab's memory. His retry vanished on reload,
// the coach never saw anything, and three days later the server logs had
// rolled over. Nobody could say what went wrong, including me.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "INJURY_KINDS", kind: "const" }, { name: "INJURY_STATUS", kind: "const" },
  { name: "DEFAULT_INJURY_STATUS", kind: "const" }, { name: "INJURY_AREAS", kind: "const" },
  "injuryDetailFor", "setInjuryDetail", "pruneInjuryDetail",
  { name: "injuryKindLabel", kind: "const" },
  // injuryLines now leads with the side, so its helpers have to come with it.
  { name: "INJURY_SIDES", kind: "const" }, { name: "INJURY_MIDLINE", kind: "const" },
  { name: "injuryNeedsSide", kind: "const" }, { name: "injurySideLabel", kind: "const" },
  "injuryLines", "injuriesDescribed",
  "programBuildFailure", "athleteNeedsProgram",
]);

const bodyOf = (fn) => {
  const at = src.indexOf(fn);
  assert.notEqual(at, -1, `${fn} not found`);
  return src.slice(at, src.indexOf("\nfunction ", at + 1));
};

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

const INTAKE = () => ({
  injuries: ["Knee", "Shoulder"],
  injuryDetail: {
    Knee: { kind: "tendon", status: "current", note: "right side, worse on stairs" },
    Shoulder: { kind: "impingement", status: "past" },
  },
});

// ---------- what reaches the generator ----------

test("each injury reads as area, kind and whether it's a problem now", () => {
  assert.equal(H.injuryLines(INTAKE()),
    'Knee — Tendon pain, bothering them now ("right side, worse on stairs"); Shoulder — Pinching or impingement, had it before, fine now');
});

test("no injuries reads as None, not an empty string", () => {
  assert.equal(H.injuryLines({ injuries: ["None currently"] }), "None");
  assert.equal(H.injuryLines({ injuries: [] }), "None");
  assert.equal(H.injuryLines({}), "None");
  assert.equal(H.injuryLines(null), "None");
});

test("an area with no detail still reaches the generator", () => {
  // Someone in a hurry taps the body part and moves on. That is still worth
  // knowing, and it must not vanish because they skipped the follow-up.
  assert.equal(H.injuryLines({ injuries: ["Low back"] }), "Low back, bothering them now");
});

test("an area with a kind but no note skips the quotes", () => {
  assert.equal(H.injuryLines({ injuries: ["Knee"], injuryDetail: { Knee: { kind: "joint" } } }),
    "Knee — Joint pain or arthritis, bothering them now");
});

test("a blank note is not rendered as empty quotes", () => {
  assert.equal(H.injuryLines({ injuries: ["Knee"], injuryDetail: { Knee: { kind: "joint", note: "   " } } }),
    "Knee — Joint pain or arthritis, bothering them now");
});

test("current and past read differently, because they program differently", () => {
  const cur = H.injuryLines({ injuries: ["Knee"], injuryDetail: { Knee: { status: "current" } } });
  const past = H.injuryLines({ injuries: ["Knee"], injuryDetail: { Knee: { status: "past" } } });
  assert.match(cur, /bothering them now/);
  assert.match(past, /had it before/);
  assert.notEqual(cur, past);
});

test("no status given is treated as current — the cautious reading", () => {
  assert.equal(H.DEFAULT_INJURY_STATUS, "current");
  assert.match(H.injuryLines({ injuries: ["Knee"] }), /bothering them now/);
});

test("'None currently' never appears alongside a real injury", () => {
  assert.equal(H.injuryLines({ injuries: ["None currently", "Knee"] }),
    "Knee, bothering them now");
});

// ---------- the detail store ----------

test("detail is kept per area, beside the plain list rather than replacing it", () => {
  // The `injuries` array is a database column the coach's screens already
  // read. Changing its shape would break them for every existing account.
  const i = INTAKE();
  assert.deepEqual(i.injuries, ["Knee", "Shoulder"], "still a plain list of areas");
  assert.equal(H.injuryDetailFor(i, "Knee").kind, "tendon");
  assert.equal(H.injuryDetailFor(i, "Elbow / Wrist"), null);
  assert.equal(H.injuryDetailFor(null, "Knee"), null);
});

test("setting one field leaves the others alone", () => {
  const next = H.setInjuryDetail(INTAKE(), "Knee", { status: "past" });
  assert.equal(next.Knee.status, "past");
  assert.equal(next.Knee.kind, "tendon", "the kind must survive a status change");
  assert.equal(next.Knee.note, "right side, worse on stairs");
  assert.equal(next.Shoulder.kind, "impingement", "and the other injury untouched");
});

test("setting detail on an area that had none creates it", () => {
  const next = H.setInjuryDetail({ injuries: ["Neck"] }, "Neck", { kind: "nerve" });
  assert.equal(next.Neck.kind, "nerve");
});

test("deselecting an area drops its detail", () => {
  // Otherwise it keeps reaching the generator after they change their mind.
  const pruned = H.pruneInjuryDetail(INTAKE().injuryDetail, ["Shoulder"]);
  assert.deepEqual(Object.keys(pruned), ["Shoulder"]);
});

test("choosing 'None currently' drops everything", () => {
  assert.deepEqual(H.pruneInjuryDetail(INTAKE().injuryDetail, ["None currently"]), {});
  assert.deepEqual(H.pruneInjuryDetail(INTAKE().injuryDetail, []), {});
  assert.deepEqual(H.pruneInjuryDetail(null, ["Knee"]), {});
});

test("every area the step offers can carry detail", () => {
  H.INJURY_AREAS.filter(a => a !== "None currently").forEach(area => {
    const d = H.setInjuryDetail({}, area, { kind: "tendon" });
    assert.equal(H.injuryDetailFor({ injuryDetail: d }, area).kind, "tendon", area);
    assert.match(H.injuryLines({ injuries: [area], injuryDetail: d }), new RegExp("Tendon pain"));
  });
});

test("every kind has a label the generator can read back", () => {
  H.INJURY_KINDS.forEach(k => {
    assert.ok(k.key && k.label && k.hint, JSON.stringify(k));
    assert.equal(H.injuryKindLabel(k.key), k.label);
  });
  assert.equal(H.injuryKindLabel("nonsense"), null);
  assert.equal(H.injuryKindLabel(undefined), null);
});

test("there is an answer for someone who does not know what it is", () => {
  assert.ok(H.INJURY_KINDS.some(k => k.key === "unsure"),
    "most people know it hurts and not what it is called");
});

test("the nudge fires only when something is undescribed", () => {
  assert.equal(H.injuriesDescribed(INTAKE()), true);
  assert.equal(H.injuriesDescribed({ injuries: ["Knee"] }), false);
  assert.equal(H.injuriesDescribed({ injuries: ["None currently"] }), true, "nothing to describe");
  assert.equal(H.injuriesDescribed({}), true);
});

// ---------- the prompt ----------

test("the generator is told what each injury is, not just where", () => {
  const body = bodyOf("function buildAIPrompt(");
  assert.ok(/- Injuries: \$\{injuryLines\(intake\)\}/.test(body));
  assert.ok(/Treat "bothering them now" as a CURRENT injury/.test(body),
    "the prompt already treats current and previous differently — it needed the input");
  assert.ok(/Tendon pain wants controlled loading, not avoidance/.test(body),
    "the kind changes the programming, so say how");
  assert.ok(/Nerve pain wants nothing that reproduces the symptoms/.test(body));
});

test("the coach sees what it is on the roster and the client page", () => {
  const uses = (src.match(/injuryLines\((athlete|m)\.intake\)/g) || []).length;
  assert.equal(uses, 4, "both screens, each testing and then rendering");
  assert.ok(/injuryLines\(athlete\.intake\) !== "None" \? injuryLines\(athlete\.intake\) : athlete\.injuries\.join/.test(src),
    "an account with no detail must still show its plain area list");
});

// ---------- the build that failed in silence ----------

test("a stored failure outlives the session that caused it", () => {
  const stored = { me: { intake: { programBuildFailed: { at: "2026-09-26T15:44:00Z", message: "The AI is rate limited right now." } } } };
  assert.equal(H.programBuildFailure(stored).message, "The AI is rate limited right now.");
  assert.equal(H.programBuildFailure(stored).at, "2026-09-26T15:44:00Z");
});

test("this session's own error still works before anything is written", () => {
  assert.equal(H.programBuildFailure({ programGenerationError: "Timed out." }).message, "Timed out.");
});

test("the stored note wins, because it is the one with a timestamp", () => {
  const both = { me: { intake: { programBuildFailed: { message: "stored", at: "x" } } }, programGenerationError: "memory" };
  assert.equal(H.programBuildFailure(both).message, "stored");
});

test("no failure reads as no failure", () => {
  assert.equal(H.programBuildFailure({}), null);
  assert.equal(H.programBuildFailure(null), null);
  assert.equal(H.programBuildFailure({ me: { intake: {} } }), null);
  assert.equal(H.programBuildFailure({ me: { intake: { programBuildFailed: {} } } }), null,
    "an empty note is not a failure");
});

test("the roster tells a failed build apart from one not started", () => {
  assert.equal(H.athleteNeedsProgram({ program: "p1" }), null, "has one");
  assert.equal(H.athleteNeedsProgram({ program: null, intake: {} }), "none");
  assert.equal(H.athleteNeedsProgram({ program: null, intake: { programBuildFailed: { message: "boom" } } }), "failed");
  assert.equal(H.athleteNeedsProgram(null), null);
});

test("the failure is written to the profile, not just to memory", () => {
  assert.ok(/await recordProgramFailure\(userId, message\)/.test(src),
    "in memory it lasted exactly as long as the tab");
  const body = bodyOf("async function recordProgramFailure(");
  assert.ok(/set_profile_setting/.test(body), "through the single-key RPC, like every other setting");
  assert.ok(/"programBuildFailed"/.test(body));
  assert.ok(/\.slice\(0, 300\)/.test(body), "an error message is not unbounded");
  assert.ok(/catch \{/.test(body), "the failure notice failing must not raise a second error");
});

test("a successful build clears an older failure", () => {
  assert.ok(/await clearProgramFailure\(userId\)/.test(src),
    "otherwise the athlete keeps seeing an error over a program that exists");
  const at = src.indexOf("await clearProgramFailure(userId)");
  const before = src.slice(at - 400, at);
  assert.ok(/applyGeneratedProgram/.test(before), "and only after the program is actually applied");
});

test("the retry screen reads the stored note", () => {
  const body = bodyOf("function AthleteProgram(");
  assert.ok(/\{programBuildFailure\(state\) \? \(/.test(body));
  assert.ok(/programBuildFailure\(state\)\.message/.test(body));
  assert.ok(!/\{state\.programGenerationError \? \(/.test(body),
    "reading state alone is what made the retry vanish on reload");
});

test("the coach's roster shows a failed build", () => {
  const body = bodyOf("function CoachAthletes(");
  assert.ok(/athleteNeedsProgram\(a\) === "failed"/.test(body));
  assert.ok(/Build failed/.test(body),
    "an athlete with no program looked the same whether it failed or was never started");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
