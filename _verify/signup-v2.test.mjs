// The short signup: six screens instead of fourteen.
//
// signup.test.mjs guards one end of the contract - that SIGNUP_KEYS still
// lists everything the profile write and the AI prompt read. This file guards
// the other end, which is the one that actually breaks: that every key in
// SIGNUP_KEYS is still typed in by somebody, on a screen that is really in
// the flow.
//
// Those two tests together are the whole safety net. A key can go missing in
// two ways - dropped from the contract, or kept in the contract but asked for
// on a screen that no longer exists - and both are silent. Nothing throws.
// The athlete finishes signup, gets a programme, and it is subtly the wrong
// programme: a fighter gets General Fitness, or somebody who trains five days
// a week gets five full-body sessions.
//
// The combined screens are composed from the old step bodies rather than
// rewritten, so this test walks the composition: for each screen in
// SIGNUP_V2_STEPS, expand it through SIGNUP_V2_SECTIONS into leaf steps, find
// each leaf's body in the source, and collect the keys it writes.
import assert from "node:assert/strict";
import { readSource, load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);

// The real validators, not stubs. stepComplete's whole job is to be the gate,
// and a gate tested against a stand-in for its own lock is not tested.
const {
  SIGNUP_KEYS, SIGNUP_V2_STEPS, SIGNUP_V2_SECTIONS, SIGNUP_V2,
  deriveSplit, withDerivedSplit, stepComplete, DEFAULT_SPLIT, SPLIT_STYLES, accountStepProblems,
} = await load(APP, [
  { name: "toLocalISO", kind: "const" },
  { name: "todayISO", kind: "const" },
  { name: "AGE_MIN", kind: "const" },
  { name: "AGE_MAX", kind: "const" },
  "parseDateParts", "ageFromBirthday", "isUsableBirthday",
  { name: "EMAIL_RE", kind: "const" },
  { name: "looksLikeEmail", kind: "const" },
  "accountStepProblems", "accountStepValid", "emailTaken",
  { name: "FOCUS_GENERAL", kind: "const" },
  { name: "SPORTS", kind: "const" },
  "isCombatFocus", "focusTypeOf", "focusComplete",
  { name: "INJURY_MIDLINE", kind: "const" },
  { name: "injuryNeedsSide", kind: "const" },
  "injuryDetailFor", "injurySidesMissing", "injurySidesAnswered",
  { name: "SPLIT_STYLES", kind: "const" },
  { name: "DEFAULT_SPLIT", kind: "const" },
  "deriveSplit", "withDerivedSplit",
  { name: "SIGNUP_KEYS", kind: "const" },
  { name: "SIGNUP_V2_STEPS", kind: "const" },
  { name: "SIGNUP_V2_SECTIONS", kind: "const" },
  { name: "SIGNUP_V2", kind: "const" },
  "stepComplete",
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---------- walking the screens ----------

// Expand a screen into the leaf step bodies it actually renders.
const leavesOf = (screen, data = {}) => {
  const sections = SIGNUP_V2_SECTIONS[screen];
  if (!sections) return [screen];
  return sections.filter(s => !s.when || s.when(data)).flatMap(s => leavesOf(s.step, data));
};

// The three coach list steps write to the key named by the step itself -
// `set(stepName, opt)` - so there is no literal to find in the source.
const COACH_LIST_STEPS = new Set(["🏅 Background", "⚡ Specialties", "🎯 Coaching Style"]);

// Steps whose body is a component of its own rather than a case in the
// switch, with the keys each one writes.
const OUT_OF_LINE = {
  "🔑 Coach Invite Code": ["inviteCode", "inviteCoachId"],
  "🔐 Create Account": ["name", "email", "password"],
  "💼 Business Name": ["businessName"],
  "🖼️ Logo": ["logoFile", "logoPreview"],
};

// The keys a leaf step writes, read out of its body in the source.
function keysWrittenBy(step) {
  if (COACH_LIST_STEPS.has(step)) return [step];
  if (OUT_OF_LINE[step]) return OUT_OF_LINE[step];

  // A case body runs to the next case at the same indentation.
  const open = src.indexOf(`    case "${step}": {`);
  assert.ok(open > 0, `no step body found for ${step} - has it been renamed?`);
  const rest = src.slice(open + 10);
  const nextCase = rest.search(/\n    case "/);
  const body = nextCase === -1 ? rest : rest.slice(0, nextCase);

  const keys = new Set();
  // Two ways a body writes an answer: the `set(key, value)` helper, and a
  // direct `setData(d => ({ ...d, key: value }))` where more than one key
  // changes at once - which is how the injuries screen keeps the selected
  // areas and their details in step.
  for (const m of body.matchAll(/\bset\("([^"]+)"/g)) keys.add(m[1]);
  for (const m of body.matchAll(/\.\.\.d,/g)) {
    const after = body.slice(m.index, m.index + 240);
    const upTo = after.indexOf("})");
    for (const k of (upTo === -1 ? after : after.slice(0, upTo)).matchAll(/\b([A-Za-z_$][\w$]*)\s*:/g)) {
      keys.add(k[1]);
    }
  }
  assert.ok(keys.size > 0, `${step}'s body writes nothing at all`);
  return [...keys];
}

test("the hand-listed bodies really do write what this file says they write", () => {
  // OUT_OF_LINE is the one place this test trusts a list instead of reading
  // the source, so the list itself gets checked: rename a key in the body and
  // the claim here stops being true silently.
  for (const [step, keys] of Object.entries(OUT_OF_LINE)) {
    for (const k of keys) {
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const written = new RegExp(`set\\("${esc}"`).test(src) || new RegExp(`\\b${esc}:`).test(src);
      assert.ok(written, `"${step}" is listed as writing ${k}, and nothing in App.jsx writes it`);
    }
  }
});

test("every screen in the flow has a body behind it", () => {
  // The failure this catches is a screen listed in SIGNUP_V2_STEPS that
  // nothing knows how to render: the athlete reaches a blank page with a
  // Continue button and no way to understand what is wanted.
  for (const [role, screens] of Object.entries(SIGNUP_V2_STEPS)) {
    for (const screen of screens) {
      if (screen === "📩 Invite Your Clients") continue; // explainer, no inputs
      const leaves = leavesOf(screen, { "🥊 Sport / Focus": "MMA" });
      assert.ok(leaves.length > 0, `${role}'s "${screen}" expands to nothing`);
      for (const leaf of leaves) keysWrittenBy(leaf); // throws if missing
    }
  }
});

// Which blocks of the contract each path is responsible for collecting.
// Checked PER PATH, not pooled: pooling meant dropping the injuries screen
// from the solo athlete still passed, because the coached path happened to
// keep it.
const BLOCKS_FOR = {
  athlete: ["account", "about", "goal", "week", "injuries"],
  athlete_coached: ["account", "about", "goal", "week", "injuries", "coached"],
  coach: ["account", "coach"],
};

// Set by the app rather than typed in by anybody, so no screen writes them.
const NOT_TYPED = new Set([
  "weightUnit", "heightUnit", // unit toggles, defaulted in chooseRole
  "goalNotes",                // optional free text
]);

const keysAskedOn = (role) => {
  const asked = new Set();
  for (const screen of SIGNUP_V2_STEPS[role]) {
    // Both branches, so a key only a fighter is asked for still counts.
    for (const data of [{}, { "🥊 Sport / Focus": "MMA" }]) {
      for (const leaf of leavesOf(screen, data)) {
        if (leaf === "📩 Invite Your Clients") continue;
        for (const k of keysWrittenBy(leaf)) asked.add(k);
      }
    }
  }
  return asked;
};

test("every path asks for every key it is responsible for", () => {
  // THE test in this file. A key in SIGNUP_KEYS that the path never writes is
  // a question that silently stopped being asked - no error, no warning, just
  // a worse programme. It is how the coached path came to have no goal screen.
  const missing = [];
  for (const [role, blocks] of Object.entries(BLOCKS_FOR)) {
    const asked = keysAskedOn(role);
    for (const block of blocks) {
      assert.ok(SIGNUP_KEYS[block], `SIGNUP_KEYS has no "${block}" block any more`);
      for (const k of SIGNUP_KEYS[block]) {
        if (NOT_TYPED.has(k) || asked.has(k)) continue;
        missing.push(`${role} never asks ${block}.${k}`);
      }
    }
  }
  assert.deepEqual(missing, [], missing.join("\n      "));
});

test("the contract has no block that no path collects", () => {
  // A block added to SIGNUP_KEYS and then not wired into any path is a
  // question written down and never asked.
  const covered = new Set(Object.values(BLOCKS_FOR).flat());
  for (const block of Object.keys(SIGNUP_KEYS)) {
    assert.ok(covered.has(block), `SIGNUP_KEYS.${block} is collected by no signup path`);
  }
});

test("no path asks a question that belongs to another path", () => {
  // A coach being asked their injuries, or a solo athlete being asked for an
  // invite code, means a screen is in the wrong list.
  const coachAsked = keysAskedOn("coach");
  for (const k of [...SIGNUP_KEYS.about, ...SIGNUP_KEYS.week, ...SIGNUP_KEYS.injuries]) {
    if (NOT_TYPED.has(k)) continue;
    assert.ok(!coachAsked.has(k), `the coach signup asks for ${k}`);
  }
  const soloAsked = keysAskedOn("athlete");
  assert.ok(!soloAsked.has("inviteCode"), "a solo athlete is asked for a coach's invite code");
});

test("sport is on a screen that is really in the athlete flow", () => {
  // Named on its own because of what losing it costs: no error, no warning,
  // every generated programme quietly becomes General Fitness.
  for (const role of ["athlete", "athlete_coached"]) {
    const asked = SIGNUP_V2_STEPS[role].flatMap(s => leavesOf(s)).flatMap(keysWrittenBy);
    assert.ok(asked.includes("🥊 Sport / Focus"), `${role} is never asked what sport they do`);
  }
});

test("the fighter follow-up shows for fighters and not for anyone else", () => {
  const goal = "🎯 Your Goal";
  assert.ok(leavesOf(goal, { "🥊 Sport / Focus": "MMA" }).includes("🥋 Sport Details"),
    "a fighter is never asked whether they compete");
  assert.ok(!leavesOf(goal, { "🥊 Sport / Focus": "Powerlifting" }).includes("🥋 Sport Details"),
    "a powerlifter is asked which discipline they fight in");
  assert.ok(!leavesOf(goal, {}).includes("🥋 Sport Details"),
    "the fighter question shows before any sport has been picked");
});

test("session style is not asked on any screen", () => {
  // The point of the rebuild. If it comes back as a question, deriveSplit is
  // being overridden by a screen and the week no longer decides the split.
  for (const screens of Object.values(SIGNUP_V2_STEPS)) {
    for (const screen of screens) {
      assert.ok(!leavesOf(screen, {}).includes("🧩 Session Style"),
        `"${screen}" still asks for a session style`);
    }
  }
});

test("the coached athlete sees the coach before the password", () => {
  // Deliberate, and the reason the coached path is a different list: somebody
  // joining a coach wants to see whose app this is before typing a password
  // into it.
  const steps = SIGNUP_V2_STEPS.athlete_coached;
  assert.ok(steps.indexOf("🔑 Coach Invite Code") < steps.indexOf("🔐 Create Account"),
    "the invite code is asked for after the account is created");
  assert.equal(steps[0], "🔑 Coach Invite Code");
});

test("no path is longer than six screens", () => {
  for (const [role, screens] of Object.entries(SIGNUP_V2_STEPS)) {
    assert.ok(screens.length <= 6, `${role} still has ${screens.length} screens`);
    assert.ok(screens.length === new Set(screens).size, `${role} asks the same screen twice`);
  }
});

test("no screen is described but never shown", () => {
  // A section group that nothing reaches means a screen was renamed in one of
  // the two lists and not the other. The symptom is not an error: the step
  // renders as a heading with nothing under it, and Continue is live.
  const shown = new Set(Object.values(SIGNUP_V2_STEPS).flat());
  for (const screen of Object.keys(SIGNUP_V2_SECTIONS)) {
    assert.ok(shown.has(screen),
      `"${screen}" is built out of sections and is in nobody's flow - renamed in one list only?`);
  }
});

test("the business name the coach types reaches the column the card reads", () => {
  // It is a column, not just an intake key, because coach_card selects it by
  // name. Written only into intake, every athlete's coach card would fall
  // back to the coach's personal name and the branding would look broken.
  assert.ok(/business_name: \(data\.businessName \|\| ""\)\.trim\(\) \|\| null/.test(src),
    "the coach's business name is never written to profiles.business_name");
  // Empty must be null rather than "", or the card shows a blank heading
  // instead of falling back to the coach's own name.
  assert.ok(/\.trim\(\) \|\| null/.test(src), "an empty business name is stored as an empty string");
});

test("the way forward does not scroll off a combined screen", () => {
  // Measured at 320px: "👤 About You" is 1,174px of content, which put
  // Continue 1,362px down a 760px-tall phone. Four questions on one screen is
  // the whole point of the rebuild, so the footer sticks instead.
  const at = src.indexOf('className="px-6 pb-8 pt-4 flex gap-3 shrink-0"');
  assert.ok(at > 0, "the signup footer is not where this test expects it");
  const row = src.slice(at, at + 260);
  assert.ok(/position: "sticky", bottom: 0/.test(row),
    "the Continue button scrolls away on a long screen");
  // Without an opaque background the content scrolls through it.
  assert.ok(/background: C\.bg/.test(row), "the sticky footer is transparent");
});

test("the step list survives the role picker, where role is null", () => {
  // THE crash. `role` is null while the picker is on screen, and the step
  // list is worked out ~100 lines ABOVE the `if (!role)` early return - so
  // a lookup that returns undefined for a null key throws on the next
  // line, before anybody has chosen anything. The app died on the first
  // screen it ever shows.
  //
  // It survived every other test in this file because they all read
  // SIGNUP_V2_STEPS as data and never ran the lookup with no role. So this
  // one lifts the real expression out of the source and runs it.
  const line = /const allSteps = (\(SIGNUP_V2 \? SIGNUP_V2_STEPS\[role\] : v1Steps\)[^;]*);/.exec(src);
  assert.ok(line, "the step-list expression is not where this test reads it");
  const evaluate = new Function("SIGNUP_V2", "SIGNUP_V2_STEPS", "role", "v1Steps",
    `return ${line[1]};`);
  const v1 = ["🔐 Create Account", "🧬 Sex"];
  // Every value `role` actually holds, null first.
  for (const role of [null, undefined, "athlete", "athlete_coached", "coach"]) {
    for (const flag of [true, false]) {
      const got = evaluate(flag, SIGNUP_V2_STEPS, role, v1);
      assert.ok(Array.isArray(got),
        `role=${JSON.stringify(role)} with SIGNUP_V2=${flag} gives ${got}, and the next line asks it for .length`);
      assert.ok(got.length > 0, `role=${JSON.stringify(role)} gives an empty list`);
    }
  }
  // And with a role, it is really that role's list rather than the fallback.
  for (const role of ["athlete", "athlete_coached", "coach"]) {
    assert.deepEqual(evaluate(true, SIGNUP_V2_STEPS, role, v1), SIGNUP_V2_STEPS[role],
      `the ${role} path is being given somebody else's screens`);
  }
});

test("the lookup really can come back empty, so the fallback is not decoration", () => {
  // If this ever stops being true the fallback above is dead code and the
  // test guarding it is testing nothing.
  assert.equal(SIGNUP_V2_STEPS[null], undefined);
  assert.equal(SIGNUP_V2_STEPS[undefined], undefined);
});

test("the short signup is the one that runs, and the way back is one line", () => {
  assert.equal(SIGNUP_V2, true, "the short signup is built and tested but nobody is seeing it");
  // The v1 lists are what makes flipping back a one-liner instead of a
  // revert, so they are not dead code until the flag goes.
  assert.ok(/const athleteSteps = \[/.test(src), "the long signup's step list is gone");
  assert.ok(/const coachSteps = \[/.test(src), "the long coach signup's step list is gone");
  assert.ok(/const allSteps = \(SIGNUP_V2 \? SIGNUP_V2_STEPS\[role\] : v1Steps\)/.test(src),
    "the flag no longer chooses between the two");
});

test("a coach who changes their mind does not carry coaching answers across", () => {
  // The hand-written list missed two of the four, so "⚡ Specialties" and
  // "🎯 Coaching Style" rode into an athlete's intake where nothing reads
  // them and nothing clears them.
  assert.ok(/const COACH_ONLY_KEYS = \[\.\.\.SIGNUP_KEYS\.coach, "📩 Invite Athletes"/.test(src),
    "the coach-only keys are listed by hand again and will drift from the contract");
  assert.ok(/for \(const k of COACH_ONLY_KEYS\) delete cleaned\[k\];/.test(src),
    "nothing clears the coach's answers when the role changes");
});

// ---------- can this screen be left ----------

const athlete = {
  name: "Alex Reid", email: "a@b.com", password: "abcdefgh", confirmPassword: "abcdefgh",
  sex: "Male", birthday: "1990-01-01", heightCm: 178, weightLb: 175,
  goals: ["Build muscle"], "🥊 Sport / Focus": "Powerlifting", experience: "Advanced (3+ years)",
  trainingDays: ["Monday", "Wednesday", "Friday"], equipment: ["Full gym access"],
  injuries: ["None currently"],
};

test("a fully answered screen can be left", () => {
  for (const screen of SIGNUP_V2_STEPS.athlete) {
    assert.ok(stepComplete(screen, athlete, "athlete"), `"${screen}" cannot be left when everything on it is answered`);
  }
});

test("one missing answer anywhere on a screen holds the whole screen", () => {
  // The risk of putting four questions on one screen: three answered and one
  // blank must not read as done, or the blank one is never filled in.
  const required = {
    "👤 About You": ["sex", "birthday", "heightCm", "weightLb"],
    "🎯 Your Goal": ["goals", "🥊 Sport / Focus", "experience"],
    "📅 Your Week": ["trainingDays", "equipment"],
  };
  for (const [screen, keys] of Object.entries(required)) {
    for (const k of keys) {
      const without = { ...athlete };
      delete without[k];
      assert.equal(stepComplete(screen, without, "athlete"), false,
        `"${screen}" can be left with ${k} unanswered`);
    }
  }
});

test("an empty list does not count as an answer", () => {
  // `goals: []` is truthy. Checking the key rather than its length is the
  // mistake this guards, and it lets somebody through having picked nothing.
  for (const [screen, k] of [["🎯 Your Goal", "goals"], ["📅 Your Week", "trainingDays"], ["📅 Your Week", "equipment"]]) {
    assert.equal(stepComplete(screen, { ...athlete, [k]: [] }, "athlete"), false,
      `"${screen}" can be left with an empty ${k}`);
  }
});

test("a fighter cannot skip past the question only they are asked", () => {
  const fighter = { ...athlete, "🥊 Sport / Focus": "MMA" };
  assert.equal(stepComplete("🎯 Your Goal", fighter, "athlete"), false,
    "a fighter can leave the goal screen without saying whether they compete");
  assert.ok(stepComplete("🎯 Your Goal", { ...fighter, isFighter: false }, "athlete"),
    "answering it does not unblock the screen");
  // `false` is a real answer here and must not read as unanswered.
  assert.ok(stepComplete("🥋 Sport Details", { isFighter: false }, "athlete"),
    "saying you do not compete counts as not having answered");
});

test("'What is in the way, and by when' is gone, and the fight date is not lost with it", () => {
  // Isaiah, 30 Oct: take the question out. The fight date it held drives the
  // camp taper, so it moved to the fighter's own question, and stays optional.
  assert.ok(!/Goal Depth/.test(src), "the old screen is still there");
  assert.ok(!/What is in the way/.test(src), "the old label is still there");
  assert.ok(stepComplete("🎯 Your Goal", { ...athlete, "🥊 Sport / Focus": "MMA", isFighter: true }, "athlete"),
    "a fighter is held on the goal screen for a date they do not have yet");
  assert.ok(/Next fight date \(optional\)/.test(src), "fighters can no longer give a fight date");
});

test("main focus: General Fitness or a Sport, and a sport has to be picked", () => {
  const base = { ...athlete };
  delete base["🥊 Sport / Focus"];
  const goal = "🎯 Your Goal";
  assert.ok(stepComplete(goal, { ...base, focusType: "general", "🥊 Sport / Focus": "General Fitness" }, "athlete"));
  assert.ok(stepComplete(goal, { ...base, focusType: "general", "🥊 Sport / Focus": "HYROX" }, "athlete"));
  assert.equal(stepComplete(goal, { ...base, focusType: "sport", "🥊 Sport / Focus": null }, "athlete"), false,
    "Sport can be left without saying which sport");
  assert.ok(stepComplete(goal, { ...base, focusType: "sport", "🥊 Sport / Focus": "Soccer" }, "athlete"));
  // Combat sports still get the fighter question; so does everyone already stored as MMA.
  assert.equal(stepComplete(goal, { ...base, focusType: "sport", "🥊 Sport / Focus": "Combat Sports" }, "athlete"), false);
  assert.ok(stepComplete(goal, { ...base, "🥊 Sport / Focus": "Combat Sports", isFighter: false }, "athlete"));
  assert.ok(/label: "Main focus"/.test(src), "the question is not called Main focus");
});

test("an email that already has an account blocks the account screen, and says so", () => {
  const ok = { name: "Alex Reid", email: "A@b.com", password: "abcdefgh", confirmPassword: "abcdefgh" };
  assert.ok(stepComplete("🔐 Create Account", ok, "athlete"));
  const taken = { ...ok, emailTakenFor: "a@b.com" };
  assert.equal(stepComplete("🔐 Create Account", taken, "athlete"), false, "Continue is open on a taken email");
  assert.match(accountStepProblems(taken).email, /already has an account/);
  assert.ok(stepComplete("🔐 Create Account", { ...taken, email: "new@b.com" }, "athlete"),
    "a different email is still held by the old answer");
  assert.ok(/supabase\.rpc\("email_has_account"/.test(src), "nothing asks while they are on the screen");
});

test("the invite code must resolve to a real coach, not just be six long", () => {
  assert.equal(stepComplete("🔑 Coach Invite Code", { inviteCode: "AAAAAA" }, "athlete_coached"), false,
    "any six characters passes, so the athlete joins a roster that does not exist");
  assert.ok(stepComplete("🔑 Coach Invite Code", { inviteCode: "AAAAAA", inviteCoachId: "u1" }, "athlete_coached"));
  assert.equal(stepComplete("🔑 Coach Invite Code", { inviteCode: "AAA", inviteCoachId: "u1" }, "athlete_coached"), false);
});

test("the coach brand screen never blocks", () => {
  // Business name and logo are both optional (Isaiah, 28 Oct): a coach who
  // trains under their own name skips both and the card shows their name.
  const coach = { name: "Casey Lin", email: "c@d.com", password: "abcdefgh", confirmPassword: "abcdefgh" };
  assert.ok(stepComplete("🏅 Your Coaching Business", coach, "coach"));
  assert.ok(stepComplete("🏅 Your Coaching Business", { ...coach, businessName: "Lin Strength" }, "coach"));
  assert.ok(stepComplete("📩 Invite Your Clients", coach, "coach"));
});

// ---------- the split that is no longer asked for ----------

test("the split follows the number of days", () => {
  const days = n => Array.from({ length: n }, (_, i) => `d${i}`);
  // Four or fewer sessions is not enough to specialise: every one has to
  // cover the whole body or patterns get trained once a fortnight.
  for (const n of [1, 2, 3, 4]) assert.equal(deriveSplit(days(n)), "full_body", `${n} days`);
  // Five full-body sessions cannot be recovered from.
  assert.equal(deriveSplit(days(5)), "upper_lower");
  // Six or seven is the only week with room to hit each pattern twice.
  for (const n of [6, 7]) assert.equal(deriveSplit(days(n)), "push_pull_legs", `${n} days`);
});

test("nothing, or nonsense, still gets a usable split", () => {
  for (const v of [undefined, null, [], "Monday", 3, {}]) {
    assert.equal(deriveSplit(v), DEFAULT_SPLIT, `deriveSplit(${JSON.stringify(v)})`);
  }
});

test("every split it can return is one the programme generator understands", () => {
  // A key that is not in SPLIT_STYLES is silently replaced by full body at
  // read time, so a wrong string here looks exactly like the feature not
  // working rather than like a bug.
  const keys = new Set(SPLIT_STYLES.map(s => s.key));
  for (let n = 0; n <= 8; n++) {
    const got = deriveSplit(Array.from({ length: n }, (_, i) => `d${i}`));
    assert.ok(keys.has(got), `${n} days derives "${got}", which the generator does not know`);
  }
});

test("the derived split is written in beside the other answers", () => {
  assert.equal(withDerivedSplit({ trainingDays: ["a", "b", "c", "d", "e"] }).splitStyle, "upper_lower");
  assert.equal(withDerivedSplit({ trainingDays: ["a", "b", "c"] }).splitStyle, "full_body");
});

test("an answer that was actually given is never overwritten", () => {
  // The coach's own training intake still asks the question outright, and a
  // signup draft saved before this change already carries one.
  const chosen = { trainingDays: ["a", "b", "c", "d", "e"], splitStyle: "full_body" };
  assert.equal(withDerivedSplit(chosen).splitStyle, "full_body");
  assert.equal(withDerivedSplit(chosen), chosen, "the object was rebuilt for no reason");
});

test("a half-finished signup gets no split invented for it", () => {
  // No training days is not "train full body", it is "we do not know yet".
  // Writing a split anyway would then be treated as a real answer for ever.
  for (const d of [{}, { trainingDays: [] }, { trainingDays: null }]) {
    assert.equal(withDerivedSplit(d).splitStyle, undefined, JSON.stringify(d));
  }
  assert.equal(withDerivedSplit(null), null);
});

test("the derivation happens where the answers become a profile", () => {
  // Once, at the write, so the stored intake and the AI prompt cannot
  // disagree about which split the programme was built for.
  const at = src.indexOf("const writeProfileAndContinue = async");
  assert.ok(/const writeProfileAndContinue = async \(authData, role, rawData\) => \{/.test(src),
    "writeProfileAndContinue takes the raw answers under a name that hides whether they were normalised");
  const head = src.slice(at, at + 900);
  assert.ok(/const data = withDerivedSplit\(rawData\);/.test(head),
    "the answers are written without a split being worked out first");
});

test("existing athletes keep the split they are already being programmed on", () => {
  // Eleven profiles exist, two of them train five days, and none of them ever
  // answered this question. Deriving at READ time instead of at signup would
  // have restructured two real athletes' training on their next generation.
  const at = src.indexOf("function splitStyleOf(");
  const fn = src.slice(at, src.indexOf("}", at));
  assert.ok(/return SPLIT_STYLES\.some\(s => s\.key === key\) \? key : DEFAULT_SPLIT;/.test(fn),
    "splitStyleOf now derives, which changes the programme shape for athletes who are already here");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);

test("the coach signup is the account, the brand and the invite code", () => {
  // Isaiah, 28 Oct: business name and logo, nothing about years coached.
  assert.deepEqual(SIGNUP_V2_STEPS.coach, ["🔐 Create Account", "🏅 Your Coaching Business", "📩 Invite Your Clients"]);
  assert.deepEqual(SIGNUP_V2_SECTIONS["🏅 Your Coaching Business"].map(x => x.step), ["💼 Business Name", "🖼️ Logo"]);
  assert.ok(/logoFile, logoPreview, \.\.\.rest \} = data;/.test(src), "the picked logo file would be written into the intake");
  assert.ok(/uploadCoachLogo\(userId, logoFile\)/.test(src), "the logo picked at signup is never uploaded");
});
