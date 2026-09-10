import { useMemo } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useNav } from '../app/NavContext.jsx';
import { useCycleData } from '../lib/useCycleData.js';
import { cycleAt } from '../lib/cycle.js';
import { R, fmtD, catEmoji } from '../lib/format.js';
import { useEditTx } from '../components/EditTxSheet.jsx';
import PhotoThumb from '../components/PhotoThumb.jsx';
import { useViewShot } from '../components/ViewShotSheet.jsx';

function WeeklyChart({ active, budTot, totalDays }) {
  const days = useMemo(() => {
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return [...Array(7)].map((_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const total = active.filter(t => t.d === key).reduce((a, t) => a + t.a, 0);
      const lbl = d.toLocaleDateString('en-ZA', { weekday: 'short' });
      return { label: lbl, initial: d.toLocaleDateString('en-ZA', { weekday: 'narrow' }) || lbl[0], total };
    });
  }, [active]);
  const dailyBudget = totalDays ? budTot / totalDays : 0;
  const scaleMax = Math.max(dailyBudget * 1.6, ...days.map(x => x.total), 100);
  const bp = Math.min(92, Math.max(8, dailyBudget / scaleMax * 100));
  const peak = days.reduce((m, x) => x.total > m.total ? x : m, days[0]);

  return (
    <div className="card">
      <div className="zh-caption"><i />{R(dailyBudget)} daily budget</div>
      <div className="zh-chart">
        <div className="zh-yaxis">{[4, 3, 2, 1, 0].map(n => <span key={n}>{R(scaleMax * n / 4)}</span>)}</div>
        <div className="zh-bars">
          <div className="zh-budgetline" style={{ top: (100 - bp) + '%' }} />
          {days.map((x, i) => {
            const capPct = 100 - Math.min(100, x.total / scaleMax * 100);
            const over = dailyBudget > 0 && x.total > dailyBudget;
            const isPeak = x === peak && x.total > 0;
            return (
              <div className="zh-col" key={i}>
                <div className={'zh-tip' + (over ? ' over' : '') + (isPeak ? ' peak' : '')}>{R(x.total)}</div>
                <div className="zh-track" style={{ background: `linear-gradient(to top, var(--zblue) 0%, var(--zblue) ${Math.max(0, bp - 15)}%, var(--zbad) ${Math.min(100, bp + 15)}%, var(--zbad) 100%)` }}>
                  <div className="zh-cap" style={{ height: capPct + '%' }} />
                </div>
                <div className="zh-daylbl"><span className="d-long">{x.label}</span><span className="d-short">{x.initial}</span></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CategoryDonut({ spentBy, cats }) {
  const spentCats = cats.map(x => ({ n: x.n, sp: spentBy[x.n] || 0 })).filter(x => x.sp > 0).sort((a, b) => b.sp - a.sp);
  const totalSpentAll = spentCats.reduce((a, x) => a + x.sp, 0);
  if (!totalSpentAll) return <div className="card"><div className="mini">Nothing spent yet this month.</div></div>;
  const top = spentCats.slice(0, 2);
  const restAmt = spentCats.slice(2).reduce((a, x) => a + x.sp, 0);
  const slices = [...top, ...(restAmt > 0 ? [{ n: 'Everything else', sp: restAmt }] : [])];
  const colors = ['var(--zsage)', 'var(--zmustard)', 'var(--zlav)'];
  let acc = 0;
  const stops = slices.map((s, i) => {
    const from = acc, to = acc + s.sp / totalSpentAll * 360; acc = to;
    return `${colors[i]} ${from}deg ${to}deg`;
  }).join(', ');
  return (
    <div className="card">
      <div className="zh-donutwrap">
        <div className="zh-donut">
          <div className="zh-ring" style={{ background: `conic-gradient(${stops})` }} />
          <div className="zh-hole"><b>{R(totalSpentAll)}</b><span>this month</span></div>
        </div>
        <div className="zh-legend">
          {slices.map((s, i) => (
            <div className="zh-legrow" key={s.n}>
              <i style={{ background: colors[i] }} /><span className="ln">{s.n}</span>
              <span className="lv">{Math.round(s.sp / totalSpentAll * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { S, cycleOffset, setCycleOffset, resetCycle } = useBudget();
  const { go, setSnapAction } = useNav();
  const editTx = useEditTx();
  const viewShot = useViewShot();
  const { c, active, tx, spentBy, spent, budTot, pct, due, dueTot } = useCycleData(S, cycleOffset);

  const isNow = cycleOffset === 0;
  const msDay = 86400000, now = new Date();
  const dayN = Math.min(Math.max(1, Math.floor((now - c.s) / msDay) + 1), 99);
  const totalDays = Math.round((c.e - c.s) / msDay) + 1;
  const daysLeft = Math.max(1, totalDays - dayN + 1);
  const remaining = (budTot || 0) - spent;
  const safeToday = Math.max(0, remaining / daysLeft);

  const income = S.income || 0;
  const homeRemaining = income - spent;

  const quickInsight = useMemo(() => {
    const prev = cycleAt(S.cycleDay, cycleOffset - 1);
    const prevTx = S.tx.filter(t => !t.mt && t.d >= prev.s.toISOString().slice(0, 10) && t.d <= prev.e.toISOString().slice(0, 10));
    const prevBy = {};
    prevTx.forEach(t => prevBy[t.c] = (prevBy[t.c] || 0) + t.a);
    let best = null;
    S.cats.forEach(x => {
      const delta = (spentBy[x.n] || 0) - (prevBy[x.n] || 0);
      if (Math.abs(delta) < 20) return;
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { n: x.n, delta };
    });
    return best;
  }, [S.cats, S.tx, S.cycleDay, cycleOffset, spentBy]);

  const recent = [...active].sort((a, b) => b.d.localeCompare(a.d) || String(b.id).localeCompare(String(a.id))).slice(0, 8);

  return (
    <section className="tab on light-tab" id="t-today">
      <div className="row" style={{ marginBottom: 4 }}>
        <button className="b g sm" style={{ width: 'auto' }} onClick={() => setCycleOffset(cycleOffset - 1)} aria-label="Previous month">&#10094;</button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <h1>{isNow ? 'This month' : c.s.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</h1>
          <div className="sub">{fmtD(c.s)} - {fmtD(c.e)}</div>
        </div>
        <button className="b g sm" style={{ width: 'auto', visibility: isNow ? 'hidden' : 'visible' }} onClick={() => setCycleOffset(cycleOffset + 1)} aria-label="Next month">&#10095;</button>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="mini">{isNow ? `Day ${dayN} of ${totalDays}` : <a href="#" onClick={e => { e.preventDefault(); resetCycle(); }} style={{ color: 'var(--blue)', textDecoration: 'none' }}>&#8617; Back to this month</a>}</div>
        <div className="mini">{tx.length} transaction{tx.length === 1 ? '' : 's'}</div>
      </div>

      <div className="zh-statrow">
        <div className="zh-stat sage"><div className="zh-lbl">Income</div><div className="zh-val">{R(income)}</div></div>
        <div className="zh-stat mustard"><div className="zh-lbl">Spent</div><div className="zh-val">{R(spent)}</div></div>
        <div className="zh-stat lav"><div className="zh-lbl">Remaining</div><div className={'zh-val' + (homeRemaining < 0 ? ' bd' : '')}>{homeRemaining < 0 ? '-' : ''}{R(Math.abs(homeRemaining))}</div></div>
      </div>

      <div className="card zh-budgetStatus" style={{ marginBottom: 12 }}>
        {budTot > 0
          ? <><span className={'zh-statusDot ' + (pct > 100 ? 'bd' : pct > 85 ? 'wn' : 'ok')} /> You&rsquo;ve spent <b>{Math.round(pct)}%</b> of your monthly budget</>
          : <><span className="zh-statusDot wn" /> Set a monthly budget under <a href="#" onClick={e => { e.preventDefault(); go('setup'); }} style={{ color: 'var(--zblue)' }}>Budget</a> to track your spending.</>}
      </div>

      {quickInsight && (
        <div className="card zh-insight" style={{ marginBottom: 16 }}>
          <span className="ic">&#128161;</span>
          <span>You spent <b>{R(Math.abs(quickInsight.delta))}</b> {quickInsight.delta > 0 ? 'more' : 'less'} on {quickInsight.n} than last month.</span>
        </div>
      )}

      {due.length > 0 && isNow && (
        <div className="card" style={{ marginTop: 2 }}>
          <div className="row"><div style={{ fontWeight: 700 }}>Still to come this month</div><div className="mono" style={{ fontWeight: 700 }}>{R(dueTot)}</div></div>
          <table style={{ marginTop: 6 }}><tbody>
            {due.slice(0, 6).map(r => (
              <tr key={r.key}><td>{r.name}<div className="tag">{r.cat} &middot; usually around the {r.day}th</div></td><td className="r">{R(r.amount)}</td></tr>
            ))}
          </tbody></table>
        </div>
      )}

      <div className="zh-qa">
        <button className="zh-qaBtn" onClick={() => { setSnapAction('focus-amount'); go('snap'); }}><span className="zh-qaIc">&#43;</span>Add Expense</button>
        <button className="zh-qaBtn" onClick={() => { setSnapAction('camera'); go('snap'); }}><span className="zh-qaIc">&#128247;</span>Scan Receipt</button>
        <button className="zh-qaBtn" onClick={() => go('stmt')}><span className="zh-qaIc">&#128196;</span>Upload Statement</button>
      </div>

      <section className="zh-sec">
        <h2>Recent activity</h2>
        <div className="card"><table><tbody>
          {recent.length ? recent.map(t => (
            <tr key={t.id} onClick={() => editTx(t.id)} style={{ cursor: 'pointer' }}>
              <td className="thumbCell">{t.photo ? <PhotoThumb pid={t.photo} onClick={() => viewShot(t.id)} /> : t.photoGone ? <span className="rthumb gone">&#8709;</span> : null}</td>
              <td><div style={{ fontWeight: 600 }}>{t.note || t.c}</div><div className="tag">{t.c} &middot; {t.d}</div></td>
              <td className="r">{R(t.a)}<div className="mini" style={{ fontWeight: 400, color: 'var(--blue)' }}>edit &rsaquo;</div></td>
            </tr>
          )) : <tr><td className="mini" colSpan={3}>Nothing logged yet. Snap a slip or import a statement.</td></tr>}
        </tbody></table></div>
      </section>

      <details className="zh-more">
        <summary>More detail</summary>
        <div className="zh-statrow" style={{ marginTop: 14 }}>
          <div className="zh-stat sage">
            <div className="zh-lbl">Safe to spend today</div>
            <div className="zh-val">{R(safeToday)}</div>
            <div className="zh-sub">{remaining < 0 ? `You are ${R(-remaining)} over for this month.` : `${R(remaining)} left for this month`}</div>
          </div>
          <div className="zh-stat mustard">
            <div className="zh-lbl">Spent this month</div>
            <div className="zh-val">{R(spent)}</div>
            <div className="zh-sub">of {R(budTot)} budget</div>
          </div>
          <div className="zh-stat lav">
            <div className="zh-lbl">Snap a slip</div>
            <div className="zh-sub">Photograph a till slip &mdash; OCR reads the total for you</div>
            <button className="zh-cta" onClick={() => { setSnapAction('camera'); go('snap'); }}>Open camera</button>
          </div>
        </div>
        <div className="bar"><i style={{ width: Math.min(100, pct) + '%', background: pct > 100 ? 'var(--bad)' : pct > 85 ? 'var(--warn)' : 'var(--acc)' }} /></div>
        <div className="row" style={{ marginTop: 8, marginBottom: 16 }}>
          <div className="mini">{Math.round(pct)}% of budget used</div>
          <div className="mini">{budTot - spent >= 0 ? R(budTot - spent) + ' left' : R(spent - budTot) + ' over'}</div>
        </div>

        <div className="zh-grid">
          <section className="zh-sec"><h2>Spending this week</h2><WeeklyChart active={active} budTot={budTot} totalDays={totalDays} /></section>
          <section className="zh-sec"><h2>Category breakdown</h2><CategoryDonut spentBy={spentBy} cats={S.cats} /></section>
          <section className="zh-sec">
            <h2>Categories</h2>
            <div className="card">
              {S.cats.filter(x => x.t > 0 || (spentBy[x.n] || 0) > 0).map(x => {
                const sp = spentBy[x.n] || 0, p = x.t ? sp / x.t * 100 : (sp ? 100 : 0);
                const col = x.t === 0 ? 'var(--dim)' : p > 100 ? 'var(--bad)' : p > 85 ? 'var(--warn)' : 'var(--acc)';
                return (
                  <div className="cat" key={x.n}>
                    <div className="row"><div className="n">{catEmoji(x.n)} {x.n}{x.fixed && <span className="tag">fixed</span>}</div><div className="v">{R(sp)} <span style={{ color: '#9AA0AA' }}>/</span> {R(x.t)}</div></div>
                    <div className="bar"><i style={{ width: Math.min(100, p) + '%', background: col }} /></div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </details>
      <div style={{ height: 20 }} />
    </section>
  );
}
