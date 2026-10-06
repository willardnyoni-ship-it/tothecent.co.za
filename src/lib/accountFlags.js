// Flags the owner portal puts on an account it set up (see createLogin in the account Edge Function):
//   must_change_password - they were given a generated password, so they choose their own first
//   setup_pending        - they have not yet said whether this is for themselves or for a business
// Read from the signed-in person's own record. If it can't be read the app simply opens as normal.
import { useCallback, useEffect, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { isDemo } from './demo.js';

const demoSetup = () => { try { return new URLSearchParams(location.search).get('setup') === '1'; } catch { return false; } };
const pick = meta => ({ must_change_password: !!(meta && meta.must_change_password), setup_pending: !!(meta && meta.setup_pending) });

export function useAccountFlags() {
  const { syncCfg, ensureToken } = useBudget();
  const [flags, setFlags] = useState(() => (isDemo() ? (demoSetup() ? { must_change_password: true, setup_pending: true } : {}) : null));
  useEffect(() => {
    if (isDemo() || !syncCfg.token) return;
    let live = true;
    (async () => {
      try {
        const token = await ensureToken();
        const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/auth/v1/user', { headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000) });
        const d = r.ok ? await r.json() : null;
        if (live) setFlags(pick(d && d.user_metadata));
      } catch { if (live) setFlags({}); }
    })();
    return () => { live = false; };
  }, [syncCfg.token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save a change to the person's own record (a new password and/or cleared flags).
  const save = useCallback(async ({ password, data }) => {
    if (isDemo()) { await new Promise(r => setTimeout(r, 400)); return; }
    const token = await ensureToken();
    const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/auth/v1/user', {
      method: 'PUT', headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(password ? { password } : {}), data }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.msg || d.error_description || d.message || `Could not save (${r.status})`);
  }, [syncCfg, ensureToken]);

  return { flags, setFlags, save, needsSetup: !!(flags && (flags.must_change_password || flags.setup_pending)) };
}
