// Photos and clips in the message thread.
//
// "Your knee is caving in on the second rep" is worth less than the same
// sentence with the clip attached, and a client asking "is this bar position
// right" cannot ask it in words at all.
//
// The server half is migration 006, which _verify/sql runs against a real
// Postgres. This file holds the client half, where the failures are
// different in kind and all of them are quiet:
//
//   A file uploaded and then orphaned, because the row it belonged to never
//   saved. Nobody can reach it, nobody can clean it up, and it counts
//   against storage for ever.
//
//   A row saved pointing at a file that never uploaded. That one is worse:
//   it is a permanent broken frame in the conversation, and the sender
//   cannot fix it because a message's body cannot be edited and its media
//   cannot be replaced.
//
//   "Delete for everyone" that leaves the photo in the bucket, reachable by
//   anyone who already has the signed URL. A promise the app does not keep.
import assert from "node:assert/strict";
import { readSource, load } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const MIG = path.join(here, "..", "supabase", "migrations", "006_message_media.sql");
const src = readSource(APP);
const sql = readSource(MIG);

const {
  messageMediaKind, messageMediaError,
  MESSAGE_MEDIA_MAX_BYTES, MESSAGE_IMAGE_TYPES, MESSAGE_VIDEO_TYPES,
  MESSAGE_MEDIA_BUCKET, MESSAGE_MEDIA_URL_TTL,
} = await load(APP, [
  { name: "MESSAGE_MEDIA_BUCKET", kind: "const" },
  { name: "MESSAGE_MEDIA_MAX_BYTES", kind: "const" },
  { name: "MESSAGE_IMAGE_TYPES", kind: "const" },
  { name: "MESSAGE_VIDEO_TYPES", kind: "const" },
  { name: "MESSAGE_MEDIA_URL_TTL", kind: "const" },
  "messageMediaKind", "messageMediaError",
]);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const file = (over = {}) => ({ name: "clip.mp4", type: "video/mp4", size: 1024, ...over });

// ---------- image or video ----------

test("every type the bucket accepts is recognised", () => {
  // The two lists have to agree or a file the bucket would have taken is
  // refused in the app, which reads as the app being broken.
  for (const type of MESSAGE_IMAGE_TYPES) {
    assert.equal(messageMediaKind(file({ type, name: "x" })), "image", type);
  }
  for (const type of MESSAGE_VIDEO_TYPES) {
    assert.equal(messageMediaKind(file({ type, name: "x" })), "video", type);
  }
});

test("the app's list matches the bucket's list exactly", () => {
  // Read out of the migration, so adding a type in one place and not the
  // other fails here rather than in somebody's hand.
  const at = sql.indexOf("array['image/jpeg'");
  const list = sql.slice(at, sql.indexOf("]", at));
  for (const type of [...MESSAGE_IMAGE_TYPES, ...MESSAGE_VIDEO_TYPES]) {
    assert.ok(list.includes(`'${type}'`), `the bucket does not accept ${type}, which the app offers`);
  }
  const inBucket = [...list.matchAll(/'([a-z]+\/[a-z0-9.+-]+)'/g)].map(m => m[1]);
  for (const type of inBucket) {
    assert.ok([...MESSAGE_IMAGE_TYPES, ...MESSAGE_VIDEO_TYPES].includes(type),
      `the bucket accepts ${type} and the app never offers it`);
  }
});

test("a file with no type is guessed from its name", () => {
  // Some Android browsers hand over an empty type for a freshly captured
  // file. Refusing those would mean a photo taken in the app cannot be sent.
  assert.equal(messageMediaKind({ name: "IMG_0421.HEIC", type: "", size: 10 }), "image");
  assert.equal(messageMediaKind({ name: "VID_0007.MOV", type: "", size: 10 }), "video");
  assert.equal(messageMediaKind({ name: "squat.mp4", type: undefined, size: 10 }), "video");
});

test("something that is neither is neither", () => {
  for (const f of [
    { name: "notes.pdf", type: "application/pdf", size: 10 },
    { name: "song.mp3", type: "audio/mpeg", size: 10 },
    { name: "noextension", type: "", size: 10 },
    null, undefined,
  ]) {
    assert.equal(messageMediaKind(f), null, JSON.stringify(f));
  }
});

// ---------- refused before the upload, not after ----------

test("an oversized file is refused, and the message says by how much", () => {
  // Refused here, before the upload. A 150MB clip rejected by the bucket
  // after two minutes of uploading on gym wifi is the same refusal
  // delivered at the worst possible moment.
  const big = file({ size: MESSAGE_MEDIA_MAX_BYTES + 1 });
  const msg = messageMediaError(big);
  assert.ok(msg, "an oversized file was accepted");
  assert.match(msg, /\d+MB/);
});

test("a file one byte over does not report the same size as the limit", () => {
  // Rounded UP. "That file is 100MB, keep it under 100MB" reads as a bug.
  const limitMb = Math.floor(MESSAGE_MEDIA_MAX_BYTES / 1048576);
  const msg = messageMediaError(file({ size: MESSAGE_MEDIA_MAX_BYTES + 1 }));
  const stated = Number(msg.match(/is (\d+)MB/)[1]);
  assert.ok(stated > limitMb, `reported ${stated}MB against a limit of ${limitMb}MB`);
});

test("a file exactly on the limit is allowed", () => {
  assert.equal(messageMediaError(file({ size: MESSAGE_MEDIA_MAX_BYTES })), null);
});

test("the app's limit is not larger than the bucket's", () => {
  // Larger here means the app waves through a file the bucket then refuses,
  // after the upload. The numbers have to agree.
  const bucketLimit = Number(/'message-media', false, (\d+),/.exec(sql)?.[1]);
  assert.ok(Number.isFinite(bucketLimit), "the bucket's size limit is not where this test reads it");
  assert.ok(MESSAGE_MEDIA_MAX_BYTES <= bucketLimit,
    `the app allows ${MESSAGE_MEDIA_MAX_BYTES} bytes and the bucket allows ${bucketLimit}`);
});

test("a type the thread cannot show is refused with a readable reason", () => {
  const msg = messageMediaError({ name: "notes.pdf", type: "application/pdf", size: 10 });
  assert.ok(msg && /photo or a video/i.test(msg), `the reason given was: ${msg}`);
});

test("nothing picked is its own message", () => {
  assert.match(messageMediaError(null), /Pick a photo or a clip/);
});

// ---------- the path says whose thread it is ----------

test("the file is filed under the THREAD, not the uploader", () => {
  // In a form check only the athlete uploads, so "whose file" and "who sent
  // it" are the same question. In a thread both people upload, and keying
  // on the uploader would force the storage policy to answer "is the sender
  // in a conversation with me", which needs the message row. Keying on the
  // thread makes it one comparison on the path alone.
  const fn = src.slice(src.indexOf("async function uploadMessageMedia("), src.indexOf("async function signMessageMedia("));
  assert.ok(/const path = `\$\{athleteId\}\/\$\{clientId\(\)\}\.\$\{safeExtension\}`;/.test(fn),
    "the path is not <athlete>/<id>.<ext>, which is what the storage policy reads");
  assert.ok(!/myUserId|senderId|auth\.uid/.test(fn), "the path is keyed on the sender");
});

test("the policy and the client agree about what the first segment means", () => {
  assert.ok(/in_thread_with\(\(\(storage\.foldername\(objects\.name\)\)\[1\]\)::uuid\)/.test(sql),
    "the storage policy reads a different part of the path than the client writes");
});

test("a signed URL, not a public one, and not a permanent one", () => {
  const fn = src.slice(src.indexOf("async function signMessageMedia("), src.indexOf("async function signMessageMedia(") + 500);
  assert.ok(/createSignedUrl\(storagePath, MESSAGE_MEDIA_URL_TTL\)/.test(fn),
    "media is served from a public URL or an unexpiring one");
  assert.ok(MESSAGE_MEDIA_URL_TTL > 0 && MESSAGE_MEDIA_URL_TTL <= 24 * 60 * 60,
    `the signed URL lasts ${MESSAGE_MEDIA_URL_TTL} seconds`);
  assert.ok(/'message-media', 'message-media', false,/.test(sql), "the bucket is public");
});

// ---------- the two ways a message and its file come apart ----------

const sendFn = src.slice(src.indexOf("  const send = async (body, file = null) => {"),
                         src.indexOf("  // Withdraw your OWN message from both sides."));

test("the file is uploaded BEFORE the row is written", () => {
  // The other order leaves a row pointing at a file that may never arrive,
  // which is a permanent broken frame nobody can fix: the body cannot be
  // edited and the media cannot be replaced.
  assert.ok(sendFn.length > 300, "the send function is not where this test reads it");
  const upAt = sendFn.indexOf("await uploadMessageMedia(file, athleteId)");
  const insertAt = sendFn.indexOf('.from("messages")');
  assert.ok(upAt > 0 && insertAt > 0);
  assert.ok(upAt < insertAt, "the message row is written before the file has uploaded");
  // The guard itself, not just its position. A block that is still in the
  // file but can never run reads exactly the same to an index comparison.
  assert.ok(/let media = null;\n    if \(file\) \{/.test(sendFn),
    "the upload is behind a condition other than whether there is a file");
});

test("a failed upload sends no message at all", () => {
  assert.ok(/if \(up\.error\) \{[\s\S]{0,200}return false;/.test(sendFn),
    "a failed upload still writes a row, pointing at nothing");
  assert.ok(/setError\(up\.error\)/.test(sendFn), "the upload's reason is swallowed");
});

test("a failed row removes the file it already uploaded", () => {
  // Otherwise it is orphaned in the bucket: no row to find it by, nobody
  // able to reach it, and it counts against storage for ever. The same
  // tidy-up uploadFormCheck already does.
  const errBlock = sendFn.slice(sendFn.indexOf("if (sendError) {"));
  assert.ok(/if \(media\) await supabase\.storage\.from\(MESSAGE_MEDIA_BUCKET\)\.remove\(\[media\.path\]\)/.test(errBlock),
    "a file whose message failed to save is left orphaned in the bucket");
});

test("a message can be text, media, or both, but not neither", () => {
  assert.ok(/if \(\(!text && !file\) \|\| !athleteId \|\| !myUserId \|\| sendingRef\.current\) return false;/.test(sendFn),
    "an empty message can be sent, or a photo with no caption cannot");
});

test("the row carries both media fields or neither", () => {
  // The database has a constraint saying so, because a path with no kind is
  // unrenderable and a kind with no path is a broken frame.
  assert.ok(/media_path: media\?\.path \|\| null,/.test(sendFn));
  assert.ok(/media_kind: media\?\.kind \|\| null,/.test(sendFn));
  assert.ok(/check \(\(media_path is null\) = \(media_kind is null\)\)/.test(sql),
    "nothing stops half a media message being written");
});

test("the new columns are selected, or nothing ever renders", () => {
  assert.ok(/const COLS = "[^"]*media_path, media_kind"/.test(src),
    "media_path and media_kind are not read back, so no photo ever appears");
});

test("deleting for everyone takes the file with it", () => {
  // A tombstone over a photo that is still in the bucket, reachable with a
  // signed URL the other person already loaded, is a promise the app does
  // not keep.
  const del = src.slice(src.indexOf("  const deleteForEveryone = async (messageId) => {"),
                        src.indexOf("  // Hide a message from your own view"));
  const rowAt = del.indexOf('.update({ deleted_at: when })');
  const fileAt = del.indexOf("MESSAGE_MEDIA_BUCKET).remove([msg.media_path])");
  assert.ok(fileAt > 0, "the photo stays in the bucket after the message is withdrawn");
  assert.ok(/if \(msg\.media_path\) \{/.test(del),
    "the removal is behind a condition other than whether the message had media");
  // After the row, so a failure leaves a tombstone pointing at a file rather
  // than a live message pointing at nothing.
  assert.ok(rowAt < fileAt, "the file is removed before the row is tombstoned");
});

// ---------- one composer, two threads ----------

const composer = src.slice(src.indexOf("function MessageComposer("), src.indexOf("// One bubble."));

test("both threads use the same composer", () => {
  // The coach's screen and the athlete's screen were already two copies of
  // the same row of controls. Adding a file picker to each separately is
  // how one of them ends up without the size check, or without clearing the
  // picked file after a send.
  assert.equal((src.match(/<MessageComposer\b/g) || []).length, 2,
    "there are not exactly two threads using the shared composer");
  // And neither has kept a hand-rolled one beside it.
  assert.equal((src.match(/placeholder=\{tab === "coach" \? \(hasCoach/g) || []).length, 1);
  assert.ok(!/onKeyDown=\{e => e\.key === "Enter" && submit\(\)\} \/>\s*\n\s*<button onClick=\{submit\} disabled=\{!draft\.trim\(\) \|\| sending\}/.test(src),
    "the coach screen still has its own composer row");
});

test("the picked file is cleared after sending", () => {
  // Without it the next message silently carries the last photo again.
  assert.ok(/setDraft\(""\); clear\(\);/.test(composer), "the attachment survives a send");
});

test("picking the same file twice in a row still works", () => {
  // A file input fires no change event for an identical selection, so the
  // value has to be reset or removing a photo and picking it again does
  // nothing at all.
  assert.ok(/if \(inputRef\.current\) inputRef\.current\.value = "";/.test(composer),
    "re-picking the same file after removing it does nothing");
});

test("a rejected file never becomes the attachment", () => {
  assert.ok(/if \(bad\) \{ setProblem\(bad\); setFile\(null\); return; \}/.test(composer),
    "a file that failed the size or type check is still attached");
});

test("a failed send gives back the text AND the file", () => {
  assert.ok(/if \(!ok\) \{ setDraft\(text\); setFile\(chosen\); \}/.test(composer),
    "a failed send loses what they typed, or the photo they picked");
});

test("the send button is live for a photo with no caption", () => {
  assert.ok(/const ready = \(draft\.trim\(\) \|\| file\) && !disabled && !sending;/.test(composer),
    "a photo cannot be sent without typing something first");
});

test("the AI assistant is offered no attachment button", () => {
  // It is a text model. A photo would upload, cost storage and be ignored.
  assert.ok(/allowMedia = true/.test(composer), "the composer cannot be told to hide the picker");
  assert.ok(/allowMedia=\{tab === "coach" && hasCoach\}/.test(src),
    "the AI tab offers an attachment button, or the coach tab does not");
});

test("switching tabs does not carry a draft across", () => {
  // The two shared one draft, so a half-typed question to the AI was still
  // in the box after switching to the coach - one tap from being sent to a
  // person.
  assert.ok(/<MessageComposer\s*\n\s*key=\{tab\}/.test(src),
    "the composer is not keyed by tab, so the draft follows you between them");
});

// ---------- rendering ----------

const media = src.slice(src.indexOf("function MessageMedia("), src.indexOf("// The attach button"));

test("the URL is signed on render, not stored", () => {
  assert.ok(/signMessageMedia\(path\)/.test(media), "the bubble does not sign the URL");
  // The whole guard: the flag, the check that USES it, and the cleanup that
  // clears it. Any one of the three missing and a URL arriving after the
  // bubble has gone sets state on a dead component.
  assert.ok(/let alive = true;/.test(media), "there is no mounted flag");
  assert.ok(/if \(!alive\) return;/.test(media),
    "the mounted flag is set and then never checked");
  assert.ok(/return \(\) => \{ alive = false; \};/.test(media),
    "the mounted flag is never cleared on unmount");
});

test("a photo that will not load says so", () => {
  // The usual cause is being offline, and a broken frame says "they sent
  // you nothing", which is a different and wrong thing.
  assert.ok(/if \(failed\) \{/.test(media),
    "the fallback is behind a condition other than the load having failed");
  assert.ok(/Couldn't load this \{kind === "video" \? "clip" : "photo"\}/.test(media),
    "a failed load renders as a broken frame");
  // And `failed` is actually set when signing comes back empty.
  assert.ok(/if \(signed\) setUrl\(signed\); else setFailed\(true\);/.test(media),
    "a URL that could not be signed leaves the bubble spinning for ever");
});

test("the thread does not jump as each photo arrives", () => {
  assert.ok(/height: 150/.test(media), "the loading placeholder has no height, so the thread reflows");
});

test("a photo is never cropped to fit the bubble", () => {
  // The first version used object-fit: cover, which fills the bubble by
  // cutting the edges off. Cropping a photo of somebody's bar position
  // removes the thing they are asking about. A letterboxed photo is ugly;
  // a cropped one is wrong.
  assert.ok(!/objectFit: "cover"/.test(media), "a photo is cropped to fill the bubble");
  assert.ok(/maxHeight: 320, maxWidth: "100%", width: "auto"/.test(media),
    "a photo is not capped in both directions at its natural proportions");
});

test("a bubble carrying media is given more room", () => {
  // 75% of a 320px screen leaves about 210px inside the padding, which
  // turns a phone video into a tall thin strip. Measured at 320.
  assert.ok(/m\.media_path \? "max-w-\[86%\]" : "max-w-\[75%\]"/.test(src),
    "the coach's media bubble is the same width as a text one");
  assert.ok(/m\.mediaPath \? "max-w-\[86%\]" : "max-w-\[80%\]"/.test(src),
    "the athlete's media bubble is the same width as a text one");
});

test("video and image render as what they are", () => {
  assert.ok(/kind === "video" \? \(\s*<video/.test(media), "a clip does not render as a video element");
  assert.ok(/<img src=\{url\}/.test(media), "a photo does not render as an image");
  assert.ok(/playsInline/.test(media), "a clip goes full screen on iOS instead of playing in the thread");
});

test("both bubbles render media, and neither leaves a blank line under it", () => {
  // A photo with no caption has an empty body. Rendering the empty div
  // anyway puts a gap under every picture in the thread.
  assert.equal((src.match(/<MessageMedia path=/g) || []).length, 2,
    "one of the two threads does not render media at all");
  assert.ok(/\{m\.body \? <div className="text-\[15px\] whitespace-pre-wrap">\{m\.body\}<\/div> : null\}/.test(src),
    "the coach's bubble leaves a blank line under a caption-less photo");
  assert.ok(/\{m\.text \? <div className="text-\[15px\] whitespace-pre-wrap">\{m\.text\}<\/div> : null\}/.test(src),
    "the athlete's bubble leaves a blank line under a caption-less photo");
});

test("the athlete's bubble reads media off the normalised shape", () => {
  // Not off `raw`, so the AI branch cannot grow a media field by accident
  // and the bubble has one place to look.
  assert.ok(/mediaPath: m\.media_path,\s*\n\s*mediaKind: m\.media_kind,/.test(src),
    "the athlete thread never carries media into the row it renders");
});

// ---------- the migration ----------

test("the column grant is extended, which is the trap", () => {
  // `authenticated` holds COLUMN-LEVEL grants on messages. A new column is
  // covered by neither the INSERT nor the UPDATE grant, so without this
  // every attempt to send a photo fails as a permission error on a column
  // the sender can see on screen - which reads as a bug in the app.
  assert.ok(/grant insert \(media_path, media_kind\) on public\.messages to authenticated;/.test(sql),
    "sending a photo will fail as a permission error");
  assert.ok(!/grant update \([^)]*media_path/.test(sql),
    "media can be swapped under a message after it is sent");
});

test("the migration says out loud that it is not applied", () => {
  assert.ok(/NOT YET APPLIED/.test(sql));
});

test("the two broken storage policies are fixed, and the bug is written down", () => {
  // They compared a profile's id against the first path segment of that
  // profile's DISPLAY NAME instead of the file's path, so the coach branch
  // could never be true. 0 of 11 profiles satisfied it on 16 Oct.
  assert.ok(/drop policy if exists "form_check_files_read" on storage\.objects;/.test(sql));
  assert.ok(/drop policy if exists "progress_photo_read" on storage\.objects;/.test(sql));
  assert.equal((sql.match(/storage\.foldername\(p\.name\)/g) || []).length, 1,
    "the broken expression is still live somewhere, or the explanation of it has been removed");
  // Five: the two fixed read policies, plus message-media's read, insert
  // and delete. Pinned as a number so a policy added later that reads the
  // wrong name shows up here.
  assert.equal((sql.match(/storage\.foldername\(objects\.name\)/g) || []).length, 5,
    "a policy reads a different name than the one this migration standardised on");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
