// The desktop sidebar holds nav and nothing else.
//
// It used to carry a "This program" card under the nav — the programme name, a
// row of week pips and "Week 1 of 12". It was removed on purpose: the Program
// tab is one click away and leads with the same name and week, so the card was
// repeating itself in the one place an athlete cannot dismiss it.
//
// Two things this file guards. First, the card does not creep back — it is the
// kind of block that gets re-added by anyone reading `program` in the props and
// assuming it should be drawn. Second, and more importantly, the information
// did not leave the app with it: the Program tab must still name the programme
// and say which week it is, because that was the whole argument for deleting
// the card.
import assert from "node:assert/strict";
import { readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

const bodyOf = (decl) => {
  const at = src.indexOf(decl);
  assert.ok(at > 0, `${decl} is gone`);
  return src.slice(at, src.indexOf("\n}\n", at));
};

// ---------- the card is gone ----------

test("the sidebar is not handed a programme any more", () => {
  const sig = /function SideNav\(\{([^}]*)\}\)/.exec(src);
  assert.ok(sig, "SideNav no longer destructures its props");
  assert.ok(!/\bprogram\b/.test(sig[1]),
    `SideNav still takes a program prop: ${sig[1].trim()}`);
});

test("nothing in the sidebar draws a programme card", () => {
  const body = bodyOf("function SideNav(");
  assert.ok(!/This program/i.test(body), "the 'This program' card is back in the sidebar");
  assert.ok(!/\bprogram\./.test(body), "the sidebar is reading programme fields again");
});

test("the shell passes no programme to the sidebar", () => {
  // The tag closes on a line of its own. Stopping at the first "/>" would stop
  // inside the <ModeSwitch ... /> sitting in one of its props, and miss
  // anything passed after it.
  const tag = /<SideNav\b[\s\S]*?\n\s*\/>/.exec(src)?.[0];
  assert.ok(tag, "the sidebar is no longer rendered");
  assert.ok(/modeSwitch=/.test(tag), "the whole tag was not captured");
  assert.ok(!/\bprogram=/.test(tag), "the shell is still passing program= to SideNav");
});

test("the card's working-out is gone too, not left behind unused", () => {
  // A dead `sideProgram` would sit there computing a week on every render and
  // invite someone to wire it back up.
  assert.ok(!/sideProgram/.test(src), "sideProgram is still being computed");
});

// ---------- what the sidebar does still hold ----------

test("the sidebar still has the nav and the signed-in athlete", () => {
  const body = bodyOf("function SideNav(");
  assert.ok(/items\.map/.test(body), "the nav items are gone");
  assert.ok(/<Avatar initials=\{me\?\.avatar/.test(body), "the profile corner is gone");
  assert.ok(/marginTop: "auto"/.test(body),
    "the profile block no longer sits at the bottom, so the sidebar has a hole in it");
});

test("the sidebar is a desktop-only thing — phones are untouched", () => {
  // SideNav must stay inside the `wide ?` branch. If it ever renders on the
  // phone shell, deleting a card from it stops being a desktop-only change.
  // `{wide ? (` appears elsewhere too, so anchor on the shell itself.
  const shell = src.indexOf("<WideContext.Provider value={wide}>");
  assert.ok(shell > 0, "the app shell no longer publishes `wide`");
  const at = src.indexOf("{wide ? (", shell);
  assert.ok(at > 0, "the two shells are no longer chosen by `wide`");
  const phoneAt = src.indexOf(") : (", at);
  assert.ok(src.slice(at, phoneAt).includes("<SideNav"),
    "the sidebar left the wide branch");
  assert.ok(!src.slice(phoneAt, src.indexOf("<BottomNav", phoneAt)).includes("<SideNav"),
    "the sidebar is rendering on phones");
});

// ---------- the information did not go with it ----------

test("the Program tab still names the programme", () => {
  const body = bodyOf("function AthleteProgram(");
  assert.ok(/\{myProgram\.name\}/.test(body),
    "the reason for deleting the card was that this tab shows the name — it does not");
});

test("the Program tab still says which week it is", () => {
  const body = bodyOf("function AthleteProgram(");
  assert.ok(/currentProgramWeek\(myProgram\)/.test(body),
    "the tab no longer works out the live week");
  assert.ok(/shownWeek/.test(body), "the week is computed but never shown");
});

test("the dashboard still says which week it is", () => {
  // The card is also not the only place a week appeared. The greeting line
  // carries it, and that is what an athlete sees first.
  const body = bodyOf("function AthleteDashboard(");
  assert.ok(/Week \{programWeekFor\(myProgram, today\) \|\| 1\} of \{myProgram\.weeks \|\| 6\}/.test(body),
    "the week is no longer under the greeting either, so it is now nowhere on landing");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
