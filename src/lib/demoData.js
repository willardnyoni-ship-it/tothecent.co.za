// Example businesses for the owner portal's "Preview a business type". One
// believable business per type, dated relative to today so the screens always
// look current. Nothing here is real, and nothing is ever sent anywhere: the
// preview runs the real business app against this in-memory data.
import { featuresFor } from './businessProfiles.js';

const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const month = n => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 7); };
const r2 = n => Math.round(n * 100) / 100;
const mod = (a, m) => ((a % m) + m) % m;
export const DEMO_BIZ_ID = 'demo-biz';
export const DEMO_USER_ID = 'demo-user';
// The owner's first name drives the "Good evening, ..." greeting.
export const demoOwnerEmail = profile => ((PEOPLE[profile] || PEOPLE.general).owner.split(' ')[0].toLowerCase()) + '@demo.tothecent.co.za';

const PEOPLE = {
  freelancer: { owner: 'Lerato Mokoena', biz: 'Lerato Mokoena Design', type: 'Sole Proprietor' },
  trades: { owner: 'Sipho Mokoena', biz: 'Mokoena Plumbing', type: 'Sole Proprietor' },
  retail: { owner: 'Zanele Dlamini', biz: 'Zanele\'s Corner Shop', type: 'Sole Proprietor' },
  food: { owner: 'Ayesha Khan', biz: 'The Corner Café', type: 'Private Company' },
  appointments: { owner: 'Nomsa Zulu', biz: 'Nomsa\'s Hair Studio', type: 'Sole Proprietor' },
  general: { owner: 'Thabo Nkosi', biz: 'Nkosi Trading', type: 'Private Company' },
};

export function buildDemoDb(profile, { vat = false, payroll = false } = {}) {
  const key = PEOPLE[profile] ? profile : 'general';
  const who = PEOPLE[key];
  let n = 0;
  const id = p => `${p}-${++n}`;
  const db = {
    businesses: [], customers: [], invoices: [], invoice_items: [], business_transactions: [], expenses: [], business_members: [],
    bank_accounts: [], business_categories: [], recurring_invoices: [],
    jobs: [], quotes: [], time_entries: [], mileage_trips: [], stock_items: [], stock_movements: [], cash_ups: [], bookings: [], employees: [], pay_runs: [],
  };
  const created = () => new Date().toISOString();

  db.businesses.push({
    id: DEMO_BIZ_ID, owner_id: DEMO_USER_ID, name: who.biz, business_type: who.type, industry: null, country: 'South Africa', currency: 'ZAR',
    financial_year_end: 'February', income_sources: [], invoice_prefix: 'INV-', next_invoice_number: 1, quote_prefix: 'QUO-', next_quote_number: 1,
    default_payment_terms: 'Payment due within 14 days of invoice.', banking_details: 'FNB · Cheque account · 62 0000 0000 · Branch 250655',
    tax_number: vat ? '4123456789' : null, invoice_footer: 'Thank you for your business.', business_profile: key,
    features: featuresFor(key, { hasStaff: payroll, vatRegistered: vat }), mileage_rate: 4.76, tax_set_aside_pct: 25, created_at: created(),
  });
  db.business_members.push(
    { business_id: DEMO_BIZ_ID, email: demoOwnerEmail(key), user_id: DEMO_USER_ID, role: 'owner', status: 'active', invited_at: created(), joined_at: created() },
    { business_id: DEMO_BIZ_ID, email: 'accountant@example.co.za', user_id: null, role: 'accountant', status: 'invited', invited_at: created(), joined_at: null },
  );
  db.bank_accounts.push({ id: id('bank'), business_id: DEMO_BIZ_ID, name: 'FNB Business Cheque', created_at: created() });

  const biz = DEMO_BIZ_ID;
  const customer = (name, email, phone) => { const c = { id: id('cust'), business_id: biz, name, email, phone, address: null, tax_number: null, created_at: created() }; db.customers.push(c); return c; };
  let invNo = 0, quoNo = 0;
  const invoice = ({ cust, issued, due, status, items, paid, job, quote, notes }) => {
    const sub = r2(items.reduce((a, [, q, p]) => a + q * p, 0));
    const vatAmt = vat ? r2(sub * 0.15) : 0;
    const total = r2(sub + vatAmt);
    const inv = {
      id: id('inv'), business_id: biz, customer_id: cust.id, invoice_number: 'INV-' + String(++invNo).padStart(4, '0'), issue_date: issued, due_date: due, status,
      subtotal: sub, vat: vatAmt, discount: 0, total, paid_amount: status === 'paid' ? total : (paid || 0), notes: notes || null,
      payment_terms: db.businesses[0].default_payment_terms, banking_details: db.businesses[0].banking_details, share_token: id('share'), created_at: issued + 'T08:00:00Z',
      job_id: job ? job.id : null, quote_id: quote ? quote.id : null, recurring_invoice_id: null, last_reminded_at: null,
    };
    db.invoices.push(inv);
    items.forEach(([d, q, p], i) => db.invoice_items.push({ id: id('item'), invoice_id: inv.id, description: d, qty: q, price: p, total: r2(q * p), sort_order: i }));
    if (inv.paid_amount > 0) {
      db.business_transactions.push({ id: id('tx'), business_id: biz, date: due < issued ? issued : (status === 'paid' ? day(-3 - invNo) : issued), description: `Payment - ${cust.name} - ${inv.invoice_number}`,
        amount: inv.paid_amount, kind: 'income', category: 'Sales', status: 'reviewed', source: 'manual', linked_invoice_id: inv.id, job_id: job ? job.id : null, created_at: created() });
    }
    db.businesses[0].next_invoice_number = invNo + 1;
    return inv;
  };
  const quote = ({ cust, status, items, issued, valid, deposit = 0, job }) => {
    const sub = r2(items.reduce((a, it) => a + it.qty * it.price, 0));
    const vatAmt = vat ? r2(sub * 0.15) : 0;
    const q = {
      id: id('quo'), business_id: biz, customer_id: cust.id, job_id: job ? job.id : null, quote_number: 'QUO-' + String(++quoNo).padStart(4, '0'), issue_date: issued, valid_until: valid,
      status, items, vat_enabled: vat, subtotal: sub, vat: vatAmt, discount: 0, total: r2(sub + vatAmt), deposit_pct: deposit, deposit_invoice_id: null, final_invoice_id: null,
      notes: null, payment_terms: db.businesses[0].default_payment_terms, banking_details: db.businesses[0].banking_details, created_at: issued + 'T09:00:00Z',
    };
    db.quotes.push(q); db.businesses[0].next_quote_number = quoNo + 1;
    return q;
  };
  const expense = (date, amount, category, merchant, extra = {}) => {
    db.expenses.push({ id: id('exp'), business_id: biz, amount, date, category, description: merchant, merchant, vat: vat ? r2(amount * 0.15 / 1.15) : 0, items: null,
      receipt_storage_path: null, submitted_by: DEMO_USER_ID, status: 'approved', matched_transaction_id: null, created_at: created(), job_id: null, ...extra });
  };
  const tx = (date, description, amount, kind, category, extra = {}) => {
    db.business_transactions.push({ id: id('tx'), business_id: biz, bank_account_id: null, date, description, amount, kind, category, status: 'reviewed', source: 'statement', linked_invoice_id: null, job_id: null, vat_amount: null, external_id: null, created_at: created(), ...extra });
  };
  const stock = (name, unit, qty, reorder, cost, sell, category = null) => { const s = { id: id('stk'), business_id: biz, name, category, sku: null, unit, qty_on_hand: qty, reorder_level: reorder, cost_price: cost, sell_price: sell, archived: false, created_at: created() }; db.stock_items.push(s); return s; };
  const cashUp = (offset, cash, card, tips, short = 0, other = 0) => {
    db.cash_ups.push({ id: id('cu'), business_id: biz, date: day(offset), cash_sales: cash, card_sales: card, other_sales: other, tips, opening_float: 500, counted_cash: 500 + cash - short, notes: short ? 'Drawer was short' : null, created_at: created() });
    tx(day(offset), 'Cash-up', r2(cash + card + other), 'income', 'Sales', { source: 'cashup', status: 'reviewed' });
  };

  // ---------------- per business type ----------------
  if (key === 'freelancer') {
    const bright = customer('Brightside Café', 'hello@brightside.example', '082 555 0101');
    const karabo = customer('Karabo Media', 'accounts@karabomedia.example', '083 555 0144');
    const ubuntu = customer('Ubuntu Foods', 'finance@ubuntufoods.example', '084 555 0198');
    const nine = customer('Studio Nine', 'pay@studionine.example', '071 555 0123');
    invoice({ cust: nine, issued: day(-62), due: day(-48), status: 'paid', items: [['Brand identity - logo & palette', 1, 9500]] });
    invoice({ cust: karabo, issued: day(-40), due: day(-26), status: 'paid', items: [['Website design - 5 pages', 1, 14500], ['Stock photography licence', 1, 850]] });
    invoice({ cust: ubuntu, issued: day(-24), due: day(-10), status: 'sent', items: [['Packaging artwork - 3 labels', 3, 2400]], notes: 'Second reminder due.' });
    invoice({ cust: bright, issued: day(-9), due: day(5), status: 'paid', items: [['Logo design - Brightside Café', 6.5, 650]] });
    invoice({ cust: karabo, issued: day(-3), due: day(11), status: 'sent', items: [['Social media templates (12)', 1, 4200]] });
    invoice({ cust: bright, issued: day(0), due: day(14), status: 'draft', items: [['Menu design', 1, 3800]] });
    quote({ cust: ubuntu, status: 'sent', issued: day(-6), valid: day(24), deposit: 50, items: [{ description: 'Annual report layout', qty: 1, price: 18500 }] });
    quote({ cust: nine, status: 'accepted', issued: day(-12), valid: day(18), deposit: 30, items: [{ description: 'Brand guidelines document', qty: 1, price: 7200 }] });
    [[-1, bright, 3, 'Menu concepts'], [-2, karabo, 4.5, 'Wireframes'], [-3, karabo, 2, 'Client feedback round'], [-5, ubuntu, 5, 'Label artwork'], [-6, nine, 1.5, 'Brand guideline outline'], [-8, bright, 2.5, 'Logo refinements']]
      .forEach(([o, c, h, d]) => db.time_entries.push({ id: id('time'), business_id: biz, customer_id: c.id, job_id: null, date: day(o), hours: h, rate: 650, description: d, invoice_id: null, created_at: created() }));
    expense(day(-4), 649, 'Subscriptions', 'Adobe Creative Cloud'); expense(day(-11), 899, 'Telephone', 'Afrihost fibre'); expense(day(-15), 1500, 'Rent', 'Cowork Joburg - hot desk');
    tx(day(-2), 'POS Purchase Takealot', 1899, 'expense', null, { status: 'needs_review' }); tx(day(-5), 'Payshap Credit K Mthembu', 2500, 'income', null, { status: 'needs_review' });
    tx(day(-7), 'Bank fees', 119, 'expense', 'Bank fees');
  } else if (key === 'trades') {
    const mok = customer('Thandi Mokoena', 'thandi@example.co.za', '082 555 0177');
    const naidoo = customer('K. Naidoo', 'knaidoo@example.co.za', '083 555 0166');
    const cafe = customer('Brightside Café', 'hello@brightside.example', '082 555 0101');
    const body = customer('Ridge Body Corporate', 'trustees@ridge.example', '011 555 0120');
    const j1 = { id: id('job'), business_id: biz, customer_id: mok.id, name: 'Bathroom renovation', address: '14 Jacaranda Rd, Bellville', status: 'active', start_date: day(-14), end_date: null, budget: 23000, notes: 'Tiles ordered, fittings on site', created_at: created() };
    const j2 = { id: id('job'), business_id: biz, customer_id: naidoo.id, name: 'Geyser replacement', address: '9 Oak Ave, Durbanville', status: 'done', start_date: day(-30), end_date: day(-26), budget: 6800, notes: null, created_at: created() };
    const j3 = { id: id('job'), business_id: biz, customer_id: cafe.id, name: 'Kitchen plumbing - Brightside', address: '2 Main St, Parow', status: 'quoted', start_date: null, end_date: null, budget: 15400, notes: null, created_at: created() };
    db.jobs.push(j1, j2, j3);
    const q1 = quote({ cust: mok, job: j1, status: 'invoiced', issued: day(-20), valid: day(10), deposit: 50, items: [{ description: 'Bathroom renovation - labour', qty: 1, price: 9800 }, { description: 'Tiles, fittings & materials', qty: 1, price: 13200 }] });
    quote({ cust: cafe, job: j3, status: 'sent', issued: day(-5), valid: day(25), deposit: 40, items: [{ description: 'Commercial kitchen plumbing', qty: 1, price: 15400 }] });
    quote({ cust: body, status: 'accepted', issued: day(-8), valid: day(22), deposit: 0, items: [{ description: 'Burst pipe repair - basement', qty: 1, price: 4600 }] });
    invoice({ cust: mok, job: j1, quote: q1, issued: day(-18), due: day(-16), status: 'paid', items: [['Deposit - bathroom renovation (50%)', 1, 11500]] });
    invoice({ cust: naidoo, job: j2, issued: day(-12), due: day(2), status: 'paid', items: [['150L geyser supply & fit', 1, 5400], ['Call-out & disposal', 1, 1400]] });
    invoice({ cust: mok, job: j1, quote: q1, issued: day(-4), due: day(10), status: 'sent', items: [['Progress payment - tiling complete', 1, 6000]] });
    invoice({ cust: cafe, issued: day(-30), due: day(-16), status: 'sent', items: [['Emergency call-out - burst pipe', 1, 1850]] });
    invoice({ cust: body, issued: day(-9), due: day(5), status: 'paid', items: [['Quarterly maintenance visit', 1, 3200]] });
    invoice({ cust: body, issued: day(-2), due: day(12), status: 'sent', items: [['Drain unblocking - 3 units', 3, 950]] });
    expense(day(-13), 7400, 'Materials', 'Builders Warehouse - tiles & adhesive', { job_id: j1.id });
    expense(day(-8), 4800, 'Materials', 'Plumbmaster - fittings', { job_id: j1.id });
    expense(day(-28), 2650, 'Materials', 'Geyser unit - Ellerines', { job_id: j2.id });
    expense(day(-6), 1250, 'Fuel', 'Engen - fuel'); expense(day(-10), 540, 'Supplies', 'Plumbing tape & sealant');
    [[-12, 18, 'Bellville', 'Builders Warehouse', 'Collect tiles', j1], [-10, 22, 'Bellville', 'Mokoena home', 'Site visit', j1], [-8, 14, 'Parow', 'Plumbmaster', 'Fittings', j1], [-27, 31, 'Durbanville', 'Naidoo home', 'Geyser install', j2], [-5, 9, 'Parow', 'Brightside Café', 'Quote site visit', j3]]
      .forEach(([o, km, f, t, p, j]) => db.mileage_trips.push({ id: id('trip'), business_id: biz, job_id: j.id, date: day(o), km, from_place: f, to_place: t, purpose: p, created_at: created() }));
    tx(day(-3), 'POS Purchase Mica Hardware', 862, 'expense', null, { status: 'needs_review' });
    tx(day(-4), 'FNB App Payment From Ridge Body Corp', 3200, 'income', null, { status: 'needs_review' });
  } else if (key === 'retail') {
    const a = customer('Mama Nandi (on account)', null, '082 555 0133');
    const b = customer('Sipho the builder (on account)', null, '083 555 0155');
    customer('Gogo Mabaso (on account)', null, '084 555 0188');
    const coke = stock('Coca-Cola 2L', 'each', 4, 12, 21.5, 29.99, 'Drinks');
    stock('White bread', 'each', 18, 10, 14.2, 18.99, 'Groceries'); stock('Maize meal 5kg', 'each', 9, 6, 56, 74.99, 'Groceries'); stock('Cooking oil 750ml', 'each', 14, 8, 38, 52.99, 'Groceries'); stock('Fanta Orange 2L', 'each', 15, 12, 21.5, 29.99, 'Drinks'); stock('Simba Chips 120g', 'each', 30, 20, 11.8, 16.99, 'Snacks');
    stock('Eggs (tray of 30)', 'tray', 3, 4, 62, 84.99, 'Groceries'); stock('Airtime vouchers R10', 'each', 40, 20, 9.5, 10, 'Airtime & data'); stock('Sugar 2.5kg', 'each', 11, 6, 44, 59.99, 'Groceries'); stock('Washing powder 2kg', 'each', 7, 5, 49, 66.99, 'Household'); stock('Handy Andy 750ml', 'each', 9, 6, 26, 36.99, 'Household');
    db.stock_movements.push({ id: id('mv'), business_id: biz, item_id: coke.id, date: day(-6), qty_change: 24, reason: 'purchase', unit_price: 21.5, note: 'Makro run', created_at: created() },
      { id: id('mv'), business_id: biz, item_id: coke.id, date: day(-2), qty_change: -2, reason: 'waste', unit_price: 21.5, note: 'Damaged cans', created_at: created() });
    [[-1, 3200, 4100, 0, 0], [-2, 2650, 3800, 0, 40], [-3, 3480, 4420, 0, 0], [-4, 2900, 3510, 0, 0], [-5, 4100, 5230, 0, 0], [-6, 3750, 4800, 0, 120], [-7, 2300, 3050, 0, 0], [-8, 3050, 3720, 0, 0], [-9, 3320, 4140, 0, 0], [-10, 2780, 3390, 0, 0]]
      .forEach(([o, c, k, t, s]) => cashUp(o, c, k, t, s, 0));
    invoice({ cust: a, issued: day(-20), due: day(-6), status: 'sent', items: [['Groceries on account', 1, 640]] });
    invoice({ cust: b, issued: day(-12), due: day(2), status: 'sent', items: [['Groceries on account', 1, 810]] });
    expense(day(-6), 9840, 'Stock purchases', 'Makro - wholesale'); expense(day(-9), 1950, 'Electricity', 'Prepaid electricity'); expense(day(-14), 3000, 'Rent', 'Shop rent - Soweto');
    tx(day(-3), 'POS Purchase Shoprite Wholesale', 4860, 'expense', null, { status: 'needs_review' });
    tx(day(-4), 'FNB App Payment To City Power', 1000, 'expense', null, { status: 'needs_review' });
  } else if (key === 'food') {
    const kc = customer('Khumalo Wedding (catering)', 'events@khumalo.example', '082 555 0111');
    const law = customer('Dlamini & Co Attorneys', 'office@dlamini.example', '011 555 0190');
    const bright = customer('Brightside Corporate', 'hr@brightside.example', '082 555 0101');
    stock('Coffee beans 1kg', 'bag', 6, 4, 245, 0, 'Beverages'); stock('Full-cream milk 2L', 'each', 9, 12, 34, 0, 'Dairy & eggs'); stock('Cake flour 2.5kg', 'each', 5, 3, 48, 0, 'Dry goods');
    const avo = stock('Avocados', 'each', 14, 20, 11, 0, 'Fresh produce'); stock('Free-range eggs (tray)', 'tray', 4, 3, 72, 0, 'Dairy & eggs'); stock('Takeaway cups (50)', 'pack', 2, 3, 96, 0, 'Packaging'); stock('Baby spinach 200g', 'each', 12, 8, 19, 0, 'Fresh produce'); stock('Sugar sachets (500)', 'box', 3, 2, 85, 0, 'Dry goods');
    db.stock_movements.push({ id: id('mv'), business_id: biz, item_id: avo.id, date: day(-1), qty_change: -6, reason: 'waste', unit_price: 11, note: 'Overripe', created_at: created() },
      { id: id('mv'), business_id: biz, item_id: avo.id, date: day(-3), qty_change: 40, reason: 'purchase', unit_price: 11, note: 'Fresh produce market', created_at: created() });
    [[-1, 2500, 5450, 120, 40], [-2, 2100, 4800, 95, 0], [-3, 3050, 6200, 210, 0], [-4, 1900, 4120, 60, 0], [-5, 2750, 5890, 150, 0], [-6, 3300, 7100, 260, 85], [-7, 2850, 6020, 180, 0], [-8, 2100, 4400, 80, 0]]
      .forEach(([o, c, k, t, s]) => cashUp(o, c, k, t, s, 0));
    const wq = quote({ cust: kc, status: 'accepted', issued: day(-15), valid: day(15), deposit: 50, items: [{ description: 'Wedding lunch - 80 guests', qty: 80, price: 185 }, { description: 'Staff & service', qty: 1, price: 1800 }] });
    quote({ cust: bright, status: 'sent', issued: day(-4), valid: day(26), deposit: 30, items: [{ description: 'Breakfast boardroom - 25 guests', qty: 25, price: 95 }] });
    invoice({ cust: kc, quote: wq, issued: day(-14), due: day(-7), status: 'paid', items: [['Deposit - wedding catering (50%)', 1, 8300]] });
    invoice({ cust: law, issued: day(-18), due: day(-4), status: 'sent', items: [['Office lunch trays x4', 4, 1250]] });
    invoice({ cust: bright, issued: day(-6), due: day(8), status: 'sent', items: [['Monthly coffee service', 1, 3400]] });
    expense(day(-5), 4300, 'Stock purchases', 'Fresh produce market'); expense(day(-8), 2250, 'Stock purchases', 'Coffee roaster'); expense(day(-12), 12500, 'Rent', 'Café rent'); expense(day(-16), 1890, 'Electricity', 'City Power');
    tx(day(-2), 'POS Purchase Yoco Terminal Fee', 289, 'expense', 'Bank fees'); tx(day(-3), 'Payshap Credit Dlamini & Co', 5000, 'income', null, { status: 'needs_review' });
  } else if (key === 'appointments') {
    const cl = ['Thandi M.', 'Lerato S.', 'Busisiwe K.', 'Naledi P.', 'Zinhle D.', 'Ayanda T.', 'Palesa N.', 'Refilwe G.'].map((nm, i) => customer(nm, null, '08' + (2 + (i % 4)) + ' 555 0' + (100 + i * 11)));
    stock('Braiding hair (pack)', 'pack', 6, 10, 38, 75, 'Hair extensions'); stock('Relaxer kit', 'each', 5, 4, 82, 160, 'Hair products'); stock('Shampoo 1L', 'each', 3, 4, 95, 0, 'Hair products'); stock('Nail polish', 'each', 22, 8, 28, 55, 'Nail products'); stock('Edge control 250ml', 'each', 10, 6, 50, 95, 'Retail products');
    const staff = ['Thandeka', 'Lindiwe', 'Palesa'];
    const services = [['Box braids', 90, 650, 200], ['Cut & colour', 120, 780, 250], ['Blow-dry', 45, 220, 50], ['Gel nails', 60, 320, 100], ['Weave install', 150, 950, 300], ['Barber cut', 30, 120, 0]];
    for (let d = -13; d <= 4; d++) {
      for (let i = 0; i < 3; i++) {
        const sv = services[mod(d + 3 + i * 2, services.length)], c = cl[mod(d + 5 + i * 3, cl.length)];
        const past = d < 0;
        db.bookings.push({ id: id('bk'), business_id: biz, customer_id: c.id, client_name: c.name, client_phone: c.phone, date: day(d), start_time: ['09:00', '11:30', '14:00'][i], duration_min: sv[1],
          service: sv[0], staff_name: staff[mod(d + 3 + i, 3)], price: sv[2], deposit: sv[3], status: past ? (d % 6 === 0 && i === 1 ? 'no_show' : 'done') : 'booked', notes: null, created_at: created() });
        if (past && !(d % 6 === 0 && i === 1)) tx(day(d), `${sv[0]} - ${c.name}`, sv[2], 'income', 'Sales', { source: 'booking' });
      }
    }
    invoice({ cust: cl[0], issued: day(-10), due: day(-3), status: 'sent', items: [['Bridal party hair - 4 people', 4, 650]] });
    expense(day(-7), 3840, 'Supplies', 'Hair supplier - wholesale'); expense(day(-13), 4500, 'Rent', 'Chair rental'); expense(day(-9), 780, 'Marketing', 'Facebook ads');
    tx(day(-2), 'POS Purchase Clicks', 460, 'expense', null, { status: 'needs_review' });
  } else {
    const c1 = customer('Greenfield Supplies', 'orders@greenfield.example', '011 555 0140');
    const c2 = customer('Metro Cleaning', 'accounts@metro.example', '021 555 0165');
    const c3 = customer('Sandton Print Works', 'pay@sandtonprint.example', '011 555 0172');
    invoice({ cust: c1, issued: day(-50), due: day(-36), status: 'paid', items: [['Consulting - 12 hours', 12, 850]] });
    invoice({ cust: c2, issued: day(-30), due: day(-16), status: 'paid', items: [['Monthly retainer', 1, 6500]] });
    invoice({ cust: c3, issued: day(-20), due: day(-6), status: 'sent', items: [['Project work - phase 1', 1, 12400]] });
    invoice({ cust: c1, issued: day(-4), due: day(10), status: 'sent', items: [['Consulting - 8 hours', 8, 850]] });
    invoice({ cust: c2, issued: day(0), due: day(14), status: 'draft', items: [['Monthly retainer', 1, 6500]] });
    quote({ cust: c3, status: 'sent', issued: day(-3), valid: day(27), items: [{ description: 'Project work - phase 2', qty: 1, price: 15800 }] });
    expense(day(-5), 1250, 'Supplies', 'Waltons stationery'); expense(day(-9), 899, 'Telephone', 'Vodacom'); expense(day(-14), 3500, 'Rent', 'Office rent');
    tx(day(-2), 'POS Purchase Takealot', 1899, 'expense', null, { status: 'needs_review' });
  }

  if (payroll) {
    const staffRows = key === 'appointments'
      ? [['Thandeka Zulu', 'Senior stylist', 9500], ['Lindiwe Khumalo', 'Stylist', 8200], ['Palesa Nkosi', 'Nail technician', 7400]]
      : [['Themba Dube', 'Assistant', 8500], ['Nokuthula Sithole', 'Admin', 9800], ['Bongani Mahlangu', 'General worker', 6400]];
    staffRows.forEach(([nm, title, pay]) => {
      const e = { id: id('emp'), business_id: biz, name: nm, job_title: title, pay_type: 'monthly', pay_rate: pay, start_date: day(-400), email: null, phone: null, active: true, created_at: created() };
      db.employees.push(e);
      const uif = Math.min(177.12, r2(pay * 0.01)), paye = pay > 7500 ? r2((pay - 7500) * 0.18 + 120) : 0;
      db.pay_runs.push({ id: id('pay'), business_id: biz, employee_id: e.id, period: month(-1), hours: null, gross: pay, paye, uif_employee: uif, uif_employer: uif, other_deductions: 0, net: r2(pay - paye - uif), paid_on: day(-5), created_at: created() });
    });
  }
  return db;
}
