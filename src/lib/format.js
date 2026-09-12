// Small formatting/id helpers shared everywhere. Ported unchanged from app.html.
export const R = n => 'R' + Math.round(n).toLocaleString('en-ZA');
export const R2 = n => 'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const dayDiff = (a, b) => Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000);
export const fmtD = d => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });

export const CAT_EMOJI = {
  'Rent': '🏠', 'Groceries': '🛒', 'Fuel': '⛽',
  'Transfers to people': '💸', 'Eating out': '🍔', 'Internet': '📶',
  'Electricity': '💡', 'Laundry': '🧺', 'Cash withdrawals': '🏧',
  'Retail / health': '🛍️', 'Gym & sport': '🏋️', 'Airtime / data': '📱',
  'Subscriptions': '🔁', 'Transport': '🚗', 'Bank fees': '🏦',
  'Accommodation': '🛏️', 'Uncategorised': '❓',
};
export const catEmoji = n => CAT_EMOJI[n] || '💳';

export const VAT_RATE = 0.15;
export const vatOf = total => total * VAT_RATE / (1 + VAT_RATE);
