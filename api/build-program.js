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
async function readStream(response, onText) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let stopReason = null;
  for (;;) {
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
  return { text, stopReason };
}

async function runBuild({ id, payload, apiKey, rest }) {
  const started = Date.now();
  const patch = (body) => rest(`program_builds?id=eq.${id}`, { method: "PATCH", body }).catch(() => null);
  const call = (model) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ ...payload, model, stream: true }),
  });

  try {
    let response = await call(payload.model);
    if (response.status === 404 && payload.model !== FALLBACK_MODEL) {
      console.error("Model", payload.model, "was rejected - retrying on", FALLBACK_MODEL);
      try { await response.arrayBuffer(); } catch { /* nothing to drain */ }
      response = await call(FALLBACK_MODEL);
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
    const { text, stopReason } = await readStream(response, (soFar) => {
      const now = Date.now();
      if (now - lastSent < PROGRESS_EVERY_MS) return;
      lastSent = now;
      pending = patch({ progress: progressCounts(soFar) });
    });
    if (pending) await pending;

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
  if (running[0]?.id) return res.status(409).json({ id: running[0].id, error: "A build is already running." });

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

  const payload = {
    model: ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL,
    max_tokens: Math.min(Number(body.max_tokens) || 4000, MAX_TOKENS_CEILING),
    messages: body.messages,
  };
  if (typeof body.system === "string") payload.system = body.system;

  // Answer now; the build runs on after the phone has its answer.
  waitUntil(runBuild({ id: body.id, payload, apiKey, rest }));
  return res.status(202).json({ id: body.id });
}
