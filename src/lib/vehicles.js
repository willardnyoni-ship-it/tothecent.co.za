// Motor trade maths: what a vehicle has cost so far, and what it made.
// A cost on a vehicle is an expense with vehicle_id set to it. Rejected
// expenses don't count. Amounts are as entered (VAT is not separated here).

export const COST_CATEGORIES = ['Parts', 'Repairs & labour', 'Panel & paint', 'Tyres', 'Valet & detailing', 'Licence & roadworthy', 'Transport & towing', 'Advertising', 'Other'];
export const STATUS_LABEL = { in_stock: 'In stock', reserved: 'Reserved', sold: 'Sold' };

const num = v => +v || 0;
const r2 = n => Math.round(n * 100) / 100;
const DAY = 86400000;
const day = s => new Date(String(s).slice(0, 10) + 'T12:00:00').getTime();

export const vehicleTitle = v => [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';

export const costsFor = (v, expenses) => (expenses || []).filter(e => e.vehicle_id === v.id && e.status !== 'rejected');

// today: 'YYYY-MM-DD' (South African date), passed in so this stays testable.
export function vehicleFinancials(v, expenses, today) {
  const list = costsFor(v, expenses);
  const costs = r2(list.reduce((a, e) => a + num(e.amount), 0));
  const purchase = num(v.purchase_price);
  const totalIn = r2(purchase + costs);
  const sold = v.status === 'sold';
  const asking = v.asking_price == null ? null : num(v.asking_price);
  const start = v.purchase_date || (v.created_at ? String(v.created_at).slice(0, 10) : today);
  const end = sold && v.sold_date ? v.sold_date : today;
  return {
    list, costs, purchase, totalIn, sold,
    profit: sold ? r2(num(v.sold_price) - totalIn) : null,
    // what it would make at the asking price, for a car still on the lot
    expected: !sold && asking != null && asking > 0 ? r2(asking - totalIn) : null,
    underwater: !sold && asking != null && asking > 0 && asking < totalIn,
    daysIn: Math.max(0, Math.round((day(end) - day(start)) / DAY)),
  };
}

// Numbers for the top of the Vehicles screen.
export function lotSummary(vehicles, expenses, today) {
  const month = today.slice(0, 7);
  const out = { inStock: 0, reserved: 0, tiedUp: 0, soldThisMonth: 0, profitThisMonth: 0, avgDays: 0 };
  let days = 0, n = 0;
  vehicles.forEach(v => {
    const f = vehicleFinancials(v, expenses, today);
    if (v.status === 'sold') {
      if (String(v.sold_date || '').startsWith(month)) { out.soldThisMonth++; out.profitThisMonth = r2(out.profitThisMonth + f.profit); }
    } else {
      if (v.status === 'reserved') out.reserved++; else out.inStock++;
      out.tiedUp = r2(out.tiedUp + f.totalIn);
      days += f.daysIn; n++;
    }
  });
  out.avgDays = n ? Math.round(days / n) : 0;
  return out;
}
