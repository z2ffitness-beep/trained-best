// Regenerates public/privacy.html from the policy text in src/App.jsx.
//
// The stores want a public URL they can link from the listing, and the app
// wants the same words on a screen inside it. Keeping two copies is how a
// privacy policy quietly becomes untrue, so there is one source and this
// script renders the other. Run it whenever PRIVACY_POLICY changes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "./extract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const H = await load(path.join(root, "src", "App.jsx"), [
  { name: "PRIVACY_CONTACT", kind: "const" },
  { name: "PRIVACY_POLICY", kind: "const" },
]);

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const sections = H.PRIVACY_POLICY.map(s => `
  <section>
    <h2>${esc(s.heading)}</h2>
    ${(s.paragraphs || []).map(t => `<p>${esc(t)}</p>`).join("\n    ")}
    ${s.bullets ? `<ul>${s.bullets.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
  </section>`).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy and your data</title>
<meta name="description" content="What this app collects, who can see it, and how to delete it.">
<style>
  *,*::before,*::after{box-sizing:border-box}
  :root{
    --bg:#ffffff;--panel:#f6f4f1;--border:#e2ddd7;
    --text:#1b1815;--sub:#4a443e;--faint:#7d766e;--accent:#c2611f;
  }
  @media (prefers-color-scheme: dark){
    :root{--bg:#12100e;--panel:#1c1917;--border:#2e2a26;
          --text:#f5f1ec;--sub:#b6b0a8;--faint:#7d766e;--accent:#e8833a}
  }
  body{margin:0;background:var(--bg);color:var(--sub);
       font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       padding:40px 20px 80px}
  main{max-width:680px;margin:0 auto}
  h1{color:var(--text);font-size:30px;line-height:1.2;margin:0 0 6px;letter-spacing:-.02em}
  .meta{color:var(--faint);font-size:13px;margin:0 0 8px}
  h2{color:var(--accent);font-size:17px;margin:36px 0 10px;letter-spacing:-.01em}
  p{margin:0 0 12px}
  ul{margin:0 0 12px;padding-left:20px}
  li{margin-bottom:8px}
  .contact{margin-top:44px;background:var(--panel);border:1px solid var(--border);
           border-radius:14px;padding:20px}
  .contact strong{color:var(--text)}
</style>
</head>
<body>
<main>
  <h1>Privacy and your data</h1>
  <p class="meta">${esc(H.PRIVACY_CONTACT.business)} &middot; Last updated ${esc(H.PRIVACY_CONTACT.updated)}</p>
${sections}
  <div class="contact">
    <p>Questions about any of this, or a request about your data:
      <strong>${esc(H.PRIVACY_CONTACT.email)}</strong>.
      ${esc(H.PRIVACY_CONTACT.business)} is based in ${esc(H.PRIVACY_CONTACT.region)}.</p>
  </div>
</main>
</body>
</html>
`;

const out = path.join(root, "public", "privacy.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log("wrote", path.relative(root, out), `(${html.length} bytes)`);

// A policy shipped with the placeholders still in it is worse than none - it
// tells a reviewer, and a user, that nobody checked.
const unfilled = Object.entries(H.PRIVACY_CONTACT).filter(([, v]) => String(v).startsWith("["));
if (unfilled.length) {
  console.error("\n⚠  Still to fill in before submitting to any store:");
  for (const [k, v] of unfilled) console.error(`   ${k}: ${v}`);
  process.exitCode = 1;
}
