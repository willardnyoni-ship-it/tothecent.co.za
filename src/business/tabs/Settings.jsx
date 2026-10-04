import { useState } from 'react';
import SubscriptionPanel from '../../components/SubscriptionPanel.jsx';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { useBudget } from '../../store/BudgetStore.jsx';
import { iso } from '../../lib/format.js';
import { FEATURES, featuresFor, activeFeatures, profileByKey } from '../../lib/businessProfiles.js';
import { DEFAULT_MILEAGE_RATE } from '../../lib/saTax.js';
import { ProfilePicker } from '../BusinessSignup.jsx';
import YocoSettings from '../YocoSettings.jsx';

function FeaturesSettings() {
  const { business, updateBusiness, myRole } = useBusiness();
  const isOwner = myRole === 'owner';
  const [profile, setProfile] = useState(business.business_profile || 'general');
  const [on, setOn] = useState(activeFeatures(business));
  const [rate, setRate] = useState(business.mileage_rate ?? DEFAULT_MILEAGE_RATE);
  const [prefix, setPrefix] = useState(business.quote_prefix || 'QUO-');
  const [msg, setMsg] = useState('');

  // Picking a different business type resets the switches to that type's
  // tools, keeping payroll and VAT as they were (those depend on staff and
  // turnover, not on the kind of business).
  function chooseProfile(p) {
    setProfile(p);
    setOn(featuresFor(p, { hasStaff: on.includes('payroll'), vatRegistered: on.includes('vat') }));
  }
  const toggle = f => setOn(list => list.includes(f) ? list.filter(x => x !== f) : [...list, f]);

  async function save() {
    await updateBusiness({ business_profile: profile, features: on, mileage_rate: +rate || DEFAULT_MILEAGE_RATE, quote_prefix: prefix || 'QUO-' });
    setMsg('Saved - your tabs have been updated.');
    setTimeout(() => setMsg(''), 2500);
  }

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Kind of business</h2>
        <div className="sub" style={{ marginBottom: 10 }}>Currently: {profileByKey(business.business_profile)?.label || 'not chosen yet'}</div>
        {isOwner ? <ProfilePicker value={profile} onChange={chooseProfile} /> : null}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Tools</h2>
        <div className="sub">Switch on anything useful, whatever kind of business you are. Switching a tool off only hides it - nothing is deleted.</div>
        {Object.entries(FEATURES).map(([k, f]) => (
          <label key={k} className="chk" style={{ alignItems: 'flex-start' }}>
            <input type="checkbox" checked={on.includes(k)} disabled={!isOwner} onChange={() => toggle(k)} />
            <span><b>{f.label}</b><br /><span className="mini">{f.desc}</span></span>
          </label>
        ))}
        {on.includes('quotes') && (
          <>
            <label>Quote prefix</label>
            <input value={prefix} disabled={!isOwner} onChange={e => setPrefix(e.target.value)} />
          </>
        )}
        {on.includes('mileage') && (
          <>
            <label>Mileage rate (R per km)</label>
            <input type="number" step="0.01" value={rate} disabled={!isOwner} onChange={e => setRate(e.target.value)} />
            <div className="mini">Defaults to the SARS simplified rate. Update it when SARS publishes a new one.</div>
          </>
        )}
      </div>
      {msg && <div className="msg s">{msg}</div>}
      {isOwner ? <button className="b" onClick={save}>Save Tools</button> : <div className="mini">Only the business owner can change these.</div>}
    </>
  );
}

function dl(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}

function fmtWhen(ts) {
  if (!ts) return 'never';
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `Today, ${time}` : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) + ', ' + time;
}

export default function BizSettings({ onClose }) {
  const biz = useBusiness();
  const { business, updateBusiness, customers, invoices, expenses, transactions, recurringInvoices, myRole } = biz;
  const { trust, markBizBackup } = useBudget();
  const [form, setForm] = useState({ ...business });
  const [seg, setSeg] = useState('features');
  const [msg, setMsg] = useState('');

  function exportBackup() {
    const payload = {
      exportedAt: new Date().toISOString(), business, customers, invoices, expenses, transactions, recurringInvoices,
      quotes: biz.quotes, jobs: biz.jobs, timeEntries: biz.timeEntries, mileageTrips: biz.mileageTrips,
      stockItems: biz.stockItems, stockMovements: biz.stockMovements, cashUps: biz.cashUps, bookings: biz.bookings,
      employees: biz.employees, payRuns: biz.payRuns,
    };
    dl(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'business-backup-' + iso(new Date()) + '.json');
    markBizBackup();
  }

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
        {['features', 'business', 'invoice', 'tax', 'cards', 'data', 'notifications', 'subscription'].map(s => (
          <button key={s} className={seg === s ? 'on' : ''} onClick={() => setSeg(s)}>
            {{ features: 'Features', business: 'Business', invoice: 'Invoice', tax: 'Tax', cards: 'Card payments', data: 'Data', notifications: 'Notifications', subscription: 'Subscription' }[s]}
          </button>
        ))}
      </div>

      {seg === 'features' && <FeaturesSettings />}
      {seg === 'cards' && <YocoSettings />}
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
      {seg === 'data' && (
        <div className="card">
          <div className="mini" style={{ marginBottom: 4 }}>Last backup: {fmtWhen(trust.lastBizBackupAt)}</div>
          <div className="mini" style={{ marginBottom: 10 }}>
            {customers.length} customers &middot; {invoices.length} invoices &middot; {expenses.length} expenses &middot; {transactions.length} transactions &middot; {recurringInvoices.length} recurring invoices
          </div>
          <button className="b g" onClick={exportBackup}>Export full backup (JSON)</button>
          <div className="mini" style={{ marginTop: 10 }}>
            A complete copy of your business records, for your own safekeeping or to hand to your accountant.
            This is a snapshot for backup and record-keeping - restoring it isn't self-service yet, so keep it
            somewhere safe and contact support if you ever need to recover from one.
          </div>
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
      {seg === 'subscription' && <SubscriptionPanel />}
      {msg && <div className="msg s">{msg}</div>}
      {myRole !== 'owner' && !['notifications', 'subscription', 'data', 'features', 'cards'].includes(seg) && (
        <div className="mini" style={{ marginTop: 8 }}>Only the business owner can change these settings.</div>
      )}
      {myRole === 'owner' && !['notifications', 'subscription', 'data', 'features', 'cards'].includes(seg) && (
        <>
          <div style={{ height: 12 }} />
          <button className="b" onClick={save}>Save</button>
        </>
      )}
    </>
  );
}
