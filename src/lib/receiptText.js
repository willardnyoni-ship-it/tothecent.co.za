import { classify } from './categorize.js';

// Pull amount / date / merchant / line-items out of OCR'd slip text.
// Ported unchanged from app.html.
const AMT_RE = /(?:r\s*)?(\d{1,3}(?:[ ,]\d{3})+|\d+)[.,](\d{2})(?!\d)/gi;
const TOTAL_RE = /\b(total|totaal|amount due|balance due|to pay|grand total|card total|payment)\b/i;
const NOT_RE = /\b(sub[\s\-]*total|subtotaal|vat|btw|tax|change|kleingeld|tendered|rounding|discount|saving|balance b|points|loyalty|excl|incl of vat)\b/i;
const DATE_RES = [
  /\b(\d{4})[-\/](\d{2})[-\/](\d{2})\b/,
  /\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})\b/,
  /\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2})\b/,
];
const toNum = m => parseFloat(m[1].replace(/[ ,]/g, '') + '.' + m[2]);

const ITEM_DROP = /\b(sub[\s-]*total|totaal|total|amount due|balance|vat|btw|tax|change|kleingeld|cash|tendered|card|credit|debit|approved|auth|ref\b|terminal|merchant|cashier|till|invoice|receipt|slip|thank|welcome|tel\b|reg\b|www|http|date|time|items?\s*:|qty\b|rounding|discount|loyalty|points|savings?\b|you saved)/i;
const QTY_PREFIX = /^\s*(\d+)\s*(x|@|\*)\s*/i;

function extractItems(lines, total) {
  const items = [];
  for (const raw of lines) {
    const line = (raw.text !== undefined ? raw.text : raw).trim();
    if (!line || line.length < 4) continue;
    if (ITEM_DROP.test(line)) continue;
    const ms = [...line.matchAll(AMT_RE)];
    if (!ms.length) continue;
    const last = ms[ms.length - 1];
    const amt = toNum(last);
    if (!amt || amt <= 0) continue;
    let desc = line.slice(0, last.index)
      .replace(QTY_PREFIX, '')
      .replace(/[^A-Za-z0-9&'%\.\-\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const letters = (desc.match(/[A-Za-z]/g) || []).length;
    if (letters < 3) continue;
    if (desc.length > 40) desc = desc.slice(0, 40);
    items.push({ d: desc, a: amt, conf: raw.confidence != null ? Math.round(raw.confidence) : null });
  }
  return items;
}

export function reconcileItems(items, total) {
  const sum = items.reduce((a, i) => a + i.a, 0);
  if (!total) return { sum, diff: null, ok: false };
  const diff = +(sum - total).toFixed(2);
  return { sum, diff, ok: Math.abs(diff) <= Math.max(0.05, total * 0.005) };
}

export function extractReceipt(text, ocrLines, memory, rules) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let total = null, how = 'largest amount on the slip';
  for (const l of lines) {
    if (TOTAL_RE.test(l) && !NOT_RE.test(l)) {
      const ms = [...l.matchAll(AMT_RE)];
      if (ms.length) { total = toNum(ms[ms.length - 1]); how = 'the line reading "' + l.slice(0, 34) + '"'; }
    }
  }
  if (total == null) {
    const all = [];
    for (const l of lines) {
      if (NOT_RE.test(l)) continue;
      for (const m of l.matchAll(AMT_RE)) all.push(toNum(m));
    }
    if (all.length) total = Math.max(...all);
  }

  let date = null;
  for (const l of lines) {
    for (const re of DATE_RES) {
      const m = re.exec(l); if (!m) continue;
      let y, mo, dd;
      if (m[1].length === 4) { y = +m[1]; mo = +m[2]; dd = +m[3]; }
      else { dd = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
      if (mo >= 1 && mo <= 12 && dd >= 1 && dd <= 31 && y >= 2020 && y <= 2100) {
        const c = new Date(y, mo - 1, dd);
        if (c <= new Date(Date.now() + 86400000)) { date = c.toISOString().slice(0, 10); break; }
      }
    }
    if (date) break;
  }

  const NOISE = /^(tax invoice|invoice|vat|reg\b|vat reg|tel\b|fax|receipt|slip|copy|cash ?ier|terminal|merchant|date|time|customer|welcome|thank|www\.|http|p\.?o\.? box|shop \d|tel:)/i;
  const looksLikeAddress = l => /\b(street|str\b|road|rd\b|ave\b|avenue|drive|dr\b|mall|centre|center|p o box|box \d)\b/i.test(l) && /\d/.test(l);
  const cands = [];
  for (const l of lines.slice(0, 8)) {
    const clean = l.replace(/[^A-Za-z0-9&'*\s\-\.]/g, '').replace(/\s+/g, ' ').trim();
    const letters = (clean.match(/[A-Za-z]/g) || []).length;
    if (letters < 3 || clean.length < 4) continue;
    if (NOISE.test(clean) || looksLikeAddress(clean)) continue;
    if (letters / clean.length < 0.45) continue;
    cands.push(clean.slice(0, 34));
  }
  let merchant = '';
  for (const cnd of cands) { if (classify(cnd, memory, rules) !== 'Uncategorised') { merchant = cnd; break; } }
  if (!merchant) merchant = cands[0] || '';

  const cat = classify(merchant + ' ' + lines.slice(0, 10).join(' '), memory, rules);
  const items = extractItems(ocrLines && ocrLines.length ? ocrLines : lines, total);
  const rec = reconcileItems(items, total);
  return { total, date: date || new Date().toISOString().slice(0, 10), merchant, cat, how, text, items, rec, totalConf: null };
}
