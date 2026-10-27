// The athlete bar after Workout was folded into Program, and the cards a new
// athlete sees once.
//
// Two separate risks here.
//
// The bar: `athlete-workout` is a ROUTE as well as a tab, and eight places in
// the app link to it — the card on Home, every day on the Program screen, the
// due-session reminder, the retry buttons on a failed generation. Dropping the
// tab must not drop the route, or all eight become dead ends. And a screen
// with no tab of its own falls back to the bar's first item, which would have
// lit up Home underneath somebody mid-workout.
//
// The cards: they are shown once. Anything that can make them come back —
// storage that throws, a second device, an athlete who has been training for
// a month — is a bug the athlete cannot do anything about.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// tourCards names icon components, which are imports rather than part of the
// extracted slice. Stand-ins let the card data be inspected.
globalThis.Dumbbell = "Dumbbell";
globalThis.CheckCircle2 = "CheckCircle2";
globalThis.Calendar = "Calendar";
globalThis.Bell = "Bell";
globalThis.Sparkles = "Sparkles";

const H = await load(APP, [
  { name: "NAV_PARENT", kind: "const" },
  { name: "TOUR_SEEN_KEY", kind: "const" },
  "tourCards",
  "tourAlreadySeen",
  "markTourSeen",
]);

// ---------- the bar ----------

test("Workout is no longer a tab", () => {
  assert.ok(!/\{ key: "athlete-workout", label: "Workout"/.test(src),
    "the tab is back, so the bar is seven items again");
});

test("but the workout screen is still routable", () => {
  // The tab went; the page must not. Everything that links to it keeps working.
  assert.ok(/"athlete-workout": <Workout /.test(src),
    "the route was removed along with the tab, so every link to it is now a dead end");
});

test("every existing way into a workout still points somewhere real", () => {
  const links = src.match(/nav\.go\("athlete-workout"/g) || [];
  assert.ok(links.length >= 6,
    `only ${links.length} links into the workout screen — entry points were lost with the tab`);
});

test("My Workout is a tab, because it is the way in", () => {
  // Renamed from Program on 26 Oct: the tab now opens today's workout.
  assert.ok(/\{ key: "athlete-program", label: "My Workout"/.test(src));
});

test("running a workout lights up Program, not Home", () => {
  assert.equal(H.NAV_PARENT["athlete-workout"], "athlete-program");
});

test("the bar resolves a tabless screen to its parent", () => {
  assert.ok(/navItems\.find\(i => i\.key === NAV_PARENT\[view\]\) \? NAV_PARENT\[view\]/.test(src),
    "the parent lookup is gone, so the bar falls back to its first item");
});

test("an unknown screen still falls back rather than lighting nothing", () => {
  assert.equal(H.NAV_PARENT["something-else"], undefined);
  assert.ok(/: navItems\[0\]\.key;/.test(src), "the final fallback was removed");
});

// ---------- today, pinned ----------

test("the My Workout tab opens today's session, or says there is none", () => {
  // Isaiah, 26 Oct: no My Program | My Workout switch. The tab goes straight
  // to today's workout; a day with nothing scheduled says so.
  const at = src.indexOf("function MyWorkoutTab");
  assert.ok(at > 0, "the My Workout tab is gone");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/isDayScheduledOn\(d, todayIso\)/.test(body), "nothing works out which session is today");
  assert.ok(/<Workout [^>]*dayId=\{today\.id\}/.test(body), "My Workout does not open today's session");
  assert.ok(/No workout today/.test(body), "a rest day has no message");
  // 27 Oct: a workout already logged today is not reopened.
  assert.ok(/You're done for today/.test(body), "a finished day has no message");
  assert.ok(/today && !done/.test(body), "a finished workout would open again");
  assert.ok(/onExit=\{\(\) => setDone\(true\)\}/.test(body), "Done on the summary does not lead to the done state");
  assert.ok(!/Back to My Program/.test(src), "the summary still points at a screen that no longer exists");
  assert.ok(/"athlete-program": <MyWorkoutTab /.test(src), "the tab does not route to My Workout");
  assert.ok(!/function ProgramWorkoutTabs/.test(src), "the My Program | My Workout switch is back");
});

// ---------- the cards ----------

test("four cards, whether or not there is a coach", () => {
  assert.equal(H.tourCards(true).length, 4);
  assert.equal(H.tourCards(false).length, 4);
});

test("a self-guided athlete is never told to message a coach", () => {
  // The bar they see has no Book and no Coach thread. Describing them is how
  // an app teaches somebody on their first screen that it is not to be
  // trusted.
  const solo = JSON.stringify(H.tourCards(false));
  assert.ok(!/your coach/i.test(solo), `self-guided cards mention a coach: ${solo}`);
  assert.ok(!/\bBook\b/.test(solo), "self-guided cards point at a Book tab they do not have");
});

test("a coached athlete is told about the coach half", () => {
  const coached = JSON.stringify(H.tourCards(true));
  assert.ok(/coach/i.test(coached));
});

test("every card has something to show and something to say", () => {
  for (const hasCoach of [true, false]) {
    for (const c of H.tourCards(hasCoach)) {
      assert.ok(c.key, "a card with no key makes React reuse the wrong node");
      assert.ok(c.icon, `${c.key} has no icon`);
      assert.ok(c.title && c.title.length > 3, `${c.key} has no title`);
      assert.ok(c.body && c.body.length > 20, `${c.key} has no body`);
    }
  }
});

test("the cards point at Program, which is where training now lives", () => {
  const both = JSON.stringify(H.tourCards(true)) + JSON.stringify(H.tourCards(false));
  assert.ok(/Program/.test(both), "the first card does not say where the training is");
  assert.ok(!/Workout tab/i.test(both), "the cards still describe a tab that no longer exists");
});

// ---------- shown once ----------

const withStorage = (store, fn) => {
  const had = "localStorage" in globalThis;
  const prev = had ? globalThis.localStorage : undefined;
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true, writable: true });
  try { return fn(); }
  finally {
    if (had) Object.defineProperty(globalThis, "localStorage", { value: prev, configurable: true, writable: true });
    else delete globalThis.localStorage;
  }
};
const fakeStore = () => {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
};
const throwingStore = () => ({
  getItem() { throw new Error("storage blocked"); },
  setItem() { throw new Error("storage blocked"); },
});

test("a fresh athlete has not seen it", () => {
  withStorage(fakeStore(), () => {
    assert.equal(H.tourAlreadySeen("user-1"), false);
  });
});

test("finishing it means it never comes back", () => {
  const store = fakeStore();
  withStorage(store, () => {
    H.markTourSeen("user-1");
    assert.equal(H.tourAlreadySeen("user-1"), true);
  });
});

test("one account finishing it does not silence another", () => {
  const store = fakeStore();
  withStorage(store, () => {
    H.markTourSeen("user-1");
    assert.equal(H.tourAlreadySeen("user-2"), false);
  });
});

test("no signed-in id means no tour rather than an undismissable one", () => {
  // Without an id there is nothing to write the flag against, so showing it
  // would mean showing it again on every single launch.
  withStorage(fakeStore(), () => {
    assert.equal(H.tourAlreadySeen(null), true);
    assert.equal(H.tourAlreadySeen(undefined), true);
    assert.equal(H.tourAlreadySeen(""), true);
  });
});

test("blocked storage never throws its way into the app", () => {
  withStorage(throwingStore(), () => {
    assert.doesNotThrow(() => H.tourAlreadySeen("user-1"));
    assert.doesNotThrow(() => H.markTourSeen("user-1"));
  });
});

test("the decision is taken once per session, not on every render", () => {
  // With storage blocked the flag can never be written, so a re-decide on each
  // render would put the cards back over the app for ever.
  assert.ok(/const tourDecided = useRef\(false\)/.test(src), "nothing latches the decision");
  assert.ok(/if \(tourDecided\.current\) return;/.test(src), "the latch is never read");
});

test("a coach is not shown the athlete's cards", () => {
  assert.ok(/if \(!authed \|\| authed === "coach" \|\| !id\) return;/.test(src),
    "a coach gets a tour about booking sessions with themselves");
});

test("someone already training is not treated as a beginner", () => {
  assert.ok(/\(state\.workoutLogs \|\| \[\]\)\.length === 0 && !tourAlreadySeen\(id\)/.test(src),
    "an athlete a month in gets the intro again on a new phone");
});

test("skipping counts as finishing", () => {
  const at = src.indexOf("function FirstRunTour");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.ok(/onClick=\{onDone\}/.test(body), "Skip does not dismiss it for good");
  assert.ok(/markTourSeen\(state\.me\?\.id\)/.test(src), "dismissing never records that it was seen");
});

// ---------- the dashboard leads with the session ----------

const dashboard = () => {
  const at = src.indexOf("function AthleteDashboard");
  assert.ok(at > 0, "AthleteDashboard is gone");
  return src.slice(at, src.indexOf("\n}\n", at));
};

test("the reminder banners are gone", () => {
  // Three stacked pills that restated what the session card already showed,
  // pushing the one thing an athlete opens this screen for below the fold.
  // Matched on the code that would build them, not on the words: the comment
  // explaining why they went still names all three, and a prose match would
  // fail against its own documentation.
  const body = dashboard();
  assert.ok(!/reminders\.push/.test(body), "the banner list is being built again");
  assert.ok(!/reminders\.map/.test(body), "something still renders a banner list");
  assert.ok(!/text: `You train today/.test(body), "the 'you train today' pill is back");
  assert.ok(!/is ready to begin\. Hit Start Workout/.test(body), "the 'ready to begin' pill is back");
  assert.ok(!/final stretch of your program/.test(body), "the final-stretch pill is back");
});

test("Today's Workout is the first thing under the greeting", () => {
  // Anchored on the rendered title, not the phrase: the comment above explains
  // why the banners went and names the panel, so a loose match would measure
  // from the comment instead of from the markup.
  const body = dashboard();
  const session = body.indexOf(">Today's Workout</div>");
  const stats = body.indexOf('label="Workouts"');
  assert.ok(session > 0, "the session panel is gone");
  assert.ok(stats > session, "the stat tiles come before the session");
});

test("the check-in moved below the session rather than being deleted", () => {
  // It carries the Confirm button, and confirming is what tells the coach the
  // athlete turned up. Losing it would quietly undo that.
  const body = dashboard();
  assert.ok(/const checkinCard = accountabilityOn && todayDay \? \(/.test(body),
    "the check-in card is gone, and with it the coach's record that anybody showed up");
  assert.ok(/confirmCheckin/.test(body), "the Confirm button no longer confirms anything");
  const decl = body.indexOf("const checkinCard");
  const rendered = body.indexOf("{checkinCard}");
  assert.ok(rendered > decl, "the card is never rendered");
});

test("the check-in still only appears when the coach asked for it", () => {
  const body = dashboard();
  assert.ok(/checkinCard = accountabilityOn && todayDay/.test(body),
    "it now shows to athletes whose coach switched check-offs off");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
