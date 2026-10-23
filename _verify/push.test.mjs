// Phone notifications: the pieces that have to line up across four files.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");
const app = read("src/App.jsx");
const sw = read("public/sw.js");
const fn = read("supabase/functions/send-push/index.ts");
const sql = read("supabase/migrations/007_push_notifications.sql");

let passed = 0;
const tests = [];
const test = (name, f) => tests.push([name, f]);

test("the service worker shows a push and opens the app on tap", () => {
  assert.ok(/addEventListener\("push"/.test(sw), "no push handler");
  assert.ok(/showNotification\(/.test(sw), "a push is received but never shown");
  assert.ok(/addEventListener\("notificationclick"/.test(sw), "tapping the notification does nothing");
});

test("both settings screens offer the switch", () => {
  assert.equal((app.match(/<PhoneNotificationsCard userId=\{state\.me\.id\} \/>/g) || []).length, 2);
});

test("the app subscribes with the key the server hands out and saves the phone", () => {
  assert.ok(/functions\/v1\/send-push\?public-key/.test(app), "the app does not ask the server for its key");
  assert.ok(/pushManager\.subscribe\(\{ userVisibleOnly: true/.test(app), "the phone is never subscribed");
  assert.ok(/from\("push_subscriptions"\)\.upsert/.test(app), "the subscription is not saved");
});

test("no private key lives in the code", () => {
  for (const [name, src] of [["App.jsx", app], ["sw.js", sw], ["send-push", fn]]) {
    assert.ok(!/vapid_private\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/.test(src), `${name} has a hard-coded key`);
  }
  assert.ok(/generateVAPIDKeys\(\)/.test(fn) && /push_config_init/.test(fn), "keys are not generated server-side");
});

test("only the trigger can make the server send", () => {
  assert.ok(/x-push-hook-secret/.test(fn) && /403/.test(fn), "send-push does not check the trigger's secret");
  assert.ok(/after insert on public\.notifications/.test(sql), "nothing fires when a notification is created");
  assert.ok(/force row level security/.test(sql), "push_subscriptions is not locked down");
});

for (const [name, f] of tests) {
  try { await f(); passed++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); }
}
console.log(`${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exitCode = 1;
