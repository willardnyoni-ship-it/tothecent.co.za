import { fmtDoc } from './currency.js';
import { invoiceStatusLabel, quoteStatusLabel } from './businessMath.js';

// jsPDF loads as a plain global script from the CDN (see app/index.html's
// <head>), same pattern as pdf.js in parsePdf.js - it's a one-off render
// job, not worth an npm dependency + bundler config for.
function jsPDF() {
  return new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
}

const MARGIN = 40;
const PAGE_WIDTH = 595;
const RIGHT = PAGE_WIDTH - MARGIN;

// Builds the invoice PDF synchronously (no awaits) so callers can invoke it
// directly inside a click handler and still pass the resulting File to
// navigator.share() - Safari in particular revokes the "user activation"
// a share prompt needs if anything async runs first.
export function buildInvoicePdfFile(business, customer, inv) {
  return buildPdf(business, customer, inv, {
    title: 'Invoice', number: inv.invoice_number, status: invoiceStatusLabel(inv),
    dateLabel: 'DUE', date: inv.due_date,
  });
}

// Same layout as an invoice; a quote shows its expiry date instead of a due
// date, and a deposit line under the total when one is asked for.
export function buildQuotePdfFile(business, customer, q) {
  return buildPdf(business, customer, q, {
    title: 'Quote', number: q.quote_number, status: quoteStatusLabel(q),
    dateLabel: 'VALID UNTIL', date: q.valid_until,
    deposit: +q.deposit_pct > 0 ? { pct: +q.deposit_pct, amount: +q.total * +q.deposit_pct / 100 } : null,
  });
}

function buildPdf(business, customer, inv, kind) {
  const doc = jsPDF();
  const M = n => fmtDoc(inv, n);
  let y = 56;

  doc.setFont('helvetica', 'bold').setFontSize(16);
  doc.text(business.name || kind.title, MARGIN, y);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110);
  if (business.tax_number) { y += 14; doc.text('VAT: ' + business.tax_number, MARGIN, y); }

  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20);
  doc.text(kind.status.toUpperCase(), RIGHT, 56, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(80);
  doc.text(kind.title + ' ' + kind.number, RIGHT, 72, { align: 'right' });

  y = 100;
  doc.setDrawColor(210).line(MARGIN, y, RIGHT, y);
  y += 24;

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(130);
  doc.text(kind.title === 'Quote' ? 'PREPARED FOR' : 'BILL TO', MARGIN, y);
  doc.text('ISSUED', RIGHT - 160, y);
  doc.text(kind.dateLabel, RIGHT - 70, y);
  y += 14;
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20);
  doc.text(customer?.name || 'No customer', MARGIN, y);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(inv.issue_date || '-', RIGHT - 160, y);
  doc.text(kind.date || '-', RIGHT - 70, y);
  if (customer?.email) { y += 14; doc.setFontSize(9).setTextColor(110); doc.text(customer.email, MARGIN, y); }

  y += 30;
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(130);
  doc.text('DESCRIPTION', MARGIN, y);
  doc.text('QTY', RIGHT - 170, y, { align: 'right' });
  doc.text('PRICE', RIGHT - 90, y, { align: 'right' });
  doc.text('TOTAL', RIGHT, y, { align: 'right' });
  y += 8;
  doc.setDrawColor(210).line(MARGIN, y, RIGHT, y);
  y += 16;

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(30);
  (inv.items || []).forEach(it => {
    if (y > 740) { doc.addPage(); y = 56; }
    doc.text(it.description || '', MARGIN, y);
    doc.text(String(it.qty), RIGHT - 170, y, { align: 'right' });
    doc.text(M(+it.price), RIGHT - 90, y, { align: 'right' });
    doc.text(M(+it.total), RIGHT, y, { align: 'right' });
    y += 18;
  });

  y += 10;
  doc.setDrawColor(210).line(RIGHT - 200, y, RIGHT, y);
  y += 18;
  const totalsRow = (label, value, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 12 : 10).setTextColor(bold ? 20 : 80);
    doc.text(label, RIGHT - 200, y);
    doc.text(value, RIGHT, y, { align: 'right' });
    y += bold ? 20 : 16;
  };
  totalsRow('Subtotal', M(+inv.subtotal));
  totalsRow('VAT', M(+inv.vat));
  totalsRow('Discount', '-' + M(+inv.discount));
  totalsRow('TOTAL', M(+inv.total), true);
  if (kind.deposit) totalsRow('Deposit due (' + kind.deposit.pct + '%)', M(kind.deposit.amount));

  if (inv.notes) {
    y += 14; doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(130); doc.text('NOTES', MARGIN, y);
    y += 14; doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(30);
    doc.text(doc.splitTextToSize(inv.notes, RIGHT - MARGIN), MARGIN, y);
    y += 14 * doc.splitTextToSize(inv.notes, RIGHT - MARGIN).length;
  }
  if (inv.banking_details) {
    y += 10; doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(130); doc.text('BANKING DETAILS', MARGIN, y);
    y += 14; doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(30);
    doc.text(doc.splitTextToSize(inv.banking_details, RIGHT - MARGIN), MARGIN, y);
    y += 14 * doc.splitTextToSize(inv.banking_details, RIGHT - MARGIN).length;
  }
  if (inv.payment_terms) {
    y += 10; doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(110);
    doc.text(inv.payment_terms, MARGIN, y);
  }

  const blob = doc.output('blob');
  return new File([blob], `${kind.title}-${kind.number}.pdf`, { type: 'application/pdf' });
}
