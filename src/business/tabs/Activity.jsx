import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBudget } from '../../store/BudgetStore.jsx';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { businessApi } from '../../lib/businessApi.js';
import { ACTION_LABEL, TYPE_FILTERS, auditCsv, describe } from '../../lib/audit.js';
import { iso } from '../../lib/format.js';

const PAGE = 50;
const dayLabel = ts => new Date(ts).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeLabel = ts => new Date(ts).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
const startOf = d => new Date(d + 'T00:00:00').toISOString();
const endOf = d => new Date(d + 'T23:59:59').toISOString();

// Who added, changed or deleted what, and when. Written by the database itself, so it can't be edited from the app.
export default function Activity() {
  const { syncCfg, ensureToken } = useBudget();
  const { business, members } = useBusiness();
  const [type, setType] = useState('');
  const [who, setWho] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const query = useCallback((limit, offset) => {
    const p = [`business_id=eq.${business.id}`, 'select=*', 'order=changed_at.desc,id.desc', `limit=${limit}`, `offset=${offset}`];
    if (type) p.push('table_name=eq.' + type);
    if (who) p.push('actor_email=eq.' + encodeURIComponent(who));
    if (from) p.push('changed_at=gte.' + encodeURIComponent(startOf(from)));
    if (to) p.push('changed_at=lte.' + encodeURIComponent(endOf(to)));
    if (q.trim()) p.push('label=ilike.' + encodeURIComponent('*' + q.trim().replace(/[*,()]/g, '') + '*'));
    return p.join('&');
  }, [business.id, type, who, from, to, q]);

  const load = useCallback(async (append) => {
    setErr(''); setLoading(true);
    try {
      const token = await ensureToken();
      const got = await businessApi.select(syncCfg, token, 'audit_log', query(PAGE + 1, append ? rows.length : 0));
      const page = (got || []).slice(0, PAGE);
      setMore((got || []).length > PAGE);
      setRows(prev => (append ? [...prev, ...page] : page));
    } catch (e) { setErr(e.message || 'Could not load the activity.'); } finally { setLoading(false); }
  }, [syncCfg, ensureToken, query, rows.length]);

  // reload when a filter changes (typing in the search waits a moment)
  useEffect(() => {
    const t = setTimeout(() => load(false), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [type, who, from, to, q, business.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function exportCsv() {
    try {
      const token = await ensureToken();
      const all = await businessApi.select(syncCfg, token, 'audit_log', query(5000, 0));
      const blob = new Blob([auditCsv(all || [])], { type: 'text/csv;charset=utf-8' });
      const u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = 'activity-' + iso(new Date()) + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
    } catch (e) { setErr(e.message); }
  }

  const people = useMemo(() => [...new Set([...(members || []).map(m => m.email), ...rows.map(r => r.actor_email)].filter(Boolean))].sort(), [members, rows]);
  const days = useMemo(() => {
    const out = [];
    rows.forEach(r => { const d = dayLabel(r.changed_at); const last = out[out.length - 1]; if (last && last.d === d) last.items.push(r); else out.push({ d, items: [r] }); });
    return out;
  }, [rows]);
  const me = syncCfg.userId;

  return (
    <section className="tab on light-tab">
      <div className="row"><h1>Activity</h1><button className="b g sm" style={{ width: 'auto' }} disabled={!rows.length} onClick={exportCsv}>Export CSV</button></div>
      <div className="mini" style={{ marginBottom: 10 }}>A record of who added, changed or deleted what in {business.name}. It is written by the system and can't be edited or removed from the app. Statement imports and automatic sales are not listed one by one; changes to them are.</div>

      <div className="act-filters">
        <select value={type} onChange={e => setType(e.target.value)} aria-label="Type">{TYPE_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={who} onChange={e => setWho(e.target.value)} aria-label="Person">
          <option value="">Everyone</option>
          {people.map(p => <option key={p} value={p}>{p === syncCfg.email ? p + ' (you)' : p}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="From date" />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="To date" />
        <input placeholder="Search a name or number" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {err && <div className="msg e">{err}</div>}
      {!loading && rows.length === 0 && !err && <div className="card"><b>Nothing here.</b><div className="mini" style={{ marginTop: 4 }}>{type || who || from || to || q ? 'No changes match these filters.' : 'Changes made from now on will appear here.'}</div></div>}

      {days.map(day => (
        <div key={day.d}>
          <h2>{day.d}</h2>
          <div className="card act-day">
            {day.items.map(e => {
              const d = describe(e);
              return (
                <div className="act-row" key={e.id}>
                  <div className="act-time">{timeLabel(e.changed_at)}</div>
                  <div className="act-main">
                    <div className="act-title"><span className={'act-tag ' + e.action}>{ACTION_LABEL[e.action]}</span> {d.title.replace(/^(Added|Changed|Deleted) /, '')}</div>
                    <div className="mini">{e.actor_id && e.actor_id === me ? 'You' : e.actor_email || 'Unknown'}</div>
                    {d.lines.length > 0 && (
                      <ul className="act-lines">
                        {d.lines.map((l, i) => (
                          <li key={i}><span>{l.label}</span>{l.text != null ? <b>{l.text}</b> : <b><s>{l.from}</s> &rarr; {l.to}</b>}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {loading && <div className="mini" style={{ margin: '12px 0' }}>Loading…</div>}
      {more && !loading && <button className="b g" style={{ marginTop: 12 }} onClick={() => load(true)}>Show older activity</button>}
      <div style={{ height: 24 }} />
    </section>
  );
}
