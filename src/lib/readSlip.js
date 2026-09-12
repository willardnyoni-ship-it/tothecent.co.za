import { shrink, forOcr, runOcr } from './ocr.js';
import { extractReceipt, reconcileItems } from './receiptText.js';
import { classify } from './categorize.js';
import { iso } from './format.js';

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

// Haiku 4.5 vision OCR, signed-in users only. Tesseract stays the fallback
// for everyone else and for any failure of this path. Distinguishes "your
// session actually needs re-signing-in" from "Claude declined/failed this
// once" - both used to collapse into the same silent null, so a real
// sign-out looked identical to (and got reported as) a one-off hiccup with
// no indication that signing back in would fix it.
async function readSlipViaHaiku(file, syncCfg, ensureToken, memory, rules) {
  if (!syncCfg.token || !syncCfg.userId) return { hk: null, signedOut: true };
  let token;
  try {
    token = await ensureToken();
  } catch (e) {
    return { hk: null, signedOut: true }; // session expired and refresh failed
  }
  try {
    const prepped = await shrink(file, 1568, 0.85);
    const b64 = await blobToBase64(prepped);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    let resp;
    try {
      resp = await fetch(syncCfg.url.replace(/\/+$/, '') + '/functions/v1/read-receipt', {
        method: 'POST', signal: ctrl.signal,
        headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64, mimeType: 'image/jpeg' }),
      });
    } finally { clearTimeout(timer); }
    if (!resp.ok) return { hk: null, signedOut: resp.status === 401 };
    const d = await resp.json();
    if (!d || d.error) return { hk: null, signedOut: false };

    const merchant = String(d.merchant || '').slice(0, 60);
    const items = Array.isArray(d.items)
      ? d.items.filter(i => i && typeof i.a === 'number' && isFinite(i.a)).map(i => ({ d: String(i.d || '').slice(0, 60), a: i.a }))
      : [];
    const total = (typeof d.total === 'number' && isFinite(d.total)) ? d.total : null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? d.date : iso(new Date());
    const cat = classify([merchant, d.category_hint, ...items.map(i => i.d)].filter(Boolean).join(' '), memory, rules);
    const rec = reconcileItems(items, total);
    if (total == null && !items.length) return { hk: null, signedOut: false };
    return { hk: { total, date, merchant, cat, how: 'the slip image', text: '', items, rec, totalConf: null }, signedOut: false };
  } catch (e) { return { hk: null, signedOut: false }; }
}

export async function readSlip(file, onProg, syncCfg, ensureToken, memory, rules) {
  const thumb = await shrink(file, 1000, 0.6);
  if (syncCfg.token) {
    onProg(0.15, 'Reading slip…');
    const { hk, signedOut } = await readSlipViaHaiku(file, syncCfg, ensureToken, memory, rules);
    if (hk) { hk.readable = true; onProg(1, 'Done'); return { r: hk, thumb }; }
    onProg(0.05, signedOut
      ? "You've been signed out - reading on this device instead. Sign in again under Settings for more accurate scanning."
      : 'Reading on this device instead…');
  }
  const ocrImg = await forOcr(file);
  let out = { text: '', lines: [] }, r = null;
  try {
    out = await runOcr(ocrImg, onProg, '4');
    r = extractReceipt(out.text, out.lines, memory, rules);
    if (r.total == null || !r.merchant || !r.items.length) {
      onProg(0.9, 'Retrying with a different reading mode…');
      const alt = await runOcr(await forOcr(file, 2400), p => onProg(0.9 + p * 0.1), '6');
      const r2 = extractReceipt(alt.text, alt.lines, memory, rules);
      const score = x => (x.total != null ? 3 : 0) + (x.merchant ? 1 : 0) + (x.rec && x.rec.ok ? 3 : 0) + Math.min(3, x.items.length);
      if (score(r2) > score(r)) { r = r2; out = alt; }
    }
  } catch (err) { console.warn(err); }
  if (!r) r = extractReceipt(out.text, out.lines, memory, rules);
  r.readable = r.total != null || r.items.length > 0;
  return { r, thumb };
}
