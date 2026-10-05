import { useEffect, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { businessFileUrl } from '../lib/businessApi.js';
import { isDemo } from '../lib/demo.js';
import { R2 } from '../lib/format.js';

// The picture of a receipt is private: it is fetched with the signed-in person's own access (every member
// of the business can read it, including the accountant) and kept for the session.
const cache = new Map(); // storage path -> blob URL

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// The demo has no real photos, so it draws a till slip from the expense's own details.
export function demoSlip(e) {
  const total = (+e.amount || 0).toFixed(2), vat = (+e.vat || 0).toFixed(2), net = ((+e.amount || 0) - (+e.vat || 0)).toFixed(2);
  const name = esc((e.merchant || e.description || 'Receipt').toUpperCase().slice(0, 28));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="520" viewBox="0 0 340 520" font-family="Courier New, monospace">
<rect width="340" height="520" fill="#f4f2ec"/><rect x="18" y="14" width="304" height="492" fill="#fff" stroke="#d6d2c4"/>
<text x="170" y="62" font-size="19" font-weight="700" text-anchor="middle" fill="#222">${name}</text>
<text x="170" y="84" font-size="12" text-anchor="middle" fill="#666">TAX INVOICE</text>
<line x1="38" y1="104" x2="302" y2="104" stroke="#bbb" stroke-dasharray="4 3"/>
<text x="38" y="130" font-size="13" fill="#333">DATE  ${esc(e.date)}</text>
<text x="38" y="152" font-size="13" fill="#333">SLIP  ${esc(String(e.id).slice(-6).toUpperCase())}</text>
<line x1="38" y1="172" x2="302" y2="172" stroke="#bbb" stroke-dasharray="4 3"/>
<text x="38" y="200" font-size="13" fill="#333">${esc((e.description || e.category || 'Item').slice(0, 24))}</text><text x="302" y="200" font-size="13" text-anchor="end" fill="#333">${total}</text>
<line x1="38" y1="352" x2="302" y2="352" stroke="#bbb" stroke-dasharray="4 3"/>
<text x="38" y="378" font-size="13" fill="#333">SUBTOTAL</text><text x="302" y="378" font-size="13" text-anchor="end" fill="#333">${net}</text>
<text x="38" y="400" font-size="13" fill="#333">VAT 15%</text><text x="302" y="400" font-size="13" text-anchor="end" fill="#333">${vat}</text>
<text x="38" y="432" font-size="17" font-weight="700" fill="#111">TOTAL</text><text x="302" y="432" font-size="17" font-weight="700" text-anchor="end" fill="#111">R ${total}</text>
<text x="170" y="480" font-size="11" text-anchor="middle" fill="#888">Example receipt for the preview</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function useReceipt(expense) {
  const { syncCfg, ensureToken } = useBudget();
  const path = expense && expense.receipt_storage_path;
  const [url, setUrl] = useState(() => (path && cache.get(path)) || null);
  const [state, setState] = useState(!path ? 'missing' : url ? 'ready' : 'loading');
  useEffect(() => {
    let live = true;
    if (!path) { setUrl(null); setState('missing'); return; }
    if (isDemo()) { setUrl(demoSlip(expense)); setState('ready'); return; }
    if (cache.has(path)) { setUrl(cache.get(path)); setState('ready'); return; }
    setState('loading'); setUrl(null);
    (async () => {
      try {
        const token = await ensureToken();
        const u = await businessFileUrl(syncCfg, token, path);
        if (!live) return;
        if (u) { cache.set(path, u); setUrl(u); setState('ready'); } else setState('missing');
      } catch { if (live) setState('missing'); }
    })();
    return () => { live = false; };
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return { url, state };
}

export function ReceiptThumb({ expense, onClick }) {
  const { url, state } = useReceipt(expense);
  return (
    <button className="rcpt-thumb" aria-label="View receipt picture" title="View receipt picture" onClick={e => { e.stopPropagation(); onClick(); }}
      style={url ? { backgroundImage: `url("${url}")` } : undefined}>
      {!url && <span>{state === 'missing' ? 'Not found' : '…'}</span>}
    </button>
  );
}

function ReceiptViewerContent({ ids, start }) {
  const { close } = useSheet();
  const { expenses, members } = useBusiness();
  const list = ids.map(id => expenses.find(e => e.id === id)).filter(Boolean);
  const [i, setI] = useState(Math.max(0, ids.indexOf(start)));
  const [zoom, setZoom] = useState(false);
  const e = list[i];
  const { url, state } = useReceipt(e);
  useEffect(() => {
    const k = ev => { if (ev.key === 'ArrowRight') setI(x => Math.min(list.length - 1, x + 1)); if (ev.key === 'ArrowLeft') setI(x => Math.max(0, x - 1)); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [list.length]);
  useEffect(() => setZoom(false), [i]);
  if (!e) return null;
  const by = members.find(m => m.user_id && m.user_id === e.submitted_by);
  const fileName = `receipt-${e.date}-${String(e.merchant || e.description || 'expense').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.${url && url.startsWith('data:image/svg') ? 'svg' : 'jpg'}`;
  return (
    <>
      <div className="row"><h1>Receipt</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="mini">{list.length > 1 ? `${i + 1} of ${list.length} · ` : ''}use the arrow keys or the buttons to move between receipts</div>
      <div className={'rcpt-stage' + (zoom ? ' zoom' : '')}>
        {url
          ? <img src={url} alt={'Receipt: ' + (e.merchant || e.description || 'expense')} onClick={() => setZoom(z => !z)} />
          : <div className="mini" style={{ padding: 40, textAlign: 'center' }}>{state === 'missing' ? "This receipt's picture could not be found." : 'Loading the picture…'}</div>}
      </div>
      <div className="mini" style={{ margin: '4px 0 8px' }}>Tap the picture to {zoom ? 'fit it to the screen' : 'zoom in'}.</div>
      <div className="card rcpt-facts">
        <div className="row"><span className="mini">Description</span><b>{e.description || e.merchant || '-'}</b></div>
        <div className="row"><span className="mini">Date</span><b>{e.date}</b></div>
        <div className="row"><span className="mini">Amount</span><b>{R2(+e.amount)}</b></div>
        <div className="row"><span className="mini">VAT</span><b>{+e.vat > 0 ? R2(+e.vat) : 'none captured'}</b></div>
        <div className="row"><span className="mini">Category</span><b>{e.category || 'Uncategorised'}</b></div>
        <div className="row"><span className="mini">Status</span><b>{String(e.status || '').replace(/_/g, ' ')}</b></div>
        {by && <div className="row"><span className="mini">Added by</span><b>{by.email}</b></div>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="b g" style={{ flex: 1 }} disabled={i === 0} onClick={() => setI(i - 1)}>&larr; Previous</button>
        <button className="b g" style={{ flex: 1 }} disabled={i >= list.length - 1} onClick={() => setI(i + 1)}>Next &rarr;</button>
      </div>
      {url && <a className="b" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 8 }} href={url} download={fileName}>Download picture</a>}
    </>
  );
}

// open(list of expense ids, the one to show first)
export function useReceiptViewer() {
  const { open } = useSheet();
  return (ids, start) => open(() => <ReceiptViewerContent ids={ids} start={start} />);
}
