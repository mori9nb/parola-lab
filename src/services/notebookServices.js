function isoDate(value, label) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new Error(`زمان ${label} معتبر نیست.`);
  }

  return date.toISOString();
}

function convertItem(item, progress) {
  const review = progress[item.id];

  const converted = {
    client_id: item.id,
    text: item.text,
    meaning: item.meaning ?? "",
    kind: item.kind,
    level: item.level ?? null,
    source_language: item.source_language ?? "fa",
    target_language: item.target_language ?? "it",
    example: item.example ?? "",
    translation: item.translation ?? "",
    tag: item.tag ?? "",
    note: item.note ?? "",
    origin: item.origin ?? "user",
    source_text: item.source_text ?? "",
    analysis_status:
      item.analysisStatus ??
      (item.kind === "pending" ? "pending" : "completed"),
  };

  if (item.createdAt != null) {
    converted.created_at = isoDate(
      item.createdAt,
      `ایجاد «${item.text}»`,
    );
  }

  if (review != null) {
    if (
      typeof review.due !== "number" ||
      !Number.isFinite(review.due)
    ) {
      throw new Error(
        `زمان مرور «${item.text}» معتبر نیست.`,
      );
    }

    converted.review = {
      streak: review.streak,
      attempts: review.attempts,
      correct: review.correct,
      due: isoDate(review.due, `مرور «${item.text}»`),
    };
  }

  return converted;
}

export async function importNotebook(items, progress) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("دفترچه خالی است.");
  }

  const ids = items.map((item) => item.id);

  if (
    ids.some(
      (id) => typeof id !== "string" || !id.trim(),
    ) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error("شناسه‌های دفترچه نامعتبر یا تکراری‌اند.");
  }

  // پیش از اولین درخواست، تمام تاریخ‌ها تبدیل می‌شوند.
  const converted = items.map(
    (item) => convertItem(item, progress),
  );

  const totals = {
    created: 0,
    existing: 0,
    reviews_created: 0,
  };

  for (let offset = 0; offset < converted.length; offset += 500) {
    const batch = converted.slice(offset, offset + 500);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      60_000,
    );

    try {
      const response = await fetch("/api/notebook/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: 1,
          items: batch,
        }),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const detail =
          typeof data?.detail === "string"
            ? data.detail
            : response.status === 422
              ? "بعضی داده‌های دفترچه با قرارداد انتقال سازگار نیستند."
              : `انتقال انجام نشد؛ کد ${response.status}`;

        throw new Error(detail);
      }

      const valid =
        data &&
        ["created", "existing", "reviews_created"].every(
          (key) =>
            Number.isInteger(data[key]) &&
            data[key] >= 0,
        ) &&
        data.created + data.existing === batch.length &&
        Array.isArray(data.mappings) &&
        data.mappings.length === batch.length;

      if (!valid) {
        throw new Error("پاسخ انتقال معتبر نیست.");
      }

      totals.created += data.created;
      totals.existing += data.existing;
      totals.reviews_created += data.reviews_created;
    } catch (error) {
      const message =
        error.name === "AbortError"
          ? "زمان انتظار تمام شد."
          : error instanceof TypeError
            ? "ارتباط با سرور برقرار نشد."
            : error.message;

      throw new Error(
        `${message} ممکن است بخشی ذخیره شده باشد؛ انتقال دوباره قابل انجام است.`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return totals;
}