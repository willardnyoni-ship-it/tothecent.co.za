import { useState } from 'react';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { R2, iso } from '../lib/format.js';
import { invoiceStatusLabel, RECURRING_FREQUENCIES, RECURRING_FREQUENCY_LABEL } from '../lib/businessMath.js';
import { buildInvoicePdfFile } from '../lib/invoicePdf.js';
import { openWhatsApp, openEmail } from './share.js';
import { currencyOf, fmt, isForeign, rateOf, rateText, zar } from '../lib/currency.js';

// A friendly nudge about an unpaid invoice, as plain text in WhatsApp or
// email (the invoice itself was already sent). Records when it went out so
// the invoice shows "Last reminded ..." and nobody double-nags a customer.
export function reminderText(business, customer, inv) {
  const owed = +inv.total - +(inv.paid_amount || 0);
  const today = new Date().toISOString().slice(0, 10);
  const late = inv.due_date && inv.due_date < today;
  return `Hi${customer?.name ? ' ' + customer.name.split(' ')[0] : ''}, a friendly reminder that invoice ${inv.invoice_number} from ${business.name} for ${fmt(owed, currencyOf(inv))} `
    + (late ? `was due on ${inv.due_date}` : `is due ${inv.due_date ? 'on ' + inv.due_date : 'now'}`)
    + `. ${inv.banking_details ? 'Banking details: ' + inv.banking_details.replace(/\s*\n\s*/g, ', ') + '. ' : ''}`
    + `If you've already paid, thank you - please ignore this message.`;
}

export function useSendReminder() {
  const { business, customers, updateInvoice } = useBusiness();
  return async (inv, via) => {
    const customer = customers.find(c => c.id === inv.customer_id);
    const text = reminderText(business, customer, inv);
    if (via === 'email') openEmail(customer?.email, 'Reminder: invoice ' + inv.invoice_number, text);
    else openWhatsApp(customer?.phone, text);
    await updateInvoice(inv.id, { last_reminded_at: new Date().toISOString() });
  };
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function InvoiceDetailContent({ invoiceId }) {
  const { close } = useSheet();
  const { business, invoices, customers, transactions, recurringInvoices, jobs, updateInvoice, addTransaction, makeInvoiceRecurring, myRole, hasFeature } = useBusiness();
  const sendReminder = useSendReminder();
  const readOnly = myRole === 'accountant';
  const inv = invoices.find(i => i.id === invoiceId);
  const [busy, setBusy] = useState(false);
  const [pickingFrequency, setPickingFrequency] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [randIn, setRandIn] = useState('');
  if (!inv) return null;
  const customer = customers.find(c => c.id === inv.customer_id);
  const series = inv.recurring_invoice_id ? recurringInvoices.find(r => r.id === inv.recurring_invoice_id) : null;
  const job = inv.job_id ? jobs.find(j => j.id === inv.job_id) : null;
  const canRemind = !readOnly && hasFeature('reminders') && ['sent', 'viewed', 'partially_paid', 'overdue'].includes(inv.status);

  const m = n => fmt(n, currencyOf(inv));
  const foreign = isForeign(inv);
  const summary = `Invoice ${inv.invoice_number} from ${business.name} for ${m(inv.total)}, due ${inv.due_date || 'on receipt'}.`;

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
    if (foreign && !(+randIn > 0)) return;
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
          amount: foreign ? +randIn : inv.total, kind: 'income',
          description: inv.invoice_number + (customer ? ' - ' + customer.name : '') + (foreign ? ` (${m(inv.total)})` : ''),
          date: iso(new Date()), status: 'reviewed', source: 'manual', linked_invoice_id: inv.id,
        });
      }
      setReceiving(false);
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
        {job && <div className="tag">Job: {job.name}</div>}
        {series && <div className="tag">Part of a {RECURRING_FREQUENCY_LABEL[series.frequency].toLowerCase()} recurring series &middot; {series.generated_count} generated so far</div>}
        <div style={{ height: 10 }} />
        <div className="row">
          <div><div className="mini">Bill to</div><b>{customer?.name || 'No customer'}</b><div className="mini">{customer?.email}</div></div>
          <div style={{ textAlign: 'right' }}><div className="mini">Issued {inv.issue_date}</div><div className="mini">Due {inv.due_date}</div></div>
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <table><tbody>
            {(inv.items || []).map(it => (
              <tr key={it.id}><td>{it.description}<div className="tag">{it.qty} &times; {m(it.price)}</div></td><td className="r">{m(it.total)}</td></tr>
            ))}
          </tbody></table>
          <div className="biz-totals">
            <div className="row"><span>Subtotal</span><span className="mono">{m(inv.subtotal)}</span></div>
            <div className="row"><span>VAT</span><span className="mono">{m(inv.vat)}</span></div>
            <div className="row"><span>Discount</span><span className="mono">-{m(inv.discount)}</span></div>
            <div className="row grand"><span>TOTAL</span><span className="mono">{m(inv.total)}</span></div>
            {foreign && <div className="row biz-noprint"><span className="mini">Rand value at {rateText(currencyOf(inv), rateOf(inv))}</span><span className="mono">{fmt(zar(inv, inv.total))}</span></div>}
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
        {canRemind && (
          <>
            <h2>Payment reminder</h2>
            <div className="mini" style={{ marginBottom: 8 }}>
              {inv.last_reminded_at ? 'Last reminded ' + new Date(inv.last_reminded_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) + '.' : 'No reminder sent yet.'}
              {!customer?.phone && ' Add a phone number to this customer so WhatsApp opens their chat directly.'}
            </div>
            <button className="b g" disabled={busy} onClick={() => sendReminder(inv, 'whatsapp')}>Remind via WhatsApp</button>
            <div style={{ height: 8 }} />
            <button className="b g" disabled={busy} onClick={() => sendReminder(inv, 'email')}>Remind via Email</button>
          </>
        )}
        {!readOnly && inv.status !== 'paid' && inv.status !== 'cancelled' && (
          <>
            <div style={{ height: 8 }} />
            {foreign && receiving ? (
              <div className="card">
                <b>How much rand did you receive?</b>
                <div className="mini" style={{ margin: '4px 0 8px' }}>The customer paid {m(inv.total)}. Enter the rand that reached your bank, after any bank fees, so your books show the real amount.</div>
                <input type="number" inputMode="decimal" min="0" value={randIn} onChange={e => setRandIn(e.target.value)} placeholder={String(zar(inv, inv.total))} />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="b" disabled={busy || !(+randIn > 0)} onClick={markPaid}>Record payment</button>
                  <button className="b g" disabled={busy} onClick={() => setReceiving(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="b g" disabled={busy} onClick={() => { if (foreign) { setRandIn(String(zar(inv, +inv.total - +(inv.paid_amount || 0)))); setReceiving(true); } else markPaid(); }}>Mark as Paid</button>
            )}
          </>
        )}
        {!readOnly && inv.status === 'draft' && (
          <>
            <div style={{ height: 8 }} />
            <button className="b g" disabled={busy} onClick={() => setStatus('sent')}>Mark as Sent</button>
          </>
        )}
        {!readOnly && !series && !foreign && inv.status !== 'cancelled' && (
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
