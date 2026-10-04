// Capturing stock from a supplier invoice: tidy up what was read (or typed),
// work out unit costs, and match each line to an item the business already
// stocks. Pure functions - see stockInvoice.test.mjs.

// Suggested categories to start from, by kind of business. Owners can type
// any category they like; these just save typing.
export const STOCK_CATEGORIES = {
  retail: ['Groceries', 'Drinks', 'Airtime & data', 'Toiletries', 'Household', 'Snacks', 'Other'],
  food: ['Dry goods', 'Dairy & eggs', 'Fresh produce', 'Meat & fish', 'Beverages', 'Packaging', 'Cleaning', 'Other'],
  appointments: ['Hair products', 'Hair extensions', 'Nail products', 'Skin care', 'Retail products', 'Supplies', 'Other'],
  trades: ['Pipes & fittings', 'Electrical', 'Paint & finishes', 'Tools', 'Fasteners', 'Other'],
  freelancer: ['Equipment', 'Supplies', 'Other'],
  general: ['Stock', 'Supplies', 'Other'],
};
export const categoriesFor = profile => STOCK_CATEGORIES[profile] || STOCK_CATEGORIES.general;

const VAT = 0.15;
const r2 = n => Math.round(n * 100) / 100;
const num = v => { const n = typeof v === 'string' ? parseFloat(v.replace(/\s/g, '').replace(',', '.')) : Number(v); return Number.isFinite(n) ? n : null; };

// "COCA COLA 2L PET (6)" -> ['coca', 'cola', '2l', 'pet', '6']
export function tokens(s) {
  return String(s || '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/(\d)\s+(l|ml|kg|g|cl)\b/g, '$1$2')
    .split(' ').map(t => t.replace(/^\.+|\.+$/g, '')).filter(Boolean)
    .map(t => (t.length > 3 && t.endsWith('s') && !/\d/.test(t) ? t.slice(0, -1) : t));
}

// 0..1: how alike two item names are. Shared words count, and sizes like "2l"
// must agree - a 500ml bottle isn't the 2L one.
export function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.length || !B.length) return 0;
  const setB = new Set(B);
  const shared = A.filter(t => setB.has(t));
  if (!shared.length) return 0;
  const size = t => /^\d+(\.\d+)?(l|ml|kg|g|cl)$/.test(t);
  const sizesA = A.filter(size), sizesB = B.filter(size);
  if (sizesA.length && sizesB.length && !sizesA.some(t => sizesB.includes(t))) return 0;
  const dice = (2 * shared.length) / (A.length + B.length);
  const contained = shared.length / Math.min(A.length, B.length);
  return Math.max(dice, contained * 0.85);
}

export const MATCH_THRESHOLD = 0.62;
// Best existing item for an invoice line, or null if nothing is close enough.
export function matchItem(description, items) {
  let best = null, score = 0;
  for (const it of items) {
    const s = similarity(description, it.name);
    if (s > score) { score = s; best = it; }
  }
  return score >= MATCH_THRESHOLD ? { item: best, score } : null;
}

// Whatever came back from reading (or typing) an invoice -> clean lines, with
// each unit price exactly as printed. A missing unit price is worked out from
// the line total. `vatMode` starts from what the invoice looked like:
// 'incl' (prices include VAT), 'excl' (VAT is added on top) - the owner can
// also pick 'none' (no VAT on this invoice).
export function normaliseInvoice(raw) {
  const lines = [];
  for (const l of ((raw && raw.lines) || []).slice(0, 200)) {
    const description = String((l && l.description) || '').trim().slice(0, 120);
    const qty = num(l && l.qty);
    if (!description || !(qty > 0)) continue;
    let price = num(l.unit_price);
    const total = num(l.line_total);
    if (price == null && total != null) price = total / qty;
    if (!(price >= 0)) price = 0;
    const pack = Math.round(num(l && l.pack_size) || 0);
    lines.push({
      description, qty, unit: String((l && l.unit) || 'each').trim().slice(0, 20) || 'each', price: r2(price),
      name: String((l && l.name) || '').trim().slice(0, 120), category: String((l && l.category) || '').trim().slice(0, 40),
      pack: pack > 1 && pack <= 1000 ? pack : 0,
    });
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test((raw && raw.date) || '') ? raw.date : '';
  return {
    supplier: String((raw && raw.supplier) || '').trim().slice(0, 80),
    reference: String((raw && raw.invoice_number) || '').trim().slice(0, 40),
    date, vatMode: raw && raw.prices_include_vat ? 'incl' : 'excl', lines,
  };
}

// What the invoice really costs, and what each unit should be worth on the
// shelf. A VAT-registered business claims the VAT back, so stock is valued
// excluding VAT; otherwise the VAT is part of what they paid.
export function costing(lines, vatMode, vatRegistered) {
  const excl = l => (vatMode === 'incl' ? (+l.price || 0) / (1 + VAT) : (+l.price || 0));
  const subtotal = r2(lines.reduce((a, l) => a + (+l.qty || 0) * excl(l), 0));
  const vat = vatMode === 'none' ? 0 : r2(subtotal * VAT);
  const stockUnit = l => r2(vatRegistered || vatMode === 'none' ? excl(l) : excl(l) * (1 + VAT));
  return { subtotal, vat, total: r2(subtotal + vat), stockUnit, lineTotal: l => r2((+l.qty || 0) * (+l.price || 0)) };
}

// "Avocados (box of 20)", "Cups 50pk", "Eggs tray 30", "Cola 6 x 2L" -> how many
// single units one invoice unit holds, so a box can become 20 each. 0 = unknown.
export function guessPack(description) {
  const d = String(description || '').toLowerCase();
  const m = d.match(/\b(?:box|tray|case|pack|bag|carton|crate)\s+of\s+(\d+)\b/) || d.match(/\b(\d+)\s?(?:pk|pack|pcs|piece|pieces)\b/) || d.match(/\b(\d+)\s?x\s?\d/);
  const n = m ? parseInt(m[1], 10) : 0;
  return n > 1 && n <= 1000 ? n : 0;
}
// Do the invoice's unit and the stock item's unit differ (box vs each)?
export const unitsDiffer = (lineUnit, itemUnit) => {
  const norm = u => { const t = String(u || 'each').toLowerCase().trim(); return ['ea', 'each', 'unit', 'units', 'pc', 'pcs', 'piece'].includes(t) ? 'each' : t; };
  return norm(lineUnit) !== norm(itemUnit);
};
