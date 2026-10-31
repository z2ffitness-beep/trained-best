// The coach's brand colour becomes the app's accent (Isaiah, 28 Oct). Any
// colour can be picked, so it has to be made readable: white text on it, and
// the colour itself on a dark page.
import assert from "node:assert/strict";
import { load } from "./extract.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = fs.readFileSync(APP, "utf8");
const H = await load(APP, ["hexToRgb", "rgbToHex", "relativeLuminance", "mixRgb", "readableAccent"]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);
const L = (hex) => H.relativeLuminance(H.hexToRgb(hex));
const contrast = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test("white text stays readable on any brand colour", () => {
  for (const hex of ["#E7EBF2", "#FFFF00", "#F0A93C", "#2BC47A", "#FFFFFF", "#7C5CFC", "#2E86FF"]) {
    for (const theme of ["light", "dark"]) {
      const a = H.readableAccent(hex, theme);
      assert.ok(contrast(a, "#FFFFFF") >= 3, `${hex} in ${theme} became ${a}, too light for white text`);
    }
  }
});

test("a very dark brand colour still shows on the dark theme", () => {
  for (const hex of ["#000000", "#0A1020", "#1B1B3A"]) {
    const a = H.readableAccent(hex, "dark");
    assert.ok(contrast(a, "#0A1020") >= 3, `${hex} became ${a}, lost on the navy`);
  }
});

test("a colour that already works is left exactly as picked", () => {
  assert.equal(H.readableAccent("#1F6FE8", "light"), "#1F6FE8");
  assert.equal(H.readableAccent("#1F6FE8", "dark"), "#1F6FE8");
});

test("rubbish in, nothing applied", () => {
  assert.equal(H.readableAccent("blue", "light"), null);
  assert.equal(H.readableAccent(null, "dark"), null);
});

test("the brand hook sits above the shell's early returns", () => {
  const at = src.indexOf("useEffect(() => {\n    if (!brandReady) return;");
  const firstReturn = src.indexOf("  const { pending: pendingSessions");
  assert.ok(at > 0 && at < firstReturn);
});

test("deleting an account forgets the brand on the phone", () => {
  const d = src.slice(src.indexOf("function DeleteAccountModal("), src.indexOf("function CoachProfile("));
  assert.match(d, /rememberBrand\(null\);/);
});

test("the join link carries the code, and only fills it in for a new signup", () => {
  assert.match(src, /\/\?join=\$\{code \|\| ""\}/);
  assert.match(src, /\.\.\.\(joinCodeFromLink\(\) \? \{ inviteCode: joinCodeFromLink\(\) \} : \{\}\)/);
  assert.match(src, /auth\?\.session \? null : supabase\.rpc\("coach_by_invite_code"/);
  assert.match(src, /savedProfile = inserted;\n        try \{ localStorage\.removeItem\(JOIN_CODE_KEY\); \}/);
});

test("the athlete Profile has no Recent Sessions list", () => {
  const p = src.slice(src.indexOf("function AthleteProfile("), src.indexOf("\n}\n", src.indexOf("function AthleteProfile(")));
  assert.ok(!/label="Recent Sessions"/.test(p));
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`✖ ${name}\n  ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
