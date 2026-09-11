import { useEffect, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { AccountSheetContent } from '../components/SettingsSheets.jsx';
import BusinessNav from './BusinessNav.jsx';
import BusinessSignup from './BusinessSignup.jsx';
import BizHome from './tabs/Home.jsx';
import Money from './tabs/Money.jsx';
import Invoices from './tabs/Invoices.jsx';
import Expenses from './tabs/Expenses.jsx';
import Reports from './tabs/Reports.jsx';
import Team from './tabs/Team.jsx';
import BizSettings from './tabs/Settings.jsx';

const TABS = { home: BizHome, money: Money, invoices: Invoices, expenses: Expenses, reports: Reports, team: Team };

export default function BusinessApp({ onSwitchMode }) {
  const { syncCfg } = useBudget();
  const { loading, checked, hasBusiness, claimInvites, refreshAll } = useBusiness();
  const { open, close } = useSheet();
  const [tab, setTab] = useState('home');

  useEffect(() => { if (syncCfg.token) claimInvites(); }, [syncCfg.token, claimInvites]);
  useEffect(() => {
    document.body.classList.add('zh-home');
    return () => document.body.classList.remove('zh-home');
  }, []);

  const go = (t) => { setTab(t); window.scrollTo(0, 0); };
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
    </>
  );
}
