import { useMemo, useState } from 'react';
import { PROFILES, FEATURES, featuresFor } from '../lib/businessProfiles.js';
import { visibleTabs, BIZ_TABS } from '../business/BusinessNav.jsx';

const DEVICES = [['phone', 'Phone', 390, 780], ['tablet', 'Tablet', 768, 780], ['laptop', 'Laptop', 1120, 760]];
const CORE = ['Home', 'Money', 'Invoices', 'Expenses', 'Reports', 'Team'];

// The "Preview a business type" page: the real business app, running on
// example data for the chosen kind of business (see lib/demo.js). Nothing in
// the preview is saved or sent anywhere.
export default function Preview() {
  const [profile, setProfile] = useState('trades');
  const [vat, setVat] = useState(false);
  const [payroll, setPayroll] = useState(false);
  const [device, setDevice] = useState('laptop');
  const [run, setRun] = useState(0); // bumping this restarts the demo from scratch

  const feats = useMemo(() => featuresFor(profile, { hasStaff: payroll, vatRegistered: vat }), [profile, payroll, vat]);
  const tabs = visibleTabs(feats);
  const p = PROFILES.find(x => x.key === profile);
  const [, , width, height] = DEVICES.find(d => d[0] === device);
  const src = `/app/?demo=${profile}&mode=business${vat ? '&vat=1' : ''}${payroll ? '&payroll=1' : ''}`;
  const extraTabs = BIZ_TABS.filter(t => t.feature && tabs.includes(t));

  return (
    <>
      <div className="op-head">
        <div>
          <h1>Preview a business type</h1>
          <p>See exactly what each kind of business gets - the real app, running on example data. Click around freely: nothing is saved and nobody is notified.</p>
        </div>
        <div className="op-actions">
          <button className="op-btn" onClick={() => setRun(r => r + 1)}>Restart demo</button>
          <a className="op-btn primary" href={src} target="_blank" rel="noreferrer">Open full screen</a>
        </div>
      </div>

      <div className="op-card" style={{ marginBottom: 16 }}>
        <div className="op-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="op-chips">
            {PROFILES.map(x => (
              <button key={x.key} className={'op-chip' + (profile === x.key ? ' on' : '')} onClick={() => { setProfile(x.key); setRun(r => r + 1); }}>{x.label}</button>
            ))}
          </div>
        </div>
        <div className="op-card-b op-pv-grid">
          <div>
            <div className="op-sec" style={{ marginTop: 0 }}>{p.label}</div>
            <div className="op-note" style={{ marginTop: 0 }}>Examples: {p.examples}</div>
            <div className="op-sec">Screens they see</div>
            <div className="op-chips">
              {tabs.map(t => <span key={t.t} className={'op-pill ' + (CORE.includes(t.label) ? 'muted' : 'good')}>{t.label}</span>)}
            </div>
            <div className="op-note">Green ones are extra, switched on because of the business type{extraTabs.length ? '' : ' (this type adds none - it uses the core screens)'}.</div>
          </div>
          <div>
            <div className="op-sec" style={{ marginTop: 0 }}>Tools switched on</div>
            <ul className="op-pv-tools">
              {feats.map(f => <li key={f}><b>{FEATURES[f].label}</b><span>{FEATURES[f].desc}</span></li>)}
            </ul>
            <div className="op-pv-opts">
              <label><input type="checkbox" checked={vat} onChange={e => { setVat(e.target.checked); setRun(r => r + 1); }} /> VAT-registered</label>
              <label><input type="checkbox" checked={payroll} onChange={e => { setPayroll(e.target.checked); setRun(r => r + 1); }} /> Has staff (wages &amp; payslips)</label>
            </div>
            <div className="op-note">Every business can also switch tools on or off themselves in Settings → Features.</div>
          </div>
        </div>
      </div>

      <div className="op-pv-bar">
        <div className="op-chips">
          {DEVICES.map(([k, l]) => <button key={k} className={'op-chip' + (device === k ? ' on' : '')} onClick={() => setDevice(k)}>{l}</button>)}
        </div>
        <span className="op-meta">Example data - dates move with today. Restart to reset anything you changed.</span>
      </div>
      <div className="op-pv-stage">
        <div className={'op-pv-frame ' + device} style={{ width, maxWidth: '100%' }}>
          <iframe key={profile + vat + payroll + run} title={'Preview: ' + p.label} src={src} style={{ height }} />
        </div>
      </div>
    </>
  );
}
