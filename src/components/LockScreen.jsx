import { useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { pinHash } from '../lib/lock.js';

export default function LockScreen() {
  const { lockCfg, setLockCfg, locked, setLocked } = useBudget();
  const [val, setVal] = useState('');
  const [msg, setMsg] = useState('');

  if (!locked) return null;

  async function tryUnlock() {
    if (!val) return;
    const h = await pinHash(val, lockCfg);
    if (h === lockCfg.hash) {
      setLocked(false);
      setLockCfg({ failed: 0 });
    } else {
      const failed = (lockCfg.failed || 0) + 1;
      setLockCfg({ failed });
      setMsg('Not right. ' + (failed > 4 ? 'Still no reset - restore from a backup if you are stuck.' : ''));
      setVal('');
    }
  }

  return (
    <div style={{ display: 'flex', position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 340, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>&#128274;</div>
        <h1 style={{ marginTop: 10 }}>Budget</h1>
        <div className="sub" style={{ marginBottom: 18 }}>Enter your PIN or passphrase</div>
        <input type="password" inputMode="numeric" style={{ textAlign: 'center', fontSize: 23 }}
          value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') tryUnlock(); }} autoFocus />
        <div className="mini bd" style={{ marginTop: 8, minHeight: 16 }}>{msg}</div>
        <div style={{ height: 12 }} />
        <button className="b" onClick={tryUnlock}>Unlock</button>
      </div>
    </div>
  );
}
