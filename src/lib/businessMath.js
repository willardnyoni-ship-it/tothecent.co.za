// Invoice totals, VAT, and invoice<->transaction payment matching.
const VAT_RATE = 0.15;

export function computeInvoiceTotals(items, vatEnabled, discount) {
  const subtotal = items.reduce((a, i) => a + (+i.qty || 0) * (+i.price || 0), 0);
  const vat = vatEnabled ? +(subtotal * VAT_RATE).toFixed(2) : 0;
  const total = Math.max(0, subtotal + vat - (+discount || 0));
  return { subtotal: +subtotal.toFixed(2), vat, total: +total.toFixed(2) };
}

export function invoiceStatusLabel(inv) {
  if (inv.status === 'paid') return 'Paid';
  if (inv.status === 'partially_paid') return 'Partially paid';
  if (inv.status === 'cancelled') return 'Cancelled';
  if (inv.status === 'draft') return 'Draft';
  if (inv.status === 'sent' || inv.status === 'viewed') {
    if (inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10)) return 'Overdue';
    return inv.status === 'viewed' ? 'Viewed' : 'Sent';
  }
  return inv.status;
}

// A transaction is a plausible payment for an invoice if the amount matches
// (within a cent) and, when we have a customer name, the transaction
// description mentions it. Ported concept from the personal app's
// receipt<->statement matching (src/lib/match.js), adapted for invoices.
export function findInvoiceMatches(invoices, transactions) {
  const open = invoices.filter(i => !['paid', 'cancelled', 'draft'].includes(i.status));
  const incoming = transactions.filter(t => t.kind === 'income' && !t.linked_invoice_id);
  const matches = [];
  for (const inv of open) {
    const remaining = +(inv.total - (inv.paid_amount || 0)).toFixed(2);
    for (const t of incoming) {
      if (Math.abs(+t.amount - remaining) > 0.01) continue;
      const name = (inv.customerName || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const nameHit = name && desc.includes(name.split(' ')[0]);
      matches.push({ invoice: inv, transaction: t, confidence: nameHit ? 'high' : 'amount-only' });
    }
  }
  return matches;
}

const EXPENSE_MATCH_DAYS = 4;

// Same idea as findInvoiceMatches, for the other side of the ledger: a
// scanned/manual expense with no linked bank line yet, matched against an
// unmatched expense-kind transaction by amount (within a cent) and a small
// day window. Lets an expense record actually connect to the money that
// left the account, instead of matched_transaction_id sitting unused.
export function findExpenseMatches(expenses, transactions) {
  const open = expenses.filter(e => e.status !== 'rejected' && !e.matched_transaction_id);
  const unlinked = transactions.filter(t => t.kind === 'expense' && !t.linked_invoice_id);
  const used = new Set();
  const matches = [];
  for (const e of open) {
    let best = null, bestDays = Infinity;
    for (const t of unlinked) {
      if (used.has(t.id)) continue;
      if (Math.abs(+t.amount - +e.amount) > 0.01) continue;
      const days = Math.abs((new Date(t.date) - new Date(e.date)) / 86400000);
      if (days > EXPENSE_MATCH_DAYS) continue;
      if (days < bestDays) { best = t; bestDays = days; }
    }
    if (best) { used.add(best.id); matches.push({ expense: e, transaction: best, days: Math.round(bestDays) }); }
  }
  return matches;
}

export function nextInvoiceNumber(business) {
  return (business.invoice_prefix || 'INV-') + String(business.next_invoice_number || 1).padStart(4, '0');
}

export const RECURRING_FREQUENCIES = ['weekly', 'monthly', 'quarterly'];
export const RECURRING_FREQUENCY_LABEL = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly' };

// Calendar-based (not fixed-day-count) so a monthly series lands on roughly
// the same date each month instead of drifting. Anchored to UTC throughout
// (parse with a 'Z', advance with the UTC setters) - mixing a local-time
// parse with toISOString()'s UTC output would silently shift the result by
// a day depending on the runtime's timezone.
export function advanceDate(dateStr, frequency) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (frequency === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// Outstanding balance and payment history for one customer, used by their
// profile screen under Invoices -> Customers.
export function customerLedger(customerId, invoices) {
  const theirs = invoices.filter(i => i.customer_id === customerId && i.status !== 'cancelled');
  const outstanding = theirs.filter(i => i.status !== 'paid' && i.status !== 'draft')
    .reduce((a, i) => a + (+i.total - +(i.paid_amount || 0)), 0);
  const history = [...theirs].sort((a, b) => (b.issue_date || '').localeCompare(a.issue_date || ''));
  return { outstanding, history };
}
