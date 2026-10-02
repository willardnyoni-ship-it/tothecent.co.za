import { useMemo, useState } from 'react';
import { useBusiness } from '../store/BusinessStore.jsx';
import { R, R2, iso } from '../lib/format.js';
import { payslipFor, PAYE_TABLE_LABEL } from '../lib/saTax.js';
import { downloadFile } from './share.js';

function periodLabel(p) {
  return new Date(p + '-01T12:00:00').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}
function shiftPeriod(p, n) {
  const d = new Date(p + '-01T12:00:00'); d.setMonth(d.getMonth() + n); return iso(d).slice(0, 7);
}

function buildPayslipPdf(business, emp, run) {
  const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
  const L = 40, Rx = 555;
  let y = 56;
  doc.setFont('helvetica', 'bold').setFontSize(16).text(business.name, L, y);
  doc.setFontSize(11).text('PAYSLIP', Rx, y, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(90).text(periodLabel(run.period), Rx, y + 16, { align: 'right' });
  y += 50;
  doc.setTextColor(20).setFont('helvetica', 'bold').text(emp.name, L, y);
  doc.setFont('helvetica', 'normal').setTextColor(90);
  if (emp.job_title) doc.text(emp.job_title, L, y + 14);
  if (run.paid_on) doc.text('Paid on ' + run.paid_on, Rx, y, { align: 'right' });
  y += 40;
  doc.setDrawColor(210).line(L, y, Rx, y); y += 22;
  const row = (label, val, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 12 : 10).setTextColor(bold ? 20 : 60);
    doc.text(label, L, y); doc.text(val, Rx, y, { align: 'right' }); y += bold ? 22 : 18;
  };
  if (run.hours) row('Hours worked', String(+run.hours));
  row('Gross pay', R2(+run.gross));
  row('PAYE (income tax)', '-' + R2(+run.paye));
  row('UIF (employee 1%)', '-' + R2(+run.uif_employee));
  if (+run.other_deductions) row('Other deductions', '-' + R2(+run.other_deductions));
  y += 4; doc.line(L, y, Rx, y); y += 20;
  row('NET PAY', R2(+run.net), true);
  y += 10;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(120);
  doc.text('Employer contribution: UIF ' + R2(+run.uif_employer) + '. ' + (business.tax_number ? 'Employer tax ref: ' + business.tax_number : ''), L, y);
  const blob = doc.output('blob');
  return new File([blob], `Payslip-${emp.name.replace(/\s+/g, '-')}-${run.period}.pdf`, { type: 'application/pdf' });
}

function EmployeeForm({ onDone }) {
  const { addRow } = useBusiness();
  const [f, setF] = useState({ name: '', job_title: '', pay_type: 'monthly', pay_rate: '', start_date: '', phone: '', email: '' });
  const [err, setErr] = useState('');
  async function save() {
    if (!f.name.trim() || !(+f.pay_rate > 0)) { setErr('Name and pay are required.'); return; }
    try { await addRow('employees', { ...f, name: f.name.trim(), pay_rate: +f.pay_rate, start_date: f.start_date || null }); onDone(); }
    catch (e) { setErr(e.message); }
  }
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Add staff member</h2>
      <label>Name</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <label>Job title</label><input value={f.job_title} onChange={e => setF({ ...f, job_title: e.target.value })} placeholder="e.g. Shop assistant" />
      <label>Paid</label>
      <div className="seg">
        <button className={f.pay_type === 'monthly' ? 'on' : ''} onClick={() => setF({ ...f, pay_type: 'monthly' })}>Monthly salary</button>
        <button className={f.pay_type === 'hourly' ? 'on' : ''} onClick={() => setF({ ...f, pay_type: 'hourly' })}>By the hour</button>
      </div>
      <label style={{ marginTop: 0 }}>{f.pay_type === 'monthly' ? 'Monthly salary (R, before deductions)' : 'Hourly rate (R)'}</label>
      <input type="number" inputMode="decimal" value={f.pay_rate} onChange={e => setF({ ...f, pay_rate: e.target.value })} />
      <label>Start date</label><input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} />
      <label>Phone</label><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
      {err && <div className="msg e">{err}</div>}
      <div style={{ height: 10 }} />
      <button className="b" onClick={save}>Save</button>
      <div style={{ height: 8 }} />
      <button className="b g" onClick={onDone}>Cancel</button>
    </div>
  );
}

export default function PayrollView() {
  const { business, employees, payRuns, addRow, updateRow, removeRow, addTransaction, myRole } = useBusiness();
  const canEdit = myRole === 'owner' || myRole === 'admin';
  const [period, setPeriod] = useState(iso(new Date()).slice(0, 7));
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({}); // employee_id -> { hours, gross, paye, other }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const active = employees.filter(e => e.active);
  const runs = payRuns.filter(r => r.period === period);
  const runFor = id => runs.find(r => r.employee_id === id);

  // What the payslip would be for anyone not yet paid this month. Gross
  // comes from their pay (or hours x rate); PAYE can be overridden if the
  // accountant's figure differs from the estimate.
  const calc = useMemo(() => {
    const out = {};
    active.forEach(e => {
      const d = draft[e.id] || {};
      const gross = d.gross !== undefined && d.gross !== '' ? +d.gross
        : e.pay_type === 'hourly' ? (+d.hours || 0) * +e.pay_rate : +e.pay_rate;
      const slip = payslipFor(gross, +d.other || 0);
      if (d.paye !== undefined && d.paye !== '') {
        slip.paye = +d.paye;
        slip.net = +(slip.gross - slip.paye - slip.uif_employee - slip.other_deductions).toFixed(2);
      }
      out[e.id] = { ...slip, hours: e.pay_type === 'hourly' ? +d.hours || 0 : null };
    });
    return out;
  }, [active, draft]);

  const setD = (id, k, v) => setDraft(x => ({ ...x, [id]: { ...(x[id] || {}), [k]: v } }));

  async function runPayroll() {
    const todo = active.filter(e => !runFor(e.id) && calc[e.id].gross > 0);
    if (!todo.length) { setMsg({ e: true, t: 'Nothing to run - everyone is either paid or has R0 gross.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await addRow('pay_runs', todo.map(e => ({ employee_id: e.id, period, ...calc[e.id] })));
      setDraft({});
      setMsg({ t: `Payslips created for ${todo.length} staff member${todo.length === 1 ? '' : 's'}.` });
    } catch (e) { setMsg({ e: true, t: e.message }); } finally { setBusy(false); }
  }

  // Records the take-home pay leaving the account. PAYE and UIF go to SARS
  // separately with the EMP201, so they're not included here.
  async function markPaid(run, emp) {
    setBusy(true);
    try {
      await updateRow('pay_runs', run.id, { paid_on: iso(new Date()) });
      await addTransaction({ amount: +run.net, kind: 'expense', category: 'Salaries', description: `Wages - ${emp.name} - ${periodLabel(run.period)}`, date: iso(new Date()), status: 'reviewed', source: 'payroll' });
    } finally { setBusy(false); }
  }

  const totals = runs.reduce((a, r) => ({
    gross: a.gross + +r.gross, paye: a.paye + +r.paye, uif: a.uif + +r.uif_employee + +r.uif_employer, net: a.net + +r.net,
  }), { gross: 0, paye: 0, uif: 0, net: 0 });
  // SDL (1%) only applies once annual payroll goes over R500 000.
  const annualPayroll = active.reduce((a, e) => a + (e.pay_type === 'monthly' ? +e.pay_rate * 12 : 0), 0);
  const sdl = annualPayroll > 500000 ? +(totals.gross * 0.01).toFixed(2) : 0;
  const empDue = new Date(shiftPeriod(period, 1) + '-07T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' });

  return (
    <>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <button className="b g sm" style={{ width: 'auto' }} onClick={() => setPeriod(shiftPeriod(period, -1))}>&larr;</button>
        <h2 style={{ margin: 0, flex: 1, textAlign: 'center' }}>{periodLabel(period)}</h2>
        <button className="b g sm" style={{ width: 'auto' }} onClick={() => setPeriod(shiftPeriod(period, 1))}>&rarr;</button>
      </div>

      {runs.length > 0 && (
        <div className="biz-cards">
          <div className="biz-card"><div className="lbl">Gross wages</div><div className="val">{R(totals.gross)}</div></div>
          <div className="biz-card"><div className="lbl">Take-home pay</div><div className="val">{R(totals.net)}</div></div>
          <div className="biz-card"><div className="lbl">To SARS (EMP201)</div><div className="val">{R(totals.paye + totals.uif + sdl)}</div></div>
        </div>
      )}
      {runs.length > 0 && (
        <div className="infobox" style={{ marginBottom: 12 }}>
          Pay SARS <b>{R2(totals.paye + totals.uif + sdl)}</b> by {empDue}: PAYE {R2(totals.paye)} + UIF {R2(totals.uif)}{sdl ? ' + SDL ' + R2(sdl) : ''}. Submit the EMP201 on eFiling.
        </div>
      )}

      <div className="card">
        {active.length ? active.map(e => {
          const run = runFor(e.id);
          const c = calc[e.id];
          return (
            <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div className="row">
                <div><div style={{ fontWeight: 700 }}>{e.name}</div><div className="tag">{e.job_title || 'Staff'} &middot; {e.pay_type === 'monthly' ? R2(+e.pay_rate) + '/month' : R2(+e.pay_rate) + '/hour'}</div></div>
                {run ? <span className={'status-badge ' + (run.paid_on ? 'paid' : 'sent')}>{run.paid_on ? 'Paid' : 'Payslip ready'}</span> : null}
              </div>
              {run ? (
                <>
                  <div className="mini" style={{ marginTop: 6 }}>Gross {R2(+run.gross)} &middot; PAYE {R2(+run.paye)} &middot; UIF {R2(+run.uif_employee)} &middot; <b>Net {R2(+run.net)}</b></div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    <button className="b g sm" style={{ width: 'auto' }} onClick={() => downloadFile(buildPayslipPdf(business, e, run))}>Payslip PDF</button>
                    {canEdit && !run.paid_on && <button className="b sm" style={{ width: 'auto' }} disabled={busy} onClick={() => markPaid(run, e)}>Mark Paid</button>}
                    {canEdit && !run.paid_on && <button className="b d sm" style={{ width: 'auto' }} disabled={busy} onClick={() => removeRow('pay_runs', run.id)}>Redo</button>}
                  </div>
                </>
              ) : canEdit && (
                <div className="biz-grid" style={{ marginTop: 8 }}>
                  {e.pay_type === 'hourly' && <input type="number" placeholder="Hours" value={draft[e.id]?.hours ?? ''} onChange={ev => setD(e.id, 'hours', ev.target.value)} />}
                  <input type="number" placeholder={'Gross ' + c.gross} value={draft[e.id]?.gross ?? ''} onChange={ev => setD(e.id, 'gross', ev.target.value)} title="Gross pay - leave blank to use their normal pay" />
                  <input type="number" placeholder={'PAYE ' + c.paye} value={draft[e.id]?.paye ?? ''} onChange={ev => setD(e.id, 'paye', ev.target.value)} title="PAYE - leave blank for the estimate" />
                  <div className="mono r" style={{ fontWeight: 700 }}>{R2(c.net)}</div>
                </div>
              )}
            </div>
          );
        }) : <div className="mini">No staff added yet.</div>}
        {msg && <div className={'msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
        {canEdit && active.some(e => !runFor(e.id)) && (
          <>
            <div style={{ height: 10 }} />
            <button className="b" disabled={busy} onClick={runPayroll}>Create Payslips for {periodLabel(period)}</button>
          </>
        )}
      </div>
      <div className="mini" style={{ marginBottom: 12 }}>PAYE is an estimate from the {PAYE_TABLE_LABEL} for employees under 65 with no medical aid or retirement deductions. Type over it if your accountant's figure differs. UIF is 1% each from employee and employer, up to the monthly ceiling.</div>

      {canEdit && (adding ? <EmployeeForm onDone={() => setAdding(false)} /> : <button className="b g" onClick={() => setAdding(true)}>+ Add Staff Member</button>)}
      {canEdit && employees.some(e => e.active) && (
        <details style={{ marginTop: 12 }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Someone stopped working here?</summary>
          <div className="card" style={{ marginTop: 8 }}>
            {active.map(e => <div className="row" key={e.id} style={{ padding: '4px 0' }}><span>{e.name}</span><button className="b d sm" style={{ width: 'auto' }} onClick={() => updateRow('employees', e.id, { active: false })}>Mark as left</button></div>)}
          </div>
        </details>
      )}
    </>
  );
}
