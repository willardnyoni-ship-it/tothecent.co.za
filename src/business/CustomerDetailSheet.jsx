import { useState } from 'react';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { R2 } from '../lib/format.js';
import { customerLedger, invoiceStatusLabel } from '../lib/businessMath.js';
import { useInvoiceDetail } from './InvoiceDetailSheet.jsx';
import { CURRENCIES, currencyOf, fmt } from '../lib/currency.js';

export function CustomerDetailContent({ customerId }) {
  const { close } = useSheet();
  const { customers, invoices, updateCustomer, myRole } = useBusiness();
  const readOnly = myRole === 'accountant';
  const openInvoice = useInvoiceDetail();
  const customer = customers.find(c => c.id === customerId);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(customer || {});
  const [busy, setBusy] = useState(false);
  if (!customer) return null;

  const { outstanding, history } = customerLedger(customer.id, invoices);

  async function save() {
    setBusy(true);
    try {
      const rate = fields.hourly_rate === '' || fields.hourly_rate == null ? null : Math.max(0, +fields.hourly_rate || 0);
      await updateCustomer(customer.id, { ...fields, hourly_rate: rate, currency: fields.currency || 'ZAR' });
      setEditing(false);
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="row"><h1>{customer.name}</h1><button className="b g sm" onClick={close}>Close</button></div>

      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">Outstanding balance</div><div className="val">{R2(outstanding)}</div></div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row"><h2 style={{ marginTop: 0 }}>Profile</h2>
          {!editing && !readOnly && <button className="b g sm" onClick={() => { setFields(customer); setEditing(true); }}>Edit</button>}
        </div>
        {editing ? (
          <>
            <label>Name</label>
            <input value={fields.name || ''} onChange={e => setFields({ ...fields, name: e.target.value })} />
            <label>Email</label>
            <input type="email" value={fields.email || ''} onChange={e => setFields({ ...fields, email: e.target.value })} />
            <label>Phone</label>
            <input value={fields.phone || ''} onChange={e => setFields({ ...fields, phone: e.target.value })} />
            <label>Address</label>
            <input value={fields.address || ''} onChange={e => setFields({ ...fields, address: e.target.value })} />
            <label>Tax/VAT number</label>
            <input value={fields.tax_number || ''} onChange={e => setFields({ ...fields, tax_number: e.target.value })} />
            <label>Bills in</label>
            <select value={fields.currency || 'ZAR'} onChange={e => setFields({ ...fields, currency: e.target.value })}>
              {CURRENCIES.map(([c, n]) => <option key={c} value={c}>{c} - {n}</option>)}
            </select>
            <label>Hourly rate ({fields.currency || 'ZAR'} per hour) <span className="mini">- used when you log time for them</span></label>
            <input type="number" inputMode="decimal" min="0" placeholder="e.g. 650" value={fields.hourly_rate ?? ''} onChange={e => setFields({ ...fields, hourly_rate: e.target.value })} />
            <div style={{ height: 12 }} />
            <button className="b" disabled={busy} onClick={save}>Save</button>
            <div style={{ height: 8 }} />
            <button className="b g" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <>
            <div className="row"><span className="mini">Email</span><span>{customer.email || '-'}</span></div>
            <div className="row"><span className="mini">Phone</span><span>{customer.phone || '-'}</span></div>
            <div className="row"><span className="mini">Address</span><span>{customer.address || '-'}</span></div>
            <div className="row"><span className="mini">Tax/VAT number</span><span>{customer.tax_number || '-'}</span></div>
            <div className="row"><span className="mini">Bills in</span><span>{customer.currency || 'ZAR'}</span></div>
            <div className="row"><span className="mini">Hourly rate</span><span>{+customer.hourly_rate > 0 ? fmt(+customer.hourly_rate, customer.currency) + ' / h' : '-'}</span></div>
          </>
        )}
      </div>

      <h2>Payment history</h2>
      <div className="card">
        <table><tbody>
          {history.length ? history.map(inv => (
            <tr key={inv.id} onClick={() => openInvoice(inv.id)} style={{ cursor: 'pointer' }}>
              <td>
                <div style={{ fontWeight: 600 }}>{inv.invoice_number}</div>
                <div className="tag">Issued {inv.issue_date}</div>
              </td>
              <td className="r">
                {fmt(inv.total, currencyOf(inv))}
                <div><span className={'status-badge ' + inv.status}>{invoiceStatusLabel(inv)}</span></div>
              </td>
            </tr>
          )) : <tr><td className="mini" colSpan={2}>No invoices for this customer yet.</td></tr>}
        </tbody></table>
      </div>
      <div style={{ height: 20 }} />
    </>
  );
}

export function useCustomerDetail() {
  const { open } = useSheet();
  return (customerId) => open(() => <CustomerDetailContent customerId={customerId} />);
}
