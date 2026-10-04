import { useMemo, useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { R, R2, iso, vatOf } from '../../lib/format.js';
import { vatPeriods, currentVatPeriod } from '../../lib/saTax.js';
import { saTaxYear, taxYearLabel } from '../../lib/tax.js';

function dl(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}

function monthLabel(d) { return d.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }); }

// VAT201 figures for one period, on the invoice basis: output VAT on
// invoices issued in the period, plus VAT inside cash-up / stock / booking
// sales (those are recorded VAT-inclusive), less input VAT claimed on
// expenses with a VAT amount captured from the slip.
export function vatReturn(period, { invoices, expenses, transactions }) {
  const inP = d => d && d >= period.from && d <= period.to;
  const inv = invoices.filter(i => inP(i.issue_date) && !['draft', 'cancelled'].includes(i.status));
  const counterSales = transactions.filter(t => t.kind === 'income' && inP(t.date) && ['cashup', 'stock', 'booking'].includes(t.source));
  const exp = expenses.filter(e => inP(e.date) && e.status !== 'rejected');
  const salesExcl = inv.reduce((a, i) => a + +i.total - +i.vat, 0) + counterSales.reduce((a, t) => a + +t.amount - vatOf(+t.amount), 0);
  // Bank transactions the owner marked as including VAT while reviewing them.
  // Invoice payments (linked) are skipped - the invoice already counts - and
  // so are cash-up / stock / booking sales, counted above.
  const txVat = transactions.filter(t => inP(t.date) && +t.vat_amount > 0 && !t.linked_invoice_id && !['cashup', 'stock', 'booking'].includes(t.source));
  const txOut = txVat.filter(t => t.kind === 'income');
  const txIn = txVat.filter(t => t.kind === 'expense');
  const outputVat = inv.reduce((a, i) => a + +i.vat, 0) + counterSales.reduce((a, t) => a + vatOf(+t.amount), 0) + txOut.reduce((a, t) => a + +t.vat_amount, 0);
  const inputVat = exp.reduce((a, e) => a + +(e.vat || 0), 0) + txIn.reduce((a, t) => a + +t.vat_amount, 0);
  const missingVat = exp.filter(e => !+e.vat).length;
  return { inv, counterSales, exp, txOut, txIn, salesExcl: salesExcl + txOut.reduce((a, t) => a + +t.amount - +t.vat_amount, 0), outputVat, inputVat, payable: outputVat - inputVat, missingVat };
}

function VatView() {
  const biz = useBusiness();
  const [category, setCategory] = useState('A');
  const cur = currentVatPeriod(category);
  const year = new Date().getFullYear();
  const periods = [...vatPeriods(year - 1, category), ...vatPeriods(year, category)].filter(p => p.from <= iso(new Date())).reverse();
  const [key, setKey] = useState(cur?.from);
  const period = periods.find(p => p.from === key) || periods[0];
  const v = vatReturn(period, biz);

  function exportCsv() {
    const rows = [['type', 'date', 'reference', 'amount incl VAT', 'VAT']];
    v.inv.forEach(i => rows.push(['output: invoice', i.issue_date, i.invoice_number, i.total, i.vat]));
    v.counterSales.forEach(t => rows.push(['output: ' + t.source, t.date, t.description || '', t.amount, vatOf(+t.amount).toFixed(2)]));
    v.exp.forEach(e => rows.push(['input: expense', e.date, e.description || e.merchant || '', e.amount, e.vat || 0]));
    v.txOut.forEach(t => rows.push(['output: bank transaction', t.date, t.description || '', t.amount, t.vat_amount]));
    v.txIn.forEach(t => rows.push(['input: bank transaction', t.date, t.description || '', t.amount, t.vat_amount]));
    dl(new Blob([rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }), 'vat-' + period.from + '.csv');
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>VAT return (VAT201)</h2>
      <div className="seg">
        <button className={category === 'A' ? 'on' : ''} onClick={() => { setCategory('A'); setKey(currentVatPeriod('A')?.from); }}>Periods end Feb, Apr...</button>
        <button className={category === 'B' ? 'on' : ''} onClick={() => { setCategory('B'); setKey(currentVatPeriod('B')?.from); }}>Periods end Jan, Mar...</button>
      </div>
      <select value={period.from} onChange={e => setKey(e.target.value)}>
        {periods.map(p => <option key={p.from} value={p.from}>{p.label}</option>)}
      </select>
      <div className="mini" style={{ marginTop: 6 }}>Due by {p_due(period)}.</div>
      <div className="biz-totals">
        <div className="row"><span>Sales excl. VAT</span><span className="mono">{R2(v.salesExcl)}</span></div>
        <div className="row"><span>Output VAT on sales</span><span className="mono">{R2(v.outputVat)}</span></div>
        <div className="row"><span>Input VAT on expenses</span><span className="mono">-{R2(v.inputVat)}</span></div>
        <div className="row grand"><span>{v.payable >= 0 ? 'VAT to pay' : 'VAT refund due'}</span><span className="mono">{R2(Math.abs(v.payable))}</span></div>
      </div>
      {v.missingVat > 0 && <div className="msg e">{v.missingVat} expense{v.missingVat === 1 ? ' has' : 's have'} no VAT amount - if they came from VAT-registered suppliers, add the VAT from the slip to claim it.</div>}
      <div className="mini" style={{ marginTop: 8 }}>Invoice basis. Cash-up, stock and booking sales are treated as VAT-inclusive. Bank transactions count when you mark them as including VAT ({v.txOut.length + v.txIn.length} this period) - if the same purchase is also saved under Expenses with its VAT, only enter VAT on one of them. Check against your records before filing on eFiling - this is a guide, not tax advice.</div>
      <div style={{ height: 10 }} />
      <button className="b g" onClick={exportCsv}>Download VAT Detail (CSV)</button>
    </div>
  );
}
function p_due(p) { return new Date(p.due + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }); }

// For sole traders and freelancers nobody withholds tax, so the profit is
// all "gross" until SARS takes its share via provisional tax. This shows
// the tax year so far and a suggested amount to put aside.
function TaxSetAsideView() {
  const { business, transactions, expenses, updateBusiness, myRole } = useBusiness();
  const [pct, setPct] = useState(business.tax_set_aside_pct ?? 25);
  const ty = saTaxYear();
  const from = ty.split('-')[0] + '-03-01';
  const income = transactions.filter(t => t.kind === 'income' && t.date >= from).reduce((a, t) => a + +t.amount, 0);
  const costs = transactions.filter(t => t.kind === 'expense' && t.date >= from).reduce((a, t) => a + +t.amount, 0)
    + expenses.filter(e => e.date >= from && e.status !== 'rejected' && !e.matched_transaction_id).reduce((a, e) => a + +e.amount, 0);
  const profit = income - costs;
  const setAside = Math.max(0, profit) * (+pct || 0) / 100;
  const monthKey = iso(new Date()).slice(0, 7);
  const mIncome = transactions.filter(t => t.kind === 'income' && t.date.slice(0, 7) === monthKey).reduce((a, t) => a + +t.amount, 0);
  const mCosts = transactions.filter(t => t.kind === 'expense' && t.date.slice(0, 7) === monthKey).reduce((a, t) => a + +t.amount, 0)
    + expenses.filter(e => e.date.slice(0, 7) === monthKey && e.status !== 'rejected' && !e.matched_transaction_id).reduce((a, e) => a + +e.amount, 0);
  const mSetAside = Math.max(0, mIncome - mCosts) * (+pct || 0) / 100;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Tax set-aside</h2>
      <div className="sub">Tax year {taxYearLabel(ty)}</div>
      <div className="biz-totals">
        <div className="row"><span>Profit so far</span><span className="mono">{R2(profit)}</span></div>
        <div className="row grand"><span>Put aside for SARS ({+pct}%)</span><span className="mono">{R2(setAside)}</span></div>
        <div className="row"><span>From this month's profit</span><span className="mono">{R2(mSetAside)}</span></div>
      </div>
      <label>Percentage to put aside</label>
      <input type="number" min="0" max="60" value={pct} onChange={e => setPct(e.target.value)} />
      {myRole === 'owner' && +pct !== +business.tax_set_aside_pct && <><div style={{ height: 8 }} /><button className="b g" onClick={() => updateBusiness({ tax_set_aside_pct: +pct || 0 })}>Remember this percentage</button></>}
      <div className="mini" style={{ marginTop: 8 }}>
        Move this into a separate savings account so it's there when provisional tax is due (end of August and end of February).
        25% is a reasonable starting point for most freelancers; your accountant can give you a closer number.
      </div>
    </div>
  );
}

export default function Reports() {
  const { business, transactions, expenses, invoices, hasFeature } = useBusiness();
  const [view, setView] = useState('pl');
  const views = ['pl', 'income', 'expense', 'tax'].concat(hasFeature('vat') ? ['vat'] : [], hasFeature('taxSavings') ? ['setaside'] : []);
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
        {views.map(v => (
          <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
            {{ pl: 'Profit & Loss', income: 'Income', expense: 'Expenses', tax: 'Tax Records', vat: 'VAT', setaside: 'Tax Set-aside' }[v]}
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
      {view === 'vat' && <VatView />}
      {view === 'setaside' && <TaxSetAsideView />}
      <div style={{ height: 20 }} />
    </section>
  );
}
