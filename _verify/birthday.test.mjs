// Birthday in, age out.
//
// The coach asked for age on a client's profile and, correctly, for a birthday
// in signup rather than an age. An age typed once is wrong a year later and
// nothing in the stored value says so. So the date is the only thing persisted
// and the age is recomputed on every render.
//
// The arithmetic is string-based on purpose. The workout logs already had a
// timezone bug from building Dates and comparing them; a birthday parsed as UTC
// midnight is the previous evening in Niagara, which would show a client a year
// young on the morning of their own birthday. These tests pin that down.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  // profileDetailsValid reaches isUsableBirthday, which defaults its second
  // argument to today's date — so the clock helpers have to come along.
  { name: "toLocalISO", kind: "const" }, { name: "todayISO", kind: "const" },
  "parseDateParts", "ageFromBirthday", "isUsableBirthday", "birthdayBounds",
  { name: "AGE_MIN", kind: "const" }, { name: "AGE_MAX", kind: "const" },
  { name: "HEIGHT_CM_MIN", kind: "const" }, { name: "HEIGHT_CM_MAX", kind: "const" },
  { name: "WEIGHT_LB_MIN", kind: "const" }, { name: "WEIGHT_LB_MAX", kind: "const" },
  "profileDetailsValid",
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// ---------- the arithmetic ----------

test("a birthday already past this year counts the full year", () => {
  assert.equal(H.ageFromBirthday("1990-03-14", "2026-09-25"), 36);
});

test("a birthday still to come this year is one less", () => {
  assert.equal(H.ageFromBirthday("1990-12-14", "2026-09-25"), 35);
});

test("the day before the birthday is still the younger age", () => {
  assert.equal(H.ageFromBirthday("1990-09-26", "2026-09-25"), 35);
});

test("the birthday itself ticks over", () => {
  assert.equal(H.ageFromBirthday("1990-09-25", "2026-09-25"), 36);
});

test("the day after holds", () => {
  assert.equal(H.ageFromBirthday("1990-09-24", "2026-09-25"), 36);
});

test("same month, later day, is not yet counted", () => {
  assert.equal(H.ageFromBirthday("2000-09-30", "2026-09-25"), 25);
});

test("an earlier month is counted", () => {
  assert.equal(H.ageFromBirthday("2000-08-30", "2026-09-25"), 26);
});

test("born today is zero, not null", () => {
  assert.equal(H.ageFromBirthday("2026-09-25", "2026-09-25"), 0);
});

test("a Feb 29 birthday has not come round on Feb 28 of a common year", () => {
  assert.equal(H.ageFromBirthday("2000-02-29", "2026-02-28"), 25);
});

test("a Feb 29 birthday has come round by Mar 1 of a common year", () => {
  assert.equal(H.ageFromBirthday("2000-02-29", "2026-03-01"), 26);
});

test("a Feb 29 birthday lands exactly on Feb 29 of a leap year", () => {
  assert.equal(H.ageFromBirthday("2000-02-29", "2028-02-29"), 28);
});

// ---------- refusing what it can't use ----------

test("no birthday is null, not zero and not NaN", () => {
  [null, undefined, "", "   "].forEach(v =>
    assert.equal(H.ageFromBirthday(v, "2026-09-25"), null, JSON.stringify(v)));
});

test("a future birthday is null, never a negative age", () => {
  assert.equal(H.ageFromBirthday("2027-01-01", "2026-09-25"), null);
});

test("tomorrow is null", () => {
  assert.equal(H.ageFromBirthday("2026-09-26", "2026-09-25"), null);
});

test("a date that does not exist is refused", () => {
  ["2001-02-30", "2001-13-01", "2001-00-10", "2001-04-31", "2001-01-00"].forEach(v =>
    assert.equal(H.ageFromBirthday(v, "2026-09-25"), null, v));
});

test("a shape that is not YYYY-MM-DD is refused", () => {
  ["14/03/1990", "1990-3-14", "March 14 1990", "1990", "1990-03-14T00:00:00", 19900314]
    .forEach(v => assert.equal(H.ageFromBirthday(v, "2026-09-25"), null, String(v)));
});

test("a broken 'today' is refused rather than silently using the real clock", () => {
  assert.equal(H.ageFromBirthday("1990-03-14", "not a date"), null);
});

// ---------- the timezone trap this is written to avoid ----------

test("no Date is built from the birthday and compared to the local clock", () => {
  const at = src.indexOf("function ageFromBirthday(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(!/new Date\(\)/.test(body),
    "comparing against new Date() reintroduces the timezone bug the log dates had");
  assert.ok(!/new Date\(\s*birthday/.test(body),
    "new Date('1990-03-14') parses as UTC midnight — the evening before, in Niagara");
});

test("the existence check is all-UTC, so no local zone can shift it", () => {
  const at = src.indexOf("function parseDateParts(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/Date\.UTC\(/.test(body), "the probe date must be built in UTC");
  assert.ok(!/getFullYear\(\)|getMonth\(\)|getDate\(\)/.test(body),
    "local getters on a UTC-built date read the wrong day west of Greenwich");
});

test("the answer does not depend on the machine's timezone", () => {
  // The whole point of the string arithmetic. Same inputs, every zone.
  const zones = ["UTC", "America/Toronto", "Pacific/Kiritimati", "Pacific/Niue"];
  const saved = process.env.TZ;
  try {
    const answers = zones.map(tz => {
      process.env.TZ = tz;
      return H.ageFromBirthday("1990-09-25", "2026-09-25");
    });
    assert.deepEqual(answers, [36, 36, 36, 36]);
  } finally {
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
  }
});

// ---------- the plausibility gate ----------

test("a normal adult passes", () => {
  assert.equal(H.isUsableBirthday("1990-03-14", "2026-09-25"), true);
});

test("a youth athlete passes — they are real clients", () => {
  assert.equal(H.isUsableBirthday("2014-03-14", "2026-09-25"), true);  // 12
  assert.equal(H.isUsableBirthday("2012-03-14", "2026-09-25"), true);  // 14
});

test("a mistyped year that makes someone a toddler is refused", () => {
  assert.equal(H.isUsableBirthday("2024-03-14", "2026-09-25"), false); // 2
});

test("a mistyped year that makes someone 126 is refused", () => {
  assert.equal(H.isUsableBirthday("1900-03-14", "2026-09-25"), false);
});

test("the boundaries themselves are allowed, not off by one", () => {
  const today = "2026-09-25";
  assert.equal(H.isUsableBirthday(`${2026 - H.AGE_MIN}-09-25`, today), true,
    `exactly ${H.AGE_MIN} must pass`);
  assert.equal(H.isUsableBirthday(`${2026 - H.AGE_MAX}-09-25`, today), true,
    `exactly ${H.AGE_MAX} must pass`);
  // Turning AGE_MIN tomorrow means you are AGE_MIN - 1 today.
  assert.equal(H.isUsableBirthday(`${2026 - H.AGE_MIN}-09-26`, today), false,
    `a day short of ${H.AGE_MIN} must not`);
  // You stay AGE_MAX all year, so the first refusal is the next birthday, not
  // the next day. An earlier cutoff would refuse a legitimate AGE_MAX.
  assert.equal(H.isUsableBirthday(`${2026 - H.AGE_MAX}-09-24`, today), true,
    `${H.AGE_MAX} and a day is still ${H.AGE_MAX}`);
  assert.equal(H.isUsableBirthday(`${2026 - H.AGE_MAX - 1}-09-25`, today), false,
    `${H.AGE_MAX + 1} must not`);
});

test("the gate refuses everything the parser refuses", () => {
  ["", null, "2001-02-30", "2027-01-01", "garbage"].forEach(v =>
    assert.equal(H.isUsableBirthday(v, "2026-09-25"), false, String(v)));
});

// ---------- the picker's own limits ----------

// The picker and the gate must agree to the day, on every "today" — including
// the awkward ones. A picker that is looser hands someone a date the Next
// button then silently refuses; a picker that is stricter greys out a date that
// would have been fine.
const shiftIso = (iso, days) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + days));
  return d.toISOString().slice(0, 10);
};

for (const today of [
  "2026-09-25",   // ordinary
  "2028-02-29",   // leap day: AGE_MAX and AGE_MIN years back are both common years
  "2026-03-01",   // the day a Feb 29 birthday ticks over
  "2026-01-01",   // year boundary
  "2026-12-31",
]) {
  test(`the date input's bounds match the gate exactly on ${today}`, () => {
    const { min, max } = H.birthdayBounds(today);
    assert.notEqual(H.ageFromBirthday(min, today), null, `min ${min} must be a real date`);
    assert.notEqual(H.ageFromBirthday(max, today), null, `max ${max} must be a real date`);
    assert.equal(H.isUsableBirthday(min, today), true, `min ${min} must itself be allowed`);
    assert.equal(H.isUsableBirthday(max, today), true, `max ${max} must itself be allowed`);
    // One day outside either end must fail, or the two disagree.
    assert.equal(H.isUsableBirthday(shiftIso(min, -1), today), false,
      `${shiftIso(min, -1)} is outside the picker but the gate accepts it`);
    assert.equal(H.isUsableBirthday(shiftIso(max, 1), today), false,
      `${shiftIso(max, 1)} is inside the picker but the gate refuses it`);
  });
}

test("a broken today yields no bounds rather than a nonsense range", () => {
  const b = H.birthdayBounds("nope");
  assert.equal(b.min, undefined);
  assert.equal(b.max, undefined);
});

// ---------- wiring: pure functions can't see whether anything calls them ----------

test("signup asks for the birthday", () => {
  // Scoped to athleteSteps: the same substring also appears in
  // TRAINING_INTAKE_STEPS, so a file-wide match stayed green with the step
  // deleted from signup entirely.
  const at = src.indexOf("const athleteSteps = [");
  assert.notEqual(at, -1, "athleteSteps must exist");
  const body = src.slice(at, src.indexOf("];", at));
  assert.ok(body.includes("🎂 Birthday"), "the athlete signup steps must include the birthday step");
});

// The account is created at step one now, so every later step is answered by
// somebody who already has a login. That is the opposite of the old order,
// where the account came last and anything after it would never be reached -
// which is why this used to assert the birthday came BEFORE the account.
test("the account is made first, so no answer is stranded behind it", () => {
  const at = src.indexOf("const athleteSteps = [");
  const body = src.slice(at, src.indexOf("];", at));
  assert.ok(body.indexOf("🔐 Create Account") >= 0, "signup must create an account");
  assert.ok(body.indexOf("🔐 Create Account") < body.indexOf("🧬 Sex"),
    "the account step comes before the questions, not after them");
});

test("signup follows the four blocks: account, about you, health, programming", () => {
  const at = src.indexOf("const athleteSteps = [");
  const body = src.slice(at, src.indexOf("];", at));
  const order = ["🔐 Create Account", "🎂 Birthday", "⚖️ Weight", "🩹 Injuries", "🎯 Goals", "📅 Training Schedule"];
  const seen = order.map(k => body.indexOf(k));
  seen.forEach((i, n) => assert.ok(i > -1, `${order[n]} is missing from signup`));
  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i] > seen[i - 1],
      `${order[i]} must come after ${order[i - 1]} - login, then your body, then health, then programming`);
  }
});

test("an athlete joining a coach is asked everything an athlete is", () => {
  // The coached list is built by spreading the athlete one, so a step added
  // there carries over automatically. Pinning the spread rather than the exact
  // string keeps this true when the order changes again.
  const at = src.indexOf("const coachedAthleteSteps");
  assert.notEqual(at, -1, "coachedAthleteSteps must exist");
  const body = src.slice(at, src.indexOf("];", at));
  assert.ok(/\.\.\.athleteSteps\.slice\(/.test(body),
    "coached athletes must inherit the athlete steps rather than repeat a list that can drift");
  assert.ok(body.includes("🔑 Coach Invite Code"), "and they must be asked for the code");
});

test("a coach programming for himself is asked the same question", () => {
  const at = src.indexOf("const TRAINING_INTAKE_STEPS");
  const body = src.slice(at, src.indexOf("];", at));
  assert.ok(body.includes("🎂 Birthday"),
    "the coach's own intake must not drift from the athlete questionnaire");
});

test("the birthday step cannot be skipped past empty", () => {
  assert.ok(/case "🎂 Birthday": return isUsableBirthday\(data\.birthday\)/.test(src),
    "the Next button must be gated on a usable birthday");
  // Both switches: signup and the coach's own intake.
  const gates = src.match(/case "🎂 Birthday": return isUsableBirthday/g) || [];
  assert.equal(gates.length, 2, "both intake flows must gate it, not just signup");
});

test("the step actually renders something", () => {
  const at = src.indexOf('case "🎂 Birthday": {');
  assert.notEqual(at, -1, "the step body must exist or the step shows blank");
  const body = src.slice(at, src.indexOf('case "📏 Height"', at));
  assert.ok(/type="date"/.test(body), "it must be a date picker, not a free-text age");
  assert.ok(/set\("birthday"/.test(body), "it must write to data.birthday");
  assert.ok(/birthdayBounds\(\)/.test(body), "the picker must carry the same limits as the gate");
  assert.ok(/min=\{bounds\.min\} max=\{bounds\.max\}/.test(body),
    "computing the bounds and not putting them on the input leaves the picker wide open");
});

test("the coach sees the client's age on their profile", () => {
  const at = src.indexOf("function CoachAthleteDetail(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/ageFromBirthday\(athlete\.intake\?\.birthday\)/.test(body),
    "the client header must derive the age from the stored birthday");
});

test("the age is derived, never stored", () => {
  // If an `age` key is ever written to a profile or intake it will be wrong
  // within a year and nothing will say so. The birthday is the record.
  assert.ok(!/\bage:\s*ageFromBirthday/.test(src),
    "do not persist a computed age — recompute it");
  assert.ok(!/saveProfileSetting\([^)]*"age"/.test(src),
    "do not persist a computed age — recompute it");
});

test("an athlete who signed up before this step can still fill it in", () => {
  // Signup asks new accounts. Every account that already existed has no
  // birthday and shows its coach no age, so this editor is the only thing
  // that ever fills those in.
  const at = src.indexOf("function ProfileDetailsCard(");
  assert.notEqual(at, -1, "without this card, existing clients never get an age");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/saveProfileSetting\(setState, m\.id, "birthday", birthday \|\| null\)/.test(body),
    "it must persist through the same single-key RPC the other settings use");
  assert.ok(/const valid = profileDetailsValid\(\{ name, birthday, heightCm, weightLb \}\)/.test(body),
    "the Save gate must go through the shared rule");
  assert.ok(/disabled=\{busy \|\| !valid\}/.test(body),
    "Save must be dead while a field is invalid");
  assert.ok(/if \(busy \|\| !valid\) return;/.test(body),
    "and the handler must refuse too — the disabled attribute is not the guard");
});

test("the details editor is on screen for athletes and for coaches", () => {
  const uses = (src.match(/<ProfileDetailsCard state=\{state\} setState=\{setState\} \/>/g) || []).length;
  assert.equal(uses, 2, "a component nobody renders fixes nothing — athlete profile AND coach profile");
  for (const fn of ["function AthletePreferences(", "function CoachProfile("]) {
    const at = src.indexOf(fn);
    assert.notEqual(at, -1, fn);
    const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
    assert.ok(/<ProfileDetailsCard /.test(body), `${fn} must render it`);
  }
});

test("there is exactly one place to edit a birthday", () => {
  // The standalone BirthdayCard was folded into this card. Two editors for one
  // field is how they drift apart.
  assert.equal(src.indexOf("function BirthdayCard("), -1,
    "the old standalone card must be gone, not left orphaned");
  const writers = (src.match(/saveProfileSetting\([^)]*"birthday"/g) || []).length;
  assert.equal(writers, 1, "only one component may write the birthday");
});

test("renaming yourself updates the initials on your avatar too", () => {
  const at = src.indexOf("function ProfileDetailsCard(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/patch\.avatar = trimmedName\.split\(" "\)/.test(body),
    "initials are derived at signup and never again — a rename left the old ones everywhere");
});

test("the athlete's own profile shows their age", () => {
  const at = src.indexOf("function AthleteProfile(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/ageFromBirthday\(m\.intake\?\.birthday\) \?\? "—"/.test(body),
    "a missing birthday must read as a dash, never as 'null'");
});

test("the body metric tiles do not print NaN for an athlete who never set them", () => {
  const at = src.indexOf("function AthleteProfile(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  const tiles = body.slice(body.indexOf("Body Metrics"), body.indexOf("Body Metrics") + 1200);
  assert.ok(/m\.heightCm \? /.test(tiles), "height must be guarded");
  assert.ok(/m\.weightKg \? /.test(tiles), "weight must be guarded");
});


// ---------- what counts as a usable set of details ----------

const OK = { name: "Isaiah Fearon", birthday: "1990-03-14", heightCm: 178, weightLb: 175 };

test("a complete, sane set of details saves", () => {
  assert.equal(H.profileDetailsValid(OK), true);
});

test("a name is required — it is what a coach scrolls a roster for", () => {
  ["", "   ", null, undefined].forEach(n =>
    assert.equal(H.profileDetailsValid({ ...OK, name: n }), false, JSON.stringify(n)));
});

test("everything except the name is optional, so an old account can fix one field", () => {
  assert.equal(H.profileDetailsValid({ name: "Lia" }), true,
    "an account that predates these questions must still be able to save");
  assert.equal(H.profileDetailsValid({ name: "Lia", birthday: "", heightCm: null, weightLb: null }), true);
});

test("but a birthday that IS entered has to be real", () => {
  assert.equal(H.profileDetailsValid({ ...OK, birthday: "2027-01-01" }), false, "the future");
  assert.equal(H.profileDetailsValid({ ...OK, birthday: "2001-02-30" }), false, "a date that does not exist");
  assert.equal(H.profileDetailsValid({ ...OK, birthday: "1890-03-14" }), false, "a mistyped year");
  assert.equal(H.profileDetailsValid({ ...OK, birthday: "garbage" }), false);
});

test("a slipped decimal on height or weight is caught", () => {
  assert.equal(H.profileDetailsValid({ ...OK, heightCm: 17 }), false, "17cm");
  assert.equal(H.profileDetailsValid({ ...OK, heightCm: 1780 }), false, "1780cm");
  assert.equal(H.profileDetailsValid({ ...OK, weightLb: 17 }), false, "17lb");
  assert.equal(H.profileDetailsValid({ ...OK, weightLb: 1750 }), false, "1750lb");
});

test("the bounds are exclusive and do not drift from the constants", () => {
  assert.equal(H.profileDetailsValid({ ...OK, heightCm: H.HEIGHT_CM_MIN }), false);
  assert.equal(H.profileDetailsValid({ ...OK, heightCm: H.HEIGHT_CM_MIN + 1 }), true);
  assert.equal(H.profileDetailsValid({ ...OK, heightCm: H.HEIGHT_CM_MAX }), false);
  assert.equal(H.profileDetailsValid({ ...OK, weightLb: H.WEIGHT_LB_MIN }), false);
  assert.equal(H.profileDetailsValid({ ...OK, weightLb: H.WEIGHT_LB_MIN + 1 }), true);
  assert.equal(H.profileDetailsValid({ ...OK, weightLb: H.WEIGHT_LB_MAX }), false);
});

test("a youth athlete and a heavyweight both pass", () => {
  assert.equal(H.profileDetailsValid({ name: "Kid", birthday: "2014-06-01", heightCm: 140, weightLb: 85 }), true);
  assert.equal(H.profileDetailsValid({ name: "Big", heightCm: 205, weightLb: 320 }), true);
});

test("called with nothing at all it refuses rather than throwing", () => {
  assert.equal(H.profileDetailsValid(), false);
  assert.equal(H.profileDetailsValid({}), false);
});

test("reopening the editor shows what is stored, not what was abandoned", () => {
  const at = src.indexOf("function ProfileDetailsCard(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  const open = body.slice(body.indexOf("const open = () => {"), body.indexOf("setEditing(true);"));
  for (const field of ["setName(", "setBirthday(", "setHeightCm(", "setWeightLb(", "setError("]) {
    assert.ok(open.includes(field), `open() must reset ${field} or a cancelled edit comes back`);
  }
});

test("the program generator is told the age", () => {
  const at = src.indexOf("function buildAIPrompt(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 1));
  assert.ok(/- Age: \$\{ageFromBirthday\(intake\.birthday\)/.test(body),
    "age changes volume, recovery and how fast a plan can progress");
  assert.ok(/ageFromBirthday\(intake\.birthday\) \?\? "unspecified"/.test(body),
    "a missing birthday must read as unspecified, not as 'null years old'");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
