// Lets an app owner (a user listed in public.app_admins) create an account
// for someone else - optionally with a business already set up - and get
// back a one-time link where that person chooses their own password.
//
// Nothing is emailed from here: the owner shares the link themselves
// (WhatsApp/email from their own device), same as the invite flow. The
// owner never sets or sees the new person's password.
//
// Needs the service role key to create users, which the Edge runtime
// provides as SUPABASE_SERVICE_ROLE_KEY - it never reaches the browser.
// Every request is checked twice before anything is created: the caller's
// token must belong to a real signed-in user, and that user must be in
// app_admins.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://tothecent.co.za/";
const KNOWN_FEATURES = new Set(["quotes", "reminders", "time", "taxSavings", "jobs", "mileage", "stock", "cashup", "bookings", "payroll", "vat"]);
const KNOWN_PROFILES = new Set(["freelancer", "trades", "retail", "food", "appointments", "general"]);
const BUSINESS_TYPES = new Set(["Sole Proprietor", "Private Company", "Partnership", "Other"]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "Server not configured" });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Who is calling? (getUser validates the token with Supabase Auth -
  //    the public anon key is not a user and fails here.)
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller?.user) return json(401, { error: "Sign in first." });

  // 2. Are they an app owner?
  const { data: adminRow } = await admin.from("app_admins").select("user_id").eq("user_id", caller.user.id).maybeSingle();
  if (!adminRow) return json(403, { error: "Only app owners can create accounts." });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "Bad request" }); }

  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim().slice(0, 120);
  const segment = body.segment === "business" ? "business" : "personal";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Enter a valid email address." });

  const biz = (body.business && typeof body.business === "object") ? body.business as Record<string, unknown> : null;
  if (segment === "business" && biz) {
    if (!String(biz.name || "").trim()) return json(400, { error: "Give the business a name." });
    if (!KNOWN_PROFILES.has(String(biz.profile))) return json(400, { error: "Choose a kind of business." });
  }

  // 3. Create the account and the one-time "choose your password" link.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { segment, full_name: name || null, created_by_owner: true }, redirectTo: SITE },
  });
  if (linkErr || !link?.user) {
    const msg = linkErr?.message || "Could not create the account.";
    const exists = /already|registered|exists/i.test(msg);
    return json(exists ? 409 : 400, { error: exists ? "Someone with that email already has an account." : msg });
  }
  const userId = link.user.id;

  // 4. Optionally set up their business, owned by them.
  let businessId: string | null = null;
  if (segment === "business" && biz) {
    const features = Array.isArray(biz.features) ? (biz.features as unknown[]).map(String).filter(f => KNOWN_FEATURES.has(f)) : [];
    const { data: b, error: bErr } = await admin.from("businesses").insert({
      owner_id: userId,
      name: String(biz.name).trim().slice(0, 120),
      business_type: BUSINESS_TYPES.has(String(biz.business_type)) ? String(biz.business_type) : "Sole Proprietor",
      industry: String(biz.industry || "").trim().slice(0, 120) || null,
      business_profile: String(biz.profile),
      features,
      country: "South Africa",
      currency: "ZAR",
      financial_year_end: "February",
    }).select("id").single();
    if (bErr || !b) {
      // Don't leave a half-made account behind if the business failed.
      await admin.auth.admin.deleteUser(userId);
      return json(500, { error: "Could not create the business: " + (bErr?.message || "unknown error") });
    }
    businessId = b.id;
    await admin.from("business_members").insert({
      business_id: b.id, email, user_id: userId, role: "owner", status: "active", joined_at: new Date().toISOString(),
    });
  }

  // 5. Keep a record alongside the portal's other invites.
  await admin.from("app_invites").insert({
    email, name: name || null, invited_by: caller.user.id,
    note: businessId ? "Account and business created from the owner portal" : "Account created from the owner portal",
  });

  return json(200, { link: link.properties?.action_link, user_id: userId, business_id: businessId });
});
