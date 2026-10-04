// The sending loop, separate from the provider so it can be tested with a
// pretend one. For each message sms_due() says is owed: record it in
// sms_outbox, send it, and record what happened.
import { buildMessage, normalisePhone, segments } from "./sms.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
export type SendResult = { ok: boolean; id?: string; error?: string; fatal?: boolean };
export type Send = (to: string, text: string) => Promise<SendResult>;

export const sastToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });

export async function runDue(db: Db, send: Send, limit = 60) {
  const { data: claimed } = await db.rpc("sms_claim_run");
  if (!claimed) return { ok: true, skipped: "ran recently" };
  const { data: due, error } = await db.rpc("sms_due", { p_limit: limit, p_cap: 300 });
  if (error) throw new Error("Could not read what is due: " + error.message);

  const today = sastToday();
  const out = { ok: true, due: (due || []).length, sent: 0, failed: 0, skipped: 0, stopped: "" };
  // deno-lint-ignore no-explicit-any
  for (const d of (due || []) as any[]) {
    const phone = normalisePhone(d.phone);
    const text = buildMessage({ ...d, contact_phone: d.contact_phone, deposit_due: +d.deposit_due }, today);

    // one row per booking per kind: the first time inserts, a retry of a failed one updates
    let id: string | null = null, attempts = 0;
    const ins = await db.from("sms_outbox").insert({
      business_id: d.business_id, booking_id: d.booking_id, kind: d.kind, to_phone: phone || String(d.phone).slice(0, 30), body: text, segments: segments(text), status: "queued",
    }).select("id").single();
    if (ins.error) {
      if (ins.error.code !== "23505") throw new Error("Could not record the message: " + ins.error.message);
      const { data: ex } = await db.from("sms_outbox").select("id,status,attempts").eq("booking_id", d.booking_id).eq("kind", d.kind).maybeSingle();
      if (!ex || ex.status !== "failed" || ex.attempts >= 3) continue;
      id = ex.id; attempts = ex.attempts;
    } else id = ins.data.id;

    if (!phone) {
      await db.from("sms_outbox").update({ status: "skipped", error: "not a valid phone number" }).eq("id", id);
      out.skipped++; continue;
    }
    const r = await send(phone, text);
    if (r.ok) {
      await db.from("sms_outbox").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: r.id || null, attempts: attempts + 1, error: null }).eq("id", id);
      out.sent++;
    } else {
      await db.from("sms_outbox").update({ status: "failed", error: String(r.error || "failed").slice(0, 300), attempts: attempts + 1 }).eq("id", id);
      out.failed++;
      if (r.fatal) { out.stopped = String(r.error || "provider refused"); break; } // wrong login or no credit: don't burn every message's attempts
    }
  }
  return out;
}

// A test message to one number (so an owner can check it works).
export async function sendTest(db: Db, send: Send, businessId: string, bizName: string, rawPhone: string) {
  const phone = normalisePhone(rawPhone);
  if (!phone) return { ok: false, error: "That doesn't look like a phone number." };
  const since = new Date(Date.now() - 86400e3).toISOString();
  const { count } = await db.from("sms_outbox").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("kind", "test").gte("created_at", since);
  if ((count || 0) >= 3) return { ok: false, error: "You've sent 3 test messages today - try again tomorrow." };
  const text = `This is a test from ${bizName.slice(0, 40)} via To The Cent. Booking reminders are working.`.replace(/[^\x20-\x7E]/g, "");
  const { data: row } = await db.from("sms_outbox").insert({ business_id: businessId, kind: "test", to_phone: phone, body: text, segments: segments(text), status: "queued" }).select("id").single();
  const r = await send(phone, text);
  if (row) await db.from("sms_outbox").update(r.ok ? { status: "sent", sent_at: new Date().toISOString(), provider_id: r.id || null, attempts: 1 } : { status: "failed", error: String(r.error || "failed").slice(0, 300), attempts: 1 }).eq("id", row.id);
  return r.ok ? { ok: true } : { ok: false, error: "The test message couldn't be sent. Please try again in a minute." };
}
