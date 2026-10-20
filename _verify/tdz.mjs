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
const makeScope = (parent, isFunction) => ({
  parent, isFunction, lexical: new Map(), ready: new Set(),
});
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
    case "LabeledStatement":
    case "BreakStatement":
    case "ContinueStatement": return key !== "label";
    case "ObjectPattern": case "ArrayPattern": case "AssignmentPattern":
    case "RestElement": return false;
    default: return true;
  }
}

const SKIP_KEYS = new Set(["type", "start", "end", "loc", "range", "parent"]);

function walk(node, parent, key, scope) {
  if (!node || typeof node.type !== "string") return;

  // --- declare, into whichever scope owns this kind of name ---
  if (node.type === "VariableDeclaration") {
    for (const d of node.declarations) {
      bind(d.id);
      for (const id of patternNames(d.id)) {
        if (node.kind === "var") functionScope(scope).ready.add(id.name);
        // The whole declarator is the danger zone, so `const x = x` counts.
        else scope.lexical.set(id.name, { end: d.end, line: id.loc.start.line });
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
    refs.push({ name: node.name, start: node.start, line: node.loc.start.line, scope });
  }

  // --- work out the scope this node's children live in ---
  let child = scope;
  if (isFunctionNode(node)) {
    child = makeScope(scope, true);
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

// ---- resolve ------------------------------------------------------------
const problems = [];
for (const ref of refs) {
  let s = ref.scope;
  let crossedFunction = false;
  while (s) {
    if (s.ready.has(ref.name)) break;               // var/param/import: fine
    const decl = s.lexical.get(ref.name);
    if (decl) {
      if (ref.start < decl.end && !crossedFunction) {
        problems.push({ name: ref.name, usedLine: ref.line, madeLine: decl.line });
      }
      break;
    }
    if (s.isFunction) crossedFunction = true;        // a callback runs later
    s = s.parent;
  }
}

problems.sort((a, b) => a.usedLine - b.usedLine);
if (problems.length) {
  for (const p of problems) {
    console.error(
      `FAIL  ${FILE}:${p.usedLine} reads \`${p.name}\`, which is not created until line ${p.madeLine}.\n` +
      `      Same function body, so line ${p.usedLine} runs first every time and throws\n` +
      `      "Cannot access ... before initialization". Move the declaration above\n` +
      `      the use, or move the use below the declaration.`
    );
  }
  console.error(`\n${problems.length} use(s) before declaration.`);
  process.exit(1);
}
console.log(`clean — ${refs.length} variable reads checked, none happen before the line that creates them`);
