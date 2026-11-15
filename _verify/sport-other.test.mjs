// Isaiah, 15 Nov: looking for jiu-jitsu he picked another sport and was asked
// when his season ends, with no way to say it doesn't. Fighters have fights,
// not seasons. And "Other" should ask for the sport by name, and the program
// should be built for THAT sport.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "SPORTS", kind: "const" }, { name: "SPORT_LABELS", kind: "const" }, { name: "SPORT_SEASONS", kind: "const" },
  { name: "COMBAT_WORDS", kind: "const" }, { name: "SPORT_ALIASES", kind: "const" },
  "routeTypedSport", "sportNameOf", "isCombatFocus", "focusTypeOf", "focusComplete",
  "sportProfileApplies", "sportProgramOn", "sportPromptBlock",
]);
let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);

test("the dropdown names the combat disciplines, but stores the plain value", () => {
  assert.match(H.SPORT_LABELS["Combat Sports"], /BJJ/);
  assert.match(H.SPORT_LABELS["Combat Sports"], /boxing/);
  assert.ok(H.SPORTS.includes("Combat Sports"));
  assert.ok(src.includes("<option key={o} value={o}>{SPORT_LABELS[o] || o}</option>"));
});
test("a combat sport typed under Other moves to Combat Sports, keeping what they typed", () => {
  for (const t of ["Jiu-jitsu", "jujitsu", "BJJ", "Muay Thai", "boxing", "Wrestling", "MMA", "judo", "Brazilian jiu jitsu"]) {
    const r = H.routeTypedSport(t);
    assert.equal(r?.focus, "Combat Sports", t);
    assert.equal(r.discipline, t.trim());
  }
});
test("a sport the list already has is picked from the list", () => {
  assert.equal(H.routeTypedSport("hockey").focus, "Ice Hockey");
  assert.equal(H.routeTypedSport("Soccer").focus, "Soccer");
  assert.equal(H.routeTypedSport("marathon").focus, "Distance Running or Triathlon");
});
test("anything else stays Other, under the name they typed", () => {
  assert.equal(H.routeTypedSport("Rowing"), null);
  assert.equal(H.routeTypedSport("Ultimate frisbee"), null);
  assert.equal(H.sportNameOf({ "🥊 Sport / Focus": "Other", sportOther: " Rowing " }), "Rowing");
  assert.equal(H.sportNameOf({ "🥊 Sport / Focus": "Soccer" }), "Soccer");
});
test("Other asks no season questions until the sport has a name, and a fighter never sees them", () => {
  const d = { focusType: "sport", "🥊 Sport / Focus": "Other" };
  assert.equal(H.sportProfileApplies(d), false);
  assert.equal(H.sportProfileApplies({ ...d, sportOther: "Rowing" }), true);
  assert.ok(src.includes('if (r?.focus === "Combat Sports") {'), "combat moves while typing");
});
test("Other can't move on without the sport's name", () => {
  const d = { focusType: "sport", "🥊 Sport / Focus": "Other" };
  assert.equal(H.focusComplete(d), false);
  assert.equal(H.focusComplete({ ...d, sportOther: "Rowing" }), true);
});
test("the program is built for the sport they typed", () => {
  const block = H.sportPromptBlock({ focusType: "sport", "🥊 Sport / Focus": "Other", sportOther: "Rowing", sportSeason: "In season" });
  assert.match(block, /Rowing athlete/);
  assert.match(block, /typed "Rowing"/);
  assert.ok(!/ Other /.test(block));
});
test("Year-round is a season answer, with its own coaching", () => {
  assert.ok(H.SPORT_SEASONS.some(o => o.key === "Year-round"));
  const block = H.sportPromptBlock({ focusType: "sport", "🥊 Sport / Focus": "Tennis", sportSeason: "Year-round" });
  assert.match(block, /YEAR-ROUND/);
});
test("in season with no set end date is an answer, and the generator hears it", () => {
  assert.ok(src.includes(">No set end date</button>"));
  const block = H.sportPromptBlock({ focusType: "sport", "🥊 Sport / Focus": "Soccer", sportSeason: "In season", sportSeasonOpen: true });
  assert.match(block, /no set end date/);
});
test("fighters say whether a fight is booked; none booked gets a between-fights program", () => {
  assert.ok(src.includes('[["Fight booked", true], ["No fight booked yet", false]]'));
  assert.ok(/BETWEEN FIGHTS/.test(src));
  assert.ok(/intake\.isFighter && !intake\.fightDate\) \{\s*return `BETWEEN FIGHTS/.test(src));
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
