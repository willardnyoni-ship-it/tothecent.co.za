import { useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';

const TYPES = ['Sole Proprietor', 'Private Company', 'Partnership', 'Other'];
const SOURCES = [
  { key: 'bank_transfers', label: 'Bank transfers' },
  { key: 'cash', label: 'Cash' },
  { key: 'card', label: 'Card payments' },
  { key: 'platforms', label: 'Payment platforms' },
  { key: 'other', label: 'Other' },
];

export default function BusinessSignup({ onDone }) {
  const { syncCfg } = useBudget();
  const { createBusiness } = useBusiness();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState('Sole Proprietor');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('South Africa');
  const [currency, setCurrency] = useState('ZAR');
  const [fye, setFye] = useState('February');
  const [sources, setSources] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function toggleSource(k) {
    setSources(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k]);
  }

  async function finish(nextStep) {
    if (step === 1) {
      if (!name.trim()) { setErr('Give your business a name first.'); return; }
      setErr(''); setStep(2); return;
    }
    if (step === 2) { setStep(3); return; }
    if (step === 3) {
      setBusy(true);
      try {
        await createBusiness({
          name: name.trim(), business_type: businessType, industry, country, currency,
          financial_year_end: fye, income_sources: sources,
        });
        onDone(nextStep); // 'statement' | 'manual'
      } catch (e) { setErr(e.message); } finally { setBusy(false); }
    }
  }

  return (
    <div className="light-tab" style={{ maxWidth: 560, margin: '0 auto', padding: '24px 14px' }}>
      <h1>Create Your Business</h1>
      <div className="sub">Signed in as {syncCfg.email}</div>

      {step === 1 && (
        <div className="card" style={{ marginTop: 16 }}>
          <label style={{ marginTop: 0 }}>Business Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Willard Consulting" />
          <label>Business Type</label>
          <select value={businessType} onChange={e => setBusinessType(e.target.value)}>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <label>Industry</label>
          <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Construction, Retail, Consulting" />
          <label>Country</label>
          <input value={country} onChange={e => setCountry(e.target.value)} />
          <label>Currency</label>
          <input value={currency} onChange={e => setCurrency(e.target.value)} />
          <label>Financial Year End</label>
          <select value={fye} onChange={e => setFye(e.target.value)}>
            {['January','February','March','April','May','June','July','August','September','October','November','December'].map(m => <option key={m}>{m}</option>)}
          </select>
          {err && <div className="msg e">{err}</div>}
          <div style={{ height: 14 }} />
          <button className="b" disabled={busy} onClick={() => finish()}>Continue</button>
        </div>
      )}

      {step === 2 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>How does your business receive income?</h2>
          <div className="sub">Select all that apply.</div>
          {SOURCES.map(s => (
            <label key={s.key} className="chk">
              <input type="checkbox" checked={sources.includes(s.key)} onChange={() => toggleSource(s.key)} />
              <span>{s.label}</span>
            </label>
          ))}
          <div style={{ height: 14 }} />
          <button className="b" onClick={() => finish()}>Continue</button>
        </div>
      )}

      {step === 3 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Get your finances set up</h2>
          <div className="sub">You can always do this later - a bank connection is never required.</div>
          {err && <div className="msg e">{err}</div>}
          <div style={{ height: 10 }} />
          <button className="b" disabled={busy} onClick={() => finish('statement')}>Upload Bank Statement</button>
          <div style={{ height: 8 }} />
          <button className="b g" disabled={busy} onClick={() => finish('manual')}>Add Transactions Manually</button>
        </div>
      )}
    </div>
  );
}
