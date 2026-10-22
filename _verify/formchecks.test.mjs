// Form checks: the client-side rules about what may be uploaded and how a
// clip is addressed. The access rules themselves live in the database and are
// tested there against the live schema; this covers the half that runs on the
// phone.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

const H = await load(APP, [
  "formCheckError",
  { name: "mapFormCheck", kind: "const" },
  { name: "FORM_CHECK_BUCKET", kind: "const" },
  { name: "FORM_CHECK_MAX_BYTES", kind: "const" },
  { name: "FORM_CHECK_TYPES", kind: "const" },
  { name: "FORM_CHECK_URL_TTL", kind: "const" },
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const file = (over = {}) => ({ name: "set.mp4", size: 8 * 1048576, type: "video/mp4", ...over });

test("a normal phone clip is accepted", () => {
  assert.equal(H.formCheckError(file()), null);
  assert.equal(H.formCheckError(file({ type: "video/quicktime", name: "IMG_0042.MOV" })), null);
});

test("nothing chosen is refused before anything uploads", () => {
  assert.match(H.formCheckError(null), /video/i);
});

test("an oversized clip is refused with its actual size", () => {
  // Refused here rather than by the bucket, so the athlete finds out before
  // spending a minute uploading on gym wifi.
  const problem = H.formCheckError(file({ size: H.FORM_CHECK_MAX_BYTES + 1 }));
  assert.match(problem, /101MB/);
  assert.match(problem, /100MB/);
});

test("a clip exactly at the limit is allowed", () => {
  assert.equal(H.formCheckError(file({ size: H.FORM_CHECK_MAX_BYTES })), null);
});

test("something that is not a video is refused", () => {
  assert.match(H.formCheckError(file({ type: "application/pdf", name: "plan.pdf" })), /video/i);
  assert.match(H.formCheckError(file({ type: "image/jpeg", name: "squat.jpg" })), /video/i);
});

test("a missing type is allowed through for the bucket to judge", () => {
  // Some Android browsers hand over an empty type for a freshly recorded file.
  // Refusing those would break recording on exactly the devices most likely
  // to be used in a gym.
  assert.equal(H.formCheckError(file({ type: "" })), null);
  assert.equal(H.formCheckError(file({ type: undefined })), null);
});

test("the signed-url window is short but long enough to watch a clip", () => {
  assert.ok(H.FORM_CHECK_URL_TTL >= 300, "too short to watch");
  assert.ok(H.FORM_CHECK_URL_TTL <= 24 * 3600, "a copied link should not last a day");
});

test("the bucket is the one the storage policies name", () => {
  // The policies are written against this literal; a rename here without a
  // migration silently breaks every upload.
  assert.equal(H.FORM_CHECK_BUCKET, "form-checks");
});

test("a row maps into the shape the screen reads", () => {
  const row = H.mapFormCheck({
    id: "1", athlete_id: "a", coach_id: "c", exercise_name: "Back Squat",
    program_day: "Day 1 - Lower", storage_path: "a/x.mp4", note: "knees",
    status: "reviewed", coach_reply: "push out", reviewed_at: "2025-09-08T10:00:00Z",
    created_at: "2025-09-08T09:00:00Z",
  });
  assert.equal(row.athleteId, "a");
  assert.equal(row.coachId, "c");
  assert.equal(row.exerciseName, "Back Squat");
  assert.equal(row.storagePath, "a/x.mp4");
  assert.equal(row.coachReply, "push out");
  assert.equal(row.status, "reviewed");
});

// ---------- forgot password must never fail silently ----------
//
// Reported as "I tap it and nothing happens". The taps were reaching Supabase:
// six /auth/v1/recover calls, every one a 500, because the mail provider is in
// test mode and refuses every recipient but the account owner. The screen said
// nothing because the handler had no try/catch and the failure was a rejection.

const { errText } = await load(APP, ["errText"]);
const src = readSource(APP);
const loginSrc = (() => {
  const at = src.indexOf("function LoginScreen(");
  return src.slice(at, src.indexOf("\nfunction ", at + 1));
})();

test("a rejected send is caught and shown", () => {
  const fn = loginSrc.slice(loginSrc.indexOf("const forgotPassword"), loginSrc.indexOf("return ("));
  assert.ok(/try \{/.test(fn) && /catch \(err\)/.test(fn),
    "no catch means a thrown error is swallowed and the button looks dead");
  assert.ok(/setError\(errText\(err\)\)/.test(fn));
});

test("a returned error is shown too, not just a thrown one", () => {
  const fn = loginSrc.slice(loginSrc.indexOf("const forgotPassword"), loginSrc.indexOf("return ("));
  assert.ok(/if \(error\) setError\(errText\(error\)\)/.test(fn),
    "a 500 from the mail provider comes back as `error`, not as a rejection");
});

test("the button reports that it is working and cannot be double-tapped", () => {
  const fn = loginSrc.slice(loginSrc.indexOf("const forgotPassword"), loginSrc.indexOf("return ("));
  assert.ok(/if \(sendingReset\) return;/.test(fn));
  assert.ok(/finally \{\s*setSendingReset\(false\);/.test(fn),
    "without a finally, one failure leaves the button stuck on Sending");
  assert.ok(/sendingReset \? "Sending…" : "Forgot password\?"/.test(loginSrc));
});

test("a stale success message is cleared before retrying", () => {
  const fn = loginSrc.slice(loginSrc.indexOf("const forgotPassword"), loginSrc.indexOf("return ("));
  const clearAt = fn.indexOf("setResetSent(false)");
  const sendAt = fn.indexOf("resetPasswordForEmail");
  // indexOf returns -1 when it is missing, and -1 is less than anything, so the
  // ordering check alone passes when the line is deleted entirely.
  assert.notEqual(clearAt, -1, "the previous 'email sent' is never cleared");
  assert.ok(clearAt < sendAt,
    "otherwise a failed second attempt still shows 'email sent' from the first");
});

test("errText turns every error shape into something readable", () => {
  assert.equal(errText("plain"), "plain");
  assert.equal(errText({ message: "boom" }), "boom");
  assert.equal(errText({ error_description: "desc" }), "desc");
  assert.equal(errText(null), "Something went wrong. Please try again.");
  assert.match(errText({}), /Unknown error/, "an empty object must never reach the screen as {}");
});

test("errText is defined once, at module level", () => {
  assert.equal((src.match(/const errText = \(e\) =>/g) || []).length, 0,
    "the component-scoped copy is gone");
  assert.equal((src.match(/function errText\(e\)/g) || []).length, 1);
  assert.ok(src.indexOf("function errText(e)") < src.indexOf("function LoginScreen("),
    "it has to be in scope for the login screen, which is where the silent failure was");
});

// ---------- changing a password without an email ----------
//
// The only password screen used to be the one a reset EMAIL lands on. With the
// sending domain unverified no mail arrives, so there was no way to change a
// password at all - not for someone who forgot it, and not even for someone who
// knew it and simply wanted a different one.

const cpw = (() => {
  const at = src.indexOf("function ChangePasswordCard(");
  return src.slice(at, src.indexOf("\nfunction ", at + 1));
})();

test("the card exists and is on both profiles", () => {
  assert.ok(cpw.length > 0, "no ChangePasswordCard");
  assert.equal((src.match(/<ChangePasswordCard \/>/g) || []).length, 2,
    "a coach needs this as much as an athlete does");
});

test("it proves the current password before changing it", () => {
  assert.ok(/signInWithPassword\(\{ email, password: current \}\)/.test(cpw),
    "Supabase lets any live session set a new password without the old one - "
    + "on a borrowed unlocked phone that is an account takeover");
  assert.ok(cpw.indexOf("signInWithPassword") < cpw.indexOf("updateUser"),
    "the check has to come first or it proves nothing");
});

test("a failed re-auth stops before the change", () => {
  assert.ok(/if \(authErr\) \{ setError\("That current password isn't right\."\); setBusy\(false\); return; \}/.test(cpw));
});

test("the email comes from the session, not from app state", () => {
  assert.ok(/supabase\.auth\.getUser\(\)/.test(cpw),
    "state can be stale after a profile edit; the session cannot");
  assert.ok(!/state\.me\.email/.test(cpw));
});

test("it needs no email to be sent anywhere", () => {
  assert.ok(!/resetPasswordForEmail/.test(cpw),
    "the whole point is that this works while the mail provider does not");
});

test("the new password is checked before anything is sent", () => {
  const save = cpw.slice(cpw.indexOf("const save ="), cpw.indexOf("return ("));
  assert.ok(save.indexOf("Use at least 8 characters") < save.indexOf("getUser"));
  assert.ok(/if \(next !== confirm\)/.test(save), "a typo would lock them out");
  assert.ok(/if \(next === current\)/.test(save), "silently 'changing' to the same password is a lie");
});

test("it can't be double-submitted and always releases the button", () => {
  const save = cpw.slice(cpw.indexOf("const save ="), cpw.indexOf("return ("));
  assert.ok(/if \(busy\) return;/.test(save));
  assert.ok(/finally \{\s*setBusy\(false\);/.test(save));
});

test("the fields are cleared once it succeeds", () => {
  assert.ok(/reset\(\);\s*\n\s*setDone\(true\);/.test(cpw),
    "leaving a password sitting in a form field on a shared phone is careless");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) {
    console.error(`✖ ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
