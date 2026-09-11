import { useMemo, useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { R, R2, iso } from '../../lib/format.js';

function dl(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}

function monthLabel(d) { return d.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }); }

export default function Reports() {
  const { business, transactions, expenses, invoices } = useBusiness();
  const [view, setView] = useState('pl');
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthTx = useMemo(() => transactions.filter(t => t.date?.slice(0, 7) === monthKey), [transactions, monthKey]);

  const income = monthTx.filter(t => t.kind === 'income').reduce((a, t) => a + +t.amount, 0);
  // Same union as the Home dashboard: transactions plus Expenses-tab
  // records, skipping any expense already folded into a transaction.
  const monthExpenseRecords = expenses.filter(e => e.date?.slice(0, 7) === monthKey && e.status !== 'rejected' && !e.matched_transaction_id);
  const expenseByCat = {};
  monthTx.filter(t => t.kind === 'expense').forEach(t => { const k = t.category || 'Other'; expenseByCat[k] = (expenseByCat[k] || 0) + +t.amount; });
  monthExpenseRecords.forEach(e => { const k = e.category || 'Other'; expenseByCat[k] = (expenseByCat[k] || 0) + +e.amount; });
  const expenseTotal = Object.values(expenseByCat).reduce((a, v) => a + v, 0);
  const net = income - expenseTotal;

  function exportCsv() {
    const rows = [['date', 'type', 'description', 'category', 'amount']]
      .concat(transactions.map(t => [t.date, t.kind, t.description || '', t.category || '', t.amount]));
    dl(new Blob([rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')], { type: 'text/csv' }), 'transactions-' + iso(new Date()) + '.csv');
  }
  function exportTaxRecords() {
    const rows = [['type', 'date', 'description', 'amount', 'vat']];
    transactions.forEach(t => rows.push(['transaction:' + t.kind, t.date, t.description || '', t.amount, '']));
    expenses.forEach(e => rows.push(['expense', e.date, e.description || e.merchant || '', e.amount, e.vat || 0]));
    invoices.forEach(i => rows.push(['invoice:' + i.status, i.issue_date, i.invoice_number, i.total, i.vat]));
    dl(new Blob([rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')], { type: 'text/csv' }), 'tax-records-' + iso(new Date()) + '.csv');
  }

  return (
    <section className="tab on light-tab">
      <h1>Reports</h1>
      <div className="seg">
        {['pl', 'income', 'expense', 'tax'].map(v => (
          <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
            {{ pl: 'Profit & Loss', income: 'Income', expense: 'Expenses', tax: 'Tax Records' }[v]}
          </button>
        ))}
      </div>

      {view === 'pl' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Profit &amp; Loss</h2>
          <div className="sub">{monthLabel(new Date())}</div>
          <div className="row" style={{ marginTop: 10 }}><span>Income</span><span className="mono">{R(income)}</span></div>
          <h2>Expenses</h2>
          {Object.entries(expenseByCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div className="row" key={k} style={{ padding: '3px 0' }}><span className="mini">{k}</span><span className="mono">{R(v)}</span></div>
          ))}
          <div className="row" style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 8, fontWeight: 700 }}><span>Total Expenses</span><span className="mono">{R(expenseTotal)}</span></div>
          <div className="row" style={{ marginTop: 10, fontSize: 20, fontWeight: 800 }}><span>NET PROFIT</span><span className={'mono' + (net < 0 ? ' bd' : ' ok')}>{net < 0 ? '-' : ''}{R(Math.abs(net))}</span></div>
          <div style={{ height: 12 }} />
          <button className="b g" onClick={exportCsv}>Download CSV</button>
        </div>
      )}
      {view === 'income' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Income this month</h2>
          <table><tbody>
            {monthTx.filter(t => t.kind === 'income').map(t => <tr key={t.id}><td>{t.description || '-'}<div className="tag">{t.date}</div></td><td className="r">{R2(t.amount)}</td></tr>)}
          </tbody></table>
        </div>
      )}
      {view === 'expense' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Expenses this month</h2>
          <table><tbody>
            {monthTx.filter(t => t.kind === 'expense').map(t => <tr key={t.id}><td>{t.description || '-'}<div className="tag">{t.category} &middot; {t.date}</div></td><td className="r">{R2(t.amount)}</td></tr>)}
            {monthExpenseRecords.map(e => <tr key={e.id}><td>{e.description || e.merchant || '-'}<div className="tag">{e.category} &middot; {e.date}</div></td><td className="r">{R2(e.amount)}</td></tr>)}
          </tbody></table>
        </div>
      )}
      {view === 'tax' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Tax Records</h2>
          <div className="mini" style={{ marginBottom: 10 }}>
            {business.name} organizes your income, expenses, receipts and invoices for tax and accounting purposes.
            This does not determine your tax liability - check the totals with your accountant or SARS eFiling.
          </div>
          <div className="row"><span>Transactions</span><span className="mono">{transactions.length}</span></div>
          <div className="row"><span>Expenses</span><span className="mono">{expenses.length}</span></div>
          <div className="row"><span>Invoices</span><span className="mono">{invoices.length}</span></div>
          <div style={{ height: 12 }} />
          <button className="b g" onClick={exportTaxRecords}>Export Tax Records (CSV)</button>
        </div>
      )}
      <div style={{ height: 20 }} />
    </section>
  );
}
