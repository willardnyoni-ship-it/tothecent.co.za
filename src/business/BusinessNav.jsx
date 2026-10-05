import { isDemo } from '../lib/demo.js';
import { useEffect, useRef, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';

// `feature` tabs only show when that tool is switched on for this business
// (see lib/businessProfiles.js); the rest are the same for everyone.
export const BIZ_TABS = [
  { t: 'home', label: 'Home' },
  { t: 'bookings', label: 'Bookings', feature: 'bookings' },
  { t: 'money', label: 'Money' },
  { t: 'invoices', label: 'Invoices' },
  { t: 'jobs', label: 'Jobs', feature: 'jobs' },
  { t: 'time', label: 'Time', feature: 'time' },
  { t: 'expenses', label: 'Expenses' },
  { t: 'vehicles', label: 'Vehicles', feature: 'vehicles' },
  { t: 'stock', label: 'Stock', feature: 'stock' },
  { t: 'reports', label: 'Reports' },
  { t: 'team', label: 'Team' },
];

export function visibleTabs(features) {
  return BIZ_TABS.filter(x => !x.feature || features.includes(x.feature));
}

export default function BusinessNav({ tab, go, onSwitchMode, onOpenSettings, onOpenAdmin }) {
  const { syncCfg, doSignOut } = useBudget();
  const { business, features } = useBusiness();
  const tabs = visibleTabs(features);
  const [navOpen, setNavOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const navRef = useRef(null), acctRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (navRef.current && !navRef.current.contains(e.target)) setNavOpen(false);
      if (acctRef.current && !acctRef.current.contains(e.target)) setAcctOpen(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const current = tabs.find(x => x.t === tab);

  return (
    <header className="topnav">
      <button className="navToggle" data-tour="navtoggle" aria-label="Menu" ref={navRef} onClick={e => { e.stopPropagation(); setNavOpen(o => !o); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" />
        </svg>
      </button>
      <div className="navNow">{business?.name || current?.label}</div>
      <div className="navMenu" hidden={!navOpen}>
        {tabs.map(x => (
          <button key={x.t} data-tour={x.t} className={x.t === tab ? 'on' : ''} onClick={() => { setNavOpen(false); go(x.t); }}>{x.label}</button>
        ))}
        <hr />
        <button onClick={() => { setNavOpen(false); onOpenSettings(); }}>Settings</button>
      </div>
      <div className="tabs">
        {tabs.map(x => (
          <button key={x.t} data-tour={x.t} className={x.t === tab ? 'on' : ''} onClick={() => go(x.t)}>{x.label}</button>
        ))}
      </div>
      <button className="avatar" aria-label="Account menu" ref={acctRef} onClick={e => { e.stopPropagation(); setAcctOpen(o => !o); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3.4" /><path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6" />
        </svg>
      </button>
      <div className="acctMenu" hidden={!acctOpen}>
        <div className="who"><b>{business?.name}</b><span>{syncCfg.email}</span></div>
        <button onClick={() => { setAcctOpen(false); onOpenSettings(); }}>Settings</button>
        {!isDemo() && <button onClick={() => { setAcctOpen(false); onSwitchMode(); }}>Switch to Personal</button>}
        {onOpenAdmin && <button onClick={() => { setAcctOpen(false); onOpenAdmin(); }}>App owner view</button>}
        <hr />
        {!isDemo() && <button onClick={doSignOut}>Log out</button>}
      </div>
    </header>
  );
}
