import { classify, SKIP, flowKind } from './categorize.js';

// FNB statement PDF parser, verified 16/16 against four real statements.
// Ported unchanged from app.html - do not "clean up" the regexes without
// re-checking against a real statement, they encode real quirks in FNB's
// layout (card mask columns, "Fb1234" reference noise, etc).
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const NUM = /^[\d,]+\.\d{2}$/;
const DATE = /^(\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/;

function pageRows(content) {
  const items = content.items.filter(i => i.str && i.str.trim() !== '');
  const byY = new Map();
  for (const i of items) {
    const y = Math.round(i.transform[5]);
    let k = y;
    for (const kk of byY.keys()) if (Math.abs(kk - y) <= 2) { k = kk; break; }
    if (!byY.has(k)) byY.set(k, []);
    byY.get(k).push(i);
  }
  return [...byY.entries()].sort((a, b) => b[0] - a[0]).map(([, arr]) => {
    arr.sort((a, b) => a.transform[4] - b.transform[4]);
    return arr.map(i => ({ x: i.transform[4], s: i.str.trim() }));
  });
}

// FNB lays each line out as:
// <date> <description> [card mask] <amount> [Cr] <balance> [Cr] [fee]
function rowToTx(row) {
  if (!row.length) return null;
  const dm = DATE.exec(row[0].s);
  if (!dm) return null;
  const nums = row.filter(t => NUM.test(t.s));
  if (nums.length < 2) return null;
  const amt = nums[0], bal = nums[1];
  const value = parseFloat(amt.s.replace(/,/g, ''));
  if (!value) return null;
  const isCr = row.some(t => /^Cr$/i.test(t.s) && t.x > amt.x && t.x < bal.x);
  const desc = row.filter(t => t.x > row[0].x + 5 && t.x < amt.x - 5 && !NUM.test(t.s))
    .map(t => t.s).join(' ')
    .replace(/\d{6}\*\d{4}.*$/, '')
    .replace(/\b(Fb\d+|Not Provided For|\d{8,})\b/g, '')
    .replace(/\s+/g, ' ').trim();
  return { day: +dm[1], mon: MON[dm[2]], a: value, cr: isCr, desc };
}

export async function parsePdf(file, memory, rules) {
  // pdf.js loads as a plain <script> from the CDN (see app.html's <head>),
  // not an npm dependency - it ships its own worker as a separate file that
  // Vite would otherwise need special handling to bundle correctly.
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let rows = [], header = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const rs = pageRows(await (await pdf.getPage(p)).getTextContent());
    rows = rows.concat(rs);
    if (!header) {
      const h = rs.find(r => r.some(t => /Statement Period/i.test(t.s)));
      if (h) header = h.map(t => t.s).join(' ');
    }
  }
  let year = new Date().getFullYear();
  const ym = header.match(/(20\d{2})/g);
  if (ym) year = +ym[ym.length - 1];

  const out = [], skipped = [];
  let prevMonth = null;
  for (const r of rows) {
    const t = rowToTx(r);
    if (!t) continue;
    let y = year;
    if (prevMonth !== null && t.mon < prevMonth - 6) y = year + 1;
    prevMonth = t.mon;
    const d = y + '-' + String(t.mon).padStart(2, '0') + '-' + String(t.day).padStart(2, '0');
    if (t.cr || SKIP.test(t.desc)) {
      skipped.push({ d, a: t.a, desc: t.desc, cr: t.cr, kind: flowKind(t.desc, t.cr) });
      continue;
    }
    out.push({ d, a: t.a, desc: t.desc, c: classify(t.desc, memory, rules) });
  }
  return { tx: out, skipped, header };
}
