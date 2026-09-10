import { useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useSheet } from './Sheet.jsx';
import { useNav } from '../app/NavContext.jsx';
import { R2, uid, iso } from '../lib/format.js';
import { photoPut, photoUpload } from '../lib/photos.js';

export function ConfirmSlipContent({ r, thumb }) {
  const { S, update, syncCfg, ensureToken } = useBudget();
  const { close } = useSheet();
  const { go } = useNav();
  const [amt, setAmt] = useState(r.total != null ? String(r.total) : '');
  const [note, setNote] = useState(r.merchant || '');
  const [cat, setCat] = useState(r.cat || S.cats[0]?.n || '');
  const [date, setDate] = useState(r.date || iso(new Date()));
  const url = thumb ? URL.createObjectURL(thumb) : null;
  const rec = r.rec;

  async function save() {
    const a = parseFloat(amt);
    if (!a || a <= 0) return alert('Enter an amount greater than zero.');
    const pid = uid();
    try { if (thumb) await photoPut(pid, thumb); } catch (e) { console.warn('photo not stored', e); }
    if (thumb) photoUpload(pid, thumb, syncCfg, ensureToken);
    update(s => ({
      ...s,
      tx: [...s.tx, { id: uid(), mod: Date.now(), a, c: cat, note: note.trim(), d: date, src: 'slip', photo: pid, photoAt: Date.now(), items: r.items || [] }],
    }));
    close();
    go('today');
  }

  return (
    <>
      <div className="row"><h1>Check before saving</h1><button className="b g sm" onClick={close}>Cancel</button></div>
      {r.total == null
        ? <div className="warnbox" style={{ marginTop: 10 }}>No total found. Type the amount in.</div>
        : rec?.ok
          ? <div className="card" style={{ marginTop: 10, borderColor: 'var(--acc)' }}>
              <span className="ok" style={{ fontWeight: 700 }}>&#10003; Items add up to the total</span>
              <div className="mini" style={{ marginTop: 4 }}>{(r.items || []).length} items &middot; {R2(rec.sum)} vs printed {R2(r.total)}. This read is almost certainly right.</div>
            </div>
          : (r.items || []).length
            ? <div className="warnbox">Items come to {R2(rec.sum)} but the slip says {R2(r.total)} - out by {R2(Math.abs(rec.diff))}. Check the amount below.</div>
            : <div className="infobox">Read the total from {r.how}, but could not pick out individual items.</div>}
      {url && <img className="shot" style={{ marginTop: 12 }} src={url} alt="Slip" />}
      <label>Amount (R)</label>
      <input type="number" inputMode="decimal" step="0.01" value={amt} onChange={e => setAmt(e.target.value)} autoFocus={r.total == null} />
      <label>Where</label>
      <input value={note} onChange={e => setNote(e.target.value)} />
      <label>Category</label>
      <select value={cat} onChange={e => setCat(e.target.value)}>{S.cats.map(x => <option key={x.n}>{x.n}</option>)}</select>
      <label>Date</label>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      <div style={{ height: 14 }} />
      <button className="b" onClick={save}>Save slip</button>
      {r.text && (
        <details><summary>What the OCR actually read</summary><pre>{r.text.slice(0, 1400)}</pre></details>
      )}
    </>
  );
}

export function useConfirmSlip() {
  const { open } = useSheet();
  return (r, thumb) => open(() => <ConfirmSlipContent r={r} thumb={thumb} />);
}
