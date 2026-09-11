import { useState } from 'react';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { R2 } from '../lib/format.js';
import { invoiceStatusLabel } from '../lib/businessMath.js';

export function InvoiceDetailContent({ invoiceId }) {
  const { close } = useSheet();
  const { business, invoices, customers, updateInvoice } = useBusiness();
  const inv = invoices.find(i => i.id === invoiceId);
  const [busy, setBusy] = useState(false);
  if (!inv) return null;
  const customer = customers.find(c => c.id === inv.customer_id);

  const summary = `Invoice ${inv.invoice_number} from ${business.name} for ${R2(inv.total)}, due ${inv.due_date || 'on receipt'}.`;

  function downloadPdf() {
    // No PDF-generation library - "Download PDF" uses the browser's own
    // print-to-PDF. @media print in business.css hides everything except
    // #invoicePrintArea.
    window.print();
  }
  function shareWhatsApp() {
    window.open('https://wa.me/?text=' + encodeURIComponent(summary + ' (PDF attached separately - tap Download PDF first, then attach it here.)'), '_blank');
  }
  function shareEmail() {
    window.location.href = 'mailto:' + (customer?.email || '') + '?subject=' + encodeURIComponent('Invoice ' + inv.invoice_number) + '&body=' + encodeURIComponent(summary);
  }
  function copySummary() {
    navigator.clipboard?.writeText(summary);
  }
  async function markPaid() {
    setBusy(true);
    try { await updateInvoice(inv.id, { status: 'paid', paid_amount: inv.total }); } finally { setBusy(false); }
  }
  async function setStatus(status) {
    setBusy(true);
    try { await updateInvoice(inv.id, { status }); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="row biz-noprint"><h1>Invoice #{inv.invoice_number}</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div id="invoicePrintArea">
        <div className="row">
          <div><b>{business.name}</b><div className="mini">{business.tax_number ? 'VAT: ' + business.tax_number : ''}</div></div>
          <span className={'status-badge ' + inv.status}>{invoiceStatusLabel(inv)}</span>
        </div>
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
        {inv.status !== 'paid' && inv.status !== 'cancelled' && (
          <>
            <div style={{ height: 8 }} />
            <button className="b g" disabled={busy} onClick={markPaid}>Mark as Paid</button>
          </>
        )}
        {inv.status === 'draft' && (
          <>
            <div style={{ height: 8 }} />
            <button className="b g" disabled={busy} onClick={() => setStatus('sent')}>Mark as Sent</button>
          </>
        )}
        {inv.status !== 'cancelled' && inv.status !== 'paid' && (
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
