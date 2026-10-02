import { useState } from 'react';
import { useBusiness } from '../store/BusinessStore.jsx';
import { R2, iso } from '../lib/format.js';
import { saTaxYear, taxYearLabel } from '../lib/tax.js';
import { DEFAULT_MILEAGE_RATE } from '../lib/saTax.js';

function dl(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}

// A trip logbook - SARS wants date, where from/to, why, and the distance
// for every business trip before it allows a travel claim. Used on its own
// under Expenses, and filtered to one job inside that job's sheet.
export default function MileageView({ jobId, readOnly }) {
  const { business, mileageTrips, jobs, addRow, removeRow, hasFeature } = useBusiness();
  const rate = +business.mileage_rate || DEFAULT_MILEAGE_RATE;
  const [f, setF] = useState({ date: iso(new Date()), km: '', from_place: '', to_place: '', purpose: '', job_id: jobId || '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  const ty = saTaxYear();
  const trips = jobId ? mileageTrips.filter(t => t.job_id === jobId) : mileageTrips;
  // SA tax year runs 1 March - end Feb; saTaxYear gives e.g. '2026-2027'.
  const tyStart = ty.split('-')[0] + '-03-01';
  const thisYear = mileageTrips.filter(t => t.date >= tyStart);
  const kmYear = thisYear.reduce((a, t) => a + +t.km, 0);

  async function save() {
    if (!(+f.km > 0)) { setMsg({ e: true, t: 'Enter the distance in km.' }); return; }
    if (!f.purpose.trim()) { setMsg({ e: true, t: 'SARS needs the reason for each trip.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await addRow('mileage_trips', { ...f, km: +f.km, job_id: f.job_id || null });
      setF(x => ({ ...x, km: '', to_place: '', purpose: '' }));
      setMsg({ t: 'Trip logged.' });
    } catch (e) { setMsg({ e: true, t: e.message }); } finally { setBusy(false); }
  }

  function exportLog() {
    const rows = [['date', 'from', 'to', 'purpose', 'job', 'km']]
      .concat(thisYear.map(t => [t.date, t.from_place || '', t.to_place || '', t.purpose || '', (jobs.find(j => j.id === t.job_id) || {}).name || '', t.km]));
    dl(new Blob([rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }), 'logbook-' + ty + '.csv');
  }

  return (
    <>
      {!jobId && (
        <div className="biz-cards">
          <div className="biz-card"><div className="lbl">Business km</div><div className="val">{Math.round(kmYear).toLocaleString('en-ZA')}</div></div>
          <div className="biz-card"><div className="lbl">At R{rate.toFixed(2)}/km</div><div className="val">{R2(kmYear * rate)}</div></div>
        </div>
      )}
      {!jobId && <div className="mini" style={{ marginBottom: 10 }}>Tax year {taxYearLabel(ty)}. The per-km rate is the SARS simplified rate - change it in Settings &rarr; Features. Your actual claim depends on your vehicle and how you claim, so check with your accountant.</div>}

      {!readOnly && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Log a trip</h2>
          <label>Date</label>
          <input type="date" value={f.date} onChange={e => set('date', e.target.value)} />
          <label>From</label>
          <input value={f.from_place} onChange={e => set('from_place', e.target.value)} placeholder="e.g. Home / workshop" />
          <label>To</label>
          <input value={f.to_place} onChange={e => set('to_place', e.target.value)} placeholder="e.g. Customer site, Builders Warehouse" />
          <label>Reason</label>
          <input value={f.purpose} onChange={e => set('purpose', e.target.value)} placeholder="e.g. Fetch materials for bathroom job" />
          <label>Distance (km)</label>
          <input type="number" inputMode="decimal" value={f.km} onChange={e => set('km', e.target.value)} />
          {!jobId && hasFeature('jobs') && jobs.length > 0 && (
            <>
              <label>Job <span className="mini">(optional)</span></label>
              <select value={f.job_id} onChange={e => set('job_id', e.target.value)}>
                <option value="">No job</option>
                {jobs.filter(j => j.status !== 'cancelled').map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            </>
          )}
          {msg && <div className={'msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
          <div style={{ height: 10 }} />
          <button className="b" disabled={busy} onClick={save}>Log Trip</button>
        </div>
      )}

      <div className="card">
        <table><tbody>
          {trips.length ? trips.map(t => (
            <tr key={t.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{t.purpose || 'Trip'}</div>
                <div className="tag">{t.date}{t.from_place || t.to_place ? ' · ' + (t.from_place || '?') + ' → ' + (t.to_place || '?') : ''}</div>
              </td>
              <td className="r">
                {(+t.km).toLocaleString('en-ZA')} km
                {!readOnly && <div><a href="#" style={{ color: 'var(--bad)' }} onClick={e => { e.preventDefault(); removeRow('mileage_trips', t.id); }}>Delete</a></div>}
              </td>
            </tr>
          )) : <tr><td className="mini" colSpan={2}>No trips logged yet.</td></tr>}
        </tbody></table>
      </div>
      {!jobId && thisYear.length > 0 && <button className="b g" onClick={exportLog}>Download Logbook (CSV)</button>}
    </>
  );
}
