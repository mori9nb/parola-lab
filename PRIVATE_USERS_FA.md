# حساب‌های خصوصی با کنترل مدیر

## بستن ثبت‌نام عمومی

همین حالا در Render → سرویس Parola → Environment مقدار زیر را false کن و ذخیره کن:

AUTH_REGISTRATION_ENABLED=false

این مقدار باید false بماند. دکمهٔ ثبت‌نام هم در نسخهٔ جدید از صفحهٔ ورود حذف شده است؛ کنترل امنیتی اصلی در بک‌اند است.
افراد فقط با حسابی که خودت می‌سازی وارد می‌شوند. هیچ رمز دیتابیس یا کلید Gemini به آن‌ها داده نمی‌شود.

## نصب و انتشار

فایل‌های بسته را در ریشهٔ پروژه جایگزین کن. در ترمینال:

```bash
cd ~/projects/parola-lab
git add backend/app/models.py backend/app/auth.py backend/app/user_admin.py backend/migrations/versions/007_user_access.py backend/tests/test_user_admin.py backend/tests/test_postgres.py scripts/manage_users.py src/AuthGate.jsx PRIVATE_USERS_FA.md
git commit -m "Add private user administration and account suspension"
git push
```

منتظر بمان Render آخرین commit را deploy کند و Live شود. migration 007 هنگام شروع خودکار اجرا می‌شود.
حساب فعلی تو و داده‌ها حفظ می‌شوند؛ تمام حساب‌های موجود ابتدا فعال می‌مانند.
اگر سرویس روی Auto-Deploy نباشد، Manual Deploy → Deploy latest commit را بزن.

## ساخت حساب یک نفر

روی لپ‌تاپ، از ریشهٔ پروژه:

```bash
source backend/.venv/bin/activate
python scripts/manage_users.py create
```

اول URL مستقیم Neon را در ورودی مخفی وارد کن؛ سپس ایمیل، نام نمایشی و رمز اولیهٔ ۱۲ تا ۱۲۸ کاراکتری را تعیین کن.
URL و رمز هنگام تایپ نمایش داده نمی‌شوند. همان رشتهٔ اتصال مستقیم Neon فعلی را نگه دار؛ اسکریپت انتقال اولیه را دوباره اجرا نکن.
فقط لینک سایت، ایمیل حساب و رمز اولیه را خصوصی به همان شخص بده. او بعد از ورود از تنظیمات رمز را تغییر می‌دهد.
حساب جدید دفترچه و تاریخچهٔ خالی خودش را دارد؛ داده‌های تو کپی نمی‌شوند.

## سایر دستورها

فهرست کاربران:
```bash
python scripts/manage_users.py list
```

قطع دسترسی یک نفر:
```bash
python scripts/manage_users.py disable
```
نشست‌های او باطل می‌شوند و ورود دوباره رد می‌شود. اطلاعاتش حذف نمی‌شود. ایمیل حساب را ابزار می‌پرسد و تأیید DISABLE می‌خواهد.
حساب مالکِ منتقل‌شده با این ابزار قابل غیرفعال‌کردن نیست تا اشتباهی خودت را بیرون نیندازی.

فعال‌کردن مجدد:
```bash
python scripts/manage_users.py enable
```

تغییر نام:
```bash
python scripts/manage_users.py rename
```

تعیین رمز جدید و خروج از همهٔ دستگاه‌های آن کاربر:
```bash
python scripts/manage_users.py reset-password
```
تغییر رمز، حساب غیرفعال را فعال نمی‌کند؛ اگر خواستی جداگانه enable کن.

## محدودهٔ این تغییر

کنترل کاربران از ترمینال خودت و با دسترسی مالک دیتابیس است؛ مسیر ادمین عمومی جدیدی روی سایت اضافه نشده.
محدودیت اختصاصی مصرف روزانه یا پنل ادمین داخل سایت در این بسته اضافه نشده؛ حساب‌های مجاز همچنان از Gemini و فضای دیتابیس مشترک استفاده می‌کنند.
۹۲ تست بک‌اند پاس، ۳ تست اختیاری PostgreSQL اجرا نشده؛ بررسی ساخت حساب، جداسازی داده، بستن ثبت‌نام و قطع نشست/ورود حساب غیرفعال انجام شده است.
