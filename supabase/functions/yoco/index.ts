// Yoco live sales feed. Deployed as 'yoco' with JWT verification OFF:
// Yoco's servers must be able to call it, and every request is checked here
// instead (a Yoco signature for events, a signed-in business admin for the rest).
//
//  - Yoco event  (has a webhook-signature header): verify the signature,
//    fetch the payment with the shop's own key, record it in Money.
//  - Connect / sync / disconnect (from the app, with the user's token): check
//    the user is an owner/admin of the business first.
//
// The shop's API key and webhook secret are stored in yoco_connections, which
// the browser can't read. They are never returned or logged.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { mapPayment, verifySignature } from "./yocoLogic.ts";

const YOCO_API = "https://api.yoco.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function yoco(path: string, key: string, init: RequestInit = {}) {
  return fetch(YOCO_API + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
}

// deno-lint-ignore no-explicit-any
type Db = any;

async function record(db: Db, businessId: string, payment: Record<string, unknown>) {
  const rows = mapPayment(payment).map((r) => ({ ...r, business_id: businessId }));
  if (!rows.length) return 0;
  const { error } = await db.from("business_transactions").upsert(rows, { onConflict: "business_id,source,external_id", ignoreDuplicates: true });
  if (error) throw new Error("Could not save the sale: " + error.message);
  return rows.length;
}

// Pulls approved payments from the last few days, so a new connection starts
// with recent history and a missed event can be caught up with "Sync".
async function backfill(db: Db, businessId: string, key: string, days = 7) {
  const from = new Date(Date.now() - days * 86400e3).toISOString();
  let cursor = "", imported = 0;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ status: "approved", created_at__gte: from, limit: "50" });
    if (cursor) q.set("cursor", cursor);
    const r = await yoco(`/v1/payments/?${q}`, key);
    if (!r.ok) throw new Error(`Yoco said ${r.status} when listing payments.`);
    const d = await r.json();
    for (const p of d.data || []) imported += await record(db, businessId, p);
    cursor = d.next_cursor || "";
    if (!cursor) break;
  }
  return imported;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "Server not configured" });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---------------- a payment event from Yoco ----------------
  if (req.headers.get("webhook-signature")) {
    const businessId = new URL(req.url).searchParams.get("b") || "";
    if (!UUID.test(businessId)) return json(400, { error: "Bad request" });
    const raw = await req.text();
    const { data: conn } = await db.from("yoco_connections").select("api_key, webhook_secret").eq("business_id", businessId).maybeSingle();
    if (!conn?.webhook_secret) return json(404, { error: "Not connected" });
    const id = req.headers.get("webhook-id") || "";
    const ok = await verifySignature(conn.webhook_secret, id, req.headers.get("webhook-timestamp") || "", raw, req.headers.get("webhook-signature") || "");
    if (!ok) return json(401, { error: "Bad signature" });

    // Yoco may deliver an event twice - skip one we've already handled.
    const { error: seen } = await db.from("yoco_events").insert({ webhook_id: id, business_id: businessId });
    if (seen) return json(200, { ok: true, duplicate: true });

    try {
      let event: Record<string, string> = {};
      try { event = JSON.parse(raw); } catch { /* ignore */ }
      if (event.event_type !== "payment.created" || !event.payment_id) return json(200, { ok: true, ignored: true });
      const r = await yoco(`/v1/payments/${encodeURIComponent(event.payment_id)}`, conn.api_key);
      if (!r.ok) throw new Error(`Yoco said ${r.status} when fetching the payment.`);
      await record(db, businessId, await r.json());
      await db.from("yoco_connections").update({ last_event_at: new Date().toISOString(), last_error: null, status: "active" }).eq("business_id", businessId);
      return json(200, { ok: true });
    } catch (e) {
      // Forget this delivery so Yoco's retry is processed, and tell the owner.
      await db.from("yoco_events").delete().eq("webhook_id", id);
      await db.from("yoco_connections").update({ last_error: String((e as Error).message).slice(0, 300), status: "error" }).eq("business_id", businessId);
      return json(500, { error: "Could not process the event" });
    }
  }

  // ---------------- connect / sync / disconnect, from the app ----------------
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: caller, error: callerErr } = await db.auth.getUser(token);
  if (callerErr || !caller?.user) return json(401, { error: "Sign in first." });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "Bad request" }); }
  const businessId = String(body.business_id || "");
  const action = String(body.action || "");
  if (!UUID.test(businessId)) return json(400, { error: "Bad request" });

  const { data: member } = await db.from("business_members").select("role")
    .eq("business_id", businessId).eq("user_id", caller.user.id).eq("status", "active").in("role", ["owner", "admin"]).maybeSingle();
  if (!member) return json(403, { error: "Only the business owner or an admin can do this." });

  try {
    if (action === "connect") {
      const key = String(body.api_key || "").trim();
      if (key.length < 10 || key.length > 4000 || /\s/.test(key)) return json(400, { error: "That doesn't look like a Yoco API key. Paste it exactly as Yoco showed it." });

      // 1. Does Yoco accept the key, and can it read payments?
      const probe = await yoco("/v1/payments/?limit=1", key);
      if (probe.status === 401 || probe.status === 403) {
        return json(400, { error: "Yoco didn't accept that key. Check you copied all of it, and that it was created with access to view orders and payments." });
      }
      if (!probe.ok) return json(502, { error: `Yoco could not be reached just now (${probe.status}). Try again in a minute.` });

      // 2. Replace any earlier connection, then ask Yoco to call us on every payment.
      const { data: old } = await db.from("yoco_connections").select("api_key, webhook_subscription_id").eq("business_id", businessId).maybeSingle();
      if (old?.webhook_subscription_id) {
        await yoco(`/v1/webhooks/subscriptions/${encodeURIComponent(old.webhook_subscription_id)}`, old.api_key, { method: "DELETE" }).catch(() => {});
      }
      const sub = await yoco("/v1/webhooks/subscriptions/", key, {
        method: "POST",
        body: JSON.stringify({ name: "To The Cent", event_types: ["payment.created"], notification_url: `${url}/functions/v1/yoco?b=${businessId}` }),
      });
      if (!sub.ok) {
        return json(400, { error: sub.status === 401 || sub.status === 403
          ? "Yoco accepted the key but won't let it set up live updates. Create the key again with webhook access switched on."
          : `Yoco couldn't set up live updates (${sub.status}).` });
      }
      const created = await sub.json();
      const { error: saveErr } = await db.from("yoco_connections").upsert({
        business_id: businessId, api_key: key, webhook_subscription_id: created.id ?? null, webhook_secret: created.secret ?? null,
        status: "active", last_error: null, connected_by: caller.user.id, created_at: new Date().toISOString(),
      });
      if (saveErr) return json(500, { error: "Could not save the connection." });

      // 3. Start with the last week's sales.
      let imported = 0;
      try { imported = await backfill(db, businessId, key); } catch { /* connected fine; sync can be retried */ }
      return json(200, { ok: true, imported });
    }

    const { data: conn } = await db.from("yoco_connections").select("api_key, webhook_subscription_id").eq("business_id", businessId).maybeSingle();
    if (!conn) return json(404, { error: "Yoco isn't connected." });

    if (action === "sync") {
      const days = Math.min(30, Math.max(1, Number(body.days) || 7));
      return json(200, { ok: true, imported: await backfill(db, businessId, conn.api_key, days) });
    }
    if (action === "disconnect") {
      if (conn.webhook_subscription_id) {
        await yoco(`/v1/webhooks/subscriptions/${encodeURIComponent(conn.webhook_subscription_id)}`, conn.api_key, { method: "DELETE" }).catch(() => {});
      }
      await db.from("yoco_connections").delete().eq("business_id", businessId);
      return json(200, { ok: true });
    }
    return json(400, { error: "Unknown action" });
  } catch (e) {
    return json(502, { error: (e as Error).message || "Something went wrong." });
  }
});
