// Launch readiness, step 1 (Isaiah, 11 Nov): terms and waiver accepted at
// signup and once by everyone already signed up, a Health Check card for
// clients who never did it, Report a problem, and joining a coach through
// the database instead of a direct write.
import assert from "node:assert/strict";
import fs from "node:fs";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const APP = path.join(root, "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "toLocalISO", kind: "const" }, { name: "todayISO", kind: "const" },
  { name: "AGE_MIN", kind: "const" }, { name: "AGE_MAX", kind: "const" },
  "parseDateParts", "ageFromBirthday", "isUsableBirthday",
  { name: "EMAIL_RE", kind: "const" }, { name: "looksLikeEmail", kind: "const" },
  "accountStepProblems", "accountStepValid", "emailTaken",
  { name: "NO_SPORT_PROFILE", kind: "const" }, { name: "SPORT_SEASONS", kind: "const" }, { name: "SPORTS", kind: "const" },
  "isCombatFocus", "focusTypeOf", "focusComplete", "sportProfileApplies", "sportProgramOn",
  { name: "INJURY_MIDLINE", kind: "const" }, { name: "injuryNeedsSide", kind: "const" },
  "injuryDetailFor", "injurySidesMissing", "injurySidesAnswered",
  { name: "SPLIT_STYLES", kind: "const" }, { name: "DEFAULT_SPLIT", kind: "const" },
  "deriveSplit", "withDerivedSplit", { name: "SPLIT_AUTO", kind: "const" },
  { name: "SIGNUP_KEYS", kind: "const" }, { name: "SIGNUP_V2_STEPS", kind: "const" },
  { name: "SIGNUP_V2_SECTIONS", kind: "const" }, { name: "SIGNUP_V2", kind: "const" },
  "stepComplete", "parqAnswered", "parqFlags", "movementAnswered",
  { name: "PARQ_QUESTIONS", kind: "const" }, { name: "MOVE_CHECKS", kind: "const" }, { name: "MOVE_RESULTS", kind: "const" },
  { name: "PRIVACY_CONTACT", kind: "const" }, { name: "PRIVACY_POLICY", kind: "const" },
  { name: "LEGAL_VERSION", kind: "const" }, { name: "TERMS_OF_USE", kind: "const" }, { name: "WAIVER", kind: "const" },
  { name: "LEGAL_DOCS", kind: "const" }, "agreedToTerms", "agreementRecord",
  { name: "HEALTH_CHECK_PARTS", kind: "const" }, "healthCheckMissing", "problemReportMailto",
]);
let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);

const fullHealth = {
  parq: Object.fromEntries(H.PARQ_QUESTIONS.map(q => [q.key, false])),
  move: Object.fromEntries(H.MOVE_CHECKS.map(m => [m.key, "easy"])),
  recentDaysPerWeek: "3", lastConsistent: "now", otherTraining: "0", sleep: "7-8",
};

// ---------- terms and waiver ----------
test("three documents, each with words in it", () => {
  assert.deepEqual(Object.keys(H.LEGAL_DOCS), ["privacy", "terms", "waiver"]);
  for (const [k, d] of Object.entries(H.LEGAL_DOCS)) {
    assert.ok(d.sections.length >= 3, `${k} is nearly empty`);
    for (const s of d.sections) assert.ok((s.paragraphs || []).length + (s.bullets || []).length > 0, `${k}: "${s.heading}" is empty`);
  }
});
test("no em dashes in anything a client reads", () => {
  for (const [k, d] of Object.entries(H.LEGAL_DOCS)) {
    const text = JSON.stringify(d.sections);
    assert.ok(!text.includes("—"), `${k} has an em dash`);
  }
});
test("the waiver says plainly that it covers negligence and needs a parent under 18", () => {
  const w = JSON.stringify(H.WAIVER);
  assert.match(w, /NEGLIGENCE/);
  assert.match(w, /under 18/);
  assert.match(JSON.stringify(H.TERMS_OF_USE), /Ontario/);
});
test("accepted means accepted THIS version", () => {
  assert.equal(H.agreedToTerms({}), false);
  assert.equal(H.agreedToTerms(null), false);
  assert.equal(H.agreedToTerms({ agreed: { version: "2020-01-01" } }), false, "an old version asks again");
  const rec = H.agreementRecord();
  assert.equal(rec.version, H.LEGAL_VERSION);
  assert.ok(!Number.isNaN(Date.parse(rec.at)));
  assert.equal(H.agreedToTerms({ agreed: rec }), true);
});
test("signup's last screen cannot finish without the tick", () => {
  assert.ok(/const canProceed = stepComplete\(stepName, data, role\) && \(!isLast \|\| agreedToTerms\(data\)\);/.test(src));
  assert.ok(/\{isLast && \(\s*<div className="mb-3">\s*<AgreementRow/.test(src));
});
test("everyone already signed up is asked once, and nothing else shows until they accept", () => {
  assert.ok(/setLegalAgreed\(agreedToTerms\(profile\.intake\)\);/.test(src));
  assert.ok(/\{authed && !legalAgreed && <TermsGate/.test(src));
  assert.ok(/rpc\("set_profile_setting", \{ p_key: "agreed", p_value: agreementRecord\(\) \}\)/.test(src));
});
test("the public pages exist and match the app", () => {
  for (const [file, d] of [["terms.html", H.TERMS_OF_USE], ["waiver.html", H.WAIVER], ["privacy.html", H.PRIVACY_POLICY]]) {
    const html = fs.readFileSync(path.join(root, "public", file), "utf8");
    for (const s of d) assert.ok(html.includes(s.heading.replace(/&/g, "&amp;")), `${file} is missing "${s.heading}": run node _verify/build-privacy.mjs`);
  }
});
test("Profile links to all three, on both sides", () => {
  assert.equal((src.match(/<ProfileFooterLinks nav=\{nav\}/g) || []).length, 2);
  assert.ok(/"terms": <LegalDocPage docKey="terms"/.test(src));
  assert.ok(/"waiver": <LegalDocPage docKey="waiver"/.test(src));
});
test("the privacy policy now names the Health Check, photos, voice and push", () => {
  const p = JSON.stringify(H.PRIVACY_POLICY);
  for (const w of ["Health Check", "form check videos", "speech service", "push service"]) assert.ok(p.includes(w), w);
});

// ---------- Health Check card ----------
test("nothing answered: all five parts are asked", () => {
  assert.equal(H.healthCheckMissing({}).length, 5);
  assert.equal(H.healthCheckMissing(undefined).length, 5);
});
test("everything answered: no card", () => {
  assert.equal(H.healthCheckMissing(fullHealth).length, 0);
});
test("only what is missing is asked", () => {
  const { sleep, move, ...rest } = fullHealth;
  assert.deepEqual(H.healthCheckMissing(rest).map(p => p.step), ["🧍 Movement Check", "🌙 Sleep"]);
});
test("a yes on a health question still needs the doctor answer", () => {
  const yes = { ...fullHealth, parq: { ...fullHealth.parq, [H.PARQ_QUESTIONS[0].key]: true } };
  assert.deepEqual(H.healthCheckMissing(yes).map(p => p.step), ["❤️ Health Questions"]);
  assert.equal(H.healthCheckMissing({ ...yes, parqCleared: false }).length, 0);
});
test("the card is on Home for clients, not for a coach's own training", () => {
  assert.ok(/\{!isCoach && <HealthCheckCard state=\{state\} setState=\{setState\} \/>\}/.test(src));
});

// ---------- Report a problem ----------
test("the report email goes to the support address with the details", () => {
  const url = H.problemReportMailto({ text: "Done button & nothing", role: "solo athlete", screen: "Profile" });
  assert.ok(url.startsWith(`mailto:${H.PRIVACY_CONTACT.email}?subject=`));
  const body = decodeURIComponent(url.split("&body=")[1]);
  assert.match(body, /^Done button & nothing/);
  assert.match(body, /Account type: solo athlete/);
  assert.match(body, /Screen: Profile/);
});

// ---------- joining a coach ----------
test("joining a coach goes through join_coach_by_code, never a direct coach_id write", () => {
  assert.ok(/rpc\("join_coach_by_code", \{ p_code: clean \}\)/.test(src));
  assert.equal((src.match(/joinCoachByCode\(/g) || []).length, 4, "the helper plus its three callers");
  assert.ok(!/update\(\{ coach_id: coach\.id/.test(src));
  assert.ok(!/update\(\{ coach_id: coachId \}\)/.test(src));
});
test("the migrations change no columns and delete no data", () => {
  for (const f of ["018_launch_lockdown.sql", "019_lock_profile_links.sql"]) {
    const sql = fs.readFileSync(path.join(root, "supabase", "migrations", f), "utf8").replace(/--.*$/gm, "");
    assert.ok(!/\bdrop\s+(table|column)\b/i.test(sql), `${f} drops something`);
    assert.ok(!/\balter\s+table\b/i.test(sql), `${f} alters a table`);
    assert.ok(!/\bdelete\s+from\b|\btruncate\b/i.test(sql), `${f} deletes data`);
  }
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
