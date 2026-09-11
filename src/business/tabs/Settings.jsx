import { useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';

export default function BizSettings({ onClose }) {
  const { business, updateBusiness } = useBusiness();
  const [form, setForm] = useState({ ...business });
  const [seg, setSeg] = useState('business');
  const [msg, setMsg] = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  async function save() {
    await updateBusiness({
      name: form.name, tax_number: form.tax_number, country: form.country,
      invoice_prefix: form.invoice_prefix, next_invoice_number: +form.next_invoice_number || 1,
      default_payment_terms: form.default_payment_terms, banking_details: form.banking_details,
      invoice_footer: form.invoice_footer,
    });
    setMsg('Saved.');
    setTimeout(() => setMsg(''), 2000);
  }

  return (
    <>
      <div className="row"><h1>Settings</h1><button className="b g sm" onClick={onClose}>Close</button></div>
      <div className="seg">
        {['business', 'invoice', 'tax', 'notifications', 'subscription'].map(s => (
          <button key={s} className={seg === s ? 'on' : ''} onClick={() => setSeg(s)}>
            {{ business: 'Business', invoice: 'Invoice', tax: 'Tax', notifications: 'Notifications', subscription: 'Subscription' }[s]}
          </button>
        ))}
      </div>

      {seg === 'business' && (
        <div className="card">
          <label style={{ marginTop: 0 }}>Business Name</label>
          <input value={form.name || ''} onChange={e => set('name', e.target.value)} />
          <label>Country</label>
          <input value={form.country || ''} onChange={e => set('country', e.target.value)} />
          <label>Tax/VAT Information</label>
          <input value={form.tax_number || ''} onChange={e => set('tax_number', e.target.value)} />
        </div>
      )}
      {seg === 'invoice' && (
        <div className="card">
          <label style={{ marginTop: 0 }}>Invoice Prefix</label>
          <input value={form.invoice_prefix || ''} onChange={e => set('invoice_prefix', e.target.value)} />
          <label>Next Invoice Number</label>
          <input type="number" value={form.next_invoice_number || 1} onChange={e => set('next_invoice_number', e.target.value)} />
          <label>Default Payment Terms</label>
          <input value={form.default_payment_terms || ''} onChange={e => set('default_payment_terms', e.target.value)} />
          <label>Bank Details</label>
          <textarea rows="3" value={form.banking_details || ''} onChange={e => set('banking_details', e.target.value)} />
          <label>Invoice Footer</label>
          <input value={form.invoice_footer || ''} onChange={e => set('invoice_footer', e.target.value)} />
        </div>
      )}
      {seg === 'tax' && (
        <div className="card">
          <label style={{ marginTop: 0 }}>Tax/VAT Number</label>
          <input value={form.tax_number || ''} onChange={e => set('tax_number', e.target.value)} />
          <div className="mini">Invoices add 15% VAT when you tick the option while creating one. Not tax advice.</div>
        </div>
      )}
      {seg === 'notifications' && (
        <div className="card">
          <div className="mini" style={{ marginBottom: 10 }}>These preferences are saved, but nothing is sent yet - notification delivery (email/push) isn't wired up.</div>
          {['Invoice overdue', 'Invoice paid', 'Expense awaiting approval', 'Statement processing complete'].map(n => (
            <label className="chk" key={n}><input type="checkbox" defaultChecked /><span>{n}</span></label>
          ))}
        </div>
      )}
      {seg === 'subscription' && (
        <div className="card">
          <div style={{ fontWeight: 700 }}>Business plan</div>
          <div className="mini" style={{ marginTop: 6 }}>No billing is set up yet - the business plan is free while this is in development.</div>
        </div>
      )}
      {msg && <div className="msg s">{msg}</div>}
      {seg !== 'notifications' && seg !== 'subscription' && (
        <>
          <div style={{ height: 12 }} />
          <button className="b" onClick={save}>Save</button>
        </>
      )}
    </>
  );
}
