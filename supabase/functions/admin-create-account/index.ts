// Deployed on Supabase under the URL slug 'quick-function' (display name
// admin-create-account) - see CREATE_ACCOUNT_FN in src/admin/AdminApp.jsx.
//
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
import { loginEmail, makePassword } from "./loginLogic.ts";

const SITE = "https://tothecent.co.za/";
const KNOWN_FEATURES = new Set(["quotes", "reminders", "time", "taxSavings", "jobs", "mileage", "stock", "cashup", "bookings", "payroll", "vat", "vehicles"]);
const KNOWN_PROFILES = new Set(["freelancer", "trades", "retail", "food", "appointments", "motor", "general"]);
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

  // create_login: make the account with a generated password and email the details to the person.
  if (body.action === "create_login") return createLogin(admin, caller.user, body);

  // Account actions on an existing person. No "action" means the original
  // behaviour below: create a new account.
  if (body.action && body.action !== "create") {
    return accountAction(admin, caller.user, body);
  }

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

// ---------- login details by email ----------
// The owner types an email address. We create the account (already confirmed, so no confirmation email
// is needed) with a strong generated password, and email the person their login. The account is marked
// so the app makes them choose their own password and say whether they are setting up for themselves or
// for a business the first time they log in. Emailing needs the Edge Function secret RESEND_API_KEY
// (a Resend key with sending access); without it the password is handed back to the owner to pass on.
async function createLogin(admin: Admin, actor: Person, body: Record<string, unknown>) {
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Enter a valid email address." });

  const password = makePassword(12);
  const { data: made, error: mkErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: name || null, created_by_owner: true, must_change_password: true, setup_pending: true },
  });
  if (mkErr || !made?.user) {
    const msg = mkErr?.message || "Could not create the account.";
    const exists = /already|registered|exists/i.test(msg);
    return json(exists ? 409 : 400, { error: exists ? "Someone with that email already has an account. Use \"Create sign-in link\" on the People page instead." : msg });
  }
  await admin.from("app_invites").insert({ email, name: name || null, invited_by: actor.id, note: "Login details created from the owner portal" });

  let emailed = false, emailError = "";
  const key = Deno.env.get("RESEND_API_KEY");
  if (key) {
    const m = loginEmail({ name, email, password, site: SITE });
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "To The Cent <no-reply@tothecent.co.za>", to: [email], subject: m.subject, html: m.html, text: m.text }),
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) emailed = true;
      else emailError = ((await r.json().catch(() => ({}))) as { message?: string }).message || `Email service said ${r.status}`;
    } catch (e) { emailError = (e as Error).message || "Could not reach the email service."; }
  } else emailError = "Emailing isn't switched on yet (the RESEND_API_KEY secret is missing).";

  await logAction(admin, actor, "login_sent", { id: made.user.id, email }, emailed ? "Login details emailed" : "Account made; login details not emailed");
  // the password only travels back to the owner when it could not be emailed
  return json(200, { ok: true, user_id: made.user.id, emailed, emailError: emailed ? "" : emailError, ...(emailed ? {} : { password }) });
}

// ---------- account actions on an existing person ----------
// signin_link: one-time link where they set a (new) password - works for
//   anyone who never finished signing up and anyone locked out.
// suspend / unsuspend: block or allow sign-in; no data is touched.
// delete: personal accounts only. A business owner can't be deleted here,
//   because businesses.owner_id cascades - deleting the account would wipe
//   their whole business and every record in it.
// Never on yourself, and only sign-in links for other app owners.
// deno-lint-ignore no-explicit-any
type Admin = any;
type Person = { id: string; email?: string | null };

async function logAction(admin: Admin, actor: Person, action: string, target: Person | null, details?: string) {
  await admin.from("app_admin_log").insert({
    actor_id: actor.id, actor_email: actor.email ?? null, action,
    target_id: target?.id ?? null, target_email: target?.email ?? null, details: details ?? null,
  });
}

async function accountAction(admin: Admin, actor: Person, body: Record<string, unknown>) {
  const action = String(body.action);
  const userId = String(body.user_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json(400, { error: "Missing person." });

  const { data: got, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !got?.user) return json(404, { error: "That account no longer exists." });
  const target: Person = { id: got.user.id, email: got.user.email };
  if (target.id === actor.id) return json(400, { error: "You can't do that to your own account." });

  const { data: targetIsOwner } = await admin.from("app_admins").select("user_id").eq("user_id", target.id).maybeSingle();
  if (targetIsOwner && action !== "signin_link") {
    return json(400, { error: "That person is an app owner. Remove their owner access first." });
  }

  if (action === "signin_link") {
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: target.email, options: { redirectTo: SITE } });
    if (error) return json(400, { error: error.message });
    await logAction(admin, actor, "sent_signin_link", target);
    return json(200, { link: data?.properties?.action_link });
  }

  if (action === "suspend" || action === "unsuspend") {
    const reason = String(body.reason || "").trim().slice(0, 300);
    // ~100 years; Supabase has no "forever". 'none' lifts it.
    const { error } = await admin.auth.admin.updateUserById(target.id, { ban_duration: action === "suspend" ? "876000h" : "none" });
    if (error) return json(400, { error: error.message });
    await logAction(admin, actor, action === "suspend" ? "suspended" : "unsuspended", target, reason || undefined);
    return json(200, { ok: true });
  }

  if (action === "delete") {
    if (String(body.confirm_email || "").trim().toLowerCase() !== String(target.email || "").toLowerCase()) {
      return json(400, { error: "Type their email address exactly to confirm." });
    }
    const { count: owned } = await admin.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", target.id);
    if (owned) {
      return json(409, { error: "They own a business. Deleting the account would also delete the whole business and all its records. Suspend them instead." });
    }

    // Personal budget: leave households they share with someone else; remove
    // the synced budget only where they were the last member.
    const { data: memberships } = await admin.from("household_members").select("household").eq("user_id", target.id);
    await admin.from("household_members").delete().eq("user_id", target.id);
    let budgetsRemoved = 0;
    for (const h of memberships || []) {
      const { count: left } = await admin.from("household_members").select("user_id", { count: "exact", head: true }).eq("household", h.household);
      if (!left) {
        await admin.from("budget_sync").delete().eq("household", h.household);
        budgetsRemoved++;
      }
    }
    // Staff/accountant seats in other people's businesses.
    await admin.from("business_members").delete().eq("user_id", target.id);
    // Uploaded files are deliberately left in Storage: slip photos expire on
    // their own after 45 days, and anything else is removed by hand from the
    // Supabase dashboard if needed.

    const { error } = await admin.auth.admin.deleteUser(target.id);
    if (error) return json(500, { error: "Could not delete the account: " + error.message });
    await logAction(admin, actor, "deleted", target, budgetsRemoved ? `${budgetsRemoved} personal budget removed` : undefined);
    return json(200, { ok: true });
  }

  return json(400, { error: "Unknown action." });
}
