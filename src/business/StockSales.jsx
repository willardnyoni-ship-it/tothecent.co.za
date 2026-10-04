import { useMemo, useRef, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { R2, iso } from '../lib/format.js';
import { recordSale } from '../lib/stockSales.js';

// The options a sale line can pick from: stock items and (if there are any)
// recipes / dishes. Value is "s:<id>" or "r:<id>".
export function useSaleOptions() {
  const { stockItems, recipes } = useBusiness();
  return useMemo(() => {
    const items = stockItems.filter(i => !i.archived).sort((a, b) => a.name.localeCompare(b.name));
    const dishes = recipes.filter(r => !r.archived).sort((a, b) => a.name.localeCompare(b.name));
    const find = ref => (ref.startsWith('r:') ? dishes.find(r => r.id === ref.slice(2)) : items.find(i => i.id === ref.slice(2)));
    const priceOf = ref => { const x = find(ref); return x ? +(ref.startsWith('r:') ? x.selling_price : x.sell_price) || 0 : 0; };
    return { items, dishes, find, priceOf };
  }, [stockItems, recipes]);
}

export function SaleOptionList({ opts }) {
  return (
    <>
      <option value="">Choose…</option>
      {opts.dishes.length > 0 && <optgroup label="Dishes & services">{opts.dishes.map(r => <option key={r.id} value={'r:' + r.id}>{r.name} - {R2(+r.selling_price)}</option>)}</optgroup>}
      <optgroup label="Stock items">{opts.items.map(i => <option key={i.id} value={'s:' + i.id}>{i.name} - {R2(+i.sell_price)} (have {+i.qty_on_hand})</option>)}</optgroup>
    </>
  );
}

// "Record sales": a quick tally of what was sold over the counter. It takes
// the stock (and a dish's ingredients) off the shelf, and can record the
// takings as income too.
export function StockSalesContent() {
  const { close } = useSheet();
  const { syncCfg, ensureToken } = useBudget();
  const { business, refreshAll, addTransaction, hasFeature } = useBusiness();
  const opts = useSaleOptions();
  const seq = useRef(0);
  const blank = () => ({ id: ++seq.current, ref: '', qty: '1', price: '' });
  const [lines, setLines] = useState([blank()]);
  const [income, setIncome] = useState(!hasFeature('cashup'));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  const setLine = (id, patch) => setLines(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)));
  const valid = lines.filter(l => l.ref && +l.qty > 0);
  const priceOf = l => (l.price === '' ? opts.priceOf(l.ref) : +l.price || 0);
  const revenue = valid.reduce((a, l) => a + (+l.qty) * priceOf(l), 0);

  async function save() {
    if (!valid.length) { setErr('Pick what was sold and how many.'); return; }
    setBusy(true); setErr('');
    try {
      const token = await ensureToken();
      const res = await recordSale(syncCfg, token, business.id, valid.map(l => ({
        stock_item_id: l.ref.startsWith('s:') ? l.ref.slice(2) : null, recipe_id: l.ref.startsWith('r:') ? l.ref.slice(2) : null, qty: +l.qty, price: priceOf(l),
      })), 'Sales tally');
      if (income && revenue > 0) {
        await addTransaction({ amount: Math.round(revenue * 100) / 100, kind: 'income', category: 'Sales', description: 'Counter sales (stock tally)', date: iso(new Date()), status: 'reviewed', source: 'stock' });
      }
      await refreshAll();
      setDone({ res, revenue, income: income && revenue > 0 });
    } catch (e) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  }

  if (done) {
    const low = done.res.touched.filter(t => t.low || t.negative);
    return (
      <>
        <div className="row"><h1>Sales recorded</h1><button className="b g sm" onClick={close}>Close</button></div>
        <div className="card">
          <div className="msg s" style={{ marginTop: 0 }}>Stock updated for {done.res.touched.length} item{done.res.touched.length === 1 ? '' : 's'}.{done.income ? ` ${R2(done.revenue)} added to Money as income.` : ''}</div>
          {low.length > 0 && <div className="msg e">{low.map(t => t.negative ? `${t.name} is now below zero (${t.after} ${t.unit}) - check your count.` : `${t.name} is running low (${t.after} ${t.unit} left).`).join(' ')}</div>}
          <div style={{ height: 10 }} />
          <button className="b" onClick={() => { setDone(null); setLines([blank()]); }}>Record more</button>
          <div style={{ height: 8 }} />
          <button className="b g" onClick={close}>Done</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="row"><h1>Record sales</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="mini" style={{ marginBottom: 10 }}>Tally what you sold. Stock - and a dish's ingredients - come off the shelf automatically.</div>
      {lines.map(l => (
        <div className="sc-line" key={l.id}>
          <div className="sc-top">
            <select value={l.ref} onChange={e => setLine(l.id, { ref: e.target.value, price: '' })}><SaleOptionList opts={opts} /></select>
            <button className="sc-x" aria-label="Remove" onClick={() => setLines(ls => (ls.length > 1 ? ls.filter(x => x.id !== l.id) : ls))}>&times;</button>
          </div>
          <div className="sc-nums two">
            <label>How many<input type="number" inputMode="decimal" value={l.qty} onChange={e => setLine(l.id, { qty: e.target.value })} /></label>
            <label>Price each (R)<input type="number" inputMode="decimal" value={l.price} placeholder={l.ref ? String(opts.priceOf(l.ref)) : ''} onChange={e => setLine(l.id, { price: e.target.value })} /></label>
          </div>
        </div>
      ))}
      <button className="b g" style={{ marginTop: 10 }} onClick={() => setLines(ls => [...ls, blank()])}>+ Add another</button>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ fontWeight: 700 }}><span>Total sold</span><span className="mono">{R2(revenue)}</span></div>
        <label className="chk" style={{ marginTop: 8 }}><input type="checkbox" checked={income} onChange={e => setIncome(e.target.checked)} /><span>Also record {R2(revenue)} as income in Money</span></label>
        <div className="mini">Untick if these sales are already in your daily cash-up or card machine feed, so they aren't counted twice.</div>
      </div>
      {err && <div className="msg e">{err}</div>}
      <div style={{ height: 10 }} />
      <button className="b" disabled={busy || !valid.length} onClick={save}>{busy ? 'Saving…' : 'Record sales'}</button>
      <div style={{ height: 16 }} />
    </>
  );
}

export function useStockSales() {
  const { open } = useSheet();
  return () => open(() => <StockSalesContent />);
}
