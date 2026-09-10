// Household members + expense splitting. Local-first, no server.
// Ported unchanged from app.html.
export function memberName(members, id) {
  const m = (members || []).find(x => x.id === id);
  return m ? m.name : 'Unknown';
}
export function splitOf(splits, txId) { return (splits || {})[txId] || null; }

// Who owes whom: for each split transaction the payer fronted the money, so
// everyone else owes the payer their share.
export function balances(tx, members, splits) {
  const bal = {};
  (members || []).forEach(m => bal[m.id] = 0);
  for (const t of tx) {
    if (t.mt) continue;
    const sp = splitOf(splits, t.id);
    if (!sp) continue;
    const payer = t.payer || (members[0] && members[0].id);
    if (!payer) continue;
    for (const [mid, amt] of Object.entries(sp)) {
      if (mid === payer) continue;
      bal[mid] = (bal[mid] || 0) - amt;
      bal[payer] = (bal[payer] || 0) + amt;
    }
  }
  return bal;
}

// Reduce the balances to the fewest payments that settle everyone up.
export function settlements(tx, members, splits) {
  const bal = balances(tx, members, splits);
  const owe = Object.entries(bal).filter(([, v]) => v < -0.005).map(([k, v]) => ({ k, v: -v })).sort((a, b) => b.v - a.v);
  const due = Object.entries(bal).filter(([, v]) => v > 0.005).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0, j = 0;
  while (i < owe.length && j < due.length) {
    const amt = Math.min(owe[i].v, due[j].v);
    if (amt > 0.005) out.push({ from: owe[i].k, to: due[j].k, a: +amt.toFixed(2) });
    owe[i].v -= amt; due[j].v -= amt;
    if (owe[i].v <= 0.005) i++;
    if (due[j].v <= 0.005) j++;
  }
  return out;
}
