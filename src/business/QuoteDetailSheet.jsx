import { useState } from 'react';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { R2, iso } from '../lib/format.js';
import { computeInvoiceTotals, nextInvoiceNumber, quoteStatusLabel } from '../lib/businessMath.js';
import { buildQuotePdfFile } from '../lib/invoicePdf.js';
import { downloadFile, shareFile, openWhatsApp, openEmail } from './share.js';
import { useInvoiceDetail } from './InvoiceDetailSheet.jsx';

const VAT_FACTOR = 1.15;

export function QuoteDetailContent({ quoteId }) {
  const { close } = useSheet();
  const { business, quotes, customers, invoices, jobs, createInvoice, updateRow, addRow, hasFeature, myRole } = useBusiness();
  const openInvoice = useInvoiceDetail();
  const readOnly = myRole === 'accountant';
  const q = quotes.find(x => x.id === quoteId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!q) return null;
  const customer = customers.find(c => c.id === q.customer_id);
  const job = jobs.find(j => j.id === q.job_id);
  const depositInv = invoices.find(i => i.id === q.deposit_invoice_id);
  const finalInv = invoices.find(i => i.id === q.final_invoice_id);
  const depositAmount = +q.deposit_pct > 0 ? +(+q.total * +q.deposit_pct / 100).toFixed(2) : 0;
  const summary = `Quote ${q.quote_number} from ${business.name} for ${R2(+q.total)}, valid until ${q.valid_until || 'further notice'}.`
    + (depositAmount ? ` A ${+q.deposit_pct}% deposit of ${R2(depositAmount)} secures the booking.` : '');

  async function run(fn) {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const setStatus = status => run(() => updateRow('quotes', q.id, { status }));

  async function share(via) {
    const file = buildQuotePdfFile(business, customer, q);
    if (await shareFile(file, 'Quote ' + q.quote_number, summary)) return;
    const note = ' (PDF just downloaded - attach it.)';
    if (via === 'whatsapp') openWhatsApp(customer?.phone, summary + note);
    else openEmail(customer?.email, 'Quote ' + q.quote_number, summary + '\n\n' + note);
  }

  // The deposit invoice carries the VAT for its share, so its line is the
  // deposit before VAT. The final invoice then takes the same amount off,
  // and deposit + final always add up to exactly the quoted total.
  const depositNet = q.vat_enabled ? +(depositAmount / VAT_FACTOR).toFixed(2) : depositAmount;

  const createDeposit = () => run(async () => {
    const items = [{ description: `Deposit (${+q.deposit_pct}%) - Quote ${q.quote_number}`, qty: 1, price: depositNet, total: depositNet }];
    const t = computeInvoiceTotals(items, q.vat_enabled, 0);
    const inv = await createInvoice({
      customer_id: q.customer_id, job_id: q.job_id, quote_id: q.id, invoice_number: nextInvoiceNumber(business),
      issue_date: iso(new Date()), due_date: iso(new Date(Date.now() + 7 * 86400000)), status: 'sent',
      subtotal: t.subtotal, vat: t.vat, discount: 0, total: t.total,
      notes: 'Deposit to confirm quote ' + q.quote_number, payment_terms: q.payment_terms, banking_details: q.banking_details,
    }, items);
    await updateRow('quotes', q.id, { deposit_invoice_id: inv.id, status: 'accepted' });
  });

  const convert = () => run(async () => {
    const items = (q.items || []).map(it => ({ description: it.description, qty: +it.qty || 1, price: +it.price || 0, total: (+it.qty || 1) * (+it.price || 0), stock_item_id: it.stock_item_id || null, recipe_id: it.recipe_id || null }));
    if (depositInv) {
      const less = -(+depositInv.subtotal);
      items.push({ description: 'Less deposit already invoiced (' + depositInv.invoice_number + ')', qty: 1, price: less, total: less });
    }
    const t = computeInvoiceTotals(items, q.vat_enabled, q.discount);
    const inv = await createInvoice({
      customer_id: q.customer_id, job_id: q.job_id, quote_id: q.id, invoice_number: nextInvoiceNumber(business),
      issue_date: iso(new Date()), due_date: iso(new Date(Date.now() + 20 * 86400000)), status: 'draft',
      subtotal: t.subtotal, vat: t.vat, discount: +q.discount || 0, total: t.total,
      notes: q.notes, payment_terms: q.payment_terms, banking_details: q.banking_details,
    }, items);
    await updateRow('quotes', q.id, { final_invoice_id: inv.id, status: 'invoiced' });
    openInvoice(inv.id);
  });

  const startJob = () => run(async () => {
    const first = (q.items || [])[0]?.description || q.quote_number;
    const j = await addRow('jobs', {
      name: (customer ? customer.name + ' - ' : '') + first, customer_id: q.customer_id,
      status: 'active', start_date: iso(new Date()), budget: +q.subtotal || 0,
    });
    await updateRow('quotes', q.id, { job_id: j.id });
  });

  const open_ = ['draft', 'sent'].includes(q.status);

  return (
    <>
      <div className="row"><h1>Quote #{q.quote_number}</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="row">
        <div><b>{customer?.name || 'No customer'}</b><div className="mini">{customer?.email || customer?.phone}</div></div>
        <span className={'status-badge ' + q.status}>{quoteStatusLabel(q)}</span>
      </div>
      <div className="mini" style={{ marginTop: 6 }}>Issued {q.issue_date} &middot; valid until {q.valid_until || '-'}{job ? ' · Job: ' + job.name : ''}</div>

      <div className="card" style={{ marginTop: 12 }}>
        <table><tbody>
          {(q.items || []).map((it, i) => (
            <tr key={i}><td>{it.description}<div className="tag">{it.qty} &times; {R2(+it.price)}</div></td><td className="r">{R2(+it.total)}</td></tr>
          ))}
        </tbody></table>
        <div className="biz-totals">
          <div className="row"><span>Subtotal</span><span className="mono">{R2(+q.subtotal)}</span></div>
          <div className="row"><span>VAT</span><span className="mono">{R2(+q.vat)}</span></div>
          <div className="row"><span>Discount</span><span className="mono">-{R2(+q.discount)}</span></div>
          <div className="row grand"><span>TOTAL</span><span className="mono">{R2(+q.total)}</span></div>
          {depositAmount > 0 && <div className="row"><span>Deposit ({+q.deposit_pct}%)</span><span className="mono">{R2(depositAmount)}</span></div>}
        </div>
      </div>
      {q.notes && <div className="card"><div className="mini">Notes</div>{q.notes}</div>}

      {(depositInv || finalInv) && (
        <div className="card">
          {depositInv && <div className="row" style={{ cursor: 'pointer' }} onClick={() => openInvoice(depositInv.id)}><span>Deposit invoice {depositInv.invoice_number}</span><span className={'status-badge ' + depositInv.status}>{depositInv.status === 'paid' ? 'Paid' : 'Open'}</span></div>}
          {finalInv && <div className="row" style={{ cursor: 'pointer', marginTop: 6 }} onClick={() => openInvoice(finalInv.id)}><span>Invoice {finalInv.invoice_number}</span><span className={'status-badge ' + finalInv.status}>{finalInv.status === 'paid' ? 'Paid' : 'Open'}</span></div>}
        </div>
      )}

      {err && <div className="msg e">{err}</div>}
      <div style={{ height: 6 }} />
      <button className="b" disabled={busy} onClick={() => downloadFile(buildQuotePdfFile(business, customer, q))}>Download PDF</button>
      <div style={{ height: 8 }} />
      <button className="b g" disabled={busy} onClick={() => share('whatsapp')}>Share via WhatsApp</button>
      <div style={{ height: 8 }} />
      <button className="b g" disabled={busy} onClick={() => share('email')}>Send via Email</button>

      {!readOnly && (
        <>
          {q.status === 'draft' && <><div style={{ height: 8 }} /><button className="b g" disabled={busy} onClick={() => setStatus('sent')}>Mark as Sent</button></>}
          {open_ && <><div style={{ height: 8 }} /><button className="b" disabled={busy} onClick={() => setStatus('accepted')}>Customer Accepted</button></>}
          {['draft', 'sent', 'accepted'].includes(q.status) && depositAmount > 0 && !depositInv && (
            <><div style={{ height: 8 }} /><button className="b g" disabled={busy} onClick={createDeposit}>Create Deposit Invoice ({R2(depositAmount)})</button></>
          )}
          {['sent', 'accepted'].includes(q.status) && !finalInv && (
            <><div style={{ height: 8 }} /><button className="b g" disabled={busy} onClick={convert}>{depositInv ? 'Create Final Invoice (less deposit)' : 'Convert to Invoice'}</button></>
          )}
          {hasFeature('jobs') && !job && q.status !== 'declined' && (
            <><div style={{ height: 8 }} /><button className="b g" disabled={busy} onClick={startJob}>Start a Job from this Quote</button></>
          )}
          {open_ && <><div style={{ height: 8 }} /><button className="b d" disabled={busy} onClick={() => setStatus('declined')}>Customer Declined</button></>}
        </>
      )}
      <div style={{ height: 20 }} />
    </>
  );
}

export function useQuoteDetail() {
  const { open } = useSheet();
  return (quoteId) => open(() => <QuoteDetailContent quoteId={quoteId} />);
}
