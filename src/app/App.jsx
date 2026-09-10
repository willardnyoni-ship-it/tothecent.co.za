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

const TAB_COMPONENTS = {
  today: Home, spending: Spending, setup: Budget, receipts: Receipts, insight: Reports, snap: Snap, stmt: Statement,
};

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

function Shell() {
  const { S } = useBudget();
  const { open } = useSheet();
  const [tab, setTab] = useState('today');
  const [snapAction, setSnapAction] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('onboard') === '1') { setTab('setup'); setShowWelcome(true); }
  }, []);

  const go = (t) => { setTab(t); window.scrollTo(0, 0); };

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
      <TopNav tab={tab} go={go} hasUnreconciled={hasUnreconciled} onOpenMoreMenu={openMoreMenu} onOpenAccountSheet={openAccountSheet} />
      <div className="wrap">
        {tab === 'setup' && showWelcome && <WelcomeBanner onDismiss={() => setShowWelcome(false)} />}
        <Active />
      </div>
      <MilestoneToast />
      <LockScreen />
    </NavContext.Provider>
  );
}

export default function App() {
  const { cycleOffset } = useBudget();
  return (
    <SheetProvider>
      <Shell />
      <Khanyiso cycleOffset={cycleOffset} />
    </SheetProvider>
  );
}
