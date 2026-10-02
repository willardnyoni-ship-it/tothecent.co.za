// Sharing helpers used by invoices, quotes, payslips and reminders.

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Hands the actual PDF to the phone's share sheet where the browser can
// (see InvoiceDetailSheet for why); otherwise downloads it and returns
// false so the caller can open WhatsApp/email with a note to attach it.
export async function shareFile(file, title, text) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return true;
    }
  }
  downloadFile(file);
  return false;
}

// wa.me wants the number in international form without '+' or spaces.
// South African numbers are usually typed as 082 123 4567, so a leading 0
// becomes 27.
export function waNumber(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '27' + d.slice(1);
  return d;
}

export function openWhatsApp(phone, text) {
  window.open('https://wa.me/' + waNumber(phone) + '?text=' + encodeURIComponent(text), '_blank');
}

export function openEmail(to, subject, body) {
  window.location.href = 'mailto:' + (to || '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
}
