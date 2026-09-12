// Image compression, OCR pre-processing and on-device Tesseract OCR.
// Ported unchanged from app.html.
export async function toBitmap(file) {
  if (window.createImageBitmap) return await createImageBitmap(file);
  return await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file);
  });
}

export async function shrink(file, maxW, q) {
  const img = await toBitmap(file);
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  if (!w || !h) throw new Error('That photo could not be read (unsupported or empty image).');
  const sc = Math.min(1, maxW / w);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', q));
}

// Greyscale + auto-levels copy purely for OCR - not stored. Deliberately does
// NOT hard-threshold: Tesseract binarises internally and does it better than
// a fixed cutoff, which wipes out dim or shadowed slips.
export async function forOcr(file, scaleTo) {
  const img = await toBitmap(file);
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  if (!w || !h) throw new Error('That photo could not be read (unsupported or empty image).');
  const target = scaleTo || 1900;
  const sc = target / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, c.width, c.height);

  const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < p.length; i += 4) {
    const g = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) | 0;
    p[i] = p[i + 1] = p[i + 2] = g; hist[g]++;
  }
  const total = c.width * c.height;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.02) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.02) { hi = i; break; } }
  if (hi - lo < 24) { lo = 0; hi = 255; }
  const span = 255 / (hi - lo);
  for (let i = 0; i < p.length; i += 4) {
    const v = Math.max(0, Math.min(255, (p[i] - lo) * span));
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  x.putImageData(d, 0, 0);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res;
    s.onerror = () => rej(new Error('Could not load OCR engine - check your connection the first time.'));
    document.head.appendChild(s);
  });
}

// Tesseract v5 moved line data around; dig it out wherever it lives.
function ocrLines(data) {
  if (!data) return [];
  if (Array.isArray(data.lines) && data.lines.length) return data.lines;
  const out = [];
  (data.blocks || []).forEach(b => (b.paragraphs || []).forEach(pp => (pp.lines || []).forEach(l => out.push(l))));
  if (out.length) return out;
  return String(data.text || '').split('\n').map(t => ({ text: t, confidence: null }));
}

export async function runOcr(blob, onProg, psm) {
  if (!window.Tesseract) {
    onProg(0.02, 'Downloading OCR engine (first time only)…');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js');
  }
  onProg(0.1, 'Reading slip…');
  const res = await window.Tesseract.recognize(blob, 'eng', {
    logger: m => { if (m.status === 'recognizing text') onProg(0.1 + m.progress * 0.85, 'Reading slip…'); },
  }, { tessedit_pageseg_mode: psm || '4' });
  return { text: res.data.text || '', lines: ocrLines(res.data), conf: res.data.confidence };
}
