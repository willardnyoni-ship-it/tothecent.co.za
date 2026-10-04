import { useMemo, useRef, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { businessApi } from '../lib/businessApi.js';
import { R2, iso } from '../lib/format.js';
import { categoriesFor, costing, guessPack, matchItem, normaliseInvoice, unitsDiffer } from '../lib/stockInvoice.js';
import { readSupplierInvoice } from '../lib/stockScan.js';

const r2 = n => Math.round(n * 100) / 100;

const VAT_MODES = [['incl', 'Prices include VAT'], ['excl', 'VAT added on top'], ['none', 'No VAT']];

// Capture a delivery into Stock from a supplier invoice: scan or upload it
// (photo or PDF) or type the lines in. Each line is matched to an item you
// already stock - restocking it and updating its cost - or becomes a new item.
export function StockCaptureContent() {
  const { close } = useSheet();
  const { syncCfg, ensureToken } = useBudget();
  const { business, stockItems, refreshAll, hasFeature } = useBusiness();
  const items = useMemo(() => stockItems.filter(i => !i.archived), [stockItems]);
  const vatRegistered = hasFeature('vat');
  const cats = useMemo(() => [...new Set([...items.map(i => i.category).filter(Boolean), ...categoriesFor(business.business_profile)])], [items, business.business_profile]);

  const [step, setStep] = useState('choose'); // choose | review | done
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState('');
  const [head, setHead] = useState({ supplier: '', reference: '', date: iso(new Date()) });
  const [vatMode, setVatMode] = useState('incl');
  const [lines, setLines] = useState([]);
  const [expense, setExpense] = useState(true);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const seq = useRef(0);
  const fileRef = useRef(null);

  const blank = () => ({ id: ++seq.current, description: '', qty: '1', unit: 'each', price: '', match: 'new', pinned: false, category: '', sell: '', per: '' });
  const withMatch = l => {
    const m = matchItem(l.description, items);
    const pack = m && unitsDiffer(l.unit, m.item.unit) ? guessPack(l.description) : 0;
    return { ...l, match: m ? m.item.id : 'new', category: m && m.item.category ? m.item.category : l.category, per: pack ? String(pack) : '' };
  };

  async function onFile(file) {
    if (!file) return;
    setErr(''); setReading(true);
    try {
      const n = normaliseInvoice(await readSupplierInvoice(file, syncCfg, ensureToken));
      setHead({ supplier: n.supplier, reference: n.reference, date: n.date || iso(new Date()) });
      setVatMode(n.vatMode);
      setLines(n.lines.map(l => withMatch({ ...blank(), description: l.description, qty: String(l.qty), unit: l.unit, price: String(l.price) })));
      setStep('review');
    } catch (e) { setErr(e.message); } finally { setReading(false); }
  }
  function typeIn() { setLines([blank()]); setStep('review'); }

  const setLine = (id, patch) => setLines(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)));
  const valid = lines.filter(l => l.description.trim() && +l.qty > 0);
  const c = costing(valid.map(l => ({ qty: +l.qty, price: +l.price || 0 })), vatMode, vatRegistered);
  // Invoice says "box", stock counts "each": one box = `per` of them.
  const itemOf = l => (l.match === 'new' ? null : items.find(i => i.id === l.match));
  const per = l => { const it = itemOf(l); return it && unitsDiffer(l.unit, it.unit) && +l.per > 0 ? +l.per : 1; };
  const qtyIn = l => (+l.qty || 0) * per(l);
  const stockUnit = l => r2(c.stockUnit({ price: +l.price || 0 }) / per(l));

  async function save() {
    if (!valid.length) { setErr('Add at least one line with a name and a quantity.'); return; }
    setBusy(true); setErr('');
    try {
      const token = await ensureToken();
      const biz = business.id, date = head.date || iso(new Date());
      const fresh = valid.filter(l => l.match === 'new');
      const created = fresh.length ? await businessApi.insert(syncCfg, token, 'stock_items', fresh.map(l => ({
        business_id: biz, name: l.description.trim(), category: l.category.trim() || null, unit: l.unit.trim() || 'each',
        qty_on_hand: qtyIn(l), reorder_level: 0, cost_price: stockUnit(l), sell_price: +l.sell || 0,
      }))) : [];
      const idFor = new Map(fresh.map((l, i) => [l.id, created[i].id]));

      // Restock the items you already have (one update per item, even if it's on two lines).
      const restock = new Map();
      valid.filter(l => l.match !== 'new').forEach(l => {
        const cur = restock.get(l.match) || { qty: 0, cost: null, category: '' };
        cur.qty += qtyIn(l); if (+l.price > 0) cur.cost = stockUnit(l); if (l.category.trim()) cur.category = l.category.trim();
        restock.set(l.match, cur);
      });
      await Promise.all([...restock.entries()].map(([itemId, r]) => {
        const it = items.find(i => i.id === itemId);
        const patch = { qty_on_hand: +it.qty_on_hand + r.qty };
        if (r.cost != null) patch.cost_price = r.cost;
        if (!it.category && r.category) patch.category = r.category;
        return businessApi.update(syncCfg, token, 'stock_items', `id=eq.${itemId}`, patch);
      }));

      await businessApi.insert(syncCfg, token, 'stock_movements', valid.map(l => ({
        business_id: biz, item_id: l.match === 'new' ? idFor.get(l.id) : l.match, date, qty_change: qtyIn(l), reason: 'purchase', unit_price: stockUnit(l),
        note: head.reference ? 'Invoice ' + head.reference : 'Supplier invoice', supplier: head.supplier.trim() || null, reference: head.reference.trim() || null,
      })));

      if (expense && c.total > 0) {
        await businessApi.insert(syncCfg, token, 'expenses', [{
          business_id: biz, amount: c.total, category: 'Stock purchases', date, status: 'approved', merchant: head.supplier.trim() || null,
          description: 'Stock' + (head.supplier.trim() ? ' - ' + head.supplier.trim() : '') + (head.reference.trim() ? ' (' + head.reference.trim() + ')' : ''),
          vat: vatRegistered ? c.vat : 0,
        }]);
      }
      await refreshAll();
      setSummary({ added: fresh.length, restocked: restock.size, total: c.total, expense: expense && c.total > 0 });
      setStep('done');
    } catch (e) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  }

  if (step === 'done') {
    return (
      <>
        <div className="row"><h1>Stock captured</h1><button className="b g sm" onClick={close}>Close</button></div>
        <div className="card">
          <div className="msg s" style={{ marginTop: 0 }}>
            {summary.added > 0 && <>{summary.added} new item{summary.added === 1 ? '' : 's'} added. </>}
            {summary.restocked > 0 && <>{summary.restocked} existing item{summary.restocked === 1 ? '' : 's'} restocked, with the latest cost. </>}
            {summary.expense && <>{R2(summary.total)} recorded under Expenses as Stock purchases.</>}
          </div>
          <div style={{ height: 10 }} />
          <button className="b" onClick={() => { setStep('choose'); setLines([]); setHead({ supplier: '', reference: '', date: iso(new Date()) }); setErr(''); }}>Capture another invoice</button>
          <div style={{ height: 8 }} />
          <button className="b g" onClick={close}>Done</button>
        </div>
      </>
    );
  }

  if (step === 'choose') {
    return (
      <>
        <div className="row"><h1>Capture an invoice</h1><button className="b g sm" onClick={close}>Close</button></div>
        <div className="mini" style={{ marginBottom: 12 }}>Got a delivery? Add it to stock straight from the supplier's invoice - no typing each line.</div>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; e.target.value = ''; onFile(f); }} />
        <button className="sc-choice" disabled={reading} onClick={() => fileRef.current && fileRef.current.click()}>
          <b>{reading ? 'Reading your invoice…' : 'Scan or upload an invoice'}</b>
          <span>{reading ? 'This takes a few seconds.' : 'Take a photo or choose a PDF. We read the lines, match them to your stock, and you check them before anything is saved.'}</span>
        </button>
        <button className="sc-choice" disabled={reading} onClick={typeIn}>
          <b>Type it in</b>
          <span>Enter the lines yourself - handy for a handwritten note or a delivery with no invoice yet.</span>
        </button>
        {err && <div className="msg e">{err}</div>}
      </>
    );
  }

  return (
    <>
      <div className="row"><h1>Check the invoice</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="card">
        <div className="biz-grid">
          <div><label style={{ marginTop: 0 }}>Supplier</label><input value={head.supplier} onChange={e => setHead({ ...head, supplier: e.target.value })} placeholder="e.g. Makro" /></div>
          <div><label style={{ marginTop: 0 }}>Invoice no.</label><input value={head.reference} onChange={e => setHead({ ...head, reference: e.target.value })} /></div>
        </div>
        <label>Date</label><input type="date" value={head.date} onChange={e => setHead({ ...head, date: e.target.value })} />
        <label>VAT on this invoice</label>
        <div className="seg" style={{ margin: 0 }}>{VAT_MODES.map(([k, l]) => <button key={k} className={vatMode === k ? 'on' : ''} onClick={() => setVatMode(k)}>{l}</button>)}</div>
        {vatMode !== 'none' && !vatRegistered && <div className="mini" style={{ marginTop: 6 }}>You're not VAT-registered, so the VAT is part of what you paid and is included in each item's cost.</div>}
      </div>

      {lines.map(l => {
        const m = l.match === 'new' ? null : items.find(i => i.id === l.match);
        return (
          <div className="sc-line" key={l.id}>
            <div className="sc-top">
              <input value={l.description} placeholder="Item as on the invoice" onChange={e => setLine(l.id, { description: e.target.value })}
                onBlur={() => { if (!l.pinned && l.description.trim()) setLines(ls => ls.map(x => (x.id === l.id ? withMatch(x) : x))); }} />
              <button className="sc-x" aria-label="Remove line" onClick={() => setLines(ls => ls.filter(x => x.id !== l.id))}>&times;</button>
            </div>
            <div className="sc-nums">
              <label>Qty<input type="number" inputMode="decimal" value={l.qty} onChange={e => setLine(l.id, { qty: e.target.value })} /></label>
              <label>Unit<input value={l.unit} onChange={e => setLine(l.id, { unit: e.target.value })} /></label>
              <label>Price each (R)<input type="number" inputMode="decimal" value={l.price} onChange={e => setLine(l.id, { price: e.target.value })} /></label>
            </div>
            <label className="sc-match">Goes to
              <select value={l.match} onChange={e => setLine(l.id, { match: e.target.value, pinned: true, ...(e.target.value !== 'new' ? { category: (items.find(i => i.id === e.target.value) || {}).category || l.category } : {}) })}>
                <option value="new">+ New item</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.name} (have {+i.qty_on_hand})</option>)}
              </select>
            </label>
            {l.match === 'new' ? (
              <div className="sc-nums two">
                <label>Category<input list="sc-cats" value={l.category} onChange={e => setLine(l.id, { category: e.target.value })} placeholder="e.g. Drinks" /></label>
                <label>Selling price (R)<input type="number" inputMode="decimal" value={l.sell} onChange={e => setLine(l.id, { sell: e.target.value })} placeholder="optional" /></label>
              </div>
            ) : (
              <>
              {m && unitsDiffer(l.unit, m.unit) && (
                <label className="sc-match">How many {m.unit} in one {l.unit || 'unit'}?
                  <input type="number" inputMode="numeric" value={l.per} onChange={e => setLine(l.id, { per: e.target.value })} placeholder={`e.g. 20 (you count ${m.name} in ${m.unit})`} />
                </label>
              )}
              <div className="mini">{m ? `${m.name}: ${+m.qty_on_hand} → ${+m.qty_on_hand + qtyIn(l)} ${m.unit}` : ''}{+l.price > 0 && m && Math.abs(stockUnit(l) - +m.cost_price) > 0.005 ? ` · cost ${R2(+m.cost_price)} → ${R2(stockUnit(l))}` : ''}</div>
              </>
            )}
            <div className="sc-sum">Line total {R2(c.lineTotal({ qty: +l.qty || 0, price: +l.price || 0 }))}</div>
          </div>
        );
      })}
      <datalist id="sc-cats">{cats.map(x => <option key={x} value={x} />)}</datalist>
      <button className="b g" onClick={() => setLines(ls => [...ls, blank()])}>+ Add a line</button>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row"><span className="mini">Subtotal</span><span className="mono">{R2(c.subtotal)}</span></div>
        {vatMode !== 'none' && <div className="row"><span className="mini">VAT (15%)</span><span className="mono">{R2(c.vat)}</span></div>}
        <div className="row" style={{ fontWeight: 700 }}><span>Total</span><span className="mono">{R2(c.total)}</span></div>
        <label className="chk" style={{ marginTop: 10 }}><input type="checkbox" checked={expense} onChange={e => setExpense(e.target.checked)} />
          <span>Also record {R2(c.total)} as an expense (Stock purchases)</span></label>
        <div className="mini">Untick if you've already added this purchase from your bank statement or Expenses.</div>
      </div>

      {err && <div className="msg e">{err}</div>}
      <div style={{ height: 10 }} />
      <button className="b" disabled={busy || !valid.length} onClick={save}>{busy ? 'Saving…' : `Add ${valid.length} line${valid.length === 1 ? '' : 's'} to stock`}</button>
      <div style={{ height: 8 }} />
      <button className="b g" onClick={() => { setStep('choose'); setErr(''); }}>Back</button>
      <div style={{ height: 16 }} />
    </>
  );
}

export function useStockCapture() {
  const { open } = useSheet();
  return () => open(() => <StockCaptureContent />);
}
