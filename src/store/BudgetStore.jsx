import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { KEY, DEFAULTS, loadState } from './defaults.js';
import { uid } from '../lib/format.js';
import { classify, remember } from '../lib/categorize.js';
import { checkMilestones } from '../lib/milestones.js';
import {
  loadSync, saveSync, sessionFromAuthResponse, signIn as apiSignIn, signUp as apiSignUp,
  refreshSession, apiSignOut, pullAndMergeAndPush,
} from '../lib/supabase.js';
import { photoDel, photoRemoteDelete, photoExpired } from '../lib/photos.js';
import { loadLock, saveLock } from '../lib/lock.js';
import { loadTrust, saveTrust } from '../lib/trust.js';
import { snapshotIfNeeded } from '../lib/autobackup.js';
import { validateBackup } from '../lib/backupValidate.js';

const BudgetContext = createContext(null);

export function useBudget() {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget must be used inside <BudgetProvider>');
  return ctx;
}

export function BudgetProvider({ children }) {
  const [S, setS] = useState(loadState);
  // The periodic auto-sync effect below only depends on [syncCfg.auto,
  // syncCfg.token], so its setInterval callback keeps calling whichever
  // syncNow closure existed when that effect last ran - not a fresh one for
  // every render. Since syncNow used to close over S directly, every 20s
  // tick synced (and could revert local state to) a snapshot of S from
  // however long ago sign-in happened, silently undoing anything typed
  // since then - confirmed live as the cause of budget numbers reverting
  // mid-edit. Reading sRef.current instead of S inside syncNow means it
  // always sees the latest state no matter how old the closure is.
  const sRef = useRef(S);
  sRef.current = S;
  const [syncCfg, setSyncCfgState] = useState(loadSync);
  const [lockCfg, setLockCfgState] = useState(loadLock);
  const [locked, setLocked] = useState(() => !!loadLock().on);
  const [cycleOffset, setCycleOffsetRaw] = useState(0);
  const [milestone, setMilestone] = useState(null);
  const [syncStatus, setSyncStatus] = useState('');
  const [trust, setTrustState] = useState(loadTrust);
  const syncBusyRef = useRef(false);
  // Set by every user change (update()), cleared when a sync starts - so a
  // sync that merely merges in the other device's data doesn't itself
  // trigger another sync.
  const dirtyRef = useRef(false);

  const setTrust = useCallback((patch) => setTrustState(prev => {
    const next = { ...prev, ...patch };
    saveTrust(next);
    return next;
  }), []);

  // Persist to localStorage on every state change - the React equivalent of
  // the original app's save() call at the end of every mutating function.
  // Also takes a once-a-day rolling snapshot to a separate key (autobackup.js)
  // so a bug that corrupts the live state doesn't take the last few days'
  // history down with it.
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { alert('Could not save - storage may be full, or you are in private browsing.'); }
    if (snapshotIfNeeded(S)) setTrust({ lastBackupAt: Date.now() });
  }, [S, setTrust]);

  // One-off boot tasks: purge expired slip photos, check for a milestone
  // already earned by data restored from a backup.
  useEffect(() => {
    (async () => {
      const due = S.tx.filter(t => t.photo && photoExpired(t));
      if (due.length) {
        for (const t of due) {
          await photoDel(t.photo);
          photoRemoteDelete(t.photo, syncCfg, ensureToken);
        }
        setS(s => ({
          ...s,
          tx: s.tx.map(t => due.some(d => d.id === t.id) ? { ...t, photo: undefined, photoAt: undefined, photoGone: 1 } : t),
        }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update helper: functional or partial-object updates, mirroring the
  // original's "mutate S, then save(), then render()" pattern in one call.
  // Also checks for a newly-earned milestone every time, same as the
  // original's checkMilestones() at the end of render().
  const update = useCallback((updater) => {
    dirtyRef.current = true;
    setS(prev => {
      let next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      const hit = checkMilestones(next);
      if (hit) {
        next = { ...next, achievements: [...(next.achievements || []), hit.id] };
        setTimeout(() => setMilestone(hit), 0);
      }
      return next;
    });
  }, []);

  const cycleOffsetSet = useCallback((n) => setCycleOffsetRaw(Math.min(0, n)), []);
  const resetCycle = useCallback(() => setCycleOffsetRaw(0), []);

  // ---------- transactions ----------
  const addTx = useCallback((tx) => {
    update(s => {
      const t = { id: uid(), mod: Date.now(), ...tx };
      const mem = t.note && t.c ? remember(s.memory, t.note, t.c) : s.memory;
      return { ...s, tx: [...s.tx, t], memory: mem };
    });
  }, [update]);

  const editTx = useCallback((id, patch) => {
    update(s => ({
      ...s,
      tx: s.tx.map(t => t.id === id ? { ...t, ...patch, mod: Date.now() } : t),
      memory: (patch.note || patch.c) ? remember(s.memory, patch.note ?? s.tx.find(t => t.id === id)?.note, patch.c ?? s.tx.find(t => t.id === id)?.c) : s.memory,
    }));
  }, [update]);

  const deleteTx = useCallback((id) => {
    update(s => ({
      ...s,
      tx: s.tx.filter(t => t.id !== id),
      deleted: [...(s.deleted || []), id].slice(-2000),
    }));
  }, [update]);

  const importTx = useCallback((rows, kind) => {
    update(s => ({ ...s, tx: [...s.tx, ...rows.map(r => ({ id: uid(), mod: Date.now(), src: kind, ...r }))] }));
  }, [update]);

  const recordFlows = useCallback((flows) => {
    update(s => ({ ...s, flows: [...(s.flows || []), ...flows] }));
  }, [update]);

  // ---------- settings ----------
  const setIncome = useCallback(v => update(s => ({ ...s, income: +v || 0, syncedAt: Date.now() })), [update]);
  const setCycleDay = useCallback(v => update(s => ({ ...s, cycleDay: +v || 1, syncedAt: Date.now() })), [update]);
  const setSavingsGoal = useCallback(v => update(s => ({ ...s, savingsGoal: +v || 0, syncedAt: Date.now() })), [update]);
  const setBudgetRollover = useCallback(v => update(s => ({ ...s, budgetRollover: !!v, syncedAt: Date.now() })), [update]);
  const setWeekly = useCallback(v => update(s => ({ ...s, weekly: !!v, syncedAt: Date.now() })), [update]);
  const setMethod = useCallback(v => update(s => ({ ...s, method: v, syncedAt: Date.now() })), [update]);

  const setCatTarget = useCallback((i, v) => update(s => {
    const cats = [...s.cats]; cats[i] = { ...cats[i], t: +v || 0 };
    return { ...s, cats, syncedAt: Date.now() };
  }), [update]);
  const addCat = useCallback((name, amt) => update(s => {
    if (!name) return s;
    return { ...s, cats: [...s.cats, { n: name, t: +amt || 0 }], syncedAt: Date.now() };
  }), [update]);
  const delCat = useCallback((i) => update(s => {
    const cats = s.cats.filter((_, idx) => idx !== i);
    return { ...s, cats, syncedAt: Date.now() };
  }), [update]);
  const applyRecommendedBudget = useCallback((perCat) => update(s => {
    const cats = [...s.cats];
    Object.entries(perCat).forEach(([n, amt]) => {
      const i = cats.findIndex(c => c.n === n);
      if (i >= 0) cats[i] = { ...cats[i], t: Math.round(amt) };
      else cats.push({ n, t: Math.round(amt) });
    });
    return { ...s, cats, syncedAt: Date.now() };
  }), [update]);

  const setTaxDeduction = useCallback((year, patch) => update(s => ({
    ...s,
    taxDeductions: { ...s.taxDeductions, [year]: { ...(s.taxDeductions[year] || {}), ...patch } },
  })), [update]);
  const setTaxYearSel = useCallback(v => update(s => ({ ...s, taxYearSel: v })), [update]);

  const setWindfallRule = useCallback((threshold, pct) => update(s => ({
    ...s, windfall: threshold > 0 ? { threshold, pct, handled: (s.windfall && s.windfall.handled) || [] } : null,
  })), [update]);

  const addMember = useCallback(name => update(s => ({ ...s, members: [...(s.members || []), { id: uid(), name }] })), [update]);
  const delMember = useCallback(id => update(s => ({ ...s, members: (s.members || []).filter(m => m.id !== id) })), [update]);
  const setSplit = useCallback((txId, map) => update(s => {
    const splits = { ...(s.splits || {}) };
    if (!map || !Object.keys(map).length) delete splits[txId]; else splits[txId] = map;
    return { ...s, splits };
  }), [update]);

  // Validated so a corrupted/foreign JSON file can't silently wipe good data
  // with garbage - returns an error string on failure, null on success.
  const restoreBackup = useCallback((data) => {
    const err = validateBackup(data);
    if (err) return err;
    update(() => ({ ...structuredClone(DEFAULTS), ...data }));
    return null;
  }, [update]);
  const markStatementImport = useCallback(() => setTrust({ lastImportAt: Date.now() }), [setTrust]);
  const markBackup = useCallback(() => setTrust({ lastBackupAt: Date.now() }), [setTrust]);
  const markBizBackup = useCallback(() => setTrust({ lastBizBackupAt: Date.now() }), [setTrust]);

  // ---------- auth / sync ----------
  const setSyncCfg = useCallback((patch) => setSyncCfgState(prev => {
    const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
    saveSync(next);
    return next;
  }), []);

  const doSignUp = useCallback(async (email, password) => {
    const d = await apiSignUp(syncCfg, email, password);
    if (d.access_token) setSyncCfg(sessionFromAuthResponse(d));
    return d;
  }, [syncCfg, setSyncCfg]);

  const doSignIn = useCallback(async (email, password) => {
    const d = await apiSignIn(syncCfg, email, password);
    setSyncCfg(sessionFromAuthResponse(d));
    return d;
  }, [syncCfg, setSyncCfg]);

  const ensureToken = useCallback(async () => {
    if (!syncCfg.token) throw new Error('Sign in first.');
    if (Date.now() < (syncCfg.expires || 0)) return syncCfg.token;
    const d = await refreshSession(syncCfg);
    const sess = sessionFromAuthResponse(d);
    setSyncCfg(sess);
    return sess.token;
  }, [syncCfg, setSyncCfg]);

  // Signing out first makes sure this device's latest changes have reached
  // the account, then removes this device's copy of the personal budget -
  // the account is now the home of the data, and leaving a copy behind would
  // show it to (or merge it into) whoever signs in on this device next.
  const doSignOut = useCallback(async () => {
    if (syncCfg.token) {
      let saved = false;
      try {
        const token = await ensureToken();
        await pullAndMergeAndPush(syncCfg, token, sRef.current);
        saved = true;
      } catch (e) { console.warn('final sync before sign-out failed', e); }
      if (!saved && !window.confirm("Some changes on this device haven't been saved to your account yet - you may be offline. Sign out anyway? Those changes will be lost.")) return;
    }
    try { await apiSignOut(syncCfg); } catch (e) { /* signing out locally is what matters */ }
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem('wnAppMode');
      Object.keys(localStorage).filter(k => k.startsWith('wnAutoBackup')).forEach(k => localStorage.removeItem(k));
    } catch (e) { /* ignore */ }
    setSyncCfg({ token: undefined, refresh: undefined, userId: undefined, email: undefined, expires: undefined });
    window.location.href = '/';
  }, [syncCfg, setSyncCfg, ensureToken]);

  const syncNow = useCallback(async (silent) => {
    if (!syncCfg.token) { if (!silent) alert('Sign in first - sync needs an account so only you can reach your data.'); return; }
    if (syncBusyRef.current) return;
    syncBusyRef.current = true;
    dirtyRef.current = false;
    setSyncStatus('Syncing…');
    try {
      const token = await ensureToken();
      const merged = await pullAndMergeAndPush(syncCfg, token, sRef.current);
      setS(s => ({ ...s, ...merged }));
      setSyncCfg({ last: Date.now() });
      setSyncStatus('Synced ' + new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.warn(err);
      setSyncStatus('Sync failed');
      if (!silent) alert(err.message);
    } finally { syncBusyRef.current = false; }
  }, [syncCfg, ensureToken, setSyncCfg]);

  // Keeping every device in step while signed in (on unless someone has
  // explicitly switched it off - logins saved by the landing page never
  // set the flag, which used to leave them not syncing at all):
  //  - straight away when the app opens,
  //  - whenever the app comes back to the front, regains focus or the
  //    connection returns (so switching from phone to PC shows the latest),
  //  - every 20s while visible, to pick up the other device's changes,
  //  - ~1.5s after any change made here, so nothing sits on one device.
  const autoSync = !!syncCfg.token && !!syncCfg.url && syncCfg.auto !== false;
  useEffect(() => {
    if (!autoSync) return;
    syncNow(true);
    const onBack = () => { if (document.visibilityState === 'visible') syncNow(true); };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    window.addEventListener('online', onBack);
    const id = setInterval(onBack, 20000);
    return () => {
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
      window.removeEventListener('online', onBack);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync, syncCfg.token]);

  useEffect(() => {
    if (!autoSync || !dirtyRef.current) return;
    const t = setTimeout(() => syncNow(true), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S, autoSync]);

  // ---------- device lock ----------
  const setLockCfg = useCallback(patch => setLockCfgState(prev => {
    const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
    saveLock(next);
    return next;
  }), []);

  const value = {
    S, update, cycleOffset, setCycleOffset: cycleOffsetSet, resetCycle,
    addTx, editTx, deleteTx, importTx, recordFlows,
    setIncome, setCycleDay, setSavingsGoal, setBudgetRollover, setWeekly, setMethod,
    setCatTarget, addCat, delCat, applyRecommendedBudget,
    setTaxDeduction, setTaxYearSel, setWindfallRule,
    addMember, delMember, setSplit, restoreBackup,
    trust, markStatementImport, markBackup, markBizBackup,
    syncCfg, setSyncCfg, doSignUp, doSignIn, doSignOut, syncNow, ensureToken, syncStatus,
    lockCfg, setLockCfg, locked, setLocked,
    milestone, dismissMilestone: () => setMilestone(null),
  };

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
}
