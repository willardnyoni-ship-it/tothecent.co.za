// Subscription rules that need no network, so they can be tested.

// Prices in cents (rand x 100). Keep in step with PLANS in src/landing/content.jsx.
export const PLAN_PRICES = {
  personal: { name: "To The Cent Personal", amount: 8900 },
  business: { name: "To The Cent Business", amount: 38900 },
} as const;
export type PlanKey = keyof typeof PLAN_PRICES;
export const isPlan = (p: unknown): p is PlanKey => p === "personal" || p === "business";

// Paystack signs the raw request body with the secret key (HMAC-SHA512, hex).
export async function verifySignature(secret: string, raw: string, signature: string | null): Promise<boolean> {
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.toLowerCase().charCodeAt(i);
  return diff === 0;
}

export const sastToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });

// Still inside the free month? Then the card is only saved now and the first
// real charge is set for the day the free month ends (10:00 South African time).
export function startPlan(trialEnd: string, today: string): { trialing: boolean; startDate: string | null } {
  if (trialEnd > today) return { trialing: true, startDate: `${trialEnd}T08:00:00.000Z` };
  return { trialing: false, startDate: null };
}

// "2026-11-12T08:00:00.000Z" -> "2026-11-12" (South African date)
export const dateOf = (iso: unknown): string | null => {
  if (!iso) return null;
  const t = new Date(String(iso));
  return isNaN(t.getTime()) ? null : t.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
};

// A Paystack plan code -> our plan name, using what we stored.
export const planFromCode = (code: unknown, plans: { plan: string; plan_code: string }[]): PlanKey | null => {
  const f = plans.find((p) => p.plan_code === code);
  return f && isPlan(f.plan) ? f.plan : null;
};
