import { useMemo } from 'react';
import { zar } from '../../lib/currency.js';
import { useBudget } from '../../store/BudgetStore.jsx';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { R, R2 } from '../../lib/format.js';
import { currentVatPeriod } from '../../lib/saTax.js';
import { isLow } from './Stock.jsx';
import { useYoco } from '../../lib/yoco.js';

// Shown to businesses created before business types existed, so they can
// pick one and get the tools that fit.
function ChooseProfileBanner({ onOpenSettings }) {
  const { business, myRole } = useBusiness();
  if (business.business_profile || myRole !== 'owner') return null;
  return (
    <div className="infobox" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div><b>New: tools for your kind of business.</b> Quotes, jobs, stock, bookings, wages and more - tell us what you do and we'll switch on what fits.</div>
      <button className="b sm" style={{ width: 'auto' }} onClick={onOpenSettings}>Choose</button>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function BizHome({ go, onOpenSettings }) {
  const { syncCfg } = useBudget();
  const yoco = useYoco({ poll: true });
  const { transactions, invoices, expenses, quotes, stockItems, bookings, timeEntries, payRuns, employees, hasFeature } = useBusiness();
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
    .reduce((a, i) => a + zar(i, +i.total - +(i.paid_amount || 0)), 0);

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

  // Tool-specific nudges - only for tools this business has switched on.
  const lowStock = hasFeature('stock') ? stockItems.filter(i => !i.archived && isLow(i)) : [];
  const todaysBookings = hasFeature('bookings') ? bookings.filter(b => b.date === todayStr && b.status === 'booked') : [];
  const weekAhead = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const expiringQuotes = hasFeature('quotes') ? quotes.filter(q => q.status === 'sent' && q.valid_until && q.valid_until >= todayStr && q.valid_until <= weekAhead) : [];
  const unbilledHours = hasFeature('time') ? timeEntries.filter(t => !t.invoice_id && +t.rate > 0).reduce((a, t) => a + +t.hours, 0) : 0;
  const thisPeriod = todayStr.slice(0, 7);
  const unpaidStaff = hasFeature('payroll') && now.getDate() >= 20
    ? employees.filter(e => e.active && !payRuns.some(r => r.employee_id === e.id && r.period === thisPeriod)).length : 0;
  const vatPeriod = hasFeature('vat') ? currentVatPeriod() : null;
  // Remind about VAT in the last two weeks of a period and until it's due.
  const vatSoon = vatPeriod && (new Date(vatPeriod.to) - now) / 86400000 <= 14;
  const toolNudges = lowStock.length || todaysBookings.length || expiringQuotes.length || unbilledHours || unpaidStaff || vatSoon;

  return (
    <section className="tab on light-tab">
      <h1>{greeting()}, {name || 'there'}</h1>
      <div className="sub">{monthLbl}</div>
      <ChooseProfileBanner onOpenSettings={onOpenSettings} />

      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">Cash available</div><div className={'val' + (cashAvailable < 0 ? ' bd' : '')}>{cashAvailable < 0 ? '-' : ''}{R(Math.abs(cashAvailable))}</div></div>
        <div className="biz-card"><div className="lbl">Income</div><div className="val">{R(income)}</div></div>
        <div className="biz-card"><div className="lbl">Expenses</div><div className="val">{R(expensesTotal)}</div></div>
        <div className="biz-card"><div className="lbl">Net</div><div className={'val' + (net < 0 ? ' bd' : '')}>{net < 0 ? '-' : ''}{R(Math.abs(net))}</div></div>
        <div className="biz-card"><div className="lbl">Outstanding</div><div className="val">{R(outstanding)}</div></div>
      </div>

      {yoco.connected && (
        <div className="card row" style={{ marginTop: 12, alignItems: 'center' }}>
          <div>
            <div className="mini" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--acc)', display: 'inline-block' }} />Card sales today · Yoco</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{R2(+yoco.status.today_total || 0)}</div>
          </div>
          <div className="mini" style={{ textAlign: 'right' }}>
            {yoco.status.today_count} sale{+yoco.status.today_count === 1 ? '' : 's'}
            {yoco.status.last_sale_at && <><br />Last: {R2(+yoco.status.last_sale_amount || 0)}</>}
          </div>
        </div>
      )}

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

      {(needsReviewTx > 0 || overdueInvoices.length > 0 || needsReviewExpenses > 0 || missingReceipts > 0 || missingVat > 0 || toolNudges) && (
        <>
          <h2>Needs your attention</h2>
          <div className="biz-attn">
            {todaysBookings.length > 0 && (
              <div className="biz-attn-row" onClick={() => go('bookings')}>
                <span className="ic">📅</span><span>{todaysBookings.length} booking{todaysBookings.length === 1 ? '' : 's'} today &middot; first at {todaysBookings.map(b => b.start_time).sort()[0]}</span>
              </div>
            )}
            {lowStock.length > 0 && (
              <div className="biz-attn-row" onClick={() => go('stock')}>
                <span className="ic">📦</span><span>{lowStock.length} stock item{lowStock.length === 1 ? ' is' : 's are'} running low &middot; {lowStock.slice(0, 3).map(i => i.name).join(', ')}{lowStock.length > 3 ? '…' : ''}</span>
              </div>
            )}
            {expiringQuotes.length > 0 && (
              <div className="biz-attn-row" onClick={() => go('invoices')}>
                <span className="ic">⏳</span><span>{expiringQuotes.length} quote{expiringQuotes.length === 1 ? '' : 's'} expire{expiringQuotes.length === 1 ? 's' : ''} this week without an answer - follow up</span>
              </div>
            )}
            {unbilledHours > 0 && (
              <div className="biz-attn-row" onClick={() => go('time')}>
                <span className="ic">⏱</span><span>{unbilledHours} hour{unbilledHours === 1 ? '' : 's'} of work not invoiced yet</span>
              </div>
            )}
            {unpaidStaff > 0 && (
              <div className="biz-attn-row" onClick={() => go('team')}>
                <span className="ic">👥</span><span>Payday is coming - {unpaidStaff} staff member{unpaidStaff === 1 ? " hasn't" : "s haven't"} got a payslip this month</span>
              </div>
            )}
            {vatSoon && (
              <div className="biz-attn-row" onClick={() => go('reports')}>
                <span className="ic">🧾</span><span>VAT period {vatPeriod.label} ends {vatPeriod.to} &middot; return due {vatPeriod.due}</span>
              </div>
            )}
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
