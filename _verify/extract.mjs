// Pulls pure helper functions out of App.jsx so they can be tested without a
// DOM, a bundler or a Supabase connection.
//
// App.jsx is one ~14k-line module that also imports React, lucide and a
// megabyte of base64 image data. Importing it in Node is not possible and
// splitting it is a bigger change than any single feature justifies, so the
// helpers are lifted out textually instead.
//
// Lives in the repo rather than a temp directory on purpose: the previous
// harness sat in /tmp of a cloud container and disappeared with it, taking
// every test with it.
import fs from "node:fs";

export function readSource(path) {
  return fs.readFileSync(path, "utf8");
}

// Everything from `start` to the brace that closes the body. Counts braces
// rather than matching a closing pattern, because helpers contain object
// literals, nested functions and template literals with `}` inside them.
//
// The parameter list is skipped first: `function f({ a, b }) {` opens and
// closes a brace before the body starts, and counting from the first `{` in
// the line ends the function at its own signature.
// Is the "/" at `i` opening a regex literal rather than dividing? Decided by
// what precedes it: a regex can only follow an operator, a keyword or an
// opening bracket, never a value. Enough for the source this reads, and the
// alternative is writing a real tokeniser.
const REGEX_PRECEDERS = "(,=:[!&|?{};+-*%^~<>";
const REGEX_KEYWORDS = ["return", "typeof", "case", "in", "of", "delete", "void", "instanceof", "new", "do", "else", "yield"];

function startsRegex(src, i) {
  let k = i - 1;
  while (k >= 0 && (src[k] === " " || src[k] === "\t" || src[k] === "\n" || src[k] === "\r")) k--;
  if (k < 0) return true;
  if (REGEX_PRECEDERS.includes(src[k])) return true;
  const word = src.slice(Math.max(0, k - 10), k + 1).match(/[A-Za-z]+$/);
  return !!word && REGEX_KEYWORDS.includes(word[0]);
}

// Index of the closing "/", or -1 if this isn't a regex after all. A character
// class can hold an unescaped "/" and a brace, which is the whole reason this
// exists: /,(\s*[}\]])/g was being counted as structure and closed a function
// that had not ended.
function endOfRegex(src, i) {
  let inClass = false;
  for (let j = i + 1; j < src.length; j++) {
    const d = src[j];
    if (d === "\\") { j++; continue; }
    if (d === "\n") return -1;
    if (d === "[") inClass = true;
    else if (d === "]") inClass = false;
    else if (d === "/" && !inClass) return j;
  }
  return -1;
}

function bodyFrom(src, start) {
  // Find where the parameter list CLOSES by matching parentheses, not by
  // taking the first ")" after the name. A default value that calls something
  // - `function f(a, { today = todayISO() } = {})` - closes a paren of its
  // own, and the naive search stopped there, so the body was taken from the
  // middle of the signature and the extracted function ended mid-statement.
  let paren = src.indexOf("(", start);
  let depth = 0;
  let bodyOpen = -1;
  for (let j = paren; j < src.length; j++) {
    if (src[j] === "(") depth++;
    else if (src[j] === ")") {
      depth--;
      if (depth === 0) { bodyOpen = j; break; }
    }
  }
  if (bodyOpen < 0) return null;
  let i = src.indexOf("{", bodyOpen);
  if (i < 0) return null;
  depth = 0;
  let inString = null;
  for (; i < src.length; i++) {
    const c = src[i];
    const prev = src[i - 1];
    if (inString) {
      // Skip the escaped character outright. Testing `prev !== "\\"` instead
      // gets `"\\\\"` - a string holding one backslash - wrong: the closing quote
      // is preceded by a backslash, so the string looked unterminated and the
      // scanner ran to the end of the file swallowing every later function.
      if (c === "\\") { i++; continue; }
      if (c === inString) inString = null;
      continue;
    }
    // Comments are skipped whole. Without this an apostrophe inside a prose
    // comment opened a string that never closed, and the extractor ran off
    // the end of the file reporting that a valid function could not be closed.
    if (c === "/" && src[i + 1] === "/") {
      i = src.indexOf("\n", i);
      if (i < 0) return null;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i + 2);
      if (i < 0) return null;
      i += 1;
      continue;
    }
    if (c === "/" && startsRegex(src, i)) {
      const close = endOfRegex(src, i);
      if (close > 0) { i = close; continue; }
    }
    if (c === '"' || c === "'" || c === "`") { inString = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

// `kind` is "function" for declarations and "const" for single-statement
// constants. A const must NOT carry a trailing comment on its own line — the
// terminator search runs to the end of the line and a comment containing a
// semicolon silently swallows the next statement.
// The semicolon that ends a statement, ignoring any inside a string, a
// template, brackets or a comment. Matching to the end of the line instead
// means a trailing comment containing a semicolon silently swallows whatever
// comes next, and a multi-line arrow const never matches at all.
function terminator(src, from) {
  let depth = 0;
  let inString = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (c === "\\") { i++; continue; }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inString = c; continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i < 0) return -1; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2); if (i < 0) return -1; i += 1; continue; }
    if (c === "/" && startsRegex(src, i)) {
      const close = endOfRegex(src, i);
      if (close > 0) { i = close; continue; }
    }
    if ("({[".includes(c)) depth++;
    else if (")}]".includes(c)) depth--;
    else if (c === ";" && depth === 0) return i;
  }
  return -1;
}

export function grab(src, name, kind = "function") {
  if (kind === "const") {
    const marker = `\nconst ${name} = `;
    const at = src.indexOf(marker);
    if (at < 0) throw new Error(`could not find const ${name}`);
    const end = terminator(src, at + marker.length);
    if (end < 0) throw new Error(`could not close const ${name}`);
    return src.slice(at + 1, end + 1);
  }
  // Plain declarations and async ones both. Without the second form every
  // async helper - which is most of the ones that touch storage - had to be
  // tested by grepping its source instead of running it.
  let marker = `\nfunction ${name}(`;
  let at = src.indexOf(marker);
  if (at < 0) {
    marker = `\nasync function ${name}(`;
    at = src.indexOf(marker);
  }
  if (at < 0) throw new Error(`could not find function ${name}`);
  const body = bodyFrom(src, at + 1);
  if (!body) throw new Error(`could not close function ${name}`);
  return body;
}

// Assembles the requested helpers into one module and evaluates it. Order
// matters only for consts, which are not hoisted.
export async function load(path, wanted) {
  const src = readSource(path);
  const parts = wanted.map(w =>
    typeof w === "string" ? grab(src, w) : grab(src, w.name, w.kind)
  );
  const names = wanted.map(w => (typeof w === "string" ? w : w.name));
  const mod = parts.join("\n\n") + `\nexport { ${names.join(", ")} };\n`;
  const url = "data:text/javascript;base64," + Buffer.from(mod).toString("base64");
  return import(url);
}
