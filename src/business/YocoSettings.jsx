import { useState } from 'react';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useYoco } from '../lib/yoco.js';
import { R2 } from '../lib/format.js';

function ago(ts) {
  if (!ts) return 'none yet';
  const mins = Math.round((Date.now() - new Date(ts)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  if (mins < 1440) return Math.round(mins / 60) + ' h ago';
  return new Date(ts).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

// Settings > Card payments: connect a Yoco account so card sales appear in
// Money as they happen.
export default function YocoSettings() {
  const { myRole } = useBusiness();
  const canManage = myRole === 'owner' || myRole === 'admin';
  const { status, connected, call } = useYoco({ poll: true });
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [confirmOff, setConfirmOff] = useState(false);

  async function run(label, body, ok) {
    setBusy(label); setMsg(null);
    try { const d = await call(body); setMsg({ t: ok(d) }); return true; }
    catch (e) { setMsg({ e: true, t: e.message }); return false; }
    finally { setBusy(''); }
  }

  if (!status) return <div className="card"><div className="mini">Checking…</div></div>;

  return (
    <>
      <div className="card">
        <div className="row"><h2 style={{ marginTop: 0 }}>Yoco</h2>
          {connected && <span className={'tag'} style={{ background: status.status === 'error' ? 'var(--bad)' : 'var(--acc)', color: '#fff' }}>{status.status === 'error' ? 'Needs attention' : 'Connected'}</span>}
        </div>

        {connected ? (
          <>
            <div className="row" style={{ padding: '8px 0' }}><span>Card sales today</span><span className="mono">{R2(+status.today_total || 0)} · {status.today_count} sale{+status.today_count === 1 ? '' : 's'}</span></div>
            <div className="row" style={{ padding: '8px 0' }}><span>Last sale</span><span className="mono">{status.last_sale_at ? `${R2(+status.last_sale_amount || 0)} · ${ago(status.last_sale_at)}` : 'none yet'}</span></div>
            {status.status === 'error' && status.last_error && <div className="msg e">Last problem: {status.last_error}. Yoco will retry on its own. If it keeps happening, reconnect with a new key.</div>}
            <div className="mini" style={{ marginTop: 8 }}>
              Every card sale appears in Money as income, with Yoco's fee as a bank-fee expense, within seconds. Tips aren't counted as income.
              When Yoco pays out into your bank, that deposit is treated as a transfer in statement imports, so your sales aren't counted twice.
            </div>
            {canManage && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button className="b g sm" disabled={!!busy} onClick={() => run('sync', { action: 'sync', days: 7 }, d => `Checked the last 7 days - ${d.imported} new item${d.imported === 1 ? '' : 's'} added.`)}>{busy === 'sync' ? 'Syncing…' : 'Sync last 7 days'}</button>
                {!confirmOff
                  ? <button className="b g sm" disabled={!!busy} onClick={() => setConfirmOff(true)}>Disconnect</button>
                  : (
                    <>
                      <button className="b d sm" disabled={!!busy} onClick={async () => { if (await run('off', { action: 'disconnect' }, () => 'Disconnected. Sales already recorded stay in Money.')) setConfirmOff(false); }}>Yes, disconnect</button>
                      <button className="b g sm" onClick={() => setConfirmOff(false)}>Cancel</button>
                    </>
                  )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mini" style={{ marginBottom: 10 }}>
              Connect your Yoco account and every card sale lands in To The Cent as it happens - no uploading statements or typing in takings.
              We only read your sales; we can't take payments or refund anyone.
            </div>
            {canManage ? (
              <>
                <ol className="mini" style={{ margin: '0 0 12px 18px', lineHeight: 1.6 }}>
                  <li>Sign in at <a href="https://developer.yoco.com/ui" target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>developer.yoco.com/ui</a> with your Yoco login.</li>
                  <li>Create a new application for your own business, and switch on <b>view orders and payments</b> and <b>manage webhooks</b>.</li>
                  <li>Generate an API key and copy it - Yoco only shows it once.</li>
                  <li>Paste it here.</li>
                </ol>
                <label style={{ marginTop: 0 }}>Yoco API key</label>
                <input type="password" autoComplete="off" spellCheck="false" value={key} onChange={e => setKey(e.target.value)} placeholder="Paste your key" />
                <div style={{ height: 10 }} />
                <button className="b" disabled={!!busy || key.trim().length < 10}
                  onClick={async () => { if (await run('connect', { action: 'connect', api_key: key.trim() }, d => `Connected. ${d.imported} sale${d.imported === 1 ? '' : 's'} from the last 7 days added to Money.`)) setKey(''); }}>
                  {busy === 'connect' ? 'Connecting…' : 'Connect Yoco'}
                </button>
                <div className="mini" style={{ marginTop: 8 }}>Your key is stored securely on our server and is never shown again, here or to anyone on your team.</div>
              </>
            ) : <div className="mini">Only the business owner or an admin can connect Yoco.</div>}
          </>
        )}
        {msg && <div className={'msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
      </div>
    </>
  );
}
