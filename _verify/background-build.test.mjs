// Isaiah, 15 Nov: a program build died when he switched apps ("the request
// timed out"), because it streamed straight to the phone. Builds now run on
// the server (/api/build-program) and the phone checks a program_builds row.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load, readSource } from "./extract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const APP = path.join(root, "src", "App.jsx");
const src = readSource(APP);
const H = await load(APP, [
  { name: "EXERCISES_PER_DAY_GUESS", kind: "const" }, "programBuildProgress", "progressFromCounts",
  { name: "BUILD_STALE_MS", kind: "const" }, "pendingBuildKey",
]);
let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);

// ---------- the server ----------
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.SUPABASE_URL = "https://db.example";
process.env.SUPABASE_ANON_KEY = "anon";
const calls = [];
let anthropicChunks = [];
let existingRunning = [];
let tableMissing = false;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  calls.push({ url, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
  if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }), { status: 200 });
  if (url.includes("/rest/v1/program_builds")) {
    if (tableMissing) return new Response(JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.program_builds'" }), { status: 404 });
    if ((opts.method || "GET") === "GET") return new Response(JSON.stringify(existingRunning), { status: 200 });
    return new Response(null, { status: 201 });
  }
  if (url.includes("api.anthropic.com")) {
    const enc = new TextEncoder();
    const body = new ReadableStream({ start(c) {
      for (const t of anthropicChunks) c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: t } })}\n\n`));
      c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" } })}\n\n`));
      c.close();
    } });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }
  throw new Error("unexpected fetch " + url);
};
const pending = [];
const vf = await import("@vercel/functions");
const mod = await import(path.join(root, "api", "build-program.js"));
function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}
const ID = "22222222-2222-4222-8222-222222222222";
const req = (body) => ({ method: "POST", headers: { authorization: "Bearer user-token" }, body });
const settle = () => new Promise(r => setTimeout(r, 200));

test("answers at once with the build id, then finishes the build on its own", async () => {
  calls.length = 0; existingRunning = []; tableMissing = false;
  anthropicChunks = ['{"programName":"X","days":[{"name":"Day 1","exercises":[{"phase":"compound"}', ']}]}'];
  const res = fakeRes();
  await mod.default(req({ id: ID, messages: [{ role: "user", content: "hi" }], max_tokens: 32000 }), res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.id, ID);
  const insert = calls.find(c => c.method === "POST" && c.url.includes("program_builds"));
  assert.equal(insert.body.status, "running");
  assert.equal(insert.body.id, ID);
  await settle();
  const done = calls.filter(c => c.method === "PATCH").pop();
  assert.equal(done.body.status, "done");
  assert.equal(done.body.result, anthropicChunks.join(""));
  assert.deepEqual(done.body.progress, { days: 1, phases: 1, chars: anthropicChunks.join("").length });
  assert.ok(calls.find(c => c.url.includes("api.anthropic.com")).body.stream === true);
});
test("a second tap while one is running gets the running one, not a second bill", async () => {
  calls.length = 0; existingRunning = [{ id: "33333333-3333-4333-8333-333333333333" }];
  const res = fakeRes();
  await mod.default(req({ id: ID, messages: [{ role: "user", content: "hi" }] }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.id, "33333333-3333-4333-8333-333333333333");
  assert.ok(!calls.some(c => c.url.includes("api.anthropic.com")), "no AI call was made");
});
test("before the table exists it says so, and the app falls back", async () => {
  existingRunning = []; tableMissing = true;
  const res = fakeRes();
  await mod.default(req({ id: ID, messages: [{ role: "user", content: "hi" }] }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "no_table");
  tableMissing = false;
});
test("no sign-in, no build; a bad id is refused", async () => {
  const r1 = fakeRes();
  await mod.default({ method: "POST", headers: {}, body: {} }, r1);
  assert.equal(r1.statusCode, 401);
  const r2 = fakeRes();
  await mod.default(req({ id: "nope", messages: [{ role: "user", content: "x" }] }), r2);
  assert.equal(r2.statusCode, 400);
});
test("the server's counts give the same percentage the phone gave from the text", () => {
  const text = '{"days":[{"exercises":[{"phase":"a"},{"phase":"b"}]},{"exercises":[{"phase":"c"}';
  assert.equal(H.progressFromCounts(mod.progressCounts(text), 4), H.programBuildProgress(text, 4));
  assert.equal(H.progressFromCounts(mod.progressCounts('{"programName":"x"'), 4), H.programBuildProgress('{"programName":"x"', 4));
});

// ---------- the app ----------
test("all three long builds go through the server now", () => {
  assert.equal((src.match(/await callAIBackground\(\{/g) || []).length, 3);
  assert.ok(!/await callAI\(\{\s*messages: \[\{ role: "user", content: buildAIPrompt/.test(src));
});
test("closing the generator and opening it again picks up the same build", () => {
  assert.ok(/if \(readPendingBuild\(buildScope\)\) generate\(\);/.test(src));
  assert.equal(H.pendingBuildKey("athlete:abc"), "tb_build_athlete:abc");
  assert.equal((src.match(/<AIProgramGenerator\s+intake=\{[^\n]*\}\s+athleteId=\{/g) || []).length, 3, "every coach screen says whose build it is");
});
test("quitting the app mid-signup-build finishes it on the next open", () => {
  assert.ok(/if \(!readPendingBuild\(`first:\$\{id\}`\)\) return;/.test(src));
});
test("checks again the moment the app comes back to the front", () => {
  assert.ok(/document\.addEventListener\("visibilitychange", onVis\)/.test(src));
});
test("the migration adds one table, with row level security, and changes nothing else", () => {
  const sql = fs.readFileSync(path.join(root, "supabase", "migrations", "020_program_builds.sql"), "utf8").replace(/--.*$/gm, "");
  assert.match(sql, /create table public\.program_builds/);
  assert.match(sql, /alter table public\.program_builds enable row level security/);
  assert.ok(!/\bdrop\s+(table|column)\b|\bdelete\s+from\b|\btruncate\b/i.test(sql));
  assert.equal((sql.match(/alter table/gi) || []).length, 1, "only the new table is altered");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL  ${name}\n      ${err.stack || err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
