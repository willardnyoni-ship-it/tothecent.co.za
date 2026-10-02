import { useState } from 'react';
import { useBusiness } from '../store/BusinessStore.jsx';
import { R2, iso, vatOf } from '../lib/format.js';

const CHANNELS = [
  ['cash_sales', 'Cash sales'],
  ['card_sales', 'Card sales'],
  ['other_sales', 'Other (SnapScan, Zapper, EFT)'],
];

function num(v) { return +v || 0; }

// Expected cash in the drawer at close: what you started with, plus cash
// taken, plus any cash tips left in the till.
export function cashUpSummary(c) {
  const sales = num(c.cash_sales) + num(c.card_sales) + num(c.other_sales);
  const expected = num(c.opening_float) + num(c.cash_sales) + num(c.tips);
  const diff = +(num(c.counted_cash) - expected).toFixed(2);
  return { sales, expected, diff };
}

export default function CashUpView({ readOnly }) {
  const { cashUps, addRow, addTransactions, hasFeature } = useBusiness();
  const [f, setF] = useState({ date: iso(new Date()), opening_float: '', cash_sales: '', card_sales: '', other_sales: '', tips: '', counted_cash: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const s = cashUpSummary(f);
  const already = cashUps.find(c => c.date === f.date);
  const vat = hasFeature('vat');

  async function save() {
    if (s.sales <= 0) { setMsg({ e: true, t: 'Enter at least one day of sales.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const row = { date: f.date, notes: f.notes || null };
      ['opening_float', 'cash_sales', 'card_sales', 'other_sales', 'tips', 'counted_cash'].forEach(k => { row[k] = num(f[k]); });
      await addRow('cash_ups', row);
      // Each sales channel becomes its own income line, so card takings can
      // later be matched to the bank deposit and cash to the cash banked.
      // Tips aren't business income - they belong to staff - so they're
      // kept on the cash-up only.
      await addTransactions(CHANNELS.filter(([k]) => num(f[k]) > 0).map(([k, label]) => ({
        date: f.date, amount: num(f[k]), kind: 'income', category: 'Sales',
        description: 'Cash-up ' + f.date + ' - ' + label, status: 'reviewed', source: 'cashup',
      })));
      setF(x => ({ ...x, opening_float: x.opening_float, cash_sales: '', card_sales: '', other_sales: '', tips: '', counted_cash: '', notes: '' }));
      setMsg({ t: 'Cash-up saved and sales added to Money.' });
    } catch (e) { setMsg({ e: true, t: e.message }); } finally { setBusy(false); }
  }

  return (
    <>
      {!readOnly && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Close the day</h2>
          <label>Date</label>
          <input type="date" value={f.date} onChange={e => set('date', e.target.value)} />
          {already && <div className="msg e">You already cashed up {f.date}. Saving again adds a second set of sales.</div>}
          <label>Opening float (R)</label>
          <input type="number" inputMode="decimal" value={f.opening_float} onChange={e => set('opening_float', e.target.value)} placeholder="Cash in the till at opening" />
          {CHANNELS.map(([k, label]) => (
            <div key={k}>
              <label>{label} (R)</label>
              <input type="number" inputMode="decimal" value={f[k]} onChange={e => set(k, e.target.value)} />
            </div>
          ))}
          <label>Cash tips in the till (R)</label>
          <input type="number" inputMode="decimal" value={f.tips} onChange={e => set('tips', e.target.value)} />
          <label>Cash counted at close (R)</label>
          <input type="number" inputMode="decimal" value={f.counted_cash} onChange={e => set('counted_cash', e.target.value)} />
          <label>Notes</label>
          <input value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. R50 paid to delivery driver from till" />

          <div className="biz-totals">
            <div className="row"><span>Total sales</span><span className="mono">{R2(s.sales)}</span></div>
            {vat && <div className="row"><span>VAT included</span><span className="mono">{R2(vatOf(s.sales))}</span></div>}
            <div className="row"><span>Cash expected in till</span><span className="mono">{R2(s.expected)}</span></div>
            <div className="row grand">
              <span>{s.diff === 0 ? 'Balanced' : s.diff > 0 ? 'Over' : 'Short'}</span>
              <span className={'mono' + (s.diff < 0 ? ' bd' : s.diff > 0 ? '' : ' ok')}>{R2(Math.abs(s.diff))}</span>
            </div>
          </div>
          {msg && <div className={'msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
          <div style={{ height: 12 }} />
          <button className="b" disabled={busy} onClick={save}>Save Cash-up</button>
        </div>
      )}

      <h2>Past cash-ups</h2>
      <div className="card">
        <table><tbody>
          {cashUps.length ? cashUps.map(c => {
            const x = cashUpSummary(c);
            return (
              <tr key={c.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.date}</div>
                  <div className="tag">Cash {R2(num(c.cash_sales))} &middot; Card {R2(num(c.card_sales))}{num(c.other_sales) ? ' · Other ' + R2(num(c.other_sales)) : ''}{num(c.tips) ? ' · Tips ' + R2(num(c.tips)) : ''}</div>
                </td>
                <td className="r">
                  {R2(x.sales)}
                  <div className={'mini' + (x.diff < 0 ? ' bd' : '')}>{x.diff === 0 ? 'Balanced' : (x.diff > 0 ? 'Over ' : 'Short ') + R2(Math.abs(x.diff))}</div>
                </td>
              </tr>
            );
          }) : <tr><td className="mini" colSpan={2}>No cash-ups yet. Close your first day above.</td></tr>}
        </tbody></table>
      </div>
    </>
  );
}
