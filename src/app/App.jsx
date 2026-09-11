import { useEffect, useMemo, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { NavContext } from './NavContext.jsx';
import { SheetProvider, useSheet } from '../components/Sheet.jsx';
import TopNav from '../components/TopNav.jsx';
import LockScreen from '../components/LockScreen.jsx';
import Khanyiso from '../components/Khanyiso.jsx';
import { isStmt, isLog } from '../lib/match.js';
import {
  AccountSheetContent, LockSheetContent, WindfallSheetContent, TaxSheetContent, DataSheetContent, MoreMenuContent,
} from '../components/SettingsSheets.jsx';

import Home from '../tabs/Home.jsx';
import Spending from '../tabs/Spending.jsx';
import Budget from '../tabs/Budget.jsx';
import Receipts from '../tabs/Receipts.jsx';
import Reports from '../tabs/Reports.jsx';
import Snap from '../tabs/Snap.jsx';
import Statement from '../tabs/Statement.jsx';
import BusinessApp from '../business/BusinessApp.jsx';
import { useHashTab } from './useHashTab.js';

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

function WelcomeBanner({ onDismiss }) {
  return (
    <div className="infobox" style={{ margin: '0 14px 10px' }}>
      <b>Welcome!</b> Set up your income and pay day below, or restore a setup file to load your categories, targets and shortcuts in one go.
      <div style={{ marginTop: 8 }}><button className="b g sm" onClick={onDismiss}>Got it</button></div>
    </div>
  );
}

function Shell({ onSwitchToBusiness }) {
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
      <TopNav tab={tab} go={go} hasUnreconciled={hasUnreconciled} onOpenMoreMenu={openMoreMenu} onOpenAccountSheet={openAccountSheet} onSwitchToBusiness={onSwitchToBusiness} />
      <div className="wrap">
        {tab === 'setup' && showWelcome && <WelcomeBanner onDismiss={() => setShowWelcome(false)} />}
        <Active />
      </div>
      <MilestoneToast />
      <LockScreen />
    </NavContext.Provider>
  );
}

const MODE_KEY = 'wnAppMode';

export default function App() {
  const { cycleOffset } = useBudget();
  const [mode, setModeState] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'business') return 'business';
      return localStorage.getItem(MODE_KEY) || 'personal';
    } catch (e) { return 'personal'; }
  });
  const setMode = (m) => { setModeState(m); try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* ignore */ } };

  return (
    <SheetProvider>
      {mode === 'business'
        ? <BusinessApp onSwitchMode={() => setMode('personal')} />
        : <Shell onSwitchToBusiness={() => setMode('business')} />}
      <Khanyiso cycleOffset={cycleOffset} />
    </SheetProvider>
  );
}
