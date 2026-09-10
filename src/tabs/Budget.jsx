import { useMemo, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useCycleData } from '../lib/useCycleData.js';
import { cycleAt, inCycle } from '../lib/cycle.js';
import { R, catEmoji } from '../lib/format.js';

function useRecommendedBudget(S) {
  return useMemo(() => {
    const sums = {}; let months = 0;
    for (const o of [-1, -2, -3]) {
      const c = cycleAt(S.cycleDay, o);
      const tx = S.tx.filter(t => !t.mt && inCycle(t, c));
      if (!tx.length) continue;
      months++;
      tx.forEach(t => sums[t.c] = (sums[t.c] || 0) + t.a);
    }
    if (!months) return null;
    const perCat = {};
    Object.keys(sums).forEach(k => perCat[k] = sums[k] / months);
    const total = Object.values(perCat).reduce((a, b) => a + b, 0);
    return { perCat, total, months };
  }, [S.tx, S.cycleDay]);
}

export default function Budget() {
  const { S, setIncome, setCycleDay, setSavingsGoal, setWeekly, setMethod, setCatTarget, addCat, delCat, applyRecommendedBudget } = useBudget();
  const { spentBy, spent, budTot } = useCycleData(S, 0);
  const rec = useRecommendedBudget(S);
  const [newCat, setNewCat] = useState('');
  const [newAmt, setNewAmt] = useState('');
  const [applied, setApplied] = useState(false);

  const remaining = budTot - spent;
  const savings = (S.income || 0) - budTot;
  const nextMonthLbl = cycleAt(S.cycleDay, 1).s.toLocaleDateString('en-ZA', { month: 'long' });

  function handleAddCat() {
    if (!newCat.trim()) return;
    if (S.cats.some(x => x.n.toLowerCase() === newCat.trim().toLowerCase())) { alert('That category already exists.'); return; }
    addCat(newCat.trim(), +newAmt || 0);
    setNewCat(''); setNewAmt('');
  }
  function handleDelCat(i) {
    const n = S.cats[i].n;
    const used = S.tx.filter(t => t.c === n).length;
    if (used && !confirm(`${n} has ${used} transaction(s). Delete the category anyway?`)) return;
    delCat(i);
  }
  function useSuggested() {
    applyRecommendedBudget(rec.perCat);
    setApplied(true);
    setTimeout(() => setApplied(false), 4000);
  }

  return (
    <section className="tab on light-tab" id="t-setup">
      <div className="row"><h1>Budget</h1></div>
      <div className="sub">Income, pay day and category targets.</div>

      <div className="row" style={{ margin: '14px 0' }}>
        <div><div className="mini">Budget</div><div className="mono" style={{ fontSize: 26, fontWeight: 700 }}>{R(budTot)}</div></div>
        <div style={{ textAlign: 'center' }}><div className="mini">Spent</div><div className="mono" style={{ fontSize: 26, fontWeight: 700 }}>{R(spent)}</div></div>
        <div style={{ textAlign: 'right' }}><div className="mini">Remaining</div><div className={'mono' + (remaining < 0 ? ' bd' : '')} style={{ fontSize: 26, fontWeight: 700 }}>{remaining < 0 ? '-' : ''}{R(Math.abs(remaining))}</div></div>
      </div>

      <div className="card">
        <label>Monthly income (R)</label>
        <input type="number" inputMode="decimal" value={S.income || ''} onChange={e => setIncome(e.target.value)} />
        <label>Pay day (day of month)</label>
        <input type="number" min="1" max="28" value={S.cycleDay} onChange={e => setCycleDay(Math.min(28, Math.max(1, +e.target.value || 1)))} />
        <label>Savings goal per month (R)</label>
        <input type="number" inputMode="decimal" value={S.savingsGoal || ''} onChange={e => setSavingsGoal(e.target.value)} />
        <label>Spending pace</label>
        <div className="seg" style={{ margin: 0 }}>
          <button className={!S.weekly ? 'on' : ''} onClick={() => setWeekly(false)}>One monthly pot</button>
          <button className={S.weekly ? 'on' : ''} onClick={() => setWeekly(true)}>Weekly envelopes</button>
        </div>
        <label>Budgeting method</label>
        <div className="seg" style={{ margin: 0 }}>
          <button className={S.method !== 'zero' ? 'on' : ''} onClick={() => setMethod('flexible')}>Track as I go</button>
          <button className={S.method === 'zero' ? 'on' : ''} onClick={() => setMethod('zero')}>Zero-based</button>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <div><div className="mini">Budgeted</div><div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{R(budTot)}</div></div>
          <div style={{ textAlign: 'right' }}><div className="mini">Left to save</div><div className={'mono' + (savings < 0 ? ' bd' : ' ok')} style={{ fontSize: 22, fontWeight: 700 }}>{R(savings)}</div></div>
        </div>
        <div className="mini" style={{ marginTop: 6 }}>
          {S.income ? (savings >= 0 ? Math.round(savings / S.income * 100) + '% savings rate' : 'Budget exceeds income by ' + R(-savings)) : ''}
        </div>
      </div>

      <h2>Category budgets</h2>
      <div className="card">
        {S.cats.map((x, i) => {
          const sp = spentBy[x.n] || 0, rem = x.t - sp;
          return (
            <div className="cat" key={x.n}>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <div className="n">{catEmoji(x.n)} {x.n}</div>
                  <div className="mini">{R(sp)} spent &middot; <span className={rem < 0 ? 'bd' : 'ok'}>{rem < 0 ? '-' : ''}{R(Math.abs(rem))} remaining</span></div>
                </div>
                <input type="number" inputMode="decimal" value={x.t} style={{ maxWidth: 96, textAlign: 'right' }} onChange={e => setCatTarget(i, e.target.value)} />
                <button className="b d sm" onClick={() => handleDelCat(i)}>&times;</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="card">
        <label>Add a category</label>
        <div className="row">
          <input placeholder="Name" value={newCat} onChange={e => setNewCat(e.target.value)} />
          <input type="number" inputMode="decimal" placeholder="R" style={{ maxWidth: 110 }} value={newAmt} onChange={e => setNewAmt(e.target.value)} />
        </div>
        <div style={{ height: 10 }} />
        <button className="b g" onClick={handleAddCat}>Add category</button>
      </div>

      <h2>Your recommended budget</h2>
      <div className="card">
        {rec ? (
          <>
            <div className="mini">Based on your last {rec.months} month{rec.months === 1 ? '' : 's'}, we recommend a <b style={{ color: 'var(--tx)' }}>{R(rec.total)}</b> budget for {nextMonthLbl}.</div>
            <div style={{ height: 10 }} />
            <button className="b g" onClick={useSuggested}>Use suggested budget</button>
            {applied && <div className="msg s">Applied - adjust any category below if you need to.</div>}
          </>
        ) : <div className="mini">Import at least one month of statements or logged spending to get a recommendation.</div>}
      </div>

      <h2>Your data</h2>
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>&#128274; Private by default, synced if you choose</div>
        <div className="mini" style={{ lineHeight: 1.6 }}>
          &bull; <b>No bank login, ever.</b> At any tier. This app cannot see your accounts and never asks to.<br />
          &bull; <b>Statements are read in your phone's memory either way.</b> Signed out, discarded the moment they're parsed, never uploaded. Signed in, the file itself is kept in your account once you confirm the import.<br />
          &bull; <b>Slip photos read on-device when signed out.</b> Signed in, they're read by Claude for better accuracy instead, falling back to on-device reading if that's ever unavailable.<br />
          &bull; <b>Signing in is optional.</b> Skip it, and everything stays on this device only.<br />
          &bull; <b>Slip photos expire after 45 days</b>, on this device and in your account either way. Imported statements don't expire automatically.<br />
          &bull; <b>You can take it with you.</b> Export a full backup or a plain CSV at any time under Settings &rarr; Data.
        </div>
      </div>
      <div style={{ height: 20 }} />
    </section>
  );
}
