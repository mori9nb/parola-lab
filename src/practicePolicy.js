import { shuffle, makeQuestion } from "./learning";
import { generateContent, generateGrammar } from "./services/languageServices";

export function notebookSources(items) {
  return items.filter(x => x.origin !== "ai" && ["word", "phrase", "sentence"].includes(x.kind) && x.text?.trim() && x.meaning?.trim());
}
export function wordSession(items, limit, reverse = false) {
  const pool = notebookSources(items).filter(x => x.kind !== "sentence");
  return shuffle(pool).map(x => makeQuestion(x, pool, reverse)).filter(Boolean).slice(0, limit);
}
// A new request for every session, regardless of date, level or previous attempts.
export async function generateFreshSession(mode, seeds, level, count, exclude = [], onProgress = () => {}) {
  const generate = mode === "grammar" ? generateGrammar : generateContent;
  const result = [];
  const seen = new Set(exclude.map(x => x.trim().toLocaleLowerCase("it")));
  onProgress(0, count);
  while (result.length < count) {
    const size = Math.min(5, count - result.length);
    const batch = await generate(seeds, level, size, [...exclude, ...result.map(x => x.text)].slice(-100));
    for (const item of batch) {
      const key = item.text.trim().toLocaleLowerCase("it");
      if (seen.has(key)) throw new Error("مدل سؤال تکراری فرستاد؛ برای یک جلسهٔ تازه دوباره تلاش کن.");
      if (mode === "sentence" && item.kind !== "sentence") throw new Error("مدل به‌جای جمله، کلمه فرستاد؛ دوباره تلاش کن.");
      seen.add(key);
      result.push(item);
    }
    onProgress(result.length, count);
  }
  return result;
}
