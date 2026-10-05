import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBudget } from '../../store/BudgetStore.jsx';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { businessApi } from '../../lib/businessApi.js';
import { monthEndCsv, monthEndReport, monthKey, monthLabel, shiftMonth } from '../../lib/monthEnd.js';
import { vatPeriods } from '../../lib/saTax.js';
import { R, R2, iso } from '../../lib/format.js';
import { vatReturn } from './Reports.jsx';

const ICON = { ok: '✓', warn: '!', todo: '✕' };
const TAB_LABEL = { money: 'Money', expenses: 'Expenses', invoices: 'Invoices', team: 'Team' };

// What is left to do before a month can be signed off for this business, and the sign-off itself.
export default function MonthEnd({ go }) {
  const { syncCfg, ensureToken } = useBudget();
  const { business, transactions, expenses, invoices, customers, employees, payRuns, features } = useBusiness();
  const today = iso(new Date());
  const thisMonth = monthKey(today);
  const [month, setMonth] = useState(shiftMonth(thisMonth, -1));
  const [reviews, setReviews] = useState([]);
  const [note, setNote] = useState('');
  const [anyway, setAnyway] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const loadReviews = useCallback(async () => {
    try {
      const token = await ensureToken();
      setReviews(await businessApi.select(syncCfg, token, 'month_reviews', `business_id=eq.${business.id}&select=*&order=month.desc`) || []);
    } catch { setReviews([]); }
  }, [syncCfg, ensureToken, business.id]);
  useEffect(() => { loadReviews(); }, [loadReviews]);
  useEffect(() => { setNote(''); setAnyway(false); setMsg(null); }, [month]);

  const report = useMemo(() => monthEndReport({ month, today, features, transactions, expenses, invoices, customers, employees, payRuns }),
    [month, today, features, transactions, expenses, invoices, customers, employees, payRuns]);
  const review = reviews.find(r => String(r.month).slice(0, 7) === month);

  // the VAT201 period this month falls in, for information
  const vat = useMemo(() => {
    if (!features.includes('vat')) return null;
    const p = vatPeriods(+report.to.slice(0, 4), 'A').find(x => x.from <= report.to && report.to <= x.to);
    return p ? { period: p, ret: vatReturn(p, { invoices, expenses, transactions }) } : null;
  }, [features, report.to, invoices, expenses, transactions]);

  async function signOff() {
    setBusy(true); setMsg(null);
    try {
      const token = await ensureToken();
      await businessApi.insert(syncCfg, token, 'month_reviews', [{ business_id: business.id, month: month + '-01', reviewed_by: syncCfg.userId, reviewed_by_email: syncCfg.email, note: note.trim() || null }]);
      await loadReviews(); setMsg({ t: `${monthLabel(month)} is marked as reviewed.` });
    } catch (e) { setMsg({ e: true, t: e.message }); } finally { setBusy(false); }
  }
  async function reopen() {
    setBusy(true); setMsg(null);
    try {
      const token = await ensureToken();
      await businessApi.remove(syncCfg, token, 'month_reviews', `id=eq.${review.id}`);
      await loadReviews();
    } catch (e) { setMsg({ e: true, t: e.message }); } finally { setBusy(false); }
  }
  function exportCsv() {
    const blob = new Blob([monthEndCsv(report, business.name, review)], { type: 'text/csv;charset=utf-8' });
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = `month-end-${month}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
  }

  const n = report.numbers;
  return (
    <section className="tab on light-tab">
      <h1>Month-end</h1>
      <div className="me-nav">
        <button className="b g sm" style={{ width: 'auto' }} aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>&larr;</button>
        <b>{monthLabel(month)}</b>
        <button className="b g sm" style={{ width: 'auto' }} aria-label="Next month" disabled={month >= thisMonth} onClick={() => setMonth(shiftMonth(month, 1))}>&rarr;</button>
        <span style={{ flex: 1 }} />
        <button className="b g sm" style={{ width: 'auto' }} onClick={exportCsv}>Export CSV</button>
      </div>

      <div className={'me-banner ' + (review ? 'done' : report.ready ? 'ready' : 'todo')}>
        {review
          ? <><b>Reviewed</b> by {review.reviewed_by_email} on {new Date(review.reviewed_at || review.created_at || Date.now()).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}{review.note ? ` - "${review.note}"` : ''}</>
          : report.ready
            ? <><b>Ready for review.</b> Nothing blocking{report.warn ? `, ${report.warn} thing${report.warn === 1 ? '' : 's'} worth a look` : ''}.</>
            : <><b>{report.todo} thing{report.todo === 1 ? '' : 's'} to fix first.</b>{report.warn ? ` Plus ${report.warn} worth a look.` : ''}</>}
        {!report.complete && <div className="mini">{monthLabel(month)} is still running, so some checks (statement coverage, payslips) wait until it ends.</div>}
      </div>

      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">Income</div><div className="val">{R(n.income)}</div></div>
        <div className="biz-card"><div className="lbl">Expenses</div><div className="val">{R(n.spent)}</div></div>
        <div className="biz-card"><div className="lbl">Net profit</div><div className={'val' + (n.net < 0 ? ' bd' : '')}>{n.net < 0 ? '-' : ''}{R(Math.abs(n.net))}</div></div>
        <div className="biz-card"><div className="lbl">Owed by customers</div><div className="val">{R(n.owed)}</div></div>
      </div>
      <div className="mini" style={{ margin: '6px 0 12px' }}>Invoiced in the month: {R(n.invoiced)}. Income and expenses are as on your Home screen.{vat ? ` VAT201 for ${vat.period.label}: ${vat.ret.payable >= 0 ? 'to pay' : 'refund of'} ${R2(Math.abs(vat.ret.payable))}.` : ''}</div>

      <div className="card me-list">
        {report.checks.map(c => (
          <div key={c.key} className={'me-row ' + c.status}>
            <span className="me-ic" aria-hidden="true">{ICON[c.status]}</span>
            <div className="me-body">
              <div className="me-top"><b>{c.label}</b>{c.status !== 'ok' && c.count > 0 && <span className="me-count">{c.count}</span>}</div>
              {c.status !== 'ok' && c.hint && <div className="mini">{c.hint}</div>}
              {c.items.length > 0 && (
                <details>
                  <summary>Show {c.count > c.items.length ? `first ${c.items.length} of ${c.count}` : c.count}</summary>
                  <ul>{c.items.map((i, k) => <li key={k}><span>{i.date}</span><span>{i.text}</span><b>{R2(i.amount)}</b></li>)}</ul>
                </details>
              )}
            </div>
            {c.status !== 'ok' && c.go && <button className="b g sm" style={{ width: 'auto' }} onClick={() => go(c.go)}>Open {TAB_LABEL[c.go] || c.go}</button>}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {review ? (
          <>
            <b>This month is signed off.</b>
            <div className="mini" style={{ margin: '4px 0 10px' }}>If something changes, re-open it and review again. Both actions are recorded under Activity.</div>
            <button className="b g" disabled={busy} onClick={reopen}>Re-open this month</button>
          </>
        ) : (
          <>
            <b>Sign off {monthLabel(month)}</b>
            <div className="mini" style={{ margin: '4px 0 8px' }}>Records that you reviewed this month's books, with your name and the date.</div>
            <input placeholder="Note (optional), e.g. waiting on two slips" value={note} onChange={e => setNote(e.target.value)} maxLength={200} />
            {report.todo > 0 && <label className="chk" style={{ marginTop: 10 }}><input type="checkbox" checked={anyway} onChange={e => setAnyway(e.target.checked)} /><span>{report.todo === 1 ? 'There is 1 thing' : `There are ${report.todo} things`} still to fix. Sign off anyway.</span></label>}
            <div style={{ height: 10 }} />
            <button className="b" disabled={busy || (report.todo > 0 && !anyway)} onClick={signOff}>Mark as reviewed</button>
          </>
        )}
        {msg && <div className={'msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
      </div>
      <div style={{ height: 24 }} />
    </section>
  );
}
