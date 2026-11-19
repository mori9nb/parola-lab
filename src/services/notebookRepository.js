import { importNotebook } from './notebookServices';

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : `خطای سرور: ${response.status}`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) {
      throw new Error('پاسخ سرور دریافت نشد؛ ممکن است عملیات ثبت شده باشد. وضعیت را دوباره از سرور بخوان.');
    }
    throw error;
  } finally { clearTimeout(timeout); }
}

export function decodeReview(value) {
  const due = Date.parse(value?.due);
  if (!value || !Number.isFinite(due) || !['attempts', 'correct', 'streak'].every(key => Number.isInteger(value[key]) && value[key] >= 0) || value.correct > value.attempts || value.streak > value.correct) {
    throw new Error('پیشرفت دریافتی از سرور معتبر نیست.');
  }
  return { attempts: value.attempts, correct: value.correct, streak: value.streak, due };
}

export async function fetchNotebook() {
  const data = await request('/api/notebook');
  if (data?.version !== 1 || !Array.isArray(data.items)) throw new Error('پاسخ دفترچه معتبر نیست.');
  return data.items;
}

// Keep browser IDs stable for history and grammar; server IDs are separate.
export function reconcileNotebook(rows, localItems, previousProgress, grammarIds = []) {
  const grammarKeys = new Set(grammarIds);
  const used = new Set();
  const serverIds = new Set();
  const progress = { ...previousProgress };
  for (const item of localItems) {
    if (!grammarKeys.has(item.id)) delete progress[item.id];
  }
  const items = rows.map(row => {
    if (!row || typeof row.id !== 'string' || serverIds.has(row.id) || typeof row.text !== 'string' || typeof row.meaning !== 'string' || !['word', 'phrase', 'sentence', 'pending'].includes(row.kind) || !(row.level === null || ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(row.level))) {
      throw new Error('آیتم دریافتی از سرور معتبر نیست.');
    }
    serverIds.add(row.id);
    const cached = localItems.find(item => item.serverId === row.id);
    const id = row.client_id ?? cached?.id ?? `server:${row.id}`;
    if (typeof id !== 'string' || !id.trim() || used.has(id) || grammarKeys.has(id)) throw new Error('شناسهٔ دفترچه با شناسهٔ دیگری تداخل دارد.');
    used.add(id);
    delete progress[id];
    if (row.review !== null) progress[id] = decodeReview(row.review);
    const { review, id: serverId, client_id, created_at, analysis_status, ...fields } = row;
    return { ...fields, id, serverId, createdAt: created_at, analysisStatus: analysis_status };
  });
  return { items, progress };
}

export async function persistNotebookItems(items) {
  // Stable client IDs make creation safe to repeat after a lost response.
  await importNotebook(items, {});
  const rows = await fetchNotebook();
  const ids = new Set(items.map(item => item.id));
  const saved = reconcileNotebook(rows.filter(row => ids.has(row.client_id)), items, {}).items;
  if (saved.length !== ids.size) throw new Error('ذخیرهٔ همهٔ آیتم‌ها تأیید نشد؛ دفترچه را از سرور بازخوانی کن.');
  return saved;
}

export async function deleteNotebookItem(serverId) {
  if (!serverId) throw new Error('این آیتم هنوز به سرور وصل نشده است.');
  return await request(`/api/items/${encodeURIComponent(serverId)}`, { method: 'DELETE' });
}

export async function submitNotebookReview(serverId, correct) {
  if (!serverId) throw new Error('این آیتم هنوز به سرور وصل نشده است.');
  // Never automatically retry a review: the backend has no attempt IDs yet.
  return decodeReview(await request(`/api/items/${encodeURIComponent(serverId)}/review`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correct }),
  }));
}
