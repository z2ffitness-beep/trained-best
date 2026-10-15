// Finds hooks called after an early return.
//
// React counts hooks per render. A hook below `if (!day) return ...` runs on
// some renders and not others, and the app crashes with "rendered fewer hooks
// than expected". This has reached production twice, and a third instance was
// caught in review in brand-new code - so it is checked mechanically now
// rather than remembered.
//
// Deliberately simple: it reads top-level component bodies at two-space
// indentation, which is how every component in App.jsx is written. It will
// not catch a hook inside a nested condition, but it catches the pattern that
// has actually broken this app.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.env.HOOKS_CHECK_FILE || path.join(here, "..", "src", "App.jsx");
const lines = fs.readFileSync(target, "utf8").split("\n");

const HOOK = /^  (?:const|let)\s+[^=]+=\s*(use[A-Z]\w*)\(|^  (use[A-Z]\w*)\(/;
const problems = [];
let component = null, earlyReturnAt = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const start = line.match(/^(?:export default )?function ([A-Z]\w*)\s*\(/);
  if (start) { component = start[1]; earlyReturnAt = null; continue; }
  if (line === "}") { component = null; continue; }
  if (!component) continue;

  if (earlyReturnAt == null && /^  if \(.*\)\s*return\b/.test(line)) earlyReturnAt = i + 1;
  if (earlyReturnAt == null && /^  if \(.*\)\s*\{\s*$/.test(line)) {
    // A block-form early return: an `if` at body level whose block returns.
    for (let j = i + 1; j < lines.length && !/^  \}/.test(lines[j]); j++) {
      if (/^    return\b/.test(lines[j])) { earlyReturnAt = i + 1; break; }
    }
  }

  const hook = line.match(HOOK);
  if (hook && earlyReturnAt != null) {
    problems.push(`${component}: ${hook[1] || hook[2]} at line ${i + 1} is below the early return at line ${earlyReturnAt}`);
  }
}

if (problems.length) {
  for (const p of problems) console.error("✖ " + p);
  process.exitCode = 1;
} else {
  console.log("clean — no hook below an early return");
}
