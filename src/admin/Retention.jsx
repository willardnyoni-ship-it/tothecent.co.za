import { useEffect } from 'react';
import { TrendChart } from './charts.jsx';
import { openEmail } from '../business/share.js';

const monthName = c => new Date(c + '-01T12:00:00').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

// Sequential single-hue scale for the cohort grid: light green for low
// retention through to the app's deep green for high. Text switches to
// white on the darker half so every cell stays readable.
function cellStyle(p) {
  const t = Math.max(0, Math.min(1, p / 100));
  const light = [231, 245, 236], dark = [18, 131, 58];
  const c = light.map((v, i) => Math.round(v + (dark[i] - v) * t));
  return { background: `rgb(${c.join(',')})`, color: t > 0.55 ? '#fff' : 'var(--op-ink)' };
}

function Kpi({ label, value, sub }) {
  return <div className="op-kpi"><div className="l">{label}</div><div className="v">{value}</div>{sub && <div className="s">{sub}</div>}</div>;
}

export default function Retention({ r, loading, onLoad }) {
  useEffect(() => { if (!r && !loading) onLoad(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <><div className="op-head"><div><h1>Retention</h1><p>Loading…</p></div></div><div className="op-card"><div className="op-empty">Loading…</div></div></>;

  const f = r.funnel;
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  // How many whole months each cohort has had, so cells in the future are
  // left blank instead of looking like 0%.
  const monthsSince = c => (now.getFullYear() - +c.slice(0, 4)) * 12 + (now.getMonth() + 1 - +c.slice(5, 7));
  const maxM = Math.max(0, ...r.cohorts.map(c => monthsSince(c.cohort)));
  const stickiness = r.active_30 ? Math.round(r.avg_daily_30 / r.active_30 * 100) : 0;
  const steps = [
    ['Signed up', f.signed_up, 'Created an account'],
    ['Signed in', f.signed_in, 'Confirmed their email and got in'],
    ['Did something', f.did_something, 'Synced a budget, uploaded a statement, set up a business or recorded something'],
    ['Came back', f.came_back, 'Used the app again on a later day'],
  ];
  const weekly = (r.weekly_active || []).map(w => ({ day: w.day, n: w.n }));

  return (
    <>
      <div className="op-head">
        <div><h1>Retention</h1><p>Are the people who sign up still using To The Cent?</p></div>
        <div className="op-actions"><button className="op-btn" onClick={onLoad} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
      </div>

      <div className="op-grid k4" style={{ marginBottom: 16 }}>
        <Kpi label="Active, last 30 days" value={r.active_30} sub={`of ${f.signed_up} accounts · ${pct(r.active_30, f.signed_up)}%`} />
        <Kpi label="Active, last 7 days" value={r.active_7} sub={`${pct(r.active_7, r.active_30)}% of the month's active people`} />
        <Kpi label="Came back" value={pct(f.came_back, f.signed_up) + '%'} sub="used it again after their first day" />
        <Kpi label="At risk" value={r.at_risk.length} sub="went quiet 2-8 weeks ago" />
      </div>

      <div className="op-card">
        <div className="op-card-h"><h2>Monthly cohorts</h2><span className="op-meta">% of each sign-up month active in later months</span></div>
        <div className="op-tablewrap">
          <table className="op-table op-cohort">
            <thead><tr><th>Signed up</th><th className="num">People</th>{[...Array(maxM + 1)].map((_, m) => <th key={m} className="num">{m === 0 ? 'Month 1' : 'Month ' + (m + 1)}</th>)}</tr></thead>
            <tbody>
              {r.cohorts.map(c => {
                const since = monthsSince(c.cohort);
                return (
                  <tr key={c.cohort}>
                    <td className="strong">{monthName(c.cohort)}</td>
                    <td className="num">{c.size}</td>
                    {[...Array(maxM + 1)].map((_, m) => {
                      if (m > since) return <td key={m} />;
                      const active = (c.months.find(x => x.m === m) || {}).active || 0;
                      const p = pct(active, c.size);
                      const partial = m === since;
                      return (
                        <td key={m} className="num" style={cellStyle(p)} title={`${monthName(c.cohort)} sign-ups: ${active} of ${c.size} active in month ${m + 1}${partial ? ' (month still in progress)' : ''}`}>
                          <b>{p}%</b><span className="sub" style={{ color: 'inherit', opacity: .8 }}>{active} of {c.size}{partial ? ' · so far' : ''}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="op-card-b op-note" style={{ marginTop: 0 }}>
          Month 1 is the month they signed up. "So far" means that month isn't over yet ({monthName(thisMonth)}).
          Before 2 Oct 2026 activity comes from sign-ins and things people created, so earlier months can undercount people who only looked around.
        </div>
      </div>

      <div className="op-grid c2">
        <div className="op-card">
          <div className="op-card-h"><h2>Weekly active people</h2><span className="op-meta">Last 12 weeks</span></div>
          <div className="op-card-b"><TrendChart data={weekly} label="Weekly active people" unit={['person', 'people']} endLabel="This week" /></div>
        </div>
        <div className="op-card">
          <div className="op-card-h"><h2>From sign-up to habit</h2><span className="op-meta">Where people drop off</span></div>
          <div className="op-card-b">
            <div className="op-hbars">
              {steps.map(([label, n, hint], i) => (
                <div className="op-hbar" key={label} title={hint}>
                  <div className="row"><span>{label}</span><b>{n} <span className="op-meta" style={{ fontWeight: 400 }}>· {pct(n, f.signed_up)}%</span></b></div>
                  <div className="track"><div className="fill" style={{ width: pct(n, f.signed_up) + '%' }} /></div>
                  {i > 0 && steps[i - 1][1] > n && <div className="op-meta" style={{ marginTop: 3 }}>{steps[i - 1][1] - n} dropped off after "{steps[i - 1][0].toLowerCase()}"</div>}
                </div>
              ))}
            </div>
            <div className="op-note">Stickiness: on an average day, {stickiness}% of this month's active people use the app.</div>
          </div>
        </div>
      </div>

      <div className="op-card">
        <div className="op-card-h"><h2>At risk</h2><span className="op-meta">Used the app on 2+ days, then went quiet 2-8 weeks ago</span></div>
        <div className="op-tablewrap"><table className="op-table">
          <thead><tr><th>Person</th><th>Last active</th><th className="num">Quiet for</th><th className="num">Days used</th><th /></tr></thead>
          <tbody>
            {r.at_risk.length ? r.at_risk.map(p => (
              <tr key={p.id}>
                <td className="strong">{p.email}</td>
                <td>{new Date(p.last_active + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</td>
                <td className="num">{p.days_quiet} days</td>
                <td className="num">{p.active_days}</td>
                <td className="num"><button className="op-link" onClick={() => openEmail(p.email, 'Checking in from To The Cent', "Hi, I noticed you haven't been on To The Cent for a little while - is there anything that got in the way, or anything we could make easier?")}>Check in by email</button></td>
              </tr>
            )) : <tr><td colSpan={5} className="op-empty">Nobody at risk right now.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
