// SA tax year (1 Mar - 28/29 Feb) helpers. Ported unchanged from app.html.
export function saTaxYear(d) {
  d = d || new Date();
  const y = d.getFullYear();
  return d.getMonth() >= 2 ? y + '-' + (y + 1) : (y - 1) + '-' + y;
}
export function taxYearLabel(ty) {
  const p = ty.split('-');
  return '1 Mar ' + p[0] + ' - 28 Feb ' + p[1];
}
export function taxYearsAvailable(taxDeductions) {
  const set = new Set(Object.keys(taxDeductions || {}));
  set.add(saTaxYear());
  return [...set].sort().reverse();
}
export function blankDeductions() {
  return { ra: 0, medAid: 0, medOOP: 0, donations: 0, donationRef: '', travel: false, businessKm: 0, totalKm: 0, homeOffice: false, homeOfficePct: 0 };
}
