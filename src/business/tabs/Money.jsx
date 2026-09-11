import { useMemo, useRef, useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { R, R2, iso } from '../../lib/format.js';
import { parsePdf } from '../../lib/parsePdf.js';
import { parseCsv } from '../../lib/parseCsv.js';

function TransactionsView({ filter, setFilter }) {
  const { transactions, updateTransaction } = useBusiness();
  const shown = useMemo(() => {
    if (filter === 'all') return transactions;
    if (filter === 'review') return transactions.filter(t => t.status === 'needs_review');
    return transactions.filter(t => t.kind === filter);
  }, [transactions, filter]);

  return (
    <>
      <div className="seg">
        {['all', 'income', 'expense', 'transfer', 'review'].map(f => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {{ all: 'All', income: 'Income', expense: 'Expenses', transfer: 'Transfers', review: 'Needs Review' }[f]}
          </button>
        ))}
      </div>
      <div className="card">
        <table><tbody>
          {shown.length ? shown.map(t => (
            <tr key={t.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{t.description || '(no description)'}</div>
                <div className="tag">{t.date} &middot; {t.category || 'Uncategorised'}{t.status === 'needs_review' ? ' · needs review' : ''}</div>
              </td>
              <td className="r">
                <span className={t.kind === 'income' ? 'ok' : t.kind === 'expense' ? 'bd' : ''}>
                  {t.kind === 'income' ? '+' : t.kind === 'expense' ? '-' : ''}{R2(t.amount)}
                </span>
                {t.status === 'needs_review' && (
                  <div className="mini" style={{ fontWeight: 400 }}>
                    <a href="#" onClick={e => { e.preventDefault(); updateTransaction(t.id, { status: 'reviewed' }); }} style={{ color: 'var(--blue)' }}>mark reviewed</a>
                  </div>
                )}
              </td>
            </tr>
          )) : <tr><td className="mini" colSpan={2}>No transactions yet.</td></tr>}
        </tbody></table>
      </div>
    </>
  );
}

function IncomeView() {
  const { transactions } = useBusiness();
  const now = new Date().toISOString().slice(0, 7);
  const income = transactions.filter(t => t.kind === 'income' && t.date?.slice(0, 7) === now);
  const total = income.reduce((a, t) => a + +t.amount, 0);
  const bySource = {};
  income.forEach(t => { const k = t.description || 'Other income'; bySource[k] = (bySource[k] || 0) + +t.amount; });
  const sorted = Object.entries(bySource).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <div className="card"><div className="mini">Total income this month</div><div className="mono" style={{ fontSize: 28, fontWeight: 800 }}>{R(total)}</div></div>
      <h2>Income sources</h2>
      <div className="card">
        {sorted.length ? sorted.map(([k, v]) => (
          <div className="row" key={k} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}><div>{k}</div><div className="mono">{R(v)}</div></div>
        )) : <div className="mini">No income logged yet this month.</div>}
      </div>
    </>
  );
}

function AddTransactionForm() {
  const { addTransaction } = useBusiness();
  const [kind, setKind] = useState('income');
  const [amt, setAmt] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState(iso(new Date()));
  const [msg, setMsg] = useState('');

  async function save() {
    const a = parseFloat(amt);
    if (!a || a <= 0) { setMsg('Enter an amount greater than zero.'); return; }
    await addTransaction({ amount: a, kind, description: desc, date, status: 'reviewed', source: 'manual' });
    setAmt(''); setDesc(''); setMsg('Logged.');
    setTimeout(() => setMsg(''), 2500);
  }

  return (
    <div className="card">
      <label style={{ marginTop: 0 }}>Type</label>
      <div className="seg" style={{ margin: 0 }}>
        <button className={kind === 'income' ? 'on' : ''} onClick={() => setKind('income')}>Income</button>
        <button className={kind === 'expense' ? 'on' : ''} onClick={() => setKind('expense')}>Expense</button>
      </div>
      <label>Amount (R)</label>
      <input type="number" inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} />
      <label>Description</label>
      <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. ABC Construction" />
      <label>Date</label>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      {msg && <div className="msg s">{msg}</div>}
      <div style={{ height: 10 }} />
      <button className="b" onClick={save}>Add {kind === 'income' ? 'Income' : 'Expense'}</button>
    </div>
  );
}

function StatementUploadView() {
  const { addTransactions } = useBusiness();
  const fileRef = useRef(null), csvRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null);

  function buildRows(rawTx) {
    setPreview(rawTx.map(t => ({
      date: t.d, description: t.desc, amount: t.a,
      kind: 'expense', category: t.c, status: 'needs_review', source: 'statement',
    })));
  }

  async function handlePdf(f) {
    setMsg({ kind: 'i', text: `Reading ${f.name} …` }); setPreview(null);
    try {
      const r = await parsePdf(f, {}, []);
      if (!r.tx.length) return setMsg({ kind: 'e', text: 'No transactions found in that PDF.' });
      buildRows(r.tx);
      const total = r.tx.reduce((a, t) => a + t.a, 0);
      setMsg({ kind: 's', text: `${r.tx.length} transactions found · ${R2(total)} money spent` });
    } catch (err) { setMsg({ kind: 'e', text: 'Could not read that PDF: ' + err.message }); }
  }
  async function handleCsv(f) {
    setMsg({ kind: 'i', text: `Reading ${f.name} …` }); setPreview(null);
    try {
      const text = await f.text();
      const r = parseCsv(text, {}, []);
      if (r.error || !r.tx.length) return setMsg({ kind: 'e', text: r.error || 'No transactions found in that CSV.' });
      buildRows(r.tx);
      setMsg({ kind: 's', text: r.header });
    } catch (err) { setMsg({ kind: 'e', text: 'Could not read that CSV: ' + err.message }); }
  }

  async function commit() {
    if (!preview?.length) return;
    await addTransactions(preview);
    setMsg({ kind: 's', text: `${preview.length} transactions imported. Review them under Transactions.` });
    setPreview(null);
  }

  return (
    <div className="card">
      <div className="mini" style={{ marginBottom: 10 }}>PDF or CSV. Read on your device; nothing is uploaded unless you confirm the import.</div>
      <div className="cap">
        <button className="b" onClick={() => fileRef.current?.click()}>Upload PDF</button>
        <button className="b g" onClick={() => csvRef.current?.click()}>Upload CSV</button>
      </div>
      <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) handlePdf(f); e.target.value = ''; }} />
      <input ref={csvRef} type="file" accept=".csv,.txt,text/csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) handleCsv(f); e.target.value = ''; }} />
      {msg && <div className={'msg ' + msg.kind}>{msg.text}</div>}
      {preview && (
        <>
          <div style={{ height: 10 }} />
          <button className="b" onClick={commit}>Import {preview.length} transactions</button>
          <div className="mini" style={{ marginTop: 8 }}>All imported as expenses, flagged "needs review" so you can confirm type/category and mark any that are actually income.</div>
        </>
      )}
    </div>
  );
}

export default function Money() {
  const [seg, setSeg] = useState('transactions');
  const [filter, setFilter] = useState('all');

  return (
    <section className="tab on light-tab">
      <h1>Money</h1>
      <div className="seg">
        {['transactions', 'income', 'add', 'statement'].map(s => (
          <button key={s} className={seg === s ? 'on' : ''} onClick={() => setSeg(s)}>
            {{ transactions: 'Transactions', income: 'Income', add: 'Add', statement: 'Upload Statement' }[s]}
          </button>
        ))}
      </div>
      {seg === 'transactions' && <TransactionsView filter={filter} setFilter={setFilter} />}
      {seg === 'income' && <IncomeView />}
      {seg === 'add' && <AddTransactionForm />}
      {seg === 'statement' && <StatementUploadView />}
      <div style={{ height: 20 }} />
    </section>
  );
}
