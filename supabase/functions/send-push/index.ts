// send-push: delivers a bell notification to the person's phones.
//
//   GET  ?public-key        -> { publicKey }  (the app needs it to subscribe)
//   POST { notification_id } with x-push-hook-secret  (only the database
//                            trigger knows the secret; see migration 007)
//
// The signing keys are generated here on first use and stored in Vault, so
// the private key never exists anywhere a person could copy it.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Config = { vapid_public: string | null; vapid_private: string | null; hook_secret: string | null };

async function loadConfig(): Promise<Config> {
  const { data, error } = await db.rpc("push_config_get");
  if (error) throw new Error("push config unreadable: " + error.message);
  let cfg = (Array.isArray(data) ? data[0] : data) as Config;
  if (!cfg?.vapid_public || !cfg?.vapid_private) {
    const keys = webpush.generateVAPIDKeys();
    const { error: initErr } = await db.rpc("push_config_init", { p_public: keys.publicKey, p_private: keys.privateKey });
    if (initErr) throw new Error("push config init failed: " + initErr.message);
    // Read back rather than trusting our own pair: a concurrent first call may have won.
    const again = await db.rpc("push_config_get");
    cfg = (Array.isArray(again.data) ? again.data[0] : again.data) as Config;
  }
  return cfg;
}

// Constant-time-ish comparison; both sides are short hex strings.
function same(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const cfg = await loadConfig();

    if (req.method === "GET") {
      return json({ publicKey: cfg.vapid_public });
    }

    if (req.method !== "POST") return json({ error: "method" }, 405);
    if (!same(req.headers.get("x-push-hook-secret") || "", cfg.hook_secret || "")) {
      return json({ error: "forbidden" }, 403);
    }

    const { notification_id } = await req.json().catch(() => ({}));
    if (!notification_id) return json({ error: "notification_id required" }, 400);

    const { data: n, error: nErr } = await db.from("notifications")
      .select("id, user_id, kind, title, body, data").eq("id", notification_id).maybeSingle();
    if (nErr || !n) return json({ error: "notification not found" }, 404);

    const { data: subs } = await db.from("push_subscriptions")
      .select("id, endpoint, p256dh, auth").eq("user_id", n.user_id);
    if (!subs?.length) return json({ sent: 0 });

    webpush.setVapidDetails("https://trained-best.vercel.app", cfg.vapid_public!, cfg.vapid_private!);
    const payload = JSON.stringify({
      title: n.title || "Trained.best",
      body: n.body || "",
      tag: n.id,
      url: "/",
    });

    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
        sent++;
        await db.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 404/410: the phone turned notifications off or the app was removed.
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
        else console.error("push failed", code, (e as Error).message);
      }
    }));
    return json({ sent });
  } catch (e) {
    console.error((e as Error).message);
    return json({ error: "server" }, 500);
  }
});
