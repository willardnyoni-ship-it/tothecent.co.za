import { useMemo, useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { useSheet } from '../../components/Sheet.jsx';
import { R, R2, iso } from '../../lib/format.js';
import { categoriesFor } from '../../lib/stockInvoice.js';
import { useStockCapture } from '../StockCapture.jsx';
import { useStockSales } from '../StockSales.jsx';
import Recipes, { costingWords } from '../Recipes.jsx';
import { priceForMargin } from '../../lib/recipeMath.js';

const ACTIONS = {
  purchase: { label: 'Stock in', verb: 'Received', sign: 1, priceLabel: 'Cost per unit (R)' },
  sale: { label: 'Sold', verb: 'Sold', sign: -1, priceLabel: 'Selling price per unit (R)' },
  waste: { label: 'Waste', verb: 'Wasted / damaged', sign: -1, priceLabel: null },
  adjust: { label: 'Count', verb: 'Counted', sign: 0, priceLabel: null },
};

export const isLow = it => +it.reorder_level > 0 && +it.qty_on_hand <= +it.reorder_level;

// A cell that starts with = + - or @ would be run as a formula when the file
// is opened in Excel; a leading apostrophe makes it plain text.
const csvCell = v => {
  let t = String(v ?? '');
  if (/^[=+\-@]/.test(t) && isNaN(Number(t))) t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
};
function downloadStockCsv(items, name) {
  const rows = [['Item', 'Category', 'SKU', 'Unit', 'On hand', 'Reorder level', 'Needs reorder', 'Cost price (R)', 'Selling price (R)', 'Stock value at cost (R)', 'Margin %']]
    .concat(items.map(i => {
      const cost = +i.cost_price || 0, sell = +i.sell_price || 0;
      return [i.name, i.category || '', i.sku || '', i.unit, +i.qty_on_hand, +i.reorder_level || 0, isLow(i) ? 'Yes' : 'No', cost.toFixed(2), sell.toFixed(2),
        (Math.max(0, +i.qty_on_hand) * cost).toFixed(2), sell > 0 ? (((sell - cost) / sell) * 100).toFixed(1) : ''];
    }));
  // The leading BOM makes Excel read accents and symbols correctly.
  const blob = new Blob(['\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}

function StockItemContent({ itemId }) {
  const { close } = useSheet();
  const { business, stockItems, stockMovements, addRow, updateRow, addExpense, addTransaction, myRole } = useBusiness();
  const readOnly = myRole === 'accountant';
  const item = stockItems.find(i => i.id === itemId);
  const [action, setAction] = useState('purchase');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [record, setRecord] = useState(true);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(item || {});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  if (!item) return null;
  const a = ACTIONS[action];
  const unitPrice = price === '' ? (action === 'sale' ? +item.sell_price : +item.cost_price) : +price;
  const moves = stockMovements.filter(m => m.item_id === item.id).slice(0, 30);
  // "8 Coca-Cola 2L", "3 kg Flour" - 'each' adds nothing to a description.
  const qtyText = q => q + ' ' + (item.unit && item.unit !== 'each' ? item.unit + ' ' : '') + item.name;

  async function apply() {
    const q = +qty;
    if (!(q >= 0) || (action !== 'adjust' && !(q > 0))) { setMsg({ e: true, t: 'Enter a quantity.' }); return; }
    setBusy(true); setMsg(null);
    try {
      // A count sets the shelf quantity to what was actually counted; the
      // movement records the difference so the history still adds up.
      const change = action === 'adjust' ? q - +item.qty_on_hand : a.sign * q;
      await addRow('stock_movements', { item_id: item.id, date: iso(new Date()), qty_change: change, reason: action, unit_price: a.priceLabel ? unitPrice : +item.cost_price, note: note || null });
      const patch = { qty_on_hand: +item.qty_on_hand + change };
      if (action === 'purchase' && price !== '') patch.cost_price = unitPrice;
      await updateRow('stock_items', item.id, patch);
      if (record && action === 'purchase' && unitPrice > 0) {
        await addExpense({ amount: +(q * unitPrice).toFixed(2), category: 'Stock purchases', description: qtyText(q), merchant: note || null, date: iso(new Date()), status: 'approved', vat: 0 });
      }
      if (record && action === 'sale' && unitPrice > 0) {
        await addTransaction({ amount: +(q * unitPrice).toFixed(2), kind: 'income', category: 'Sales', description: 'Sold ' + qtyText(q), date: iso(new Date()), status: 'reviewed', source: 'stock' });
      }
      setQty(''); setPrice(''); setNote('');
      setMsg({ t: `${a.verb} ${q} ${item.unit}.` });
    } catch (e) { setMsg({ e: true, t: e.message }); } finally { setBusy(false); }
  }

  async function saveEdit() {
    setBusy(true);
    try {
      await updateRow('stock_items', item.id, {
        name: fields.name, category: (fields.category || '').trim() || null, sku: fields.sku || null, unit: fields.unit || 'each',
        reorder_level: +fields.reorder_level || 0, cost_price: +fields.cost_price || 0, sell_price: +fields.sell_price || 0,
      });
      setEditing(false);
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="row"><h1>{item.name}</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">On hand</div><div className={'val' + (isLow(item) ? ' bd' : '')}>{+item.qty_on_hand} {item.unit}</div></div>
        <div className="biz-card"><div className="lbl">Value at cost</div><div className="val">{R(+item.qty_on_hand * +item.cost_price)}</div></div>
      </div>
      {isLow(item) && <div className="msg e">Running low - reorder level is {+item.reorder_level} {item.unit}.</div>}

      {!readOnly && (
        <div className="card">
          <div className="seg">
            {Object.entries(ACTIONS).map(([k, v]) => <button key={k} className={action === k ? 'on' : ''} onClick={() => { setAction(k); setPrice(''); }}>{v.label}</button>)}
          </div>
          <label style={{ marginTop: 0 }}>{action === 'adjust' ? `How many ${item.unit} are actually on the shelf?` : `Quantity (${item.unit})`}</label>
          <input type="number" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} />
          {a.priceLabel && (
            <>
              <label>{a.priceLabel}</label>
              <input type="number" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder={String(action === 'sale' ? +item.sell_price : +item.cost_price)} />
              <label className="chk"><input type="checkbox" checked={record} onChange={e => setRecord(e.target.checked)} />
                <span>{action === 'purchase' ? 'Also add this to Expenses' : 'Also add this sale to Money'}</span></label>
              {action === 'sale' && <div className="mini">Untick if this sale is already in a cash-up or bank statement, so it isn't counted twice.</div>}
            </>
          )}
          <label>Note <span className="mini">(optional)</span></label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={action === 'purchase' ? 'Supplier' : action === 'waste' ? 'e.g. expired, broken' : ''} />
          {msg && <div className={'msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
          <div style={{ height: 8 }} />
          <button className="b" disabled={busy} onClick={apply}>Save</button>
        </div>
      )}

      <div className="card">
        <div className="row"><h2 style={{ marginTop: 0 }}>Details</h2>{!readOnly && !editing && <button className="b g sm" onClick={() => { setFields(item); setEditing(true); }}>Edit</button>}</div>
        {editing ? (
          <>
            <label>Name</label><input value={fields.name || ''} onChange={e => setFields({ ...fields, name: e.target.value })} />
            <label>Category</label><input list="stock-cats" value={fields.category || ''} onChange={e => setFields({ ...fields, category: e.target.value })} placeholder="e.g. Drinks" />
            <datalist id="stock-cats">{[...new Set([...stockItems.map(i => i.category).filter(Boolean), ...categoriesFor(business.business_profile)])].map(x => <option key={x} value={x} />)}</datalist>
            <label>Code / SKU</label><input value={fields.sku || ''} onChange={e => setFields({ ...fields, sku: e.target.value })} />
            <label>Unit</label><input value={fields.unit || ''} onChange={e => setFields({ ...fields, unit: e.target.value })} />
            <label>Reorder when at or below</label><input type="number" value={fields.reorder_level ?? ''} onChange={e => setFields({ ...fields, reorder_level: e.target.value })} />
            <label>Cost price (R)</label><input type="number" value={fields.cost_price ?? ''} onChange={e => setFields({ ...fields, cost_price: e.target.value })} />
            <label>Selling price (R)</label><input type="number" value={fields.sell_price ?? ''} onChange={e => setFields({ ...fields, sell_price: e.target.value })} />
            <div style={{ height: 10 }} />
            <button className="b" disabled={busy} onClick={saveEdit}>Save</button>
            <div style={{ height: 8 }} />
            <button className="b g" onClick={() => setEditing(false)}>Cancel</button>
            <div style={{ height: 8 }} />
            <button className="b d" disabled={busy} onClick={async () => { await updateRow('stock_items', item.id, { archived: true }); close(); }}>Remove from stock list</button>
          </>
        ) : (
          <>
            {item.category && <div className="row"><span className="mini">Category</span><span>{item.category}</span></div>}
            {item.sku && <div className="row"><span className="mini">Code</span><span>{item.sku}</span></div>}
            <div className="row"><span className="mini">Cost / Selling price</span><span>{R2(+item.cost_price)} / {R2(+item.sell_price)}</span></div>
            <div className="row"><span className="mini">Markup</span><span>{+item.cost_price > 0 ? Math.round((+item.sell_price - +item.cost_price) / +item.cost_price * 100) + '%' : '-'}</span></div>
            <div className="row"><span className="mini">Margin</span><span>{+item.sell_price > 0 && +item.cost_price > 0 ? Math.round((+item.sell_price - +item.cost_price) / +item.sell_price * 100) + '%' : '-'}</span></div>
            <div className="row"><span className="mini">Reorder level</span><span>{+item.reorder_level || '-'}</span></div>
            {!readOnly && +item.cost_price > 0 && (
              <div className="stk-margins">
                <span className="mini">Price it for a margin of</span>
                {[30, 40, 50].map(m => <button key={m} className="b g sm" onClick={() => updateRow('stock_items', item.id, { sell_price: priceForMargin(+item.cost_price, m) })}>{m}% → {R2(priceForMargin(+item.cost_price, m))}</button>)}
              </div>
            )}
          </>
        )}
      </div>

      <h2>History</h2>
      <div className="card">
        <table><tbody>
          {moves.length ? moves.map(m => (
            <tr key={m.id}>
              <td>{ACTIONS[m.reason]?.verb || m.reason}<div className="tag">{m.date}{m.supplier ? ' · ' + m.supplier : ''}{m.reference ? ' · ' + m.reference : (m.note ? ' · ' + m.note : '')}</div></td>
              <td className={'r mono' + (+m.qty_change < 0 ? ' bd' : '')}>{+m.qty_change > 0 ? '+' : ''}{+m.qty_change}</td>
            </tr>
          )) : <tr><td className="mini">No movements yet.</td></tr>}
        </tbody></table>
      </div>
      <div style={{ height: 20 }} />
    </>
  );
}

export function useStockItem() {
  const { open } = useSheet();
  return (itemId) => open(() => <StockItemContent itemId={itemId} />);
}

const NONE = 'Uncategorised';

export default function Stock() {
  const { business, stockItems, stockMovements, recipes, addRow, myRole } = useBusiness();
  const readOnly = myRole === 'accountant';
  const showRecipes = ['food', 'appointments'].includes(business.business_profile) || recipes.some(r => !r.archived);
  const openItem = useStockItem();
  const openCapture = useStockCapture();
  const openSales = useStockSales();
  const words = costingWords(business.business_profile);
  const [view, setView] = useState('items'); // items | recipes
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all'); // all | low | a category name
  const blankForm = { name: '', category: '', unit: 'each', qty_on_hand: '', reorder_level: '', cost_price: '', sell_price: '' };
  const [f, setF] = useState(blankForm);
  const [err, setErr] = useState('');
  const items = stockItems.filter(i => !i.archived);
  const low = items.filter(isLow);
  const worth = i => Math.max(0, +i.qty_on_hand) * +i.cost_price;
  const value = items.reduce((a, i) => a + worth(i), 0);
  const monthKey = iso(new Date()).slice(0, 7);
  const wasteMonth = stockMovements.filter(m => m.reason === 'waste' && m.date.slice(0, 7) === monthKey)
    .reduce((a, m) => a + Math.abs(+m.qty_change) * +m.unit_price, 0);

  // Categories in use, with how many items and how much stock each holds.
  const byCat = useMemo(() => {
    const m = {};
    items.forEach(i => { const k = i.category || NONE; const e = m[k] || (m[k] = { n: 0, value: 0, low: 0 }); e.n++; e.value += worth(i); if (isLow(i)) e.low++; });
    return m;
  }, [stockItems]); // eslint-disable-line react-hooks/exhaustive-deps
  const catNames = Object.keys(byCat).sort((x, y) => (x === NONE) - (y === NONE) || x.localeCompare(y));
  const suggestions = [...new Set([...catNames.filter(c => c !== NONE), ...categoriesFor(business.business_profile)])];

  const matches = i => (!search || (i.name + ' ' + (i.sku || '') + ' ' + (i.category || '')).toLowerCase().includes(search.toLowerCase()))
    && (cat === 'all' || (cat === 'low' ? isLow(i) : (i.category || NONE) === cat));
  const shown = items.filter(matches).sort((a, b) => (isLow(b) - isLow(a)) || a.name.localeCompare(b.name));
  const grouped = cat === 'all' && catNames.length > 1;
  const sections = grouped ? catNames.map(c => [c, shown.filter(i => (i.category || NONE) === c)]).filter(([, l]) => l.length) : [[null, shown]];
  const exportCsv = () => downloadStockCsv([...items].sort((a, b) => (a.category || '~').localeCompare(b.category || '~') || a.name.localeCompare(b.name)), 'stock-' + iso(new Date()) + '.csv');

  async function save() {
    if (!f.name.trim()) { setErr('Give the item a name.'); return; }
    try {
      const qty = +f.qty_on_hand || 0;
      const it = await addRow('stock_items', { name: f.name.trim(), category: f.category.trim() || null, unit: f.unit || 'each', qty_on_hand: qty, reorder_level: +f.reorder_level || 0, cost_price: +f.cost_price || 0, sell_price: +f.sell_price || 0 });
      if (qty) await addRow('stock_movements', { item_id: it.id, qty_change: qty, reason: 'adjust', unit_price: +f.cost_price || 0, note: 'Opening stock' });
      setF(blankForm); setErr(''); setAdding(false);
    } catch (e) { setErr(e.message); }
  }

  const maxValue = Math.max(1, ...Object.values(byCat).map(e => e.value));

  // What selling stock earned this month: takings from the movements, less
  // what that stock cost when it left the shelf.
  const soldNow = stockMovements.filter(m => m.reason === 'sale' && m.date.slice(0, 7) === monthKey);
  const soldRevenue = soldNow.reduce((a, m) => a + Math.abs(+m.qty_change) * (+m.unit_price || 0), 0);
  const soldCost = soldNow.reduce((a, m) => { const it = stockItems.find(i => i.id === m.item_id); return a + Math.abs(+m.qty_change) * (m.unit_cost != null ? +m.unit_cost : it ? +it.cost_price : 0); }, 0);
  const grossProfit = soldRevenue - soldCost;

  return (
    <section className="tab on light-tab">
      <h1>Stock</h1>
      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">Stock value</div><div className="val">{R(value)}</div></div>
        <div className="biz-card"><div className="lbl">Running low</div><div className={'val' + (low.length ? ' bd' : '')}>{low.length}</div></div>
        <div className="biz-card"><div className="lbl">Items</div><div className="val">{items.length}</div></div>
        <div className="biz-card"><div className="lbl">Waste this month</div><div className="val">{R(wasteMonth)}</div></div>
      </div>

      {showRecipes && (
        <div className="seg">
          <button className={view === 'items' ? 'on' : ''} onClick={() => setView('items')}>Stock items</button>
          <button className={view === 'recipes' ? 'on' : ''} onClick={() => setView('recipes')}>{words.tab}</button>
        </div>
      )}
      {view === 'recipes' ? <Recipes /> : <>

      {soldNow.length > 0 && (
        <div className="card stk-profit">
          <div className="row"><h2 style={{ marginTop: 0 }}>Stock sold this month</h2><span className="mini">Takings less cost</span></div>
          <div className="stk-profit-grid">
            <div><span>Sales</span><b>{R(soldRevenue)}</b></div>
            <div><span>Cost of stock</span><b>{R(soldCost)}</b></div>
            <div><span>Gross profit</span><b className={grossProfit < 0 ? 'bd' : ''}>{R(grossProfit)}{soldRevenue > 0 ? <em> {Math.round(grossProfit / soldRevenue * 100)}%</em> : null}</b></div>
          </div>
        </div>
      )}

      {low.length > 0 && (
        <div className="infobox" style={{ marginBottom: 12 }}>
          <b>Reorder list:</b> {low.map(i => `${i.name} (${+i.qty_on_hand} left)`).join(', ')}
        </div>
      )}

      {catNames.length > 1 && (
        <div className="card stk-cats">
          <div className="row"><h2 style={{ marginTop: 0 }}>Stock by category</h2><span className="mini">Value at cost</span></div>
          {catNames.slice().sort((x, y) => byCat[y].value - byCat[x].value).map(c => (
            <button key={c} className="stk-cat-row" onClick={() => setCat(c)}>
              <span className="nm">{c}{byCat[c].low > 0 && <em>{byCat[c].low} low</em>}</span>
              <span className="bar"><i style={{ width: Math.max(3, byCat[c].value / maxValue * 100) + '%' }} /></span>
              <span className="v">{R(byCat[c].value)}</span>
            </button>
          ))}
        </div>
      )}

      {!readOnly && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="b" style={{ flex: 1.4 }} onClick={openCapture}>Capture from an invoice</button>
          <button className="b g" style={{ flex: 1 }} onClick={openSales}>Record sales</button>
        </div>
      )}
      {!readOnly && adding ? (
        <div className="card" style={{ marginTop: 10 }}>
          <h2 style={{ marginTop: 0 }}>New item</h2>
          <label>Name</label>
          <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Coca-Cola 2L, Flour 10kg, Hair dye #5" />
          <label>Category</label>
          <input list="stk-cat-list" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} placeholder="e.g. Drinks" />
          <datalist id="stk-cat-list">{suggestions.map(x => <option key={x} value={x} />)}</datalist>
          <div className="biz-grid" style={{ marginTop: 10 }}>
            <div><label style={{ marginTop: 0 }}>Unit</label><input value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} placeholder="each, kg, box" /></div>
            <div><label style={{ marginTop: 0 }}>How many now</label><input type="number" value={f.qty_on_hand} onChange={e => setF({ ...f, qty_on_hand: e.target.value })} /></div>
            <div><label style={{ marginTop: 0 }}>Cost price (R)</label><input type="number" value={f.cost_price} onChange={e => setF({ ...f, cost_price: e.target.value })} /></div>
            <div><label style={{ marginTop: 0 }}>Selling price (R)</label><input type="number" value={f.sell_price} onChange={e => setF({ ...f, sell_price: e.target.value })} /></div>
          </div>
          <label>Warn me when it drops to</label>
          <input type="number" value={f.reorder_level} onChange={e => setF({ ...f, reorder_level: e.target.value })} placeholder="e.g. 5" />
          {err && <div className="msg e">{err}</div>}
          <div style={{ height: 10 }} />
          <button className="b" onClick={save}>Add Item</button>
          <div style={{ height: 8 }} />
          <button className="b g" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {!readOnly && <button className="b g" style={{ flex: 1 }} onClick={() => setAdding(true)}>+ Add item</button>}
          <button className="b g" style={{ flex: 1 }} disabled={!items.length} onClick={exportCsv}>Export CSV</button>
        </div>
      )}

      <div className="seg stk-chips" style={{ marginTop: 14 }}>
        <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>All {items.length}</button>
        {low.length > 0 && <button className={cat === 'low' ? 'on' : ''} onClick={() => setCat('low')}>Low stock {low.length}</button>}
        {catNames.length > 1 && catNames.map(c => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c} {byCat[c].n}</button>)}
      </div>
      {items.length > 6 && <input style={{ marginBottom: 10 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search stock" />}

      <div className="card">
        <table><tbody>
          {shown.length ? sections.map(([name, list]) => [
            name && (
              <tr key={'h-' + name} className="stk-head"><td colSpan={2}>{name}<span>{list.length} item{list.length === 1 ? '' : 's'} · {R(list.reduce((a, i) => a + worth(i), 0))}</span></td></tr>
            ),
            ...list.map(i => {
              const margin = +i.sell_price > 0 && +i.cost_price > 0 ? Math.round((+i.sell_price - +i.cost_price) / +i.sell_price * 100) : null;
              const level = +i.reorder_level > 0 ? Math.min(1, +i.qty_on_hand / (+i.reorder_level * 2)) : null;
              return (
                <tr key={i.id} style={{ cursor: 'pointer' }} onClick={() => openItem(i.id)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{i.name}</div>
                    <div className="tag">{!grouped && i.category ? i.category + ' · ' : ''}{+i.sell_price > 0 ? R2(+i.sell_price) + ' each' : 'no selling price'}{margin != null ? ` · ${margin}% margin` : ''}{isLow(i) ? ' · reorder' : ''}</div>
                  </td>
                  <td className={'r' + (isLow(i) ? ' bd' : '')}>
                    {+i.qty_on_hand} {i.unit}
                    {level != null && <span className={'stk-lvl' + (isLow(i) ? ' low' : '')}><i style={{ width: Math.max(4, level * 100) + '%' }} /></span>}
                  </td>
                </tr>
              );
            }),
          ]) : <tr><td className="mini" colSpan={2}>{items.length ? 'Nothing matches.' : 'No stock items yet. Capture an invoice or add an item to start.'}</td></tr>}
        </tbody></table>
      </div>
      </>}
      <div style={{ height: 20 }} />
    </section>
  );
}
