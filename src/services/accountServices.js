import { apiJson } from './api';
import { importNotebook } from './notebookServices';
import { fetchNotebook } from './notebookRepository';
import { importGrammarBank, fetchGrammarBank } from './grammarRepository';

export const readAccount = () => apiJson('/api/account');
export const saveAccountPatch = (patch, revision) => apiJson('/api/account', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, revision }),
});
export const getCurrentUser = () => apiJson('/api/auth/me', { notifyUnauthorized: false });
export const signIn = (data, register = false) => apiJson(`/api/auth/${register ? 'register' : 'login'}`, {
  method: 'POST', notifyUnauthorized: false, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
});
export const signOut = () => apiJson('/api/auth/logout', { method: 'POST', notifyUnauthorized: false });
export const changePassword = data => apiJson('/api/auth/password', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
});

// One-time automatic recovery only for the locally claimed development owner.
// Other accounts never read or inherit old browser data.
export async function recoverOwnerLegacy(account, storage = globalThis.localStorage) {
  if (!account.legacy_import_allowed) return account;
  const read = key => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };
  const items = read('parola.items.v1');
  const grammar = read('parola.grammarBank.v1');
  const history = read('parola.history.v1');
  const settings = read('parola.settings.v1');
  const profile = read('parola.profile.v1');
  const progress = read('parola.progress.v1') ?? {};
  if (![items, grammar, history, settings, profile].some(value => value !== null)) return account;
  const [serverItems, serverGrammar] = await Promise.all([fetchNotebook(), fetchGrammarBank()]);
  const existingItemIds = new Set(serverItems.map(item => item.client_id));
  const existingServerIds = new Set(serverItems.map(item => item.id));
  const missingItems = Array.isArray(items) ? items.filter(item => !existingItemIds.has(item.id) && !existingServerIds.has(item.serverId) && !existingServerIds.has(item.id?.replace(/^server:/, ''))) : [];
  const existingGrammarIds = new Set(serverGrammar.map(question => question.client_id));
  const missingGrammar = Array.isArray(grammar) ? grammar.filter(question => !existingGrammarIds.has(question.id)) : [];
  if (missingItems.length) await importNotebook(missingItems, progress);
  if (missingGrammar.length) await importGrammarBank(missingGrammar, progress);
  const safeSettings = settings && typeof settings === 'object' ? Object.fromEntries(['level', 'daily', 'base', 'target', 'timezone'].filter(key => settings[key] != null).map(key => [key, settings[key]])) : null;
  return apiJson('/api/account/legacy', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: safeSettings, display_name: profile?.displayName || null, history: Array.isArray(history) ? history : [], onboarded: read('parola.onboarding.v1') === true, generation_days: read('parola.generationDays.v1') ?? {} }),
  });
}
