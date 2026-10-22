// The welcome page's background carousel.
//
// The whole point of this file is that the three media files are OPTIONAL. They
// are not in the repo, they are downloaded separately, and until they are in
// public/media/ the welcome page has to look exactly as it did before: navy,
// glow, contour rings, logo. Three separate things make that true, and each one
// fails silently if it is undone:
//
//   1. .hero-carousel has no background of its own. The kit's version painted a
//      navy gradient, which would sit ON TOP of the panel's drawn art.
//   2. the shade, the caption chip and the dots are gated on anyLoaded, or a
//      missing file leaves a dark wash and a chip hovering over nothing.
//   3. the panel's own content sits at z-index 1, or an absolutely positioned
//      backdrop paints over the logo.
//
// And the paths are relative. The preview is served from a subfolder, so a
// leading slash would look for the files at the domain root and find nothing.
import assert from "node:assert/strict";
import { load, readSource } from "./extract.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = readSource(APP);
const css = fs.readFileSync(path.join(here, "..", "src", "index.css"), "utf8");

const H = await load(APP, [
  { name: "HERO_SLIDES", kind: "const" },
  { name: "HERO_SLIDE_MS", kind: "const" },
]);

let passed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);

// The block of CSS this file is about, so a rule of the same name elsewhere in
// the stylesheet cannot stand in for the real one.
const carouselCss = css.slice(css.indexOf(".hero-carousel {"));

// ---------- the slides ----------

test("the brand, then four photographs, in the order they were chosen", () => {
  assert.equal(H.HERO_SLIDES.length, 5);
  assert.deepEqual(H.HERO_SLIDES.map((s) => s.caption),
    [null, "Strength", "Coaching", "Conditioning", "Mobility"]);
});

test("every slide declares a type the component can render", () => {
  for (const s of H.HERO_SLIDES) {
    assert.ok(s.type === "image" || s.type === "video" || s.type === "brand",
      `${s.key} has type ${s.type}`);
  }
});

test("every slide points at media/ with a RELATIVE path", () => {
  for (const s of H.HERO_SLIDES.filter(x => x.src)) {
    assert.ok(!s.src.startsWith("/"),
      `${s.src} starts with a slash, so it resolves to the domain root and 404s in the preview`);
    assert.ok(s.src.startsWith("media/"), `${s.src} should sit in public/media/`);
  }
});

test("every slide's file is actually in public/media", () => {
  // The strongest check in this file. A typo in a filename, a photo renamed on
  // the way in, or a file that never got copied into the project all look
  // identical in the browser - a slide that silently stays blank - and the
  // carousel is written to tolerate exactly that, so nothing complains.
  const dir = path.join(here, "..", "public", "media");
  for (const s of H.HERO_SLIDES.filter(x => x.src)) {
    const f = path.join(dir, s.src.replace(/^media\//, ""));
    assert.ok(fs.existsSync(f), `${s.src} is referenced but not in public/media`);
    assert.ok(fs.statSync(f).size > 1024, `${s.src} is there but empty`);
  }
});

test("no photo is heavy enough to hold up the first screen", () => {
  const dir = path.join(here, "..", "public", "media");
  for (const s of H.HERO_SLIDES.filter(x => x.src)) {
    const f = path.join(dir, s.src.replace(/^media\//, ""));
    const kb = fs.statSync(f).size / 1024;
    const cap = s.type === "video" ? 3072 : 400;
    assert.ok(kb <= cap, `${s.src} is ${Math.round(kb)} KB, over the ${cap} KB budget`);
  }
});

test("every slide has a distinct key, or React reuses the wrong DOM node", () => {
  assert.equal(new Set(H.HERO_SLIDES.map((s) => s.key)).size, H.HERO_SLIDES.length);
});

test("five seconds a slide", () => {
  assert.equal(H.HERO_SLIDE_MS, 5000);
});

// ---------- a missing file costs nothing ----------

test("the carousel paints no background of its own", () => {
  const rule = carouselCss.slice(0, carouselCss.indexOf("}"));
  assert.ok(!/background/.test(rule),
    "a background here covers the panel's navy art whenever the media is absent");
});

test("a slide with no file draws nothing", () => {
  assert.ok(/\.hc-slide\.empty video, \.hc-slide\.empty img \{ opacity: 0; \}/.test(carouselCss),
    "without this an unloaded <img> shows a broken-image glyph");
});

test("an unloaded slide is hidden with opacity, never display:none", () => {
  // This rule hides an element that has not finished loading, so it must not
  // be able to interfere with the loading. Chrome keeps a display:none video
  // loading - measured, not assumed - but that is not a guarantee every
  // browser makes, and the failure is silent: the slide stays "empty" for good
  // and the carousel cycles through a hole where the clip should be. Opacity
  // takes the question off the table and looks identical.
  const rule = carouselCss.slice(carouselCss.indexOf(".hc-slide.empty"));
  const decl = rule.slice(0, rule.indexOf("}"));
  assert.ok(!/display:\s*none/.test(decl),
    "display:none stops the <video> loading, so it can never un-hide itself");
});

test("the shade, the chip and the dots all wait for a file to load", () => {
  const body = src.slice(src.indexOf("function HeroCarousel("));
  const end = body.indexOf("\n}\n");
  const fn = body.slice(0, end);
  for (const cls of ["hc-shade", "hc-chip", "hc-dots"]) {
    const at = fn.indexOf(cls);
    assert.ok(at > -1, `${cls} is not rendered at all`);
    // The gate is the last thing before the class name: same line for the
    // one-liners, the line above for the dots, which open a block.
    const before = fn.slice(Math.max(0, at - 140), at);
    assert.ok(/anyLoaded && [^;]*$/.test(before),
      `${cls} renders before any file has loaded, so it floats over plain navy`);
  }
});

test("anyLoaded is false until something actually loads", () => {
  const fn = src.slice(src.indexOf("function HeroCarousel("));
  assert.ok(/const anyLoaded = Object\.values\(loaded\)\.some\(Boolean\);/.test(fn));
  // Every onError writes false, never true: a 404 must not count as loaded.
  // Checked across ALL of them, because one slide quietly reporting success is
  // enough to light up the shade and the chip over an empty panel.
  const errs = fn.slice(0, fn.indexOf("\n}\n")).match(/onError=\{[^}]*\}\)\)\}/g) || [];
  assert.equal(errs.length, 2, "both the image and the video handle a missing file");
  for (const e of errs) {
    assert.ok(/\[s\.key\]: false/.test(e), `a failed file must record false, not: ${e}`);
  }
});

// ---------- it sits behind the logo, not over it ----------

test("the panel's content is lifted above the backdrop", () => {
  assert.ok(/<div style=\{\{ position: "relative", zIndex: 1 \}\}>\{children\}<\/div>/.test(src),
    "without z-index 1 the absolutely positioned carousel paints over the logo");
});

test("the welcome panel is the one that gets it", () => {
  assert.ok(/backdrop=\{<HeroCarousel chrome=\{wide \|\| bandHeight >= 160\} compact=\{!wide\}/.test(src),
    "the carousel belongs to the welcome page's panel");
});

test("the shallow band above the sign-up steps drops the caption and dots", () => {
  // brandPanel(false, 92) is the strip over the form. At that height the pill
  // and the dots sit on the wordmark instead of beside it.
  assert.ok(/chrome=\{wide \|\| bandHeight >= 160\}/.test(src),
    "a 92px strip would carry the full furniture");
});

test("HeroPanel renders the backdrop below its children", () => {
  const panel = src.slice(src.indexOf("function HeroPanel("));
  const fn = panel.slice(0, panel.indexOf("\n}\n"));
  assert.ok(fn.indexOf("{backdrop}") < fn.indexOf("{children}"),
    "the backdrop has to come first in the DOM");
});

// ---------- web only ----------

test("the carousel runs on the phone too, not only on the web", () => {
  // It began as web-only so the mobile layout would not change. The band on a
  // phone now carries the same photography, so there is no width test left to
  // make and nothing may return null before the slides render.
  const fn = src.slice(src.indexOf("function HeroCarousel("));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(!/const show = useWide\(\)/.test(body),
    "back to being gated on screen width, so the phone band is empty again");
  assert.ok(!/if \(!show\) return null;/.test(body),
    "the component still bails out before rendering anything");
});

test("the band opens on the brand, then moves into the photographs", () => {
  const first = H.HERO_SLIDES[0];
  assert.equal(first.type, "brand", "the first slide is a photograph again");
  assert.equal(first.src, null, "the opening slide must carry no file");
  assert.equal(first.caption, null, "a caption here would draw an empty pill");
  assert.ok(H.HERO_SLIDES.slice(1).every(s => s.type === "image" && s.src),
    "every slide after the first is a photograph");
});

test("a slide with no file renders no element at all", () => {
  const fn = src.slice(src.indexOf("function HeroCarousel("));
  assert.ok(/s\.type === "brand" \? null :/.test(fn),
    "an <img src={null}> would fire onError and count as a broken slide");
});

test("the empty caption on the brand slide never draws a pill", () => {
  const fn = src.slice(src.indexOf("function HeroCarousel("));
  assert.ok(/chrome && anyLoaded && slides\[index\]\.caption &&/.test(fn),
    "an empty pill appears for five seconds on every loop");
});

test("only the visible video plays", () => {
  const fn = src.slice(src.indexOf("function HeroCarousel("));
  assert.ok(/else v\.pause\(\);/.test(fn),
    "three videos decoding at once on the first screen anyone sees");
});

test("reduced motion stops the advance and the zoom", () => {
  const fn = src.slice(src.indexOf("function HeroCarousel("));
  assert.ok(/if \(still\) return;/.test(fn), "no auto-advance");
  assert.ok(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transform: none !important/.test(carouselCss),
    "no zoom");
});

test("a browser that cannot answer the motion question is not treated as having asked", () => {
  assert.ok(/catch \(e\) \{ return false; \}/.test(src.slice(src.indexOf("function prefersReducedMotion"))),
    "a throwing matchMedia must not silently freeze the carousel for everyone");
});

test("the app layout is told it is the app layout", () => {
  // Not a CSS breakpoint. isWideScreen() answers false inside the native build
  // and follows ?view=, so a media query would place the caption for a layout
  // the app did not choose.
  assert.ok(/compact=\{!wide\}/.test(src), "nothing marks the phone band as compact");
  const fn = src.slice(src.indexOf("function HeroCarousel("));
  assert.ok(/className=\{"hero-carousel" \+ \(compact \? " compact" : ""\)\}/.test(fn),
    "the flag never reaches the element the stylesheet targets");
});

test("the caption sits in the corner on the app, not over the wordmark", () => {
  const fn = src.slice(src.indexOf("function HeroCarousel("));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(/const chipBox = compact[\s\S]*?top: 14, right: 14, bottom: "auto", left: "auto"/.test(body),
    "the pill is back on top of the centred logo");
  assert.ok(/: \{ top: 96, right: 40, bottom: "auto", left: "auto" \}/.test(body),
    "the web placement was dropped along with it");
});

test("the carousel places its own furniture instead of trusting the stylesheet", () => {
  // The app ships as two hand-uploaded files and App.jsx has twice gone up
  // without index.css, which put the old stylesheet's pill straight back on
  // the new centred wordmark. Inline wins over a stylesheet rule, so the
  // component cannot be half-deployed into that state.
  const fn = src.slice(src.indexOf("function HeroCarousel("));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(/className="hc-chip" style=\{chipBox\}/.test(body),
    "the pill takes its position from the stylesheet again");
  assert.ok(/className="hc-dots" style=\{dotsBox\}/.test(body),
    "the dots take their position from the stylesheet again");
  assert.ok(!/\.hero-carousel\.compact/.test(carouselCss),
    "two sources of truth for the same positions");
});


// ---------- where in the photograph the band looks ----------
//
// The four hero files are square and every one is a standing person with their
// head in the top quarter. A 390x240 phone band can only show about three
// fifths of a square picture's height, and cropped from the middle those three
// fifths are the torso - which is exactly what shipped: four slides, four
// headless people. These tests pin the crop to the top of the picture on a
// deep phone band, pin the zoom's origin there with it, and keep both off the
// web panel and off the 92px strip, where they would do harm.

test("a deep phone band reads from the top of the photograph", () => {
  const fn = src.slice(src.indexOf("function HeroCarousel("));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(/objectPosition: "50% 0%"/.test(body),
    "the crop is back in the middle of the picture, where the heads are not");
});

test("the zoom grows from the top too, or the crop is undone", () => {
  // .hc-slide.on img scales to 1.12. About the default centre origin that
  // pushes the head back off the top edge - object-position alone fixes
  // nothing. The two have to agree.
  const fn = src.slice(src.indexOf("function HeroCarousel("));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(/transformOrigin: "50% 0%"/.test(body),
    "the zoom still grows out of the middle, which cancels the new crop");
  const frame = /const frame = [^;]+;/.exec(body)?.[0] || "";
  assert.ok(/objectPosition/.test(frame) && /transformOrigin/.test(frame),
    "the two are set separately and can drift apart");
});

test("the framing is applied to the slides, not just worked out", () => {
  const fn = src.slice(src.indexOf("function HeroCarousel("));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(/<img [^>]*style=\{frame\}/.test(body), "the photo slides ignore the framing");
  assert.ok(/style=\{frame\} preload=/.test(body),
    "a video slide would still be cropped through the middle");
});

test("it is off unless asked for", () => {
  const fn = src.slice(src.indexOf("function HeroCarousel("));
  assert.ok(/focusTop = false/.test(fn.slice(0, fn.indexOf(") {"))),
    "every caller now gets top-anchored framing whether it suits them or not");
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(/focusTop \?/.test(body) && /: undefined/.test(body),
    "the style is applied unconditionally");
});

test("the web panel keeps the middle of the picture", () => {
  // The web panel is the full-height left half: taller than wide, so the whole
  // height of a square photo is already on screen. Anchoring it to the top
  // would cut the feet off for no gain.
  assert.ok(/focusTop=\{!wide && bandHeight >= 160\}/.test(src),
    "the web panel is being top-anchored too, or the phone band is not");
});

test("the 92px strip is left centred", () => {
  // Same expression as the line above - it is the `bandHeight >= 160` half
  // that keeps the strip out. A 92px band can hold no one at any crop, and
  // anchoring it to the top fills it with foreheads.
  const m = /focusTop=\{([^}]*)\}/.exec(src);
  assert.ok(m, "nothing decides where the band looks");
  assert.ok(/bandHeight >= 160/.test(m[1]),
    "the shallow sign-up strip is now top-anchored, which is worse than centred");
});

test("the deep band and its furniture agree on what deep means", () => {
  // chrome and focusTop both mean "this band is big enough to hold something".
  // One threshold, so a band can never get the caption pill but not the
  // framing, or the other way round.
  const chrome = /chrome=\{([^}]*)\}/.exec(src)?.[1] || "";
  const focus = /focusTop=\{([^}]*)\}/.exec(src)?.[1] || "";
  const bar = /bandHeight >= (\d+)/;
  assert.equal(bar.exec(chrome)?.[1], bar.exec(focus)?.[1],
    "the two have drifted to different heights");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
