import { apiFetch } from "./api";
export async function analyzeInput(text) {
  const cleanedText = text.trim();

  if (!cleanedText) {
    throw new Error("متن ورودی خالی است.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await apiFetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: cleanedText }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        typeof data?.detail === "string"
          ? data.detail
          : `تحلیل انجام نشد؛ کد خطا: ${response.status}`;

      throw new Error(message);
    }

    const requiredFields = [
      "text",
      "kind",
      "meaning",
      "level",
      "example",
      "translation",
    ];

    const valid =
      data &&
      requiredFields.every(
        (field) =>
          typeof data[field] === "string" &&
          data[field].trim().length > 0,
      ) &&
      ["word", "phrase", "sentence"].includes(data.kind) &&
      ["A1", "A2", "B1", "B2", "C1", "C2"].includes(data.level);

    if (!valid) {
      throw new Error("پاسخ تحلیل ناقص یا نامعتبر است.");
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("پاسخ طول کشید؛ دوباره امتحان کن.");
    }

    if (error instanceof TypeError) {
      throw new Error("ارتباط برقرار نشد؛ روشن بودن سرورها را بررسی کن.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export async function generateContent(seeds, targetLevel, count = 3, exclude = []) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await apiFetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        seeds,
        target_level: targetLevel,
        kind: "sentence",
        count,
        exclude,
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        typeof data?.detail === "string"
          ? data.detail
          : "تولید محتوای تازه انجام نشد.",
      );
    }

    const valid =
      Array.isArray(data?.items) &&
      data.items.length === count &&
      data.items.every(
        (item) =>
          ["text", "meaning", "example", "translation"].every(
            (field) =>
              typeof item[field] === "string" &&
              item[field].trim().length > 0,
          ) &&
          ["word", "phrase", "sentence"].includes(item.kind) &&
          item.level === targetLevel &&
          seeds.includes(item.source_text),
      );

    if (!valid) {
      throw new Error("پاسخ تولید معتبر نیست.");
    }

    return data.items;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("زمان انتظار برای تولید تمام شد.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateGrammar(seeds, targetLevel, count = 3, exclude = []) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await apiFetch("/api/grammar/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        seeds,
        target_level: targetLevel,
        count,
        exclude,
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        typeof data?.detail === "string"
          ? data.detail
          : "تولید تمرین گرامر انجام نشد.",
      );
    }

    if (!Array.isArray(data?.items) || data.items.length !== count) {
      throw new Error("پاسخ تمرین گرامر نامعتبر است.");
    }

    return data.items;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("زمان انتظار برای تولید گرامر تمام شد.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}