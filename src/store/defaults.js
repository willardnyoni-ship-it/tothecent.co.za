// Exact same shape/localStorage key as the original app, so existing users'
// data keeps working after this rewrite.
export const KEY = 'wnBudget_v3';

export const DEFAULTS = {
  income: 0,
  cycleDay: 1,
  weekly: false,
  method: 'flexible',
  memory: {},
  members: [],
  splits: {},
  achievements: [],
  windfall: null,
  autoWipe: true,
  deleted: [],
  syncedAt: 0,
  savingsGoal: 0,
  budgetRollover: false,
  flows: [],
  setupDone: false,
  rules: [],
  taxDeductions: {},
  taxYearSel: '',
  shortcuts: [
    { l: 'Coffee', a: 35, c: 'Eating out' },
    { l: 'Groceries', a: 150, c: 'Groceries' },
    { l: 'Fuel', a: 300, c: 'Fuel' },
    { l: 'Takeaway', a: 120, c: 'Eating out' },
    { l: 'Airtime', a: 30, c: 'Airtime / data' },
    { l: 'Cash', a: 200, c: 'Cash withdrawals' },
  ],
  cats: [
    { n: 'Rent', t: 0, fixed: true },
    { n: 'Groceries', t: 0 },
    { n: 'Fuel', t: 0 },
    { n: 'Transfers to people', t: 0 },
    { n: 'Eating out', t: 0 },
    { n: 'Internet', t: 0, fixed: true },
    { n: 'Electricity', t: 0 },
    { n: 'Laundry', t: 0 },
    { n: 'Cash withdrawals', t: 0 },
    { n: 'Retail / health', t: 0 },
    { n: 'Gym & sport', t: 0 },
    { n: 'Airtime / data', t: 0 },
    { n: 'Subscriptions', t: 0 },
    { n: 'Transport', t: 0 },
    { n: 'Bank fees', t: 0 },
    { n: 'Accommodation', t: 0 },
    { n: 'Uncategorised', t: 0 },
  ],
  tx: [],
};

export function loadState() {
  try {
    const r = localStorage.getItem(KEY) || localStorage.getItem('wnBudget_v2') || localStorage.getItem('wnBudget_v1');
    if (r) return Object.assign(structuredClone(DEFAULTS), JSON.parse(r));
  } catch (e) { console.warn('load failed', e); }
  return structuredClone(DEFAULTS);
}
