import { fetchNotebook } from './notebookRepository';
import { fetchGrammarBank, reconcileLearning } from './grammarRepository';

// Adoption on a second device is read-only on the server. Never import seeds here.
export async function readExistingLearning({ items, bank, progress }) {
  const [notebookRows, grammarRows] = await Promise.all([
    fetchNotebook(), fetchGrammarBank(),
  ]);
  return reconcileLearning(notebookRows, grammarRows, items, bank, progress);
}

// LAN HTTP pages may not expose randomUUID; getRandomValues still provides secure bytes.
export function createClientId(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== 'function') throw new Error('مرورگر تولید شناسهٔ امن را پشتیبانی نمی‌کند.');
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
