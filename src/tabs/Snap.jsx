import { useEffect, useRef, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useNav } from '../app/NavContext.jsx';
import { R2, iso, uid } from '../lib/format.js';
import { readSlip } from '../lib/readSlip.js';
import { useConfirmSlip } from '../components/ConfirmSlipSheet.jsx';

const VAT_RATE = 0.15;
const vatOf = total => total * VAT_RATE / (1 + VAT_RATE);

export default function Snap() {
  const { S, addTx, syncCfg, ensureToken } = useBudget();
  const { snapAction, setSnapAction } = useNav();
  const confirmSlip = useConfirmSlip();
  const camRef = useRef(null), galRef = useRef(null), amtRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [progress, setProgress] = useState(null); // {pct, label} | null

  const [amt, setAmt] = useState('');
  const [tip, setTip] = useState('');
  const [cat, setCat] = useState(S.cats[0]?.n || '');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(iso(new Date()));
  const [vat, setVat] = useState(true);

  // One-shot instruction from Home/Receipts' Quick actions.
  useEffect(() => {
    if (snapAction === 'camera') { camRef.current?.click(); setSnapAction(null); }
    else if (snapAction === 'focus-amount') {
      amtRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => amtRef.current?.focus(), 300);
      setSnapAction(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapAction]);

  async function handleFile(file) {
    setProgress({ pct: 2, label: null });
    const onProg = (p, label) => setProgress({ pct: Math.round(p * 100), label });
    try {
      const { r, thumb } = await readSlip(file, onProg, syncCfg, ensureToken, S.memory, S.rules);
      setProgress(null);
      if (!r.readable) setMsg({ kind: 'wn', text: 'Could not read that slip clearly - check the amount before saving.' });
      confirmSlip(r, thumb);
    } catch (err) {
      setProgress(null);
      setMsg({ kind: 'e', text: 'Could not read that image: ' + err.message });
    }
  }

  const amtN = parseFloat(amt) || 0, tipN = parseFloat(tip) || 0;
  const total = Math.round((amtN + tipN) * 100) / 100;
  const vatAmt = vat ? Math.round(vatOf(amtN) * 100) / 100 : 0;

  function quick(s) {
    addTx({ a: s.a, c: s.c, note: s.l, d: iso(new Date()), src: 'quick' });
    setMsg({ kind: 's', text: `${s.l} - ${R2(s.a)} logged` });
  }

  function saveManual() {
    if (!total || total <= 0) { setMsg({ kind: 'e', text: 'Enter an amount greater than zero.' }); return; }
    const rec = { a: total, c: cat, note, d: date || iso(new Date()), src: 'manual' };
    if (tipN) rec.tip = tipN;
    if (vatAmt) rec.vat = vatAmt;
    addTx(rec);
    setAmt(''); setNote(''); setTip('');
    setMsg({ kind: 's', text: 'Logged ' + R2(total) + (tipN ? ` (incl. ${R2(tipN)} tip)` : '') });
  }

  return (
    <section className="tab on light-tab" id="t-snap">
      <h1>Capture a slip</h1>
      <div className="sub">Photograph the till slip. Signed out, it is read entirely on your phone. Signed in, it is
        read with better accuracy on our server, falling back to on-device reading if that's ever unavailable &mdash;
        and a private copy is kept in your account, visible only to you. Deleted automatically 45 days after it is
        taken, on every device and in your account either way.</div>

      <div style={{ height: 12 }} />
      <div className="cap">
        <button className="b" onClick={() => camRef.current?.click()}>&#128247; Camera</button>
        <button className="b g" onClick={() => galRef.current?.click()}>Gallery</button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ''; }} />
      <input ref={galRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ''; }} />

      {msg && <div className={'msg ' + msg.kind}>{msg.text}</div>}
      {progress && <div className="prog" style={{ display: 'block' }}><i style={{ width: progress.pct + '%' }} /></div>}
      {progress?.label && <div className="msg i">{progress.label}</div>}

      <h2>Quick log &mdash; no photo</h2>
      <div className="card">
        <div className="chips">
          {(S.shortcuts || []).map((s, i) => (
            <button className="chip" key={i} onClick={() => quick(s)}>{s.l} <span style={{ color: 'var(--dim)' }}>R{s.a}</span></button>
          ))}
        </div>
      </div>

      <h2>Manual entry</h2>
      <div className="card">
        <label>Amount (R)</label>
        <input ref={amtRef} type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value)} />
        <label>Tip (R)</label>
        <input type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={tip} onChange={e => setTip(e.target.value)} />
        <label>Category</label>
        <select value={cat} onChange={e => setCat(e.target.value)}>{S.cats.map(c => <option key={c.n}>{c.n}</option>)}</select>
        <label>Where / what</label>
        <input placeholder="e.g. Coffee Craft" value={note} onChange={e => setNote(e.target.value)} />
        <label>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <label className="chk"><input type="checkbox" checked={vat} onChange={e => setVat(e.target.checked)} /><span>Price includes 15% VAT</span></label>
        <div className="mini">
          {total > 0 && <>Total {R2(total)}{tipN ? `  ·  tip ${R2(tipN)}` : ''}{vatAmt ? `  ·  includes ${R2(vatAmt)} VAT` : ''}</>}
        </div>
        <div style={{ height: 14 }} />
        <button className="b" onClick={saveManual}>Add spend</button>
      </div>
      <div style={{ height: 20 }} />
    </section>
  );
}
