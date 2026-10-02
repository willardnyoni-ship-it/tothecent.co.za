import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { R } from '../lib/format.js';
import { PROFILES, FEATURES } from '../lib/businessProfiles.js';
import { adminApi, deviceLabel } from './adminApi.js';
import { openWhatsApp, openEmail } from '../business/share.js';

const SITE = 'https://tothecent.co.za/';
const SEGS = [['overview', 'Overview'], ['people', 'People'], ['signins', 'Sign-ins'], ['invites', 'Invites']];

function ago(ts) {
  if (!ts) return 'never';
  const d = new Date(ts), mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  if (mins < 1440) return Math.round(mins / 60) + ' h ago';
  const days = Math.round(mins / 1440);
  if (days < 8) return days + ' day' + (days === 1 ? '' : 's') + ' ago';
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined });
}
const profileLabel = k => (PROFILES.find(p => p.key === k) || {}).label || (k === 'not chosen' ? 'Not chosen yet' : k);

// One series per chart: bars in the app's accent, a hover/tap readout
// above, and the same numbers available as a list underneath.
function DailyBars({ title, data, unit }) {
  const units = n => n === 1 ? unit[0] : unit[1];
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map(d => d.n));
  const total = data.reduce((a, d) => a + d.n, 0);
  const shown = hover !== null ? data[hover] : null;
  const fmt = day => new Date(day + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  return (
    <div className="card">
      <div className="row"><h2 style={{ marginTop: 0 }}>{title}</h2><span className="mini">{total} in 30 days</span></div>
      <div className="mini adm-readout">{shown ? `${fmt(shown.day)}: ${shown.n} ${units(shown.n)}` : 'Hover or tap a bar'}</div>
      <div className="adm-bars" role="img" aria-label={`${title}, last 30 days, ${total} total`} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <button key={d.day} type="button" className={'adm-bar' + (hover === i ? ' on' : '')}
            onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => setHover(i)}
            aria-label={`${fmt(d.day)}: ${d.n} ${units(d.n)}`}>
            <i style={{ height: d.n ? Math.max(4, d.n / max * 100) + '%' : 0 }} />
          </button>
        ))}
      </div>
      <div className="row mini"><span>{data[0] && fmt(data[0].day)}</span><span>Today</span></div>
      <details style={{ marginTop: 8 }}><summary className="mini" style={{ cursor: 'pointer' }}>Show as a list</summary>
        <table><tbody>{[...data].reverse().filter(d => d.n).map(d => <tr key={d.day}><td>{fmt(d.day)}</td><td className="r">{d.n}</td></tr>)}</tbody></table>
      </details>
    </div>
  );
}

function Overview({ o }) {
  const byProfile = Object.entries(o.businesses_by_profile || {}).sort((a, b) => b[1] - a[1]);
  const features = Object.entries(o.feature_use || {}).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">People</div><div className="val">{o.users}</div><div className="mini">+{o.new_7d} this week</div></div>
        <div className="biz-card"><div className="lbl">Active today</div><div className="val">{o.active_today}</div><div className="mini">{o.active_7d} in last 7 days</div></div>
        <div className="biz-card"><div className="lbl">Signed in, 30 days</div><div className="val">{o.signed_in_30d}</div><div className="mini">{o.never_signed_in} never signed in</div></div>
        <div className="biz-card"><div className="lbl">Businesses</div><div className="val">{o.businesses}</div><div className="mini">{o.households} personal budgets</div></div>
      </div>
      <DailyBars title="New sign-ups" data={o.signups_by_day || []} unit={['sign-up', 'sign-ups']} />
      <DailyBars title="People using the app" data={o.active_by_day || []} unit={['person active', 'people active']} />
      {(o.active_7d === 0 && o.users > 0) && <div className="mini" style={{ marginBottom: 12 }}>Daily activity is recorded from today onwards, so this chart fills in as people open the app.</div>}

      <h2>What people are doing</h2>
      <div className="card">
        {[
          ['Invoices created', o.invoices], ['Value invoiced', R(+o.invoiced_value || 0)], ['Quotes', o.quotes], ['Bookings', o.bookings],
          ['Business transactions', o.business_transactions], ['Expenses logged', o.expenses], ['Bank statements uploaded', o.statements],
          ['Personal budgets synced this week', o.personal_synced_7d], ['Waitlist', o.waitlist], ['Invites sent', o.invites],
        ].map(([k, v]) => <div className="row" key={k} style={{ padding: '4px 0' }}><span>{k}</span><span className="mono">{v}</span></div>)}
      </div>

      {byProfile.length > 0 && (
        <>
          <h2>Businesses by type</h2>
          <div className="card">
            {byProfile.map(([k, n]) => <div className="row" key={k} style={{ padding: '4px 0' }}><span>{profileLabel(k)}</span><span className="mono">{n}</span></div>)}
          </div>
        </>
      )}
      {features.length > 0 && (
        <>
          <h2>Tools switched on</h2>
          <div className="card">
            {features.map(([k, n]) => <div className="row" key={k} style={{ padding: '4px 0' }}><span>{FEATURES[k]?.label || k}</span><span className="mono">{n}</span></div>)}
          </div>
        </>
      )}
    </>
  );
}

function People({ users }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const weekAgo = Date.now() - 7 * 864e5;
  const shown = users.filter(u => (!q || (u.email + ' ' + (u.business_name || '')).toLowerCase().includes(q.toLowerCase()))
    && (filter === 'all' || (filter === 'active' ? u.last_sign_in_at && new Date(u.last_sign_in_at) > weekAgo
      : filter === 'business' ? !!u.business_name : !u.last_sign_in_at)));
  return (
    <>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by email or business" />
      <div className="seg" style={{ marginTop: 10 }}>
        {[['all', 'All'], ['active', 'Active this week'], ['business', 'Has a business'], ['never', 'Never signed in']].map(([k, l]) => (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      <div className="card">
        {shown.length ? shown.map(u => (
          <div key={u.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{u.email}</div>
                <div className="tag">
                  {u.business_name ? `${u.business_name} · ${profileLabel(u.business_profile || 'not chosen')} · ${u.business_role}` : (u.segment === 'business' ? 'Signed up for business, no business yet' : 'Personal')}
                  {!u.confirmed && ' · email not confirmed'}
                </div>
              </div>
              <div className="r mini" style={{ flex: 'none', textAlign: 'right' }}>
                <div>Signed in {ago(u.last_sign_in_at)}</div>
                <div>Joined {new Date(u.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</div>
              </div>
            </div>
            {(u.active_days_30 > 0 || u.devices || u.personal_last_sync) && (
              <div className="mini" style={{ marginTop: 4 }}>
                {u.active_days_30 > 0 && `Used on ${u.active_days_30} day${u.active_days_30 === 1 ? '' : 's'} this month`}
                {u.devices && ` · ${u.devices}`}
                {u.personal_last_sync && ` · budget synced ${ago(u.personal_last_sync)}`}
              </div>
            )}
          </div>
        )) : <div className="mini">Nobody matches.</div>}
      </div>
    </>
  );
}

function SignIns({ sessions, users }) {
  const recent = [...users].filter(u => u.last_sign_in_at).sort((a, b) => b.last_sign_in_at.localeCompare(a.last_sign_in_at));
  return (
    <>
      <h2 style={{ marginTop: 0 }}>Latest sign-in per person</h2>
      <div className="card">
        <table><tbody>
          {recent.length ? recent.map(u => (
            <tr key={u.id}><td style={{ overflowWrap: 'anywhere' }}>{u.email}</td><td className="r mini">{ago(u.last_sign_in_at)}<div>{new Date(u.last_sign_in_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></td></tr>
          )) : <tr><td className="mini">No sign-ins yet.</td></tr>}
        </tbody></table>
      </div>
      <h2>Devices currently signed in</h2>
      <div className="mini" style={{ marginBottom: 8 }}>Each row is a device that is still logged in. Logging out removes it from this list.</div>
      <div className="card">
        <table><tbody>
          {sessions.length ? sessions.map((s, i) => (
            <tr key={i}>
              <td><div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{s.email}</div><div className="tag">{s.user_agent ? deviceLabel(s.user_agent) : 'Unknown device'} · signed in {ago(s.signed_in_at)}</div></td>
              <td className="r mini">last seen<div>{ago(s.last_seen)}</div></td>
            </tr>
          )) : <tr><td className="mini">Nobody is signed in right now.</td></tr>}
        </tbody></table>
      </div>
    </>
  );
}

function Invites({ invites, waitlist, users, onCreate, onDelete }) {
  const [f, setF] = useState({ email: '', name: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [justMade, setJustMade] = useState(null);
  const joined = useMemo(() => new Set(users.map(u => (u.email || '').toLowerCase())), [users]);
  const link = inv => SITE + '?invite=' + inv.code;
  const message = inv => `Hi${inv.name ? ' ' + inv.name.split(' ')[0] : ''}, I'd like you to try To The Cent - a simple way to track your money and run your business finances.`
    + (inv.note ? ' ' + inv.note : '') + ` Create your account here: ${link(inv)}`;

  async function create(prefill) {
    const data = prefill || f;
    if (!/^\S+@\S+\.\S+$/.test(data.email.trim())) { setMsg({ e: true, t: 'Enter a valid email address.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const inv = await onCreate({ email: data.email.trim().toLowerCase(), name: data.name?.trim() || null, note: data.note?.trim() || null });
      setJustMade(inv); setF({ email: '', name: '', note: '' });
    } catch (e) { setMsg({ e: true, t: e.message }); } finally { setBusy(false); }
  }

  const ShareButtons = ({ inv }) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      <button className="b sm" style={{ width: 'auto' }} onClick={() => openWhatsApp('', message(inv))}>WhatsApp</button>
      <button className="b g sm" style={{ width: 'auto' }} onClick={() => openEmail(inv.email, "You're invited to To The Cent", message(inv))}>Email</button>
      <button className="b g sm" style={{ width: 'auto' }} onClick={() => navigator.clipboard?.writeText(link(inv))}>Copy link</button>
    </div>
  );

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Invite someone</h2>
        <label>Email</label>
        <input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="friend@example.com" />
        <label>Name <span className="mini">(optional)</span></label>
        <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <label>Personal note <span className="mini">(optional)</span></label>
        <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="e.g. It's perfect for the salon." />
        {msg && <div className={'msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
        <div style={{ height: 10 }} />
        <button className="b" disabled={busy} onClick={() => create()}>Create Invite</button>
        <div className="mini" style={{ marginTop: 8 }}>The invite opens a sign-up page with their email filled in. Send it from your own WhatsApp or email - the app doesn't send anything by itself.</div>
        {justMade && (
          <div className="infobox" style={{ marginTop: 12 }}>
            Invite ready for <b>{justMade.email}</b>. Send it now:
            <ShareButtons inv={justMade} />
          </div>
        )}
      </div>

      <h2>Invites</h2>
      <div className="card">
        {invites.length ? invites.map(inv => {
          const done = joined.has(inv.email.toLowerCase());
          return (
            <div key={inv.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div className="row">
                <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{inv.name ? inv.name + ' · ' : ''}{inv.email}</div><div className="tag">Invited {ago(inv.created_at)}</div></div>
                <span className={'status-badge ' + (done ? 'paid' : 'sent')}>{done ? 'Joined' : 'Waiting'}</span>
              </div>
              {!done && <ShareButtons inv={inv} />}
              {!done && <a href="#" className="mini" style={{ color: 'var(--bad)' }} onClick={e => { e.preventDefault(); onDelete(inv.id); }}>Withdraw invite</a>}
            </div>
          );
        }) : <div className="mini">No invites yet.</div>}
      </div>

      {waitlist.length > 0 && (
        <>
          <h2>Waitlist</h2>
          <div className="card">
            {waitlist.map(w => {
              const done = joined.has((w.email || '').toLowerCase());
              const invited = invites.some(i => i.email.toLowerCase() === (w.email || '').toLowerCase());
              return (
                <div className="row" key={w.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{w.name ? w.name + ' · ' : ''}{w.email}</div><div className="tag">{w.mode || 'any'} · joined waitlist {ago(w.created_at)}</div></div>
                  {done ? <span className="status-badge paid">Joined</span>
                    : invited ? <span className="status-badge sent">Invited</span>
                    : <button className="b sm" style={{ width: 'auto' }} disabled={busy} onClick={() => create({ email: w.email, name: w.name })}>Invite</button>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

export default function AdminApp({ onExit }) {
  const { syncCfg, ensureToken } = useBudget();
  const [seg, setSeg] = useState('overview');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const token = await ensureToken();
      const [overview, users, sessions, invites, waitlist] = await Promise.all([
        adminApi.rpc(syncCfg, token, 'admin_overview'),
        adminApi.rpc(syncCfg, token, 'admin_users'),
        adminApi.rpc(syncCfg, token, 'admin_sessions'),
        adminApi.select(syncCfg, token, 'app_invites', 'select=*&order=created_at.desc'),
        adminApi.select(syncCfg, token, 'waitlist_signups', 'select=*&order=created_at.desc').catch(() => []),
      ]);
      setData({ overview, users: users || [], sessions: sessions || [], invites: invites || [], waitlist: waitlist || [] });
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }, [syncCfg, ensureToken]);

  useEffect(() => { load(); }, [syncCfg.token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createInvite(fields) {
    const token = await ensureToken();
    const [inv] = await adminApi.insert(syncCfg, token, 'app_invites', [fields]);
    await load();
    return inv;
  }
  async function deleteInvite(id) {
    const token = await ensureToken();
    await adminApi.remove(syncCfg, token, 'app_invites', `id=eq.${id}`);
    await load();
  }

  return (
    <>
      <header className="topnav">
        <b style={{ color: 'var(--navTx, #fff)', paddingLeft: 16, fontSize: 18 }}>To The Cent · App owner</b>
        <div style={{ flex: 1 }} />
        <button className="b g sm" style={{ width: 'auto', marginRight: 10 }} onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        <button className="b sm" style={{ width: 'auto', marginRight: 10 }} onClick={onExit}>Back to app</button>
      </header>
      <div className="wrap">
        <section className="tab on light-tab">
          <h1>App owner view</h1>
          <div className="sub">Signed in as {syncCfg.email}. You can see accounts and usage, never the contents of anyone's budget or books.</div>
          <div className="seg" style={{ marginTop: 12 }}>
            {SEGS.map(([k, l]) => <button key={k} className={seg === k ? 'on' : ''} onClick={() => setSeg(k)}>{l}</button>)}
          </div>
          {err && <div className="msg e">{err === 'not allowed' ? "This account isn't an app owner." : err}</div>}
          {!data && !err && <div className="mini">Loading…</div>}
          {data && seg === 'overview' && <Overview o={data.overview} />}
          {data && seg === 'people' && <People users={data.users} />}
          {data && seg === 'signins' && <SignIns sessions={data.sessions} users={data.users} />}
          {data && seg === 'invites' && <Invites invites={data.invites} waitlist={data.waitlist} users={data.users} onCreate={createInvite} onDelete={deleteInvite} />}
          <div style={{ height: 20 }} />
        </section>
      </div>
    </>
  );
}
