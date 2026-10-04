import { shrink } from './ocr.js';
import { isDemo, demoProfile } from './demo.js';

const MAX_PDF_BYTES = 6.5 * 1024 * 1024;

function toBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

// What a read of a supplier invoice looks like in the owner-portal preview,
// where there's no server: a plausible delivery for each kind of business.
const SAMPLES = {
  retail: { supplier: 'Makro Wholesale', invoice_number: 'MK-20417', prices_include_vat: true, lines: [
    { description: 'COCA COLA 2L PET', name: 'Coca-Cola 2L', category: 'Drinks', qty: 24, unit: 'each', unit_price: 24.7 }, { description: 'Maize Meal 5kg', name: 'Maize meal 5kg', category: 'Groceries', qty: 10, unit: 'each', unit_price: 64.4 },
    { description: 'White Bread Loaf', name: 'White bread', category: 'Groceries', qty: 20, unit: 'each', unit_price: 16.3 }, { description: 'Simba Chips 120g', name: 'Simba Chips 120g', category: 'Snacks', qty: 36, unit: 'each', unit_price: 14.95 },
    { description: 'Handy Andy 750ml', name: 'Handy Andy 750ml', category: 'Household', qty: 12, unit: 'each', unit_price: 31.5 }, { description: 'Sunlight Dish Liq 750ml (12 pk)', name: 'Sunlight dish liquid 750ml', category: 'Household', pack_size: 12, qty: 2, unit: 'case', unit_price: 336 }] },
  food: { supplier: 'Fresh Produce Market', invoice_number: 'FP-8834', prices_include_vat: false, lines: [
    { description: 'Avocados (box of 20)', name: 'Avocados', category: 'Fresh produce', pack_size: 20, qty: 3, unit: 'box', unit_price: 220 }, { description: 'Full-cream milk 2L', name: 'Full-cream milk 2L', category: 'Dairy & eggs', qty: 24, unit: 'each', unit_price: 31.2 },
    { description: 'Free range eggs tray 30', name: 'Free-range eggs (tray of 30)', category: 'Dairy & eggs', qty: 6, unit: 'tray', unit_price: 68 }, { description: 'Baby spinach 200g', name: 'Baby spinach 200g', category: 'Fresh produce', qty: 15, unit: 'each', unit_price: 22 },
    { description: 'Takeaway cups 50pk', name: 'Takeaway cups (50)', category: 'Packaging', qty: 4, unit: 'pack', unit_price: 92 }, { description: 'Halloumi 250g', name: 'Halloumi 250g', category: 'Dairy & eggs', qty: 12, unit: 'each', unit_price: 54 }] },
  appointments: { supplier: 'Beauty Wholesale SA', invoice_number: 'BW-5521', prices_include_vat: true, lines: [
    { description: 'Braiding hair pack', qty: 30, unit: 'pack', unit_price: 41.4 }, { description: 'Relaxer kit', qty: 6, unit: 'each', unit_price: 94.3 },
    { description: 'Nail polish gel', qty: 24, unit: 'each', unit_price: 32.2 }, { description: 'Edge control 250ml', qty: 12, unit: 'each', unit_price: 58 }] },
};
const sampleFor = () => SAMPLES[demoProfile()] || { supplier: 'Builders Warehouse', invoice_number: 'BW-1002', prices_include_vat: true, lines: [
  { description: 'PVC pipe 40mm 3m', qty: 20, unit: 'each', unit_price: 69 }, { description: 'Teflon tape', qty: 30, unit: 'each', unit_price: 9.2 }, { description: 'Silicone sealant', qty: 12, unit: 'each', unit_price: 46 }] };

// Sends a supplier invoice (photo or PDF) to the reader and returns what it
// found (see supabase/functions/read-supplier-invoice). Throws an Error with
// a message that's fine to show the person.
export async function readSupplierInvoice(file, syncCfg, ensureToken, categories = []) {
  if (isDemo()) { await new Promise(r => setTimeout(r, 1400)); return { ...sampleFor(), date: new Date().toISOString().slice(0, 10) }; }
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  let blob = file, mime = 'application/pdf';
  if (isPdf) {
    if (file.size > MAX_PDF_BYTES) throw new Error('That PDF is too big to read (over 6 MB). Try a photo of the invoice, or type it in.');
  } else {
    blob = await shrink(file, 1800, 0.85);
    mime = 'image/jpeg';
  }
  let token;
  try { token = await ensureToken(); } catch { throw new Error("You've been signed out - sign in again to scan invoices."); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55000);
  let resp;
  try {
    resp = await fetch(syncCfg.url.replace(/\/+$/, '') + '/functions/v1/read-supplier-invoice', {
      method: 'POST', signal: ctrl.signal,
      headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: await toBase64(blob), mimeType: mime, categories: categories.slice(0, 30) }),
    });
  } catch (e) {
    throw new Error(e && e.name === 'AbortError' ? 'Reading took too long. Try again, or type the invoice in.' : "Couldn't reach the reader - check your connection, or type the invoice in.");
  } finally { clearTimeout(timer); }
  if (resp.status === 401) throw new Error("You've been signed out - sign in again to scan invoices.");
  const d = await resp.json().catch(() => null);
  if (!resp.ok || !d || d.error) throw new Error("Couldn't read that invoice automatically. You can type the lines in below.");
  if (!Array.isArray(d.lines) || !d.lines.length) throw new Error("No stock lines were found on that. Try a clearer photo, or type the lines in.");
  return d;
}
