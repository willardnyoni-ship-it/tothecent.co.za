import { useEffect, useRef, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';

export const BIZ_TABS = [
  { t: 'home', label: 'Home' },
  { t: 'money', label: 'Money' },
  { t: 'invoices', label: 'Invoices' },
  { t: 'expenses', label: 'Expenses' },
  { t: 'reports', label: 'Reports' },
  { t: 'team', label: 'Team' },
];

export default function BusinessNav({ tab, go, onSwitchMode, onOpenSettings }) {
  const { syncCfg, doSignOut } = useBudget();
  const { business } = useBusiness();
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

  const current = BIZ_TABS.find(x => x.t === tab);

  return (
    <header className="topnav">
      <button className="navToggle" aria-label="Menu" ref={navRef} onClick={e => { e.stopPropagation(); setNavOpen(o => !o); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" />
        </svg>
      </button>
      <div className="navNow">{business?.name || current?.label}</div>
      <div className="navMenu" hidden={!navOpen}>
        {BIZ_TABS.map(x => (
          <button key={x.t} data-tour={x.t} className={x.t === tab ? 'on' : ''} onClick={() => { setNavOpen(false); go(x.t); }}>{x.label}</button>
        ))}
        <hr />
        <button onClick={() => { setNavOpen(false); onOpenSettings(); }}>Settings</button>
      </div>
      <div className="tabs">
        {BIZ_TABS.map(x => (
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
        <button onClick={() => { setAcctOpen(false); onSwitchMode(); }}>Switch to Personal</button>
        <hr />
        <button onClick={doSignOut}>Log out</button>
      </div>
    </header>
  );
}
