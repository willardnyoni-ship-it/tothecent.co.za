import { useEffect } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { AccountSheetContent } from '../components/SettingsSheets.jsx';
import { useHashTab } from '../app/useHashTab.js';
import BusinessNav from './BusinessNav.jsx';
import BusinessSignup from './BusinessSignup.jsx';
import BizHome from './tabs/Home.jsx';
import Money from './tabs/Money.jsx';
import Invoices from './tabs/Invoices.jsx';
import Expenses from './tabs/Expenses.jsx';
import Reports from './tabs/Reports.jsx';
import Team from './tabs/Team.jsx';
import BizSettings from './tabs/Settings.jsx';
import GuidedTour from '../components/GuidedTour.jsx';

const TABS = { home: BizHome, money: Money, invoices: Invoices, expenses: Expenses, reports: Reports, team: Team };

export default function BusinessApp({ onSwitchMode }) {
  const { syncCfg } = useBudget();
  const { loading, checked, hasBusiness, claimInvites, refreshAll } = useBusiness();
  const { open, close } = useSheet();
  const [tab, goHash] = useHashTab(Object.keys(TABS), 'home');

  useEffect(() => { if (syncCfg.token) claimInvites(); }, [syncCfg.token, claimInvites]);
  useEffect(() => {
    document.body.classList.add('zh-home');
    return () => document.body.classList.remove('zh-home');
  }, []);

  const go = (t) => { goHash(t); window.scrollTo(0, 0); };
  function openSettings() { open(() => <BizSettings onClose={close} />); }

  if (!syncCfg.token) {
    return (
      <div className="light-tab" style={{ maxWidth: 480, margin: '40px auto', padding: '0 14px', textAlign: 'center' }}>
        <h1>Business needs an account</h1>
        <div className="sub">Team members, invoices and customers are shared, so this needs a real sign-in - not just a bank login, never that.</div>
        <div style={{ height: 16 }} />
        <button className="b" onClick={() => open(() => <AccountSheetContent />)}>Sign in or create an account</button>
        <div style={{ height: 8 }} />
        <button className="b g" onClick={onSwitchMode}>Back to personal budget</button>
      </div>
    );
  }

  if (loading || !checked) {
    return <div className="light-tab" style={{ padding: 40, textAlign: 'center' }}><div className="mini">Loading your business…</div></div>;
  }

  if (!hasBusiness) {
    return (
      <BusinessSignup onDone={async (next) => {
        await refreshAll();
        go('money');
        if (next === 'statement') setTimeout(() => {
          // land them on Money's Upload Statement segment
        }, 0);
      }} />
    );
  }

  const Active = TABS[tab] || BizHome;
  return (
    <>
      <BusinessNav tab={tab} go={go} onSwitchMode={onSwitchMode} onOpenSettings={openSettings} />
      <div className="wrap">
        <Active go={go} />
      </div>
      <GuidedTour
        storageKey="wnTourDone_business"
        tab={tab}
        go={go}
        steps={[
          { tab: 'home', title: 'Home', body: 'Cash available, income vs expenses, and anything that needs your attention - overdue invoices, missing receipts, transactions to review.' },
          { tab: 'money', title: 'Money', body: 'Every transaction, income logged separately, manual entry, and importing your bank statement.' },
          { tab: 'invoices', title: 'Invoices', body: 'Customers, creating and sending invoices, tracking payments, and recurring invoices.' },
          { tab: 'expenses', title: 'Expenses', body: 'Scan a receipt and OCR fills in the amount and category for you, ready for approval.' },
          { tab: 'reports', title: 'Reports', body: 'Profit & loss, income and expense breakdowns, and your tax records export.' },
          { tab: 'team', title: 'Team', body: 'Invite your accountant or staff, and set what each of them can see and do.' },
        ]}
      />
    </>
  );
}
