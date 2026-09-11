import { R2 } from './format.js';
import { invoiceStatusLabel } from './businessMath.js';

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
  const doc = jsPDF();
  let y = 56;

  doc.setFont('helvetica', 'bold').setFontSize(16);
  doc.text(business.name || 'Invoice', MARGIN, y);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110);
  if (business.tax_number) { y += 14; doc.text('VAT: ' + business.tax_number, MARGIN, y); }

  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20);
  doc.text(invoiceStatusLabel(inv).toUpperCase(), RIGHT, 56, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(80);
  doc.text('Invoice ' + inv.invoice_number, RIGHT, 72, { align: 'right' });

  y = 100;
  doc.setDrawColor(210).line(MARGIN, y, RIGHT, y);
  y += 24;

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(130);
  doc.text('BILL TO', MARGIN, y);
  doc.text('ISSUED', RIGHT - 140, y);
  doc.text('DUE', RIGHT - 60, y);
  y += 14;
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20);
  doc.text(customer?.name || 'No customer', MARGIN, y);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(inv.issue_date || '-', RIGHT - 140, y);
  doc.text(inv.due_date || '-', RIGHT - 60, y);
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
    doc.text(R2(+it.price), RIGHT - 90, y, { align: 'right' });
    doc.text(R2(+it.total), RIGHT, y, { align: 'right' });
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
  totalsRow('Subtotal', R2(+inv.subtotal));
  totalsRow('VAT', R2(+inv.vat));
  totalsRow('Discount', '-' + R2(+inv.discount));
  totalsRow('TOTAL', R2(+inv.total), true);

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
  return new File([blob], `Invoice-${inv.invoice_number}.pdf`, { type: 'application/pdf' });
}
