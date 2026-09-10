import { useEffect, useRef, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';

export const PRIMARY_TABS = [
  { t: 'today', label: 'Home' },
  { t: 'spending', label: 'Spending' },
  { t: 'setup', label: 'Budget' },
  { t: 'receipts', label: 'Receipts' },
  { t: 'insight', label: 'Reports' },
];

const ICO = {
  profile: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>,
  out: <><path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></>,
};

export default function TopNav({ tab, go, hasUnreconciled, onOpenMoreMenu, onOpenAccountSheet }) {
  const { syncCfg, doSignOut } = useBudget();
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [acctMenuOpen, setAcctMenuOpen] = useState(false);
  const navRef = useRef(null), acctRef = useRef(null);
  const signedIn = !!syncCfg.token;

  useEffect(() => {
    function onDoc(e) {
      if (navRef.current && !navRef.current.contains(e.target)) setNavMenuOpen(false);
      if (acctRef.current && !acctRef.current.contains(e.target)) setAcctMenuOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') { setNavMenuOpen(false); setAcctMenuOpen(false); } }
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  const current = PRIMARY_TABS.find(x => x.t === tab);

  function acctDisplayName() {
    if (!signedIn) return 'Not signed in';
    const local = (syncCfg.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
    return local ? local.toUpperCase() : 'SIGNED IN';
  }

  async function handleLogout() {
    setAcctMenuOpen(false);
    if (!signedIn) { onOpenAccountSheet(); return; }
    await doSignOut();
  }

  return (
    <header className="topnav">
      <button className="navToggle" aria-label="Menu" aria-haspopup="menu" aria-expanded={navMenuOpen} ref={navRef}
        onClick={e => { e.stopPropagation(); setNavMenuOpen(o => !o); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" />
        </svg>
      </button>
      <div className="navNow">{current?.label}</div>
      <div className="navMenu" role="menu" hidden={!navMenuOpen}>
        {PRIMARY_TABS.map(x => (
          <button key={x.t} className={x.t === tab ? 'on' : ''} onClick={() => { setNavMenuOpen(false); go(x.t); }}>
            {x.label}
            {x.t === 'receipts' && hasUnreconciled && <span className="nmDot" />}
          </button>
        ))}
      </div>
      <div className="tabs">
        {PRIMARY_TABS.map(x => (
          <button key={x.t} className={x.t === tab ? 'on' : ''} onClick={() => go(x.t)}>
            {x.label}
            {x.t === 'receipts' && <span className={'dot' + (hasUnreconciled ? ' on' : '')} />}
          </button>
        ))}
      </div>
      <button className="avatar" aria-label="Account menu" aria-haspopup="menu" aria-expanded={acctMenuOpen} ref={acctRef}
        onClick={e => { e.stopPropagation(); setAcctMenuOpen(o => !o); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3.4" /><path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6" />
        </svg>
      </button>
      <div className="acctMenu" role="menu" hidden={!acctMenuOpen}>
        <div className="who"><b>{acctDisplayName()}</b>{signedIn && syncCfg.email && <span>{syncCfg.email}</span>}</div>
        <button role="menuitem" onClick={() => { setAcctMenuOpen(false); onOpenAccountSheet(); }}>
          <svg viewBox="0 0 24 24">{ICO.profile}</svg><span className="lbl">Profile</span>
        </button>
        <button role="menuitem" onClick={() => { setAcctMenuOpen(false); onOpenMoreMenu(); }}>
          <svg viewBox="0 0 24 24">{ICO.gear}</svg><span className="lbl">Settings</span>
        </button>
        <hr />
        <button role="menuitem" onClick={handleLogout}>
          <svg viewBox="0 0 24 24">{ICO.out}</svg><span className="lbl">{signedIn ? 'Log out' : 'Sign in'}</span>
        </button>
      </div>
    </header>
  );
}
