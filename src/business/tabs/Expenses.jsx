import { useMemo, useRef, useState } from 'react';
import { useBudget } from '../../store/BudgetStore.jsx';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { R2, iso, uid } from '../../lib/format.js';
import { readSlip } from '../../lib/readSlip.js';
import { uploadBusinessFile } from '../../lib/businessApi.js';
import { findExpenseMatches } from '../../lib/businessMath.js';

const CATEGORIES = ['Rent', 'Transport', 'Fuel', 'Telephone', 'Marketing', 'Equipment', 'Supplies', 'Salaries', 'Other'];

function AddExpenseForm({ prefill, onSaved }) {
  const { addExpense } = useBusiness();
  const [amt, setAmt] = useState(prefill?.total || '');
  const [cat, setCat] = useState(prefill?.cat || 'Other');
  const [desc, setDesc] = useState(prefill?.merchant || '');
  const [date, setDate] = useState(prefill?.date || iso(new Date()));
  const [msg, setMsg] = useState('');

  async function save() {
    const a = parseFloat(amt);
    if (!a || a <= 0) { setMsg('Enter an amount greater than zero.'); return; }
    await addExpense({
      amount: a, category: cat, description: desc, merchant: desc, date,
      status: 'needs_review', receipt_storage_path: prefill?.receiptPath || null,
      items: prefill?.items || null, vat: prefill?.vat || 0,
    });
    setMsg('Logged.');
    onSaved?.();
  }

  return (
    <div className="card">
      <label style={{ marginTop: 0 }}>Amount (R)</label>
      <input type="number" inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} />
      <label>Category</label>
      <select value={cat} onChange={e => setCat(e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
      <label>Description</label>
      <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Woolworths" />
      <label>Date</label>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      {msg && <div className="msg s">{msg}</div>}
      <div style={{ height: 10 }} />
      <button className="b" onClick={save}>Add Expense</button>
    </div>
  );
}

function ScanReceipt({ onDone }) {
  const { syncCfg, ensureToken } = useBudget();
  const { business } = useBusiness();
  const fileRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  async function handleFile(file) {
    setErr(''); setResult(null);
    setProgress({ pct: 2 });
    try {
      const { r, thumb } = await readSlip(file, (p, label) => setProgress({ pct: Math.round(p * 100), label }), syncCfg, ensureToken, {}, []);
      setProgress(null);
      let receiptPath = null;
      try {
        const token = await ensureToken();
        receiptPath = await uploadBusinessFile(syncCfg, token, business.id, uid() + '.jpg', thumb);
      } catch (e) { console.warn('receipt upload failed', e); }
      setResult({ ...r, receiptPath });
    } catch (e) {
      setProgress(null);
      setErr('Could not read that receipt: ' + e.message);
    }
  }

  if (result) return <AddExpenseForm prefill={result} onSaved={onDone} />;

  return (
    <div className="card">
      <div className="mini" style={{ marginBottom: 10 }}>Photograph the receipt - OCR pre-fills the expense for you to confirm.</div>
      <button className="b" onClick={() => fileRef.current?.click()}>&#128247; Scan Receipt</button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ''; }} />
      {progress && <div className="prog" style={{ display: 'block' }}><i style={{ width: progress.pct + '%' }} /></div>}
      {progress?.label && <div className="msg i">{progress.label}</div>}
      {err && <div className="msg e">{err}</div>}
    </div>
  );
}

export default function Expenses() {
  const { syncCfg } = useBudget();
  const { expenses, transactions, updateExpense, myRole } = useBusiness();
  const readOnly = myRole === 'accountant';
  const [seg, setSeg] = useState('all');

  const total = expenses.filter(e => e.status !== 'rejected').reduce((a, e) => a + +e.amount, 0);
  const matches = useMemo(() => findExpenseMatches(expenses, transactions), [expenses, transactions]);
  async function confirmMatch(m) { await updateExpense(m.expense.id, { matched_transaction_id: m.transaction.id }); }

  const shown = useMemo(() => {
    if (seg === 'receipts') return expenses.filter(e => e.receipt_storage_path);
    if (seg === 'mine') return expenses.filter(e => e.submitted_by === syncCfg.userId);
    if (seg === 'review') return expenses.filter(e => e.status === 'needs_review' || e.status === 'pending_approval');
    return expenses;
  }, [expenses, seg, syncCfg.userId]);

  async function approve(id) { await updateExpense(id, { status: 'approved' }); }
  async function reject(id) { await updateExpense(id, { status: 'rejected' }); }

  return (
    <section className="tab on light-tab">
      <h1>Expenses</h1>
      <div className="card"><div className="mini">Total Expenses</div><div className="mono" style={{ fontSize: 28, fontWeight: 800 }}>{R2(total)}</div></div>

      {readOnly && <div className="infobox">You have accountant (view-only) access - review and export here, but logging or approving expenses needs an owner or admin.</div>}

      {!readOnly && (
        <>
          <ScanReceipt onDone={() => {}} />
          <div style={{ height: 10 }} />
          <details><summary style={{ cursor: 'pointer', fontWeight: 700, padding: '4px 0' }}>Add expense manually</summary>
            <div style={{ marginTop: 10 }}><AddExpenseForm onSaved={() => {}} /></div>
          </details>
        </>
      )}

      {matches.length > 0 && (
        <>
          <h2>Possible bank matches</h2>
          {matches.map((m, i) => (
            <div className="infobox" key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>{m.expense.description || m.expense.merchant || 'Expense'} &middot; {R2(m.expense.amount)}{m.days > 0 ? ` · ${m.days}d apart` : ' · same day'}</div>
              {!readOnly && <button className="b sm" style={{ width: 'auto' }} onClick={() => confirmMatch(m)}>Match</button>}
            </div>
          ))}
        </>
      )}

      <div className="seg" style={{ marginTop: 16 }}>
        {['all', 'receipts', 'mine', 'review'].map(s => (
          <button key={s} className={seg === s ? 'on' : ''} onClick={() => setSeg(s)}>
            {{ all: 'All Expenses', receipts: 'Receipts', mine: 'My Expenses', review: 'Needs Review' }[s]}
          </button>
        ))}
      </div>
      <div className="card">
        <table><tbody>
          {shown.length ? shown.map(e => (
            <tr key={e.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{e.description || e.merchant || '(no description)'}</div>
                <div className="tag">{e.date} &middot; {e.category || 'Uncategorised'}</div>
              </td>
              <td className="r">
                {R2(e.amount)}
                {!readOnly && (e.status === 'needs_review' || e.status === 'pending_approval') && (
                  <div style={{ marginTop: 4 }}>
                    <a href="#" onClick={ev => { ev.preventDefault(); approve(e.id); }} style={{ color: 'var(--acc)', marginRight: 10 }}>Approve</a>
                    <a href="#" onClick={ev => { ev.preventDefault(); reject(e.id); }} style={{ color: 'var(--bad)' }}>Reject</a>
                  </div>
                )}
                {e.status === 'approved' && <div className="tag ok">approved</div>}
                {e.status === 'rejected' && <div className="tag" style={{ color: 'var(--bad)' }}>rejected</div>}
              </td>
            </tr>
          )) : <tr><td className="mini" colSpan={2}>No expenses yet.</td></tr>}
        </tbody></table>
      </div>
      <div style={{ height: 20 }} />
    </section>
  );
}
