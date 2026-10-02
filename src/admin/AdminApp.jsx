import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { R } from '../lib/format.js';
import { PROFILES, FEATURES, featuresFor } from '../lib/businessProfiles.js';
import { adminApi, deviceLabel } from './adminApi.js';
import { openWhatsApp, openEmail } from '../business/share.js';
import { TrendChart, RankBars } from './charts.jsx';
import { TABLE_GROUPS, TABLE_INFO, describePolicy, fmtBytes } from './tableInfo.js';
import './portal.css';

const SITE = 'https://tothecent.co.za/';
const DAY = 864e5;

// ---------- small helpers ----------
function ago(ts) {
  if (!ts) return 'Never';
  const mins = Math.round((Date.now() - new Date(ts)) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + ' min ago';
  if (mins < 1440) return Math.round(mins / 60) + ' h ago';
  const days = Math.round(mins / 1440);
  if (days < 30) return days + ' day' + (days === 1 ? '' : 's') + ' ago';
  return shortDate(ts);
}
const shortDate = ts => ts ? new Date(ts).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const dateTime = ts => ts ? new Date(ts).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const profileLabel = k => (PROFILES.find(p => p.key === k) || {}).label || 'Not chosen yet';
const num = n => (+n || 0).toLocaleString('en-ZA');

function personStatus(u) {
  if (!u.confirmed) return ['Email not confirmed', 'warn'];
  if (!u.last_sign_in_at) return ['Never signed in', 'muted'];
  const since = Date.now() - new Date(u.last_sign_in_at);
  const active = u.last_active && Date.now() - new Date(u.last_active + 'T23:59:59') < 7 * DAY;
  if (since < 7 * DAY || active) return ['Active', 'good'];
  if (since < 30 * DAY) return ['Recent', 'info'];
  return ['Dormant', 'bad'];
}

function downloadCsv(name, rows) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Sortable column headers: click once for descending, again ascending.
function useSort(rows, initialKey, initialDir = 'desc') {
  const [sort, setSort] = useState({ key: initialKey, dir: initialDir });
  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? c : -c;
    });
    return out;
  }, [rows, sort]);
  const th = (key, label, cls = '') => (
    <th className={'sort ' + cls} onClick={() => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}>
      {label}{sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );
  return [sorted, th];
}

function Drawer({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="op-scrim" onClick={onClose} />
      <aside className="op-drawer" role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="op-drawer-h">
          <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
          <button className="op-btn" onClick={onClose}>Close</button>
        </div>
        <div className="op-drawer-b">{children}</div>
      </aside>
    </>
  );
}

function Kpi({ label, value, sub }) {
  return <div className="op-kpi"><div className="l">{label}</div><div className="v">{value}</div>{sub && <div className="s">{sub}</div>}</div>;
}

function PageHead({ title, subtitle, children }) {
  return (
    <div className="op-head">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      <div className="op-actions">{children}</div>
    </div>
  );
}

function ShareLink({ link, email, name, kind = 'invite' }) {
  const [copied, setCopied] = useState(false);
  const first = name ? ' ' + name.split(' ')[0] : '';
  const msg = kind === 'account'
    ? `Hi${first}, I've set up your To The Cent account. Open this link to choose your password and get started: ${link}`
    : `Hi${first}, I'd like you to try To The Cent - a simple way to track your money and run your business finances. Create your account here: ${link}`;
  return (
    <>
      <div className="op-linkbox">
        <input readOnly value={link} onFocus={e => e.target.select()} />
        <button className="op-btn" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div className="op-actions" style={{ marginTop: 8 }}>
        <button className="op-btn primary" onClick={() => openWhatsApp('', msg)}>Send by WhatsApp</button>
        <button className="op-btn" onClick={() => openEmail(email, kind === 'account' ? 'Your To The Cent account' : "You're invited to To The Cent", msg)}>Send by email</button>
      </div>
    </>
  );
}

// ---------- pages ----------
function Dashboard({ d, go }) {
  const o = d.overview;
  const byProfile = Object.entries(o.businesses_by_profile || {}).map(([k, v]) => ({ label: profileLabel(k === 'not chosen' ? null : k), value: v })).sort((a, b) => b.value - a.value);
  const features = Object.entries(o.feature_use || {}).map(([k, v]) => ({ label: FEATURES[k]?.label || k, value: v })).sort((a, b) => b.value - a.value);
  const signups30 = (o.signups_by_day || []).reduce((a, x) => a + x.n, 0);
  const recentPeople = [...d.users].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const needsAttention = d.users.filter(u => !u.confirmed || !u.last_sign_in_at);

  return (
    <>
      <PageHead title="Dashboard" subtitle="How To The Cent is being used, at a glance." />
      <div className="op-grid k4" style={{ marginBottom: 16 }}>
        <Kpi label="People" value={num(o.users)} sub={<><b>+{o.new_7d}</b> this week · {signups30} in 30 days</>} />
        <Kpi label="Active today" value={num(o.active_today)} sub={`${o.active_7d} in the last 7 days`} />
        <Kpi label="Signed in (30 days)" value={num(o.signed_in_30d)} sub={`${Math.round(o.signed_in_30d / Math.max(1, o.users) * 100)}% of all accounts`} />
        <Kpi label="Businesses" value={num(o.businesses)} sub={`${o.households} personal budgets`} />
      </div>
      <div className="op-grid c2">
        <div className="op-card">
          <div className="op-card-h"><h2>New sign-ups</h2><span className="op-meta">Last 30 days</span></div>
          <div className="op-card-b"><TrendChart data={o.signups_by_day || []} label="New sign-ups" unit={['sign-up', 'sign-ups']} /></div>
        </div>
        <div className="op-card">
          <div className="op-card-h"><h2>People using the app</h2><span className="op-meta">Last 30 days</span></div>
          <div className="op-card-b">
            <TrendChart data={o.active_by_day || []} label="Daily active people" unit={['person', 'people']} />
            <div className="op-note">Recorded from 2 Oct 2026, when activity tracking started.</div>
          </div>
        </div>
      </div>
      <div className="op-grid c2">
        <div className="op-card">
          <div className="op-card-h"><h2>Activity across the app</h2></div>
          <div className="op-tablewrap"><table className="op-table"><tbody>
            {[
              ['Value invoiced', R(+o.invoiced_value || 0)], ['Invoices', num(o.invoices)], ['Quotes', num(o.quotes)], ['Bookings', num(o.bookings)],
              ['Business transactions', num(o.business_transactions)], ['Expenses logged', num(o.expenses)],
              ['Bank statements uploaded', num(o.statements)], ['Personal budgets synced this week', num(o.personal_synced_7d)],
            ].map(([k, v]) => <tr key={k}><td>{k}</td><td className="num strong">{v}</td></tr>)}
          </tbody></table></div>
        </div>
        <div className="op-card">
          <div className="op-card-h"><h2>Newest people</h2><button className="op-link" onClick={() => go('people')}>View all</button></div>
          <div className="op-tablewrap"><table className="op-table"><tbody>
            {recentPeople.map(u => { const [s, c] = personStatus(u); return (
              <tr key={u.id}><td><span className="strong">{u.email}</span><span className="sub">Joined {ago(u.created_at)}</span></td><td className="num"><span className={'op-pill ' + c}>{s}</span></td></tr>
            ); })}
          </tbody></table></div>
          {needsAttention.length > 0 && <div className="op-card-b" style={{ borderTop: '1px solid var(--op-line2)' }}><span className="op-meta">{needsAttention.length} account{needsAttention.length === 1 ? ' has' : 's have'} never signed in or confirmed their email - consider a nudge.</span></div>}
        </div>
      </div>
      <div className="op-grid c2">
        <div className="op-card"><div className="op-card-h"><h2>Businesses by type</h2></div><div className="op-card-b"><RankBars rows={byProfile} empty="No businesses yet." /></div></div>
        <div className="op-card"><div className="op-card-h"><h2>Tools switched on</h2><span className="op-meta">Number of businesses</span></div><div className="op-card-b"><RankBars rows={features} empty="No tools switched on yet." /></div></div>
      </div>
    </>
  );
}

function People({ users, businesses, onNew }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [open, setOpen] = useState(null);
  const rows = useMemo(() => users.map(u => ({ ...u, status: personStatus(u), kind: u.business_name ? 'Business' : 'Personal', signin_sort: u.last_sign_in_at || '' })), [users]);
  const filtered = rows.filter(u => (!q || (u.email + ' ' + (u.business_name || '')).toLowerCase().includes(q.toLowerCase()))
    && (f === 'all' || (f === 'business' ? u.business_name : f === 'personal' ? !u.business_name : u.status[0] === f)));
  const [sorted, th] = useSort(filtered, 'signin_sort');
  const counts = s => rows.filter(u => u.status[0] === s).length;
  const biz = open && businesses.find(b => b.owner_email === open.email);

  function exportCsv() {
    downloadCsv('people.csv', [['email', 'status', 'type', 'business', 'business type', 'joined', 'last sign-in', 'days active (30d)', 'devices']]
      .concat(sorted.map(u => [u.email, u.status[0], u.kind, u.business_name, u.business_profile && profileLabel(u.business_profile), u.created_at, u.last_sign_in_at, u.active_days_30, u.devices])));
  }

  return (
    <>
      <PageHead title="People" subtitle={`${users.length} accounts`}>
        <button className="op-btn" onClick={exportCsv}>Export CSV</button>
        <button className="op-btn primary" onClick={onNew}>+ Sign someone up</button>
      </PageHead>
      <div className="op-card">
        <div className="op-toolbar">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search email or business" />
          <div className="op-chips">
            {[['all', `All ${rows.length}`], ['Active', `Active ${counts('Active')}`], ['Dormant', `Dormant ${counts('Dormant')}`], ['Never signed in', `Never signed in ${counts('Never signed in')}`], ['business', 'Business'], ['personal', 'Personal']].map(([k, l]) => (
              <button key={k} className={'op-chip' + (f === k ? ' on' : '')} onClick={() => setF(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="op-tablewrap"><table className="op-table">
          <thead><tr>{th('email', 'Person')}{th('kind', 'Type')}<th>Status</th>{th('signin_sort', 'Last sign-in')}{th('active_days_30', 'Days active', 'num')}{th('created_at', 'Joined')}</tr></thead>
          <tbody>
            {sorted.length ? sorted.map(u => (
              <tr key={u.id} className="click" onClick={() => setOpen(u)}>
                <td><span className="strong">{u.email}</span>{u.devices && <span className="sub">{u.devices}</span>}</td>
                <td>{u.business_name ? <>{u.business_name}<span className="sub">{profileLabel(u.business_profile)} · {u.business_role}</span></> : 'Personal'}</td>
                <td><span className={'op-pill ' + u.status[1]}>{u.status[0]}</span></td>
                <td>{ago(u.last_sign_in_at)}</td>
                <td className="num">{u.active_days_30 || '-'}</td>
                <td>{shortDate(u.created_at)}</td>
              </tr>
            )) : <tr><td colSpan={6} className="op-empty">Nobody matches.</td></tr>}
          </tbody>
        </table></div>
      </div>
      {open && (
        <Drawer title={open.email} subtitle={<span className={'op-pill ' + open.status[1]}>{open.status[0]}</span>} onClose={() => setOpen(null)}>
          <dl className="op-dl">
            <dt>Joined</dt><dd>{dateTime(open.created_at)}</dd>
            <dt>Last sign-in</dt><dd>{dateTime(open.last_sign_in_at)}</dd>
            <dt>Email confirmed</dt><dd>{open.confirmed ? 'Yes' : 'No'}</dd>
            <dt>Signed up for</dt><dd>{open.segment === 'business' ? 'Business' : open.segment === 'personal' ? 'Personal' : '-'}</dd>
            <dt>Days active (30 days)</dt><dd>{open.active_days_30 || 0}</dd>
            <dt>Last used the app</dt><dd>{open.last_active ? shortDate(open.last_active) : 'Not recorded yet'}</dd>
            <dt>Devices</dt><dd>{open.devices || '-'}</dd>
            <dt>Personal budget synced</dt><dd>{open.personal_last_sync ? ago(open.personal_last_sync) : 'Never'}</dd>
          </dl>
          {open.business_name && (
            <>
              <div className="op-sec">Business</div>
              <dl className="op-dl">
                <dt>Name</dt><dd>{open.business_name}</dd>
                <dt>Role</dt><dd>{open.business_role}</dd>
                <dt>Kind</dt><dd>{profileLabel(open.business_profile)}</dd>
                {biz && <><dt>Invoiced</dt><dd>{R(+biz.invoiced_value)} across {biz.invoices} invoices</dd>
                  <dt>Customers</dt><dd>{biz.customers}</dd>
                  <dt>Transactions</dt><dd>{biz.transactions}</dd></>}
              </dl>
            </>
          )}
          <div className="op-sec">Get in touch</div>
          <button className="op-btn" onClick={() => openEmail(open.email, 'To The Cent', '')}>Email {open.email}</button>
          <div className="op-note">You see accounts and activity counts only - never what is inside someone's budget or books.</div>
        </Drawer>
      )}
    </>
  );
}

function Businesses({ businesses, onNew }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [open, setOpen] = useState(null);
  const rows = useMemo(() => businesses.map(b => ({ ...b, invoiced: +b.invoiced_value || 0, owed: +b.outstanding || 0, profile_label: profileLabel(b.business_profile) })), [businesses]);
  const profiles = [...new Set(rows.map(b => b.business_profile || 'none'))];
  const filtered = rows.filter(b => (!q || (b.name + ' ' + (b.owner_email || '')).toLowerCase().includes(q.toLowerCase())) && (f === 'all' || (b.business_profile || 'none') === f));
  const [sorted, th] = useSort(filtered, 'last_activity');
  const totals = rows.reduce((a, b) => ({ inv: a.inv + b.invoiced, owed: a.owed + b.owed, tx: a.tx + +b.transactions }), { inv: 0, owed: 0, tx: 0 });

  return (
    <>
      <PageHead title="Businesses" subtitle={`${rows.length} businesses`}>
        <button className="op-btn" onClick={() => downloadCsv('businesses.csv', [['business', 'owner', 'kind', 'tools', 'members', 'customers', 'invoices', 'invoiced', 'outstanding', 'transactions', 'created', 'last activity']]
          .concat(sorted.map(b => [b.name, b.owner_email, b.profile_label, (b.features || []).join(' '), b.members, b.customers, b.invoices, b.invoiced, b.owed, b.transactions, b.created_at, b.last_activity])))}>Export CSV</button>
        <button className="op-btn primary" onClick={onNew}>+ Set up a business</button>
      </PageHead>
      <div className="op-grid k4" style={{ marginBottom: 16 }}>
        <Kpi label="Businesses" value={num(rows.length)} sub={`${rows.filter(b => !b.business_profile).length} haven't chosen a type`} />
        <Kpi label="Invoiced (all time)" value={R(totals.inv)} />
        <Kpi label="Waiting to be paid" value={R(totals.owed)} />
        <Kpi label="Transactions recorded" value={num(totals.tx)} />
      </div>
      <div className="op-card">
        <div className="op-toolbar">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search business or owner" />
          <div className="op-chips">
            <button className={'op-chip' + (f === 'all' ? ' on' : '')} onClick={() => setF('all')}>All</button>
            {profiles.map(p => <button key={p} className={'op-chip' + (f === p ? ' on' : '')} onClick={() => setF(p)}>{p === 'none' ? 'Type not chosen' : profileLabel(p)}</button>)}
          </div>
        </div>
        <div className="op-tablewrap"><table className="op-table">
          <thead><tr>{th('name', 'Business')}{th('profile_label', 'Kind')}{th('members', 'Team', 'num')}{th('customers', 'Customers', 'num')}{th('invoiced', 'Invoiced', 'num')}{th('owed', 'Outstanding', 'num')}{th('last_activity', 'Last activity')}</tr></thead>
          <tbody>
            {sorted.length ? sorted.map(b => (
              <tr key={b.id} className="click" onClick={() => setOpen(b)}>
                <td><span className="strong">{b.name}</span><span className="sub">{b.owner_email}</span></td>
                <td>{b.business_profile ? b.profile_label : <span className="op-pill muted">Not chosen</span>}</td>
                <td className="num">{b.members}</td>
                <td className="num">{b.customers}</td>
                <td className="num">{R(b.invoiced)}</td>
                <td className="num">{b.owed ? R(b.owed) : '-'}</td>
                <td>{ago(b.last_activity)}</td>
              </tr>
            )) : <tr><td colSpan={7} className="op-empty">No businesses match.</td></tr>}
          </tbody>
        </table></div>
      </div>
      {open && (
        <Drawer title={open.name} subtitle={`${open.profile_label} · ${open.business_type || ''}`} onClose={() => setOpen(null)}>
          <dl className="op-dl">
            <dt>Owner</dt><dd>{open.owner_email}</dd>
            <dt>Created</dt><dd>{dateTime(open.created_at)}</dd>
            <dt>Last activity</dt><dd>{dateTime(open.last_activity)}</dd>
            <dt>Team members</dt><dd>{open.members}</dd>
          </dl>
          <div className="op-sec">Tools switched on</div>
          <div>{(open.features || []).length ? open.features.map(k => <span className="op-tag" key={k}>{FEATURES[k]?.label || k}</span>) : <span className="op-meta">None chosen yet</span>}</div>
          <div className="op-sec">Usage</div>
          <dl className="op-dl">
            <dt>Customers</dt><dd>{open.customers}</dd>
            <dt>Invoices</dt><dd>{open.invoices} · {R(open.invoiced)} invoiced</dd>
            <dt>Outstanding</dt><dd>{R(open.owed)}</dd>
            <dt>Transactions</dt><dd>{open.transactions}</dd>
            <dt>Quotes</dt><dd>{open.quotes}</dd>
            <dt>Bookings</dt><dd>{open.bookings}</dd>
            <dt>Stock items</dt><dd>{open.stock_items}</dd>
            <dt>Staff on payroll</dt><dd>{open.employees}</dd>
          </dl>
          <div className="op-note">Totals only - individual invoices, customers and transactions stay private to the business.</div>
        </Drawer>
      )}
    </>
  );
}

function SignIns({ users, sessions }) {
  const [sortedPeople, th] = useSort(users.filter(u => u.last_sign_in_at).map(u => ({ ...u, s: u.last_sign_in_at })), 's');
  return (
    <>
      <PageHead title="Sign-ins" subtitle="Who has signed in, when, and on which devices." />
      <div className="op-grid c3">
        <div className="op-card">
          <div className="op-card-h"><h2>Latest sign-in per person</h2><span className="op-meta">{sortedPeople.length} people</span></div>
          <div className="op-tablewrap"><table className="op-table">
            <thead><tr>{th('email', 'Person')}{th('s', 'Signed in')}<th>Devices used</th></tr></thead>
            <tbody>{sortedPeople.map(u => (
              <tr key={u.id}><td className="strong">{u.email}</td><td>{ago(u.last_sign_in_at)}<span className="sub">{dateTime(u.last_sign_in_at)}</span></td><td>{u.devices || <span className="op-meta">Not recorded yet</span>}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
        <div className="op-card">
          <div className="op-card-h"><h2>Signed in right now</h2><span className="op-meta">{sessions.length} devices</span></div>
          <div className="op-tablewrap"><table className="op-table"><tbody>
            {sessions.length ? sessions.map((s, i) => (
              <tr key={i}><td><span className="strong">{s.email}</span><span className="sub">{s.user_agent ? deviceLabel(s.user_agent) : 'Unknown device'} · since {shortDate(s.signed_in_at)}</span></td><td className="num">{ago(s.last_seen)}</td></tr>
            )) : <tr><td className="op-empty">Nobody is signed in.</td></tr>}
          </tbody></table></div>
          <div className="op-card-b op-note" style={{ marginTop: 0 }}>A device leaves this list when that person logs out.</div>
        </div>
      </div>
    </>
  );
}

function Invites({ invites, waitlist, users, onCreate, onDelete }) {
  const [f, setF] = useState({ email: '', name: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [made, setMade] = useState(null);
  const joined = useMemo(() => new Set(users.map(u => (u.email || '').toLowerCase())), [users]);
  const link = inv => SITE + '?invite=' + inv.code;

  async function create(data) {
    if (!/^\S+@\S+\.\S+$/.test((data.email || '').trim())) { setMsg({ e: true, t: 'Enter a valid email address.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const inv = await onCreate({ email: data.email.trim().toLowerCase(), name: data.name?.trim() || null, note: data.note?.trim() || null });
      setMade(inv); setF({ email: '', name: '', note: '' });
    } catch (e) { setMsg({ e: true, t: e.message }); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title="Invites" subtitle="Send someone a link to create their own account." />
      <div className="op-grid c3">
        <div>
          <div className="op-card">
            <div className="op-card-h"><h2>Invites sent</h2><span className="op-meta">{invites.length}</span></div>
            <div className="op-tablewrap"><table className="op-table">
              <thead><tr><th>Person</th><th>Sent</th><th>Status</th><th /></tr></thead>
              <tbody>{invites.length ? invites.map(inv => {
                const done = joined.has(inv.email.toLowerCase());
                return (
                  <tr key={inv.id}>
                    <td><span className="strong">{inv.name || inv.email}</span>{inv.name && <span className="sub">{inv.email}</span>}{inv.note && <span className="sub">{inv.note}</span>}</td>
                    <td>{ago(inv.created_at)}</td>
                    <td><span className={'op-pill ' + (done ? 'good' : 'info')}>{done ? 'Joined' : 'Waiting'}</span></td>
                    <td className="num">{!done && <><button className="op-link" onClick={() => setMade(inv)}>Share</button>{' · '}<button className="op-link" style={{ color: 'var(--op-bad)' }} onClick={() => onDelete(inv.id)}>Withdraw</button></>}</td>
                  </tr>
                );
              }) : <tr><td colSpan={4} className="op-empty">No invites yet.</td></tr>}</tbody>
            </table></div>
          </div>
          {waitlist.length > 0 && (
            <div className="op-card">
              <div className="op-card-h"><h2>Waitlist</h2><span className="op-meta">{waitlist.length}</span></div>
              <div className="op-tablewrap"><table className="op-table"><tbody>
                {waitlist.map(w => {
                  const done = joined.has((w.email || '').toLowerCase());
                  const invited = invites.some(i => i.email.toLowerCase() === (w.email || '').toLowerCase());
                  return (
                    <tr key={w.id}>
                      <td><span className="strong">{w.name || w.email}</span><span className="sub">{w.email} · {w.mode || 'any'} · {ago(w.created_at)}</span></td>
                      <td className="num">{done ? <span className="op-pill good">Joined</span> : invited ? <span className="op-pill info">Invited</span>
                        : <button className="op-btn" disabled={busy} onClick={() => create({ email: w.email, name: w.name })}>Invite</button>}</td>
                    </tr>
                  );
                })}
              </tbody></table></div>
            </div>
          )}
        </div>
        <div className="op-card">
          <div className="op-card-h"><h2>New invite</h2></div>
          <div className="op-card-b">
            <label className="op-lbl" style={{ marginTop: 0 }}>Email</label>
            <input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="name@example.com" />
            <label className="op-lbl">Name (optional)</label>
            <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
            <label className="op-lbl">Note (optional)</label>
            <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="Added to the message" />
            {msg && <div className={'op-msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
            <div style={{ height: 12 }} />
            <button className="op-btn primary" disabled={busy} onClick={() => create(f)}>Create invite link</button>
            {made && (
              <div className="op-msg i">
                Invite for <b>{made.email}</b>:
                <ShareLink link={link(made)} email={made.email} name={made.name} />
              </div>
            )}
            <div className="op-note">They create their own account and password from the link. To set an account up for them, use <b>Sign up</b>.</div>
          </div>
        </div>
      </div>
    </>
  );
}

function SignUp({ onCreated, initialKind = 'person' }) {
  const { syncCfg, ensureToken } = useBudget();
  const [kind, setKind] = useState(initialKind);
  const [f, setF] = useState({ email: '', name: '', bizName: '', businessType: 'Sole Proprietor', profile: '', industry: '', hasStaff: false, vat: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const features = kind === 'business' && f.profile ? featuresFor(f.profile, { hasStaff: f.hasStaff, vatRegistered: f.vat }) : [];

  async function submit() {
    setErr('');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) { setErr('Enter a valid email address.'); return; }
    if (kind === 'business' && !f.bizName.trim()) { setErr('Give the business a name.'); return; }
    if (kind === 'business' && !f.profile) { setErr('Choose what kind of business it is.'); return; }
    setBusy(true);
    try {
      const token = await ensureToken();
      const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/functions/v1/admin-create-account', {
        method: 'POST',
        headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: f.email.trim(), name: f.name.trim(), segment: kind === 'business' ? 'business' : 'personal',
          business: kind === 'business' ? { name: f.bizName.trim(), business_type: f.businessType, profile: f.profile, industry: f.industry.trim(), features } : null,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `Could not create the account (${r.status})`);
      setDone({ ...body, email: f.email.trim().toLowerCase(), name: f.name.trim(), bizName: kind === 'business' ? f.bizName.trim() : null });
      setF({ email: '', name: '', bizName: '', businessType: 'Sole Proprietor', profile: '', industry: '', hasStaff: false, vat: false });
      onCreated();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title="Sign someone up" subtitle="Create an account for a person, or a person and their business, ready to use." />
      <div className="op-grid c3">
        <div className="op-card">
          <div className="op-card-h">
            <h2>New account</h2>
            <div className="op-seg">
              <button className={kind === 'person' ? 'on' : ''} onClick={() => setKind('person')}>Person</button>
              <button className={kind === 'business' ? 'on' : ''} onClick={() => setKind('business')}>Business</button>
            </div>
          </div>
          <div className="op-card-b">
            <div className="op-grid c2" style={{ gap: 12 }}>
              <div><label className="op-lbl" style={{ marginTop: 0 }}>Their email</label><input type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="name@example.com" /></div>
              <div><label className="op-lbl" style={{ marginTop: 0 }}>Their name</label><input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Optional" /></div>
            </div>
            {kind === 'business' && (
              <>
                <div className="op-grid c2" style={{ gap: 12 }}>
                  <div><label className="op-lbl">Business name</label><input value={f.bizName} onChange={e => set('bizName', e.target.value)} placeholder="e.g. Mokoena Plumbing" /></div>
                  <div><label className="op-lbl">Legal form</label>
                    <select value={f.businessType} onChange={e => set('businessType', e.target.value)}>
                      {['Sole Proprietor', 'Private Company', 'Partnership', 'Other'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <label className="op-lbl">Kind of business</label>
                <div className="op-profiles">
                  {PROFILES.map(p => (
                    <button key={p.key} type="button" className={'op-profile' + (f.profile === p.key ? ' on' : '')} onClick={() => set('profile', p.key)}>
                      <b>{p.icon} {p.label}</b><span>{p.examples}</span>
                    </button>
                  ))}
                </div>
                <label className="op-lbl">What they do (optional)</label>
                <input value={f.industry} onChange={e => set('industry', e.target.value)} placeholder="e.g. Residential plumbing" />
                <label className="op-check"><input type="checkbox" checked={f.hasStaff} onChange={e => set('hasStaff', e.target.checked)} />They pay staff (adds wages, PAYE &amp; UIF)</label>
                <label className="op-check"><input type="checkbox" checked={f.vat} onChange={e => set('vat', e.target.checked)} />VAT-registered (adds VAT returns)</label>
              </>
            )}
            {err && <div className="op-msg e">{err}</div>}
            <div style={{ height: 16 }} />
            <button className="op-btn primary" disabled={busy} onClick={submit}>{busy ? 'Creating…' : kind === 'business' ? 'Create account and business' : 'Create account'}</button>
          </div>
        </div>
        <div>
          {done ? (
            <div className="op-card">
              <div className="op-card-h"><h2>Account ready</h2><span className="op-pill good">Created</span></div>
              <div className="op-card-b">
                <div><b>{done.email}</b>{done.bizName && <> · {done.bizName}</>}</div>
                <div className="op-note" style={{ marginTop: 4 }}>Send them this link. It opens To The Cent and asks them to choose their password{done.bizName ? ', then takes them straight into their business' : ''}.</div>
                <ShareLink link={done.link} email={done.email} name={done.name} kind="account" />
                <div className="op-note">The link works once. If it expires, they can use "Forgot password?" on the login screen with this email.</div>
              </div>
            </div>
          ) : (
            <div className="op-card">
              <div className="op-card-h"><h2>How it works</h2></div>
              <div className="op-card-b op-note" style={{ marginTop: 0 }}>
                <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>You create the account{kind === 'business' ? ' and their business, with the right tools switched on' : ''}.</li>
                  <li>You get a personal link to send them by WhatsApp or email.</li>
                  <li>They open it and choose their own password - you never see it.</li>
                </ol>
              </div>
            </div>
          )}
          {kind === 'business' && features.length > 0 && !done && (
            <div className="op-card">
              <div className="op-card-h"><h2>Tools they'll get</h2></div>
              <div className="op-card-b">{features.map(k => <span className="op-tag" key={k}>{FEATURES[k].label}</span>)}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Database({ db, loading, onLoad }) {
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { if (!db && !loading) onLoad(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!db) return <><PageHead title="Database" subtitle="Loading database details…" /><div className="op-card"><div className="op-empty">Loading…</div></div></>;
  const tables = db.tables.filter(t => !q || t.name.includes(q.toLowerCase()) || (TABLE_INFO[t.name]?.[1] || '').toLowerCase().includes(q.toLowerCase()));
  const totalRows = db.tables.reduce((a, t) => a + t.rows, 0);
  const noRls = db.tables.filter(t => !t.rls);
  const storageBytes = db.buckets.reduce((a, b) => a + +b.bytes, 0);
  const grouped = TABLE_GROUPS.map(g => ({ ...g, tables: tables.filter(t => (TABLE_INFO[t.name]?.[0] || 'platform') === g.key) })).filter(g => g.tables.length);

  return (
    <>
      <PageHead title="Database" subtitle="Every table in your Supabase database: what it holds, how big it is, and who can access it.">
        <button className="op-btn" onClick={onLoad} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </PageHead>
      <div className="op-grid k4" style={{ marginBottom: 16 }}>
        <Kpi label="Tables" value={db.tables.length} sub={`${db.auth_users} accounts in Supabase Auth`} />
        <Kpi label="Rows" value={num(totalRows)} sub={`${num(db.tables.reduce((a, t) => a + (t.added_7d || 0), 0))} added this week`} />
        <Kpi label="Database size" value={fmtBytes(db.database_bytes)} sub="Including Supabase's own tables" />
        <Kpi label="Files stored" value={num(db.buckets.reduce((a, b) => a + +b.objects, 0))} sub={fmtBytes(storageBytes) + ' in ' + db.buckets.length + ' buckets'} />
      </div>
      <div className={'op-msg ' + (noRls.length ? 'e' : 's')} style={{ marginTop: 0, marginBottom: 16 }}>
        {noRls.length ? `Security check: ${noRls.map(t => t.name).join(', ')} ${noRls.length === 1 ? 'has' : 'have'} row-level security switched OFF - anyone with the public key could read ${noRls.length === 1 ? 'it' : 'them'}.`
          : `Security check: all ${db.tables.length} tables have row-level security on, so people can only reach the rows their rules allow.`}
      </div>
      <div className="op-card">
        <div className="op-toolbar"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tables" /></div>
        <div className="op-tablewrap"><table className="op-table">
          <thead><tr><th>Table</th><th className="num">Rows</th><th className="num">New this week</th><th className="num">Size</th><th className="num">Columns</th><th>Security</th></tr></thead>
          {grouped.map(g => (
            <tbody key={g.key}>
              <tr><td colSpan={6} style={{ background: 'var(--op-surface2)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--op-ink3)' }}>{g.label}</td></tr>
              {g.tables.map(t => (
                <tr key={t.name} className="click" onClick={() => setOpen(t)}>
                  <td><span className="op-mono strong">{t.name}</span><span className="sub">{TABLE_INFO[t.name]?.[1] || t.comment || ''}</span></td>
                  <td className="num strong">{num(t.rows)}</td>
                  <td className="num">{t.added_7d == null ? '-' : t.added_7d ? '+' + num(t.added_7d) : '0'}</td>
                  <td className="num">{fmtBytes(t.bytes)}</td>
                  <td className="num">{t.columns.length}</td>
                  <td>{t.rls ? <span className="op-pill good">Protected · {t.policies.length} rule{t.policies.length === 1 ? '' : 's'}</span> : <span className="op-pill bad">Open</span>}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table></div>
      </div>
      <div className="op-grid c2">
        <div className="op-card">
          <div className="op-card-h"><h2>File storage</h2></div>
          <div className="op-tablewrap"><table className="op-table">
            <thead><tr><th>Bucket</th><th className="num">Files</th><th className="num">Size</th><th>Access</th></tr></thead>
            <tbody>{db.buckets.map(b => <tr key={b.name}><td className="op-mono strong">{b.name}</td><td className="num">{num(b.objects)}</td><td className="num">{fmtBytes(+b.bytes)}</td><td><span className={'op-pill ' + (b.public ? 'warn' : 'good')}>{b.public ? 'Public' : 'Private'}</span></td></tr>)}</tbody>
          </table></div>
        </div>
        <div className="op-card">
          <div className="op-card-h"><h2>Change history</h2><span className="op-meta">{db.migrations.length} migrations applied</span></div>
          <div className="op-tablewrap" style={{ maxHeight: 280, overflowY: 'auto' }}><table className="op-table"><tbody>
            {db.migrations.map(m => <tr key={m.version}><td className="op-mono">{m.name}</td><td className="num op-meta">{m.version.replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3')}</td></tr>)}
          </tbody></table></div>
        </div>
      </div>
      {open && (
        <Drawer title={open.name} subtitle={TABLE_INFO[open.name]?.[1]} onClose={() => setOpen(null)}>
          <dl className="op-dl">
            <dt>Rows</dt><dd>{num(open.rows)}{open.added_7d ? ` (${num(open.added_7d)} this week)` : ''}</dd>
            <dt>Size on disk</dt><dd>{fmtBytes(open.bytes)}</dd>
            <dt>Row-level security</dt><dd>{open.rls ? 'On' : 'OFF - readable by anyone with the public key'}</dd>
          </dl>
          <div className="op-sec">Who can do what</div>
          {open.policies.length ? (
            <table className="op-table" style={{ border: '1px solid var(--op-line)', borderRadius: 8 }}><tbody>
              {open.policies.map(p => { const d = describePolicy(p); return <tr key={p.name}><td className="strong" style={{ width: 90 }}>{d.action}</td><td>{d.who}<span className="sub op-mono">{p.name}</span></td></tr>; })}
            </tbody></table>
          ) : <div className="op-meta">{open.rls ? 'No rules - only the server itself can read or write this table.' : 'No rules.'}</div>}
          <div className="op-sec">Columns</div>
          <table className="op-table" style={{ border: '1px solid var(--op-line)', borderRadius: 8 }}>
            <thead><tr><th>Name</th><th>Type</th><th>Notes</th></tr></thead>
            <tbody>{open.columns.map(c => (
              <tr key={c.name}>
                <td className="op-mono strong">{c.name}</td>
                <td className="op-mono">{c.type}</td>
                <td>{!c.nullable && <span className="op-tag">required</span>}{c.references && <span className="op-tag">→ {c.references}</span>}{c.default && <span className="sub op-mono">default {c.default.length > 40 ? c.default.slice(0, 40) + '…' : c.default}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="op-note">Shows structure only. To look at individual rows, use the Table Editor in your Supabase dashboard.</div>
        </Drawer>
      )}
    </>
  );
}

// ---------- shell ----------
const I = {
  dash: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2" /></>,
  biz: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></>,
  signin: <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></>,
  invite: <><path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" /><path d="M3 6l9 7 9-7" /></>,
  add: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  db: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
};
const PAGES = [['dashboard', 'Dashboard', I.dash], ['people', 'People', I.people], ['businesses', 'Businesses', I.biz], ['signins', 'Sign-ins', I.signin], ['invites', 'Invites', I.invite], ['signup', 'Sign up', I.add], ['database', 'Database', I.db]];

export default function AdminApp({ onExit }) {
  const { syncCfg, ensureToken } = useBudget();
  const [page, setPage] = useState(() => { try { return sessionStorage.getItem('wnOwnerPage') || 'dashboard'; } catch { return 'dashboard'; } });
  const [signupKind, setSignupKind] = useState('person');
  const [data, setData] = useState(null);
  const [db, setDb] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(null);

  const go = p => { setPage(p); try { sessionStorage.setItem('wnOwnerPage', p); } catch { /* ignore */ } document.querySelector('.op-main')?.scrollTo(0, 0); };

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const token = await ensureToken();
      const [overview, users, sessions, businesses, invites, waitlist] = await Promise.all([
        adminApi.rpc(syncCfg, token, 'admin_overview'),
        adminApi.rpc(syncCfg, token, 'admin_users'),
        adminApi.rpc(syncCfg, token, 'admin_sessions'),
        adminApi.rpc(syncCfg, token, 'admin_businesses').catch(() => []),
        adminApi.select(syncCfg, token, 'app_invites', 'select=*&order=created_at.desc'),
        adminApi.select(syncCfg, token, 'waitlist_signups', 'select=*&order=created_at.desc').catch(() => []),
      ]);
      setData({ overview, users: users || [], sessions: sessions || [], businesses: businesses || [], invites: invites || [], waitlist: waitlist || [] });
      setLoadedAt(new Date());
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }, [syncCfg, ensureToken]);

  const loadDb = useCallback(async () => {
    setDbLoading(true);
    try { const token = await ensureToken(); setDb(await adminApi.rpc(syncCfg, token, 'admin_database')); }
    catch (e) { setErr(e.message); } finally { setDbLoading(false); }
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
  const startSignup = kind => { setSignupKind(kind); go('signup'); };
  const counts = data ? { people: data.users.length, businesses: data.businesses.length, invites: data.invites.filter(i => !data.users.some(u => (u.email || '').toLowerCase() === i.email.toLowerCase())).length } : {};

  return (
    <div className="op">
      <nav className="op-side" aria-label="Owner portal">
        <div className="op-brand"><div className="op-logo">TC</div><div><b>To The Cent</b><span>Owner portal</span></div></div>
        <div className="op-nav">
          {PAGES.map(([k, label, icon]) => (
            <button key={k} className={page === k ? 'on' : ''} onClick={() => go(k)} aria-current={page === k ? 'page' : undefined}>
              <svg viewBox="0 0 24 24">{icon}</svg>{label}{counts[k] ? <span className="op-count">{counts[k]}</span> : null}
            </button>
          ))}
        </div>
        <div className="op-sidefoot">
          <div>Signed in as</div><div className="who">{syncCfg.email}</div>
          <button onClick={onExit}>← Back to the app</button>
        </div>
      </nav>
      <main className="op-main">
        <div className="op-page">
          {err && <div className="op-msg e" style={{ marginTop: 0, marginBottom: 16 }}>{err === 'not allowed' ? "This account isn't an app owner." : err}</div>}
          {!data && !err && <div className="op-empty">Loading…</div>}
          {data && (
            <>
              {page !== 'database' && <div className="op-actions" style={{ justifyContent: 'flex-end', marginBottom: -8 }}>
                <span className="op-meta">{loadedAt ? 'Updated ' + loadedAt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                <button className="op-btn" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
              </div>}
              {page === 'dashboard' && <Dashboard d={data} go={go} />}
              {page === 'people' && <People users={data.users} businesses={data.businesses} onNew={() => startSignup('person')} />}
              {page === 'businesses' && <Businesses businesses={data.businesses} onNew={() => startSignup('business')} />}
              {page === 'signins' && <SignIns users={data.users} sessions={data.sessions} />}
              {page === 'invites' && <Invites invites={data.invites} waitlist={data.waitlist} users={data.users} onCreate={createInvite} onDelete={deleteInvite} />}
              {page === 'signup' && <SignUp key={signupKind} initialKind={signupKind} onCreated={load} />}
              {page === 'database' && <Database db={db} loading={dbLoading} onLoad={loadDb} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
