// Monthly subscriptions through Paystack. Deployed as 'paystack' with JWT
// verification OFF: Paystack's servers call it, and every request is checked here
// (Paystack's signature for events, the signed-in person's token for the rest).
//
// From the app (signed in):
//   subscribe {plan}     -> a Paystack checkout link. During the free month the card is only
//                           saved (R1 check, refunded) and the first real charge is set for the
//                           day the free month ends. After it, the checkout charges the plan now.
//   verify {reference}   -> called when the customer comes back from checkout
//   manage               -> a Paystack link to change the card
//   cancel               -> stop the subscription
// From Paystack (signature header): charge.success, subscription.create,
//   subscription.disable / not_renew, invoice.payment_failed.
//
// Needs the secret PAYSTACK_SECRET_KEY (Paystack dashboard -> Settings -> API keys).
// Use the TEST key first: sk_test_... Until it is set, every call says billing isn't switched on.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { dateOf, isPlan, PLAN_PRICES, planFromCode, sastToday, startPlan, verifySignature } from "./paystackLogic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-paystack-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const SITE = Deno.env.get("PUBLIC_SITE_URL") || "https://tothecent.co.za";

// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type Json = any;

async function ps(path: string, key: string, init: RequestInit = {}): Promise<{ ok: boolean; data: Json; message: string }> {
  const r = await fetch("https://api.paystack.co" + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok && d.status !== false, data: d.data, message: d.message || `HTTP ${r.status}` };
}

// The Paystack plan for "personal" or "business", created the first time it is needed.
async function planCode(db: Db, key: string, plan: "personal" | "business"): Promise<string> {
  const want = PLAN_PRICES[plan];
  const { data: have } = await db.from("paystack_plans").select("plan_code,amount_cents").eq("plan", plan).maybeSingle();
  if (have && have.amount_cents === want.amount) return have.plan_code;
  const r = await ps("/plan", key, { method: "POST", body: JSON.stringify({ name: want.name, amount: want.amount, interval: "monthly", currency: "ZAR" }) });
  if (!r.ok || !r.data?.plan_code) throw new Error("Could not set up the plan: " + r.message);
  await db.from("paystack_plans").upsert({ plan, plan_code: r.data.plan_code, amount_cents: want.amount });
  return r.data.plan_code;
}

async function userFor(db: Db, d: Json): Promise<string | null> {
  const id = d?.metadata?.user_id;
  if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) return id;
  const email = d?.customer?.email;
  if (!email) return null;
  const { data } = await db.rpc("billing_user_by_email", { p_email: email });
  return data || null;
}

async function setBilling(db: Db, userId: string, fields: Record<string, unknown>) {
  const { error } = await db.from("account_billing").upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error("Could not save billing: " + error.message);
}
const cardFields = (a: Json) => (a ? { card_brand: a.brand || a.card_type || null, card_last4: a.last4 || null } : {});

// A successful card payment. Handles the R1 card check (create the monthly subscription),
// the first full payment after the free month, and every monthly renewal.
async function onCharge(db: Db, key: string, tx: Json): Promise<string> {
  if (tx.status && tx.status !== "success") return "ignored";
  const userId = await userFor(db, tx);
  if (!userId) return "unknown customer";
  const plans = (await db.from("paystack_plans").select("plan,plan_code")).data || [];

  if (tx.metadata?.purpose === "card_setup") {
    const ref = "setup:" + tx.reference;
    const ins = await db.from("paystack_events").insert({ ref });
    if (ins.error) return "already handled";
    try {
      const auth = tx.authorization || {};
      const plan = isPlan(tx.metadata.plan) ? tx.metadata.plan : "personal";
      const { data: cur } = await db.from("account_billing").select("paystack_sub_code,debit_order_status,trial_ends_on").eq("user_id", userId).maybeSingle();
      if (!(cur?.paystack_sub_code && cur.debit_order_status === "signed")) {
        if (!auth.authorization_code || auth.reusable === false) throw new Error("That card can't be used for monthly payments. Please try a different card.");
        const start = tx.metadata.start_date || null;
        const sub = await ps("/subscription", key, {
          method: "POST",
          body: JSON.stringify({ customer: tx.customer.customer_code, plan: await planCode(db, key, plan), authorization: auth.authorization_code, ...(start ? { start_date: start } : {}) }),
        });
        if (!sub.ok) throw new Error("Could not start the subscription: " + sub.message);
        await setBilling(db, userId, {
          plan, debit_order_status: "signed", debit_order_signed_on: sastToday(),
          paystack_customer: tx.customer.customer_code, paystack_sub_code: sub.data.subscription_code, paystack_email_token: sub.data.email_token,
          next_payment_on: dateOf(sub.data.next_payment_date) || dateOf(start), pay_issue: null, ...cardFields(auth),
        });
      }
      await ps("/refund", key, { method: "POST", body: JSON.stringify({ transaction: tx.reference }) }); // the R1 check, best effort
      return "subscribed";
    } catch (e) {
      await db.from("paystack_events").delete().eq("ref", ref); // let a retry run again
      throw e;
    }
  }

  // a plan payment: the first one after the free month, or a monthly renewal
  const planName = planFromCode(tx.plan?.plan_code || tx.plan_object?.plan_code, plans) || (isPlan(tx.metadata?.plan) ? tx.metadata.plan : null);
  if (!planName && !tx.plan) return "not a plan payment";
  await setBilling(db, userId, {
    ...(planName ? { plan: planName } : {}), debit_order_status: "signed", paystack_customer: tx.customer?.customer_code,
    pay_issue: null, ...cardFields(tx.authorization),
  });
  const { data: cur } = await db.from("account_billing").select("debit_order_signed_on").eq("user_id", userId).maybeSingle();
  if (!cur?.debit_order_signed_on) await db.from("account_billing").update({ debit_order_signed_on: sastToday() }).eq("user_id", userId);
  return "paid";
}

async function onEvent(db: Db, key: string, ev: Json): Promise<string> {
  const d = ev.data || {};
  switch (ev.event) {
    case "charge.success": return await onCharge(db, key, d);
    case "subscription.create": {
      const userId = await userFor(db, d);
      if (!userId) return "unknown customer";
      const plans = (await db.from("paystack_plans").select("plan,plan_code")).data || [];
      await setBilling(db, userId, {
        debit_order_status: "signed", paystack_customer: d.customer?.customer_code, paystack_sub_code: d.subscription_code, paystack_email_token: d.email_token,
        next_payment_on: dateOf(d.next_payment_date), ...(planFromCode(d.plan?.plan_code, plans) ? { plan: planFromCode(d.plan?.plan_code, plans) } : {}),
      });
      return "subscription saved";
    }
    case "subscription.disable":
    case "subscription.not_renew": {
      const code = d.subscription_code;
      if (!code) return "ignored";
      await db.from("account_billing").update({ debit_order_status: "cancelled", updated_at: new Date().toISOString() }).eq("paystack_sub_code", code);
      return "cancelled";
    }
    case "invoice.payment_failed": {
      const code = d.subscription?.subscription_code;
      if (!code) return "ignored";
      await db.from("account_billing").update({ pay_issue: "Your last payment didn't go through. Please update your card.", updated_at: new Date().toISOString() }).eq("paystack_sub_code", code);
      return "payment failed noted";
    }
    default: return "ignored";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), key = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!url || !serviceKey) return json(500, { error: "Server not configured" });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const raw = await req.text();

  try {
    // ---- from Paystack ----
    const signature = req.headers.get("x-paystack-signature");
    if (signature) {
      if (!key || !(await verifySignature(key, raw, signature))) return json(401, { error: "Bad signature" });
      const ev = JSON.parse(raw);
      const id = ev.data?.id ? `${ev.event}:${ev.data.id}` : null;
      // charge and subscription events are safe to repeat; others are de-duplicated
      if (id && !String(ev.event).startsWith("charge.") && !String(ev.event).startsWith("subscription.")) {
        const ins = await db.from("paystack_events").insert({ ref: id });
        if (ins.error) return json(200, { ok: true, repeat: true });
      }
      return json(200, { ok: true, result: await onEvent(db, key, ev) });
    }

    // ---- from the app ----
    if (!key) return json(200, { ok: false, error: "Paying by subscription isn't switched on yet." });
    let body: Json = {};
    try { body = JSON.parse(raw || "{}"); } catch { /* empty */ }
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: who } = await db.auth.getUser(token);
    const user = who?.user;
    if (!user || !user.email) return json(401, { error: "Sign in first." });
    const action = String(body.action || "");
    const { data: ab } = await db.from("account_billing").select("*").eq("user_id", user.id).maybeSingle();

    if (action === "subscribe") {
      if (!isPlan(body.plan)) return json(400, { error: "Choose a plan." });
      if (ab?.paystack_sub_code && ab.debit_order_status === "signed") return json(200, { ok: false, error: "You already have an active subscription." });
      const trialEnd = ab?.trial_ends_on || dateOf(new Date(new Date(user.created_at).setMonth(new Date(user.created_at).getMonth() + 1)).toISOString())!;
      const { trialing, startDate } = startPlan(trialEnd, sastToday());
      const reference = "ttc_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
      const init = {
        email: user.email, reference, currency: "ZAR", callback_url: `${SITE}/app/?paid=1`,
        channels: ["card"],
        ...(trialing
          ? { amount: 100, metadata: { purpose: "card_setup", user_id: user.id, plan: body.plan, start_date: startDate } }
          : { plan: await planCode(db, key, body.plan), metadata: { purpose: "plan_payment", user_id: user.id, plan: body.plan } }),
      };
      const r = await ps("/transaction/initialize", key, { method: "POST", body: JSON.stringify(init) });
      if (!r.ok || !r.data?.authorization_url) return json(200, { ok: false, error: "Couldn't open the payment page: " + r.message });
      return json(200, { ok: true, url: r.data.authorization_url, trialing, firstPayment: trialing ? trialEnd : null });
    }

    if (action === "verify") {
      const ref = String(body.reference || "");
      if (!/^ttc_[0-9a-f]{20}$/.test(ref)) return json(400, { error: "Bad reference." });
      const r = await ps("/transaction/verify/" + ref, key);
      if (!r.ok) return json(200, { ok: false, error: "Couldn't confirm the payment yet." });
      if (r.data.metadata?.user_id !== user.id) return json(403, { error: "That payment is not yours." });
      if (r.data.status !== "success") return json(200, { ok: false, error: "The payment didn't go through." });
      return json(200, { ok: true, result: await onCharge(db, key, r.data) });
    }

    if (action === "manage") {
      if (!ab?.paystack_sub_code) return json(200, { ok: false, error: "You don't have a subscription yet." });
      const r = await ps(`/subscription/${ab.paystack_sub_code}/manage/link`, key);
      return r.ok && r.data?.link ? json(200, { ok: true, url: r.data.link }) : json(200, { ok: false, error: "Couldn't open card settings: " + r.message });
    }

    if (action === "cancel") {
      if (!ab?.paystack_sub_code || !ab.paystack_email_token) return json(200, { ok: false, error: "You don't have a subscription to cancel." });
      const r = await ps("/subscription/disable", key, { method: "POST", body: JSON.stringify({ code: ab.paystack_sub_code, token: ab.paystack_email_token }) });
      if (!r.ok) return json(200, { ok: false, error: "Couldn't cancel: " + r.message });
      await db.from("account_billing").update({ debit_order_status: "cancelled", updated_at: new Date().toISOString() }).eq("user_id", user.id);
      return json(200, { ok: true });
    }
    return json(400, { error: "Unknown action" });
  } catch (e) {
    return json(502, { error: (e as Error).message || "Something went wrong." });
  }
});
