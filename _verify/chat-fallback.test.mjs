// The retry that stops a retired model id taking the whole app down.
//
// A model that has been renamed, retired or mistyped comes back from
// Anthropic as a 404. That does not fail for one unlucky athlete: it fails
// for every request at once, and nobody can do anything about it from a
// phone in a gym. One retry on a model we know exists costs a second and
// turns a total outage into a slightly older program.
//
// Exercised rather than grepped. The whole value of this is that it actually
// fires on a 404 and actually does not fire on anything else, and a source
// assertion proves neither.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHAT = path.join(here, "..", "api", "chat.js");
const src = fs.readFileSync(CHAT, "utf8");

process.env.ANTHROPIC_API_KEY = "test-key";
process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_ANON_KEY = "anon-test";

const { default: handler } = await import(CHAT);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// A fetch that answers the auth check, then hands out the queued Anthropic
// replies in order, recording which model each call asked for.
function stubFetch(anthropicReplies) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("supabase.test")) {
      return { ok: true, status: 200, json: async () => ({ id: "user-1" }) };
    }
    const body = JSON.parse(opts.body);
    calls.push(body.model);
    const reply = anthropicReplies.shift();
    return {
      ok: reply.status < 400,
      status: reply.status,
      body: null,
      json: async () => reply.body ?? {},
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };
  return calls;
}

function fakeRes() {
  const out = { code: null, payload: null, headers: {}, ended: false };
  const res = {
    status(c) { out.code = c; return res; },
    json(p) { out.payload = p; out.ended = true; return res; },
    setHeader(k, v) { out.headers[k] = v; },
    end() { out.ended = true; return res; },
    write() { return true; },
  };
  return { res, out };
}

const req = (model, extra = {}) => ({
  method: "POST",
  headers: { authorization: "Bearer token", origin: "https://trained-best.vercel.app" },
  body: { model, messages: [{ role: "user", content: "hi" }], max_tokens: 100, ...extra },
});

const ok = { status: 200, body: { content: [{ type: "text", text: "{}" }] } };
const notFound = { status: 404, body: { error: { type: "not_found_error", message: "model not found" } } };

// ---------- it fires ----------

test("a retired model is retried on one we know exists", () => {
  const calls = stubFetch([notFound, ok]);
  const { res, out } = fakeRes();
  return handler(req("claude-sonnet-5"), res).then(() => {
    assert.deepEqual(calls, ["claude-sonnet-5", "claude-sonnet-4-6"],
      `asked for ${JSON.stringify(calls)} - the retry never happened`);
    assert.equal(out.code, 200, "the athlete still got an error after a successful retry");
  });
});

// ---------- it does not fire when it should not ----------

test("a working model is asked for exactly once", () => {
  const calls = stubFetch([ok]);
  const { res } = fakeRes();
  return handler(req("claude-sonnet-5"), res).then(() => {
    assert.deepEqual(calls, ["claude-sonnet-5"], "a healthy request was sent twice");
  });
});

test("the fallback is not retried against itself", () => {
  // Otherwise a genuinely broken account turns every request into two.
  const calls = stubFetch([notFound]);
  const { res, out } = fakeRes();
  return handler(req("claude-sonnet-4-6"), res).then(() => {
    assert.deepEqual(calls, ["claude-sonnet-4-6"], "the fallback was retried on itself");
    assert.equal(out.code, 404, "the 404 was swallowed instead of being reported");
  });
});

test("other failures are reported, not retried", async () => {
  // A rate limit or a server error says nothing about the model id, and
  // retrying on a different model would hide a real problem behind a
  // quietly-downgraded answer.
  for (const status of [429, 500, 400]) {
    const calls = stubFetch([{ status, body: { error: { message: "nope" } } }]);
    const { res } = fakeRes();
    await handler(req("claude-sonnet-5"), res);
    assert.equal(calls.length, 1, `a ${status} was retried on the fallback`);
  }
});

test("a rejected key is still turned into a 502, after the retry logic", () => {
  // Passing Anthropic's own 401 through makes the client tell the athlete
  // their session expired, which can never fix a bad API key - they would be
  // stuck in a sign-out loop for ever.
  const calls = stubFetch([{ status: 401, body: { error: { message: "bad key" } } }]);
  const { res, out } = fakeRes();
  return handler(req("claude-sonnet-5"), res).then(() => {
    assert.equal(calls.length, 1);
    assert.equal(out.code, 502);
  });
});

// ---------- the shape of it ----------

test("the retry happens before anything is relayed to the client", () => {
  // A streaming request that fell back halfway would send part of an error
  // and then change its mind.
  const retryAt = src.indexOf("response = await callAnthropic(FALLBACK_MODEL)");
  const relayAt = src.indexOf("return await relayStream(");
  assert.ok(retryAt > 0, "the retry is gone");
  assert.ok(relayAt > 0, "the stream relay is gone");
  assert.ok(retryAt < relayAt, "the fallback happens after the response has started being relayed");
});

test("both calls are built the same way, differing only in the model", () => {
  // Two hand-written fetches is how the retry ends up without the auth
  // header, or with the stream flag dropped.
  assert.equal((src.match(/fetch\("https:\/\/api\.anthropic\.com/g) || []).length, 1,
    "the upstream request is written out more than once");
  assert.ok(/const callAnthropic = \(model\) => fetch\(/.test(src),
    "the request is not built in one place");
  assert.ok(/body: JSON\.stringify\(\{ \.\.\.payload, model \}\)/.test(src),
    "the retry does not carry the rest of the payload");
});

test("the timeout fix is still there", () => {
  // The whole reason api/chat.js is the live file and the root copy is not.
  // Losing it brings back "find better signal" on perfectly good wifi.
  assert.ok(/export const config = \{ maxDuration: 300 \}/.test(src), "maxDuration config export is gone");
  assert.ok(/export const maxDuration = 300/.test(src), "the bare maxDuration export is gone");
  assert.ok(/relayStream/.test(src), "streaming is gone");
});

test("a fallback that happened is visible in the log", () => {
  // Reporting the model that was ASKED for makes a silent permanent fallback
  // look exactly like everything working, which is the state you most need
  // to be able to see.
  assert.ok(/servedBy = FALLBACK_MODEL;/.test(src), "nothing records which model answered");
  assert.ok(/AI ok model=\$\{servedBy\}/.test(src), "the success log still reports the model that was asked for");
  assert.ok(/fell back from \$\{payload\.model\}/.test(src), "the log does not say a fallback happened");
});

test("the fallback is a model the gate actually allows", () => {
  // A fallback that is not in ALLOWED_MODELS would be rewritten to the
  // default on the way through and the retry would be a no-op.
  const at = src.indexOf("const ALLOWED_MODELS");
  const list = src.slice(at, src.indexOf("]);", at));
  const fallback = /const FALLBACK_MODEL = "([^"]+)"/.exec(src);
  assert.ok(fallback, "FALLBACK_MODEL is gone");
  assert.ok(list.includes(`"${fallback[1]}"`), `${fallback[1]} is not in ALLOWED_MODELS`);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
