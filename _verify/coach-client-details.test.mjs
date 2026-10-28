// A coach updating a client's goals, injuries, training days and body
// metrics (Isaiah, 28 Oct), through coach_update_athlete (migration 014).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "src", "App.jsx"), "utf8");
const sql = fs.readFileSync(path.join(here, "..", "supabase", "migrations", "014_coach_edit_client_details.sql"), "utf8");

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);
const body = (name) => {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i > 0, `${name} is missing`);
  return src.slice(i, src.indexOf("\n}\n", i));
};

test("the editor reuses the signup questions, so answers keep the shape the builder reads", () => {
  for (const step of ["🎯 Goals", "🩹 Injuries", "📅 Training Schedule", "📏 Height", "⚖️ Weight"]) {
    assert.ok(src.includes(`"${step}"`) && /steps: \[/.test(src), `${step} missing`);
  }
  assert.match(body("CoachClientDetailsModal"), /<OnboardingStepBody role="athlete"/);
});

test("it saves through the one function, never a direct profile update", () => {
  const b = body("CoachClientDetailsModal");
  assert.match(b, /supabase\.rpc\("coach_update_athlete"/);
  assert.ok(!/from\("profiles"\)/.test(b));
});

test("every intake key the editor sends is one the function accepts", () => {
  const b = body("CoachClientDetailsModal");
  const sent = [...b.slice(b.indexOf("const intake = {"), b.indexOf("};", b.indexOf("const intake = {"))).matchAll(/\b([A-Za-z]+):/g)].map(m => m[1]);
  const allowed = sql.match(/v_allowed constant text\[\] := array\[([\s\S]*?)\]/)[1];
  for (const k of sent) assert.ok(allowed.includes(`'${k}'`), `${k} would be dropped by the database`);
});

test("only this athlete's coach, and nothing but the listed fields", () => {
  assert.match(sql, /where id = p_athlete_id and coach_id = auth\.uid\(\)/);
  assert.match(sql, /where key = any\(v_allowed\)/);
  assert.ok(!/set\s+(name|role|coach_id)\s*=/.test(sql), "the function changes identity fields");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`✖ ${name}\n  ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
