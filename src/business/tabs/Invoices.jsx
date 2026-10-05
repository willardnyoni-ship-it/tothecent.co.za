import { useMemo, useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { R, R2 } from '../../lib/format.js';
import { currencyOf, fmt, isForeign, zar } from '../../lib/currency.js';
import { invoiceStatusLabel, quoteStatusLabel, findInvoiceMatches, customerLedger, RECURRING_FREQUENCY_LABEL } from '../../lib/businessMath.js';
import { useCreateInvoice, useCreateQuote } from '../CreateInvoiceSheet.jsx';
import { useQuoteDetail } from '../QuoteDetailSheet.jsx';
import { useSendReminder } from '../InvoiceDetailSheet.jsx';
import { useInvoiceDetail } from '../InvoiceDetailSheet.jsx';
import { useCustomerDetail } from '../CustomerDetailSheet.jsx';

function GeneratedBanner() {
  const { justGenerated, clearJustGenerated } = useBusiness();
  if (!justGenerated) return null;
  return (
    <div className="infobox" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div>{justGenerated} recurring {justGenerated === 1 ? 'invoice was' : 'invoices were'} generated automatically - review and send {justGenerated === 1 ? 'it' : 'them'}.</div>
      <button className="b g sm" style={{ width: 'auto' }} onClick={clearJustGenerated}>Dismiss</button>
    </div>
  );
}

function CustomersView({ readOnly }) {
  const { customers, invoices, addCustomer } = useBusiness();
  const openCustomer = useCustomerDetail();
  const [adding, setAdding] = useState(false);
  const [fields, setFields] = useState({ name: '', email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const withBalance = useMemo(() => customers.map(c => ({ ...c, outstanding: customerLedger(c.id, invoices).outstanding })), [customers, invoices]);

  async function save() {
    if (!fields.name.trim()) { setErr('Customer name is required.'); return; }
    setBusy(true);
    try { await addCustomer(fields); setFields({ name: '', email: '', phone: '' }); setAdding(false); setErr(''); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      {!readOnly && (adding ? (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>New Customer</h2>
          <label>Name</label>
          <input value={fields.name} onChange={e => setFields({ ...fields, name: e.target.value })} />
          <label>Email</label>
          <input type="email" value={fields.email} onChange={e => setFields({ ...fields, email: e.target.value })} />
          <label>Phone</label>
          <input value={fields.phone} onChange={e => setFields({ ...fields, phone: e.target.value })} />
          {err && <div className="msg e">{err}</div>}
          <div style={{ height: 12 }} />
          <button className="b" disabled={busy} onClick={save}>Save</button>
          <div style={{ height: 8 }} />
          <button className="b g" disabled={busy} onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <button className="b" onClick={() => setAdding(true)}>+ Add Customer</button>
      ))}
      <div className="card" style={{ marginTop: 16 }}>
        <table><tbody>
          {withBalance.length ? withBalance.map(c => (
            <tr key={c.id} onClick={() => openCustomer(c.id)} style={{ cursor: 'pointer' }}>
              <td>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <div className="tag">{c.email || c.phone || 'No contact info'}</div>
              </td>
              <td className="r">
                <div className="mini">Outstanding</div>
                {R2(c.outstanding)}
              </td>
            </tr>
          )) : <tr><td className="mini" colSpan={2}>No customers yet.</td></tr>}
        </tbody></table>
      </div>
      <div style={{ height: 20 }} />
    </>
  );
}

function RecurringView({ readOnly }) {
  const { recurringInvoices, customers, updateRecurringInvoice } = useBusiness();

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <table><tbody>
        {recurringInvoices.length ? recurringInvoices.map(r => {
          const customerName = (customers.find(c => c.id === r.customer_id) || {}).name || 'No customer';
          return (
            <tr key={r.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{customerName}</div>
                <div className="tag">{RECURRING_FREQUENCY_LABEL[r.frequency]} &middot; next {r.next_run_date} &middot; {r.generated_count} generated</div>
              </td>
              <td className="r">
                <span className={'status-badge ' + r.status}>{r.status[0].toUpperCase() + r.status.slice(1)}</span>
                {!readOnly && r.status !== 'cancelled' && (
                  <>
                    <div style={{ height: 6 }} />
                    <button className="b g sm" style={{ width: 'auto' }}
                      onClick={() => updateRecurringInvoice(r.id, { status: r.status === 'active' ? 'paused' : 'active' })}>
                      {r.status === 'active' ? 'Pause' : 'Resume'}
                    </button>
                    <div style={{ height: 6 }} />
                    <button className="b d sm" style={{ width: 'auto' }} onClick={() => updateRecurringInvoice(r.id, { status: 'cancelled' })}>Cancel</button>
                  </>
                )}
              </td>
            </tr>
          );
        }) : <tr><td className="mini" colSpan={2}>No recurring invoices yet. Open an invoice and choose "Make recurring".</td></tr>}
      </tbody></table>
    </div>
  );
}

function QuotesView({ readOnly }) {
  const { quotes, customers } = useBusiness();
  const createQuote = useCreateQuote();
  const openQuote = useQuoteDetail();
  const [filter, setFilter] = useState('open');
  const withCustomer = quotes.map(q => ({ ...q, customerName: (customers.find(c => c.id === q.customer_id) || {}).name || '' }));
  const isOpen = q => ['draft', 'sent'].includes(q.status) && quoteStatusLabel(q) !== 'Expired';
  const shown = withCustomer.filter(q => filter === 'all' ? true
    : filter === 'open' ? isOpen(q)
    : filter === 'won' ? ['accepted', 'invoiced'].includes(q.status)
    : q.status === 'declined' || quoteStatusLabel(q) === 'Expired');
  const openValue = withCustomer.filter(isOpen).reduce((a, q) => a + +q.total, 0);
  const decided = withCustomer.filter(q => ['accepted', 'invoiced', 'declined'].includes(q.status));
  const winRate = decided.length ? Math.round(decided.filter(q => q.status !== 'declined').length / decided.length * 100) : null;

  return (
    <>
      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">Open quotes</div><div className="val">{R(openValue)}</div></div>
        <div className="biz-card"><div className="lbl">Win rate</div><div className="val">{winRate === null ? '-' : winRate + '%'}</div></div>
      </div>
      {!readOnly && <button className="b" onClick={() => createQuote()}>+ Create Quote</button>}
      <div className="seg" style={{ marginTop: 16 }}>
        {[['open', 'Open'], ['won', 'Won'], ['lost', 'Declined/Expired'], ['all', 'All']].map(([k, l]) => (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      <div className="card">
        <table><tbody>
          {shown.length ? shown.map(q => (
            <tr key={q.id} onClick={() => openQuote(q.id)} style={{ cursor: 'pointer' }}>
              <td>
                <div style={{ fontWeight: 600 }}>{q.quote_number} &middot; {q.customerName || 'No customer'}</div>
                <div className="tag">Valid until {q.valid_until || '-'}{+q.deposit_pct > 0 ? ' · ' + +q.deposit_pct + '% deposit' : ''}</div>
              </td>
              <td className="r">
                {fmt(+q.total, currencyOf(q))}
                <div><span className={'status-badge ' + q.status}>{quoteStatusLabel(q)}</span></div>
              </td>
            </tr>
          )) : <tr><td className="mini" colSpan={2}>No quotes here yet.</td></tr>}
        </tbody></table>
      </div>
    </>
  );
}

export default function Invoices() {
  const { invoices, customers, transactions, updateInvoice, updateTransaction, myRole, hasFeature } = useBusiness();
  const sendReminder = useSendReminder();
  const views = ['invoices'].concat(hasFeature('quotes') ? ['quotes'] : [], ['customers', 'recurring']);
  const readOnly = myRole === 'accountant';
  const createInvoice = useCreateInvoice();
  const openInvoice = useInvoiceDetail();
  const [view, setView] = useState('invoices');
  const [filter, setFilter] = useState('all');

  const withCustomer = useMemo(() => invoices.map(i => ({ ...i, customerName: (customers.find(c => c.id === i.customer_id) || {}).name || '' })), [invoices, customers]);

  const total = invoices.reduce((a, i) => a + zar(i, +i.total), 0);
  const paid = invoices.filter(i => i.status === 'paid').reduce((a, i) => a + zar(i, +i.total), 0);
  const hasForeign = invoices.some(isForeign);
  const todayStr = new Date().toISOString().slice(0, 10);
  const outstanding = invoices.filter(i => !['paid', 'cancelled', 'draft'].includes(i.status)).reduce((a, i) => a + zar(i, +i.total - +(i.paid_amount || 0)), 0);
  const overdue = invoices.filter(i => !['paid', 'cancelled', 'draft'].includes(i.status) && i.due_date && i.due_date < todayStr).reduce((a, i) => a + zar(i, +i.total - +(i.paid_amount || 0)), 0);

  const shown = filter === 'all' ? withCustomer : withCustomer.filter(i => filter === 'overdue'
    ? (!['paid', 'cancelled', 'draft'].includes(i.status) && i.due_date && i.due_date < todayStr)
    : i.status === filter);

  const matches = useMemo(() => findInvoiceMatches(withCustomer, transactions), [withCustomer, transactions]);

  async function confirmMatch(m) {
    await updateInvoice(m.invoice.id, { status: 'paid', paid_amount: m.invoice.total });
    await updateTransaction(m.transaction.id, { linked_invoice_id: m.invoice.id });
  }

  return (
    <section className="tab on light-tab">
      <h1>Invoices</h1>
      <GeneratedBanner />

      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">Total Invoiced</div><div className="val">{R(total)}</div></div>
        <div className="biz-card"><div className="lbl">Paid</div><div className="val">{R(paid)}</div></div>
        <div className="biz-card"><div className="lbl">Outstanding</div><div className="val">{R(outstanding)}</div></div>
        <div className="biz-card"><div className="lbl">Overdue</div><div className="val bd">{R(overdue)}</div></div>
      </div>
      {hasForeign && <div className="mini" style={{ marginTop: 6 }}>Foreign-currency invoices are counted in rand at the rate they were made at.</div>}

      <div className="seg" style={{ marginTop: 12 }}>
        {views.map(v => (
          <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
        ))}
      </div>

      {readOnly && <div className="infobox" style={{ marginBottom: 12 }}>You have accountant (view-only) access - review and export here, but editing invoices needs an owner or admin.</div>}

      {view === 'quotes' ? <QuotesView readOnly={readOnly} /> : view === 'customers' ? <CustomersView readOnly={readOnly} /> : view === 'recurring' ? <RecurringView readOnly={readOnly} /> : (
        <>
          {!readOnly && <button className="b" style={{ marginTop: 16 }} onClick={() => createInvoice()}>+ Create Invoice</button>}

          {matches.length > 0 && (
            <>
              <h2>Possible invoice payments</h2>
              {matches.map((m, i) => (
                <div className="infobox" key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>{m.invoice.invoice_number} &middot; {m.invoice.customerName || 'Customer'} &middot; {R2(m.transaction.amount)}</div>
                  {!readOnly && <button className="b sm" style={{ width: 'auto' }} onClick={() => confirmMatch(m)}>Match Invoice</button>}
                </div>
              ))}
            </>
          )}

          <div className="seg" style={{ marginTop: 16 }}>
            {['all', 'draft', 'sent', 'paid', 'overdue'].map(f => (
              <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
            ))}
          </div>
          <div className="card">
            <table><tbody>
              {shown.length ? shown.map(inv => (
                <tr key={inv.id} onClick={() => openInvoice(inv.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{inv.invoice_number} &middot; {inv.customerName || 'No customer'}</div>
                    <div className="tag">Due {inv.due_date || '-'}</div>
                  </td>
                  <td className="r">
                    {fmt(inv.total, currencyOf(inv))}
                    <div><span className={'status-badge ' + inv.status}>{invoiceStatusLabel(inv)}</span></div>
                    {!readOnly && hasFeature('reminders') && invoiceStatusLabel(inv) === 'Overdue' && (
                      <button className="b g sm" style={{ width: 'auto', marginTop: 6 }}
                        onClick={e => { e.stopPropagation(); sendReminder(inv, 'whatsapp'); }}>Remind</button>
                    )}
                  </td>
                </tr>
              )) : <tr><td className="mini" colSpan={2}>No invoices yet.</td></tr>}
            </tbody></table>
          </div>
        </>
      )}
      <div style={{ height: 20 }} />
    </section>
  );
}
