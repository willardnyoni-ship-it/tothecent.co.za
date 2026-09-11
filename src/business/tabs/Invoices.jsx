import { useMemo, useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { R, R2 } from '../../lib/format.js';
import { invoiceStatusLabel, findInvoiceMatches } from '../../lib/businessMath.js';
import { useCreateInvoice } from '../CreateInvoiceSheet.jsx';
import { useInvoiceDetail } from '../InvoiceDetailSheet.jsx';

export default function Invoices() {
  const { invoices, customers, transactions, updateInvoice, updateTransaction } = useBusiness();
  const createInvoice = useCreateInvoice();
  const openInvoice = useInvoiceDetail();
  const [filter, setFilter] = useState('all');

  const withCustomer = useMemo(() => invoices.map(i => ({ ...i, customerName: (customers.find(c => c.id === i.customer_id) || {}).name || '' })), [invoices, customers]);

  const total = invoices.reduce((a, i) => a + +i.total, 0);
  const paid = invoices.filter(i => i.status === 'paid').reduce((a, i) => a + +i.total, 0);
  const todayStr = new Date().toISOString().slice(0, 10);
  const outstanding = invoices.filter(i => !['paid', 'cancelled', 'draft'].includes(i.status)).reduce((a, i) => a + (+i.total - +(i.paid_amount || 0)), 0);
  const overdue = invoices.filter(i => !['paid', 'cancelled', 'draft'].includes(i.status) && i.due_date && i.due_date < todayStr).reduce((a, i) => a + (+i.total - +(i.paid_amount || 0)), 0);

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

      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">Total Invoiced</div><div className="val">{R(total)}</div></div>
        <div className="biz-card"><div className="lbl">Paid</div><div className="val">{R(paid)}</div></div>
        <div className="biz-card"><div className="lbl">Outstanding</div><div className="val">{R(outstanding)}</div></div>
        <div className="biz-card"><div className="lbl">Overdue</div><div className="val bd">{R(overdue)}</div></div>
      </div>

      <button className="b" onClick={createInvoice}>+ Create Invoice</button>

      {matches.length > 0 && (
        <>
          <h2>Possible invoice payments</h2>
          {matches.map((m, i) => (
            <div className="infobox" key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>{m.invoice.invoice_number} &middot; {m.invoice.customerName || 'Customer'} &middot; {R2(m.transaction.amount)}</div>
              <button className="b sm" style={{ width: 'auto' }} onClick={() => confirmMatch(m)}>Match Invoice</button>
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
                {R2(inv.total)}
                <div><span className={'status-badge ' + inv.status}>{invoiceStatusLabel(inv)}</span></div>
              </td>
            </tr>
          )) : <tr><td className="mini" colSpan={2}>No invoices yet.</td></tr>}
        </tbody></table>
      </div>
      <div style={{ height: 20 }} />
    </section>
  );
}
