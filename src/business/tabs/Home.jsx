import { useMemo } from 'react';
import { useBudget } from '../../store/BudgetStore.jsx';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { R, R2 } from '../../lib/format.js';
import { invoiceStatusLabel } from '../../lib/businessMath.js';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function BizHome({ go }) {
  const { syncCfg } = useBudget();
  const { transactions, invoices, expenses } = useBusiness();
  const name = (syncCfg.email || '').split('@')[0].replace(/[._-]+/g, ' ');

  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const monthLbl = now.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

  const monthTx = useMemo(() => transactions.filter(t => t.date?.slice(0, 7) === monthKey), [transactions, monthKey]);
  const income = monthTx.filter(t => t.kind === 'income').reduce((a, t) => a + +t.amount, 0);
  // Expenses come from two places: imported/manual Money transactions
  // (kind='expense') and the Expenses tab's receipts/manual entries. A
  // receipt already folded into a transaction (matched_transaction_id set)
  // is skipped here so it isn't counted twice.
  const monthExpenseRecords = useMemo(() => expenses.filter(e => e.date?.slice(0, 7) === monthKey && e.status !== 'rejected' && !e.matched_transaction_id), [expenses, monthKey]);
  const expensesTotal = monthTx.filter(t => t.kind === 'expense').reduce((a, t) => a + +t.amount, 0)
    + monthExpenseRecords.reduce((a, e) => a + +e.amount, 0);
  const net = income - expensesTotal;
  const outstanding = invoices.filter(i => !['paid', 'cancelled', 'draft'].includes(i.status))
    .reduce((a, i) => a + (+i.total - +(i.paid_amount || 0)), 0);

  // All-time cumulative income minus expenses - a stand-in for "cash
  // available" in the absence of any real bank-balance integration.
  const allExpenseRecords = useMemo(() => expenses.filter(e => e.status !== 'rejected' && !e.matched_transaction_id), [expenses]);
  const cashAvailable = transactions.filter(t => t.kind === 'income').reduce((a, t) => a + +t.amount, 0)
    - transactions.filter(t => t.kind === 'expense').reduce((a, t) => a + +t.amount, 0)
    - allExpenseRecords.reduce((a, e) => a + +e.amount, 0);

  const missingReceipts = expenses.filter(e => e.status !== 'rejected' && !e.receipt_storage_path).length;
  const missingVat = expenses.filter(e => e.receipt_storage_path && !e.vat).length;

  const days = useMemo(() => {
    const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return [...Array(7)].map((_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const dayTx = transactions.filter(t => t.date === key);
      return {
        label: d.toLocaleDateString('en-ZA', { weekday: 'short' }),
        in: dayTx.filter(t => t.kind === 'income').reduce((a, t) => a + +t.amount, 0),
        out: dayTx.filter(t => t.kind === 'expense').reduce((a, t) => a + +t.amount, 0),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]);
  const maxFlow = Math.max(1, ...days.map(d => Math.max(d.in, d.out)));

  const todayStr = now.toISOString().slice(0, 10);
  const openInvoices = invoices.filter(i => !['paid', 'cancelled', 'draft'].includes(i.status));
  const overdueInvoices = openInvoices.filter(i => i.due_date && i.due_date < todayStr);
  const dueSoon = openInvoices.filter(i => i.due_date && i.due_date >= todayStr && i.due_date <= new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10));

  const needsReviewTx = transactions.filter(t => t.status === 'needs_review').length;
  const needsReviewExpenses = expenses.filter(e => e.status === 'needs_review' || e.status === 'pending_approval').length;

  return (
    <section className="tab on light-tab">
      <h1>{greeting()}, {name || 'there'}</h1>
      <div className="sub">{monthLbl}</div>

      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">Cash available</div><div className={'val' + (cashAvailable < 0 ? ' bd' : '')}>{cashAvailable < 0 ? '-' : ''}{R(Math.abs(cashAvailable))}</div></div>
        <div className="biz-card"><div className="lbl">Income</div><div className="val">{R(income)}</div></div>
        <div className="biz-card"><div className="lbl">Expenses</div><div className="val">{R(expensesTotal)}</div></div>
        <div className="biz-card"><div className="lbl">Net</div><div className={'val' + (net < 0 ? ' bd' : '')}>{net < 0 ? '-' : ''}{R(Math.abs(net))}</div></div>
        <div className="biz-card"><div className="lbl">Outstanding</div><div className="val">{R(outstanding)}</div></div>
      </div>

      <h2>Cash flow</h2>
      <div className="card">
        <div className="row mini" style={{ marginBottom: 8 }}><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: 'var(--acc)', marginRight: 6 }} />Money In</span><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: 'var(--bad)', marginRight: 6 }} />Money Out</span></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 120 }}>
          {days.map((d, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 90, justifyContent: 'center' }}>
                <div style={{ width: 10, height: Math.max(2, d.in / maxFlow * 90), background: 'var(--acc)', borderRadius: '3px 3px 0 0' }} />
                <div style={{ width: 10, height: Math.max(2, d.out / maxFlow * 90), background: 'var(--bad)', borderRadius: '3px 3px 0 0' }} />
              </div>
              <div className="mini" style={{ marginTop: 4 }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>

      <h2>Invoices</h2>
      <div className="card row" style={{ textAlign: 'center' }}>
        <div style={{ flex: 1 }}><div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{openInvoices.length}</div><div className="mini">Outstanding</div></div>
        <div style={{ flex: 1 }}><div className="mono bd" style={{ fontSize: 22, fontWeight: 700 }}>{overdueInvoices.length}</div><div className="mini">Overdue</div></div>
        <div style={{ flex: 1 }}><div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{dueSoon.length}</div><div className="mini">Due Soon</div></div>
      </div>

      {(needsReviewTx > 0 || overdueInvoices.length > 0 || needsReviewExpenses > 0 || missingReceipts > 0 || missingVat > 0) && (
        <>
          <h2>Needs your attention</h2>
          <div className="biz-attn">
            {needsReviewTx > 0 && (
              <div className="biz-attn-row" onClick={() => go('money')}>
                <span className="ic">⚠</span><span>{needsReviewTx} transaction{needsReviewTx === 1 ? '' : 's'} need review</span>
              </div>
            )}
            {overdueInvoices.length > 0 && (
              <div className="biz-attn-row" onClick={() => go('invoices')}>
                <span className="ic">⚠</span><span>{overdueInvoices.length} invoice{overdueInvoices.length === 1 ? '' : 's'} overdue &middot; {R(overdueInvoices.reduce((a, i) => a + (+i.total - +(i.paid_amount || 0)), 0))} outstanding</span>
              </div>
            )}
            {needsReviewExpenses > 0 && (
              <div className="biz-attn-row" onClick={() => go('expenses')}>
                <span className="ic">⚠</span><span>{needsReviewExpenses} receipt{needsReviewExpenses === 1 ? '' : 's'} {needsReviewExpenses === 1 ? "hasn't" : "haven't"} been reviewed</span>
              </div>
            )}
            {missingReceipts > 0 && (
              <div className="biz-attn-row" onClick={() => go('expenses')}>
                <span className="ic">⚠</span><span>{missingReceipts} expense{missingReceipts === 1 ? '' : 's'} {missingReceipts === 1 ? 'has' : 'have'} no receipt on file</span>
              </div>
            )}
            {missingVat > 0 && (
              <div className="biz-attn-row" onClick={() => go('expenses')}>
                <span className="ic">⚠</span><span>Tax records incomplete &middot; {missingVat} receipt{missingVat === 1 ? '' : 's'} missing VAT details</span>
              </div>
            )}
          </div>
        </>
      )}
      <div style={{ height: 20 }} />
    </section>
  );
}
