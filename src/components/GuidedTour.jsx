import { useEffect, useState } from 'react';

// A one-time walkthrough, not a lingering checklist: it drives navigation
// itself (via `go`), spotlighting each nav tab in turn with a short
// explanation, then disappears for good once finished or skipped. Steps
// reference nav buttons by a `data-tour="<tab>"` attribute (added on both
// the mobile dropdown and desktop tab-row buttons - only the one actually
// rendered with a size gets used, so it works at any viewport).
export default function GuidedTour({ storageKey, steps, tab, go }) {
  const [running, setRunning] = useState(() => {
    try { return localStorage.getItem(storageKey) !== '1'; } catch (e) { return true; }
  });
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);

  const step = steps[i];

  // Drive navigation to whichever tab the current step is about.
  useEffect(() => {
    if (!running || !step) return;
    if (tab !== step.tab) go(step.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, i]);

  // Track the on-screen position of that tab's nav button so the spotlight
  // follows it - re-measured on resize and shortly after each navigation
  // (the just-switched tab's own content can shift layout a frame later).
  useEffect(() => {
    if (!running || !step) return;
    function measure() {
      const els = document.querySelectorAll(`[data-tour="${step.tab}"]`);
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) { setRect(r); return; }
      }
    }
    measure();
    const t = setTimeout(measure, 60);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [running, i, tab]);

  function finish() {
    setRunning(false);
    try { localStorage.setItem(storageKey, '1'); } catch (e) { /* ignore */ }
  }
  function next() { if (i >= steps.length - 1) finish(); else setI(i + 1); }
  function back() { if (i > 0) setI(i - 1); }

  if (!running || !step || !rect) return null;

  const pad = 6;
  const top = rect.top - pad, left = rect.left - pad;
  const width = rect.width + pad * 2, height = rect.height + pad * 2;
  const tooltipWidth = 280;
  const tooltipLeft = Math.max(14, Math.min(left, window.innerWidth - tooltipWidth - 14));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, pointerEvents: 'auto' }}>
      <div style={{
        position: 'fixed', top, left, width, height, borderRadius: 12,
        boxShadow: '0 0 0 9999px rgba(12,16,26,.64)', transition: 'top .18s ease, left .18s ease',
      }} />
      <div style={{
        position: 'fixed', top: rect.bottom + 14, left: tooltipLeft, width: tooltipWidth,
        background: 'var(--card)', color: 'var(--tx)', borderRadius: 14, padding: 16,
        boxShadow: '0 10px 34px rgba(0,0,0,.35)',
      }}>
        <div className="mini" style={{ marginBottom: 4 }}>{i + 1} of {steps.length}</div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{step.title}</div>
        <div className="mini" style={{ marginBottom: 14 }}>{step.body}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button className="b g sm" style={{ width: 'auto' }} onClick={finish}>Skip</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {i > 0 && <button className="b g sm" style={{ width: 'auto' }} onClick={back}>Back</button>}
            <button className="b sm" style={{ width: 'auto' }} onClick={next}>{i === steps.length - 1 ? 'Done' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
