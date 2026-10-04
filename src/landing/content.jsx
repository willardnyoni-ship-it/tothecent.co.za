// Landing-page content: icons, the business-type switcher and its example
// previews, and the copy for the feature, security and FAQ sections. Every
// figure shown is example data, labelled as such on the page.

import { useEffect, useRef, useState } from 'react';

export function Ic({ d, cls }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

export const I = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10',
  lock: ['M6 11h12v9H6z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  wallet: ['M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z', 'M3 7l12-3v3', 'M16 13.5h2'],
  doc: ['M7 3h7l5 5v13H7z', 'M14 3v5h5', 'M10 13h6M10 17h6'],
  chat: 'M4 5h16v11H9l-5 4z',
  phone: ['M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M11 18h2'],
  laptop: ['M4 5h16v11H4z', 'M2 19h20'],
  invoice: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6M9 12h6'],
  quote: ['M4 6h16M4 12h10M4 18h7', 'M17 15l2 2 4-4'],
  percent: ['M5 19L19 5', 'M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6'],
  team: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5', 'M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2'],
  chart: 'M4 20V10M10 20V4M16 20v-7M2 20h20',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M5 20h14'],
  bank: ['M3 10l9-6 9 6', 'M5 10v8M19 10v8M9 10v8M15 10v8', 'M3 20h18'],
};

export const BIZ_TYPES = [
  {
    key: 'freelancer', icon: '💻', label: 'Freelancer', example: 'a graphic designer',
    tools: [
      ['⏱', 'Time tracking', 'Start a timer or log hours per client, then bill them onto an invoice in one tap.'],
      ['📝', 'Quotes', 'Send a quote and turn it into an invoice when the client says yes.'],
      ['🔔', 'Payment reminders', 'A friendly WhatsApp or email nudge for invoices that are late.'],
      ['🏦', 'Tax set-aside', 'See how much of this month\'s profit to put away for SARS.'],
    ],
  },
  {
    key: 'trades', icon: '🔨', label: 'Trades', example: 'a plumber',
    tools: [
      ['📝', 'Quotes with deposits', 'Quote the job, invoice the deposit, then send the final invoice less the deposit.'],
      ['🧰', 'Jobs', 'Every quote, invoice, material cost and trip for a job in one place - see what it really made.'],
      ['🚗', 'Mileage logbook', 'Log business trips for your SARS travel claim and export the logbook.'],
      ['🔔', 'Payment reminders', 'Chase late payers with one tap.'],
    ],
  },
  {
    key: 'retail', icon: '🛒', label: 'Shop', example: 'a spaza shop',
    tools: [
      ['📦', 'Stock', 'Know what\'s on the shelf, what it\'s worth, and get warned before you run out.'],
      ['💵', 'Daily cash-up', 'Close the till: cash, card and tips, and whether the drawer balances.'],
      ['🧾', 'Sales into the books', 'Cash-ups and stock sales land in your income automatically.'],
      ['🔔', 'Payment reminders', 'For customers who buy on account.'],
    ],
  },
  {
    key: 'food', icon: '🍲', label: 'Food & catering', example: 'a café',
    tools: [
      ['💵', 'Daily cash-up', 'Card, cash and tips each day, with over/short at a glance.'],
      ['📦', 'Stock & waste', 'Track ingredients, what\'s running low, and what gets thrown away.'],
      ['📝', 'Catering quotes', 'Quote events with a deposit and convert to an invoice.'],
      ['🔔', 'Payment reminders', 'For catering clients on account.'],
    ],
  },
  {
    key: 'appointments', icon: '✂️', label: 'Salon & services', example: 'a hair salon',
    tools: [
      ['📅', 'Bookings', 'Your day at a glance, with deposits, no-shows and double-booking warnings.'],
      ['💬', 'WhatsApp reminders', 'Remind clients of their appointment in one tap.'],
      ['👩‍🔧', 'Earnings per staff member', 'See what each stylist or technician brought in this month.'],
      ['📦', 'Stock', 'Products and supplies, with low-stock alerts.'],
    ],
  },
];

export const ESSENTIALS = [
  [I.invoice, 'Invoices that get paid', 'Professional PDF invoices with VAT, sent straight to WhatsApp or email. Payments are matched to your bank statement, and late payers get a one-tap reminder.'],
  [I.quote, 'Quotes with deposits', 'Send a quote, take a deposit, then turn it into the final invoice with the deposit already taken off.'],
  [I.percent, 'VAT, sorted', 'If you\'re VAT-registered, your VAT201 figures for each two-month period are worked out from your invoices, sales and slips.'],
  [I.user, 'Payslips with PAYE & UIF', 'Monthly payslips for your staff, with PAYE and UIF calculated, and the amount to pay SARS each month.'],
  [I.team, 'Your team, your rules', 'Invite staff and your accountant. Each gets the access their role needs - accountants see the books but can\'t change them.'],
  [I.chart, 'Reports for your accountant', 'Profit and loss, income and expenses, and your tax records exported in one click.'],
];

export const SECURITY = [
  [I.bank, 'No bank login. Ever.', 'You download your statement and upload it yourself. We never ask for, and can\'t use, your banking password.'],
  [I.lock, 'Protected in transit', 'Everything travels encrypted over HTTPS, and access rules mean only you - and the people you invite - can see your data.'],
  [I.download, 'Yours to take with you', 'Download a full backup or a CSV of your transactions whenever you like.'],
  [I.shield, 'Never sold', 'We don\'t sell your data or share it with advertisers.'],
];

export const FAQ = [
  ['Do I need to give you my bank login?', 'No. You download your statement (PDF or CSV) from your bank\'s own app or website and upload it. We never ask for your banking username or password, and have no way to connect to your bank.'],
  ['Which banks are supported?', 'Statements from Capitec, FNB, Standard Bank, Absa and Nedbank are read automatically. Till slips are read straight from a photo.'],
  ['Can I use it on my phone and my computer?', 'Yes. Sign in on both and everything stays in sync - add a slip on your phone and it\'s on your computer seconds later.'],
  ['Is it for personal budgets or for business?', 'Both. Use it for your own budget, run your business in it, or do both from the same account and switch between them.'],
  ['What does my business get?', 'Every business gets invoices, expenses, bank statement import, reports and team access. Then the tools for what you do switch on: quotes and jobs for trades, stock and cash-ups for shops and food, bookings for salons, time tracking for freelancers, plus payslips and VAT if you need them.'],
  ['Is this financial or tax advice?', 'No. PAYE, VAT and tax set-aside figures are estimates to help you plan. Check anything with real tax consequences with your accountant or SARS eFiling.'],
];

// A short, example story per business type: who they are, what happens
// step by step in To The Cent, and what they get out of it.
const STORIES = {
  freelancer: {
    who: ['👩🏽‍💻', 'Lerato, graphic designer', 'Example'],
    steps: [
      ['⏱', 'Hours tracked as she works', '6.5 hours on the Brightside Café logo'],
      ['🧾', 'Invoice in one tap', 'R4 225, sent straight to WhatsApp'],
      ['🔔', 'A nudge when it\'s late', 'Paid two days after the reminder'],
    ],
    result: ['R3 180', 'put aside for SARS this month - no surprise tax bill'],
  },
  trades: {
    who: ['👷🏾‍♂️', 'Sipho, plumber', 'Example'],
    steps: [
      ['📝', 'Quote sent on WhatsApp', 'Bathroom renovation · R23 000'],
      ['💰', '50% deposit paid first', 'R11 500 in before buying the tiles'],
      ['🧰', 'Costs tracked on the job', 'Tiles and fittings R12 200 · 42 km of travel'],
      ['🧾', 'Final invoice, less the deposit', 'R11 500 · matched to his bank statement'],
    ],
    result: ['R7 600', 'profit on this job, worked out for him'],
  },
  retail: {
    who: ['🧑🏾‍💼', 'Zanele, spaza shop owner', 'Example'],
    steps: [
      ['💵', 'Till closed in two minutes', 'Cash R3 200 · Card R4 100 · balanced'],
      ['📦', 'Warned before she runs out', 'Coca-Cola 2L: 4 left - added to the reorder list'],
      ['📊', 'Sales land in the books', 'No re-typing from the till'],
    ],
    result: ['R18 640', 'of stock on the shelf - always known'],
  },
  food: {
    who: ['👩🏽‍🍳', 'Ayesha, café owner', 'Example'],
    steps: [
      ['💵', 'Friday cash-up', 'R7 950 in sales · R120 in tips'],
      ['⚠️', 'Short R40 - flagged the same day', 'Not discovered at month end'],
      ['🧾', 'VAT worked out from the sales', 'R1 037 included in today\'s takings'],
    ],
    result: ['Every day', 'balanced, recorded and ready for her accountant'],
  },
  appointments: {
    who: ['💇🏾‍♀️', 'Nomsa, salon owner', 'Example'],
    steps: [
      ['📅', 'Booking with a deposit', 'Braids, Saturday 09:00 · R200 deposit'],
      ['💬', 'WhatsApp reminder the day before', 'One tap - fewer no-shows'],
      ['✅', 'Done & paid', 'R450 balance recorded automatically'],
    ],
    result: ['R14 600', 'earned by her team this month, shown per stylist'],
  },
};

export function BizStory({ kind }) {
  const st = STORIES[kind] || STORIES.trades;
  return (
    <div className="story">
      <div className="person"><span className="avatar" aria-hidden="true">{st.who[0]}</span><div><b>{st.who[1]}</b><span>{st.who[2]} - how To The Cent helps</span></div></div>
      <ol>
        {st.steps.map(([ic, t, d], i) => (
          <li key={t} style={{ animationDelay: (i * 0.12) + 's' }}><span className="n" aria-hidden="true">{ic}</span><div className="t"><b>{t}</b><span>{d}</span></div></li>
        ))}
      </ol>
      <div className="result" style={{ animationDelay: (st.steps.length * 0.12) + 's' }}><span className="big">{st.result[0]}</span><span>{st.result[1]}</span></div>
    </div>
  );
}

// ---------- hero: a full, detailed picture of the app ----------
// Drawn at a fixed design size and scaled to whatever width it's given. When
// the space is narrow (a phone, or the hero's right-hand column) the scene is
// cropped to just the two devices and the problem notes move underneath as
// readable cards.
const SCENE_W = 1160, SCENE_H = 640;
const CROP_X = 120, CROP_W = 970, COMPACT_BELOW = 1000;
const CALLOUTS = [
  ['c1', 'Clients pay me late', 'Reminder sent on WhatsApp', 'INV-0042 paid 2 days later'],
  ['c2', 'Receipts lost in a shoebox', 'Every slip scanned & matched', '34 of 36 bank lines accounted for'],
  ['c3', 'Where did my salary go?', 'Safe to spend today: R327', 'Bills already set aside'],
  ['c4', 'SARS deadlines stress me', 'VAT201 numbers ready', 'R691 to pay by 25 Nov'],
];

const BARS = [[62, 28], [40, 45], [78, 30], [50, 58], [92, 22], [34, 18], [58, 36]];
const INVOICES = [
  ['INV-0042', 'Thandi M. · Bathroom', 'R4 600', 'paid', 'Paid'],
  ['INV-0041', 'Brightside Café', 'R3 150', 'sent', 'Sent'],
  ['INV-0038', 'K. Naidoo · Geyser', 'R2 300', 'late', 'Overdue'],
  ['QUO-0017', 'Mokoena · Renovation', 'R23 000', 'quote', 'Quote'],
];

export function HeroScene() {
  const ref = useRef(null);
  const [fit, setFit] = useState({ scale: 1, left: 0, compact: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      const w = el.clientWidth;
      if (w < COMPACT_BELOW) {
        const scale = Math.min(1, w / CROP_W);
        setFit({ scale, left: (w - CROP_W * scale) / 2 - CROP_X * scale, compact: true });
      } else {
        const scale = Math.min(1, w / SCENE_W);
        setFit({ scale, left: Math.max(0, (w - SCENE_W * scale) / 2), compact: false });
      }
    };
    fit();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', fit);
      return () => window.removeEventListener('resize', fit);
    }
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <>
    <div className={'scene' + (fit.compact ? ' compact' : '')} ref={ref} style={{ height: (fit.compact ? SCENE_H - 30 : SCENE_H) * fit.scale }} role="img"
      aria-label="Illustration of To The Cent with example data: a business dashboard on a laptop and a personal budget on a phone, with the everyday money problems each one solves">
      <div className="scene-in" style={{ width: SCENE_W, height: SCENE_H, left: fit.left, transform: `scale(${fit.scale})` }}>

        <div className="laptop">
          <div className="lscreen">
            <div className="ap-top">
              <span className="ap-logo">TC</span><b>Mokoena Plumbing</b>
              <div className="ap-tabs">{['Home', 'Money', 'Invoices', 'Jobs', 'Expenses', 'Reports', 'Team'].map((t, i) => <span key={t} className={i === 0 ? 'on' : ''}>{t}</span>)}</div>
              <span className="ap-avatar">S</span>
            </div>
            <div className="ap-body">
              <div className="ap-h"><b>Good morning, Sipho</b><span>Business · October 2026</span></div>
              <div className="ap-cards">
                {[['Cash available', 'R48 230', 'g'], ['Income', 'R36 900', ''], ['Expenses', 'R14 215', ''], ['Net profit', 'R22 685', 'g'], ['Outstanding', 'R9 750', 'o']].map(([l, v, c]) => (
                  <div className="ap-card" key={l}><span>{l}</span><b className={c}>{v}</b></div>
                ))}
              </div>
              <div className="ap-row">
                <div className="ap-panel">
                  <div className="ap-ph"><b>Cash flow · this week</b><span><i className="in" />In <i className="out" />Out</span></div>
                  <div className="ap-bars">
                    {BARS.map(([a, b], i) => (
                      <div key={i}>
                        <div className="pair">
                          <i className="in" style={{ height: a + '%', animationDelay: (0.4 + i * 0.07) + 's' }} />
                          <i className="out" style={{ height: b + '%', animationDelay: (0.45 + i * 0.07) + 's' }} />
                        </div>
                        <span>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="ap-panel">
                  <div className="ap-ph"><b>Invoices &amp; quotes</b><span>4 open</span></div>
                  {INVOICES.map(([n, w, a, c, l]) => (
                    <div className="ap-inv" key={n}><span><b>{n}</b><small>{w}</small></span><span className="r"><b>{a}</b><em className={c}>{l}</em></span></div>
                  ))}
                </div>
              </div>
              <div className="ap-attn">
                <b>Needs your attention</b>
                <div><i>!</i>INV-0038 overdue · R2 300</div>
                <div><i>!</i>3 bank lines need a receipt</div>
                <div><i>!</i>VAT due 25 Nov · R691</div>
              </div>
            </div>
          </div>
          <div className="lbase"><span /></div>
        </div>

        <div className="mphone">
          <div className="mscreen">
            <div className="m-status"><span>9:41</span><span className="dots"><i /><i /><i /></span></div>
            <div className="m-top"><b>Home</b><span className="ap-avatar">T</span></div>
            <div className="m-h"><b>Hi Thandi</b><span>25 Sep - 24 Oct</span></div>
            <div className="m-grid">
              <div className="m-stat sage"><span>Income</span><b>R18 500</b></div>
              <div className="m-stat mustard"><span>Spent</span><b>R11 240</b></div>
              <div className="m-stat lav"><span>Left</span><b>R7 260</b></div>
            </div>
            <div className="m-safe"><span>Safe to spend today</span><b>R327</b><small>Rent &amp; debit orders already set aside</small></div>
            <div className="m-cats">
              {[['🛒', 'Groceries', 'R2 410', 80, 'sage'], ['⛽', 'Fuel', 'R1 950', 97, 'mustard'], ['🍔', 'Eating out', 'R1 070', 64, 'lav']].map(([ic, n, v, w, c]) => (
                <div className="m-cat" key={n}>
                  <span className="ic">{ic}</span>
                  <div><div className="nm"><b>{n}</b><span>{v}</span></div><div className="m-bar"><i className={c} style={{ width: w + '%' }} /></div></div>
                </div>
              ))}
            </div>
            <div className="m-snap">📷 Snap a slip</div>
          </div>
        </div>

        {!fit.compact && CALLOUTS.map(([c, p, b, d]) => <div className={'callout ' + c} key={c}><s>"{p}"</s><b>{b}</b><span>{d}</span></div>)}
      </div>
    </div>
    {fit.compact && (
      <div className="callouts-list">
        {CALLOUTS.map(([c, p, b, d]) => <div className="callout" key={c}><s>"{p}"</s><b>{b}</b><span>{d}</span></div>)}
      </div>
    )}
    </>
  );
}

// The everyday problems, paired with what To The Cent does about each.
export const PROBLEMS = {
  people: [
    ['It\'s the 20th and the money is gone', 'A daily safe-to-spend number that already puts rent and debit orders aside.'],
    ['Slips in your wallet, no record anywhere', 'Snap a photo - the shop, items and total are read and categorised.'],
    ['Debit orders you forgot you had', 'Recurring payments found in your statement, with what\'s still coming this month.'],
    ['No idea where it all went', 'Spending by category, month on month - or just ask Khanyiso.'],
  ],
  business: [
    ['Customers pay late - or never', 'Invoices sent on WhatsApp, payments matched to your bank, one-tap reminders.'],
    ['Receipts lost before tax time', 'Scan receipts as you go; each one is matched to a line on your statement.'],
    ['Personal and business money mixed up', 'A separate business space with its own books, team and reports.'],
    ['Not sure if a job actually made money', 'Quotes, invoices, materials and travel per job, with the profit worked out.'],
    ['SARS: VAT, PAYE and provisional tax', 'VAT201 figures, payslips with PAYE & UIF, and how much to set aside.'],
  ],
};
