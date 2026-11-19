import { apiFetch } from "./api";
import { decodeReview, reconcileNotebook } from './notebookRepository';

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
function validateQuestion(question) {
  if (!question || typeof question.text !== 'string' || question.text.split('___').length !== 2 || !Array.isArray(question.options) || question.options.length !== 4 || question.options.some(x => typeof x !== 'string' || !x.trim() || x.length > 200) || new Set(question.options.map(x => x.trim().toLowerCase())).size !== 4 || !question.options.includes(question.answer) || typeof question.meaning !== 'string' || !question.meaning.trim() || typeof question.explanation !== 'string' || !question.explanation.trim() || !(question.level == null || levels.includes(question.level))) {
    throw new Error('ساختار سؤال گرامر معتبر نیست.');
  }
}
function isoDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('تاریخ گرامر معتبر نیست.');
  return date.toISOString();
}
async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await apiFetch(path, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : `عملیات گرامر انجام نشد؛ کد ${response.status}`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('پاسخ سرور گرامر دریافت نشد؛ ممکن است عملیات ثبت شده باشد. گرامر را بازخوانی کن.');
    throw error;
  } finally { clearTimeout(timeout); }
}
export function encodeGrammar(question, progress) {
  validateQuestion(question);
  if (typeof question.id !== 'string' || !question.id.trim() || question.id.length > 128) throw new Error('شناسهٔ سؤال گرامر معتبر نیست.');
  const item = {
    client_id: question.id, text: question.text, options: [...question.options],
    answer: question.answer, meaning: question.meaning, explanation: question.explanation,
    level: question.level ?? null, source_text: question.source_text ?? '', origin: question.origin ?? 'starter',
  };
  if (question.createdAt != null) item.created_at = isoDate(question.createdAt);
  const review = progress[question.id];
  if (review != null) {
    if (typeof review.due !== 'number' || !Number.isFinite(review.due)) throw new Error('زمان مرور گرامر معتبر نیست.');
    const due = isoDate(review.due);
    decodeReview({ ...review, due });
    item.review = { attempts: review.attempts, correct: review.correct, streak: review.streak, due };
  }
  return item;
}
export async function fetchGrammarBank() {
  const data = await request('/api/grammar/bank');
  if (data?.version !== 1 || !Array.isArray(data.items)) throw new Error('پاسخ مخزن گرامر معتبر نیست.');
  return data.items;
}
export function reconcileGrammar(rows, localBank, previousProgress, notebookIds = []) {
  const protectedIds = new Set(notebookIds);
  const ids = new Set();
  const serverIds = new Set();
  const progress = { ...previousProgress };
  for (const question of localBank) {
    if (protectedIds.has(question.id)) throw new Error('شناسهٔ گرامر با دفترچه تداخل دارد.');
    delete progress[question.id];
  }
  const bank = rows.map(row => {
    validateQuestion(row);
    if (typeof row.id !== 'string' || !row.id.trim() || serverIds.has(row.id) || typeof row.client_id !== 'string' || !row.client_id.trim() || ids.has(row.client_id) || protectedIds.has(row.client_id)) throw new Error('شناسه‌های دریافتی گرامر تکراری یا نامعتبرند.');
    ids.add(row.client_id); serverIds.add(row.id);
    delete progress[row.client_id];
    if (row.review !== null) progress[row.client_id] = decodeReview(row.review);
    const { id: serverId, client_id: id, created_at: createdAt, review, ...fields } = row;
    return { ...fields, id, serverId, createdAt };
  });
  return { bank, progress };
}
// Validate both snapshots before updating React state; one domain must not erase the other's progress.
export function reconcileLearning(notebookRows, grammarRows, items, bank, previousProgress) {
  let nextItems = items;
  let nextBank = bank;
  let progress = previousProgress;
  if (notebookRows !== null) {
    const decoded = reconcileNotebook(notebookRows, items, progress, bank.map(q => q.id));
    nextItems = decoded.items; progress = decoded.progress;
  }
  if (grammarRows !== null) {
    const decoded = reconcileGrammar(grammarRows, bank, progress, nextItems.map(item => item.id));
    nextBank = decoded.bank; progress = decoded.progress;
  }
  return { items: nextItems, bank: nextBank, progress };
}
export async function importGrammarBank(bank, progress = {}) {
  if (!Array.isArray(bank)) throw new Error('مخزن گرامر معتبر نیست.');
  const encoded = bank.map(question => encodeGrammar(question, progress));
  if (new Set(encoded.map(q => q.client_id)).size !== encoded.length) throw new Error('شناسه‌های گرامر تکراری‌اند.');
  for (let offset = 0; offset < encoded.length; offset += 500) {
    const batch = encoded.slice(offset, offset + 500);
    const data = await request('/api/grammar/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, items: batch }),
    });
    if (!data || !Number.isInteger(data.created) || data.created < 0 || !Number.isInteger(data.existing) || data.existing < 0 || data.created + data.existing !== batch.length || !Array.isArray(data.mappings) || data.mappings.length !== batch.length) throw new Error('پاسخ انتقال گرامر معتبر نیست؛ وضعیت را بازخوانی کن.');
    const mappings = new Map(data.mappings.map(m => [m.client_id, m.id]));
    if (mappings.size !== batch.length || batch.some(q => typeof mappings.get(q.client_id) !== 'string' || !mappings.get(q.client_id))) throw new Error('نگاشت شناسه‌های گرامر معتبر نیست.');
  }
}
export async function persistGrammarEntries(bank) {
  await importGrammarBank(bank);
  const rows = await fetchGrammarBank();
  const ids = new Set(bank.map(q => q.id));
  const saved = reconcileGrammar(rows.filter(row => ids.has(row.client_id)), bank, {}).bank;
  if (saved.length !== ids.size) throw new Error('ذخیرهٔ همهٔ سؤال‌ها تأیید نشد؛ گرامر را بازخوانی کن.');
  return saved;
}
export async function submitGrammarReview(serverId, correct, attemptId) {
  if (!serverId) throw new Error('این سؤال هنوز به سرور متصل نشده است.');
  // No automatic retries: the backend does not yet have unique attempt IDs.
  return decodeReview(await request(`/api/grammar/entries/${encodeURIComponent(serverId)}/review`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correct, ...(attemptId ? { attempt_id: attemptId } : {}) }),
  }));
}
