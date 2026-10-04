// Automatic booking SMS. Deployed as 'booking-sms' with JWT verification off:
// a schedule (pg_cron, every 10 minutes) calls it, and so does the app's
// "send me a test" button. What it does is limited and harmless to repeat:
//   run  - send whatever sms_due() says is owed (reminders, confirmations,
//          cancellations), once each, up to the monthly cap
//   test - (signed-in owner/admin only) send one test message
//
// Sending needs the SMS provider login as Edge Function secrets:
//   BULKSMS_TOKEN_ID and BULKSMS_TOKEN_SECRET  (from bulksms.com -> Settings -> API tokens)
// Until they are set, 'run' does nothing and the app's test button says so.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { runDue, sendTest } from "./run.ts";
import type { Send } from "./run.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// BulkSMS (https://api.bulksms.com/v1/messages, HTTP Basic with the token id and secret).
// Kept in one small function so another provider can replace it.
function bulkSms(id: string, secret: string): Send {
  return async (to, text) => {
    try {
      const r = await fetch("https://api.bulksms.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(`${id}:${secret}`) },
        body: JSON.stringify({ to, body: text, encoding: "TEXT" }),
        signal: AbortSignal.timeout(10000),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        const m = Array.isArray(d) ? d[0] : null;
        const status = m && m.status && (m.status.type || m.status.id);
        if (m && /REJECT|FAIL/i.test(String(status))) return { ok: false, error: `Provider rejected it (${status})` };
        return { ok: true, id: m && m.id ? String(m.id) : undefined };
      }
      const detail = (d && (d.detail || d.title)) || `HTTP ${r.status}`;
      // wrong login, no credit, or not allowed: every message would fail the same way
      return { ok: false, error: String(detail), fatal: [401, 402, 403].includes(r.status) };
    } catch (e) {
      return { ok: false, error: (e as Error).message || "network error" };
    }
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "Server not configured" });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const id = Deno.env.get("BULKSMS_TOKEN_ID"), secret = Deno.env.get("BULKSMS_TOKEN_SECRET");
  const configured = !!(id && secret);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* the schedule sends {"action":"run"} */ }
  const action = String(body.action || "run");

  try {
    if (action === "run") {
      if (!configured) return json(200, { ok: true, configured: false });
      return json(200, { configured: true, ...(await runDue(db, bulkSms(id!, secret!))) });
    }

    if (action === "test") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: caller } = await db.auth.getUser(token);
      if (!caller?.user) return json(401, { error: "Sign in first." });
      const businessId = String(body.business_id || "");
      if (!UUID.test(businessId)) return json(400, { error: "Bad request" });
      const { data: member } = await db.from("business_members").select("role").eq("business_id", businessId).eq("user_id", caller.user.id)
        .eq("status", "active").in("role", ["owner", "admin"]).maybeSingle();
      if (!member) return json(403, { error: "Only the business owner or an admin can do this." });
      if (!configured) return json(200, { ok: false, error: "Automatic SMS isn't switched on yet - it needs the SMS account to be connected first." });
      const { data: biz } = await db.from("businesses").select("name").eq("id", businessId).maybeSingle();
      return json(200, await sendTest(db, bulkSms(id!, secret!), businessId, (biz && biz.name) || "your business", String(body.to || "")));
    }
    return json(400, { error: "Unknown action" });
  } catch (e) {
    return json(502, { error: (e as Error).message || "Something went wrong." });
  }
});
