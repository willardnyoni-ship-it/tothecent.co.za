// Orders and refunds: what was sold, and money going back. Pure functions - no
// network calls - tested in yocoLogic.test.mjs.
import { sastDate } from "./yocoLogic.ts";
import type { TxRow } from "./yocoLogic.ts";

type Money = { amount?: number } | number | null | undefined;
const cents = (m: Money): number => (typeof m === "number" ? m : Number(m?.amount) || 0);
const rand = (c: number) => Math.round(c) / 100;

// A name reduced to its letters and numbers, so "Flat White " and "flat-white"
// count as the same Yoco item.
export function nameKey(name: string): string {
  return String(name || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

export type SoldLine = { line_id: string; name: string; name_key: string; qty: number; unit_price: number; revenue: number; sold_at: string };

// The product lines of a completed order. Custom amounts ("R50 sundry") and
// gift vouchers don't correspond to anything on a shelf, so they're skipped.
// deno-lint-ignore no-explicit-any
export function orderLines(order: Record<string, any> | null): SoldLine[] {
  if (!order || !Array.isArray(order.line_items)) return [];
  const soldAt = order.closed_at || order.created_at || new Date().toISOString();
  const out: SoldLine[] = [];
  for (const l of order.line_items) {
    if (!l || l.item_type === "custom_amount" || l.item_type === "gift_voucher") continue;
    const name = String(l.name || "").trim();
    const qty = parseFloat(String(l.quantity ?? "1"));
    if (!name || !(qty > 0) || !l.id) continue;
    out.push({
      line_id: String(l.id), name: name.slice(0, 120), name_key: nameKey(name), qty,
      unit_price: rand(cents(l.unit_price)), revenue: rand(cents(l.net_amount ?? l.total_price)), sold_at: soldAt,
    });
  }
  return out;
}

// Refunds on a payment, as expense rows (money going back to the customer).
// Refund shapes aren't fully documented, so they're read defensively.
// deno-lint-ignore no-explicit-any
export function mapRefunds(p: Record<string, any> | null): TxRow[] {
  if (!p || !p.id || !Array.isArray(p.refunds)) return [];
  const rows: TxRow[] = [];
  // deno-lint-ignore no-explicit-any
  p.refunds.forEach((r: any, i: number) => {
    const amount = rand(cents(r && typeof r === "object" ? (r.amount ?? r.total_amount ?? r.refunded_amount) : r));
    if (!(amount > 0)) return;
    rows.push({
      date: sastDate((r && r.created_at) || p.updated_at || p.created_at), amount, kind: "expense", category: "Refunds", status: "reviewed", source: "yoco",
      external_id: `${p.id}:refund:${(r && r.id) || i}`, description: `Yoco refund${p.receipt_number ? " · receipt " + p.receipt_number : ""}`,
    });
  });
  return rows;
}
