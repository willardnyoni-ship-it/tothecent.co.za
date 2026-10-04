// Pure logic for the Yoco integration - no Deno or network calls in here, so
// it can be tested on its own (see yocoLogic.test.mjs).

const enc = new TextEncoder();

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Yoco signs `{webhook-id}.{webhook-timestamp}.{raw body}` with HMAC-SHA256,
// keyed by the subscription secret (after dropping "whsec_" and base64
// decoding). The webhook-signature header holds one or more "v1,<base64>"
// values separated by spaces. Events older than 3 minutes are rejected.
export async function verifySignature(
  secret: string, id: string, timestamp: string, rawBody: string, signatureHeader: string, nowMs = Date.now(),
): Promise<boolean> {
  if (!secret || !id || !timestamp || !signatureHeader) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs - ts * 1000) > 3 * 60 * 1000) return false;
  let keyBytes: Uint8Array;
  try { keyBytes = b64decode(secret.replace(/^whsec_/, "")); } catch { return false; }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${timestamp}.${rawBody}`)));
  const expected = b64encode(mac);
  return signatureHeader.split(" ").some((part) => {
    const sig = part.includes(",") ? part.slice(part.indexOf(",") + 1) : part;
    return safeEqual(sig, expected);
  });
}

type Money = { amount?: number; currency?: string } | number | null | undefined;
const cents = (m: Money): number => (typeof m === "number" ? m : Number(m?.amount) || 0);
const rand = (c: number) => Math.round(c) / 100;

// South African calendar date for an ISO timestamp.
export function sastDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
}

const METHOD_LABEL: Record<string, string> = {
  card: "card", cash: "cash", instant_eft: "instant EFT", gift_voucher: "gift voucher", other: "payment",
};

export type TxRow = {
  date: string; description: string; amount: number; kind: "income" | "expense";
  category: string; status: "reviewed"; source: "yoco"; external_id: string;
};

// Turns a Yoco payment into Money rows: the sale as income (tips left out -
// they belong to staff) and Yoco's processing fee as a bank-fee expense, so
// income minus fees matches what lands in the bank.
export function mapPayment(p: Record<string, any>): TxRow[] {
  if (!p || p.status !== "approved" || !p.id) return [];
  const date = sastDate(p.created_at);
  const method = METHOD_LABEL[p.payment_method] || "payment";
  const where = p.payment_source === "card_machine" ? "card machine" : String(p.payment_source || "").replace(/_/g, " ");
  const tip = cents(p.tip_amount);
  const total = cents(p.amount_excl_tip) || Math.max(0, cents(p.total_amount) - tip);
  const receipt = p.receipt_number ? ` · receipt ${p.receipt_number}` : "";
  const rows: TxRow[] = [];
  if (total > 0) {
    rows.push({
      date, amount: rand(total), kind: "income", category: "Sales", status: "reviewed", source: "yoco", external_id: String(p.id),
      description: `Yoco ${method} sale${where ? " (" + where + ")" : ""}${receipt}${tip > 0 ? ` · tip R${rand(tip).toFixed(2)} not counted` : ""}`,
    });
  }
  // Fee shapes aren't fully documented, so read them defensively: a number,
  // a Money object, or an object with an amount/fee_amount field.
  const feeCents = (Array.isArray(p.processing_fees) ? p.processing_fees : []).reduce((a: number, f: any) => {
    const v = f && typeof f === "object" ? (f.amount ?? f.fee_amount ?? f.value) : f;
    return a + cents(v);
  }, 0);
  if (feeCents > 0) {
    rows.push({
      date, amount: rand(feeCents), kind: "expense", category: "Bank fees", status: "reviewed", source: "yoco",
      external_id: `${p.id}:fee`, description: `Yoco processing fee${receipt}`,
    });
  }
  return rows;
}
