// Device PIN lock - a gate on this device, not encryption at rest.
// Ported unchanged from app.html.
const LOCK_KEY = 'wnLock_v1';

export function loadLock() {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || {}; } catch (e) { return {}; }
}
export function saveLock(lockCfg) {
  try { localStorage.setItem(LOCK_KEY, JSON.stringify(lockCfg)); } catch (e) { /* ignore */ }
}

export async function pinHash(pin, lockCfg) {
  const enc = new TextEncoder();
  const salt = lockCfg.salt || (lockCfg.salt = [...crypto.getRandomValues(new Uint8Array(8))].map(x => x.toString(16)).join(''));
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode('lock:' + salt), iterations: 150000, hash: 'SHA-256' }, base, 256);
  return [...new Uint8Array(bits)].map(x => x.toString(16).padStart(2, '0')).join('');
}
