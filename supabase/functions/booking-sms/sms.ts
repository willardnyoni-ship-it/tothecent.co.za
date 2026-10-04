// Booking SMS: phone numbers, message wording and length. Pure functions, no
// network - tested in sms.test.mjs.

// South African numbers in any common form -> "+27821234567". Other countries
// are accepted when written with a + (or 00) prefix. null if it can't be a phone.
export function normalisePhone(raw: string): string | null {
  let d = String(raw || "").trim().replace(/[\s().-]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) {
    const n = d.slice(1);
    return /^\d{8,15}$/.test(n) && !n.startsWith("0") ? "+" + n : null;
  }
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith("27") && d.length === 11) return "+" + d;
  if (d.startsWith("0") && d.length === 10) return "+27" + d.slice(1);
  if (d.length === 9 && !d.startsWith("0")) return "+27" + d; // 821234567
  return null;
}

// Keep to plain characters so a message stays in the cheap 160-character
// encoding (accents and curly quotes would switch it to 70 per part).
export function gsm(text: string): string {
  return String(text || "")
    .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "").replace(/[`^{}\\[\]~|]/g, " ").replace(/ {2,}/g, " ").trim();
}

export const segments = (text: string) => (text.length <= 160 ? 1 : Math.ceil(text.length / 153));
const short = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + ".");

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const plusDay = (d: string, n: number) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export function dayLabel(date: string): string {
  const t = new Date(date + "T12:00:00Z");
  return `${WD[t.getUTCDay()]} ${t.getUTCDate()} ${MO[t.getUTCMonth()]}`;
}
// "today", "tomorrow" or "on Mon 19 Oct"
export function dayWords(date: string, todaySast: string): string {
  if (date === todaySast) return "today";
  if (date === plusDay(todaySast, 1)) return "tomorrow";
  return "on " + dayLabel(date);
}

export type Due = {
  kind: "reminder" | "confirmation" | "cancelled"; client_name: string; service: string; date: string; start_time: string; biz_name: string;
  contact_phone: string | null; slug: string; deposit_due: number; reference: string;
};

// The text for one message, fitted into a single 160-character SMS whenever it
// can be (optional extras are dropped from the end until it fits).
export function buildMessage(d: Due, todaySast: string, base = "https://tothecent.co.za"): string {
  const first = short(gsm(String(d.client_name || "").split(" ")[0]) || "there", 14);
  const svc = short(gsm(d.service) || "appointment", 22);
  const biz = short(gsm(d.biz_name) || "us", 26);
  const t = d.start_time;
  const contact = d.contact_phone ? gsm(d.contact_phone).replace(/[^\d+ ]/g, "").trim() : "";
  const deposit = +d.deposit_due > 0 ? `R${Math.round(+d.deposit_due)}` : "";
  let parts: string[];
  if (d.kind === "reminder") {
    parts = [`Hi ${first}, reminder: ${svc} at ${biz} ${dayWords(d.date, todaySast)} at ${t}.`, contact ? `To change, call/WhatsApp ${contact}.` : "", "See you!"];
  } else if (d.kind === "confirmation") {
    parts = [`Hi ${first}, your ${svc} at ${biz} is booked for ${dayLabel(d.date)} at ${t}.`, deposit ? `${deposit} deposit holds your slot.` : "", `Ref ${d.reference}.`, contact ? `Questions? ${contact}` : ""];
  } else {
    parts = [`Hi ${first}, sorry - ${biz} can't go ahead with your ${svc} on ${dayLabel(d.date)} at ${t}.`, `Book another time: ${base}/book/?b=${d.slug}`];
  }
  const keep = parts.filter(Boolean);
  // drop optional extras from the end until it fits (the rebooking link is the point of a cancellation, so that one stays)
  while (d.kind !== "cancelled" && keep.length > 1 && keep.join(" ").length > 160) keep.pop();
  return gsm(keep.join(" "));
}
