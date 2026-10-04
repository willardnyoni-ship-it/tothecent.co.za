import { useState } from 'react';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { R2, vatOf } from '../lib/format.js';
import { RULES } from '../lib/categorize.js';

// Business categories offered when reviewing a bank transaction: the ones
// the statement reader already assigns, plus the usual business ones.
const EXPENSE_CATEGORIES = [...new Set([
  'Rent', 'Transport', 'Fuel', 'Telephone', 'Marketing', 'Equipment', 'Supplies', 'Materials',
  'Stock purchases', 'Salaries', 'Bank fees', 'Insurance', 'Professional fees', 'Repairs & maintenance',
  ...RULES.map(r => r[1]).filter(c => c !== 'Transfers to people'),
  'Other',
])];
const INCOME_CATEGORIES = ['Sales', 'Services', 'Deposit', 'Other income'];

const round2 = n => Math.round(n * 100) / 100;

export function TransactionContent({ transactionId }) {
  const { close } = useSheet();
  const { transactions, updateTransaction, myRole } = useBusiness();
  const readOnly = myRole === 'accountant';
  const t = transactions.find(x => x.id === transactionId);
  const amount = +(t?.amount || 0);
  const [category, setCategory] = useState(t?.category || '');
  // 'yes' | 'no' | '' (not decided yet)
  const [vatChoice, setVatChoice] = useState(t?.vat_amount == null ? '' : +t.vat_amount > 0 ? 'yes' : 'no');
  const [vatText, setVatText] = useState(t?.vat_amount > 0 ? String(t.vat_amount) : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!t) return null;

  const isIncome = t.kind === 'income';
  const isTransfer = t.kind === 'transfer';
  const cats = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  // A category the reader chose that isn't in the list still needs an option.
  const options = category && !cats.includes(category) ? [category, ...cats] : cats;
  const autoVat = round2(vatOf(amount));
  const vatValue = vatChoice === 'yes' ? (vatText === '' ? autoVat : parseFloat(vatText) || 0) : vatChoice === 'no' ? 0 : null;

  function pickVat(v) {
    setVatChoice(v);
    if (v === 'yes' && vatText === '') setVatText(autoVat.toFixed(2));
  }

  async function save(markReviewed) {
    if (vatChoice === 'yes' && (!(vatValue > 0) || vatValue > amount)) { setMsg('The VAT must be more than R0 and no more than the amount.'); return; }
    setBusy(true); setMsg('');
    try {
      const patch = { category: category || null, vat_amount: isTransfer ? null : vatValue };
      if (markReviewed) patch.status = 'reviewed';
      await updateTransaction(t.id, patch);
      close();
    } catch (e) { setMsg(e.message || 'Could not save.'); setBusy(false); }
  }

  return (
    <>
      <div className="row"><h1>Transaction</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="card">
        <div style={{ fontWeight: 600 }}>{t.description || '(no description)'}</div>
        <div className="mini">{t.date} &middot; {{ income: 'Income', expense: 'Expense', transfer: 'Transfer' }[t.kind] || t.kind}</div>
        <div className="mono" style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
          <span className={isIncome ? 'ok' : t.kind === 'expense' ? 'bd' : ''}>{isIncome ? '+' : t.kind === 'expense' ? '-' : ''}{R2(amount)}</span>
        </div>
      </div>

      {isTransfer ? (
        <div className="infobox" style={{ marginTop: 12 }}>This is money moved between your own accounts, so it has no category or VAT.</div>
      ) : (
        <div className="card" style={{ marginTop: 12 }}>
          <label style={{ marginTop: 0 }}>Category</label>
          <select value={category} disabled={readOnly} onChange={e => setCategory(e.target.value)}>
            <option value="">Uncategorised</option>
            {options.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <label>{isIncome ? 'Does this payment include VAT?' : 'Does this include VAT?'}</label>
          <div className="seg" style={{ margin: 0 }}>
            <button className={vatChoice === 'yes' ? 'on' : ''} disabled={readOnly} onClick={() => pickVat('yes')}>Yes, includes VAT</button>
            <button className={vatChoice === 'no' ? 'on' : ''} disabled={readOnly} onClick={() => pickVat('no')}>No VAT</button>
          </div>
          {vatChoice === 'yes' && (
            <>
              <label>VAT amount (R)</label>
              <input type="number" inputMode="decimal" step="0.01" value={vatText} disabled={readOnly} onChange={e => setVatText(e.target.value)} />
              <div className="mini" style={{ marginTop: 4 }}>
                15% VAT inside {R2(amount)} is {R2(autoVat)}. Excluding VAT: {R2(amount - (vatValue || 0))}. Change the amount if the slip or invoice shows something different.
              </div>
            </>
          )}
          {vatChoice === '' && <div className="mini" style={{ marginTop: 6 }}>Not decided yet. If you're VAT-registered, choose one so it counts correctly in your VAT return.</div>}
          {vatChoice === 'no' && <div className="mini" style={{ marginTop: 6 }}>{isIncome ? 'Nothing is added to the VAT you owe.' : 'No VAT will be claimed back on this.'}</div>}
        </div>
      )}

      {msg && <div className="msg e">{msg}</div>}
      {!readOnly && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {t.status === 'needs_review' && <button className="b" disabled={busy} onClick={() => save(true)}>Save &amp; mark reviewed</button>}
          <button className={t.status === 'needs_review' ? 'b g' : 'b'} disabled={busy} onClick={() => save(false)}>Save</button>
        </div>
      )}
      <div style={{ height: 16 }} />
    </>
  );
}

export function useTransactionSheet() {
  const { open } = useSheet();
  return (transactionId) => open(() => <TransactionContent transactionId={transactionId} />);
}
