// Telling the truth about why a program didn't arrive.
//
// Two real failures sit behind this file.
//
// 1. Every dead request was reported as "your connection dropped — find better
//    signal". A Vercel function killed at its duration cap closes the socket
//    exactly like a phone losing signal does, so athletes sitting on full
//    wifi were sent off to find a better one while the fault was entirely
//    server-side. Three of four signups in early October finished their intake
//    and got no program this way.
//
// 2. A reply cut off at the token ceiling reached the browser's JSON parser as
//    a syntax error, so a known, explainable limit surfaced as gibberish.
//
// The rule these tests hold: never blame the athlete's connection unless the
// browser actually says it is offline.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");

// AI_TIMEOUT_MS is a const and consts are not hoisted, so it has to be
// assembled into the module before the function that reads it.
const H = await load(APP, [
  { name: "AI_TIMEOUT_MS", kind: "const" },
  "aiNetworkError", "readAIStream", "signupNeedsLogin",
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// --- navigator stand-in -----------------------------------------------------
// aiNetworkError reads navigator.onLine. Node has no navigator, and the real
// one is read-only in a browser, so the tests install a writable stub.
const withOnline = (value, fn) => {
  const had = "navigator" in globalThis;
  const prev = had ? globalThis.navigator : undefined;
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: value }, configurable: true, writable: true,
  });
  try { return fn(); }
  finally {
    if (had) Object.defineProperty(globalThis, "navigator", { value: prev, configurable: true, writable: true });
    else delete globalThis.navigator;
  }
};

// Builds a Response-like object carrying the SSE frames the server relays.
const sseResponse = (frames) => {
  const chunks = frames.map(f => new TextEncoder().encode(f));
  let i = 0;
  return {
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }),
      }),
    },
  };
};
const dataFrame = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

// === the lie that started this ==============================================

test("a dead request while the browser is online does NOT blame the connection", () => {
  const err = withOnline(true, () => H.aiNetworkError(2_000, false));
  assert.ok(!/better signal|find signal/i.test(err.message),
    `still telling an online user to find signal: ${err.message}`);
});

test("only a genuinely offline browser is told it is offline", () => {
  const off = withOnline(false, () => H.aiNetworkError(2_000, false));
  assert.match(off.message, /offline/i);
  const on = withOnline(true, () => H.aiNetworkError(2_000, false));
  assert.ok(!/offline/i.test(on.message), `called an online browser offline: ${on.message}`);
});

test("an aborted request is reported as a timeout, not as a network fault", () => {
  const err = withOnline(true, () => H.aiNetworkError(1_000, true));
  assert.match(err.message, /too long|timed out/i);
});

test("a request that ran the full budget is reported as a timeout", () => {
  const err = withOnline(true, () => H.aiNetworkError(H.AI_TIMEOUT_MS, false));
  assert.match(err.message, /too long|timed out/i);
});

test("offline wins over a long elapsed time", () => {
  // A phone that lost signal early still sits there until the timer fires, so
  // elapsed time alone would mislabel the one case we can actually detect.
  const err = withOnline(false, () => H.aiNetworkError(H.AI_TIMEOUT_MS, true));
  assert.match(err.message, /offline/i);
});

test("every network message promises the answers are not lost", () => {
  const cases = [
    withOnline(false, () => H.aiNetworkError(1_000, false)),
    withOnline(true, () => H.aiNetworkError(1_000, false)),
    withOnline(true, () => H.aiNetworkError(1_000, true)),
  ];
  for (const err of cases) {
    assert.match(err.message, /nothing was lost/i, `no reassurance in: ${err.message}`);
  }
});

test("no network message leaks a developer-facing phrase", () => {
  const cases = [
    withOnline(false, () => H.aiNetworkError(1_000, false)),
    withOnline(true, () => H.aiNetworkError(1_000, true)),
    withOnline(true, () => H.aiNetworkError(1_000, false)),
  ];
  for (const err of cases) {
    // \b matters: a bare /ECONN/i also matches the "econn" inside the word
    // "Reconnect", which is ordinary English and exactly what we want to say.
    assert.ok(!/\bfetch\b|TypeError|AbortError|\bECONN|Load failed/i.test(err.message),
      `leaks jargon: ${err.message}`);
  }
});

// === reading the stream =====================================================

test("text chunks are joined in order", async () => {
  const text = await H.readAIStream(sseResponse([
    dataFrame({ t: '{"programName":' }),
    dataFrame({ t: '"Base Camp"}' }),
    dataFrame({ done: true, stop_reason: "end_turn" }),
  ]));
  assert.equal(text, '{"programName":"Base Camp"}');
});

test("a chunk split across two network reads still parses", async () => {
  // The decoder sees arbitrary byte boundaries, not frame boundaries. A frame
  // arriving in halves must be buffered, not dropped.
  const whole = dataFrame({ t: "hello world" }) + dataFrame({ done: true, stop_reason: "end_turn" });
  const cut = Math.floor(whole.length / 3);
  const text = await H.readAIStream(sseResponse([whole.slice(0, cut), whole.slice(cut)]));
  assert.equal(text, "hello world");
});

test("keepalive comments are ignored rather than parsed", async () => {
  const text = await H.readAIStream(sseResponse([
    ": keepalive\n\n",
    dataFrame({ t: "ok" }),
    ": keepalive\n\n",
    dataFrame({ done: true, stop_reason: "end_turn" }),
  ]));
  assert.equal(text, "ok");
});

test("hitting the token ceiling is named, not left to the JSON parser", async () => {
  await assert.rejects(
    H.readAIStream(sseResponse([
      dataFrame({ t: '{"programName":"Cut off here' }),
      dataFrame({ done: true, stop_reason: "max_tokens" }),
    ])),
    (err) => {
      assert.match(err.message, /cut off|room/i);
      assert.ok(!/JSON|Unterminated|position/i.test(err.message), `leaks parser jargon: ${err.message}`);
      return true;
    },
  );
});

test("an error raised mid-stream is surfaced verbatim", async () => {
  // Once the 200 and the headers are gone there is no status code left to
  // carry the reason, so the in-band message is the only thing the athlete
  // can be told. Dropping it would put us back to inventing an explanation.
  await assert.rejects(
    H.readAIStream(sseResponse([
      dataFrame({ t: "partial" }),
      dataFrame({ error: "The AI stopped partway through." }),
    ])),
    /stopped partway/,
  );
});

test("a mid-stream error outranks the text already received", async () => {
  await assert.rejects(
    H.readAIStream(sseResponse([
      dataFrame({ t: '{"programName":"Half a program"}' }),
      dataFrame({ error: "Upstream failed." }),
      dataFrame({ done: true, stop_reason: null }),
    ])),
    /Upstream failed/,
  );
});

test("a stream that carried no text is reported as empty", async () => {
  await assert.rejects(
    H.readAIStream(sseResponse([dataFrame({ done: true, stop_reason: "end_turn", empty: true })])),
    /empty/i,
  );
});

test("whitespace-only output counts as empty", async () => {
  await assert.rejects(
    H.readAIStream(sseResponse([
      dataFrame({ t: "   \n  " }),
      dataFrame({ done: true, stop_reason: "end_turn" }),
    ])),
    /empty/i,
  );
});

test("a malformed frame is skipped rather than killing the whole program", async () => {
  const text = await H.readAIStream(sseResponse([
    dataFrame({ t: "good " }),
    "data: {not json at all\n\n",
    dataFrame({ t: "parts" }),
    dataFrame({ done: true, stop_reason: "end_turn" }),
  ]));
  assert.equal(text, "good parts");
});

test("a program arriving as many small deltas reassembles exactly", async () => {
  const source = JSON.stringify({ programName: "Twelve Week Build", weeks: 12 });
  const frames = [...source].map(ch => dataFrame({ t: ch }));
  frames.push(dataFrame({ done: true, stop_reason: "end_turn" }));
  assert.equal(await H.readAIStream(sseResponse(frames)), source);
});

// === the signup dead end ====================================================

test("an already-registered signup is recognised as a login problem", () => {
  // This is what decides whether the athlete is shown a way out. Both of the
  // real messages that reach it must match, or the "Log in instead" button
  // never renders and they are back to a button that appears to do nothing.
  assert.ok(H.signupNeedsLogin("An account with that email already exists. Try logging in instead."));
  assert.ok(H.signupNeedsLogin("User already registered"));
  assert.ok(H.signupNeedsLogin("already exists"));
});

test("unrelated signup failures do not offer a login route", () => {
  assert.ok(!H.signupNeedsLogin("Password should be at least 6 characters."));
  assert.ok(!H.signupNeedsLogin("Couldn't reach the server."));
  assert.ok(!H.signupNeedsLogin(""));
  assert.ok(!H.signupNeedsLogin(null));
  assert.ok(!H.signupNeedsLogin(undefined));
});

// === where the error is rendered ===========================================
//
// The original bug was not that the error was missing. It was computed, stored
// and rendered — just inside the "Create Account" step body, which is step 1,
// while Finish Setup lives on step 15. State said one thing and the screen
// showed another. A unit test cannot catch that, so this reads the source and
// asserts the error is rendered in the shared step footer, which is on screen
// for every step.
import fs from "node:fs";

test("the signup error is rendered in the shared footer, not only inside one step", () => {
  const src = fs.readFileSync(APP, "utf8");
  const footer = src.indexOf("{submitting ? \"Setting up…\" : isLast ? \"Finish Setup\" : \"Continue\"}");
  assert.ok(footer > 0, "could not locate the Finish Setup button");

  // Look back from the button to the step body it sits under. The error has to
  // live in that window to be visible on the last step.
  const bodyAt = src.lastIndexOf("<OnboardingStepBody", footer);
  assert.ok(bodyAt > 0, "could not locate the step body");
  const window = src.slice(bodyAt, footer);
  assert.ok(/data\.signupError/.test(window),
    "signupError is not rendered between the step body and the Finish Setup button — " +
    "it is back to displaying on a screen the user is not looking at");
});

test("a retry clears the previous signup error", () => {
  const src = fs.readFileSync(APP, "utf8");
  const at = src.indexOf("setSubmitting(true);");
  assert.ok(at > 0, "could not locate the submit block");
  const window = src.slice(at, at + 400);
  assert.ok(/signupError:\s*null/.test(window),
    "a second attempt leaves the first attempt's error on screen");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
