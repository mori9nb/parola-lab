// Same-origin HttpOnly cookie sessions; no bearer token or password is stored in JS.
export async function apiFetch(path, options = {}) {
  const { notifyUnauthorized = true, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  const method = (fetchOptions.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-Parola-Request', '1');
  const response = await fetch(path, { ...fetchOptions, headers, credentials: 'same-origin' });
  if (response.status === 401 && notifyUnauthorized && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('parola:unauthorized'));
  }
  return response;
}

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function apiJson(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await apiFetch(path, { ...options, signal: controller.signal });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const messages = {
        401: 'ایمیل یا رمز درست نیست، یا نشست پایان یافته است.',
        403: 'این درخواست مجاز نیست.',
        409: 'اطلاعات تغییر کرده یا این ایمیل قبلاً ثبت شده است.',
        422: 'اطلاعات واردشده معتبر نیست؛ فیلدها را بررسی کن.',
        429: 'تعداد تلاش‌ها زیاد شده؛ چند دقیقه بعد دوباره امتحان کن.',
      };
      throw new ApiError(messages[response.status] ?? 'ارتباط با سرور با خطا روبه‌رو شد.', response.status);
    }
    if (data === null) throw new Error('پاسخ سرور معتبر نیست.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('پاسخ سرور دریافت نشد؛ اتصال را بررسی کن.');
    throw error;
  } finally { clearTimeout(timeout); }
}
