import { useCallback, useEffect, useState } from 'react';

// Keeps a tab's active-section state in sync with location.hash, so every
// section has a real, shareable, bookmarkable URL (tothecent.co.za/app.html
// #invoices) and the browser's back/forward buttons move between tabs -
// this app previously never changed the URL at all when switching tabs.
export function useHashTab(validKeys, defaultTab) {
  const [tab, setTabState] = useState(() => {
    const h = window.location.hash.slice(1);
    return validKeys.includes(h) ? h : defaultTab;
  });

  // A fresh load with no hash (or an invalid one, e.g. after switching
  // between personal/business mode) should still show a correct URL -
  // replaceState so this doesn't add a spurious back-button entry.
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h !== tab) history.replaceState(null, '', '#' + tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onHashChange() {
      const h = window.location.hash.slice(1);
      if (validKeys.includes(h)) setTabState(h);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback((t) => {
    if (!validKeys.includes(t)) return;
    setTabState(t);
    if (window.location.hash.slice(1) !== t) window.location.hash = t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [tab, go];
}
