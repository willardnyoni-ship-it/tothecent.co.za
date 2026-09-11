import { useState } from 'react';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { R2, iso } from '../lib/format.js';
import { invoiceStatusLabel, RECURRING_FREQUENCIES, RECURRING_FREQUENCY_LABEL } from '../lib/businessMath.js';
import { buildInvoicePdfFile } from '../lib/invoicePdf.js';

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function InvoiceDetailContent({ invoiceId }) {
  const { close } = useSheet();
  const { business, invoices, customers, transactions, recurringInvoices, updateInvoice, addTransaction, makeInvoiceRecurring, myRole } = useBusiness();
  const readOnly = myRole === 'accountant';
  const inv = invoices.find(i => i.id === invoiceId);
  const [busy, setBusy] = useState(false);
  const [pickingFrequency, setPickingFrequency] = useState(false);
  if (!inv) return null;
  const customer = customers.find(c => c.id === inv.customer_id);
  const series = inv.recurring_invoice_id ? recurringInvoices.find(r => r.id === inv.recurring_invoice_id) : null;

  const summary = `Invoice ${inv.invoice_number} from ${business.name} for ${R2(inv.total)}, due ${inv.due_date || 'on receipt'}.`;

  function downloadPdf() {
    downloadFile(buildInvoicePdfFile(business, customer, inv));
  }
  // Shares the actual generated PDF, not just a text summary. The Web Share
  // API is the only way a browser can hand a file straight to WhatsApp/Mail
  // (a wa.me link or mailto: URI can prefill text but can never attach a
  // file - that's a platform limitation, not something we can code around).
  // Where file sharing isn't supported (most desktop browsers), the PDF is
  // downloaded automatically and the chat/email is opened with a note to
  // attach the file that just landed in Downloads.
  async function shareViaSystemSheet() {
    const file = buildInvoicePdfFile(business, customer, inv);
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Invoice ' + inv.invoice_number, text: summary });
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return true; // user closed the share sheet - don't also open the fallback
      }
    }
    downloadFile(file);
    return false;
  }
  async function shareWhatsApp() {
    if (await shareViaSystemSheet()) return;
    window.open('https://wa.me/?text=' + encodeURIComponent(summary + ' (PDF just downloaded - attach it to this chat.)'), '_blank');
  }
  async function shareEmail() {
    if (await shareViaSystemSheet()) return;
    window.location.href = 'mailto:' + (customer?.email || '') + '?subject=' + encodeURIComponent('Invoice ' + inv.invoice_number) + '&body=' + encodeURIComponent(summary + '\n\n(PDF just downloaded - please attach it to this email.)');
  }
  function copySummary() {
    navigator.clipboard?.writeText(summary);
  }
  async function markPaid() {
    setBusy(true);
    try {
      await updateInvoice(inv.id, { status: 'paid', paid_amount: inv.total });
      // Marking paid here (as opposed to confirming a suggested match on the
      // Invoices tab, which links an existing transaction) has no bank
      // transaction behind it yet - without recording one, the invoice
      // would show Paid and Outstanding would drop to zero, but the money
      // would never appear in Money, Home's Income card, or Reports. Only
      // record it if this invoice doesn't already have a linked transaction.
      const alreadyLinked = transactions.some(t => t.linked_invoice_id === inv.id);
      if (!alreadyLinked) {
        await addTransaction({
          amount: inv.total, kind: 'income',
          description: inv.invoice_number + (customer ? ' - ' + customer.name : ''),
          date: iso(new Date()), status: 'reviewed', source: 'manual', linked_invoice_id: inv.id,
        });
      }
    } finally { setBusy(false); }
  }
  async function setStatus(status) {
    setBusy(true);
    try { await updateInvoice(inv.id, { status }); } finally { setBusy(false); }
  }
  async function chooseFrequency(frequency) {
    setBusy(true);
    try { await makeInvoiceRecurring(inv, frequency); setPickingFrequency(false); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="row biz-noprint"><h1>Invoice #{inv.invoice_number}</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div id="invoicePrintArea">
        <div className="row">
          <div><b>{business.name}</b><div className="mini">{business.tax_number ? 'VAT: ' + business.tax_number : ''}</div></div>
          <span className={'status-badge ' + inv.status}>{invoiceStatusLabel(inv)}</span>
        </div>
        {series && <div className="tag">Part of a {RECURRING_FREQUENCY_LABEL[series.frequency].toLowerCase()} recurring series &middot; {series.generated_count} generated so far</div>}
        <div style={{ height: 10 }} />
        <div className="row">
          <div><div className="mini">Bill to</div><b>{customer?.name || 'No customer'}</b><div className="mini">{customer?.email}</div></div>
          <div style={{ textAlign: 'right' }}><div className="mini">Issued {inv.issue_date}</div><div className="mini">Due {inv.due_date}</div></div>
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <table><tbody>
            {(inv.items || []).map(it => (
              <tr key={it.id}><td>{it.description}<div className="tag">{it.qty} &times; {R2(it.price)}</div></td><td className="r">{R2(it.total)}</td></tr>
            ))}
          </tbody></table>
          <div className="biz-totals">
            <div className="row"><span>Subtotal</span><span className="mono">{R2(inv.subtotal)}</span></div>
            <div className="row"><span>VAT</span><span className="mono">{R2(inv.vat)}</span></div>
            <div className="row"><span>Discount</span><span className="mono">-{R2(inv.discount)}</span></div>
            <div className="row grand"><span>TOTAL</span><span className="mono">{R2(inv.total)}</span></div>
          </div>
        </div>
        {inv.notes && <div className="card"><div className="mini">Notes</div>{inv.notes}</div>}
        {inv.banking_details && <div className="card"><div className="mini">Banking Details</div><div style={{ whiteSpace: 'pre-wrap' }}>{inv.banking_details}</div></div>}
        {inv.payment_terms && <div className="mini" style={{ marginTop: 8 }}>{inv.payment_terms}</div>}
      </div>

      <div className="biz-noprint">
        <div style={{ height: 14 }} />
        <button className="b" disabled={busy} onClick={downloadPdf}>Download PDF</button>
        <div style={{ height: 8 }} />
        <button className="b g" disabled={busy} onClick={shareWhatsApp}>Share via WhatsApp</button>
        <div style={{ height: 8 }} />
        <button className="b g" disabled={busy} onClick={shareEmail}>Send via Email</button>
        <div style={{ height: 8 }} />
        <button className="b g" disabled={busy} onClick={copySummary}>Copy Summary</button>
        {!readOnly && inv.status !== 'paid' && inv.status !== 'cancelled' && (
          <>
            <div style={{ height: 8 }} />
            <button className="b g" disabled={busy} onClick={markPaid}>Mark as Paid</button>
          </>
        )}
        {!readOnly && inv.status === 'draft' && (
          <>
            <div style={{ height: 8 }} />
            <button className="b g" disabled={busy} onClick={() => setStatus('sent')}>Mark as Sent</button>
          </>
        )}
        {!readOnly && !series && inv.status !== 'cancelled' && (
          <>
            <div style={{ height: 8 }} />
            {pickingFrequency ? (
              <div className="seg">
                {RECURRING_FREQUENCIES.map(f => (
                  <button key={f} disabled={busy} onClick={() => chooseFrequency(f)}>{RECURRING_FREQUENCY_LABEL[f]}</button>
                ))}
              </div>
            ) : (
              <button className="b g" disabled={busy} onClick={() => setPickingFrequency(true)}>Make recurring</button>
            )}
          </>
        )}
        {!readOnly && inv.status !== 'cancelled' && inv.status !== 'paid' && (
          <>
            <div style={{ height: 8 }} />
            <button className="b d" disabled={busy} onClick={() => setStatus('cancelled')}>Cancel Invoice</button>
          </>
        )}
      </div>
    </>
  );
}

export function useInvoiceDetail() {
  const { open } = useSheet();
  return (invoiceId) => open(() => <InvoiceDetailContent invoiceId={invoiceId} />);
}
