import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBudget } from '../../store/BudgetStore.jsx';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { adminApi } from '../../admin/adminApi.js';
import { businessApi } from '../../lib/businessApi.js';
import { isDemo } from '../../lib/demo.js';
import { attention, overviewFor, roleLabel } from '../../lib/clients.js';
import { profileByKey } from '../../lib/businessProfiles.js';
import { R, iso } from '../../lib/format.js';

const ago = ts => {
  if (!ts) return 'No activity yet';
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  return d <= 0 ? 'Active today' : d === 1 ? 'Active yesterday' : d < 60 ? `Active ${d} days ago` : 'Quiet for a while';
};

// Every business this person looks after, with what needs their attention.
export default function Clients({ go }) {
  const { syncCfg, ensureToken } = useBudget();
  const { business, businesses, switchBusiness, claimInvites } = useBusiness();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    try {
      const token = await ensureToken();
      if (isDemo()) {
        const [invoices, transactions, expenses, members] = await Promise.all(['invoices', 'business_transactions', 'expenses', 'business_members']
          .map(t => businessApi.select(syncCfg, token, t, 'select=*')));
        const today = iso(new Date());
        setRows(businesses.map(b => overviewFor(b, ((members || []).find(m => m.business_id === b.id && m.user_id === syncCfg.userId) || {}).role, { invoices, transactions, expenses }, today)));
      } else {
        setRows(await adminApi.rpc(syncCfg, token, 'my_clients_overview'));
      }
    } catch (e) { setErr(e.message || 'Could not load your clients.'); }
  }, [syncCfg, ensureToken, businesses]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (rows || [])
    .filter(c => (!q || c.name.toLowerCase().includes(q.toLowerCase())) && (!only || attention(c) > 0))
    .sort((a, b) => attention(b) - attention(a) || a.name.localeCompare(b.name)), [rows, q, only]);
  const needing = (rows || []).filter(c => attention(c) > 0).length;

  function open(c) { switchBusiness(c.business_id); go('home'); window.scrollTo(0, 0); }

  return (
    <section className="tab on light-tab">
      <div className="row"><h1>Clients</h1><button className="b g sm" style={{ width: 'auto' }} onClick={async () => { if (!isDemo()) await claimInvites(); load(); }}>Refresh</button></div>
      <div className="mini" style={{ marginBottom: 10 }}>
        {rows ? `${rows.length} business${rows.length === 1 ? '' : 'es'} · ${needing} with something to look at` : 'Loading your clients…'}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input style={{ flex: '1 1 220px' }} placeholder="Search clients" value={q} onChange={e => setQ(e.target.value)} />
        <button className={'b sm ' + (only ? '' : 'g')} style={{ width: 'auto' }} onClick={() => setOnly(o => !o)}>{only ? 'Showing: needs attention' : 'Only needs attention'}</button>
      </div>
      {err && <div className="msg e">{err}</div>}
      <div className="cl-grid">
        {shown.map(c => {
          const p = profileByKey(c.profile);
          const now = business && c.business_id === business.id;
          return (
            <div key={c.business_id} className={'card cl-card' + (now ? ' now' : '')} role="button" tabIndex={0} onClick={() => open(c)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(c); } }}>
              <div className="cl-top"><b>{c.name}</b>{now && <span className="cl-now">Open now</span>}</div>
              <div className="mini">{roleLabel(c.role) || 'Member'}{p ? ' · ' + p.label : ''}</div>
              <div className="cl-big"><small>Owed to them</small><b>{R(+c.outstanding)}</b></div>
              <div className="cl-split">
                <span className={c.overdue_count ? 'bad' : ''}><small>Overdue</small><b>{c.overdue_count}</b></span>
                <span className={c.review_count ? 'warn' : ''}><small>To review</small><b>{c.review_count}</b></span>
                <span className={c.no_receipt_count ? 'warn' : ''}><small>No receipt</small><b>{c.no_receipt_count}</b></span>
              </div>
              <div className="mini cl-foot">{ago(c.last_activity)}</div>
            </div>
          );
        })}
      </div>
      {rows && shown.length === 0 && <div className="mini" style={{ marginTop: 12 }}>{rows.length ? 'No clients match.' : 'You are not part of any business yet.'}</div>}
      <div style={{ height: 24 }} />
    </section>
  );
}
