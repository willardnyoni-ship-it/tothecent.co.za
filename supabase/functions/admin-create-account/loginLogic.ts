// Login details for someone an owner sets up: a strong generated password, and the email that carries it.

// No look-alike characters (0/O, 1/l/I), 12 characters from a secure source: about 68 bits.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export function makePassword(length = 12): string {
  const out: string[] = [];
  const limit = 256 - (256 % ALPHABET.length); // avoid modulo bias
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit && out.length < length) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join("");
}

export const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export function loginEmail(opts: { name?: string; email: string; password: string; site: string }) {
  const first = String(opts.name || "").trim().split(/\s+/)[0];
  const hi = first ? `Hi ${first},` : "Hi,";
  const subject = "Your To The Cent login";
  const text = [
    hi, "",
    "Your To The Cent account is ready.", "",
    `Log in here: ${opts.site}`,
    `Email: ${opts.email}`,
    `Password: ${opts.password}`, "",
    "The first time you log in you will be asked to choose a password of your own, and whether you are setting up for yourself or for a business.", "",
    "If you did not expect this email, you can ignore it.",
    "To The Cent",
  ].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0A1430;line-height:1.5">
<p style="font-size:16px">${esc(hi)}</p>
<p>Your <b>To The Cent</b> account is ready.</p>
<table style="border-collapse:collapse;margin:16px 0;width:100%"><tr><td style="padding:10px 14px;background:#F1F4FC;border-radius:8px 8px 0 0;font-size:13px;color:#4B5563">Email</td></tr>
<tr><td style="padding:2px 14px 12px;background:#F1F4FC;font-size:16px"><b>${esc(opts.email)}</b></td></tr>
<tr><td style="padding:10px 14px 0;background:#F1F4FC;font-size:13px;color:#4B5563">Password</td></tr>
<tr><td style="padding:2px 14px 14px;background:#F1F4FC;border-radius:0 0 8px 8px;font-size:20px;letter-spacing:1px;font-family:'Courier New',monospace"><b>${esc(opts.password)}</b></td></tr></table>
<p><a href="${esc(opts.site)}" style="display:inline-block;background:#2150D8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:99px;font-weight:700">Log in</a></p>
<p style="font-size:14px;color:#4B5563">The first time you log in you will be asked to choose a password of your own, and whether you are setting up for yourself or for a business.</p>
<p style="font-size:13px;color:#6B7280">If you did not expect this email, you can ignore it.</p></div>`;
  return { subject, text, html };
}
