import { useState } from 'react';
import { useBusiness } from '../store/BusinessStore.jsx';
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

// A compact editor that opens under a transaction row: category and VAT.
export default function TransactionEditor({ tx, onDone }) {
  const { updateTransaction } = useBusiness();
  const amount = +tx.amount || 0;
  const isIncome = tx.kind === 'income';
  const [category, setCategory] = useState(tx.category || '');
  // 'yes' | 'no' | '' (not decided yet)
  const [vat, setVat] = useState(tx.vat_amount == null ? '' : +tx.vat_amount > 0 ? 'yes' : 'no');
  const [vatText, setVatText] = useState(+tx.vat_amount > 0 ? String(tx.vat_amount) : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const cats = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const options = category && !cats.includes(category) ? [category, ...cats] : cats;
  const autoVat = round2(vatOf(amount));
  const vatValue = vat === 'yes' ? (vatText === '' ? autoVat : parseFloat(vatText) || 0) : vat === 'no' ? 0 : null;

  function pickVat(v) {
    setVat(v);
    if (v === 'yes' && vatText === '') setVatText(autoVat.toFixed(2));
  }

  async function save(markReviewed) {
    if (vat === 'yes' && (!(vatValue > 0) || vatValue > amount)) { setMsg('VAT must be more than R0 and no more than the amount.'); return; }
    setBusy(true); setMsg('');
    try {
      const patch = { category: category || null, vat_amount: vatValue };
      if (markReviewed) patch.status = 'reviewed';
      await updateTransaction(tx.id, patch);
      onDone();
    } catch (e) { setMsg(e.message || 'Could not save.'); setBusy(false); }
  }

  return (
    <div className="txed" onClick={e => e.stopPropagation()}>
      <div className="txed-grid">
        <label>Category
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Uncategorised</option>
            {options.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="txed-vat">
          <span>Includes VAT?</span>
          <div role="group" aria-label="Includes VAT">
            <button type="button" className={vat === 'yes' ? 'on' : ''} onClick={() => pickVat('yes')}>Yes</button>
            <button type="button" className={vat === 'no' ? 'on' : ''} onClick={() => pickVat('no')}>No</button>
          </div>
        </div>
      </div>
      {vat === 'yes' && (
        <div className="txed-note">
          VAT R <input type="number" inputMode="decimal" step="0.01" value={vatText} onChange={e => setVatText(e.target.value)} aria-label="VAT amount" />
          <span>excl. VAT {R2(amount - (vatValue || 0))}</span>
        </div>
      )}
      {msg && <div className="txed-err">{msg}</div>}
      <div className="txed-act">
        <button type="button" className="lnk" onClick={onDone}>Cancel</button>
        {tx.status === 'needs_review'
          ? (
            <>
              <button type="button" className="sec" disabled={busy} onClick={() => save(false)}>Save</button>
              <button type="button" className="pri" disabled={busy} onClick={() => save(true)}>Save &amp; reviewed</button>
            </>
          )
          : <button type="button" className="pri" disabled={busy} onClick={() => save(false)}>Save</button>}
      </div>
    </div>
  );
}
