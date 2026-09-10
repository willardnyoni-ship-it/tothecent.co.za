import { useMemo, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useCycleData } from '../lib/useCycleData.js';
import { cycleAt } from '../lib/cycle.js';
import { R, R2, catEmoji } from '../lib/format.js';
import { useEditTx } from '../components/EditTxSheet.jsx';

export default function Spending() {
  const { S } = useBudget();
  const editTx = useEditTx();
  const [period, setPeriod] = useState('this');
  const [catFilter, setCatFilter] = useState('all');
  const offset = period === 'last' ? -1 : 0;
  const { c, tx, spentBy } = useCycleData(S, offset);
  const total = tx.reduce((a, t) => a + t.a, 0);

  const cats = useMemo(() => Object.entries(spentBy).sort((a, b) => b[1] - a[1]), [spentBy]);
  const catOptions = useMemo(() => [...new Set(tx.map(t => t.c))].sort(), [tx]);
  const shown = useMemo(() =>
    tx.filter(t => catFilter === 'all' || t.c === catFilter)
      .sort((a, b) => b.d.localeCompare(a.d) || String(b.id).localeCompare(String(a.id))),
    [tx, catFilter]);

  const title = (offset === 0 ? 'This month' : c.s.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })) + ' spending';

  return (
    <section className="tab on light-tab" id="t-spending">
      <h1>{title}</h1>
      <div className="mono" style={{ fontSize: 34, fontWeight: 800 }}>{R(total)}</div>

      <div className="seg" style={{ marginTop: 14 }}>
        <button className={period === 'this' ? 'on' : ''} onClick={() => setPeriod('this')}>This month</button>
        <button className={period === 'last' ? 'on' : ''} onClick={() => setPeriod('last')}>Last month</button>
      </div>

      <h2>Where your money went</h2>
      <div className="card">
        {cats.length ? cats.map(([n, v]) => (
          <div className="cat" key={n} onClick={() => setCatFilter(n)}>
            <div className="row"><div className="n">{catEmoji(n)} {n}</div><div className="v">{R(v)}</div></div>
          </div>
        )) : <div className="mini">Nothing spent yet.</div>}
      </div>

      <h2>Transactions</h2>
      <label>Category</label>
      <select value={catOptions.includes(catFilter) || catFilter === 'all' ? catFilter : 'all'} onChange={e => setCatFilter(e.target.value)}>
        <option value="all">All categories</option>
        {catOptions.map(c => <option key={c}>{c}</option>)}
      </select>
      <div className="card" style={{ marginTop: 10 }}>
        <table><tbody>
          {shown.length ? shown.map(t => (
            <tr key={t.id} onClick={() => editTx(t.id)} style={{ cursor: 'pointer' }}>
              <td><div style={{ fontWeight: 600 }}>{t.note || t.c}</div><div className="tag">{t.c} &middot; {t.d}</div></td>
              <td className="r">{R2(t.a)}</td>
            </tr>
          )) : <tr><td className="mini" colSpan={2}>No transactions.</td></tr>}
        </tbody></table>
      </div>
      <div style={{ height: 20 }} />
    </section>
  );
}
