import { useMemo, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { cycleAt, inCycle } from '../lib/cycle.js';
import { recurring } from '../lib/recurring.js';
import { merchantOf } from '../lib/categorize.js';
import { R, R2, iso, catEmoji } from '../lib/format.js';
import { settlements } from '../lib/household.js';

function dl(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}

// A category that only had a stray R1 or two last month, and real spending
// this month, produces a mathematically "correct" but useless-looking swing
// like 49900% - same failure mode as Home's budget-percentage display, just
// with `was` instead of budTot as the tiny denominator. Cap it the same way.
function pctLabel(pct) {
  const a = Math.abs(pct);
  return a > 999 ? '999%+' : a + '%';
}

function Overview({ S }) {
  const active = S.tx.filter(t => !t.mt);
  if (!active.length) return <div className="card" style={{ marginBottom: 16 }}><div className="mini">Import a statement or log a few transactions to see your monthly review.</div></div>;

  const c = cycleAt(S.cycleDay, 0), prev = cycleAt(S.cycleDay, -1);
  const curTx = active.filter(t => inCycle(t, c)), prevTx = active.filter(t => inCycle(t, prev));
  const spent = curTx.reduce((a, t) => a + t.a, 0), prevSpent = prevTx.reduce((a, t) => a + t.a, 0);
  const income = S.income || 0;
  const saved = income - spent, prevSaved = income - prevSpent;

  const curBy = {}; curTx.forEach(t => curBy[t.c] = (curBy[t.c] || 0) + t.a);
  const prevBy = {}; prevTx.forEach(t => prevBy[t.c] = (prevBy[t.c] || 0) + t.a);
  const changes = [...new Set([...Object.keys(curBy), ...Object.keys(prevBy)])].map(n => {
    const cur = curBy[n] || 0, was = prevBy[n] || 0;
    const pct = was ? Math.round((cur - was) / was * 100) : (cur > 0 ? 100 : 0);
    return { n, delta: cur - was, pct };
  }).filter(x => Math.abs(x.delta) >= 20).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);

  const monthLbl = c.s.toLocaleDateString('en-ZA', { month: 'long' });
  const prevLbl = prev.s.toLocaleDateString('en-ZA', { month: 'long' });
  const rec = recurring(S.tx);
  const worsening = changes.filter(x => x.delta > 0);

  function exportMonthCsv() {
    const tx = S.tx.filter(t => !t.mt && inCycle(t, c)).sort((a, b) => a.d.localeCompare(b.d));
    const rows = [['date', 'amount', 'category', 'note']].concat(tx.map(t => [t.d, t.a.toFixed(2), t.c, (t.note || '').replace(/"/g, "'")]));
    dl(new Blob([rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')], { type: 'text/csv' }), 'monthly-report-' + iso(new Date()) + '.csv');
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0 }}>{monthLbl} financial review</h2>
      <div className="row">
        <div><div className="mini">Income</div><div className="mono" style={{ fontSize: 20, fontWeight: 700 }}>{R(income)}</div></div>
        <div><div className="mini">Spending</div><div className="mono" style={{ fontSize: 20, fontWeight: 700 }}>{R(spent)}</div></div>
        <div style={{ textAlign: 'right' }}><div className="mini">Saved</div><div className={'mono ' + (saved >= 0 ? 'ok' : 'bd')} style={{ fontSize: 20, fontWeight: 700 }}>{saved < 0 ? '-' : ''}{R(Math.abs(saved))}</div></div>
      </div>

      {changes.length > 0 && (
        <>
          <h2>Your biggest changes</h2>
          <div className="mini">{changes.map(x => <div key={x.n}>{catEmoji(x.n)} {x.n} {x.delta > 0 ? '↑' : '↓'} {pctLabel(x.pct)}</div>)}</div>
        </>
      )}

      {prevSpent > 0 && (
        <>
          <h2>Your financial highlights</h2>
          <div className="card" style={{ margin: 0 }}>
            {saved - prevSaved >= 0
              ? <>🟢 You saved {R(saved - prevSaved)} more than {prevLbl}.</>
              : <>🔴 You saved {R(prevSaved - saved)} less than {prevLbl}.</>}
          </div>
        </>
      )}

      {worsening.length > 0 && (
        <>
          <h2>Watch this</h2>
          <div className="warnbox">{catEmoji(worsening[0].n)} Your {worsening[0].n} spending is up {pctLabel(worsening[0].pct)} vs {prevLbl}.</div>
        </>
      )}

      {rec.length > 0 && (
        <>
          <h2>Recurring expenses</h2>
          <div className="mini">You spend approximately {R(rec.reduce((a, x) => a + x.amount, 0))}/month on recurring payments.</div>
        </>
      )}

      <div style={{ height: 14 }} />
      <button className="b g" onClick={exportMonthCsv}>Download {monthLbl} report (CSV)</button>
    </div>
  );
}

function ViewMonths({ active }) {
  const by = {};
  active.forEach(t => { const m = t.d.slice(0, 7); (by[m] = by[m] || { tot: 0, cats: {} }); by[m].tot += t.a; by[m].cats[t.c] = (by[m].cats[t.c] || 0) + t.a; });
  const ms = Object.keys(by).sort();
  if (!ms.length) return <div className="card mini">No data yet.</div>;
  const max = Math.max(...ms.map(m => by[m].tot));
  const avg = ms.reduce((a, m) => a + by[m].tot, 0) / ms.length;
  return (
    <>
      <div className="card">
        <div className="row"><div className="mini">Spend by calendar month</div><div className="mini">avg {R(avg)}</div></div>
        <div className="spark">{ms.map(m => <i key={m} style={{ height: (by[m].tot / max * 100) + '%', background: by[m].tot > avg ? 'var(--warn)' : 'var(--acc)' }} title={m} />)}</div>
        <div className="row mini" style={{ marginTop: 6 }}><span>{ms[0]}</span><span>{ms[ms.length - 1]}</span></div>
      </div>
      {ms.slice().reverse().map(m => {
        const top = Object.entries(by[m].cats).sort((a, b) => b[1] - a[1]).slice(0, 6);
        return (
          <div className="card" key={m}>
            <div className="row"><div style={{ fontWeight: 700 }}>{m}</div><div className="mono" style={{ fontWeight: 700 }}>{R(by[m].tot)}</div></div>
            <table style={{ marginTop: 6 }}><tbody>{top.map(([k, v]) => <tr key={k}><td>{k}</td><td className="r">{R(v)}</td></tr>)}</tbody></table>
          </div>
        );
      })}
    </>
  );
}

function ViewMerchants({ active }) {
  const g = {};
  active.forEach(t => { const k = merchantOf(t.note); (g[k] = g[k] || { n: 0, a: 0, c: t.c }); g[k].n++; g[k].a += t.a; });
  const list = Object.entries(g).map(([k, v]) => ({ name: k, ...v }));
  if (!list.length) return <div className="card mini">No data yet.</div>;
  const bySpend = [...list].sort((a, b) => b.a - a.a).slice(0, 25);
  const byVisits = [...list].sort((a, b) => b.n - a.n).slice(0, 15);
  const tot = active.reduce((a, t) => a + t.a, 0);
  return (
    <>
      <div className="card"><div className="mini">{list.length} merchants &middot; {R(tot)} total</div></div>
      <h2>Biggest spend</h2>
      <div className="card"><table><tbody>{bySpend.map(m => (
        <tr key={m.name}><td>{m.name}<div className="tag">{m.c} &middot; {m.n} visit{m.n === 1 ? '' : 's'} &middot; avg {R(m.a / m.n)}</div></td>
          <td className="r">{R(m.a)}<div className="mini" style={{ fontWeight: 400 }}>{(m.a / tot * 100).toFixed(1)}%</div></td></tr>
      ))}</tbody></table></div>
      <h2>Most frequent</h2>
      <div className="card"><table><tbody>{byVisits.map(m => (
        <tr key={m.name}><td>{m.name}<div className="tag">{m.c} &middot; avg {R(m.a / m.n)}</div></td><td className="r">{m.n}&times;<div className="mini" style={{ fontWeight: 400 }}>{R(m.a)}</div></td></tr>
      ))}</tbody></table></div>
    </>
  );
}

function ViewRecurring({ S }) {
  const r = recurring(S.tx);
  if (!r.length) return <div className="card mini">Nothing repeating yet. Import two or more months of statements and your debit orders and subscriptions will show up here.</div>;
  const monthly = r.reduce((a, x) => a + x.amount, 0);
  return (
    <>
      <div className="card">
        <div className="row">
          <div><div className="mini">Repeating charges</div><div className="mono" style={{ fontSize: 26, fontWeight: 700 }}>{R(monthly)}<span style={{ fontSize: 18, color: 'var(--dim)' }}>/mo</span></div></div>
          <div style={{ textAlign: 'right' }}><div className="mini">Committed</div><div className="mono" style={{ fontSize: 26, fontWeight: 700 }}>{S.income ? pctLabel(Math.round(monthly / S.income * 100)) : '-'}</div></div>
        </div>
      </div>
      <div className="card"><table><tbody>{r.map(x => (
        <tr key={x.key}><td>{x.name}<div className="tag">{x.cat} &middot; around the {x.day}th &middot; seen in {x.months} months</div></td><td className="r">{R2(x.amount)}</td></tr>
      ))}</tbody></table></div>
    </>
  );
}

function ViewSavings({ S }) {
  const f = S.flows || [];
  if (!f.length) return <div className="card mini">No savings movements found yet. Import a statement - transfers to and from your savings or investment account are picked up automatically.</div>;
  const by = {};
  f.forEach(x => { const m = x.d.slice(0, 7); (by[m] = by[m] || { in: 0, out: 0 }); if (x.dir === 'out') by[m].out += x.a; else by[m].in += x.a; });
  const ms = Object.keys(by).sort();
  const totOut = f.filter(x => x.dir === 'out').reduce((a, x) => a + x.a, 0);
  const totIn = f.filter(x => x.dir === 'in').reduce((a, x) => a + x.a, 0);
  const net = totOut - totIn;
  return (
    <>
      <div className="card hero"><div className="lbl">Net into savings</div>
        <div className={'big ' + (net >= 0 ? 'ok' : 'bd')}>{net >= 0 ? '' : '-'}{R(Math.abs(net))}</div>
        <div className="note">{R(totOut)} paid in &middot; {R(totIn)} taken back out across {ms.length} months</div></div>
      <h2>By month</h2>
      <div className="card"><table><tbody>{ms.slice().reverse().map(m => {
        const v = by[m], n = v.out - v.in;
        return <tr key={m}><td>{m}<div className="tag">{R(v.out)} in &middot; {R(v.in)} out</div></td><td className={'r ' + (n >= 0 ? 'ok' : 'bd')}>{n >= 0 ? '' : '-'}{R(Math.abs(n))}</td></tr>;
      })}</tbody></table></div>
    </>
  );
}

function ViewHousehold({ S, addMember, delMember }) {
  const [name, setName] = useState('');
  const ms = S.members || [];
  const setl = settlements(S.tx, ms, S.splits);
  return (
    <>
      <div className="infobox">Everything here stays on this device. To share a budget, export a backup and send it to the other person.</div>
      <div className="card">
        <label style={{ marginTop: 0 }}>Add someone</label>
        <div className="row"><input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
          <button className="b" style={{ width: 'auto', padding: '12px 16px' }} onClick={() => { if (name.trim()) { addMember(name.trim()); setName(''); } }}>Add</button></div>
      </div>
      {!ms.length ? <div className="card mini">No one added yet. Add yourself and whoever you split with.</div> : (
        <>
          <h2>People</h2>
          <div className="card">{ms.map((m, i) => (
            <div className="cat" key={m.id}><div className="row"><div className="n">{m.name}{i === 0 && <span className="tag">pays by default</span>}</div>
              <button className="b d sm" onClick={() => delMember(m.id)}>&times;</button></div></div>
          ))}</div>
          <h2>Who owes whom</h2>
          <div className="card">
            {setl.length ? <table><tbody>{setl.map((x, i) => (
              <tr key={i}><td>{ms.find(m => m.id === x.from)?.name || 'Unknown'} &rarr; {ms.find(m => m.id === x.to)?.name || 'Unknown'}<div className="tag">settle up</div></td><td className="r">{R2(x.a)}</td></tr>
            ))}</tbody></table> : <div className="mini">All square.</div>}
          </div>
        </>
      )}
    </>
  );
}

export default function Reports() {
  const { S, addMember, delMember } = useBudget();
  const [view, setView] = useState('months');
  const active = S.tx.filter(t => !t.mt);

  return (
    <section className="tab on light-tab" id="t-insight">
      <h1>Reports</h1>
      <Overview S={S} />
      <div className="seg">
        {['months', 'merch', 'rec', 'save', 'house'].map(v => (
          <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
            {{ months: 'Months', merch: 'Merchants', rec: 'Recurring', save: 'Savings', house: 'Household' }[v]}
          </button>
        ))}
      </div>
      {!active.length && view !== 'save' && view !== 'house'
        ? <div className="card mini">No data yet. Import a statement or snap a few slips.</div>
        : <>
            {view === 'months' && <ViewMonths active={active} />}
            {view === 'merch' && <ViewMerchants active={active} />}
            {view === 'rec' && <ViewRecurring S={S} />}
            {view === 'save' && <ViewSavings S={S} />}
            {view === 'house' && <ViewHousehold S={S} addMember={addMember} delMember={delMember} />}
          </>}
      <div style={{ height: 20 }} />
    </section>
  );
}
