import { useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';
import { PROFILES, FEATURES, featuresFor, profileByKey } from '../lib/businessProfiles.js';

const TYPES = ['Sole Proprietor', 'Private Company', 'Partnership', 'Other'];
const SOURCES = [
  { key: 'bank_transfers', label: 'Bank transfers' },
  { key: 'cash', label: 'Cash' },
  { key: 'card', label: 'Card payments' },
  { key: 'platforms', label: 'Payment platforms' },
  { key: 'other', label: 'Other' },
];
const STEPS = 4;

// Picker shared with Settings -> Features, so changing your business type
// later looks exactly like choosing it the first time.
export function ProfilePicker({ value, onChange }) {
  return (
    <div className="biz-profiles">
      {PROFILES.map(p => (
        <button key={p.key} type="button" className={'biz-profile' + (value === p.key ? ' on' : '')} onClick={() => onChange(p.key)}>
          <span className="ic" aria-hidden="true">{p.icon}</span>
          <span>
            <b>{p.label}</b>
            <span className="mini">{p.examples}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function YesNo({ label, hint, value, onChange }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 600 }}>{label}</div>
      {hint && <div className="mini">{hint}</div>}
      <div className="seg" style={{ marginTop: 6 }}>
        <button type="button" className={value ? 'on' : ''} onClick={() => onChange(true)}>Yes</button>
        <button type="button" className={!value ? 'on' : ''} onClick={() => onChange(false)}>No</button>
      </div>
    </div>
  );
}

export default function BusinessSignup({ onDone }) {
  const { syncCfg } = useBudget();
  const { createBusiness } = useBusiness();
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState('');
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState('Sole Proprietor');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('South Africa');
  const [currency, setCurrency] = useState('ZAR');
  const [fye, setFye] = useState('February');
  const [hasStaff, setHasStaff] = useState(false);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [sources, setSources] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const features = featuresFor(profile, { hasStaff, vatRegistered });

  function toggleSource(k) {
    setSources(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k]);
  }

  async function finish(nextStep) {
    if (step === 1) {
      if (!profile) { setErr('Choose the option closest to your business.'); return; }
      setErr(''); setStep(2); return;
    }
    if (step === 2) {
      if (!name.trim()) { setErr('Give your business a name first.'); return; }
      setErr(''); setStep(3); return;
    }
    if (step === 3) { setStep(4); return; }
    setBusy(true);
    try {
      await createBusiness({
        name: name.trim(), business_type: businessType,
        industry: industry.trim() || profileByKey(profile).label, country, currency,
        financial_year_end: fye, income_sources: sources,
        business_profile: profile, features,
      });
      onDone(nextStep); // 'statement' | 'manual'
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="light-tab" style={{ maxWidth: 560, margin: '0 auto', padding: '24px 14px' }}>
      <h1>Create Your Business</h1>
      <div className="sub">Signed in as {syncCfg.email} &middot; Step {step} of {STEPS}</div>
      {step > 1 && <button className="b g sm" style={{ width: 'auto', marginTop: 10 }} disabled={busy} onClick={() => { setErr(''); setStep(step - 1); }}>&larr; Back</button>}

      {step === 1 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>What kind of business is it?</h2>
          <div className="sub">We'll switch on the tools that fit. You can change this any time in Settings.</div>
          <div style={{ height: 10 }} />
          <ProfilePicker value={profile} onChange={p => { setProfile(p); setErr(''); }} />
          {err && <div className="msg e">{err}</div>}
          <div style={{ height: 14 }} />
          <button className="b" onClick={() => finish()}>Continue</button>
        </div>
      )}

      {step === 2 && (
        <div className="card" style={{ marginTop: 16 }}>
          <label style={{ marginTop: 0 }}>Business Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Willard Consulting" />
          <label>Business Type</label>
          <select value={businessType} onChange={e => setBusinessType(e.target.value)}>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <label>What do you do? <span className="mini">(optional)</span></label>
          <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder={profileByKey(profile)?.examples || 'e.g. Construction, Retail, Consulting'} />
          <YesNo label="Do you pay staff?" hint="Adds payslips with PAYE and UIF worked out." value={hasStaff} onChange={setHasStaff} />
          <YesNo label="Are you registered for VAT?" hint="Required once you earn over R1 million a year." value={vatRegistered} onChange={setVatRegistered} />
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
          <button className="b" onClick={() => finish()}>Continue</button>
        </div>
      )}

      {step === 3 && (
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

      {step === 4 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Your tools</h2>
          <div className="sub">On top of money, invoices, expenses and reports, {name.trim() || 'your business'} gets:</div>
          <ul className="biz-feature-list">
            {features.map(f => <li key={f}><b>{FEATURES[f].label}</b> <span className="mini">{FEATURES[f].desc}</span></li>)}
          </ul>
          <h2>Get your finances set up</h2>
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
