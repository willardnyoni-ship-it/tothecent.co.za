import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { R } from '../lib/format.js';
import { PROFILES, FEATURES, featuresFor } from '../lib/businessProfiles.js';
import { adminApi, deviceLabel } from './adminApi.js';
import { openWhatsApp, openEmail } from '../business/share.js';
import { TrendChart, RankBars } from './charts.jsx';
import { TABLE_GROUPS, TABLE_INFO, describePolicy, fmtBytes } from './tableInfo.js';
import Retention from './Retention.jsx';
import Preview from './Preview.jsx';
import { REASONS } from '../lib/signupAttempts.js';
import './portal.css';

const SITE = 'https://tothecent.co.za/';
// The admin-create-account Edge Function (supabase/functions/admin-create-account)
// was deployed from the dashboard editor, which gave it the URL slug
// 'quick-function' - its display name is admin-create-account, but calls
// go by slug. Change this if it's ever redeployed under its own slug.
const CREATE_ACCOUNT_FN = 'quick-function';
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

const isSuspended = u => !!u.banned_until && new Date(u.banned_until) > new Date();

// Plans and subscriptions. Everyone gets one month free from the day they
// join (the owner can move that date); the owner records the subscription.
// Returns { key, label, tone, sub } for the Plan column.
const ymd = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function defaultTrialEnd(createdAt) {
  const d = new Date(createdAt);
  d.setMonth(d.getMonth() + 1);
  return ymd(d);
}
function billingState(u) {
  if (u.is_admin) return { key: 'owner', label: 'App owner', tone: 'muted', sub: 'No billing' };
  const end = u.trial_ends_on;
  const left = end ? Math.ceil((new Date(end + 'T23:59:59') - Date.now()) / DAY) : null;
  const st = u.debit_order_status || 'none';
  if (st === 'signed') {
    const first = end && new Date(end + 'T23:59:59') >= new Date(u.debit_order_signed_on + 'T00:00:00');
    return { key: 'signed', label: 'Subscribed', tone: 'good', sub: first && left > 0 ? `First payment ${shortDate(end)}` : 'Paying' };
  }
  if (st === 'cancelled') return { key: 'cancelled', label: 'Subscription cancelled', tone: 'bad', sub: end ? `Free month ${left > 0 ? 'ends' : 'ended'} ${shortDate(end)}` : '' };
  if (left > 0) return { key: 'trial', label: left === 1 ? 'Free trial · 1 day left' : `Free trial · ${left} days left`, tone: 'info', sub: `Ends ${shortDate(end)}` };
  return { key: 'ended', label: 'Free month ended', tone: 'warn', sub: `Ended ${shortDate(end)} · no subscription` };
}
const DEBIT_LABEL = { none: 'Not signed up', requested: 'Requested', signed: 'Subscribed', cancelled: 'Cancelled' };

function personStatus(u) {
  if (isSuspended(u)) return ['Suspended', 'bad'];
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
  const msg = kind === 'team'
    ? `Hi${first}, I've added you to the To The Cent owner portal. Open this link to choose your password: ${link}\n\nThen sign in and open the portal here: ${SITE}app/?mode=admin`
    : kind === 'account'
    ? `Hi${first}, I've set up your To The Cent account. Open this link to choose your password and get started: ${link}`
    : kind === 'signin'
    ? `Hi${first}, here's a link to set a new password and sign in to To The Cent. It works once: ${link}`
    : `Hi${first}, I'd like you to try To The Cent - a simple way to track your money and run your business finances. Create your account here: ${link}`;
  return (
    <>
      <div className="op-linkbox">
        <input readOnly value={link} onFocus={e => e.target.select()} />
        <button className="op-btn" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div className="op-actions" style={{ marginTop: 8 }}>
        <button className="op-btn primary" onClick={() => openWhatsApp('', msg)}>Send by WhatsApp</button>
        <button className="op-btn" onClick={() => openEmail(email, kind === 'team' ? 'Your To The Cent portal access' : kind === 'account' ? 'Your To The Cent account' : kind === 'signin' ? 'Sign in to To The Cent' : "You're invited to To The Cent", msg)}>Send by email</button>
      </div>
    </>
  );
}

// Calls the owner-only account Edge Function (create, sign-in link,
// suspend, unsuspend, delete). Throws with the function's own message.
function useAccountFn() {
  const { syncCfg, ensureToken } = useBudget();
  return useCallback(async (payload) => {
    const token = await ensureToken();
    const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/functions/v1/' + CREATE_ACCOUNT_FN, {
      method: 'POST',
      headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
    return body;
  }, [syncCfg, ensureToken]);
}

// Emails the person Supabase's password-reset link (the same email as
// "Forgot password?" on the sign-in box). Following it lets them choose a
// password and sign in; it also confirms an email that was never confirmed.
function useSendReset() {
  const { syncCfg, ensureToken } = useBudget();
  return useCallback(async (person) => {
    const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/auth/v1/recover?redirect_to=' + encodeURIComponent(SITE), {
      method: 'POST',
      headers: { apikey: syncCfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: person.email }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      const m = d.msg || d.message || d.error_description || '';
      if (/rate limit|too many|only request this after|seconds/i.test(m)) {
        throw new Error(/seconds/i.test(m) ? 'An email was sent to them a moment ago - wait a minute before sending another.' : "Supabase's email limit has been reached for now. Try again in a while, or use \"Create sign-in link\" and send it yourself.");
      }
      if (r.status >= 500) throw new Error("The email service didn't respond (error " + r.status + "). Supabase's built-in email is unreliable. Use \"Create sign-in link\" and send it on WhatsApp, and connect your own email service in Supabase (Authentication, Emails, SMTP).");
      throw new Error(m || `Could not send (${r.status}).`);
    }
    // Best effort: the email is already on its way, so a failed log write isn't an error.
    try { const token = await ensureToken(); await adminApi.rpc(syncCfg, token, 'admin_log_action', { p_target: person.id, p_action: 'reset_email_sent', p_details: person.confirmed ? null : 'Email was not confirmed' }); } catch { /* ignore */ }
  }, [syncCfg, ensureToken]);
}

const ACTION_LABEL = { reset_email_sent: 'Password reset email sent', login_sent: 'Login details sent', billing_updated: 'Plan / subscription updated', sent_signin_link: 'Sign-in link created', team_added: 'Portal team member added', team_removed: 'Portal team member removed', suspended: 'Suspended', unsuspended: 'Re-enabled', deleted: 'Account deleted' };

// The "Account actions" block in a person's detail panel.
function AccountActions({ person, me, onChanged, onDeleted }) {
  const { syncCfg, ensureToken } = useBudget();
  const call = useAccountFn();
  const sendReset = useSendReset();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [link, setLink] = useState(null);
  const [confirming, setConfirming] = useState(null); // 'suspend' | 'delete'
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [log, setLog] = useState([]);
  const suspended = isSuspended(person);
  const isMe = person.email === me;

  const loadLog = useCallback(async () => {
    try {
      const token = await ensureToken();
      setLog(await adminApi.select(syncCfg, token, 'app_admin_log', `target_id=eq.${person.id}&select=*&order=created_at.desc&limit=20`) || []);
    } catch { setLog([]); }
  }, [person.id, syncCfg, ensureToken]);
  useEffect(() => { loadLog(); }, [loadLog]);

  async function run(payload, done) {
    setBusy(true); setMsg(null);
    try { const r = await call({ ...payload, user_id: person.id }); await done(r); await loadLog(); }
    catch (e) { setMsg({ e: true, t: e.message }); }
    finally { setBusy(false); }
  }

  if (isMe) return <div className="op-note">This is your own account - account actions aren't available on it.</div>;
  if (person.is_admin) return <div className="op-note">This person is an app owner, so they can't be suspended or deleted from here.</div>;

  return (
    <>
      <div className="op-actions" style={{ flexWrap: 'wrap' }}>
        <button className="op-btn primary" disabled={busy || isSuspended(person)} onClick={async () => {
          setBusy(true); setMsg(null); setLink(null);
          try { await sendReset(person); setMsg({ t: `Password reset email sent to ${person.email}. They follow the link, choose a password and are signed in.` }); await loadLog(); }
          catch (e) { setMsg({ e: true, t: e.message }); }
          finally { setBusy(false); }
        }}>Email password reset</button>
        <button className="op-btn" disabled={busy} onClick={() => run({ action: 'signin_link' }, r => { setLink(r.link); setConfirming(null); })}>Create sign-in link</button>
        {suspended
          ? <button className="op-btn" disabled={busy} onClick={() => run({ action: 'unsuspend' }, async () => { setMsg({ t: 'Re-enabled - they can sign in again.' }); await onChanged(); })}>Re-enable account</button>
          : <button className="op-btn danger" disabled={busy} onClick={() => { setConfirming('suspend'); setLink(null); }}>Suspend</button>}
        {!person.owns_business && <button className="op-btn danger" disabled={busy} onClick={() => { setConfirming('delete'); setTyped(''); setLink(null); }}>Delete account</button>}
      </div>

      {link && (
        <div className="op-msg i">
          One-time link for <b>{person.email}</b> to set a new password and sign in:
          <ShareLink link={link} email={person.email} kind="signin" />
        </div>
      )}

      {confirming === 'suspend' && (
        <div className="op-msg e">
          <b>Suspend {person.email}?</b> They won't be able to sign in. Nothing is deleted, and you can re-enable them any time.
          {person.owns_business && <> Their business stays as it is, but its team won't be able to reach the owner's account.</>}
          <label className="op-lbl">Reason (optional, for your records)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Asked to pause their account" />
          <div className="op-actions" style={{ marginTop: 10 }}>
            <button className="op-btn danger" disabled={busy} onClick={() => run({ action: 'suspend', reason }, async () => { setConfirming(null); setReason(''); setMsg({ t: 'Suspended.' }); await onChanged(); })}>Yes, suspend</button>
            <button className="op-btn" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
          </div>
        </div>
      )}

      {confirming === 'delete' && (
        <div className="op-msg e">
          <b>Permanently delete {person.email}?</b> This removes their account and their personal budget (unless a partner still shares it). It can't be undone.
          <label className="op-lbl">Type their email to confirm</label>
          <input value={typed} onChange={e => setTyped(e.target.value)} placeholder={person.email} autoComplete="off" />
          <div className="op-actions" style={{ marginTop: 10 }}>
            <button className="op-btn danger" disabled={busy || typed.trim().toLowerCase() !== (person.email || '').toLowerCase()}
              onClick={() => run({ action: 'delete', confirm_email: typed }, async () => { setConfirming(null); await onDeleted(); })}>Delete permanently</button>
            <button className="op-btn" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
          </div>
        </div>
      )}

      {!person.confirmed && <div className="op-note">Their email was never confirmed. The reset email's link confirms it and lets them choose a password, so it works for them too.</div>}
      {person.owns_business && <div className="op-note">They own a business, so the account can't be deleted here - that would also erase the whole business. Suspend instead if needed.</div>}
      {msg && <div className={'op-msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}

      {log.length > 0 && (
        <>
          <div className="op-sec">History</div>
          <table className="op-table" style={{ border: '1px solid var(--op-line)', borderRadius: 8 }}><tbody>
            {log.map(l => (
              <tr key={l.id}><td><span className="strong">{ACTION_LABEL[l.action] || l.action}</span><span className="sub">by {l.actor_email}{l.details ? ' · ' + l.details : ''}</span></td><td className="num op-meta">{dateTime(l.created_at)}</td></tr>
            ))}
          </tbody></table>
        </>
      )}
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

// The "Plan & subscription" block in a person's detail panel.
function BillingEditor({ person, onSaved }) {
  const { syncCfg, ensureToken } = useBudget();
  const bill = billingState(person);
  const defaultEnd = defaultTrialEnd(person.created_at);
  const [status, setStatus] = useState(person.debit_order_status || 'none');
  const [signedOn, setSignedOn] = useState(person.debit_order_signed_on || '');
  const [trialEnd, setTrialEnd] = useState(person.trial_ends_on || defaultEnd);
  const [notes, setNotes] = useState(person.billing_notes || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (person.is_admin) return <div className="op-note">This is an app owner account, so there's no plan or subscription to track.</div>;

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const token = await ensureToken();
      await adminApi.rpc(syncCfg, token, 'admin_set_billing', {
        p_user: person.id, p_status: status,
        p_signed_on: status === 'signed' ? (signedOn || ymd(new Date())) : (signedOn || null),
        p_trial_ends: trialEnd && trialEnd !== defaultEnd ? trialEnd : null,
        p_notes: notes,
      });
      setMsg({ t: 'Saved.' });
      await onSaved();
    } catch (e) { setMsg({ e: true, t: e.message }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <dl className="op-dl">
        <dt>Plan</dt><dd>{person.business_name || person.segment === 'business' ? 'Business' : 'Personal'} - one month free, then a monthly subscription</dd>
        <dt>Where they stand</dt><dd><span className={'op-pill ' + bill.tone}>{bill.label}</span>{bill.sub && <span className="op-meta" style={{ marginLeft: 8 }}>{bill.sub}</span>}</dd>
        <dt>Joined (free month starts)</dt><dd>{shortDate(person.created_at)}</dd>
      </dl>
      <label className="op-lbl">Subscription</label>
      <select value={status} onChange={e => { setStatus(e.target.value); if (e.target.value === 'signed' && !signedOn) setSignedOn(ymd(new Date())); }}>
        {Object.entries(DEBIT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {status === 'signed' && (
        <>
          <label className="op-lbl">Date they subscribed</label>
          <input type="date" value={signedOn} max={ymd(new Date())} onChange={e => setSignedOn(e.target.value)} />
        </>
      )}
      <label className="op-lbl">Free month ends</label>
      <input type="date" value={trialEnd} onChange={e => setTrialEnd(e.target.value)} />
      <div className="op-note" style={{ marginTop: 4 }}>
        {trialEnd === defaultEnd ? 'One month after they joined.' : <>Changed from {shortDate(defaultEnd)}. <a href="#" onClick={e => { e.preventDefault(); setTrialEnd(defaultEnd); }}>Reset</a></>}
      </div>
      <label className="op-lbl">Notes (only you see these)</label>
      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Form sent on WhatsApp, bank: FNB" />
      <div className="op-actions" style={{ marginTop: 10 }}>
        <button className="op-btn primary" disabled={busy} onClick={save}>Save plan details</button>
      </div>
      {msg && <div className={'op-msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
    </>
  );
}

function People({ users, businesses, onNew, onChanged, me }) {
  const sendReset = useSendReset();
  const [sending, setSending] = useState(null); // email being sent
  const [notice, setNotice] = useState(null);
  async function quickReset(u) {
    setSending(u.email); setNotice(null);
    try { await sendReset(u); setNotice({ t: `Password reset email sent to ${u.email}.` }); }
    catch (e) { setNotice({ e: true, t: `${u.email}: ${e.message}` }); }
    finally { setSending(null); }
  }
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [open, setOpen] = useState(null);
  const rows = useMemo(() => users.map(u => ({ ...u, status: personStatus(u), kind: u.business_name ? 'Business' : 'Personal', signin_sort: u.last_sign_in_at || '', bill: billingState(u), debit_sort: u.debit_order_signed_on || '', trial_sort: u.trial_ends_on || '' })), [users]);
  const filtered = rows.filter(u => (!q || (u.email + ' ' + (u.business_name || '')).toLowerCase().includes(q.toLowerCase()))
    && (f === 'all' || (f === 'business' ? u.business_name : f === 'personal' ? !u.business_name : ['trial', 'ended', 'signed'].includes(f) ? u.bill.key === f : u.status[0] === f)));
  const [sorted, th] = useSort(filtered, 'signin_sort');
  const counts = s => rows.filter(u => u.status[0] === s).length;
  const billCount = k => rows.filter(u => u.bill.key === k).length;
  // Keep the open panel in step with refreshed data (e.g. after suspending).
  const current = open && (rows.find(u => u.id === open.id) || open);
  const biz = current && businesses.find(b => b.owner_email === current.email);

  function exportCsv() {
    downloadCsv('people.csv', [['email', 'status', 'type', 'business', 'business type', 'plan status', 'free month ends', 'subscription', 'subscribed', 'joined', 'last sign-in', 'days active (30d)', 'devices']]
      .concat(sorted.map(u => [u.email, u.status[0], u.kind, u.business_name, u.business_profile && profileLabel(u.business_profile), u.bill.label, u.trial_ends_on, DEBIT_LABEL[u.debit_order_status || 'none'], u.debit_order_signed_on, u.created_at, u.last_sign_in_at, u.active_days_30, u.devices])));
  }

  return (
    <>
      <PageHead title="People" subtitle={`${users.length} accounts`}>
        <button className="op-btn" onClick={exportCsv}>Export CSV</button>
        <button className="op-btn primary" onClick={onNew}>+ Sign someone up</button>
      </PageHead>
      {notice && <div className={'op-msg ' + (notice.e ? 'e' : 's')} style={{ marginBottom: 12 }}>{notice.t}</div>}
      <div className="op-card">
        <div className="op-toolbar">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search email or business" />
          <div className="op-chips">
            {[['all', `All ${rows.length}`], ['Active', `Active ${counts('Active')}`], ['Dormant', `Dormant ${counts('Dormant')}`], ['Never signed in', `Never signed in ${counts('Never signed in')}`], ['Suspended', `Suspended ${counts('Suspended')}`], ['business', 'Business'], ['personal', 'Personal'], ['trial', `On free trial ${billCount('trial')}`], ['ended', `Free month ended ${billCount('ended')}`], ['signed', `Subscribed ${billCount('signed')}`]].filter(([k]) => k !== 'Suspended' || counts('Suspended')).map(([k, l]) => (
              <button key={k} className={'op-chip' + (f === k ? ' on' : '')} onClick={() => setF(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="op-tablewrap"><table className="op-table">
          <thead><tr>{th('email', 'Person')}{th('kind', 'Type')}{th('trial_sort', 'Plan')}{th('debit_sort', 'Subscription')}<th>Status</th>{th('signin_sort', 'Last sign-in')}{th('created_at', 'Joined')}</tr></thead>
          <tbody>
            {sorted.length ? sorted.map(u => (
              <tr key={u.id} className="click" onClick={() => setOpen(u)}>
                <td><span className="strong">{u.email}</span>{u.devices && <span className="sub">{u.devices}</span>}</td>
                <td>{u.business_name ? <>{u.business_name}<span className="sub">{profileLabel(u.business_profile)} · {u.business_role}</span></> : 'Personal'}</td>
                <td><span className={'op-pill ' + u.bill.tone}>{u.bill.label}</span>{u.bill.sub && <span className="sub">{u.bill.sub}</span>}</td>
                <td>{u.is_admin ? '-' : u.debit_order_status === 'signed' && u.debit_order_signed_on ? <>Signed {shortDate(u.debit_order_signed_on)}</> : DEBIT_LABEL[u.debit_order_status || 'none']}</td>
                <td><span className={'op-pill ' + u.status[1]}>{u.status[0]}</span>
                  {!u.confirmed && !isSuspended(u) && <a href="#" className="sub" style={{ display: 'block' }} onClick={e => { e.preventDefault(); e.stopPropagation(); if (!sending) quickReset(u); }}>{sending === u.email ? 'Sending…' : 'Resend email'}</a>}
                </td>
                <td>{ago(u.last_sign_in_at)}</td>
                <td>{shortDate(u.created_at)}</td>
              </tr>
            )) : <tr><td colSpan={7} className="op-empty">Nobody matches.</td></tr>}
          </tbody>
        </table></div>
      </div>
      {open && (
        <Drawer title={open.email} subtitle={<span className={'op-pill ' + current.status[1]}>{current.status[0]}</span>} onClose={() => setOpen(null)}>
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
          <div className="op-sec">Plan &amp; subscription</div>
          <BillingEditor key={current.id + (current.debit_order_status || '') + (current.trial_ends_on || '')} person={current} onSaved={onChanged} />
          <div className="op-sec">Account actions</div>
          <AccountActions person={current} me={me} onChanged={onChanged} onDeleted={async () => { setOpen(null); await onChanged(); }} />
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

// The To The Cent staff who can open this portal. "Owner" can also change the team;
// "Team member" can use the portal but not add or remove people here.
function Team({ me, users }) {
  const { syncCfg, ensureToken } = useBudget();
  const call = useAccountFn();
  const [made, setMade] = useState(null);
  const [rows, setRows] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('team');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sure, setSure] = useState('');

  const load = useCallback(async () => {
    try { const token = await ensureToken(); setRows(await adminApi.rpc(syncCfg, token, 'admin_team')); }
    catch (e) { setMsg({ e: true, t: e.message }); }
  }, [syncCfg, ensureToken]);
  useEffect(() => { load(); }, [load]);

  const mine = (rows || []).find(r => (r.email || '').toLowerCase() === (me || '').toLowerCase());
  const isOwner = !!mine && mine.role === 'owner';

  async function run(fn, ok) {
    setBusy(true); setMsg(null);
    try { const token = await ensureToken(); await fn(token); setMsg({ t: ok }); await load(); }
    catch (e) {
      setMsg({ e: true, t: e.message });
    } finally { setBusy(false); setSure(''); }
  }
  // Makes the account if needed, gives portal access, and hands back a one-time link to send them.
  async function makeLink() {
    const addr = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(addr)) { setMsg({ e: true, t: 'Enter a valid email address.' }); return; }
    setBusy(true); setMsg(null); setMade(null);
    try {
      let link;
      const known = (users || []).find(u => (u.email || '').toLowerCase() === addr);
      if (known) link = (await call({ action: 'signin_link', user_id: known.id })).link;
      else link = (await call({ action: 'create', email: addr, name: name.trim(), segment: 'personal' })).link;
      const token = await ensureToken();
      await adminApi.rpc(syncCfg, token, 'admin_add_team_member', { p_email: addr, p_role: role });
      setMade({ link, email: addr, name: name.trim(), existing: !!known });
      setEmail(''); setName('');
      await load();
    } catch (e) { setMsg({ e: true, t: e.message }); } finally { setBusy(false); }
  }
  const add = () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setMsg({ e: true, t: 'Enter a valid email address.' }); return; }
    run(t => adminApi.rpc(syncCfg, t, 'admin_add_team_member', { p_email: email.trim(), p_role: role }), `${email.trim()} can now open the portal.`).then(() => setEmail(''));
  };
  const remove = r => run(t => adminApi.rpc(syncCfg, t, 'admin_remove_team_member', { p_user: r.user_id }), `${r.email} can no longer open the portal.`);
  const setRoleFor = (r, nr) => run(t => adminApi.rpc(syncCfg, t, 'admin_add_team_member', { p_email: r.email, p_role: nr }), `${r.email} is now ${nr === 'owner' ? 'an owner' : 'a team member'}.`);

  return (
    <>
      <PageHead title="Team" subtitle="People at To The Cent who can open this portal." />
      <div className="op-grid c3">
        <div className="op-card">
          <div className="op-card-h"><h2>Who has access</h2><span className="op-meta">{rows ? rows.length : ''}</span></div>
          <div className="op-tablewrap"><table className="op-table">
            <thead><tr><th>Person</th><th>Access</th><th>Added</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {rows ? rows.map(r => (
                <tr key={r.user_id}>
                  <td><span className="strong">{r.email}</span>{r.added_by_email && <span className="sub">Added by {r.added_by_email}</span>}</td>
                  <td><span className={'op-pill ' + (r.role === 'owner' ? 'good' : 'info')}>{r.role === 'owner' ? 'Owner' : 'Team member'}</span></td>
                  <td>{ago(r.added_at)}</td>
                  <td>{ago(r.last_sign_in_at)}</td>
                  <td className="num">
                    {isOwner && r.email.toLowerCase() !== (me || '').toLowerCase() && (sure === r.user_id
                      ? <><button className="op-link" style={{ color: 'var(--op-bad)' }} disabled={busy} onClick={() => remove(r)}>Yes, remove</button>{' · '}<button className="op-link" onClick={() => setSure('')}>Keep</button></>
                      : <><button className="op-link" disabled={busy} onClick={() => setRoleFor(r, r.role === 'owner' ? 'team' : 'owner')}>{r.role === 'owner' ? 'Make team member' : 'Make owner'}</button>{' · '}<button className="op-link" style={{ color: 'var(--op-bad)' }} onClick={() => setSure(r.user_id)}>Remove</button></>)}
                  </td>
                </tr>
              )) : <tr><td colSpan={5} className="op-empty">Loading…</td></tr>}
            </tbody>
          </table></div>
        </div>
        <div className="op-card">
          <div className="op-card-h"><h2>Add a team member</h2></div>
          <div className="op-card-b">
            {isOwner ? (
              <>
                <label className="op-lbl" style={{ marginTop: 0 }}>Their email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
                <label className="op-lbl">Name (optional)</label>
                <input value={name} onChange={e => setName(e.target.value)} />
                <label className="op-lbl">Access</label>
                <select value={role} onChange={e => setRole(e.target.value)}>
                  <option value="team">Team member - uses the portal</option>
                  <option value="owner">Owner - also manages the team</option>
                </select>
                {msg && <div className={'op-msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
                <div style={{ height: 12 }} />
                <button className="op-btn primary" disabled={busy} onClick={makeLink}>{busy ? 'Working…' : 'Create link to send'}</button>
                {made && (
                  <div style={{ marginTop: 12 }}>
                    <div className="op-msg s">{made.email} now has portal access. {made.existing ? 'They already had an account, so this link lets them set a new password.' : 'Their account is ready.'} Send them this link. It works once.</div>
                    <ShareLink link={made.link} email={made.email} name={made.name} kind="team" />
                  </div>
                )}
                <div className="op-note" style={{ marginTop: 12 }}>The link lets them choose their own password, and you never see it. Team members never pay or get locked out, and can see everything in this portal, including customers' totals.</div>
                <button className="op-link" style={{ marginTop: 8 }} disabled={busy || !email.trim()} onClick={add}>Already have an account? Add without a link</button>
              </>
            ) : (
              <div className="op-note">Only an owner can add or remove team members.{msg && msg.e ? ' ' + msg.t : ''}</div>
            )}
          </div>
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

function LoginMessage({ done }) {
  const first = (done.name || '').trim().split(/\s+/)[0];
  const msg = `${first ? 'Hi ' + first + ',' : 'Hi,'}\n\nYour To The Cent account is ready.\n\nLog in here: ${SITE}\nEmail: ${done.email}\nPassword: ${done.password}\n\nThe first time you log in you will be asked to choose a password of your own, and whether you are setting up for yourself or for a business.`;
  const [copied, setCopied] = useState(false);
  return (
    <>
      <div className="op-linkbox" style={{ marginTop: 8 }}>
        <textarea readOnly rows="7" value={msg} onFocus={e => e.target.select()} style={{ width: '100%' }} />
      </div>
      <div className="op-actions" style={{ marginTop: 8 }}>
        <button className="op-btn" onClick={() => { navigator.clipboard?.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy message'}</button>
        <button className="op-btn primary" onClick={() => openWhatsApp('', msg)}>Send by WhatsApp</button>
        <button className="op-btn" onClick={() => openEmail(done.email, 'Your To The Cent login', msg)}>Send by email</button>
      </div>
    </>
  );
}

function SignUp({ onCreated, initialKind = 'login', initialEmail = '' }) {
  const { syncCfg, ensureToken } = useBudget();
  const [kind, setKind] = useState(initialKind);
  const [f, setF] = useState({ email: initialEmail, name: '', bizName: '', businessType: 'Sole Proprietor', profile: '', industry: '', hasStaff: false, vat: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const features = kind === 'business' && f.profile ? featuresFor(f.profile, { hasStaff: f.hasStaff, vatRegistered: f.vat }) : [];

  // Make the login and email it: the person gets their email and a generated password, and chooses their
  // own password and personal-or-business the first time they log in.
  async function sendLogin() {
    setErr('');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) { setErr('Enter a valid email address.'); return; }
    setBusy(true);
    try {
      const token = await ensureToken();
      const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/functions/v1/' + CREATE_ACCOUNT_FN, {
        method: 'POST',
        headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_login', email: f.email.trim(), name: f.name.trim() }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `Could not create the login (${r.status})`);
      setDone({ login: true, ...body, email: f.email.trim().toLowerCase(), name: f.name.trim() });
      setF(x => ({ ...x, email: '', name: '' }));
      onCreated();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function submit() {
    if (kind === 'login') return sendLogin();
    setErr('');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) { setErr('Enter a valid email address.'); return; }
    if (kind === 'business' && !f.bizName.trim()) { setErr('Give the business a name.'); return; }
    if (kind === 'business' && !f.profile) { setErr('Choose what kind of business it is.'); return; }
    setBusy(true);
    try {
      const token = await ensureToken();
      const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/functions/v1/' + CREATE_ACCOUNT_FN, {
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
            <h2>{kind === 'login' ? 'Email a login' : 'New account'}</h2>
            <div className="op-seg">
              <button className={kind === 'login' ? 'on' : ''} onClick={() => { setKind('login'); setErr(''); }}>Email a login</button>
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
            <button className="op-btn primary" disabled={busy} onClick={submit}>{busy ? 'Working…' : kind === 'login' ? 'Create login and email it' : kind === 'business' ? 'Create account and business' : 'Create account'}</button>
          </div>
        </div>
        <div>
          {done && done.login ? (
            <div className="op-card">
              <div className="op-card-h"><h2>{done.emailed ? 'Login emailed' : 'Login made, not emailed'}</h2><span className={'op-pill ' + (done.emailed ? 'good' : 'warn')}>{done.emailed ? 'Sent' : 'Send it yourself'}</span></div>
              <div className="op-card-b">
                <div><b>{done.email}</b></div>
                {done.emailed ? (
                  <div className="op-note" style={{ marginTop: 6 }}>We emailed them their email and password. The first time they log in they choose their own password, and whether they are setting up for themselves or for a business. You never need to see it.</div>
                ) : (
                  <>
                    <div className="op-msg e" style={{ marginTop: 8 }}>The email did not go out: {done.emailError}</div>
                    <div className="op-note">The account exists. Send them these details yourself. This is the only time the password is shown, so copy it now.</div>
                    <LoginMessage done={done} />
                  </>
                )}
              </div>
            </div>
          ) : done ? (
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
              {kind === 'login' ? (
                <div className="op-card-b op-note" style={{ marginTop: 0 }}>
                  <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                    <li>You type their email address (and name, if you like).</li>
                    <li>We make the account with a strong, generated password and email them both.</li>
                    <li>When they log in they choose their own password, then say whether they are setting up for themselves or for a business.</li>
                  </ol>
                </div>
              ) : (
              <div className="op-card-b op-note" style={{ marginTop: 0 }}>
                <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>You create the account{kind === 'business' ? ' and their business, with the right tools switched on' : ''}.</li>
                  <li>You get a personal link to send them by WhatsApp or email.</li>
                  <li>They open it and choose their own password - you never see it.</li>
                </ol>
              </div>
              )}
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

// ---------- Alerts: failed sign-ups + unconfirmed accounts ----------
const REASON_EMAIL = {
  already_registered: "It looks like you already have a To The Cent account with this email. You can log in at https://tothecent.co.za - and if you've forgotten your password, tap \"Forgot password?\" on the login screen.",
  password_short: "It looks like your password was a bit short when you tried to sign up - it needs at least 6 characters. You're welcome to try again at https://tothecent.co.za, or reply and I'll set the account up for you.",
  password_weak: "It looks like the password you chose was flagged as too easy to guess. Please try a longer one at https://tothecent.co.za, or reply and I'll set the account up for you.",
  email_invalid: "It looks like there may have been a typo in the email address when you signed up. Reply with the right address and I'll set the account up for you.",
  rate_limited: "Sorry - we had a spike in sign-ups and couldn't send your confirmation email. I can set your account up for you right away if you reply to this email.",
  email_send_failed: "Sorry - our confirmation email didn't go out when you signed up. I can set your account up for you right away if you reply to this email.",
};
const DEFAULT_EMAIL = "I noticed you tried to create a To The Cent account but it didn't go through. Sorry about that! Reply to this email and I'll get you set up.";

function Alerts({ attempts, users, onCreateFor, onSeen }) {
  const call = useAccountFn();
  const [links, setLinks] = useState({});
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [newIds] = useState(() => new Set(attempts.filter(a => !a.seen_at).map(a => a.id)));
  useEffect(() => { if (newIds.size) onSeen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const byEmail = useMemo(() => new Map(users.map(u => [(u.email || '').toLowerCase(), u])), [users]);
  const weekAgo = Date.now() - 7 * DAY;
  const week = attempts.filter(a => new Date(a.created_at) > weekAgo);
  const weekFailed = week.filter(a => a.outcome === 'failed');
  const weekOk = week.filter(a => a.outcome === 'succeeded');

  // One row per email: their latest failure, how many tries, and whether
  // they've since got an account.
  const groups = useMemo(() => {
    const m = new Map();
    attempts.filter(a => a.outcome === 'failed').forEach(a => {
      const k = a.email || '(no email entered)';
      const g = m.get(k) || { email: a.email, tries: 0, latest: a, reasons: new Set(), devices: new Set(), isNew: false };
      g.tries++; g.reasons.add(a.reason); if (a.device) g.devices.add(a.device);
      if (newIds.has(a.id)) g.isNew = true;
      m.set(k, g);
    });
    return [...m.values()].map(g => ({ ...g, account: g.email ? byEmail.get(g.email) : null }));
  }, [attempts, byEmail, newIds]);

  const reasonCounts = {};
  weekFailed.forEach(a => { reasonCounts[a.reason] = (reasonCounts[a.reason] || 0) + 1; });
  const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];
  const unconfirmed = users.filter(u => !u.confirmed);

  async function signinLink(user) {
    setBusy(user.id); setErr('');
    try { const r = await call({ action: 'signin_link', user_id: user.id }); setLinks(l => ({ ...l, [user.id]: r.link })); }
    catch (e) { setErr(e.message); } finally { setBusy(null); }
  }

  const status = g => {
    const u = g.account;
    if (!u) return ['No account yet', 'bad'];
    if (!u.confirmed) return ['Account not confirmed', 'warn'];
    if (u.last_sign_in_at && new Date(u.last_sign_in_at) > new Date(g.latest.created_at)) return ['Got in later', 'good'];
    return ['Has an account', 'info'];
  };

  return (
    <>
      <PageHead title="Alerts" subtitle="People who tried to create an account and couldn't, and accounts that never got going." />
      <div className="op-grid k4" style={{ marginBottom: 16 }}>
        <Kpi label="Failed sign-ups, 7 days" value={weekFailed.length} sub={`${new Set(weekFailed.map(a => a.email)).size} different people`} />
        <Kpi label="Successful, 7 days" value={weekOk.length} sub={week.length ? `${Math.round(weekOk.length / week.length * 100)}% of attempts worked` : 'No attempts yet'} />
        <Kpi label="Most common problem" value={topReason ? topReason[1] : '-'} sub={topReason ? (REASONS[topReason[0]] || REASONS.other)[0] : 'Nothing this week'} />
        <Kpi label="Never confirmed email" value={unconfirmed.length} sub="signed up but can't get in yet" />
      </div>
      {err && <div className="op-msg e" style={{ marginTop: 0, marginBottom: 12 }}>{err}</div>}

      <div className="op-card">
        <div className="op-card-h"><h2>Failed sign-up attempts</h2><span className="op-meta">Recorded from 4 Oct 2026</span></div>
        <div className="op-tablewrap"><table className="op-table">
          <thead><tr><th>Person</th><th>What went wrong</th><th className="num">Tries</th><th>Last try</th><th>Now</th><th /></tr></thead>
          <tbody>
            {groups.length ? groups.map(g => {
              const [st, cls] = status(g);
              const r = REASONS[g.latest.reason] || REASONS.other;
              return (
                <tr key={g.email || 'none'}>
                  <td><span className="strong">{g.email || 'No email entered'}</span>{g.isNew && <> <span className="op-pill bad">New</span></>}<span className="sub">{[...g.devices].join(', ')}</span></td>
                  <td style={{ whiteSpace: 'normal', minWidth: 220 }}><b>{r[0]}</b><span className="sub">{r[1]}{g.latest.reason === 'other' && g.latest.message ? ' "' + g.latest.message + '"' : ''}</span></td>
                  <td className="num">{g.tries}</td>
                  <td>{ago(g.latest.created_at)}</td>
                  <td><span className={'op-pill ' + cls}>{st}</span></td>
                  <td className="num">
                    {g.email && <button className="op-link" onClick={() => openEmail(g.email, 'Your To The Cent account', 'Hi,\n\n' + (REASON_EMAIL[g.latest.reason] || DEFAULT_EMAIL) + '\n\nThanks')}>Email them</button>}
                    {g.email && !g.account && <>{' · '}<button className="op-link" onClick={() => onCreateFor(g.email)}>Create account</button></>}
                    {g.account && !g.account.confirmed && !links[g.account.id] && <>{' · '}<button className="op-link" disabled={busy === g.account.id} onClick={() => signinLink(g.account)}>Sign-in link</button></>}
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={6} className="op-empty">No failed sign-ups recorded yet. They'll appear here as soon as one happens.</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="op-card">
        <div className="op-card-h"><h2>Signed up, never confirmed their email</h2><span className="op-meta">{unconfirmed.length}</span></div>
        <div className="op-tablewrap"><table className="op-table">
          <tbody>
            {unconfirmed.length ? unconfirmed.map(u => (
              <tr key={u.id}>
                <td><span className="strong">{u.email}</span><span className="sub">Signed up {ago(u.created_at)}</span></td>
                <td className="num">
                  {links[u.id]
                    ? <span className="op-meta">Link ready below</span>
                    : <button className="op-btn" disabled={busy === u.id} onClick={() => signinLink(u)}>{busy === u.id ? 'Creating…' : 'Create sign-in link'}</button>}
                </td>
              </tr>
            )) : <tr><td className="op-empty">Everyone who signed up has confirmed their email.</td></tr>}
          </tbody>
        </table></div>
        <div className="op-card-b op-note" style={{ marginTop: 0 }}>They probably never received the confirmation email, or it went to spam. A sign-in link lets them set a password and confirms the account in one step.</div>
      </div>

      {Object.entries(links).map(([id, link]) => {
        const u = users.find(x => x.id === id);
        return u ? <div className="op-msg i" key={id} style={{ marginBottom: 12 }}>Sign-in link for <b>{u.email}</b>:<ShareLink link={link} email={u.email} kind="signin" /></div> : null;
      })}
    </>
  );
}

// ---------- shell ----------
const I = {
  alert: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  ret: <><path d="M3 17l5-5 4 4 8-8" /><path d="M15 8h5v5" /></>,
  dash: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2" /></>,
  preview: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  biz: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></>,
  signin: <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></>,
  invite: <><path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" /><path d="M3 6l9 7 9-7" /></>,
  team: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-3.7 3.4-5.5 7-5.5s6.3 1.8 7 5.5" /><path d="M18 3v4M16 5h4" /></>,
  add: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  db: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
};
const PAGES = [['dashboard', 'Dashboard', I.dash], ['retention', 'Retention', I.ret], ['alerts', 'Alerts', I.alert], ['people', 'People', I.people], ['businesses', 'Businesses', I.biz], ['preview', 'Preview types', I.preview], ['signins', 'Sign-ins', I.signin], ['invites', 'Invites', I.invite], ['team', 'Team', I.team], ['signup', 'Sign up', I.add], ['database', 'Database', I.db]];

export default function AdminApp({ onExit }) {
  const { syncCfg, ensureToken } = useBudget();
  const [page, setPage] = useState(() => { try { return sessionStorage.getItem('wnOwnerPage') || 'dashboard'; } catch { return 'dashboard'; } });
  const [signupKind, setSignupKind] = useState('login');
  const [signupEmail, setSignupEmail] = useState('');
  const [data, setData] = useState(null);
  const [db, setDb] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [ret, setRet] = useState(null);
  const [retLoading, setRetLoading] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(null);

  const go = p => { setPage(p); try { sessionStorage.setItem('wnOwnerPage', p); } catch { /* ignore */ } document.querySelector('.op-main')?.scrollTo(0, 0); };

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const token = await ensureToken();
      const [overview, users, sessions, businesses, invites, waitlist, attempts] = await Promise.all([
        adminApi.rpc(syncCfg, token, 'admin_overview'),
        adminApi.rpc(syncCfg, token, 'admin_users'),
        adminApi.rpc(syncCfg, token, 'admin_sessions'),
        adminApi.rpc(syncCfg, token, 'admin_businesses').catch(() => []),
        adminApi.select(syncCfg, token, 'app_invites', 'select=*&order=created_at.desc'),
        adminApi.select(syncCfg, token, 'waitlist_signups', 'select=*&order=created_at.desc').catch(() => []),
        adminApi.select(syncCfg, token, 'signup_attempts', 'select=*&order=created_at.desc&limit=500').catch(() => []),
      ]);
      setData({ overview, users: users || [], sessions: sessions || [], businesses: businesses || [], invites: invites || [], waitlist: waitlist || [], attempts: attempts || [] });
      setLoadedAt(new Date());
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }, [syncCfg, ensureToken]);

  const loadDb = useCallback(async () => {
    setDbLoading(true);
    try { const token = await ensureToken(); setDb(await adminApi.rpc(syncCfg, token, 'admin_database')); }
    catch (e) { setErr(e.message); } finally { setDbLoading(false); }
  }, [syncCfg, ensureToken]);

  const loadRet = useCallback(async () => {
    setRetLoading(true);
    try { const token = await ensureToken(); setRet(await adminApi.rpc(syncCfg, token, 'admin_retention')); }
    catch (e) { setErr(e.message); } finally { setRetLoading(false); }
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
  const startSignup = (kind, email = '') => { setSignupKind(kind); setSignupEmail(email); go('signup'); };
  // Mark every unseen sign-up alert as seen (the Alerts page keeps showing
  // which ones were new for as long as it stays open).
  async function markAlertsSeen() {
    try {
      const token = await ensureToken();
      await adminApi.update(syncCfg, token, 'signup_attempts', 'seen_at=is.null', { seen_at: new Date().toISOString() });
      setData(d => d && { ...d, attempts: d.attempts.map(a => a.seen_at ? a : { ...a, seen_at: new Date().toISOString() }) });
    } catch { /* not critical */ }
  }
  const counts = data ? { alerts: data.attempts.filter(a => a.outcome === 'failed' && !a.seen_at).length, people: data.users.length, businesses: data.businesses.length, invites: data.invites.filter(i => !data.users.some(u => (u.email || '').toLowerCase() === i.email.toLowerCase())).length } : {};

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
              {!['database', 'retention'].includes(page) && <div className="op-actions" style={{ justifyContent: 'flex-end', marginBottom: -8 }}>
                <span className="op-meta">{loadedAt ? 'Updated ' + loadedAt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                <button className="op-btn" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
              </div>}
              {page === 'dashboard' && counts.alerts > 0 && (
                <div className="op-msg e" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span><b>{counts.alerts} new failed sign-up {counts.alerts === 1 ? 'attempt' : 'attempts'}.</b> Someone tried to create an account and couldn't.</span>
                  <button className="op-btn" onClick={() => go('alerts')}>View alerts</button>
                </div>
              )}
              {page === 'dashboard' && <Dashboard d={data} go={go} />}
              {page === 'people' && <People users={data.users} businesses={data.businesses} onNew={() => startSignup('person')} onChanged={load} me={syncCfg.email} />}
              {page === 'businesses' && <Businesses businesses={data.businesses} onNew={() => startSignup('business')} />}
              {page === 'preview' && <Preview />}
              {page === 'signins' && <SignIns users={data.users} sessions={data.sessions} />}
              {page === 'invites' && <Invites invites={data.invites} waitlist={data.waitlist} users={data.users} onCreate={createInvite} onDelete={deleteInvite} />}
              {page === 'team' && <Team me={syncCfg.email} users={data.users} />}
              {page === 'signup' && <SignUp key={signupKind + signupEmail} initialKind={signupKind} initialEmail={signupEmail} onCreated={load} />}
              {page === 'alerts' && <Alerts attempts={data.attempts} users={data.users} onCreateFor={email => startSignup('person', email)} onSeen={markAlertsSeen} />}
              {page === 'retention' && <Retention r={ret} loading={retLoading} onLoad={loadRet} />}
              {page === 'database' && <Database db={db} loading={dbLoading} onLoad={loadDb} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
