import { useMemo, useRef, useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { R, R2, iso } from '../../lib/format.js';
import { parsePdf } from '../../lib/parsePdf.js';
import { parseCsv } from '../../lib/parseCsv.js';
import { flowKind } from '../../lib/categorize.js';

function TransactionsView({ filter, setFilter, readOnly }) {
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
                {!readOnly && t.status === 'needs_review' && (
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
    const category = kind === 'transfer' ? 'Transfer' : undefined;
    await addTransaction({ amount: a, kind, category, description: desc, date, status: 'reviewed', source: 'manual' });
    setAmt(''); setDesc(''); setMsg('Logged.');
    setTimeout(() => setMsg(''), 2500);
  }

  return (
    <div className="card">
      <label style={{ marginTop: 0 }}>Type</label>
      <div className="seg" style={{ margin: 0 }}>
        <button className={kind === 'income' ? 'on' : ''} onClick={() => setKind('income')}>Income</button>
        <button className={kind === 'expense' ? 'on' : ''} onClick={() => setKind('expense')}>Expense</button>
        <button className={kind === 'transfer' ? 'on' : ''} onClick={() => setKind('transfer')}>Transfer</button>
      </div>
      {kind === 'transfer' && <div className="mini" style={{ marginTop: 6 }}>Money moved between your own accounts, or to/from the owner - not business income or an expense, so it's kept out of profit.</div>}
      <label>Amount (R)</label>
      <input type="number" inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} />
      <label>Description</label>
      <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. ABC Construction" />
      <label>Date</label>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      {msg && <div className="msg s">{msg}</div>}
      <div style={{ height: 10 }} />
      <button className="b" onClick={save}>Add {kind === 'income' ? 'Income' : kind === 'expense' ? 'Expense' : 'Transfer'}</button>
    </div>
  );
}

function StatementUploadView() {
  const { transactions, addTransactions } = useBusiness();
  const fileRef = useRef(null), csvRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null); // { rows, dupes, autoCount, reviewCount }

  // Debits (r.tx) are candidate expenses; credits (r.skipped, cr:true) are
  // candidate income - dropping credits entirely (the previous behaviour)
  // meant a statement import could never pick up an incoming client
  // payment, which is exactly what invoice-payment matching depends on.
  // A credit that looks like an internal/savings movement (flowKind) is
  // classified as a transfer instead, so it doesn't inflate income.
  function buildRows(debits, credits) {
    const seen = new Set(transactions.map(t => t.date + '|' + (+t.amount).toFixed(2) + '|' + (t.description || '')));
    const rows = [];
    let dupes = 0;

    debits.forEach(t => {
      if (seen.has(t.d + '|' + t.a.toFixed(2) + '|' + t.desc)) { dupes++; return; }
      // The shared parser only routes a debit into "skipped" (and so through
      // flowKind) when it matches its own SKIP list, which doesn't include
      // "transfer to savings/investment" wording - so a debit-side transfer
      // (e.g. moving money to the owner or another account) needs its own
      // check here, or it would silently land as a plain unreviewed expense.
      if (flowKind(t.desc, false) === 'savings-out') {
        rows.push({ date: t.d, description: t.desc, amount: t.a, kind: 'transfer', category: 'Transfer', status: 'reviewed', source: 'statement' });
        return;
      }
      const confident = t.c && t.c !== 'Uncategorised';
      rows.push({ date: t.d, description: t.desc, amount: t.a, kind: 'expense', category: t.c, status: confident ? 'reviewed' : 'needs_review', source: 'statement' });
    });
    credits.forEach(t => {
      if (seen.has(t.d + '|' + t.a.toFixed(2) + '|' + t.desc)) { dupes++; return; }
      const isTransfer = t.kind === 'savings-out' || t.kind === 'savings-in';
      rows.push({
        date: t.d, description: t.desc, amount: t.a, kind: isTransfer ? 'transfer' : 'income',
        category: isTransfer ? 'Transfer' : null, status: isTransfer ? 'reviewed' : 'needs_review', source: 'statement',
      });
    });

    const autoCount = rows.filter(r => r.status === 'reviewed').length;
    setPreview({ rows, dupes, autoCount, reviewCount: rows.length - autoCount });
  }

  async function handlePdf(f) {
    setMsg({ kind: 'i', text: `Reading ${f.name} …` }); setPreview(null);
    try {
      const r = await parsePdf(f, {}, []);
      const credits = r.skipped.filter(s => s.cr);
      if (!r.tx.length && !credits.length) return setMsg({ kind: 'e', text: 'No transactions found in that PDF.' });
      buildRows(r.tx, credits);
      setMsg(null);
    } catch (err) { setMsg({ kind: 'e', text: 'Could not read that PDF: ' + err.message }); }
  }
  async function handleCsv(f) {
    setMsg({ kind: 'i', text: `Reading ${f.name} …` }); setPreview(null);
    try {
      const text = await f.text();
      const r = parseCsv(text, {}, []);
      const credits = (r.skipped || []).filter(s => s.cr);
      if (r.error || (!r.tx.length && !credits.length)) return setMsg({ kind: 'e', text: r.error || 'No transactions found in that CSV.' });
      buildRows(r.tx, credits);
      setMsg(null);
    } catch (err) { setMsg({ kind: 'e', text: 'Could not read that CSV: ' + err.message }); }
  }

  async function commit() {
    if (!preview?.rows.length) return;
    await addTransactions(preview.rows);
    setMsg({ kind: 's', text: `${preview.rows.length} transactions imported. Review them under Transactions.` });
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
          <div className="infobox" style={{ marginTop: 10 }}>
            {preview.rows.length} transaction{preview.rows.length === 1 ? '' : 's'} found
            {preview.dupes > 0 && ` (${preview.dupes} already imported, skipped)`}
            <br />
            {preview.autoCount} categorised automatically{preview.reviewCount > 0 ? ` · ${preview.reviewCount} need review` : ''}
          </div>
          {preview.rows.length ? <button className="b" onClick={commit}>Import {preview.rows.length} transaction{preview.rows.length === 1 ? '' : 's'}</button>
            : <div className="mini">Nothing new to import.</div>}
        </>
      )}
    </div>
  );
}

export default function Money() {
  const { myRole } = useBusiness();
  const readOnly = myRole === 'accountant';
  const [seg, setSeg] = useState('transactions');
  const [filter, setFilter] = useState('all');
  const segs = readOnly ? ['transactions', 'income'] : ['transactions', 'income', 'add', 'statement'];

  return (
    <section className="tab on light-tab">
      <h1>Money</h1>
      {readOnly && <div className="infobox" style={{ marginBottom: 12 }}>You have accountant (view-only) access - review and export here, but logging transactions needs an owner or admin.</div>}
      <div className="seg">
        {segs.map(s => (
          <button key={s} className={seg === s ? 'on' : ''} onClick={() => setSeg(s)}>
            {{ transactions: 'Transactions', income: 'Income', add: 'Add', statement: 'Upload Statement' }[s]}
          </button>
        ))}
      </div>
      {seg === 'transactions' && <TransactionsView filter={filter} setFilter={setFilter} readOnly={readOnly} />}
      {seg === 'income' && <IncomeView />}
      {!readOnly && seg === 'add' && <AddTransactionForm />}
      {!readOnly && seg === 'statement' && <StatementUploadView />}
      <div style={{ height: 20 }} />
    </section>
  );
}
