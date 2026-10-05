import { useEffect, useMemo, useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { R, R2, iso } from '../../lib/format.js';
import { useCreateInvoice } from '../CreateInvoiceSheet.jsx';
import { fmt } from '../../lib/currency.js';

// The running timer lives in this browser only (it's a stopwatch, not a
// record) - nothing is saved to the business until it's stopped and the
// hours are logged.
function timerKey(bizId) { return 'wnTimer_' + bizId; }
function readTimer(bizId) {
  try { return JSON.parse(localStorage.getItem(timerKey(bizId)) || 'null'); } catch { return null; }
}
function writeTimer(bizId, t) {
  try { t ? localStorage.setItem(timerKey(bizId), JSON.stringify(t)) : localStorage.removeItem(timerKey(bizId)); } catch { /* private mode */ }
}
function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':');
}
// Bill in quarter hours, never less than one quarter.
const toQuarterHours = ms => Math.max(0.25, Math.round(ms / 900000) / 4);

function startOfWeek(d = new Date()) {
  const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return iso(x);
}

export default function Time() {
  const { business, timeEntries, customers, jobs, addRow, removeRow, updateRow, updateRows, updateCustomer, hasFeature, myRole } = useBusiness();
  const readOnly = myRole === 'accountant';
  const createInvoice = useCreateInvoice();
  const [timer, setTimer] = useState(() => readTimer(business.id));
  const [now, setNow] = useState(Date.now());
  const lastRate = timeEntries[0]?.rate;
  const [f, setF] = useState({ date: iso(new Date()), hours: '', rate: lastRate || '', customer_id: '', job_id: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const showJobs = hasFeature('jobs') && jobs.length > 0;
  const [editId, setEditId] = useState('');
  const [ef, setEf] = useState(null);
  const curOf = id => (customers.find(x => x.id === id) || {}).currency || 'ZAR';
  const rateFor = id => { const c = customers.find(x => x.id === id); return c && +c.hourly_rate > 0 ? +c.hourly_rate : 0; };
  // Choosing a customer fills in their saved rate (the last rate used stays if they have none).
  const pickCustomer = id => setF(x => ({ ...x, customer_id: id, rate: rateFor(id) || x.rate }));
  const chosen = customers.find(c => c.id === f.customer_id);
  const canSaveRate = !readOnly && chosen && +f.rate > 0 && +f.rate !== rateFor(chosen.id);
  async function saveRate() {
    try { await updateCustomer(chosen.id, { hourly_rate: +f.rate }); setMsg({ t: `Saved ${fmt(+f.rate, curOf(chosen.id))} an hour for ${chosen.name}.` }); } catch (e) { setMsg({ e: true, t: e.message }); }
  }
  async function saveEdit() {
    if (!(+ef.hours > 0)) { setMsg({ e: true, t: 'Enter how many hours.' }); return; }
    try {
      await updateRow('time_entries', editId, { date: ef.date, hours: +ef.hours, rate: +ef.rate || 0, customer_id: ef.customer_id || null, description: ef.description });
      setEditId(''); setMsg({ t: 'Time entry updated.' });
    } catch (e) { setMsg({ e: true, t: e.message }); }
  }

  useEffect(() => {
    if (!timer) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timer]);

  function start() {
    const t = { start: Date.now(), description: f.description, customer_id: f.customer_id, job_id: f.job_id };
    writeTimer(business.id, t); setTimer(t); setNow(Date.now());
  }
  function stop() {
    const hours = toQuarterHours(Date.now() - timer.start);
    setF(x => { const cid = x.customer_id || timer.customer_id || ''; return { ...x, hours: String(hours), description: x.description || timer.description, customer_id: cid, rate: rateFor(cid) || x.rate, job_id: x.job_id || timer.job_id || '', date: iso(new Date(timer.start)) }; });
    writeTimer(business.id, null); setTimer(null);
    setMsg({ t: `Timer stopped at ${hours} h - check the details and press Log Time.` });
  }

  async function save() {
    if (!(+f.hours > 0)) { setMsg({ e: true, t: 'Enter how many hours.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await addRow('time_entries', { ...f, hours: +f.hours, rate: +f.rate || 0, customer_id: f.customer_id || null, job_id: f.job_id || null });
      setF(x => ({ ...x, hours: '', description: '' }));
      setMsg({ t: 'Time logged.' });
    } catch (e) { setMsg({ e: true, t: e.message }); } finally { setBusy(false); }
  }

  const weekStart = startOfWeek();
  const monthKey = iso(new Date()).slice(0, 7);
  const hoursWeek = timeEntries.filter(t => t.date >= weekStart).reduce((a, t) => a + +t.hours, 0);
  const hoursMonth = timeEntries.filter(t => t.date.slice(0, 7) === monthKey).reduce((a, t) => a + +t.hours, 0);
  const unbilled = timeEntries.filter(t => !t.invoice_id && +t.rate > 0);
  const unbilledValue = unbilled.filter(t => curOf(t.customer_id) === 'ZAR').reduce((a, t) => a + +t.hours * +t.rate, 0);
  const unbilledForeign = {};
  unbilled.filter(t => curOf(t.customer_id) !== 'ZAR').forEach(t => { const c = curOf(t.customer_id); unbilledForeign[c] = (unbilledForeign[c] || 0) + +t.hours * +t.rate; });

  const byCustomer = useMemo(() => {
    const m = {};
    unbilled.forEach(t => { const k = t.customer_id || ''; (m[k] = m[k] || []).push(t); });
    return Object.entries(m).map(([cid, entries]) => ({
      customer: customers.find(c => c.id === cid), cid, entries,
      hours: entries.reduce((a, t) => a + +t.hours, 0),
      value: entries.reduce((a, t) => a + +t.hours * +t.rate, 0), currency: curOf(cid),
    }));
  }, [unbilled, customers]);

  function invoiceTime(group) {
    const sorted = [...group.entries].sort((a, b) => a.date.localeCompare(b.date));
    const jobIds = [...new Set(sorted.map(t => t.job_id).filter(Boolean))];
    createInvoice({
      prefill: {
        customerId: group.cid || '',
        currency: group.currency,
        jobId: jobIds.length === 1 ? jobIds[0] : '',
        items: sorted.map(t => ({ description: t.date + ' - ' + (t.description || 'Work'), qty: +t.hours, price: +t.rate })),
      },
      // Only mark hours as billed once the invoice actually exists.
      onCreated: inv => updateRows('time_entries', sorted.map(t => t.id), { invoice_id: inv.id }),
    });
  }

  const nameOf = id => (customers.find(c => c.id === id) || {}).name;
  const jobOf = id => (jobs.find(j => j.id === id) || {}).name;

  return (
    <section className="tab on light-tab">
      <h1>Time</h1>
      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">This week</div><div className="val">{hoursWeek} h</div></div>
        <div className="biz-card"><div className="lbl">This month</div><div className="val">{hoursMonth} h</div></div>
        <div className="biz-card"><div className="lbl">Not yet invoiced</div><div className="val">{R(unbilledValue)}</div></div>
      </div>
      {Object.keys(unbilledForeign).length > 0 && <div className="mini" style={{ marginBottom: 8 }}>Also not yet invoiced: {Object.entries(unbilledForeign).map(([c, v]) => fmt(v, c)).join(', ')}</div>}

      {!readOnly && (
        <div className="card">
          {timer ? (
            <div className="row">
              <div><div className="mini">Timer running{timer.description ? ' · ' + timer.description : ''}</div><div className="mono" style={{ fontSize: 30, fontWeight: 600 }}>{fmtElapsed(now - timer.start)}</div></div>
              <button className="b d" style={{ width: 'auto' }} onClick={stop}>Stop</button>
            </div>
          ) : (
            <div className="row">
              <div className="mini">Start a timer now, or type in hours below.</div>
              <button className="b" style={{ width: 'auto' }} onClick={start}>&#9654; Start Timer</button>
            </div>
          )}
          <label>What are you working on?</label>
          <input value={f.description} onChange={e => set('description', e.target.value)} placeholder="e.g. Logo concepts, round 2" />
          <label>Customer</label>
          <select value={f.customer_id} onChange={e => pickCustomer(e.target.value)}>
            <option value="">No customer</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {showJobs && (
            <>
              <label>Job</label>
              <select value={f.job_id} onChange={e => set('job_id', e.target.value)}>
                <option value="">No job</option>
                {jobs.filter(j => j.status !== 'cancelled').map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            </>
          )}
          <div className="biz-grid" style={{ marginTop: 10 }}>
            <input type="date" value={f.date} onChange={e => set('date', e.target.value)} />
            <input type="number" inputMode="decimal" step="0.25" placeholder="Hours" value={f.hours} onChange={e => set('hours', e.target.value)} />
            <input type="number" inputMode="decimal" placeholder={'Rate ' + (f.customer_id && curOf(f.customer_id) !== 'ZAR' ? curOf(f.customer_id) : 'R') + '/h'} value={f.rate} onChange={e => set('rate', e.target.value)} />
          </div>
          {chosen && rateFor(chosen.id) > 0 && +f.rate === rateFor(chosen.id) && <div className="mini">Saved rate for {chosen.name}: {fmt(rateFor(chosen.id), curOf(chosen.id))} an hour.</div>}
          {canSaveRate && <div className="mini">{rateFor(chosen.id) ? 'This differs from the saved rate.' : 'No rate saved for them yet.'} <a href="#" style={{ color: 'var(--acc)' }} onClick={e => { e.preventDefault(); saveRate(); }}>Save {fmt(+f.rate, curOf(chosen.id))} an hour for {chosen.name}</a></div>}
          {msg && <div className={'msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
          <div style={{ height: 8 }} />
          <button className="b" disabled={busy} onClick={save}>Log Time</button>
        </div>
      )}

      {byCustomer.length > 0 && (
        <>
          <h2>Ready to invoice</h2>
          {byCustomer.map(g => (
            <div className="card row" key={g.cid || 'none'}>
              <div>
                <div style={{ fontWeight: 600 }}>{g.customer?.name || 'No customer'}</div>
                <div className="tag">{g.hours} h &middot; {fmt(g.value, g.currency)} before VAT</div>
              </div>
              {!readOnly && <button className="b sm" style={{ width: 'auto' }} onClick={() => invoiceTime(g)}>Create Invoice</button>}
            </div>
          ))}
        </>
      )}

      <h2>Logged time</h2>
      <div className="card">
        <table><tbody>
          {timeEntries.length ? timeEntries.slice(0, 100).map(t => [
            <tr key={t.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{t.description || 'Work'}</div>
                <div className="tag">{t.date}{nameOf(t.customer_id) ? ' · ' + nameOf(t.customer_id) : ''}{jobOf(t.job_id) ? ' · ' + jobOf(t.job_id) : ''}{t.invoice_id ? ' · invoiced' : ''}</div>
              </td>
              <td className="r">
                {+t.hours} h
                {+t.rate > 0 ? <div className="mini">{fmt(+t.hours * +t.rate, curOf(t.customer_id))}</div> : <div className="mini" style={{ color: 'var(--bad)' }}>No rate, so it won't be invoiced</div>}
                {!readOnly && !t.invoice_id && (
                  <div>
                    <a href="#" style={{ color: 'var(--acc)', marginRight: 10 }} onClick={e => { e.preventDefault(); setEf({ date: t.date, hours: String(+t.hours), rate: t.rate == null ? '' : String(+t.rate), customer_id: t.customer_id || '', description: t.description || '' }); setEditId(editId === t.id ? '' : t.id); }}>Edit</a>
                    <a href="#" style={{ color: 'var(--bad)' }} onClick={e => { e.preventDefault(); removeRow('time_entries', t.id); }}>Delete</a>
                  </div>
                )}
              </td>
            </tr>,
            editId === t.id && ef && (
              <tr key={t.id + '-ed'}><td colSpan={2} style={{ paddingTop: 0 }}>
                <div className="card" style={{ margin: '4px 0 10px' }}>
                  <label style={{ marginTop: 0 }}>What was it?</label>
                  <input value={ef.description} onChange={e => setEf({ ...ef, description: e.target.value })} />
                  <label>Customer</label>
                  <select value={ef.customer_id} onChange={e => setEf({ ...ef, customer_id: e.target.value, rate: ef.rate === '' || +ef.rate === rateFor(ef.customer_id) ? (rateFor(e.target.value) || ef.rate) : ef.rate })}>
                    <option value="">No customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <div className="biz-grid" style={{ marginTop: 10 }}>
                    <div><label style={{ marginTop: 0 }}>Date</label><input type="date" value={ef.date} onChange={e => setEf({ ...ef, date: e.target.value })} /></div>
                    <div><label style={{ marginTop: 0 }}>Hours</label><input type="number" inputMode="decimal" step="0.25" value={ef.hours} onChange={e => setEf({ ...ef, hours: e.target.value })} /></div>
                    <div><label style={{ marginTop: 0 }}>Rate R/h</label><input type="number" inputMode="decimal" value={ef.rate} onChange={e => setEf({ ...ef, rate: e.target.value })} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="b" onClick={saveEdit}>Save</button>
                    <button className="b g" onClick={() => setEditId('')}>Cancel</button>
                  </div>
                </div>
              </td></tr>
            ),
          ]) : <tr><td className="mini" colSpan={2}>No time logged yet.</td></tr>}
        </tbody></table>
      </div>
      <div style={{ height: 20 }} />
    </section>
  );
}
