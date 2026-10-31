// Every notification kind the app shows has to be allowed by the database's
// check on notifications.kind. 009 and 012 added kinds without widening it,
// so their inserts failed (013 fixed that). This keeps it from happening again.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "src", "App.jsx"), "utf8");
const dir = path.join(here, "..", "supabase", "migrations");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

// The newest migration that sets the check is the one in force.
let allowed = null;
for (const f of files) {
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  const m = sql.match(/add constraint notifications_kind_check[\s\S]*?array\[([\s\S]*?)\]/);
  if (m) allowed = new Set([...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]));
}
assert.ok(allowed, "no migration sets notifications_kind_check");

const shown = [...src.matchAll(/n\?\.kind === "([a-z_]+)"/g)].map(m => m[1]);
const inserted = files.flatMap(f => {
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  return [...sql.matchAll(/insert into public\.notifications[\s\S]*?values\s*\([\s\S]*?'([a-z_]+)'/g)].map(m => m[1]);
});

const missing = [...new Set([...shown, ...inserted])].filter(k => !allowed.has(k));
assert.deepEqual(missing, [], `kinds the database would refuse: ${missing.join(", ")}`);
console.log(`1/1 passed (${allowed.size} kinds allowed)`);
