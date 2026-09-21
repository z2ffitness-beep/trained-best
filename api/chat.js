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

const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
]);
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS_CEILING = 8192;
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

  // Rebuild the upstream payload rather than forwarding the client's, so no
  // unexpected field can ride along to the Anthropic API.
  const payload = {
    model: ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL,
    max_tokens: Math.min(Number(body.max_tokens) || 4000, MAX_TOKENS_CEILING),
    messages: body.messages,
  };
  if (typeof body.system === "string") payload.system = body.system;
  if (typeof body.temperature === "number") payload.temperature = body.temperature;

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

    const data = await response.json();
    if (!response.ok) {
      console.error("Anthropic error", response.status, data?.error?.message);
      // Never pass Anthropic's own 401 straight through. The client reads 401
      // as "your Supabase session expired" and tells the user to sign in again
      // — which can never fix a bad or unfunded API key, so they'd be stuck in
      // a sign-out/sign-in loop forever. 502 says "upstream problem", correctly.
      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({ error: "The AI service rejected our request. This is a server-side configuration problem, not your account." });
      }
      return res.status(response.status).json(data);
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error("Proxy error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
