import { classify, SKIP, flowKind } from './categorize.js';

// CSV statement parsers - Capitec, FNB, Standard Bank, Absa, Nedbank.
// Sniffs the header row for the columns we need rather than guessing per
// bank, so an unrecognised bank still works if its headers are sane.
// Ported unchanged from app.html.
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

function csvSplit(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if ((c === ',' || c === ';' || c === '\t') && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim().replace(/^"|"$/g, ''));
}

const CSV_COLS = {
  date: /^(date|transaction date|posting date|trans date|datum|value date|effective date)$/i,
  desc: /^(description|narrative|details|transaction description|reference|payee|memo|beneficiary)$/i,
  amount: /^(amount|transaction amount|value|bedrag)$/i,
  debit: /^(debit|debits|money out|withdrawal|fees|paid out)$/i,
  credit: /^(credit|credits|money in|deposit|paid in)$/i,
  balance: /^(balance|running balance|closing balance|saldo)$/i,
};

function csvNum(v) {
  if (v == null) return null;
  let t = String(v).replace(/[R\s ]/g, '').replace(/[()]/g, m => (m === '(' ? '-' : ''));
  if (/^-?\d{1,3}(\.\d{3})+,\d{2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = parseFloat(t);
  return isFinite(n) ? n : null;
}
const cap3 = x => x.charAt(0).toUpperCase() + x.slice(1, 3).toLowerCase();
const ymd = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)
  ? y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') : null;

function csvDate(v) {
  const t = String(v || '').trim();
  let m;
  if ((m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(t))) return ymd(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/.exec(t))) return ymd(+m[3], +m[2], +m[1]);
  if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2})$/.exec(t))) return ymd(2000 + +m[3], +m[2], +m[1]);
  if ((m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(t)) && MON[cap3(m[2])])
    return ymd(+m[3], MON[cap3(m[2])], +m[1]);
  if ((m = /^(\d{1,2})\s+([A-Za-z]{3})/.exec(t)) && MON[cap3(m[2])])
    return ymd(new Date().getFullYear(), MON[cap3(m[2])], +m[1]);
  return null;
}

export function detectBank(text) {
  const t = text.slice(0, 4000).toLowerCase();
  if (/capitec/.test(t)) return 'Capitec';
  if (/first national bank|\bfnb\b|firstrand/.test(t)) return 'FNB';
  if (/standard bank|stanbic/.test(t)) return 'Standard Bank';
  if (/\babsa\b/.test(t)) return 'Absa';
  if (/nedbank/.test(t)) return 'Nedbank';
  return null;
}

export function parseCsv(text, memory, rules) {
  const rawLines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  const bank = detectBank(text);
  let hdr = -1, map = null;
  for (let i = 0; i < Math.min(rawLines.length, 40); i++) {
    const cells = csvSplit(rawLines[i]);
    if (cells.length < 2) continue;
    const m = {};
    cells.forEach((c, idx) => { for (const k in CSV_COLS) if (CSV_COLS[k].test(c) && m[k] === undefined) m[k] = idx; });
    if (m.date !== undefined && (m.amount !== undefined || m.debit !== undefined || m.credit !== undefined)) {
      hdr = i; map = m; break;
    }
  }
  if (hdr < 0) return { tx: [], skipped: [], bank, error: 'Could not find a header row with a date and an amount column.' };

  const tx = [], skipped = [];
  for (let i = hdr + 1; i < rawLines.length; i++) {
    const c = csvSplit(rawLines[i]);
    if (c.length < 2) continue;
    const d = csvDate(c[map.date]);
    if (!d) continue;
    const desc = (map.desc !== undefined ? c[map.desc] : '')
      .replace(/\s+/g, ' ').replace(/\b\d{6}\*\d{4}\b.*$/, '').trim();

    let amt = null, isCr = false;
    if (map.amount !== undefined) {
      const n = csvNum(c[map.amount]);
      if (n == null) continue;
      isCr = n > 0;
      amt = Math.abs(n);
    } else {
      const dr = map.debit !== undefined ? csvNum(c[map.debit]) : null;
      const cr = map.credit !== undefined ? csvNum(c[map.credit]) : null;
      if (dr != null && Math.abs(dr) > 0) { amt = Math.abs(dr); isCr = false; }
      else if (cr != null && Math.abs(cr) > 0) { amt = Math.abs(cr); isCr = true; }
      else continue;
    }
    if (!amt) continue;
    if (isCr || SKIP.test(desc)) skipped.push({ d, a: amt, desc, cr: isCr, kind: flowKind(desc, isCr) });
    else tx.push({ d, a: amt, desc, c: classify(desc, memory, rules) });
  }
  return { tx, skipped, bank, header: (bank || 'Bank') + ' CSV · ' + tx.length + ' transactions' };
}
