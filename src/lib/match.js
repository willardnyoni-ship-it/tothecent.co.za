import { dayDiff } from './format.js';

export const MATCH_DAYS = 4;
// A CSV import sets src:'csv', a PDF import sets src:'pdf' - both are
// "statement truth" for reconciliation and re-import dedup. This used to
// check only 'pdf', from before CSV import existed - since then, every
// bank except FNB's fast PDF path relies on CSV, so reconciliation
// (Receipts tab) and duplicate detection on re-import were silently broken
// for all of them.
export const isStmt = t => t.src === 'pdf' || t.src === 'csv';
// Cash-marked receipts are excluded - the user has said no bank line will
// ever appear for them, so they shouldn't sit in "logged, not on statement".
export const isLog = t => !isStmt(t) && !t.mt && !t.cash;

// Statement lines are truth; logged slips match to them on exact amount
// within a +/- day window. Ported unchanged from app.html.
export function matchSets(stmt, logged, win) {
  win = win || MATCH_DAYS;
  const used = new Set(), pairs = [];
  for (const s of stmt) {
    let best = null, bestD = 1e9;
    for (const l of logged) {
      if (used.has(l.id)) continue;
      if (Math.abs(l.a - s.a) > 0.005) continue;
      const dd = Math.abs(dayDiff(s.d, l.d));
      if (dd <= win && dd < bestD) { best = l; bestD = dd; }
    }
    if (best) { used.add(best.id); pairs.push({ stmt: s, log: best, days: bestD }); }
  }
  return {
    pairs,
    logOnly: logged.filter(l => !used.has(l.id)),
    stmtOnly: stmt.filter(s => !pairs.some(p => p.stmt.id === s.id)),
  };
}
