import { useEffect, useRef, useState } from 'react';

const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });

// One series over time: 2px line on a soft area, recessive gridlines, a
// crosshair + tooltip that follows the pointer (and works by touch), and
// an accessible summary. Single series, so the card title names it - no
// legend box.
export function TrendChart({ data, label, unit = ['', ''], height = 180, endLabel = 'Today' }) {
  const ref = useRef(null);
  const boxRef = useRef(null);
  const [hover, setHover] = useState(null);
  // Draw at the card's real pixel width, so axis text stays 11px instead
  // of shrinking with a scaled viewBox on narrow cards.
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height, L = 32, R = 10, T = 12, B = 26;
  const max = Math.max(1, ...data.map(d => d.n));
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const x = i => L + (data.length <= 1 ? 0 : i * (W - L - R) / (data.length - 1));
  const y = v => T + (H - T - B) * (1 - v / top);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.n).toFixed(1)}`).join(' ');
  const area = data.length ? `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : '';
  const ticks = [0, top / 2, top];
  const total = data.reduce((a, d) => a + d.n, 0);

  function onMove(e) {
    const box = ref.current.getBoundingClientRect();
    const px = ((e.touches ? e.touches[0].clientX : e.clientX) - box.left) / box.width * W;
    const i = Math.round((px - L) / ((W - L - R) / Math.max(1, data.length - 1)));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  }
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="op-chart" ref={boxRef}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${label}: ${total} over the last ${data.length} days`}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={onMove} onTouchMove={onMove}>
        <g className="grid">{ticks.map(t => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">
          {ticks.map(t => <text key={t} x={L - 8} y={y(t) + 4} textAnchor="end">{t}</text>)}
          {data.length > 0 && <>
            <text x={x(0)} y={H - 6} textAnchor="start">{fmtDay(data[0].day)}</text>
            <text x={x(Math.floor((data.length - 1) / 2))} y={H - 6} textAnchor="middle">{fmtDay(data[Math.floor((data.length - 1) / 2)].day)}</text>
            <text x={x(data.length - 1)} y={H - 6} textAnchor="end">{endLabel}</text>
          </>}
        </g>
        <path d={area} style={{ fill: 'var(--op-acc)', opacity: 0.1 }} />
        <path d={line} style={{ fill: 'none', stroke: 'var(--op-acc)' }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {h && <>
          <line x1={x(hover)} x2={x(hover)} y1={T} y2={y(0)} style={{ stroke: 'var(--op-ink3)' }} strokeDasharray="3 3" />
          <circle cx={x(hover)} cy={y(h.n)} r="5" style={{ fill: 'var(--op-acc)', stroke: 'var(--op-surface)' }} strokeWidth="2" />
        </>}
      </svg>
      {h && (
        <div className="op-tip" style={{ left: (x(hover) / W * 100) + '%', top: (y(h.n) / H * 100) + '%' }}>
          {fmtDay(h.day)}<b>{h.n} {h.n === 1 ? unit[0] : unit[1]}</b>
        </div>
      )}
    </div>
  );
}

// Ranked magnitudes across categories: one hue, longest first, the value
// printed beside every bar (few enough rows that each label earns its place).
export function RankBars({ rows, empty = 'Nothing yet.' }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (!rows.length) return <div className="op-empty">{empty}</div>;
  return (
    <div className="op-hbars">
      {rows.map(r => (
        <div className="op-hbar" key={r.label} title={`${r.label}: ${r.value}`}>
          <div className="row"><span>{r.label}</span><b>{r.value}</b></div>
          <div className="track"><div className="fill" style={{ width: (r.value / max * 100) + '%' }} /></div>
        </div>
      ))}
    </div>
  );
}
