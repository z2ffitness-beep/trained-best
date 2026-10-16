// Who can read a profile.
//
// The policy being replaced was, in full, `auth.role() = 'authenticated'`.
// Any signed-in athlete could read every row of public.profiles through the
// API with the anon key that ships in the browser. Across the 11 profiles on
// 15 Oct that was 10 email addresses, 6 birthdays, 2 sets of injury notes,
// plus everyone's name, sex, weight, height, goals and injuries, and the
// coach invite code. Nothing in the app did it. Nothing stopped it either.
//
// This file guards the fix, which is in two halves that have to agree:
// migration 004 narrows the policy, and the client stops reading the coach's
// row directly. Ship one without the other and either the coach's name
// disappears from every athlete's screen, or the hole stays open.
//
// The migration is deliberately NOT applied. Unlike 002 and 003 it changes
// who can read what on a live table, so it goes in at merge time with the
// code that matches it. The client carries a fallback so the two can ship in
// either order without a window where the app is broken — and that fallback
// is itself tested here, because a fallback nobody checks is a fallback that
// has quietly become the only path.
import assert from "node:assert/strict";
import { readSource } from "./extract.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src", "App.jsx");
const MIGRATION = path.join(here, "..", "supabase", "migrations", "004_lock_down_profiles.sql");

const src = readSource(APP);
const sql = readSource(MIGRATION);
// The header quotes the old policy word for word so the next reader knows
// what was wrong. Assertions about what the migration DOES have to look at
// the statements, not at the prose describing them.
const code = sql.split("\n").filter(line => !/^\s*--/.test(line)).join("\n");

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---------- the migration ----------

test("the blanket read policy is dropped", () => {
  assert.ok(/drop policy if exists "Profiles are viewable by authenticated users" on public\.profiles;/.test(code),
    "the policy that lets every athlete read every profile is still there");
});

test("what replaces it is two narrow policies and nothing wider", () => {
  assert.ok(/using \(auth\.uid\(\) = id\)/.test(code), "nobody can read their own profile");
  assert.ok(/using \(coach_id = auth\.uid\(\)\)/.test(code), "a coach cannot read their own athletes");
  // The failure mode worth guarding: writing a new policy that is just as
  // wide as the one being removed.
  assert.ok(!/auth\.role\(\) = 'authenticated'/.test(code),
    "the replacement policy is as open as the one it replaces");
  assert.ok(!/using \(true\)/.test(code), "a policy was written as `using (true)`");
  // Two select policies on one table are OR'd together. A third would widen
  // the result without either of these two changing.
  assert.equal((code.match(/^create policy /gm) || []).length, 2,
    "the number of read policies on profiles has changed");
});

test("the coach's row is reached by function, not by policy", () => {
  // Row level security is ROW level: it cannot hide a column. A policy that
  // lets an athlete read their coach's row hands over the coach's intake
  // blob too, which holds their email and birthday.
  assert.ok(!/using \(id = .*coach/i.test(code),
    "there is a policy letting athletes read their coach's whole row");
  assert.ok(/create or replace function public\.coach_card\(p_id uuid\)/.test(code),
    "there is no coach_card function");
});

test("coach_card returns the eight fields the screen uses and no others", () => {
  const signature = code.slice(code.indexOf("returns table ("), code.indexOf(")\nlanguage sql"));
  const columns = [...signature.matchAll(/^\s{2}(\w+)\s/gm)].map(m => m[1]);
  assert.deepEqual(columns, [
    "id", "name", "avatar", "photo_url",
    "business_name", "brand_color", "logo_path",
    "accountability_enabled", "cancellation_hours",
  ]);
  // The two that matter by their absence.
  assert.ok(!columns.includes("intake"), "coach_card hands back the whole intake blob");
  assert.ok(!columns.includes("email"), "coach_card hands back an email address");
});

test("coach_card answers only to that coach's own athletes", () => {
  const body = code.slice(code.indexOf("as $$"), code.indexOf("$$;"));
  assert.ok(/where p\.id = p_id/.test(body), "it does not filter to the coach asked for");
  assert.ok(/me\.id = auth\.uid\(\) and me\.coach_id = p\.id/.test(body),
    "any authenticated user can read any coach's card");
});

test("coach_card is security definer, and reachable only when signed in", () => {
  // Security definer is what lets it read a row the caller cannot, and is
  // also what makes the grant below load-bearing rather than cosmetic.
  const fn = code.slice(code.indexOf("create or replace function public.coach_card"), code.indexOf("$$;"));
  assert.ok(/security definer/.test(fn), "it runs as the caller, so it can see nothing");
  assert.ok(/set search_path = public/.test(fn),
    "no fixed search_path, which is how a security definer function gets hijacked");
  const revokeAt = code.indexOf("revoke all on function public.coach_card(uuid) from public, anon;");
  const grantAt = code.indexOf("grant execute on function public.coach_card(uuid) to authenticated;");
  assert.ok(revokeAt > 0, "anonymous callers can read coach cards");
  assert.ok(grantAt > 0, "signed-in users cannot call it, so the coach's name never loads");
  // Order matters: `revoke all` after the grant takes the grant straight back
  // out again, and the symptom is the coach card silently never loading.
  assert.ok(revokeAt < grantAt, "the revoke comes after the grant and undoes it");
});

test("the migration says out loud that it is not applied yet", () => {
  // 002 and 003 only added things and were applied on the spot. This one
  // changes access control on a live table, and applying it ahead of the
  // code that matches it breaks every athlete's coach card.
  assert.ok(/NOT YET APPLIED/.test(sql), "nothing warns that this one is different");
});

// ---------- the client half ----------

test("the athlete's screen asks for a card, not for the row", () => {
  assert.ok(/\.rpc\("coach_card", \{ p_id: profile\.coach_id \}\)/.test(src),
    "the app still reads the coach's profile row directly");
});

test("the two settings the screen needs survive the change of shape", () => {
  // coach_card returns them as columns; the rest of the app reads them off
  // an `intake` object. The adapter is small and easy to drop.
  const at = src.indexOf('.rpc("coach_card"');
  const block = src.slice(at - 200, at + 700);
  assert.ok(/accountabilityEnabled: cardRow\.accountability_enabled/.test(block),
    "accountability is lost, so athletes get check-in prompts their coach switched off");
  assert.ok(/cancellationHours: cardRow\.cancellation_hours/.test(block),
    "the cancellation window is lost, so the app quotes the wrong notice period");
});

test("the old read stays as a fallback until the migration lands", () => {
  // Until 004 is applied the function does not exist and the RPC errors.
  // Without this the coach's name and logo vanish from every athlete's
  // screen the moment the code deploys.
  const at = src.indexOf('.rpc("coach_card"');
  const block = src.slice(at, at + 1100);
  assert.ok(/cardError/.test(block), "the RPC's failure is never checked");
  assert.ok(/\.from\("profiles"\)[\s\S]{0,200}\.eq\("id", profile\.coach_id\)/.test(block),
    "there is no fallback, so the app breaks if it ships before the migration");
});

test("signup never depended on the blanket policy anyway", () => {
  // resolveCoachInvite runs before the athlete is linked to anyone and,
  // when email confirmation is on, before they have a session at all. It
  // already goes through its own security definer RPC.
  assert.ok(/supabase\.rpc\("coach_by_invite_code", \{ p_code: clean \}\)/.test(src),
    "the invite lookup reads profiles directly, so locking the table breaks signup");
});

test("every other cross-athlete read is one the new policies still allow", () => {
  // Two shapes are legitimate: your own row, and rows whose coach_id is you.
  // Anything else would be broken by this migration and has to be found now
  // rather than by an athlete.
  const reads = [...src.matchAll(/\.from\("profiles"\)\s*\n?\s*\.select\(([^)]*)\)([\s\S]{0,220})/g)];
  assert.ok(reads.length >= 3, `only found ${reads.length} profile reads - the pattern has drifted`);
  for (const [, , after] of reads) {
    const ok = /\.eq\("id", (session\.user\.id|signInData\.user\.id|state\.me\.id|profile\.coach_id)\)/.test(after)
            || /\.eq\("coach_id", (authUserId|profile\.id)\)/.test(after);
    assert.ok(ok, `a profile read is scoped to neither your own row nor your athletes:\n${after.slice(0, 160)}`);
  }
});

// ---------- what the rehearsal found ----------

test("the numbers this was checked against are written down", () => {
  // Rehearsed read-only against the live database on 15 Oct, before
  // applying anything: 11 rows readable by anyone signed in, dropping to 1
  // per athlete and 6 for the coach, with all 5 coached athletes still able
  // to load their coach's card and 0 able to load anyone else's.
  //
  // Recorded in the migration so the next person can tell whether the
  // result matched the intent, instead of guessing.
  assert.ok(/11 profiles on 15 Oct/.test(sql), "the rehearsal's starting point is not recorded");
  assert.ok(/10 email addresses/.test(sql), "what was exposed is not recorded");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
