// Builds a program on the server, so it finishes even when the phone leaves.
//
// Isaiah, 15 Nov: he started a build, switched apps, and came back to "the
// request timed out". /api/chat streams the program straight to the phone,
// and iOS cuts that stream as soon as the app is in the background, so the
// build died with it.
//
// Here the phone sends the request and gets an answer straight away. The
// build carries on on the server (waitUntil keeps the function alive after
// the response), writing its progress and then its result into the
// program_builds row. The phone checks that row whenever it is looking, so
// switching apps, locking the screen or moving to another tab no longer
// matters. Only the person who started a build can read its row.
//
// Same gates as /api/chat: a signed-in session, the model allowlist, the
// token ceiling and the per-user rate limit. No service key: the row is
// written with the caller's own sign-in, under its row level security.
import { waitUntil } from "@vercel/functions";
import {
  ALLOWED_MODELS, DEFAULT_MODEL, FALLBACK_MODEL, MAX_TOKENS_CEILING, MAX_BODY_BYTES,
  rateLimited, getUser, applyCors,
} from "./chat.js";

export const config = { maxDuration: 300 };
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Isaiah, 24 Nov: Rasaam's first program (a fighter, so a big one) stopped
// after 2 of its days and never finished. Vercel stops a function at 300
// seconds, and a big program can take longer than that to write. So one run
// writes for at most RUN_BUDGET_MS, saves what it has, and hands the rest to a
// fresh run of this same function, which carries on from that text. Up to
// MAX_HOPS hand-offs, about 20 minutes in all.
const RUN_BUDGET_MS = Number(process.env.BUILD_RUN_BUDGET_MS) || 230_000;
const MAX_HOPS = 4;
// A build still "running" after this is treated as dead (the function was
// stopped), so a new one may start in its place.
const STALE_MS = 6 * 60_000;
const PROGRESS_EVERY_MS = 3_000;

// Days and exercises written so far, the same counts the app's percentage
// uses (programBuildProgress in App.jsx).
export function progressCounts(text) {
  const t = text || "";
  const starts = [];
  const re = /"exercises"\s*:/g;
  let m;
  while ((m = re.exec(t))) starts.push(m.index);
  const tail = starts.length ? t.slice(starts[starts.length - 1]) : "";
  return { days: starts.length, phases: (tail.match(/"phase"\s*:/g) || []).length, chars: t.length };
}

function supabaseRest(token) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return (path, { method = "GET", body, prefer = "return=minimal" } = {}) => fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Reads Anthropic's stream to the end, reporting the text as it grows.
// shouldStop() true ends it early (the run is out of time); cut tells the
// caller it ended that way, with the text so far.
async function readStream(response, onText, shouldStop = () => false) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let stopReason = null;
  for (;;) {
    if (shouldStop()) {
      try { await reader.cancel(); } catch { /* already closed */ }
      return { text, stopReason: null, cut: true };
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const line = frame.split("\n").find(l => l.startsWith("data:"));
      if (!line) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      let evt;
      try { evt = JSON.parse(raw); } catch { continue; }
      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
        text += evt.delta.text;
        onText(text);
      } else if (evt.type === "message_delta" && evt.delta?.stop_reason) {
        stopReason = evt.delta.stop_reason;
      } else if (evt.type === "error") {
        throw new Error(evt.error?.message || "The AI stopped partway through.");
      }
    }
  }
  return { text, stopReason, cut: false };
}

// The next run's request: the conversation so far plus the text already
// written, as the start of the reply, so the model carries straight on.
// A model that won't take a started reply gets told to continue instead.
const CONTINUE_ASK = "Your reply was cut off. Continue it from exactly the next character after where it stops. Output only the rest: no repeat of anything already written, no code fences, no comment.";
export function continuationMessages(messages, partial, asked) {
  if (!partial) return messages;
  const sofar = { role: "assistant", content: partial };
  return asked ? [...messages, sofar, { role: "user", content: CONTINUE_ASK }] : [...messages, sofar];
}

// Joins a continuation onto the text before it. A started reply joins as is;
// a told-to-continue one may repeat the last few characters or add a fence,
// so those come off.
export function joinContinuation(partial, more, asked) {
  if (!asked) return partial + more;
  let m = more.replace(/^\s*```(?:json)?\s*/i, "");
  const tail = partial.slice(-400);
  for (let n = Math.min(tail.length, m.length); n >= 12; n--) {
    if (tail.endsWith(m.slice(0, n))) { m = m.slice(n); break; }
  }
  return partial + m;
}

async function runBuild({ id, payload, apiKey, rest, partial = "", hop = 0, handOff = null }) {
  const started = Date.now();
  const patch = (body) => rest(`program_builds?id=eq.${id}`, { method: "PATCH", body }).catch(() => null);
  let asked = false;
  const call = (model) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ ...payload, messages: continuationMessages(payload.messages, partial, asked), model, stream: true }),
  });

  try {
    let response = await call(payload.model);
    if (response.status === 404 && payload.model !== FALLBACK_MODEL) {
      console.error("Model", payload.model, "was rejected - retrying on", FALLBACK_MODEL);
      try { await response.arrayBuffer(); } catch { /* nothing to drain */ }
      payload = { ...payload, model: FALLBACK_MODEL };
      response = await call(FALLBACK_MODEL);
    }
    if (partial && response.status === 400) {
      // This model won't take a started reply: ask it to continue instead.
      try { await response.arrayBuffer(); } catch { /* nothing to drain */ }
      asked = true;
      response = await call(payload.model);
    }
    if (!response.ok || !response.body) {
      let data = null;
      try { data = await response.json(); } catch { /* no JSON */ }
      console.error("Anthropic error", response.status, data?.error?.message);
      const message = response.status === 429 ? "The AI is busy right now. Wait a minute and try again."
        : response.status === 401 || response.status === 403 ? "The AI service rejected our request. This is a server-side problem, not your account."
        : "The AI service had a problem building this program. Try again.";
      await patch({ status: "failed", error: message, finished_at: new Date().toISOString() });
      return;
    }

    let lastSent = 0;
    let pending = null;
    const { text: more, stopReason, cut } = await readStream(response, (soFar) => {
      const now = Date.now();
      if (now - lastSent < PROGRESS_EVERY_MS) return;
      lastSent = now;
      pending = patch({ progress: progressCounts(joinContinuation(partial, soFar, asked)) });
    }, () => Date.now() - started > RUN_BUDGET_MS);
    if (pending) await pending;
    const text = joinContinuation(partial, more, asked);

    if (cut) {
      // Out of time for this run: save the text and hand the rest on.
      if (hop >= MAX_HOPS || !handOff) {
        await patch({ status: "failed", error: "This program took too long to write. Tap Try Again.", finished_at: new Date().toISOString() });
        return;
      }
      const saved = await patch({ result: text, progress: progressCounts(text), stop_reason: `handoff:${hop + 1}` });
      if (!saved || !saved.ok) throw new Error("could not save the text so far");
      const next = await handOff(hop + 1);
      if (!next || !next.ok) throw new Error(`hand-off refused (${next?.status})`);
      console.log(`Build ${id} handed off after ${Date.now() - started}ms, hop ${hop + 1}, chars=${text.length}`);
      return;
    }

    if (!text.trim()) {
      await patch({ status: "failed", error: "The AI returned an empty response. Please try again.", finished_at: new Date().toISOString() });
      return;
    }
    const saved = await patch({
      status: "done", result: text, stop_reason: stopReason,
      progress: progressCounts(text), finished_at: new Date().toISOString(),
    });
    if (!saved || !saved.ok) console.error("Build", id, "finished but the result could not be saved", saved?.status);
    console.log(`Build ok id=${id} ms=${Date.now() - started} chars=${text.length} stop=${stopReason}`);
  } catch (err) {
    console.error(`Build ${id} failed after ${Date.now() - started}ms:`, err);
    await patch({ status: "failed", error: "The build stopped partway through. Tap Try Again.", finished_at: new Date().toISOString() });
  }
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const user = await getUser(req);
  if (user?.misconfigured) return res.status(500).json({ error: "AI is misconfigured on the server. Contact support." });
  if (!user) return res.status(401).json({ error: "Sign in to use AI features." });

  const body = req.body || {};
  if (JSON.stringify(body).length > MAX_BODY_BYTES) return res.status(413).json({ error: "Request too large." });
  if (!UUID_RE.test(String(body.id || ""))) return res.status(400).json({ error: "A build id is required." });
  if (!Array.isArray(body.messages) || body.messages.length === 0) return res.status(400).json({ error: "messages must be a non-empty array." });
  const forAthleteId = body.forAthleteId && UUID_RE.test(String(body.forAthleteId)) ? body.forAthleteId : null;

  const token = req.headers.authorization.slice(7);
  const rest = supabaseRest(token);

  const payload = {
    model: ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL,
    max_tokens: Math.min(Number(body.max_tokens) || 4000, MAX_TOKENS_CEILING),
    messages: body.messages,
  };
  if (typeof body.system === "string") payload.system = body.system;
  // The next run of a long build: this same function, called by itself with
  // the same sign-in (see RUN_BUDGET_MS).
  const handOff = (hop) => fetch(`https://${req.headers.host}/api/build-program`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...body, continueBuild: true, hop }),
  }).catch(() => null);

  if (body.continueBuild) {
    // Only the run that saved the text can start the next one: it is claimed
    // by the hop number it wrote, once.
    const hop = Math.trunc(Number(body.hop));
    if (!(hop >= 1 && hop <= MAX_HOPS)) return res.status(400).json({ error: "Bad hand-off." });
    const claim = await rest(`program_builds?id=eq.${body.id}&user_id=eq.${user.id}&status=eq.running&stop_reason=eq.handoff:${hop}&select=result`, {
      method: "PATCH", body: { stop_reason: `run:${hop}` }, prefer: "return=representation",
    });
    const rows = claim.ok ? await claim.json().catch(() => []) : [];
    if (!rows[0]?.result) return res.status(409).json({ error: "That build is not waiting to continue." });
    waitUntil(runBuild({ id: body.id, payload, apiKey, rest, partial: rows[0].result, hop, handOff }));
    return res.status(202).json({ id: body.id });
  }

  // One build at a time for the same person: a second tap, or the app coming
  // back and asking again, picks up the one already running instead of
  // paying for another.
  const since = new Date(Date.now() - STALE_MS).toISOString();
  const target = forAthleteId ? `for_athlete_id=eq.${forAthleteId}` : "for_athlete_id=is.null";
  const existing = await rest(`program_builds?select=id&user_id=eq.${user.id}&status=eq.running&${target}&created_at=gt.${encodeURIComponent(since)}&order=created_at.desc&limit=1`);
  if (existing.status === 404 || existing.status === 400) {
    // No program_builds table yet: the app falls back to building over /api/chat.
    return res.status(503).json({ error: "Background builds are not set up yet.", code: "no_table" });
  }
  const running = existing.ok ? await existing.json().catch(() => []) : [];
  if (running[0]?.id && !body.fresh) return res.status(409).json({ id: running[0].id, error: "A build is already running." });
  if (running[0]?.id && body.fresh) {
    // The phone saw that one stop moving: close it so it can't land later.
    await rest(`program_builds?id=eq.${running[0].id}`, { method: "PATCH", body: { status: "failed", error: "Stopped, and replaced by a new build.", finished_at: new Date().toISOString() } }).catch(() => null);
  }

  if (rateLimited(user.id)) return res.status(429).json({ error: "Too many AI requests in a row. Give it a minute and try again." });

  const insert = await rest("program_builds", {
    method: "POST",
    body: { id: body.id, user_id: user.id, for_athlete_id: forAthleteId, status: "running" },
  });
  if (insert.status === 409) return res.status(409).json({ id: body.id, error: "That build already exists." });
  if (!insert.ok) {
    let detail = null;
    try { detail = await insert.json(); } catch { /* no JSON */ }
    if (insert.status === 404 || /program_builds/.test(detail?.message || "")) {
      return res.status(503).json({ error: "Background builds are not set up yet.", code: "no_table" });
    }
    console.error("Could not start build", insert.status, detail?.message);
    return res.status(insert.status === 403 ? 403 : 500).json({ error: "Couldn't start the build. Try again." });
  }

  // Answer now; the build runs on after the phone has its answer.
  waitUntil(runBuild({ id: body.id, payload, apiKey, rest, handOff }));
  return res.status(202).json({ id: body.id });
}
