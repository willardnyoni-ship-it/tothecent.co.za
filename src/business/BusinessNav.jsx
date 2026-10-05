import { isDemo } from '../lib/demo.js';
import { useEffect, useRef, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';
import { roleLabel } from '../lib/clients.js';

// `feature` tabs only show when that tool is switched on for this business
// (see lib/businessProfiles.js); the rest are the same for everyone.
export const BIZ_TABS = [
  { t: 'clients', label: 'Clients', multi: true },
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

// `multi` is true for someone who belongs to more than one business (an accountant with clients):
// they also get the Clients overview.
export function visibleTabs(features, multi = false) {
  return BIZ_TABS.filter(x => (!x.feature || features.includes(x.feature)) && (!x.multi || multi));
}

export default function BusinessNav({ tab, go, onSwitchMode, onOpenSettings, onOpenAdmin }) {
  const { syncCfg, doSignOut } = useBudget();
  const { business, businesses, switchBusiness, features, myRole } = useBusiness();
  const multi = businesses.length > 1;
  const tabs = visibleTabs(features, multi);
  const [swOpen, setSwOpen] = useState(false);
  const swRef = useRef(null);
  const [navOpen, setNavOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const navRef = useRef(null), acctRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (navRef.current && !navRef.current.contains(e.target)) setNavOpen(false);
      if (acctRef.current && !acctRef.current.contains(e.target)) setAcctOpen(false);
      if (swRef.current && !swRef.current.contains(e.target)) setSwOpen(false);
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
      {multi ? (
        <div className="clientSwitch" ref={swRef}>
          <button className="csBtn" aria-haspopup="listbox" aria-expanded={swOpen} onClick={e => { e.stopPropagation(); setSwOpen(o => !o); }}>
            <span className="csName">{business?.name}</span>
            <small>{roleLabel(myRole)}</small>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {swOpen && (
            <div className="swMenu" role="listbox" aria-label="Switch client">
              <div className="swHead">Your clients ({businesses.length})</div>
              <div className="swList">
                {businesses.map(b => (
                  <button key={b.id} role="option" aria-selected={b.id === business?.id} className={b.id === business?.id ? 'on' : ''}
                    onClick={() => { setSwOpen(false); switchBusiness(b.id); }}>
                    <b>{b.name}</b>
                  </button>
                ))}
              </div>
              <hr />
              <button onClick={() => { setSwOpen(false); go('clients'); }}>All clients overview</button>
            </div>
          )}
        </div>
      ) : <div className="navNow">{business?.name || current?.label}</div>}
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
