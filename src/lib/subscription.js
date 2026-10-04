// Paying by subscription (Paystack, through the 'paystack' Edge Function).
import { useCallback, useEffect, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { isDemo } from './demo.js';

export const PRICES = { personal: 89, business: 389 };

const DEMO_KEY = 'ttc_demo_sub';
const demoRead = () => { try { return JSON.parse(sessionStorage.getItem(DEMO_KEY) || 'null'); } catch { return null; } };
const demoWrite = v => { try { sessionStorage.setItem(DEMO_KEY, JSON.stringify(v)); } catch { /* demo only */ } };

export function useSubscription() {
  const { syncCfg, ensureToken } = useBudget();
  const [b, setB] = useState(null);
  const [loading, setLoading] = useState(true);
  const demo = isDemo();
  const base = (syncCfg.url || '').replace(/\/+$/, '');

  const reload = useCallback(async () => {
    if (demo) {
      const d = demoRead() || {};
      const trial = new Date(); trial.setDate(trial.getDate() + 19);
      setB({ trial_ends_on: trial.toISOString().slice(0, 10), status: 'none', suggested_plan: 'business', ...d });
      setLoading(false);
      return;
    }
    if (!syncCfg.token) { setB(null); setLoading(false); return; }
    try {
      const token = await ensureToken();
      const r = await fetch(base + '/rest/v1/rpc/my_billing', { method: 'POST', headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
      setB(r.ok ? await r.json() : null);
    } catch { setB(null); }
    setLoading(false);
  }, [demo, base, syncCfg.token, syncCfg.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload]);

  // One call to the payments function. Returns { ok, url?, error? }.
  const call = useCallback(async (action, extra = {}) => {
    if (demo) {
      await new Promise(r => setTimeout(r, 600));
      if (action === 'subscribe') {
        const end = b && b.trial_ends_on;
        demoWrite({ status: 'active', plan: extra.plan, card_brand: 'visa', card_last4: '4081', next_payment_on: end || null, has_subscription: true, trial_ends_on: end });
        return { ok: true, demo: true };
      }
      if (action === 'cancel') { demoWrite({ ...(demoRead() || {}), status: 'cancelled' }); return { ok: true }; }
      return { ok: false, error: 'This is a preview - no real payment pages open here.' };
    }
    try {
      const token = await ensureToken();
      const r = await fetch(base + '/functions/v1/paystack', { method: 'POST', headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
      return await r.json();
    } catch { return { ok: false, error: "Couldn't reach the payment service. Check your connection and try again." }; }
  }, [demo, base, syncCfg.key, b]); // eslint-disable-line react-hooks/exhaustive-deps

  return { b, loading, reload, call, signedIn: demo || !!syncCfg.token };
}
