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

export function nextInvoiceNumber(business) {
  return (business.invoice_prefix || 'INV-') + String(business.next_invoice_number || 1).padStart(4, '0');
}
