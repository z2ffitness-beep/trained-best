// Does anything in App.jsx reference a variable that is not in scope?
//
// On 20 Oct the app crashed for every person who got past the role picker:
//
//     Can't find variable: SIGNUP_V2_SECTIONS
//
// SIGNUP_KEYS, SIGNUP_V2_STEPS, SIGNUP_V2_SECTIONS, SIGNUP_V2 and
// stepComplete had all been written INSIDE the Onboarding component. They
// were written at column 0, so they read as module level to every human who
// looked at them, including the person who put them there. stepComplete
// lived in the same scope and resolved fine. OnboardingStepBodyRest is a
// separate function and could see none of it.
//
// Nothing caught it, and the reasons are worth keeping:
//
//   * It is VALID JavaScript. A free variable is only an error when the line
//     runs, so esbuild's syntax check passed it.
//   * extract.mjs lifts consts out TEXTUALLY and evaluates them in a fresh
//     module, where scope cannot matter. 1,376 tests passed against code
//     that could not run.
//   * hooks.mjs and unwired.mjs read the source, not the bundle.
//
// The one place the truth shows is the BUILT bundle. Rollup renames every
// identifier it can resolve; an identifier it cannot resolve is assumed to
// be a global and is left spelled out in full. So a project identifier
// surviving minification IS the bug, in a form that is trivial to detect.
//
// Run from the project root, after a build.
import fs from "node:fs";
import path from "node:path";

const DIST = "dist/assets";

// Real globals the browser provides. An identifier here is expected to
// survive, because it genuinely is not ours to declare.
const REAL_GLOBALS = new Set([
  "window", "document", "navigator", "location", "console", "fetch",
  "localStorage", "sessionStorage", "indexedDB", "caches", "crypto",
  "Math", "JSON", "Object", "Array", "String", "Number", "Boolean", "Date",
  "RegExp", "Error", "TypeError", "Promise", "Set", "Map", "WeakMap",
  "WeakSet", "Symbol", "Proxy", "Reflect", "BigInt", "Intl", "URL",
  "URLSearchParams", "Blob", "File", "FileReader", "FormData", "Headers",
  "Request", "Response", "AbortController", "Image", "Audio", "Worker",
  "MutationObserver", "ResizeObserver", "IntersectionObserver",
  "requestAnimationFrame", "cancelAnimationFrame", "setTimeout",
  "clearTimeout", "setInterval", "clearInterval", "queueMicrotask",
  "structuredClone", "matchMedia", "getComputedStyle", "alert", "confirm",
  "prompt", "atob", "btoa", "encodeURIComponent", "decodeURIComponent",
  "encodeURI", "decodeURI", "parseInt", "parseFloat", "isNaN", "isFinite",
  "globalThis", "self", "process", "performance", "Uint8Array",
  "Int32Array", "Float32Array", "Float64Array", "ArrayBuffer", "DataView",
  "TextEncoder", "TextDecoder", "Notification", "MediaRecorder",
  "SpeechSynthesisUtterance", "speechSynthesis", "visualViewport",
  "HTMLElement", "Node", "Element", "Event", "CustomEvent", "DOMParser",
  "XMLHttpRequest", "WebSocket", "EventSource", "Worklet", "ClipboardItem",
]);

const bundles = fs.existsSync(DIST)
  ? fs.readdirSync(DIST).filter(f => f.endsWith(".js"))
  : [];

if (!bundles.length) {
  console.log("   (skipped: no build in dist/assets. Run `npx vite build` first.)");
  process.exit(0);
}

// Every identifier declared at module level in the source. These are the
// ones that MUST have been renamed; if one survives, it was referenced from
// a scope that could not see it.
const src = fs.readFileSync("src/App.jsx", "utf8");
const declared = new Set();
for (const m of src.matchAll(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
  declared.add(m[1]);
}
for (const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) {
  declared.add(m[1]);
}

// WHY A BASELINE, AND NOT A CLEVERER CHECK
//
// A project name can legitimately appear in the bundle three ways, and only
// the third is a bug:
//
//   1. Inside a string. "Workout" is a word on a button; "sessionMinutes"
//      is an intake key.
//   2. As a property name. Minifiers never rename object keys or property
//      accesses, because something outside might read them.
//   3. As a BARE reference the bundler could not resolve, so it assumed a
//      global and left it spelled out. That is the bug.
//
// Telling them apart means ignoring strings, and ignoring strings in
// minified JavaScript means knowing whether a `/` starts a regex or divides
// - which needs a real parser. Two hand-rolled attempts at this both failed
// OPEN: they swallowed the very reference the check exists to find and then
// reported the file clean. A checker that fails open is worse than no
// checker, because it is believed.
//
// So this does not try to be clever. It records which names appear in a
// build that is known good, and fails when a NEW one shows up. It cannot
// explain WHY a name is there, and it does not need to: a name that was
// never in the bundle before and is there now is worth a human looking at,
// and that is the whole job.
//
// To accept a new name - because you added a button that says "Workout" -
// run with --update and commit the change, having checked the app runs.
const BASELINE = path.join(path.dirname(new URL(import.meta.url).pathname), "scope-baseline.json");

const present = new Set();
for (const file of bundles) {
  const code = fs.readFileSync(path.join(DIST, file), "utf8");
  for (const name of declared) {
    if (REAL_GLOBALS.has(name)) continue;
    // Short names collide with minified ones by chance.
    if (name.length < 5) continue;
    if (new RegExp(`\\b${name}\\b`).test(code)) present.add(name);
  }
}

if (process.argv.includes("--update")) {
  fs.writeFileSync(BASELINE, JSON.stringify([...present].sort(), null, 2) + "\n");
  console.log(`baseline updated: ${present.size} name(s) appear in the bundle`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.log("   (skipped: no baseline yet. Run `node _verify/scope.mjs --update` on a build you have seen work.)");
  process.exit(0);
}

const known = new Set(JSON.parse(fs.readFileSync(BASELINE, "utf8")));
let failures = 0;
for (const name of [...present].sort()) {
  if (known.has(name)) continue;
  console.error(
    `FAIL  ${name} now appears in the built bundle and did not before.\n` +
    `      If it is a bare reference, the bundler could not resolve it and\n` +
    `      assumed a global - something uses ${name} from a scope that cannot\n` +
    `      see it, and the app will throw. That is what\n` +
    `      "Can't find variable: SIGNUP_V2_SECTIONS" was on 20 Oct.\n` +
    `      If it is only new button text or a new data key, accept it with\n` +
    `      \`node _verify/scope.mjs --update\` once you have seen the app run.`
  );
  failures++;
}

// A name that USED to appear and no longer does is not a problem - it is
// usually the bug being fixed - but the baseline should not rot.
const gone = [...known].filter(n => !present.has(n));
if (gone.length) {
  console.log(`   (${gone.length} name(s) no longer in the bundle: ${gone.slice(0, 5).join(", ")}${gone.length > 5 ? "..." : ""}. Harmless; --update to tidy.)`);
}

if (failures) {
  console.error(`\n${failures} new name(s) in the bundle. Check each before shipping.`);
  process.exit(1);
}
console.log(`clean — ${present.size} known name(s) in the bundle, no new ones`);
