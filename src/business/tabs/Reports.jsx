import { useMemo, useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { R, R2, iso, vatOf } from '../../lib/format.js';
import { vatPeriods, currentVatPeriod, PAYE_TABLE_LABEL } from '../../lib/saTax.js';
import { provisionalPlan } from '../../lib/provisionalTax.js';
import { saTaxYear, taxYearLabel } from '../../lib/tax.js';

function dl(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}

function monthLabel(d) { return d.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }); }

// VAT201 figures for one period, on the invoice basis: output VAT on
// invoices issued in the period, plus VAT inside cash-up / stock / booking / Yoco
// sales (those are recorded VAT-inclusive), less input VAT claimed on
// expenses with a VAT amount captured from the slip.
export function vatReturn(period, { invoices, expenses, transactions }) {
  const inP = d => d && d >= period.from && d <= period.to;
  const inv = invoices.filter(i => inP(i.issue_date) && !['draft', 'cancelled'].includes(i.status));
  const counterSales = transactions.filter(t => t.kind === 'income' && inP(t.date) && ['cashup', 'stock', 'booking', 'yoco'].includes(t.source));
  const exp = expenses.filter(e => inP(e.date) && e.status !== 'rejected');
  const salesExcl = inv.reduce((a, i) => a + +i.total - +i.vat, 0) + counterSales.reduce((a, t) => a + +t.amount - vatOf(+t.amount), 0);
  // Bank transactions the owner marked as including VAT while reviewing them.
  // Invoice payments (linked) are skipped - the invoice already counts - and
  // so are cash-up / stock / booking sales, counted above.
  const txVat = transactions.filter(t => inP(t.date) && +t.vat_amount > 0 && !t.linked_invoice_id && !['cashup', 'stock', 'booking', 'yoco'].includes(t.source));
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
// all "gross" until SARS takes its share through provisional tax (paid by 31
// August and by the end of February). This estimates what the year's tax will
// be, what is due next, and what to put away each month to be ready for it.
const longDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

function TaxSetAsideView() {
  const { business, transactions, expenses, updateBusiness, myRole } = useBusiness();
  const [pct, setPct] = useState(business.tax_set_aside_pct ?? 25);
  const [expected, setExpected] = useState(business.tax_expected_profit ?? '');
  const [paid, setPaid] = useState(business.provisional_paid ?? '');
  const [msg, setMsg] = useState('');
  const today = iso(new Date());
  const ty = saTaxYear();
  const from = ty.split('-')[0] + '-03-01';
  const income = transactions.filter(t => t.kind === 'income' && t.date >= from).reduce((a, t) => a + +t.amount, 0);
  const costs = transactions.filter(t => t.kind === 'expense' && t.date >= from).reduce((a, t) => a + +t.amount, 0)
    + expenses.filter(e => e.date >= from && e.status !== 'rejected' && !e.matched_transaction_id).reduce((a, e) => a + +e.amount, 0);
  const profit = income - costs;
  const company = business.business_type === 'Private Company';
  const plan = provisionalPlan({ ytd: profit, expected, paid, company, today });
  const setAside = Math.max(0, profit) * (+pct || 0) / 100;
  const changed = String(expected) !== String(business.tax_expected_profit ?? '') || String(paid) !== String(business.provisional_paid ?? '');

  async function remember() {
    try {
      await updateBusiness({ tax_expected_profit: expected === '' ? null : Math.max(0, +expected || 0), provisional_paid: paid === '' ? null : Math.max(0, +paid || 0) });
      setMsg('Saved.');
    } catch (e) { setMsg(e.message); }
  }

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Provisional tax estimate</h2>
        <div className="sub">Tax year {taxYearLabel(ty)}</div>
        <div className="biz-totals">
          <div className="row"><span>Profit so far this tax year</span><span className="mono">{R2(profit)}</span></div>
          <div className="row"><span>Projected for the whole year</span><span className="mono">{R2(plan.projected)}</span></div>
          <div className="row grand"><span>Estimated tax for the year</span><span className="mono">{R2(plan.tax)}</span></div>
        </div>
        <div className="mini" style={{ marginTop: 4 }}>
          {company ? 'A company pays a flat 27% of its profit.' : `Worked out on your profit with the ${PAYE_TABLE_LABEL} and the primary rebate.`}
          {plan.usedExpected ? ' Using your own figure below.' : ' The projection stretches your profit so far across the full year. If you only started using To The Cent part-way through the year, enter your own figure below.'}
        </div>

        <label>Expect a different profit for the year? <span className="mini">(optional, in rand)</span></label>
        <input type="number" inputMode="decimal" min="0" placeholder={String(Math.round(plan.projected))} value={expected} onChange={e => setExpected(e.target.value)} />
        <label>Provisional tax already paid this tax year (R)</label>
        <input type="number" inputMode="decimal" min="0" placeholder="0" value={paid} onChange={e => setPaid(e.target.value)} />
        {myRole === 'owner' && changed && <><div style={{ height: 8 }} /><button className="b g" onClick={remember}>Remember these figures</button></>}
        {msg && <div className="msg s">{msg}</div>}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>What to do next</h2>
        {plan.dueAmount > 0 ? (
          <div className="biz-totals">
            <div className="row grand"><span>{plan.dueWhich === 'first' ? '1st' : '2nd'} provisional payment, due {longDate(plan.dueDate)}</span><span className="mono">{R2(plan.dueAmount)}</span></div>
            <div className="row"><span>Put aside each month until then ({plan.monthsLeft} month{plan.monthsLeft === 1 ? '' : 's'})</span><span className="mono">{R2(plan.perMonth)}</span></div>
            <div className="row"><span>Should be in your tax savings by today</span><span className="mono">{R2(plan.shouldHaveSaved)}</span></div>
          </div>
        ) : (
          <div className="mini">{plan.tax > 0 ? `Nothing more to pay by ${longDate(plan.dueDate)} on these figures.` : 'No tax is due on these figures yet.'}</div>
        )}
        <div className="mini" style={{ marginTop: 8 }}>
          Move the monthly amount into a separate savings account. The 1st payment is due by 31 August and covers half of the year's tax; the 2nd, by the end of February, brings it up to the full estimate.
          Start a new tax year by clearing the amount already paid each March. This is an estimate: it leaves out medical credits, retirement contributions and other deductions, so check the figures with your accountant or on SARS eFiling.
        </div>
      </div>

      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Prefer a simple percentage?</summary>
        <div className="biz-totals" style={{ marginTop: 10 }}>
          <div className="row grand"><span>Put aside for SARS ({+pct}% of profit so far)</span><span className="mono">{R2(setAside)}</span></div>
        </div>
        <label>Percentage to put aside</label>
        <input type="number" min="0" max="60" value={pct} onChange={e => setPct(e.target.value)} />
        {myRole === 'owner' && +pct !== +business.tax_set_aside_pct && <><div style={{ height: 8 }} /><button className="b g" onClick={() => updateBusiness({ tax_set_aside_pct: +pct || 0 })}>Remember this percentage</button></>}
      </details>
    </>
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
          <div className="row" style={{ marginTop: 10, fontSize: 20, fontWeight: 600 }}><span>NET PROFIT</span><span className={'mono' + (net < 0 ? ' bd' : ' ok')}>{net < 0 ? '-' : ''}{R(Math.abs(net))}</span></div>
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
