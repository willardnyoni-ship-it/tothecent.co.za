import { useMemo, useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { useSheet } from '../../components/Sheet.jsx';
import { R, R2, iso } from '../../lib/format.js';
import { invoiceStatusLabel, quoteStatusLabel } from '../../lib/businessMath.js';
import { DEFAULT_MILEAGE_RATE } from '../../lib/saTax.js';
import { useCreateInvoice, useCreateQuote } from '../CreateInvoiceSheet.jsx';
import { useInvoiceDetail } from '../InvoiceDetailSheet.jsx';
import { useQuoteDetail } from '../QuoteDetailSheet.jsx';
import MileageView from '../Mileage.jsx';
import { currencyOf, fmt, zar } from '../../lib/currency.js';

const STATUS_LABEL = { quoted: 'Quoted', active: 'In progress', done: 'Done', cancelled: 'Cancelled' };
const COST_CATEGORIES = ['Materials', 'Subcontractor', 'Equipment hire', 'Fuel', 'Labour', 'Other'];

// Money in and out for one job. Income is what's been invoiced before VAT
// (VAT isn't the business's money), so profit compares like with like.
// Costs are expenses and bank transactions tagged to the job, plus mileage
// at the business's per-km rate.
export function jobFinancials(job, { invoices, expenses, transactions, mileageTrips, timeEntries }, rate) {
  const inv = invoices.filter(i => i.job_id === job.id && !['cancelled', 'draft'].includes(i.status));
  const invoiced = inv.reduce((a, i) => a + zar(i, +i.subtotal - +(i.discount || 0)), 0);
  const paid = inv.reduce((a, i) => a + zar(i, +(i.paid_amount || 0)), 0);
  const exp = expenses.filter(e => e.job_id === job.id && e.status !== 'rejected' && !e.matched_transaction_id);
  const tx = transactions.filter(t => t.job_id === job.id && t.kind === 'expense');
  const trips = mileageTrips.filter(t => t.job_id === job.id);
  const km = trips.reduce((a, t) => a + +t.km, 0);
  const materials = exp.reduce((a, e) => a + +e.amount, 0) + tx.reduce((a, t) => a + +t.amount, 0);
  const travel = km * rate;
  const hours = timeEntries.filter(t => t.job_id === job.id).reduce((a, t) => a + +t.hours, 0);
  const costs = materials + travel;
  return { invoiced, paid, materials, travel, km, hours, costs, profit: invoiced - costs, exp, tx };
}

function JobDetailContent({ jobId }) {
  const { close } = useSheet();
  const biz = useBusiness();
  const { business, jobs, quotes, invoices, customers, updateRow, addExpense, hasFeature, myRole } = biz;
  const readOnly = myRole === 'accountant';
  const createInvoice = useCreateInvoice();
  const createQuote = useCreateQuote();
  const openInvoice = useInvoiceDetail();
  const openQuote = useQuoteDetail();
  const [cost, setCost] = useState({ amount: '', category: 'Materials', description: '', date: iso(new Date()) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const job = jobs.find(j => j.id === jobId);
  if (!job) return null;
  const rate = +business.mileage_rate || DEFAULT_MILEAGE_RATE;
  const fin = jobFinancials(job, biz, rate);
  const customer = customers.find(c => c.id === job.customer_id);
  const jobQuotes = quotes.filter(q => q.job_id === job.id);
  const jobInvoices = invoices.filter(i => i.job_id === job.id);
  const budget = +job.budget || 0;

  async function addCost() {
    if (!(+cost.amount > 0)) { setMsg({ e: true, t: 'Enter the cost amount.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await addExpense({ amount: +cost.amount, category: cost.category, description: cost.description, merchant: cost.description, date: cost.date, status: 'approved', job_id: job.id, vat: 0 });
      setCost(c => ({ ...c, amount: '', description: '' }));
      setMsg({ t: 'Cost added to this job.' });
    } catch (e) { setMsg({ e: true, t: e.message }); } finally { setBusy(false); }
  }

  const prefill = { customerId: job.customer_id || '', jobId: job.id };

  return (
    <>
      <div className="row"><h1>{job.name}</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="mini">{customer ? customer.name + ' · ' : ''}{STATUS_LABEL[job.status]}{job.address ? ' · ' + job.address : ''}</div>

      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">Invoiced</div><div className="val">{R(fin.invoiced)}</div></div>
        <div className="biz-card"><div className="lbl">Costs</div><div className="val">{R(fin.costs)}</div></div>
        <div className="biz-card"><div className="lbl">Profit</div><div className={'val' + (fin.profit < 0 ? ' bd' : '')}>{fin.profit < 0 ? '-' : ''}{R(Math.abs(fin.profit))}</div></div>
        <div className="biz-card"><div className="lbl">Paid so far</div><div className="val">{R(fin.paid)}</div></div>
      </div>
      {budget > 0 && (
        <div className="card">
          <div className="row"><span>Quoted / budget</span><span className="mono">{R2(budget)}</span></div>
          <div className="row"><span>Margin if all invoiced</span><span className="mono">{R2(budget - fin.costs)} ({Math.round((budget - fin.costs) / budget * 100)}%)</span></div>
          <div className="mini" style={{ marginTop: 6 }}>Materials {R2(fin.materials)} &middot; Travel {Math.round(fin.km)} km ({R2(fin.travel)}){fin.hours ? ' · ' + fin.hours + ' h logged' : ''}</div>
        </div>
      )}

      {!readOnly && (
        <>
          <div className="row" style={{ gap: 8 }}>
            {hasFeature('quotes') && <button className="b g" onClick={() => createQuote({ prefill })}>New Quote</button>}
            <button className="b g" onClick={() => createInvoice({ prefill })}>New Invoice</button>
          </div>
          <div style={{ height: 8 }} />
          <div className="seg">
            {['quoted', 'active', 'done'].map(s => (
              <button key={s} className={job.status === s ? 'on' : ''} onClick={() => updateRow('jobs', job.id, { status: s, ...(s === 'done' && !job.end_date ? { end_date: iso(new Date()) } : {}) })}>{STATUS_LABEL[s]}</button>
            ))}
          </div>
        </>
      )}

      <h2>Quotes &amp; invoices</h2>
      <div className="card">
        <table><tbody>
          {jobQuotes.map(q => (
            <tr key={q.id} style={{ cursor: 'pointer' }} onClick={() => openQuote(q.id)}>
              <td>Quote {q.quote_number}</td>
              <td className="r">{fmt(+q.total, currencyOf(q))}<div><span className={'status-badge ' + q.status}>{quoteStatusLabel(q)}</span></div></td>
            </tr>
          ))}
          {jobInvoices.map(i => (
            <tr key={i.id} style={{ cursor: 'pointer' }} onClick={() => openInvoice(i.id)}>
              <td>Invoice {i.invoice_number}</td>
              <td className="r">{fmt(+i.total, currencyOf(i))}<div><span className={'status-badge ' + i.status}>{invoiceStatusLabel(i)}</span></div></td>
            </tr>
          ))}
          {!jobQuotes.length && !jobInvoices.length && <tr><td className="mini">Nothing yet.</td></tr>}
        </tbody></table>
      </div>

      <h2>Costs</h2>
      {!readOnly && (
        <div className="card">
          <div className="biz-grid">
            <input placeholder="What was it? e.g. Tiles, grout" value={cost.description} onChange={e => setCost({ ...cost, description: e.target.value })} />
            <input type="number" inputMode="decimal" placeholder="R" value={cost.amount} onChange={e => setCost({ ...cost, amount: e.target.value })} />
          </div>
          <select value={cost.category} onChange={e => setCost({ ...cost, category: e.target.value })}>{COST_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
          {msg && <div className={'msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
          <div style={{ height: 8 }} />
          <button className="b" disabled={busy} onClick={addCost}>Add Cost</button>
          <div className="mini" style={{ marginTop: 6 }}>Got a slip? Scan it under Expenses and pick this job there.</div>
        </div>
      )}
      <div className="card">
        <table><tbody>
          {fin.exp.map(e => <tr key={e.id}><td>{e.description || e.merchant || e.category}<div className="tag">{e.date} &middot; {e.category}</div></td><td className="r">{R2(+e.amount)}</td></tr>)}
          {fin.tx.map(t => <tr key={t.id}><td>{t.description}<div className="tag">{t.date} &middot; bank</div></td><td className="r">{R2(+t.amount)}</td></tr>)}
          {!fin.exp.length && !fin.tx.length && <tr><td className="mini">No costs recorded.</td></tr>}
        </tbody></table>
      </div>

      {hasFeature('mileage') && (
        <>
          <h2>Trips</h2>
          <MileageView jobId={job.id} readOnly={readOnly} />
        </>
      )}
      <div style={{ height: 20 }} />
    </>
  );
}

export function useJobDetail() {
  const { open } = useSheet();
  return (jobId) => open(() => <JobDetailContent jobId={jobId} />);
}

export default function Jobs() {
  const biz = useBusiness();
  const { business, jobs, customers, addRow, myRole } = biz;
  const readOnly = myRole === 'accountant';
  const openJob = useJobDetail();
  const [filter, setFilter] = useState('active');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', customer_id: '', address: '', budget: '', start_date: iso(new Date()) });
  const [err, setErr] = useState('');
  const rate = +business.mileage_rate || DEFAULT_MILEAGE_RATE;

  const withFin = useMemo(() => jobs.map(j => ({ ...j, fin: jobFinancials(j, biz, rate), customerName: (customers.find(c => c.id === j.customer_id) || {}).name || '' })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, biz.invoices, biz.expenses, biz.transactions, biz.mileageTrips, biz.timeEntries, customers, rate]);
  const shown = withFin.filter(j => filter === 'all' || j.status === filter);
  const activeProfit = withFin.filter(j => j.status === 'active').reduce((a, j) => a + j.fin.profit, 0);
  const doneProfit = withFin.filter(j => j.status === 'done').reduce((a, j) => a + j.fin.profit, 0);

  async function save() {
    if (!f.name.trim()) { setErr('Give the job a name, e.g. "Mokoena bathroom".'); return; }
    try {
      const j = await addRow('jobs', { ...f, name: f.name.trim(), customer_id: f.customer_id || null, budget: +f.budget || 0, status: 'active' });
      setAdding(false); setErr(''); setF({ name: '', customer_id: '', address: '', budget: '', start_date: iso(new Date()) });
      openJob(j.id);
    } catch (e) { setErr(e.message); }
  }

  return (
    <section className="tab on light-tab">
      <h1>Jobs</h1>
      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">Jobs in progress</div><div className="val">{withFin.filter(j => j.status === 'active').length}</div></div>
        <div className="biz-card"><div className="lbl">Profit so far (in progress)</div><div className={'val' + (activeProfit < 0 ? ' bd' : '')}>{R(activeProfit)}</div></div>
        <div className="biz-card"><div className="lbl">Profit on finished jobs</div><div className={'val' + (doneProfit < 0 ? ' bd' : '')}>{R(doneProfit)}</div></div>
      </div>

      {!readOnly && (adding ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>New Job</h2>
          <label>Job name</label>
          <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Mokoena bathroom" />
          <label>Customer</label>
          <select value={f.customer_id} onChange={e => setF({ ...f, customer_id: e.target.value })}>
            <option value="">No customer yet</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label>Site address <span className="mini">(optional)</span></label>
          <input value={f.address} onChange={e => setF({ ...f, address: e.target.value })} />
          <label>Quoted amount / budget (R, before VAT)</label>
          <input type="number" inputMode="decimal" value={f.budget} onChange={e => setF({ ...f, budget: e.target.value })} />
          <label>Start date</label>
          <input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} />
          {err && <div className="msg e">{err}</div>}
          <div style={{ height: 10 }} />
          <button className="b" onClick={save}>Create Job</button>
          <div style={{ height: 8 }} />
          <button className="b g" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : <button className="b" onClick={() => setAdding(true)}>+ New Job</button>)}

      <div className="seg" style={{ marginTop: 16 }}>
        {[['active', 'In progress'], ['quoted', 'Quoted'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      <div className="card">
        <table><tbody>
          {shown.length ? shown.map(j => (
            <tr key={j.id} style={{ cursor: 'pointer' }} onClick={() => openJob(j.id)}>
              <td>
                <div style={{ fontWeight: 600 }}>{j.name}</div>
                <div className="tag">{j.customerName || 'No customer'} &middot; costs {R(j.fin.costs)}{+j.budget ? ' of ' + R(+j.budget) : ''}</div>
              </td>
              <td className="r">
                <div className="mini">Profit</div>
                <span className={j.fin.profit < 0 ? 'bd' : ''}>{R(j.fin.profit)}</span>
              </td>
            </tr>
          )) : <tr><td className="mini" colSpan={2}>No jobs here yet.</td></tr>}
        </tbody></table>
      </div>
      <div style={{ height: 20 }} />
    </section>
  );
}
