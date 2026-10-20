// Proves tdz.mjs both catches the real bug and stays quiet on the patterns
// that look like it but are fine.
//
// A checker nobody has watched fail is not a checker. scope.mjs passed a
// clean file twice while being completely broken, which is how this habit
// started: every check in this folder gets deliberately fed something broken
// and has to notice.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CHECK = path.join(HERE, "tdz.mjs");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tdz-"));

const run = (name, code) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, code);
  try {
    execFileSync("node", [CHECK, file], { stdio: "pipe" });
    return { failed: false, out: "" };
  } catch (err) {
    return { failed: true, out: String(err.stdout) + String(err.stderr) };
  }
};

const cases = [
  // ---- must be caught ----
  ["the exact 20 Oct bug: read above the declaration, same body", true, `
    function Screen(program) {
      const start = weekStart(program, shownWeek);
      const shownWeek = Math.min(program.weeks, 1);
      return start + shownWeek;
    }
  `],
  ["read above the declaration with a whole block in between", true, `
    function f() {
      if (true) { console.log(total); }
      const total = 1;
      return total;
    }
  `],
  ["a destructured const read above its own line", true, `
    function f(res) {
      console.log(rows);
      const { rows } = res;
      return rows;
    }
  `],
  ["a let, not just a const", true, `
    function f() {
      const a = n + 1;
      let n = 2;
      return a;
    }
  `],
  ["read inside a loop body above the declaration", true, `
    function f(xs) {
      for (const x of xs) { use(limit, x); }
      const limit = 3;
      return limit;
    }
  `],

  // ---- must NOT be caught ----
  ["a callback that runs later may mention a later const", false, `
    function f() {
      const onTap = () => total * 2;
      const total = 5;
      return onTap();
    }
  `],
  ["a hoisted function declaration may mention a later const", false, `
    function outer() {
      function helper() { return cap; }
      const cap = 10;
      return helper();
    }
  `],
  ["shorthand destructuring is a binding, not a read", false, `
    async function f(db) {
      const { data, error } = await db.get();
      return error || data;
    }
  `],
  ["a property named like a variable is not a read", false, `
    function f(obj) {
      const out = { total: obj.total };
      const total = 1;
      return [out, total];
    }
  `],
  ["var is genuinely hoisted and readable early", false, `
    function f() {
      const a = typeof n;
      var n = 1;
      return a + n;
    }
  `],
  ["a JSX component defined further down the module", false, `
    function Page() { return <Row />; }
    const Row = () => <div className="x">hi</div>;
  `],
  ["correct order, the fix that shipped", false, `
    function Screen(program) {
      const shownWeek = Math.min(program.weeks, 1);
      const start = weekStart(program, shownWeek);
      return start + shownWeek;
    }
  `],
];

let pass = 0, fail = 0;
cases.forEach(([label, shouldFail, code], i) => {
  const r = run(`case${i}.jsx`, code);
  if (r.failed === shouldFail) { pass++; return; }
  fail++;
  console.error(
    `FAIL  ${label}\n` +
    `      expected the check to ${shouldFail ? "CATCH this" : "stay quiet"}, and it did not.\n` +
    (r.out ? `      it said: ${r.out.trim().split("\n")[0]}\n` : "")
  );
});

fs.rmSync(dir, { recursive: true, force: true });
if (fail) {
  console.error(`\ntdz self-test: ${fail} of ${cases.length} wrong.`);
  process.exit(1);
}
console.log(`tdz self-test clean — ${pass} cases, 5 real bugs caught, 7 lookalikes correctly ignored`);
