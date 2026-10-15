// Where an exercise's demonstration photo comes from.
//
// Three sources answer the same question and the order between them is the
// whole feature: a coach who goes and shoots a better Back Squat has to see
// THEIR photo, not the stock one, or the upload button is a lie. And the
// no-photo flag has to agree with what the picture lookup actually finds, or
// the Photos Needed list sends a coach out to shoot something that already
// has one.
import assert from "node:assert/strict";
import { load, grab } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const src = await import("node:fs").then(fs => fs.promises.readFile(APP, "utf8"));

const H = await load(APP, [
  "normalizeExerciseName", "missingImageNames", "canCurateExercisePhotos",
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---------- the name is the key, so the matching has to be forgiving ----------

test("case, punctuation and spacing don't change the key", () => {
  const k = H.normalizeExerciseName("Barbell Bench Press");
  assert.equal(H.normalizeExerciseName("barbell bench press"), k);
  assert.equal(H.normalizeExerciseName("Barbell  Bench-Press"), k);
  assert.equal(H.normalizeExerciseName("BARBELL BENCH PRESS!"), k);
});

test("a parenthetical variant note resolves to the same movement", () => {
  assert.equal(
    H.normalizeExerciseName("Sled Push (Heavy)"),
    H.normalizeExerciseName("Sled Push"),
  );
});

test("different movements keep different keys", () => {
  assert.notEqual(
    H.normalizeExerciseName("Front Squat"),
    H.normalizeExerciseName("Back Squat"),
  );
});

// ---------- the lookup order is the feature ----------

test("a coach's own photo is checked before the built-in one", () => {
  const fn = src.slice(src.indexOf("function exerciseImage(name)"), src.indexOf("async function loadExercisePhotos"));
  const uploaded = fn.indexOf("UPLOADED_EXERCISE_PHOTOS[key]");
  const builtinExact = fn.indexOf("EXERCISE_IMAGES[name]");
  const builtinFuzzy = fn.indexOf("EXERCISE_IMAGE_INDEX[key]");
  assert.ok(uploaded > -1 && builtinExact > -1 && builtinFuzzy > -1, "a source is missing from the lookup");
  assert.ok(uploaded < builtinExact, "the built-in photo would win over the coach's own");
  assert.ok(builtinExact < builtinFuzzy, "an exact name should beat a normalised match");
});

test("the no-photo flag asks the same question the picture does", () => {
  assert.ok(/function hasExerciseImage\(name\) \{\s*return !!exerciseImage\(name\);/.test(src),
    "hasExerciseImage must be derived from exerciseImage, not a second opinion");
});

test("Photos Needed skips anything that already resolves", () => {
  const have = new Set(["back squat", "sled push"]);
  const hasImage = (n) => have.has(H.normalizeExerciseName(n));
  assert.deepEqual(
    H.missingImageNames(
      [{ name: "Back Squat" }, { name: "Copenhagen Plank" }, { name: "Sled Push (Heavy)" }, { name: "Zercher ISO" }],
      { hasImage },
    ),
    ["Copenhagen Plank", "Zercher ISO"],
  );
});

test("Photos Needed lists a movement once, however often it appears", () => {
  const hasImage = () => false;
  assert.deepEqual(
    H.missingImageNames([{ name: "Dead Bugs" }, { name: "dead bugs" }, { name: "Dead  Bugs" }], { hasImage }),
    ["Dead Bugs"],
  );
});

// ---------- who is allowed to change the shared library ----------

test("a coach may curate", () => {
  assert.equal(canCurate({ coachProfile: { id: "abc" } }), true);
});

test("an athlete may not - the athlete hydrate nulls the id", () => {
  assert.equal(canCurate({ coachProfile: { id: null, name: "Coach" } }), false);
  assert.equal(canCurate({ coachProfile: {} }), false);
  assert.equal(canCurate({}), false);
  assert.equal(canCurate(null), false);
});

function canCurate(state) { return H.canCurateExercisePhotos(state); }

// ---------- uploads must not leave litter ----------

test("a failed row write removes the file it just uploaded", () => {
  const fn = src.slice(src.indexOf("async function uploadExercisePhoto"), src.indexOf("function canCurateExercisePhotos") + 1);
  const body = src.slice(src.indexOf("async function uploadExercisePhoto"));
  const upto = body.slice(0, body.indexOf("\n}\n"));
  assert.ok(/if \(rowErr\)/.test(upto), "the row write is not checked");
  assert.ok(/\.remove\(\[path\]\)/.test(upto), "an orphaned file would be left in the bucket");
});

test("the stored file name is random, not the exercise name", () => {
  const body = src.slice(src.indexOf("async function uploadExercisePhoto"));
  const upto = body.slice(0, body.indexOf("\n}\n"));
  assert.ok(/crypto\.randomUUID\(\)/.test(upto),
    "a public bucket with guessable paths would make the library browsable");
});

test("photos are shrunk before they are sent", () => {
  const body = src.slice(src.indexOf("async function uploadExercisePhoto"));
  const upto = body.slice(0, body.indexOf("\n}\n"));
  assert.ok(/shrinkImage\(file\)/.test(upto), "a 5MB phone photo would be uploaded as-is");
});

// ---------- moving the built-in photos out of the bundle ----------
//
// 1.9MB of base64 thumbnails ship inside App.jsx, which every athlete
// downloads on every cold load whether or not they open a single exercise.
// The migration lifts them into storage so the block can come out of the
// code. It runs once, over a phone connection, against a coach's whole
// library - so the two things that matter are that it never clobbers a photo
// the coach shot themselves, and that one bad upload doesn't cost them the
// other sixty-five.

const migrateSrc = grab(src, "migrateBuiltInPhotos");

function harness({ images, uploaded = {}, uploadFails = [], rowFails = [] }) {
  const uploads = [], removed = [], rows = [], progress = [];
  let n = 0;

  const bucket = {
    upload: async (p) => uploadFails.includes(p.split("/")[0])
      ? (uploads.push(p), { error: new Error("upload failed") })
      : (uploads.push(p), { error: null }),
    remove: async (paths) => { removed.push(...paths); return { error: null }; },
    getPublicUrl: (p) => ({ data: { publicUrl: `https://cdn.test/${p}` } }),
  };
  const table = {
    upsert: async (row) => {
      rows.push(row);
      return rowFails.includes(row.name_key) ? { error: new Error("row failed") } : { error: null };
    },
  };
  const deps = {
    EXERCISE_IMAGES: images,
    UPLOADED_EXERCISE_PHOTOS: uploaded,
    EXERCISE_PHOTO_BUCKET: "exercise-photos",
    normalizeExerciseName: H.normalizeExerciseName,
    supabase: { storage: { from: () => bucket }, from: () => table },
    crypto: { randomUUID: () => `uuid-${++n}` },
    fetch: async (uri) => ({ blob: async () => ({ uri, size: 29000 }) }),
    console: { error: () => {} },
  };
  const run = new Function(...Object.keys(deps), `${migrateSrc}\nreturn migrateBuiltInPhotos;`)(...Object.values(deps));
  return { run, uploads, removed, rows, progress, uploaded, onProgress: (d, t) => progress.push([d, t]) };
}

const IMAGES = { "Back Squat": "data:image/jpeg;base64,AAA", "Sled Push": "data:image/jpeg;base64,BBB", "Dead Bugs": "data:image/jpeg;base64,CCC" };

test("every built-in photo lands in storage and in the lookup map", async () => {
  const h = harness({ images: IMAGES });
  const r = await h.run("coach-1", h.onProgress);
  assert.deepEqual(r, { total: 3, moved: 3, skipped: 0, failed: 0 });
  assert.equal(h.uploads.length, 3);
  assert.equal(Object.keys(h.uploaded).length, 3);
  assert.ok(h.uploaded[H.normalizeExerciseName("Back Squat")].startsWith("https://cdn.test/"));
});

test("a photo the coach already shot is never overwritten", async () => {
  const key = H.normalizeExerciseName("Back Squat");
  const uploaded = { [key]: "https://cdn.test/mine.jpg" };
  const h = harness({ images: IMAGES, uploaded });
  const r = await h.run("coach-1", h.onProgress);
  assert.equal(r.skipped, 1);
  assert.equal(r.moved, 2);
  assert.equal(uploaded[key], "https://cdn.test/mine.jpg", "the stock photo replaced the coach's own");
  assert.ok(!h.uploads.some(p => p.startsWith(key.replace(/\s+/g, "-") + "/")), "it was uploaded anyway");
});

test("a failed row write takes its file back out of the bucket", async () => {
  const key = H.normalizeExerciseName("Sled Push");
  const h = harness({ images: IMAGES, rowFails: [key] });
  const r = await h.run("coach-1", h.onProgress);
  assert.equal(r.failed, 1);
  assert.equal(h.removed.length, 1, "an orphaned file was left behind");
  assert.ok(h.removed[0].startsWith(key.replace(/\s+/g, "-") + "/"));
  assert.equal(h.uploaded[key], undefined, "a row that never saved would still show a photo until reload");
});

test("one bad upload doesn't abandon the rest of the library", async () => {
  const h = harness({ images: IMAGES, uploadFails: [H.normalizeExerciseName("Back Squat").replace(/\s+/g, "-")] });
  const r = await h.run("coach-1", h.onProgress);
  assert.equal(r.failed, 1);
  assert.equal(r.moved, 2, "the run stopped at the first failure");
});

test("a second run finishes only what failed the first time", async () => {
  const uploaded = {};
  const first = harness({ images: IMAGES, uploaded, rowFails: [H.normalizeExerciseName("Dead Bugs")] });
  await first.run("coach-1", first.onProgress);
  const second = harness({ images: IMAGES, uploaded });
  const r = await second.run("coach-1", second.onProgress);
  assert.deepEqual(r, { total: 3, moved: 1, skipped: 2, failed: 0 });
});

test("progress is reported for every name, skips included", async () => {
  const h = harness({ images: IMAGES, uploaded: { [H.normalizeExerciseName("Back Squat")]: "x" } });
  await h.run("coach-1", h.onProgress);
  assert.deepEqual(h.progress, [[1, 3], [2, 3], [3, 3]],
    "a skipped photo that reports nothing leaves the bar stalled");
});

test("each stored file gets its own random name", async () => {
  const h = harness({ images: IMAGES });
  await h.run("coach-1", h.onProgress);
  assert.equal(new Set(h.uploads).size, 3);
  for (const p of h.uploads) assert.ok(/\/uuid-\d+\.jpg$/.test(p), p);
});

test("the row records who uploaded it and what it is called", async () => {
  const h = harness({ images: IMAGES });
  await h.run("coach-99", h.onProgress);
  const row = h.rows.find(r => r.display_name === "Back Squat");
  assert.ok(row, "the human-readable name was dropped");
  assert.equal(row.uploaded_by, "coach-99");
  assert.equal(row.name_key, H.normalizeExerciseName("Back Squat"));
});

test("it runs without a progress callback at all", async () => {
  const h = harness({ images: IMAGES });
  const r = await h.run("coach-1");
  assert.equal(r.moved, 3);
});

// ---------- the button that starts it ----------

const coachProfile = src.slice(src.indexOf("function CoachProfile("), src.indexOf("// ATHLETE PORTAL"));

test("the card counts what is left, not the whole library", () => {
  assert.ok(/stillInCode > 0 &&/.test(coachProfile),
    "the card would sit on the profile forever after the job was done");
  assert.ok(/filter\(n => !UPLOADED_EXERCISE_PHOTOS\[normalizeExerciseName\(n\)\]\)/.test(coachProfile),
    "the count must exclude photos that already moved");
});

test("the button can't be double-tapped into two concurrent runs", () => {
  assert.ok(/disabled=\{migrating \|\| !coach\.id\}/.test(coachProfile));
  assert.ok(/if \(migrating \|\| !coach\.id\) return;/.test(coachProfile));
});

test("a partial run still refreshes the screens showing photos", () => {
  // Anchored on runMigration, not on the first "} finally {" in the component.
  // Coach branding added a logo upload with its own try/finally ABOVE this one,
  // and a first-match slice silently started reading that instead - the test
  // failed while the code was correct.
  const run = coachProfile.slice(coachProfile.indexOf("const runMigration ="));
  assert.ok(run.startsWith("const runMigration ="), "runMigration is gone");
  const finallyBlock = run.slice(run.indexOf("} finally {"), run.indexOf("} finally {") + 260);
  assert.ok(/setMigrating\(false\)/.test(finallyBlock),
    "this is not the migration's finally block - the anchor has drifted again");
  assert.ok(/photoVersion: \(s2\.photoVersion \|\| 0\) \+ 1/.test(finallyBlock),
    "bumping photoVersion only on success leaves moved photos invisible after a partial run");
});

// ---------- matching a name a coach actually typed ----------
//
// Coaches do not spell movements the way the library does. Lia's program says
// "KB Swings"; the library says "Kettlebell Swing Complex". Same movement, same
// photo, and before this the tile was blank. The rules that close that gap have
// to stay conservative: a wrong photo teaches the wrong movement, which is
// worse for an athlete than no photo at all.

function matcher(libraryNames, uploaded = {}) {
  const parts = ["EXERCISE_ABBREV", "EXERCISE_FILLER", "EXERCISE_QUALIFIERS"]
    .map(n => grab(src, n, "const"))
    .concat(["exerciseTokens", "findExercisePhoto", "photoMatchIndex"].map(n => grab(src, n)));
  const mod = `
    const EXERCISE_IMAGES = Object.fromEntries(${JSON.stringify(libraryNames)}.map(n => [n, "lib:" + n]));
    const UPLOADED_EXERCISE_PHOTOS = ${JSON.stringify(uploaded)};
    let PHOTO_MATCH_CACHE = null, PHOTO_MATCH_COUNT = -1;
    ${parts.join("\n")}
    export { findExercisePhoto, exerciseTokens };`;
  return import("data:text/javascript;base64," + Buffer.from(mod).toString("base64"));
}
const LIB = ["Kettlebell Swing Complex", "Dead Bugs", "Romanian Deadlift", "Single Arm Dumbbell Row",
             "Sled Push (Heavy)", "Scapular Push Ups", "Scapular Pull Ups", "Band Pull Aparts",
             "Back Squat", "Front Squat", "Sprints", "World's Greatest Stretch"];
const find = async (name, uploaded) =>
  ((await matcher(LIB, uploaded)).findExercisePhoto(name) || "").replace("lib:", "") || null;

test("an abbreviation reaches the movement it stands for", async () => {
  assert.equal(await find("KB Swings"), "Kettlebell Swing Complex");
});

test("word order does not matter", async () => {
  assert.equal(await find("Dumbbell Single-Arm Row"), "Single Arm Dumbbell Row");
});

test("singular and plural are the same movement", async () => {
  assert.equal(await find("Band Pull-Apart"), "Band Pull Aparts");
});

test("a choice of two takes the first", async () => {
  assert.equal(await find("Sled Push or Wall ISO"), "Sled Push (Heavy)");
});

test("a variation borrows its base movement's photo", async () => {
  assert.equal(await find("Banded Dead Bugs"), "Dead Bugs");
  assert.equal(await find("Dumbbell Romanian Deadlift"), "Romanian Deadlift");
});

test("a single-leg lift does NOT borrow the two-leg photo", async () => {
  assert.equal(await find("Single-Leg Romanian Deadlift"), null,
    "showing a two-leg RDL for a single-leg RDL has the athlete load it wrong");
  assert.equal(await find("Kettlebell Single-Leg Romanian Deadlift"), null);
});

test("the general name never claims the specific one's photo", async () => {
  assert.equal(await find("Push Ups"), null, "Push Ups must not reach Scapular Push Ups");
});

test("push and pull are never confused", async () => {
  const m = await matcher(["Scapular Pull Ups"]);
  assert.equal(m.findExercisePhoto("Scapular Push Ups"), null);
});

test("front and back squats stay apart", async () => {
  assert.equal(await find("Front Squat"), "Front Squat");
  assert.equal(await find("Back Squat"), "Back Squat");
});

test("a one-word library name cannot claim everything it appears in", async () => {
  assert.equal(await find("Hill Sprints With Sled"), null,
    "'Sprints' is one word - letting it match by containment would blanket the library");
});

test("the coach's own photo wins a loose match too", async () => {
  const key = H.normalizeExerciseName("Dead Bugs");
  // Without an upload the built-in answers; with one, the coach's own shot has
  // to win here exactly as it does on an exact name, or the upload is a lie.
  assert.equal(await find("Banded Dead Bugs"), "Dead Bugs");
  const m = await matcher(LIB, { [key]: "mine.jpg" });
  assert.equal(m.findExercisePhoto("Banded Dead Bugs"), "mine.jpg");
});

test("a name of nothing but filler resolves to nothing", async () => {
  assert.equal(await find("(optional)"), null);
  assert.equal(await find(""), null);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
