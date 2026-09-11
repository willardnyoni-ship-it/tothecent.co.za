import { useState, useEffect } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useSheet } from './Sheet.jsx';
import { R, R2, iso, uid } from '../lib/format.js';
import { saTaxYear, taxYearLabel, taxYearsAvailable, blankDeductions } from '../lib/tax.js';
import { loadLock, saveLock, pinHash } from '../lib/lock.js';
import { photoDel, photoRemoteDelete, PHOTO_TTL_DAYS } from '../lib/photos.js';
import { DEFAULTS, KEY } from '../store/defaults.js';
import { listAutoBackups, readAutoBackup } from '../lib/autobackup.js';

function dl(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}

// ---------- Account ----------
export function AccountSheetContent() {
  const { close } = useSheet();
  const { syncCfg, doSignIn, doSignUp, doSignOut, syncNow, syncStatus } = useBudget();
  const [email, setEmail] = useState(''), [pass, setPass] = useState(''), [msg, setMsg] = useState('');
  const signedIn = !!syncCfg.token;

  async function handleSignIn() {
    setMsg('Working…');
    try { await doSignIn(email, pass); setMsg('Signed in.'); } catch (e) { setMsg(e.message); }
  }
  async function handleSignUp() {
    setMsg('Working…');
    try { const d = await doSignUp(email, pass); setMsg(d.access_token ? 'Account created.' : 'Check your email to confirm the account, then sign in.'); } catch (e) { setMsg(e.message); }
  }
  async function handleForgot() {
    if (!email.trim()) { setMsg('Enter your email above first.'); return; }
    setMsg('Sending…');
    try {
      await fetch(syncCfg.url.replace(/\/+$/, '') + '/auth/v1/recover', {
        method: 'POST', headers: { apikey: syncCfg.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setMsg('Check your email for a reset link.');
    } catch (e) { setMsg(e.message); }
  }

  return (
    <>
      <div className="row"><h1>Account</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="card">
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Sign in</div>
          <div className={'mini' + (signedIn ? ' ok' : '')} style={{ marginTop: 2 }}>{signedIn ? `signed in as ${syncCfg.email || 'you'}` : 'signed out'}</div>
        </div>
        <div className="mini" style={{ marginBottom: 10 }}>Signing in syncs your data so it's there on your other devices too. The app works fully without an account &mdash; and this is <b>never</b> a bank login.</div>
        {!signedIn ? (
          <>
            <label>Email</label><input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            <label>Password</label><input type="password" autoComplete="current-password" placeholder="at least 6 characters" value={pass} onChange={e => setPass(e.target.value)} />
            <div style={{ height: 12 }} />
            <button className="b" onClick={handleSignIn}>Sign in</button>
            <div style={{ height: 8 }} />
            <button className="b g" onClick={handleSignUp}>Create an account</button>
            <div style={{ height: 8 }} />
            <button className="b g sm" style={{ width: '100%' }} onClick={handleForgot}>Forgot password?</button>
          </>
        ) : (
          <>
            <div className="mini" style={{ marginBottom: 10 }}>{syncStatus || 'not synced yet'}</div>
            <button className="b g" onClick={() => syncNow()}>Sync now</button>
            <div style={{ height: 8 }} />
            <button className="b g" onClick={doSignOut}>Sign out</button>
          </>
        )}
        {msg && <div className="mini" style={{ marginTop: 10 }}>{msg}</div>}
      </div>
    </>
  );
}

// ---------- Lock ----------
export function LockSheetContent() {
  const { close } = useSheet();
  const { lockCfg, setLockCfg } = useBudget();
  async function setLock() {
    const a = prompt('Choose a PIN or passphrase (at least 4 characters):');
    if (a == null) return;
    if (a.length < 4) return alert('Too short.');
    const b = prompt('Enter it again to confirm:');
    if (a !== b) return alert('They did not match. Nothing changed.');
    const draft = { salt: null };
    const hash = await pinHash(a, draft);
    setLockCfg({ ...draft, hash, on: true });
    alert('Lock is on. You will be asked for this when you open the app.\n\nThere is no way to reset it - if you forget it you will need to erase and restore from a backup.');
  }
  function clearLock() {
    if (!confirm('Turn the lock off? Anyone with this phone will be able to open the app.')) return;
    setLockCfg({ on: false, hash: undefined, salt: undefined });
  }
  return (
    <>
      <div className="row"><h1>Lock this device</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}><div style={{ fontWeight: 700 }}>App lock</div><div className={'mini' + (lockCfg.on ? ' ok' : '')}>{lockCfg.on ? 'on' : 'off'}</div></div>
        <div className="mini" style={{ marginBottom: 10 }}>Asks for a PIN or passphrase when the app opens. It is a gate on this device, not encryption of the stored data.</div>
        <button className={'b' + (lockCfg.on ? ' d' : '')} onClick={lockCfg.on ? clearLock : setLock}>{lockCfg.on ? 'Turn the lock off' : 'Set a PIN or passphrase'}</button>
      </div>
    </>
  );
}

// ---------- Windfall ----------
export function WindfallSheetContent() {
  const { close } = useSheet();
  const { S, setWindfallRule } = useBudget();
  const [thresh, setThresh] = useState(S.windfall?.threshold || '');
  const [pct, setPct] = useState(S.windfall?.pct || '');
  function apply() { setWindfallRule(+thresh || 0, Math.max(0, Math.min(100, +pct || 0))); }
  return (
    <>
      <div className="row"><h1>When money lands</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="card">
        <div className="mini" style={{ marginBottom: 10 }}>Decide now what happens to a bonus, a refund or any unusual lump sum.</div>
        <label>Treat anything above (R)</label>
        <input type="number" inputMode="decimal" value={thresh} onChange={e => setThresh(e.target.value)} onBlur={apply} />
        <label>Straight to savings (%)</label>
        <input type="number" inputMode="decimal" min="0" max="100" value={pct} onChange={e => setPct(e.target.value)} onBlur={apply} />
        <div className="mini" style={{ marginTop: 8 }}>
          {S.windfall?.threshold
            ? `Anything over ${R(S.windfall.threshold)}: ${S.windfall.pct || 0}% goes straight to savings, the rest is yours to use.`
            : 'No rule set. Windfalls tend to evaporate without one.'}
        </div>
      </div>
    </>
  );
}

// ---------- Tax ----------
export function TaxSheetContent() {
  const { close } = useSheet();
  const { S, setTaxDeduction, setTaxYearSel } = useBudget();
  const year = S.taxYearSel || saTaxYear();
  const dd = { ...blankDeductions(), ...(S.taxDeductions[year] || {}) };
  const years = taxYearsAvailable(S.taxDeductions);
  const [showSummary, setShowSummary] = useState(false);

  return (
    <>
      <div className="row"><h1>Tax deductions</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="card">
        <div className="mini" style={{ marginBottom: 10 }}>Capture what you can claim on your ITR12 as you go. This does not submit anything to SARS.</div>
        <label>Tax year</label>
        <select value={year} onChange={e => setTaxYearSel(e.target.value)}>
          {years.map(y => <option key={y} value={y}>{taxYearLabel(y)}{y === saTaxYear() ? ' (current)' : ''}</option>)}
        </select>
        <label>Retirement annuity contributions (R, for the year)</label>
        <input type="number" inputMode="decimal" value={dd.ra || ''} onChange={e => setTaxDeduction(year, { ra: +e.target.value || 0 })} />
        <label>Medical aid contributions (R, for the year)</label>
        <input type="number" inputMode="decimal" value={dd.medAid || ''} onChange={e => setTaxDeduction(year, { medAid: +e.target.value || 0 })} />
        <label>Medical expenses you paid yourself (R)</label>
        <input type="number" inputMode="decimal" value={dd.medOOP || ''} onChange={e => setTaxDeduction(year, { medOOP: +e.target.value || 0 })} />
        <label>Donations to a registered PBO (R)</label>
        <input type="number" inputMode="decimal" value={dd.donations || ''} onChange={e => setTaxDeduction(year, { donations: +e.target.value || 0 })} />
        <label>Section 18A certificate reference(s) <span className="mini">(optional)</span></label>
        <input value={dd.donationRef || ''} onChange={e => setTaxDeduction(year, { donationRef: e.target.value })} />
        <div style={{ height: 10 }} />
        <button className="b g" onClick={() => setShowSummary(s => !s)}>{showSummary ? 'Hide' : 'Preview'} tax summary</button>
        {showSummary && (
          <div className="card" style={{ marginTop: 10 }}>
            <table><tbody>
              <tr><td>Retirement annuity (code 4006)</td><td className="r">{R(dd.ra)}</td></tr>
              <tr><td>Medical aid (code 4005)</td><td className="r">{R(dd.medAid)}</td></tr>
              <tr><td>Medical expenses paid yourself (code 4034)</td><td className="r">{R(dd.medOOP)}</td></tr>
              <tr><td>Donations (18A){dd.donationRef ? ` · ref ${dd.donationRef}` : ''}</td><td className="r">{R(dd.donations)}</td></tr>
            </tbody></table>
          </div>
        )}
        <div className="mini" style={{ marginTop: 10 }}>Not tax advice, and nothing here is submitted to SARS automatically.</div>
      </div>
    </>
  );
}

// ---------- Data ----------
function fmtWhen(ts) {
  if (!ts) return 'never';
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `Today, ${time}` : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) + ', ' + time;
}

export function DataSheetContent() {
  const { close } = useSheet();
  const { S, syncCfg, ensureToken, update, trust, markBackup, restoreBackup } = useBudget();
  const [info, setInfo] = useState('');
  const [restoreMsg, setRestoreMsg] = useState('');
  const autoBackups = listAutoBackups();
  useEffect(() => {
    (async () => {
      const shots = S.tx.filter(t => t.photo).length;
      let q = '';
      try {
        if (navigator.storage?.estimate) {
          const e = await navigator.storage.estimate();
          q = ` · using ${(e.usage / 1048576).toFixed(1)} MB of ${(e.quota / 1048576).toFixed(0)} MB available`;
        }
      } catch (e) { /* ignore */ }
      setInfo(`${S.tx.length} transactions · ${shots} slip photos${q}`);
    })();
  }, [S.tx]);

  function exportData() {
    dl(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }), 'budget-backup-' + iso(new Date()) + '.json');
    markBackup();
  }
  function exportCsv() {
    const rows = [['date', 'amount', 'category', 'note', 'source', 'reconciled']]
      .concat([...S.tx].sort((a, b) => a.d.localeCompare(b.d)).map(t => [t.d, t.a.toFixed(2), t.c, (t.note || '').replace(/"/g, "'"), t.src || '', t.rec ? 'yes' : 'no']));
    dl(new Blob([rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')], { type: 'text/csv' }), 'transactions-' + iso(new Date()) + '.csv');
  }
  async function purgePhotos() {
    const held = S.tx.filter(t => t.photo);
    if (!held.length) return alert('No slip photos are stored on this device.');
    if (!confirm(`Delete all ${held.length} slip photo(s) now?\n\nThey would otherwise be deleted automatically ${PHOTO_TTL_DAYS} days after each was taken. The transactions themselves stay.`)) return;
    for (const t of held) { await photoDel(t.photo); photoRemoteDelete(t.photo, syncCfg, ensureToken); }
    update(s => ({ ...s, tx: s.tx.map(t => t.photo ? { ...t, photo: undefined, photoAt: undefined, photoGone: 1 } : t) }));
    alert(`Deleted ${held.length} photo(s).`);
  }
  async function wipe() {
    if (!confirm('Erase all transactions, budget settings and slip photos on this device? This cannot be undone.')) return;
    for (const t of S.tx) if (t.photo) await photoDel(t.photo);
    localStorage.removeItem(KEY);
    update(() => structuredClone(DEFAULTS));
    close();
  }
  function handleRestore(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(String(reader.result)); }
      catch (e) { setRestoreMsg('That does not look like a valid backup file.'); return; }
      const err = restoreBackup(data);
      setRestoreMsg(err ? err : 'Backup restored.');
    };
    reader.readAsText(file);
  }
  function restoreFromAuto(dateKey) {
    const data = readAutoBackup(dateKey);
    if (!data) { setRestoreMsg('That automatic backup is no longer available.'); return; }
    if (!confirm(`Restore your data to how it was on ${dateKey}? Anything changed since then on this device will be lost unless it's also backed up elsewhere.`)) return;
    const err = restoreBackup(data);
    setRestoreMsg(err ? err : `Restored to ${dateKey}.`);
  }

  return (
    <>
      <div className="row"><h1>Data</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="card">
        <div className="mini" style={{ marginBottom: 4 }}>Last backup: {fmtWhen(trust.lastBackupAt)}</div>
        <div className="mini" style={{ marginBottom: 10 }}>Last statement import: {fmtWhen(trust.lastImportAt)}</div>
        <div className="mini" style={{ marginBottom: 10 }}>{info}</div>
        <button className="b g" onClick={exportData}>Export backup (JSON)</button>
        <div style={{ height: 8 }} />
        <label className="b g" style={{ display: 'block', textAlign: 'center', cursor: 'pointer' }}>
          Restore from backup
          <input type="file" accept="application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) handleRestore(f); e.target.value = ''; }} />
        </label>
        {restoreMsg && <div className={'msg ' + (restoreMsg.includes('restored') || restoreMsg.startsWith('Restored') ? 's' : 'e')} style={{ marginTop: 8 }}>{restoreMsg}</div>}
        {autoBackups.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Automatic backups ({autoBackups.length})</summary>
            <div className="mini" style={{ margin: '8px 0' }}>Taken automatically once a day on this device, kept for 5 days - a safety net if something goes wrong, separate from the export above.</div>
            {autoBackups.map(d => (
              <div className="row" key={d} style={{ padding: '4px 0' }}>
                <span className="mini">{d}</span>
                <a href="#" onClick={e => { e.preventDefault(); restoreFromAuto(d); }} style={{ color: 'var(--blue)' }}>Restore</a>
              </div>
            ))}
          </details>
        )}
        <div style={{ height: 8 }} />
        <button className="b g" onClick={exportCsv}>Export transactions (CSV)</button>
        <div style={{ height: 8 }} />
        <button className="b g" onClick={purgePhotos}>Delete all slip photos now</button>
        <div style={{ height: 8 }} />
        <button className="b d" onClick={wipe}>Erase everything</button>
        <div className="mini" style={{ marginTop: 10 }}>
          Slip photos are deleted automatically {PHOTO_TTL_DAYS} days after each is taken. The JSON export never includes photos.
        </div>
      </div>
    </>
  );
}

// ---------- Settings hub (the account menu's gear icon) ----------
export function MoreMenuContent({ onNavigate }) {
  const { close } = useSheet();
  const items = [
    ['account', 'Account'],
    ['lock', 'Lock this device'],
    ['windfall', 'When money lands'],
    ['tax', 'Tax deductions'],
    ['data', 'Data'],
  ];
  return (
    <>
      <div className="row"><h1>Settings</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="sub">Open any section on its own &mdash; nothing sits on the main page.</div>
      {items.map(([key, label]) => (
        <button key={key} className="b g" style={{ marginTop: 8, textAlign: 'left' }} onClick={() => onNavigate(key)}>{label}</button>
      ))}
    </>
  );
}
