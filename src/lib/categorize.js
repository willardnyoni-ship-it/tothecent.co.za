// Merchant-name cleanup + rule-based categorisation. Ported unchanged from app.html.
export function merchantOf(note) {
  let m = String(note || '')
    .replace(/^(POS|Fuel)\s+Purchase\s*/i, '')
    .replace(/^FNB App\s*/i, '')
    .replace(/^Payshap (Account Off-Us|Credit)\s*/i, '')
    .replace(/^\d[\d,]*\.\d{2}\s*/, '')
    .replace(/^(s2s|yoco|ccn|hpy|ap|ik|dl|sa|cc)\s*\*\s*/i, '')
    .replace(/\*.*$/, '')
    .replace(/\s+\d{4,}.*$/, '')
    .replace(/\s+\d{1,3}$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return m || '(bank fee)';
}

export const RULES = [
  [/payment to rent|\brent\b/i, 'Rent'],
  [/payment to internet|\binternet\b/i, 'Internet'],
  [/electricity|eskom|prepaid elec/i, 'Electricity'],
  [/prepaid airtime|airtime|\bdata\b|a-t cell|vodacom|\bmtn\b|telkom|cell ?c/i, 'Airtime / data'],
  [/astron|sasol|fuel purchase|engen|shell|caltex|bp\b|\bae\b|petroleum|garage|filling ?station|\bfuel\b/i, 'Fuel'],
  [/food lovers|kwikspar|superspar|pnp crp|pick n pay|picardi|checkers|woolworths|shoprite|usave|\bspar\b|supermarket|super ?mkt|grocer/i, 'Groceries'],
  [/\bkfc\b|mozambik|spur|debonairs|caffe mario|fish and chips|african bean|plato|eleven plet|social eatery|mr d food|uber eats|yoco|steers|nando|mcdonald|burger|pizza|restaurant|cafe|coffee/i, 'Eating out'],
  [/\bgym\b|virgin active|planet fitness/i, 'Gym & sport'],
  [/apple\.com|itunes|netflix|spotify|showmax|google|microsoft|adobe|dstv/i, 'Subscriptions'],
  [/atm cash|cash withdrawal/i, 'Cash withdrawals'],
  [/\buber\b|\bbolt\b|taxi/i, 'Transport'],
  [/guest ?house|lodge|hotel|airbnb|\bbnb\b/i, 'Accommodation'],
  [/payshap account off-us|send money app|instant money/i, 'Transfers to people'],
  [/mrprice|mrprices|pep home|\bpep\b|\bgame\b|clicks|dischem|\bphar/i, 'Retail / health'],
  [/sterkinekor|takealot|amazon|ster kinekor|nu metro/i, 'Retail / health'],
  [/byc debit|service fee|magtape debit/i, 'Bank fees'],
];

// Never counted as spending: credits, movements between your own accounts,
// and money sent to the Investment account (that is saving, not spending).
export const SKIP = /transfer from|ob pmt|credit interest|cr int adj|interest adjustment|cash deposit|magtape unpaid|payshap credit|rtc credit|cr\.int\.rate|payment to investment|credit int paid|atm transfer|payment to business/i;
export const SAV_OUT = /payment to investment|to savings|transfer to savings/i;
export const SAV_IN = /transfer from|payshap credit investment|rtc credit investment|atm transfer|cr int adj/i;
export const INCOME = /ob pmt|salary|cash deposit/i;

export function flowKind(desc, isCr) {
  const d = String(desc || '');
  if (INCOME.test(d)) return 'income';
  if (SAV_OUT.test(d) && !isCr) return 'savings-out';
  if (SAV_IN.test(d) && isCr) return 'savings-in';
  return null;
}

// Merchant memory: once you've categorised something by hand twice, it
// answers for itself. `memory` is S.memory, passed in rather than global.
export function remember(memory, note, cat) {
  if (!note || !cat || cat === 'Uncategorised') return memory;
  const k = merchantOf(note).toLowerCase();
  if (!k || k === '(bank fee)') return memory;
  const prev = memory[k];
  return { ...memory, [k]: (prev && prev.c === cat) ? { c: cat, n: prev.n + 1 } : { c: cat, n: 1 } };
}
export function recall(memory, note) {
  const k = merchantOf(String(note || '')).toLowerCase();
  const hit = (memory || {})[k];
  return hit ? hit.c : null;
}

export function classify(desc, memory, rules) {
  const d = String(desc || '').trim();
  if (d === '') return 'Bank fees';
  const learned = recall(memory, d);
  if (learned) return learned;
  for (const r of (rules || [])) {
    try { if (new RegExp(r.k, 'i').test(d)) return r.c; } catch (e) { /* bad user regex, ignore */ }
  }
  for (const [re, cat] of RULES) if (re.test(d)) return cat;
  return 'Uncategorised';
}
