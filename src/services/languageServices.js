export async function analyzeInput(text) {
  const cleanedText = text.trim();

  if (!cleanedText) {
    throw new Error("متن ورودی خالی است.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch("/api/analyze", {
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