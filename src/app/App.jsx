import { useEffect, useMemo, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';
import { NavContext } from './NavContext.jsx';
import { SheetProvider, SheetOutlet, useSheet } from '../components/Sheet.jsx';
import TopNav from '../components/TopNav.jsx';
import LockScreen from '../components/LockScreen.jsx';
import Khanyiso from '../components/Khanyiso.jsx';
import { isStmt, isLog } from '../lib/match.js';
import GuidedTour from '../components/GuidedTour.jsx';
import {
  AccountSheetContent, SubscriptionSheetContent, LockSheetContent, WindfallSheetContent, TaxSheetContent, DataSheetContent, MoreMenuContent,
} from '../components/SettingsSheets.jsx';

import Home from '../tabs/Home.jsx';
import Spending from '../tabs/Spending.jsx';
import Budget from '../tabs/Budget.jsx';
import Receipts from '../tabs/Receipts.jsx';
import Reports from '../tabs/Reports.jsx';
import Snap from '../tabs/Snap.jsx';
import Statement from '../tabs/Statement.jsx';
import BusinessApp from '../business/BusinessApp.jsx';
import AdminApp from '../admin/AdminApp.jsx';
import SignInRequired from '../components/SignInRequired.jsx';
import { useIsAppAdmin, logDailyActivity } from '../admin/adminApi.js';
import { isDemo } from '../lib/demo.js';
import { useHashTab } from './useHashTab.js';
import { useSubscription } from '../lib/subscription.js';
import Paywall, { TrialBar } from '../components/Paywall.jsx';
import FirstLogin from '../components/FirstLogin.jsx';
import { useAccountFlags } from '../lib/accountFlags.js';

const TAB_COMPONENTS = {
  today: Home, spending: Spending, setup: Budget, receipts: Receipts, insight: Reports, snap: Snap, stmt: Statement,
};

// The five primary tabs share the wide, full-bleed desktop layout (see
// body.zh-home rules in app.css); Snap and the statement-upload screen stay
// a narrower reading column since they're single-purpose forms.
const PRIMARY_TAB_KEYS = ['today', 'spending', 'setup', 'receipts', 'insight'];

function MilestoneToast() {
  const { milestone, dismissMilestone } = useBudget();
  if (!milestone) return null;
  return (
    <div className="sheet on" onClick={e => { if (e.currentTarget === e.target) dismissMilestone(); }}>
      <div>
        <div className="grab" />
        <div className="row"><h1>&#127881; {milestone.title}</h1><button className="b g sm" onClick={dismissMilestone}>Close</button></div>
        <div className="card" style={{ marginTop: 12, borderColor: 'var(--acc)' }}><div>{milestone.body}</div></div>
      </div>
    </div>
  );
}

// Back from Paystack's payment page (the app opens with ?paid=1&reference=...):
// confirm the payment and say what happened.
function PaidReturn() {
  const { ensureToken, syncCfg } = useBudget();
  const [state, setState] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('paid') === '1' && /^ttc_[0-9a-f]{20}$/.test(p.get('reference') || p.get('trxref') || '') ? 'checking' : '';
  });
  useEffect(() => {
    if (state !== 'checking') return;
    const p = new URLSearchParams(window.location.search);
    const ref = p.get('reference') || p.get('trxref');
    (async () => {
      let ok = false;
      try {
        const token = await ensureToken();
        const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/functions/v1/paystack', { method: 'POST', headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify', reference: ref }) });
        ok = !!(await r.json()).ok;
      } catch { /* shown below */ }
      setState(ok ? 'done' : 'failed');
      history.replaceState(null, '', window.location.pathname + window.location.hash);
      if (ok) setTimeout(() => window.location.reload(), 1800); // open the app now that it is paid
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return null;
  const text = { checking: 'Confirming your payment…', done: "You're subscribed. Thank you! You can see your plan under Settings → Subscription.", failed: "We couldn't confirm that payment yet. If you were charged, it will show under Settings → Subscription within a few minutes." }[state];
  return (
    <div className="infobox" style={{ position: 'fixed', top: 10, left: 14, right: 14, zIndex: 60, boxShadow: '0 8px 30px rgba(0,0,0,.18)' }}>
      {text}
      {state !== 'checking' && <div style={{ marginTop: 8 }}><button className="b g sm" onClick={() => setState('')}>Got it</button></div>}
    </div>
  );
}

function WelcomeBanner({ onDismiss }) {
  return (
    <div className="infobox" style={{ margin: '0 14px 10px' }}>
      <b>Welcome!</b> Set up your income and pay day below, or restore a setup file to load your categories, targets and shortcuts in one go.
      <div style={{ marginTop: 8 }}><button className="b g sm" onClick={onDismiss}>Got it</button></div>
    </div>
  );
}

function Shell({ onSwitchToBusiness, onOpenAdmin }) {
  const { S } = useBudget();
  const { open } = useSheet();
  const [tab, goHash] = useHashTab(Object.keys(TAB_COMPONENTS), 'today');
  const [snapAction, setSnapAction] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('onboard') === '1') { goHash('setup'); setShowWelcome(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CSS gates the wide desktop layout behind body.zh-home - ported from the
  // original's `document.body.classList.toggle('zh-home', ...)` inside its
  // go() function, which the React port had dropped, leaving every primary
  // tab stuck at the narrow (760px-cap) reading-column width on desktop.
  useEffect(() => {
    document.body.classList.toggle('zh-home', PRIMARY_TAB_KEYS.includes(tab));
  }, [tab]);

  const go = (t) => { goHash(t); window.scrollTo(0, 0); };

  const hasUnreconciled = useMemo(() => {
    const unrec = S.tx.filter(t => isLog(t) && !t.rec).length;
    return unrec > 0 && S.tx.some(isStmt);
  }, [S.tx]);

  function openMoreMenu() {
    open(() => <MoreMenuContent onNavigate={key => {
      if (key === 'account') open(() => <AccountSheetContent />);
      else if (key === 'subscription') open(() => <SubscriptionSheetContent />);
      else if (key === 'lock') open(() => <LockSheetContent />);
      else if (key === 'windfall') open(() => <WindfallSheetContent />);
      else if (key === 'tax') open(() => <TaxSheetContent />);
      else if (key === 'data') open(() => <DataSheetContent />);
    }} />);
  }
  function openAccountSheet() { open(() => <AccountSheetContent />); }

  const Active = TAB_COMPONENTS[tab] || Home;

  return (
    <NavContext.Provider value={{ go, snapAction, setSnapAction }}>
      <TopNav tab={tab} go={go} hasUnreconciled={hasUnreconciled} onOpenMoreMenu={openMoreMenu} onOpenAccountSheet={openAccountSheet} onSwitchToBusiness={onSwitchToBusiness} onOpenAdmin={onOpenAdmin} />
      <div className="wrap">
        {tab === 'setup' && showWelcome && <WelcomeBanner onDismiss={() => setShowWelcome(false)} />}
        <Active />
      </div>
      <MilestoneToast />
      <LockScreen />
      <GuidedTour
        storageKey="wnTourDone_personal"
        tab={tab}
        go={go}
        steps={[
          { tab: 'today', title: 'Home', body: "Today's safe-to-spend amount, upcoming bills and recent activity, all at a glance." },
          { tab: 'spending', title: 'Spending', body: 'See exactly where your money went this month and last, by category.' },
          { tab: 'setup', title: 'Budget', body: 'Set your income, pay day, savings goal and category targets here.' },
          { tab: 'receipts', title: 'Receipts', body: "Scan a slip and OCR reads the total for you - it's also where slips get matched against your bank statement." },
          { tab: 'insight', title: 'Reports', body: 'Monthly reviews, recurring payments, and CSV export whenever you want your numbers elsewhere.' },
        ]}
      />
      <SheetOutlet />
    </NavContext.Provider>
  );
}

const MODE_KEY = 'wnAppMode';

export default function App() {
  const { cycleOffset, syncCfg, ensureToken, S } = useBudget();
  const { hasBusiness, checked } = useBusiness();
  const isAdmin = useIsAppAdmin();
  const { b: billing } = useSubscription();
  const account = useAccountFlags();
  // The owner console is an in-session view only - it's never remembered
  // as the mode to reopen into, so the app always starts on a real budget.
  const [adminOpen, setAdminOpen] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('mode') === 'admin'; } catch (e) { return false; }
  });
  // A within-session choice (explicit "Switch to Business/Personal" click,
  // or having just created a business) - never written to localStorage on
  // its own, so it can't outlive this sign-in.
  const [override, setOverride] = useState(null);
  const setMode = (m) => {
    setOverride(m);
    try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* ignore */ }
  };

  const forceBusiness = (() => {
    try { return new URLSearchParams(window.location.search).get('mode') === 'business'; } catch (e) { return false; }
  })();

  // wnAppMode is a per-device flag, but "which app do I open into" must
  // follow the signed-in ACCOUNT, not whatever the last account on this
  // device happened to leave behind. Without the hasBusiness check, a
  // personal-only sign-in on a device that had ever touched Business mode
  // (a different account, or an abandoned "explore Business" click that
  // never became a real business) would get dropped straight into the
  // Business setup wizard instead of their own personal budget.
  let mode;
  if (override) mode = override;
  else if (forceBusiness) mode = 'business';
  else if (!checked) mode = null; // still confirming whether this account has a business
  else if (hasBusiness) {
    let saved = null;
    try { saved = localStorage.getItem(MODE_KEY); } catch (e) { /* ignore */ }
    mode = saved === 'personal' ? 'personal' : 'business';
  } else mode = 'personal';

  // Once a day per device: "this account used the app today" - feeds the
  // owner console's active-user numbers.
  useEffect(() => {
    if (mode && !isDemo()) logDailyActivity(syncCfg, ensureToken, mode);
  }, [syncCfg.token, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // An account is required to use the app (it's what keeps phone and
  // computer in step). Checked on the saved login, not the network, so a
  // signed-in device still opens offline.
  if (!syncCfg.token) {
    return <SignInRequired hasLocalData={!!(S && ((S.tx && S.tx.length) || S.income))} />;
  }

  // Someone the owner set up with emailed login details: choose a password and personal-or-business first.
  if (syncCfg.token && account.flags === null) {
    return <div className="light-tab" style={{ padding: 40, textAlign: 'center' }}><div className="mini">Loading…</div></div>;
  }
  if (account.needsSetup) {
    return <SheetProvider><FirstLogin flags={account.flags} setFlags={account.setFlags} save={account.save} /></SheetProvider>;
  }

  // After the free month, and nobody paying: the app is locked (the person's data is kept).
  // If the plan can't be read (offline), the app stays open.
  if (!isDemo() && billing && billing.access === 'locked' && !isAdmin) {
    return <SheetProvider><PaidReturn /><Paywall /></SheetProvider>;
  }

  if (mode === null) {
    return <div className="light-tab" style={{ padding: 40, textAlign: 'center' }}><div className="mini">Loading…</div></div>;
  }

  return (
    <SheetProvider>
      <PaidReturn />
      {!isDemo() && billing && billing.access === 'ok' && billing.status === 'none' && billing.trial_ends_on && !isAdmin && (() => {
        const left = Math.ceil((new Date(billing.trial_ends_on + 'T12:00:00') - new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00')) / 86400000);
        return left > 0 && left <= 7 ? <TrialBar daysLeft={left} /> : null;
      })()}
      {adminOpen && isAdmin
        ? <AdminApp onExit={() => setAdminOpen(false)} />
        : mode === 'business'
          ? <BusinessApp onSwitchMode={() => setMode('personal')} onOpenAdmin={isAdmin ? () => setAdminOpen(true) : null} />
          : <Shell onSwitchToBusiness={() => setMode('business')} onOpenAdmin={isAdmin ? () => setAdminOpen(true) : null} />}
      {!(adminOpen && isAdmin) && !isDemo() && <Khanyiso cycleOffset={cycleOffset} />}
    </SheetProvider>
  );
}
