import { apiFetch } from "./api";
export async function chatRequest(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 75_000);
  try {
    const response = await apiFetch(path, { ...options, signal: controller.signal });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "درخواست انجام نشد؛ اتصال را بررسی کن.");
    if (!data) throw new Error("پاسخ سرور معتبر نیست.");
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("پاسخ طول کشید؛ تاریخچه را دوباره بخوان و سپس تلاش کن.");
    if (error instanceof TypeError) throw new Error("ارتباط با سرور برقرار نشد.");
    throw error;
  } finally { clearTimeout(timer); }
}
export const readChat = channel => chatRequest(`/api/chat/${channel}`);
export const clearChat = channel => chatRequest(`/api/chat/${channel}`, { method: "DELETE" });
export const sendChat = (channel, text) => chatRequest(`/api/chat/${channel}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
export async function encodeAudio(blob) {
  if (!blob.size || blob.size > 6_000_000) throw new Error("فایل صوتی باید حداکثر ۶ مگابایت باشد.");
  const mime = blob.type.split(";")[0] || ({m4a:"audio/mp4",mp3:"audio/mpeg",wav:"audio/wav",ogg:"audio/ogg",webm:"audio/webm",aac:"audio/aac",flac:"audio/flac"}[blob.name?.split('.').pop().toLowerCase()]);
  if (!mime) throw new Error("نوع فایل صوتی مشخص نیست؛ فایل MP3 یا M4A انتخاب کن.");
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("خواندن فایل صوتی انجام نشد."));
    reader.readAsDataURL(blob);
  });
  return {mime_type:mime,data};
}

export async function sendVoice(channel, blob) {
  const audio = await encodeAudio(blob);
  return chatRequest(`/api/chat/${channel}/voice`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(audio)});
}
