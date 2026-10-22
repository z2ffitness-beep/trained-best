// The athlete's page, split into four tabs.
//
// It used to be one 1,400-line column: who they are, their week, their
// billing, the whole programme editor, and at the very bottom the button
// that ends the coaching. Finding anything meant scrolling past the editor,
// which is the tallest thing in the app.
//
// Splitting a page by moving blocks around has one failure mode that no
// compiler catches: a section that ends up behind a tab nothing can select,
// or behind the wrong one. Nothing errors. The section is simply gone, and
// the only way to find out is for a coach to go looking for their athlete's
// billing and not find it.
//
// So this file reads the tabs and the panels out of the source and checks
// they line up, and checks each section is behind the tab it belongs to.
import assert from "node:assert/strict";
import { readSource, load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);

const { ATHLETE_TABS } = await load(APP, [{ name: "ATHLETE_TABS", kind: "const" }]);

// The body of CoachAthleteDetail, which is where the panels live.
const PAGE_AT = src.indexOf("function CoachAthleteDetail(");
const PAGE_END = src.indexOf("\nfunction CoachPrograms(", PAGE_AT);
const page = src.slice(PAGE_AT, PAGE_END);

// Every panel on the page, in source order. A list rather than a map keyed
// by tab, because two panels for the same tab is itself a thing worth being
// able to see - keeping only the last one would hide a section that had been
// wrapped a second time.
const panelList = [...page.matchAll(/\{tab === "(\w+)" && \(<>/g)].map(m => ({
  key: m[1],
  body: page.slice(m.index, (() => {
    const close = page.indexOf("\n        </>)}", m.index);
    return close === -1 ? m.index : close;
  })()),
}));
const panels = {};
for (const p of panelList) panels[p.key] = (panels[p.key] || "") + "\n" + p.body;

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const inTab = (key, needle) => (panels[key] || "").includes(needle);
const whichTab = (needle) => Object.keys(panels).filter(k => inTab(k, needle));

// ---------- the tabs and the panels agree ----------

test("there are four tabs and they are the four agreed", () => {
  assert.deepEqual(ATHLETE_TABS.map(t => t.key), ["overview", "program", "progress", "notes"]);
  for (const t of ATHLETE_TABS) {
    assert.ok(t.label && t.label.trim(), `the ${t.key} tab has no label`);
  }
});

test("every tab has something behind it", () => {
  // A tab with no panel is a button that appears to do nothing.
  for (const t of ATHLETE_TABS) {
    assert.ok(panels[t.key], `nothing is rendered for the "${t.key}" tab`);
    assert.ok(panels[t.key].length > 200, `the "${t.key}" tab's panel is suspiciously empty`);
  }
});

test("no panel is behind a tab that cannot be selected", () => {
  // The silent one: rename a tab key and its whole panel disappears with no
  // error, because `tab` simply never equals the old string again.
  const keys = new Set(ATHLETE_TABS.map(t => t.key));
  for (const rendered of Object.keys(panels)) {
    assert.ok(keys.has(rendered),
      `a panel is keyed "${rendered}", which no tab selects - it can never be shown`);
  }
});

test("the page opens on Overview", () => {
  assert.ok(/const \[tab, setTab\] = useState\("overview"\);/.test(page),
    "the athlete page does not open on the overview");
  assert.equal(ATHLETE_TABS[0].key, "overview");
});

test("the tab bar is rendered, and is driven by the list", () => {
  assert.ok(/<AthleteDetailTabs tab=\{tab\} onChange=\{setTab\} \/>/.test(page),
    "the tabs are not on the page");
  const bar = src.slice(src.indexOf("function AthleteDetailTabs("), src.indexOf("function CoachAthleteDetail("));
  assert.ok(/ATHLETE_TABS\.map/.test(bar),
    "the tab bar writes its own buttons, so it can show a tab that has no panel");
});

// ---------- each section is behind the right tab ----------

const SECTIONS = {
  // needle in the source            -> the tab it belongs behind
  "Client Goals": "overview",
  "Weekly accountability tracker": "overview",
  '<ChalkDivider label="End Coaching" />': "overview",
  '<ChalkDivider label="Assigned Program — Edit" />': "program",
  '<ChalkDivider label="Progress History" />': "progress",
  "<CheckinSummaryPanel": "progress",
  '<ChalkDivider label="Recent Sessions" />': "notes",
  "<SessionLogRow": "notes",
};

test("every section is behind exactly one tab, and the right one", () => {
  for (const [needle, expected] of Object.entries(SECTIONS)) {
    const found = whichTab(needle);
    assert.deepEqual(found, [expected],
      `"${needle}" is behind ${found.length ? found.join(" and ") : "no tab at all"}, expected ${expected}`);
  }
});

test("ending the coaching is not beside the programme editor", () => {
  // It was at the bottom of the one long page, deliberately far from
  // anything routine. Splitting into tabs could easily have dropped it next
  // to the editor's own delete button, which is a different destructive
  // action about a different thing.
  assert.ok(inTab("overview", "Take {athlete.name.split(\" \")[0]} off my roster"),
    "removing an athlete is not on the overview");
  assert.ok(!inTab("program", "off my roster"),
    "removing the athlete sits on the programme tab, beside deleting their programme");
});

test("the programme editor is on one tab, not spread across two", () => {
  // Every modal it opens is outside the panels, which is correct - a modal
  // is not part of a tab - but its controls must not be.
  for (const needle of ["setImportOpen(true)", "setWeeksOpen(true)", "setDeleteProgOpen(true)"]) {
    const found = whichTab(needle);
    assert.ok(found.length <= 1, `${needle} appears on ${found.join(" and ")}`);
    if (found.length) assert.equal(found[0], "program", `${needle} is on the ${found[0]} tab`);
  }
});

// ---------- what stays above the tabs ----------

test("who you are looking at stays visible on every tab", () => {
  // Identity and the three tiles are not one of the things you came to look
  // at; they are the answer to "whose page is this". Behind a tab they would
  // vanish the moment the coach opened the editor.
  const beforeTabs = page.slice(0, page.indexOf("<AthleteDetailTabs"));
  for (const [needle, what] of [
    ['<StatCard icon={Flame} label="Streak"', "the athlete's streak"],
    ["<StatCard icon={Scale}", "their weight"],
    ["{editError && (", "an edit error"],
  ]) {
    assert.ok(beforeTabs.includes(needle), `${what} is below the tab bar`);
    // Position in the file is not the same as being unconditional. Something
    // can sit above the tab bar and still be wrapped in a `tab ===` check.
    assert.deepEqual(whichTab(needle), [], `${what} is inside a tab panel, so it disappears on the others`);
  }
});

test("the tab bar does not squeeze four labels into 320px", () => {
  // Four labels across 320px minus the page gutters is 68px each, and
  // "Overview" does not fit in 68px at a readable size. It scrolls sideways
  // instead of shrinking.
  const bar = src.slice(src.indexOf("function AthleteDetailTabs("), src.indexOf("function CoachAthleteDetail("));
  assert.ok(/overflow-x-auto/.test(bar), "the tab row cannot scroll, so the labels have to shrink");
  assert.ok(/shrink-0/.test(bar), "the tab buttons shrink instead of the row scrolling");
  // Bleeds to the screen edge so a scrolled tab is not clipped by the gutter.
  assert.ok(/-mx-5 px-5/.test(bar), "the scrolling row is clipped by the page gutter");
  // A label that wraps makes one pill taller than the rest and the row ragged.
  assert.ok(/whitespace-nowrap/.test(bar), "a tab label can wrap onto two lines");
  // The padding is load bearing, not taste. At the original px-4 the row was
  // 433px wide and "Notes" sat entirely off a 320px screen with nothing
  // showing that it was there. 11px brings the row to 384px, which leaves a
  // 21px slice of the last pill visible at 320 and fits whole by 390.
  assert.ok(/padding: "9px 11px"/.test(bar),
    "the tab padding changed - re-measure at 320px before accepting this");
  assert.ok(/text-\[12\.5px\]/.test(bar), "the label size changed - re-measure at 320px");
});

test("the selected tab is announced, not only coloured", () => {
  const bar = src.slice(src.indexOf("function AthleteDetailTabs("), src.indexOf("function CoachAthleteDetail("));
  assert.ok(/aria-current=\{on \? "page" : undefined\}/.test(bar),
    "which tab is selected is colour only");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
