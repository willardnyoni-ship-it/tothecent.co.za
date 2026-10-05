// Foreign-currency invoices. A document keeps all its amounts in its own
// currency, with the rand rate it was made at (exchange_rate = rand per 1 unit
// of that currency; 1 for ZAR). Rand figures are always amount x rate.

export const CURRENCIES = [
  ['ZAR', 'South African rand'], ['USD', 'US dollar'], ['EUR', 'Euro'], ['GBP', 'British pound'], ['AUD', 'Australian dollar'],
  ['CAD', 'Canadian dollar'], ['NZD', 'New Zealand dollar'], ['CHF', 'Swiss franc'], ['AED', 'UAE dirham'], ['SGD', 'Singapore dollar'], ['BWP', 'Botswana pula'], ['KES', 'Kenyan shilling'],
];
export const isCode = c => /^[A-Z]{3}$/.test(String(c || ''));

const num = (n, d = 2) => (+n || 0).toLocaleString('en-ZA', { minimumFractionDigits: d, maximumFractionDigits: d });

export const currencyOf = doc => (doc && isCode(doc.currency) ? doc.currency : 'ZAR');
export const isForeign = doc => currencyOf(doc) !== 'ZAR';
export const rateOf = doc => (isForeign(doc) && +doc.exchange_rate > 0 ? +doc.exchange_rate : 1);

// "R1 234,50" for rand (as everywhere else in the app), "USD 1 234,50" for others.
export function fmt(amount, currency = 'ZAR') {
  const a = +amount || 0;
  const sign = a < 0 ? '-' : '';
  const body = num(Math.abs(a));
  return sign + (!currency || currency === 'ZAR' ? 'R' + body : currency + ' ' + body);
}
export const fmtDoc = (doc, amount) => fmt(amount, currencyOf(doc));

// The rand value of an amount on a document.
export const zar = (doc, amount) => Math.round((+amount || 0) * rateOf(doc) * 100) / 100;

// "R18,4500 per USD"
export const rateText = (code, rate) => `R${num(rate, 4)} per ${code}`;

// Today's rate from a free public service (no key). Returns rand per 1 unit,
// or null if it can't be had - the person can always type the rate in.
const cache = {};
export async function fetchRate(code) {
  if (!isCode(code) || code === 'ZAR') return 1;
  const hit = cache[code];
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.rate;
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${code}`, { signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    const rate = d && d.result === 'success' && d.rates && +d.rates.ZAR > 0 ? +(+d.rates.ZAR).toFixed(4) : null;
    if (rate) cache[code] = { rate, at: Date.now() };
    return rate;
  } catch { return null; }
}

// Rand amount a payment should be worth when it arrives, to recognise a bank deposit
// for a foreign invoice: within 20% either way of amount x the rate it was issued at.
export function plausibleRand(doc, owed, deposit) {
  const expected = zar(doc, owed);
  return expected > 0 && Math.abs(+deposit - expected) / expected <= 0.2;
}
