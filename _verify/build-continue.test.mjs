// Isaiah, 24 Nov: Rasaam's program (a fighter, so a big one) stopped after 2
// of its days. Vercel ends a function at 300 seconds. Now a run that is out of
// time saves its text and hands the rest to a fresh run, which carries on.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load, readSource } from "./extract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = readSource(path.join(root, "src", "App.jsx"));
const H = await load(path.join(root, "src", "App.jsx"), [{ name: "BUILD_STALL_MS", kind: "const" }, { name: "BUILD_STALE_MS", kind: "const" }]);
let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);

process.env.ANTHROPIC_API_KEY = "test-key";
process.env.SUPABASE_URL = "https://db.example";
process.env.SUPABASE_ANON_KEY = "anon";
process.env.BUILD_RUN_BUDGET_MS = "250";

const USER = "11111111-1111-4111-8111-111111111111";
const ID = "44444444-4444-4444-8444-444444444444";
let row = null;            // the program_builds row
let anthropic = [];        // queued replies: { chunks, delay, status }
const sent = [];           // what each Anthropic call was given
const handoffs = [];
let mod;

const sse = (chunks, delay) => {
  const enc = new TextEncoder();
  return new ReadableStream({ async start(c) {
    for (const t of chunks) {
      if (delay) await new Promise(r => setTimeout(r, delay));
      try { c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: t } })}\n\n`)); } catch { return; }
    }
    try {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" } })}\n\n`));
      c.close();
    } catch { /* cancelled */ }
  } });
};

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  const method = opts.method || "GET";
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: USER }), { status: 200 });
  if (url.includes("/rest/v1/program_builds")) {
    if (method === "GET") return new Response("[]", { status: 200 });
    if (method === "POST") { row = { ...body, stop_reason: null, result: null }; return new Response(null, { status: 201 }); }
    // PATCH, with the claim filter honoured
    const want = /stop_reason=eq\.([^&]+)/.exec(url)?.[1];
    if (want && row?.stop_reason !== decodeURIComponent(want)) return new Response("[]", { status: 200 });
    Object.assign(row, body);
    return new Response(want ? JSON.stringify([row]) : null, { status: want ? 200 : 204 });
  }
  if (url.includes("api.anthropic.com")) {
    sent.push(body);
    const next = anthropic.shift();
    if (next.status) return new Response(JSON.stringify({ error: { message: "no prefill" } }), { status: next.status });
    return new Response(sse(next.chunks, next.delay), { status: 200 });
  }
  if (url.endsWith("/api/build-program")) {
    handoffs.push(body);
    const res = fakeRes();
    await mod.default({ method: "POST", headers: { authorization: opts.headers.Authorization, host: "trained.test" }, body }, res);
    return new Response(JSON.stringify(res.body), { status: res.statusCode });
  }
  throw new Error("unexpected fetch " + url);
};
mod = await import(path.join(root, "api", "build-program.js"));
function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}
const start = (extra = {}) => mod.default({ method: "POST", headers: { authorization: "Bearer user-token", host: "trained.test" },
  body: { id: ID, messages: [{ role: "user", content: "build it" }], model: "claude-sonnet-5", max_tokens: 32000, ...extra } }, fakeRes());
const until = async (fn, ms = 4000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error("timed out waiting"); await new Promise(r => setTimeout(r, 20)); } };
const reset = () => { row = null; sent.length = 0; handoffs.length = 0; };

test("a build that runs out of time hands off and finishes in a fresh run", async () => {
  reset();
  const slow = Array.from({ length: 20 }, (_, i) => `[${i}]`);
  anthropic = [{ chunks: slow, delay: 40 }, { chunks: ["<rest>"], delay: 0 }];
  await start();
  await until(() => row?.status === "done");
  assert.equal(handoffs.length, 1, "one hand-off");
  assert.equal(handoffs[0].hop, 1);
  const first = sent[0].messages, second = sent[1].messages;
  assert.equal(first.length, 1);
  assert.equal(second.at(-1).role, "assistant", "the next run carries on from the text so far");
  assert.ok(row.result.endsWith("<rest>"));
  assert.equal(row.result, second.at(-1).content + "<rest>", "nothing lost or doubled at the join");
  assert.equal(row.stop_reason, "end_turn");
});

test("a model that won't take a started reply is told to continue instead", async () => {
  reset();
  anthropic = [{ chunks: Array.from({ length: 20 }, (_, i) => `{"d":${i}}`), delay: 40 }, { status: 400 }, { chunks: ['```json\n{"d":19}', '{"end":1}'], delay: 0 }];
  await start();
  await until(() => row?.status === "done");
  assert.equal(sent[2].messages.at(-1).role, "user");
  assert.match(sent[2].messages.at(-1).content, /Continue it from exactly the next character/);
  assert.ok(row.result.endsWith('{"end":1}'));
  assert.ok(!row.result.includes("```"), "fence taken off");
});

test("a hand-off can only be claimed once, and only by the build's owner", async () => {
  reset();
  anthropic = [{ chunks: ["x"], delay: 0 }];
  await start();
  await until(() => row?.status === "done");
  const r = fakeRes();
  await mod.default({ method: "POST", headers: { authorization: "Bearer user-token", host: "trained.test" },
    body: { id: ID, continueBuild: true, hop: 1, messages: [{ role: "user", content: "x" }] } }, r);
  assert.equal(r.statusCode, 409, "nothing waiting to continue");
  const r2 = fakeRes();
  await mod.default({ method: "POST", headers: { authorization: "Bearer user-token", host: "trained.test" },
    body: { id: ID, continueBuild: true, hop: 9, messages: [{ role: "user", content: "x" }] } }, r2);
  assert.equal(r2.statusCode, 400);
});

test("joining a told-to-continue reply drops what it repeated", () => {
  assert.equal(mod.joinContinuation('{"a":"hello world, more', 'hello world, more text"}', true), '{"a":"hello world, more text"}');
  assert.equal(mod.joinContinuation("abc", "def", false), "abcdef");
});

test("the phone judges a build by whether it is moving, and restarts a dead one once", () => {
  assert.equal(H.BUILD_STALL_MS, 150_000);
  assert.ok(H.BUILD_STALE_MS >= 20 * 60_000, "long enough for the hand-offs");
  assert.ok(src.includes("if (!err?.stalled) throw err;"));
  assert.ok(src.includes("return startOrResumeBuild(opts, true);"));
  assert.ok(src.includes("...(fresh ? { fresh: true } : {})"));
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL  ${name}\n      ${err.stack}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
setTimeout(() => process.exit(process.exitCode || 0), 50);
