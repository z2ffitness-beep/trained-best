// Vercel serverless function — proxies requests to the Anthropic API.
// ANTHROPIC_API_KEY never reaches the browser.
//
// This endpoint spends real money, so it is NOT open. Before this hardening it
// forwarded req.body verbatim with no auth, no origin check and no limits — and
// vercel.json advertised Access-Control-Allow-Origin: *. Anyone who opened the
// public app, watched the network tab and saw POST /api/chat could script a
// loop against the most expensive model and drain the account, with no way to
// tell afterwards who did it.
//
// Four gates now stand in front of the key:
//   1. a valid Supabase session   — callers are real, identifiable accounts
//   2. a model allowlist          — nobody can pick a pricier model than we ship
//   3. a max_tokens ceiling       — one call can't be enormous
//   4. a short per-user rate limit — one account can't hammer it

// WHY THIS FUNCTION RUNS LONG, AND WHY THAT USED TO BREAK IT
//
// Building a 12-week program is one request that asks for many thousands of
// output tokens, and the model writes those at a few dozen tokens a second. It
// routinely takes two to four minutes. With no maxDuration set, Vercel applied
// its default (10s on Hobby, 60s on Pro) and KILLED the function mid-flight.
// The browser saw the connection reset and fetch() threw — which is
// indistinguishable from a phone losing signal, so the app told athletes on
// perfectly good wifi to "find better signal". Three of the last four signups
// completed their intake and got no program this way.
//
// Two things fix it, and both are needed:
//   * maxDuration below, so the platform stops cutting the call short; and
//   * streaming, so bytes move continuously. A long request with nothing on the
//     wire is what every intermediate proxy treats as dead, and the Anthropic
//     API itself refuses very large non-streaming requests.
export const config = { maxDuration: 300 };
// Vercel reads either form depending on the builder version. Exporting both is
// harmless and means this works without knowing which one is in play.
export const maxDuration = 300;

const ALLOWED_MODELS = new Set([
  // The app asks for this one by name for program generation. It was missing
  // from this list, so every program was silently built by the fallback model
  // instead of the one the prompt was written and tuned for.
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
]);
const DEFAULT_MODEL = "claude-sonnet-4-6";
// A full program is a large JSON document. The old 8192 ceiling silently
// truncated it mid-structure, which is why the client needed a
// repair-truncated-JSON step at all — and why that step kept failing.
const MAX_TOKENS_CEILING = 32000;
const MAX_BODY_BYTES = 100_000;

// Per-user sliding window. Serverless instances get recycled, so this bounds
// bursts rather than guaranteeing a global limit — the model and token caps
// above are what bound the cost of anything that does get through. Move this to
// a Postgres table if you ever need a hard cross-instance guarantee.
const WINDOW_MS = 60_000;
const MAX_CALLS_PER_WINDOW = 8;
const callLog = new Map(); // userId -> timestamps[]

function rateLimited(userId) {
  const now = Date.now();
  const hits = (callLog.get(userId) || []).filter(t => now - t < WINDOW_MS);
  if (hits.length >= MAX_CALLS_PER_WINDOW) return true;
  hits.push(now);
  callLog.set(userId, hits);
  if (callLog.size > 5000) {
    for (const [k, v] of callLog) {
      if (!v.some(t => now - t < WINDOW_MS)) callLog.delete(k);
    }
  }
  return false;
}

// Validate the caller's Supabase access token by asking Supabase who it belongs
// to. Avoids pulling in a JWT library, and honours revoked sessions for free.
async function getUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  // Accept unprefixed names first. VITE_-prefixed vars are conventionally
  // build-time only, and if they aren't also present in the serverless runtime
  // this returns null — which is indistinguishable from a bad token, so every
  // legitimate user would get 401 "your session expired" with nothing in the
  // client to explain why. `misconfigured` lets the handler answer 500 instead.
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("Supabase env vars missing — cannot authenticate AI requests");
    return { misconfigured: true };
  }

  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    });
    if (!r.ok) return null;
    const user = await r.json();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

// The iPhone app loads from the phone itself, so its requests arrive from
// capacitor://localhost rather than from the website. Those origins - and
// nothing else - are allowed cross-origin. This is an allowlist on purpose:
// the endpoint spends real money, and "*" is what it had before it was locked
// down. Every call still needs a valid signed-in session regardless.
const NATIVE_ORIGINS = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
]);

function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (origin && NATIVE_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "600");
  }
}

// Relays Anthropic's SSE stream to the browser as it arrives.
//
// The client only needs the text, so rather than re-emitting Anthropic's full
// event vocabulary this forwards two kinds of line:
//   data: {"t":"<text chunk>"}   incremental text
//   data: {"done":true,...}      the end, with stop_reason and usage
// plus a ": keepalive" comment every 15s if the model goes quiet mid-thought,
// so nothing between here and the phone decides the connection is dead.
async function relayStream(upstream, res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Tells any nginx-style proxy in front of us not to buffer, which would
  // defeat the entire point of streaming.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    try { res.write(": keepalive\n\n"); } catch { /* socket already gone */ }
  }, 15_000);

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let stopReason = null;
  let usage = null;
  let sawText = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line. Keep the trailing partial.
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
          sawText = true;
          res.write(`data: ${JSON.stringify({ t: evt.delta.text })}\n\n`);
        } else if (evt.type === "message_delta") {
          if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
          if (evt.usage) usage = evt.usage;
        } else if (evt.type === "error") {
          // An error that arrives mid-stream cannot become an HTTP status —
          // the 200 and the headers are long gone. Say so in-band instead, so
          // the client reports the real reason rather than inventing one.
          res.write(`data: ${JSON.stringify({ error: evt.error?.message || "The AI stopped partway through." })}\n\n`);
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, stop_reason: stopReason, usage, empty: !sawText })}\n\n`);
  } catch (err) {
    console.error("Stream relay failed:", err);
    try {
      res.write(`data: ${JSON.stringify({ error: "The connection to the AI broke partway through the program." })}\n\n`);
    } catch { /* nothing left to write to */ }
  } finally {
    clearInterval(heartbeat);
    try { res.end(); } catch { /* already ended */ }
  }
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const user = await getUser(req);
  if (user?.misconfigured) {
    return res.status(500).json({ error: "AI is misconfigured on the server. Contact support." });
  }
  if (!user) {
    return res.status(401).json({ error: "Sign in to use AI features." });
  }
  if (rateLimited(user.id)) {
    return res.status(429).json({ error: "Too many AI requests in a row. Give it a minute and try again." });
  }

  const body = req.body || {};
  if (JSON.stringify(body).length > MAX_BODY_BYTES) {
    return res.status(413).json({ error: "Request too large." });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array." });
  }

  // The client asks for a stream explicitly. An older client that doesn't will
  // still get the plain JSON it expects, so the browser build and this file can
  // be deployed in either order without a window where the app is broken.
  const wantsStream = body.stream === true;

  // Rebuild the upstream payload rather than forwarding the client's, so no
  // unexpected field can ride along to the Anthropic API.
  const payload = {
    model: ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL,
    max_tokens: Math.min(Number(body.max_tokens) || 4000, MAX_TOKENS_CEILING),
    messages: body.messages,
  };
  if (typeof body.system === "string") payload.system = body.system;
  if (typeof body.temperature === "number") payload.temperature = body.temperature;
  if (wantsStream) payload.stream = true;

  const started = Date.now();
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let data = null;
      try { data = await response.json(); } catch { /* upstream sent no JSON */ }
      console.error("Anthropic error", response.status, data?.error?.message);
      // Never pass Anthropic's own 401 straight through. The client reads 401
      // as "your Supabase session expired" and tells the user to sign in again
      // — which can never fix a bad or unfunded API key, so they'd be stuck in
      // a sign-out/sign-in loop forever. 502 says "upstream problem", correctly.
      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({ error: "The AI service rejected our request. This is a server-side configuration problem, not your account." });
      }
      return res.status(response.status).json(data || { error: `AI request failed (${response.status}).` });
    }

    if (wantsStream && response.body) {
      return await relayStream(response, res);
    }

    const data = await response.json();
    console.log(`AI ok model=${payload.model} tokens=${payload.max_tokens} ms=${Date.now() - started}`);
    return res.status(200).json(data);
  } catch (error) {
    // This is the branch that used to be invisible. Logging the elapsed time
    // makes a platform timeout obvious in the Vercel logs instead of looking
    // like a mystery, because it lands within a second of the duration cap.
    console.error(`Proxy error after ${Date.now() - started}ms:`, error);
    if (res.headersSent) { try { res.end(); } catch { /* done */ } return; }
    return res.status(500).json({ error: "Internal server error" });
  }
}
