// Does anything read a const or let BEFORE the line that creates it?
//
// On 20 Oct, opening the Program tab threw:
//
//     Cannot access 've' before initialization.
//
// In the source that was `shownWeek`. Line 16934 read it; line 16981 created
// it. Both lines sit in the same function body, forty-seven lines apart, and
// the one that reads runs first every single time.
//
// Why nothing caught it, which is the part worth keeping:
//
//   * It is VALID JavaScript. `const` IS hoisted - the name exists from the
//     top of the block - it is just poisoned until its own line runs. So the
//     syntax check passes and the build succeeds.
//   * scope.mjs looks for names the bundler could not resolve at all. This
//     one resolved perfectly; it was resolved to a binding that was not ready
//     yet. Different bug, invisible to that check.
//   * extract.mjs lifts functions out textually and runs them on their own,
//     so a component's internal line order is never exercised.
//
// The rule this applies, and the one case it deliberately ignores:
//
//   FLAG   a read that sits textually above its declaration AND in the same
//          function body, with no function in between. Those lines run top to
//          bottom, so the read always happens first. Always a crash.
//
//   ALLOW  a read inside a nested function, arrow or callback. That body runs
//          when it is called, which is normally long after the whole file has
//          finished setting itself up. Flagging these would bury the real
//          thing under hundreds of perfectly fine lines.
//
// Run from the project root. Needs acorn (a JavaScript parser) - guessing at
// this with regular expressions is how scope.mjs failed open twice.
import fs from "node:fs";
import { Parser } from "acorn";
import jsx from "acorn-jsx";

const FILE = process.argv[2] || "src/App.jsx";
const JsxParser = Parser.extend(jsx());

const source = fs.readFileSync(FILE, "utf8");
let ast;
try {
  ast = JsxParser.parse(source, { ecmaVersion: "latest", sourceType: "module", locations: true });
} catch (err) {
  console.error(`FAIL  ${FILE} did not parse: ${err.message}`);
  process.exit(1);
}

// ---- scopes -------------------------------------------------------------
// A scope holds two kinds of name. `lexical` is const/let/class: the ones
// that can be read too early. `ready` is var, function declarations, imports
// and parameters: those are usable from the top of the scope, so reading one
// above its line is legal and not our business.
const makeScope = (parent, isFunction) => {
  const s = { parent, isFunction, lexical: new Map(), ready: new Set(), children: [], refs: [] };
  if (parent) parent.children.push(s);
  return s;
};
// Which scope belongs to which function node, so a helper stored in a const
// can be looked up from its name later.
const fnScopeOf = new Map();
const callSites = [];
// Function bodies written inline that RUN THERE AND THEN, rather than later.
const inlineRuns = [];

// `.map(x => ...)` runs its callback before the next line. So does useMemo,
// and so does a useState initialiser. An arrow handed to one of these is not
// deferred at all, however much it looks like every other callback.
//
// Deliberately NOT here: useEffect, setTimeout, .then, .addEventListener and
// every onClick. Those really do run later - after the whole function body
// has finished - so a read of a later const inside one is correct and common.
const RUNS_NOW_FN = new Set(["useMemo", "useState"]);
const RUNS_NOW_METHOD = new Set([
  "map", "filter", "forEach", "reduce", "reduceRight", "find", "findIndex",
  "findLast", "findLastIndex", "some", "every", "sort", "flatMap",
]);
const root = makeScope(null, true);
const refs = [];
// Identifiers that are BEING BOUND rather than read. The shorthand in
// `const { data, error } = await ...` parses as a property whose key and
// value are the same identifier, and the value side looks exactly like a
// read unless it is recorded here first. Without this the check reports
// every destructured result in the file as a use before declaration, which
// is the kind of noise that gets a check switched off.
const bindingIds = new Set();
const bind = node => patternNames(node).forEach(id => bindingIds.add(id));

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression",
]);
const isFunctionNode = n => n && FUNCTION_TYPES.has(n.type);

const functionScope = scope => {
  let s = scope;
  while (s && !s.isFunction) s = s.parent;
  return s || root;
};

// Every name a binding pattern introduces: plain, destructured, defaulted,
// rest. Missing one here would silently stop checking that name.
function patternNames(node, out = []) {
  if (!node) return out;
  switch (node.type) {
    case "Identifier": out.push(node); break;
    case "ObjectPattern": node.properties.forEach(p => patternNames(p.type === "RestElement" ? p.argument : p.value, out)); break;
    case "ArrayPattern": node.elements.forEach(e => patternNames(e, out)); break;
    case "AssignmentPattern": patternNames(node.left, out); break;
    case "RestElement": patternNames(node.argument, out); break;
    case "Property": patternNames(node.value, out); break;
    default: break;
  }
  return out;
}

// Is this Identifier a READ of a variable, or just a name that happens to be
// spelled with an identifier? `obj.total`, `{ total: 1 }` and `<Btn total=1>`
// are all the second kind and must not be treated as reads.
function isReference(node, parent, key) {
  if (!parent) return false;
  switch (parent.type) {
    case "MemberExpression": return !(key === "property" && !parent.computed);
    case "JSXMemberExpression": return key === "object";
    case "Property":
    case "PropertyDefinition":
    case "MethodDefinition": return !(key === "key" && !parent.computed);
    case "JSXAttribute": return key !== "name";
    case "JSXOpeningElement":
    case "JSXClosingElement":
      // <Btn> is a real read of Btn; <div> is not, and lowercase is how JSX
      // itself tells them apart.
      return key === "name" && /^[A-Z_$]/.test(node.name || "");
    case "VariableDeclarator": return key !== "id";
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
    case "ClassDeclaration":
    case "ClassExpression": return false;
    case "ImportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
    case "ExportSpecifier": return false;
    // `import.meta` and `new.target`: both halves are built-in syntax, not
    // variables anybody declared.
    case "MetaProperty": return false;
    case "LabeledStatement":
    case "BreakStatement":
    case "ContinueStatement": return key !== "label";
    case "ObjectPattern": case "ArrayPattern": case "AssignmentPattern":
    case "RestElement": return false;
    default: return true;
  }
}

const SKIP_KEYS = new Set(["type", "start", "end", "loc", "range", "parent"]);

// What to call the thing in the message: `.map(...)`, `useMemo(...)`.
const calleeLabel = callee =>
  callee.type === "Identifier" ? `${callee.name}(...)`
  : callee.type === "MemberExpression" && callee.property.type === "Identifier"
    ? `.${callee.property.name}(...)`
    : "this call";

function walk(node, parent, key, scope) {
  if (!node || typeof node.type !== "string") return;

  // --- declare, into whichever scope owns this kind of name ---
  if (node.type === "VariableDeclaration") {
    for (const d of node.declarations) {
      bind(d.id);
      for (const id of patternNames(d.id)) {
        if (node.kind === "var") functionScope(scope).ready.add(id.name);
        // The whole declarator is the danger zone, so `const x = x` counts.
        else scope.lexical.set(id.name, {
          end: d.end, line: id.loc.start.line,
          // A helper kept in a const, so a call to it can be followed.
          initFn: (d.id === id && isFunctionNode(d.init)) ? d.init : null,
        });
      }
    }
  } else if (node.type === "FunctionDeclaration" && node.id) {
    functionScope(scope).ready.add(node.id.name);
  } else if (node.type === "ClassDeclaration" && node.id) {
    scope.lexical.set(node.id.name, { end: node.id.end, line: node.id.loc.start.line });
  } else if (node.type.startsWith("Import") && node.local) {
    root.ready.add(node.local.name);
  }

  // --- record a read ---
  if ((node.type === "Identifier" || node.type === "JSXIdentifier")
      && !bindingIds.has(node) && isReference(node, parent, key)) {
    const r = { name: node.name, start: node.start, line: node.loc.start.line, scope };
    refs.push(r);
    scope.refs.push(r);
  }

  // --- record a call by name, for the deferred-but-not-really check below ---
  if (node.type === "CallExpression") {
    const callee = node.callee;
    if (callee.type === "Identifier") {
      callSites.push({ name: callee.name, start: node.start, line: node.loc.start.line, scope });
    }
    const runsNow =
      (callee.type === "Identifier" && RUNS_NOW_FN.has(callee.name)) ||
      (callee.type === "MemberExpression" && !callee.computed
        && callee.property.type === "Identifier" && RUNS_NOW_METHOD.has(callee.property.name)) ||
      isFunctionNode(callee);                       // an IIFE
    if (runsNow) {
      const here = { start: node.start, line: node.loc.start.line, scope };
      if (isFunctionNode(callee)) inlineRuns.push({ ...here, fn: callee, what: "this block" });
      for (const a of node.arguments) {
        if (isFunctionNode(a)) inlineRuns.push({ ...here, fn: a, what: calleeLabel(callee) });
      }
      // `xs.map(helper)` - the callback is a name, and it still runs here.
      for (const a of node.arguments) {
        if (a.type === "Identifier") {
          callSites.push({ name: a.name, start: node.start, line: node.loc.start.line, scope });
        }
      }
    }
  }

  // --- work out the scope this node's children live in ---
  let child = scope;
  if (isFunctionNode(node)) {
    child = makeScope(scope, true);
    fnScopeOf.set(node, child);
    if (node.id && node.type === "FunctionExpression") child.ready.add(node.id.name);
    node.params.forEach(p => { bind(p); patternNames(p).forEach(id => child.ready.add(id.name)); });
  } else if (node.type === "BlockStatement" && !isFunctionNode(parent)) {
    child = makeScope(scope, false);
  } else if (node.type === "ForStatement" || node.type === "ForInStatement"
          || node.type === "ForOfStatement" || node.type === "SwitchStatement"
          || node.type === "ClassBody" || node.type === "StaticBlock") {
    child = makeScope(scope, node.type === "StaticBlock");
  } else if (node.type === "CatchClause") {
    child = makeScope(scope, false);
    bind(node.param);
    patternNames(node.param).forEach(id => child.ready.add(id.name));
  }

  for (const k of Object.keys(node)) {
    if (SKIP_KEYS.has(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) {
      for (const c of v) if (c && typeof c.type === "string") walk(c, node, k, child);
    } else if (v && typeof v.type === "string") {
      walk(v, node, k, child);
    }
  }
}

walk(ast, null, null, root);

// Names the browser provides. Anything read but never declared and not on
// this list is a name that points at nothing, and the app throws the moment
// the line runs.
const BROWSER_GLOBALS = new Set([
  "window", "document", "navigator", "location", "history", "screen",
  "console", "fetch", "localStorage", "sessionStorage", "indexedDB",
  "caches", "crypto", "performance", "globalThis", "self", "process",
  "Math", "JSON", "Object", "Array", "String", "Number", "Boolean", "Date",
  "RegExp", "Error", "TypeError", "RangeError", "SyntaxError", "Promise",
  "Set", "Map", "WeakMap", "WeakSet", "Symbol", "Proxy", "Reflect", "BigInt",
  "Intl", "URL", "URLSearchParams", "Blob", "File", "FileReader", "FormData",
  "Headers", "Request", "Response", "AbortController", "AbortSignal",
  "Image", "Audio", "Worker", "MutationObserver", "ResizeObserver",
  "IntersectionObserver", "requestAnimationFrame", "cancelAnimationFrame",
  "requestIdleCallback", "setTimeout", "clearTimeout", "setInterval",
  "clearInterval", "queueMicrotask", "structuredClone", "matchMedia",
  "getComputedStyle", "alert", "confirm", "prompt", "atob", "btoa",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
  "parseInt", "parseFloat", "isNaN", "isFinite", "NaN", "Infinity",
  "undefined", "arguments", "Uint8Array", "Uint16Array", "Uint32Array",
  "Int8Array", "Int16Array", "Int32Array", "Float32Array", "Float64Array",
  "ArrayBuffer", "DataView", "TextEncoder", "TextDecoder", "Notification",
  "MediaRecorder", "MediaSource", "SpeechSynthesisUtterance",
  "speechSynthesis", "visualViewport", "HTMLElement", "HTMLCanvasElement",
  "Node", "Element", "Event", "CustomEvent", "KeyboardEvent", "MouseEvent",
  "TouchEvent", "PointerEvent", "DOMParser", "XMLHttpRequest", "WebSocket",
  "EventSource", "ClipboardItem", "DOMException", "Function", "eval",
  "import", "require", "module", "exports", "__dirname", "__filename",
]);

// ---- resolve ------------------------------------------------------------
const problems = [];
const unknown = new Map();   // name -> first line it is read on
for (const ref of refs) {
  let s = ref.scope;
  let crossedFunction = false;
  let found = false;
  while (s) {
    if (s.ready.has(ref.name)) { found = true; break; }   // var/param/import
    const decl = s.lexical.get(ref.name);
    if (decl) {
      found = true;
      if (ref.start < decl.end && !crossedFunction) {
        problems.push({ name: ref.name, usedLine: ref.line, madeLine: decl.line });
      }
      break;
    }
    if (s.isFunction) crossedFunction = true;        // a callback runs later
    s = s.parent;
  }
  // THE OTHER CRASH, and the one scope.mjs could not see.
  //
  // `bubbleBg` was declared inside the Messages screen and read from
  // AthleteMessageRow, a different function a hundred lines above. The Coach
  // tab threw "Can't find variable: bubbleBg" for every athlete with a
  // message. SIGNUP_V2_SECTIONS was the same mistake five days earlier.
  //
  // scope.mjs was supposed to be the check for this and missed both, because
  // it collected candidate names with a regular expression anchored to
  // column 0 and so only ever knew about declarations at module level. A
  // name declared inside a component - which is exactly where this mistake
  // gets made - was never in its list, so it was never looked for. Here the
  // parser knows every binding in the file, wherever it is written.
  if (!found && !BROWSER_GLOBALS.has(ref.name) && !unknown.has(ref.name)) {
    unknown.set(ref.name, ref.line);
  }
}

// ---- the second shape: a helper that only LOOKS deferred ----------------
//
// The rule above lets a read inside a function body past, because a function
// body runs when it is called. That is true right up until the call happens
// a few lines later, still above the declaration:
//
//     const label = () => weekName(shownWeek);   // allowed: a body
//     const title = label();                     // but it is called HERE
//     const shownWeek = 3;                       // and this is below
//
// Every line is individually fine and the whole thing still throws. This
// follows one hop: a call, by name, to a helper kept in a const, from a
// place that really does run in order. Chains longer than one hop are not
// followed - worth knowing, not worth the false positives.
const allRefsIn = scope => {
  const out = [];
  const stack = [scope];
  while (stack.length) {
    const s = stack.pop();
    out.push(...s.refs);
    stack.push(...s.children);
  }
  return out;
};

// Resolve a read from inside a helper, reporting only bindings that live
// OUTSIDE the helper - a local of the helper's own is never the problem.
const resolveOutside = (refScope, name, helperScope) => {
  let s = refScope, left = false;
  while (s) {
    if (s.ready.has(name)) return null;
    const d = s.lexical.get(name);
    if (d) return left ? { decl: d, owner: s } : null;
    if (s === helperScope) left = true;
    s = s.parent;
  }
  return null;
};

// The scopes whose lines genuinely run in order relative to a given call.
// Everything from the call outwards to the function it sits in, and no
// further: once past that function, the call itself is deferred and the
// order of lines outside stops mattering.
//
// Without this, `uploaded.forEach(k => add(k, UPLOADED_EXERCISE_PHOTOS[k]))`
// on line 183 reads as a bug because its const is on line 236 - but line 183
// is inside a function nobody calls until long after the file has loaded.
const straightLineScopes = scope => {
  const out = new Set();
  let s = scope;
  while (s) { out.add(s); if (s.isFunction) break; s = s.parent; }
  return out;
};

const seen = new Set();

// Shared by both shapes: a function body that is about to run at `site`,
// reading names from outside itself.
const checkBodyAt = (helperScope, site, label) => {
  if (!helperScope) return;
  const inOrder = straightLineScopes(site.scope);
  for (const ref of allRefsIn(helperScope)) {
    const hit = resolveOutside(ref.scope, ref.name, helperScope);
    if (!hit || !inOrder.has(hit.owner)) continue;
    const decl = hit.decl;
    if (site.start >= decl.end) continue;
    const tag = `${site.line}:${ref.name}:${decl.line}`;
    if (seen.has(tag)) continue;
    seen.add(tag);
    problems.push({
      name: ref.name, usedLine: ref.line, madeLine: decl.line,
      via: { helper: label, callLine: site.line },
    });
  }
};

for (const run of inlineRuns) {
  checkBodyAt(fnScopeOf.get(run.fn), run, run.what);
}

for (const call of callSites) {
  // Find what the called name is, and stop at the first function boundary:
  // past one, the call itself is deferred and the order stops mattering.
  let s = call.scope, crossed = false, helper = null;
  while (s) {
    if (s.ready.has(call.name)) break;
    const d = s.lexical.get(call.name);
    if (d) { if (!crossed && d.initFn) helper = d; break; }
    if (s.isFunction) crossed = true;
    s = s.parent;
  }
  if (!helper) continue;
  checkBodyAt(fnScopeOf.get(helper.initFn), call, call.name);
}

problems.sort((a, b) => a.usedLine - b.usedLine);
if (problems.length) {
  for (const p of problems) {
    if (p.via) {
      console.error(
        `FAIL  ${FILE}:${p.via.callLine} calls \`${p.via.helper}\`, and ${p.via.helper} reads\n` +
        `      \`${p.name}\` at line ${p.usedLine}, which is not created until line ${p.madeLine}.\n` +
        `      The helper looks deferred, but the call on line ${p.via.callLine} runs it right\n` +
        `      there, above the declaration, and it throws "Cannot access ...\n` +
        `      before initialization". Move line ${p.madeLine} above line ${p.via.callLine}.`
      );
    } else {
      console.error(
        `FAIL  ${FILE}:${p.usedLine} reads \`${p.name}\`, which is not created until line ${p.madeLine}.\n` +
        `      Same function body, so line ${p.usedLine} runs first every time and throws\n` +
        `      "Cannot access ... before initialization". Move the declaration above\n` +
        `      the use, or move the use below the declaration.`
      );
    }
  }
  console.error(`\n${problems.length} use(s) before declaration.`);
}

for (const [name, line] of [...unknown].sort((a, b) => a[1] - b[1])) {
  console.error(
    `FAIL  ${FILE}:${line} reads \`${name}\`, which is not declared anywhere it can see.\n` +
    `      Usually it IS declared, but inside another function, where this one\n` +
    `      cannot reach it. The browser throws "Can't find variable: ${name}".\n` +
    `      Move the declaration out to module level, or pass it in as a prop.`
  );
}
if (unknown.size) console.error(`\n${unknown.size} name(s) that point at nothing.`);

if (problems.length || unknown.size) process.exit(1);
console.log(
  `clean — ${refs.length} variable reads checked: none read before the line that\n` +
  `        creates them, and none pointing at a name that does not exist`
);
