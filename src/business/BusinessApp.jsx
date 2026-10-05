import { useEffect, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet, SheetOutlet } from '../components/Sheet.jsx';
import { AccountSheetContent } from '../components/SettingsSheets.jsx';
import { useHashTab } from '../app/useHashTab.js';
import BusinessNav, { visibleTabs } from './BusinessNav.jsx';
import BusinessSignup from './BusinessSignup.jsx';
import BizHome from './tabs/Home.jsx';
import Money from './tabs/Money.jsx';
import Invoices from './tabs/Invoices.jsx';
import Expenses from './tabs/Expenses.jsx';
import Reports from './tabs/Reports.jsx';
import Team from './tabs/Team.jsx';
import BizSettings from './tabs/Settings.jsx';
import Jobs from './tabs/Jobs.jsx';
import Time from './tabs/Time.jsx';
import Stock from './tabs/Stock.jsx';
import Bookings from './tabs/Bookings.jsx';
import Vehicles from './tabs/Vehicles.jsx';
import Clients from './tabs/Clients.jsx';
import Activity from './tabs/Activity.jsx';
import GuidedTour from '../components/GuidedTour.jsx';
import { isDemo } from '../lib/demo.js';

const TABS = { activity: Activity, clients: Clients, home: BizHome, bookings: Bookings, money: Money, invoices: Invoices, jobs: Jobs, time: Time, expenses: Expenses, vehicles: Vehicles, stock: Stock, reports: Reports, team: Team };

const TOUR_STEPS = [
  { tab: 'clients', title: 'Clients', body: 'Every business you look after, with what is overdue, unreviewed or missing a receipt. Open one to work in its books.' },
  { tab: 'home', title: 'Home', body: 'Cash available, income vs expenses, and anything that needs your attention - overdue invoices, missing receipts, transactions to review.' },
  { tab: 'bookings', title: 'Bookings', body: 'Your appointments by day, deposits, no-shows, and what each staff member brought in.' },
  { tab: 'money', title: 'Money', body: 'Every transaction, income logged separately, manual entry, and importing your bank statement.' },
  { tab: 'invoices', title: 'Invoices', body: 'Customers, quotes, creating and sending invoices, tracking payments, and recurring invoices.' },
  { tab: 'jobs', title: 'Jobs', body: 'Everything for one job in one place - the quote, invoices, materials and hours - so you can see what it really made.' },
  { tab: 'time', title: 'Time', body: 'Start a timer or log hours, then turn unbilled time into an invoice.' },
  { tab: 'expenses', title: 'Expenses', body: 'Scan a receipt and OCR fills in the amount and category for you, ready for approval.' },
  { tab: 'vehicles', title: 'Vehicles', body: 'Each car from purchase to sale: what you paid, everything you spent on it, and the profit when it sells.' },
  { tab: 'stock', title: 'Stock', body: 'What you have on the shelf, what it is worth, and what is running low.' },
  { tab: 'reports', title: 'Reports', body: 'Profit & loss, income and expense breakdowns, and your tax records export.' },
  { tab: 'activity', title: 'Activity', body: 'A record of who added, changed or deleted what, and when. It cannot be edited from the app.' },
  { tab: 'team', title: 'Team', body: 'Invite your accountant or staff, and set what each of them can see and do.' },
];

export default function BusinessApp({ onSwitchMode, onOpenAdmin }) {
  const { syncCfg } = useBudget();
  const { loading, checked, hasBusiness, claimInvites, refreshAll, features, businesses, business, myRole } = useBusiness();
  const { open, close } = useSheet();
  const [tab, goHash] = useHashTab(Object.keys(TABS), 'home');
  // Which section Money should open on - set when sign-up's "Upload Bank
  // Statement" button sends someone straight there.
  const [moneyStart, setMoneyStart] = useState(null);
  const tabs = visibleTabs(features, businesses.length > 1, myRole).map(x => x.t);

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
        <SheetOutlet />
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
        setMoneyStart(next === 'statement' ? 'statement' : 'add');
        go('money');
      }} />
    );
  }

  // A tab whose tool was switched off (or a bookmarked #stock link on a
  // business without stock) falls back to Home instead of a dead screen.
  const Active = (tabs.includes(tab) && TABS[tab]) || BizHome;
  return (
    <>
      <BusinessNav tab={tab} go={go} onSwitchMode={onSwitchMode} onOpenSettings={openSettings} onOpenAdmin={onOpenAdmin} />
      <div className="wrap">
        {isDemo() && <div className="demo-bar"><b>Preview</b> Example data only - try anything, nothing is saved and nobody is notified.</div>}
        <Active key={business ? business.id : 'none'} go={go} onOpenSettings={openSettings} startSeg={tab === 'money' ? moneyStart : undefined} />
      </div>
      <GuidedTour
        storageKey="wnTourDone_business"
        tab={tab}
        go={go}
        steps={TOUR_STEPS.filter(st => tabs.includes(st.tab))}
      />
      <SheetOutlet />
    </>
  );
}
