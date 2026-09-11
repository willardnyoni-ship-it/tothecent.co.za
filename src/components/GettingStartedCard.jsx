import { useState } from 'react';

// A standing "how to use this" checklist for everyone, not just accounts
// that haven't finished it yet - it stays visible (ticking items off as
// real data shows up) until the user dismisses it themselves, rather than
// disappearing on its own once every step happens to be done. Each step is
// a real shortcut into the tab that does it. Dismissal is per-device
// (localStorage) - this is a nudge, not data worth syncing.
export default function GettingStartedCard({ storageKey, title, items }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(storageKey) === '1'; } catch (e) { return false; }
  });
  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(storageKey, '1'); } catch (e) { /* ignore */ }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ marginBottom: 4 }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <button className="b g sm" style={{ width: 'auto' }} onClick={dismiss}>Dismiss</button>
      </div>
      {items.map((it, i) => (
        <div key={i} className="row"
          style={{ padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 'none', cursor: it.done ? 'default' : 'pointer' }}
          onClick={() => { if (!it.done) it.onClick?.(); }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ opacity: it.done ? 1 : 0.4 }}>{it.done ? '✅' : '⬜'}</span>
            <span style={{ textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--dim)' : 'inherit' }}>{it.label}</span>
          </div>
          {!it.done && <span className="mini" style={{ color: 'var(--blue)' }}>Go &rsaquo;</span>}
        </div>
      ))}
    </div>
  );
}
