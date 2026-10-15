// Finds work that was written but never connected.
//
// A component that is defined and never rendered, or a state setter that is
// never called, is valid code that type-checks, builds and passes every test —
// and does nothing. That is exactly how a "delete athlete" modal once shipped
// with no button to open it: a patch script threw partway through, half the
// change landed, and every check still came back green.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "src", "App.jsx"), "utf8");

// Components are capitalised function declarations. The app's entry point is
// rendered by main.jsx rather than from inside this file.
const ENTRY = new Set(["App"]);

const problems = [];

const components = [...src.matchAll(/^function ([A-Z]\w*)\s*\(/gm)].map(m => m[1]);
for (const name of components) {
  if (ENTRY.has(name)) continue;
  const used = new RegExp(`<${name}[\\s/>]`).test(src) ||
               new RegExp(`\\b${name}\\s*\\(`).test(src.replace(new RegExp(`function ${name}\\s*\\(`, "g"), "")) ||
               new RegExp(`[:=]\\s*${name}\\b`).test(src);
  if (!used) problems.push(`component ${name} is defined but never rendered`);
}

// A setter with no call site means the state it guards can never change.
const setters = [...src.matchAll(/const \[\w+, (set[A-Z]\w*)\] = useState/g)].map(m => m[1]);
for (const name of setters) {
  // Counts every reference, not just direct calls: a setter handed straight
  // to a child as `onChange={setUnit}` is wired up perfectly well.
  const refs = [...src.matchAll(new RegExp(`\\b${name}\\b`, "g"))].length;
  const calls = refs - [...src.matchAll(new RegExp(`, ${name}\\] = useState`, "g"))].length;
  const declarations = [...src.matchAll(new RegExp(`, ${name}\\] = useState`, "g"))].length;
  if (calls === 0) problems.push(`${name} is declared but never called`);
  // Same setter name declared in two components is fine; zero calls is not.
  void declarations;
}

if (problems.length) {
  for (const p of problems) console.error("✖ " + p);
  process.exitCode = 1;
} else {
  console.log(`clean — ${components.length} components, ${setters.length} state setters`);
}
