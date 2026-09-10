import { useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useSheet } from './Sheet.jsx';
import { R2, esc } from '../lib/format.js';
import { merchantOf } from '../lib/categorize.js';
import { photoDel } from '../lib/photos.js';
import { useViewShot } from './ViewShotSheet.jsx';

export function EditTxSheetContent({ txId }) {
  const { S, editTx, deleteTx, update } = useBudget();
  const { close } = useSheet();
  const viewShot = useViewShot();
  const t = S.tx.find(x => String(x.id) === String(txId));
  const [amt, setAmt] = useState(t ? String(t.a) : '');
  const [cat, setCat] = useState(t ? t.c : '');
  const [note, setNote] = useState(t ? (t.note || '') : '');
  const [date, setDate] = useState(t ? t.d : '');
  const [rememberRule, setRememberRule] = useState(false);

  if (!t) return null;
  const m = merchantOf(t.note);

  function save() {
    const a = parseFloat(amt);
    if (!a || a <= 0) return alert('Enter an amount greater than zero.');
    const catChanged = cat !== t.c;
    editTx(t.id, { a, c: cat, note, d: date || t.d, userCat: catChanged || t.userCat });

    if (rememberRule && m && m !== '(bank fee)') {
      const k = m.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      update(s => ({
        ...s,
        rules: [...(s.rules || []).filter(r => r.k !== k), { k, c: cat }],
        tx: s.tx.map(x => (!x.userCat && merchantOf(x.note).toLowerCase() === k) ? { ...x, c: cat } : x),
      }));
    }
    close();
  }

  async function del() {
    if (t.photo) await photoDel(t.photo);
    deleteTx(t.id);
    close();
  }

  return (
    <>
      <div className="row"><h1>Edit</h1><button className="b g sm" onClick={close}>Cancel</button></div>
      <div className="sub">{t.note || '(no description)'}</div>
      {t.src === 'pdf' && <div className="mini" style={{ marginTop: 4 }}>From your bank statement</div>}
      <label>Amount (R)</label>
      <input type="number" inputMode="decimal" step="0.01" value={amt} onChange={e => setAmt(e.target.value)} />
      <label>Category</label>
      <select value={cat} onChange={e => setCat(e.target.value)}>
        {S.cats.map(c => <option key={c.n}>{c.n}</option>)}
      </select>
      <label>Description</label>
      <input value={note} onChange={e => setNote(e.target.value)} />
      <label>Date</label>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      {t.items && t.items.length > 0 && (
        <>
          <h2 style={{ marginBottom: 6 }}>What was on the slip</h2>
          <div className="card"><table><tbody>
            {t.items.map((i, idx) => <tr key={idx}><td>{i.d}</td><td className="r">{R2(i.a)}</td></tr>)}
            <tr><td className="mini">{t.items.length} items</td><td className="r mini">{R2(t.items.reduce((a, i) => a + i.a, 0))}</td></tr>
          </tbody></table></div>
        </>
      )}
      {m && m !== '(bank fee)' && (
        <div className="card" style={{ marginTop: 14, background: 'var(--card2)' }}>
          <label style={{ marginTop: 0 }}>Remember this</label>
          <div className="row">
            <input type="checkbox" style={{ width: 22, height: 22, flex: '0 0 auto' }} checked={rememberRule} onChange={e => setRememberRule(e.target.checked)} />
            <div className="mini" style={{ flex: 1 }}>Always put <b>{m}</b> in this category, including everything already imported.</div>
          </div>
        </div>
      )}
      <div style={{ height: 14 }} />
      <button className="b" onClick={save}>Save</button>
      <div style={{ height: 8 }} />
      {t.photo && <><button className="b g" onClick={() => viewShot(t.id)}>View slip photo</button><div style={{ height: 8 }} /></>}
      <button className="b d" onClick={del}>Delete transaction</button>
    </>
  );
}

export function useEditTx() {
  const { open } = useSheet();
  return (txId) => open(() => <EditTxSheetContent txId={txId} />);
}
