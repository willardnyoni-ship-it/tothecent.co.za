// Yoco live sales feed. Deployed as 'yoco' with JWT verification OFF:
// Yoco's servers must be able to call it, and every request is checked here
// instead (a Yoco signature for events, a signed-in business admin for the rest).
//
//  - Yoco events (a webhook-signature header): verify the signature, then
//      payment.created   -> record the sale (income, plus Yoco's fee)
//      order.completed   -> record what was sold; match it to stock and take it off
//      order.cancelled   -> put that stock back
//      payment.refunded  -> record the refund
//  - connect / sync / disconnect / map_item (from the app, with the user's
//    token): check the user is an owner/admin of the business first.
//
// The shop's API key and webhook secret are stored in yoco_connections, which
// the browser can't read. They are never returned or logged.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { mapPayment, sastDate, verifySignature } from "./yocoLogic.ts";
import { mapRefunds, nameKey, orderLines } from "./yocoOrders.ts";
import { usageFor } from "./stockUsage.ts";

const YOCO_API = "https://api.yoco.com";
const EVENT_TYPES = ["payment.created", "order.completed", "order.cancelled", "payment.refunded"];
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
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

// ---------------- money: sales, fees, refunds ----------------
async function saveRows(db: Db, businessId: string, rows: Row[]) {
  if (!rows.length) return 0;
  const { error } = await db.from("business_transactions").upsert(rows.map((r) => ({ ...r, business_id: businessId })), { onConflict: "business_id,source,external_id", ignoreDuplicates: true });
  if (error) throw new Error("Could not save the sale: " + error.message);
  return rows.length;
}
const recordPayment = (db: Db, businessId: string, payment: Row) => saveRows(db, businessId, mapPayment(payment));
const recordRefunds = (db: Db, businessId: string, payment: Row) => saveRows(db, businessId, mapRefunds(payment));

// ---------------- stock: what was sold ----------------
async function catalogue(db: Db, businessId: string) {
  const [items, recipes, recipeLines] = await Promise.all([
    db.from("stock_items").select("id,name,cost_price").eq("business_id", businessId),
    db.from("recipes").select("id,name,yield_portions,selling_price").eq("business_id", businessId).eq("archived", false),
    db.from("recipe_lines").select("recipe_id,item_id,qty").eq("business_id", businessId),
  ]);
  return { items: items.data || [], recipes: recipes.data || [], recipeLines: recipeLines.data || [] };
}

// Finds the stock item or dish for each line: from a saved match, or - when a
// Yoco item has exactly the same name as one of yours - by name, which is then
// remembered. Anything else waits for the owner to match it.
async function resolve(db: Db, businessId: string, rows: Row[], cat: Awaited<ReturnType<typeof catalogue>>) {
  const keys = [...new Set(rows.map((r) => r.name_key))];
  if (!keys.length) return rows;
  const { data: maps } = await db.from("yoco_item_map").select("*").eq("business_id", businessId).in("name_key", keys);
  const byKey = new Map<string, Row>((maps || []).map((m: Row) => [m.name_key, m]));
  const fresh: Row[] = [];
  for (const r of rows) {
    if (byKey.has(r.name_key)) continue;
    const item = cat.items.find((i: Row) => nameKey(i.name) === r.name_key);
    const dish = item ? null : cat.recipes.find((x: Row) => nameKey(x.name) === r.name_key);
    if (item || dish) {
      const m = { business_id: businessId, name_key: r.name_key, display_name: r.name, stock_item_id: item ? item.id : null, recipe_id: dish ? dish.id : null, ignored: false };
      byKey.set(r.name_key, m); fresh.push(m);
    }
  }
  if (fresh.length) await db.from("yoco_item_map").upsert([...new Map(fresh.map((m) => [m.name_key, m])).values()], { onConflict: "business_id,name_key", ignoreDuplicates: true });
  return rows.map((r) => {
    const m = byKey.get(r.name_key);
    return m ? { ...r, stock_item_id: m.stock_item_id, recipe_id: m.recipe_id, ignored: !!m.ignored, matched: true } : { ...r, matched: false };
  });
}

// Takes stock off for the matched lines. A line from before the shop connected
// (or one marked "don't track") is marked done without touching stock.
async function applyLines(db: Db, businessId: string, rows: Row[], cat: Awaited<ReturnType<typeof catalogue>>, direction: 1 | -1 = 1) {
  let applied = 0;
  for (const r of rows) {
    if (!r.matched) continue;
    if (!r.ignored && !r.historic) {
      const price = r.qty > 0 ? r.revenue / r.qty : r.unit_price;
      const usage = usageFor([{ stock_item_id: r.stock_item_id, recipe_id: r.recipe_id, qty: r.qty, price }], cat.recipes, cat.recipeLines, cat.items);
      for (const [itemId, u] of Object.entries(usage)) {
        const { error } = await db.rpc("yoco_apply_sale", {
          p_business: businessId, p_item: itemId, p_qty: direction * u.qty, p_revenue: direction * u.revenue,
          p_note: direction > 0 ? "Yoco sale" : "Yoco order cancelled", p_date: sastDate(r.sold_at), p_ref: r.order_id,
        });
        if (error) throw new Error("Could not update stock: " + error.message);
      }
    }
    const patch: Row = direction > 0
      ? { stock_item_id: r.stock_item_id, recipe_id: r.recipe_id, ignored: !!r.ignored, applied_at: new Date().toISOString() }
      : { reversed_at: new Date().toISOString() };
    await db.from("yoco_order_lines").update(patch).eq("business_id", businessId).eq("line_id", r.line_id);
    applied++;
  }
  return applied;
}

// A completed order: remember its lines (once), match them and take stock off.
async function processOrder(db: Db, businessId: string, order: Row, connectedAt: string) {
  if (!order || order.status !== "completed") return 0;
  const closed = new Date(order.closed_at || order.created_at || Date.now());
  const historic = closed < new Date(connectedAt);
  const lines = orderLines(order).map((l) => ({ ...l, business_id: businessId, order_id: String(order.id), historic }));
  if (!lines.length) return 0;
  const { data: inserted, error } = await db.from("yoco_order_lines")
    .upsert(lines.map((l) => ({ business_id: l.business_id, line_id: l.line_id, order_id: l.order_id, name: l.name, name_key: l.name_key, qty: l.qty, unit_price: l.unit_price, revenue: l.revenue, sold_at: l.sold_at, historic: l.historic })),
      { onConflict: "business_id,line_id", ignoreDuplicates: true }).select();
  if (error) throw new Error("Could not save the order: " + error.message);
  if (!inserted || !inserted.length) return 0; // seen before
  const cat = await catalogue(db, businessId);
  return applyLines(db, businessId, await resolve(db, businessId, inserted, cat), cat);
}

async function reverseOrder(db: Db, businessId: string, orderId: string) {
  const { data: rows } = await db.from("yoco_order_lines").select("*").eq("business_id", businessId).eq("order_id", orderId);
  const live = (rows || []).filter((r: Row) => !r.reversed_at);
  const done = live.filter((r: Row) => r.applied_at);
  // lines never matched have nothing to put back - just forget them
  const never = live.filter((r: Row) => !r.applied_at).map((r: Row) => r.line_id);
  if (never.length) await db.from("yoco_order_lines").delete().eq("business_id", businessId).in("line_id", never);
  if (!done.length) return 0;
  const cat = await catalogue(db, businessId);
  return applyLines(db, businessId, done.map((r: Row) => ({ ...r, matched: true })), cat, -1);
}

// After the owner matches a Yoco item: apply every sale of it that was waiting.
async function applyPending(db: Db, businessId: string, key: string) {
  const { data: rows } = await db.from("yoco_order_lines").select("*").eq("business_id", businessId).eq("name_key", key).is("applied_at", null);
  if (!rows || !rows.length) return 0;
  const cat = await catalogue(db, businessId);
  return applyLines(db, businessId, await resolve(db, businessId, rows, cat), cat);
}

// ---------------- catching up ----------------
async function backfill(db: Db, businessId: string, key: string, connectedAt: string, days = 7) {
  const from = new Date(Date.now() - days * 86400e3).toISOString();
  let sales = 0, orders = 0;
  for (const kind of ["payments", "orders"] as const) {
    let cursor = "";
    for (let page = 0; page < 20; page++) {
      const q = new URLSearchParams({ created_at__gte: from, limit: "50" });
      if (kind === "payments") q.set("status", "approved"); else q.append("status", "completed");
      if (cursor) q.set("cursor", cursor);
      const r = await yoco(`/v1/${kind}/?${q}`, key);
      if (!r.ok) throw new Error(`Yoco said ${r.status} when listing ${kind}.`);
      const d = await r.json();
      for (const x of d.data || []) {
        if (kind === "payments") sales += await recordPayment(db, businessId, x);
        else orders += await processOrder(db, businessId, x, connectedAt);
      }
      cursor = d.next_cursor || "";
      if (!cursor) break;
    }
  }
  return { imported: sales, orders };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "Server not configured" });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---------------- an event from Yoco ----------------
  if (req.headers.get("webhook-signature")) {
    const businessId = new URL(req.url).searchParams.get("b") || "";
    if (!UUID.test(businessId)) return json(400, { error: "Bad request" });
    const raw = await req.text();
    const { data: conn } = await db.from("yoco_connections").select("api_key, webhook_secret, created_at").eq("business_id", businessId).maybeSingle();
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
      const get = async (path: string) => {
        const r = await yoco(path, conn.api_key);
        if (!r.ok) throw new Error(`Yoco said ${r.status} when fetching ${path.split("/")[2]}.`);
        return r.json();
      };
      if (event.event_type === "payment.created" && event.payment_id) await recordPayment(db, businessId, await get(`/v1/payments/${encodeURIComponent(event.payment_id)}`));
      else if (event.event_type === "payment.refunded" && event.payment_id) await recordRefunds(db, businessId, await get(`/v1/payments/${encodeURIComponent(event.payment_id)}`));
      else if (event.event_type === "order.completed" && event.order_id) await processOrder(db, businessId, await get(`/v1/orders/${encodeURIComponent(event.order_id)}`), conn.created_at);
      else if (event.event_type === "order.cancelled" && event.order_id) await reverseOrder(db, businessId, event.order_id);
      else return json(200, { ok: true, ignored: true });
      await db.from("yoco_connections").update({ last_event_at: new Date().toISOString(), last_error: null, status: "active" }).eq("business_id", businessId);
      return json(200, { ok: true });
    } catch (e) {
      // Forget this delivery so Yoco's retry is processed, and tell the owner.
      await db.from("yoco_events").delete().eq("webhook_id", id);
      await db.from("yoco_connections").update({ last_error: String((e as Error).message).slice(0, 300), status: "error" }).eq("business_id", businessId);
      return json(500, { error: "Could not process the event" });
    }
  }

  // ---------------- from the app ----------------
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

      // 2. Replace any earlier connection, then ask Yoco to call us on every sale.
      const { data: old } = await db.from("yoco_connections").select("api_key, webhook_subscription_id").eq("business_id", businessId).maybeSingle();
      if (old?.webhook_subscription_id) {
        await yoco(`/v1/webhooks/subscriptions/${encodeURIComponent(old.webhook_subscription_id)}`, old.api_key, { method: "DELETE" }).catch(() => {});
      }
      const sub = await yoco("/v1/webhooks/subscriptions/", key, {
        method: "POST",
        body: JSON.stringify({ name: "To The Cent", event_types: EVENT_TYPES, notification_url: `${url}/functions/v1/yoco?b=${businessId}` }),
      });
      if (!sub.ok) {
        return json(400, { error: sub.status === 401 || sub.status === 403
          ? "Yoco accepted the key but won't let it set up live updates. Create the key again with webhook access switched on."
          : `Yoco couldn't set up live updates (${sub.status}).` });
      }
      const created = await sub.json();
      const connectedAt = new Date().toISOString();
      const { error: saveErr } = await db.from("yoco_connections").upsert({
        business_id: businessId, api_key: key, webhook_subscription_id: created.id ?? null, webhook_secret: created.secret ?? null,
        status: "active", last_error: null, connected_by: caller.user.id, created_at: connectedAt,
      });
      if (saveErr) return json(500, { error: "Could not save the connection." });

      // 3. Start with the last week's sales. Sales from before now are listed so
      //    their items can be matched, but never taken off stock.
      let res = { imported: 0, orders: 0 };
      try { res = await backfill(db, businessId, key, connectedAt); } catch { /* connected fine; sync can be retried */ }
      return json(200, { ok: true, ...res });
    }

    const { data: conn } = await db.from("yoco_connections").select("api_key, webhook_subscription_id, created_at").eq("business_id", businessId).maybeSingle();

    if (action === "map_item") {
      const key = String(body.name_key || "").slice(0, 200);
      if (!key) return json(400, { error: "Bad request" });
      const ignore = body.ignore === true;
      const stockId = body.stock_item_id ? String(body.stock_item_id) : null;
      const recipeId = body.recipe_id ? String(body.recipe_id) : null;
      if (!ignore && ((stockId ? 1 : 0) + (recipeId ? 1 : 0)) !== 1) return json(400, { error: "Choose a stock item or a dish, or mark it as not tracked." });
      for (const [table, id] of [["stock_items", stockId], ["recipes", recipeId]] as const) {
        if (!id) continue;
        if (!UUID.test(id)) return json(400, { error: "Bad request" });
        const { data: own } = await db.from(table).select("id").eq("id", id).eq("business_id", businessId).maybeSingle();
        if (!own) return json(404, { error: "That isn't in your stock." });
      }
      const { error } = await db.from("yoco_item_map").upsert({
        business_id: businessId, name_key: key, display_name: String(body.display_name || "").slice(0, 120) || null,
        stock_item_id: ignore ? null : stockId, recipe_id: ignore ? null : recipeId, ignored: ignore,
      }, { onConflict: "business_id,name_key" });
      if (error) return json(500, { error: "Could not save that match." });
      return json(200, { ok: true, applied: await applyPending(db, businessId, key) });
    }

    if (!conn) return json(404, { error: "Yoco isn't connected." });

    if (action === "sync") {
      const days = Math.min(30, Math.max(1, Number(body.days) || 7));
      return json(200, { ok: true, ...(await backfill(db, businessId, conn.api_key, conn.created_at, days)) });
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
