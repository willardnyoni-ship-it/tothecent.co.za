import { useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';

const CHOICE = { width: '100%', textAlign: 'left', background: '#fff', border: '1.5px solid var(--line, #C7CBD2)', borderRadius: 14, padding: '13px 15px', cursor: 'pointer', font: 'inherit', color: 'inherit' };

// The first time someone logs in with the login details they were emailed:
// 1) choose a password of their own, 2) say whether they are setting up for themselves or for a business.
export default function FirstLogin({ flags, setFlags, save }) {
  const { syncCfg, doSignOut } = useBudget();
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function setPassword() {
    if (pass.length < 8) { setErr('Please use at least 8 characters.'); return; }
    if (pass !== again) { setErr("The two passwords don't match."); return; }
    setBusy(true); setErr('');
    try { await save({ password: pass, data: { must_change_password: false } }); setFlags(f => ({ ...f, must_change_password: false })); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function choose(kind) {
    setBusy(true); setErr('');
    try {
      await save({ data: { setup_pending: false, segment: kind } });
      location.href = kind === 'business' ? '/app/?mode=business' : '/app/?onboard=1';
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="light-tab" style={{ minHeight: '100vh', padding: '28px 16px 40px' }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <h1 style={{ marginBottom: 4 }}>Welcome to To The Cent</h1>
        <div className="sub" style={{ marginBottom: 16 }}>{syncCfg.email}</div>

        {flags.must_change_password ? (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Choose your own password</h2>
            <div className="mini" style={{ marginBottom: 10 }}>The password we emailed you was only for getting in. Pick one that only you know.</div>
            <label>New password</label>
            <input type="password" autoComplete="new-password" value={pass} onChange={e => setPass(e.target.value)} placeholder="At least 8 characters" />
            <label>Type it again</label>
            <input type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') setPassword(); }} />
            {err && <div className="msg e">{err}</div>}
            <div style={{ height: 12 }} />
            <button className="b" disabled={busy} onClick={setPassword}>{busy ? 'Saving…' : 'Save password and continue'}</button>
          </div>
        ) : (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>How will you use To The Cent?</h2>
            <div className="mini" style={{ marginBottom: 12 }}>You can change your mind later.</div>
            <button className="pathbtn" type="button" disabled={busy} onClick={() => choose('business')} style={{ ...CHOICE, marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>I run a business &rarr;</div>
              <div className="mini">Invoices, expenses, VAT and tidy records for SARS</div>
            </button>
            <button className="pathbtn" type="button" disabled={busy} onClick={() => choose('personal')} style={CHOICE}>
              <div style={{ fontWeight: 700 }}>It's for me &rarr;</div>
              <div className="mini">Find out where your money actually goes each month</div>
            </button>
            {err && <div className="msg e" style={{ marginTop: 10 }}>{err}</div>}
          </div>
        )}
        <div style={{ height: 12 }} />
        <button className="b g sm" style={{ width: '100%' }} onClick={doSignOut}>Sign out</button>
      </div>
    </div>
  );
}
