# تحديث الذكاء الاصطناعي والحسابات — Nexus PC Builder

## ما الذي تغير؟

### سرعة الذكاء الاصطناعي
- الموديل التفاعلي الأساسي: `gemini-3.5-flash-lite`.
- البديل السريع: `gemini-3.1-flash-lite`، ثم `gemini-3.6-flash` عند أخطاء التوفر/الحصة.
- تقليل التفكير إلى `MINIMAL` في الدردشة وبناء التجميعة.
- خفض سقف إجابة بناء التجميعة إلى 1,536 Token وتقليل عدد جولات الأدوات من 5 إلى 3.
- تقليل سجل المستشار إلى آخر 6 رسائل، مع قص الرسائل الطويلة.
- إذا لم يصل أول رد من الموديل الأساسي خلال 8 ثوانٍ، يتم إلغاء الطلب وتجربة الموديل البديل، مع احترام إلغاء المستخدم.
- استمرار Streaming حتى تظهر الإجابة تدريجيًا بدل انتظار النص كاملًا.

> تغيير الموديل لا يرفع حصة Google. حدود RPM/TPM/RPD الفعلية تُدار من مشروع Google AI Studio، ولا يمكن تجاوزها بتسجيل الدخول أو زيادة الحد الداخلي للموقع.

### الدخول كزائر والحساب الاختياري
- كل الصفحات العامة، البحث، المقارنة، بناء PC، Smart Builder ومستشار AI متاحة دون تسجيل دخول.
- حد الزائر 30 طلب AI في الدقيقة لكل IP مجزّأ على الخادم.
- المستخدم المسجل يحصل على 60 طلبًا في الدقيقة وفق حسابه.
- الحساب الاختياري يستخدم اسم مستخدم وكلمة مرور دون إرسال رسائل بريد.
- يتم تحويل اسم المستخدم داخليًا إلى alias على النطاق غير القابل للاستلام `.invalid` لاستخدام Supabase Auth. لا يُخزّن بريد حقيقي.
- لا توجد استعادة كلمة مرور بالبريد؛ يجب حفظ كلمة المرور. لا تستخدم هذه الطريقة إذا كنت تحتاج تأكيد بريد حقيقي أو استعادة كلمة المرور بالبريد.
- الحفظ السحابي المرتبط بحساب يظل خاصية حساب؛ أما بناء التجميعات واستخدام AI والبحث والمقارنة فلا تتطلب حسابًا.

## إعداد Supabase

1. افتح Supabase SQL Editor أو استخدم CLI.
2. تأكد من تطبيق migrations السابقة، خصوصًا `013_authenticated_ai_quota.sql`.
3. طبّق `014_guest_ai_quota.sql`.
4. في Supabase Dashboard → Authentication → Providers → Email، عطّل `Confirm email` قبل إنشاء حسابات username؛ حتى لا يحاول Supabase إرسال رسالة إلى alias غير حقيقي.
5. لا تغيّر إعداد تأكيد البريد على مشروع فيه مستخدمون يعتمدون على تأكيد البريد الحقيقي قبل اختبار التأثير على بيئة منفصلة.

## إعداد Vercel

أضف القيم التالية في Production وPreview وDevelopment:

```env
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-3.5-flash-lite
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
AI_RATE_LIMIT_SALT=long-random-server-only-secret
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

`AI_RATE_LIMIT_SALT` قيمة سرية على الخادم فقط؛ لا تضف `VITE_` إليها. لا تضف Gemini API key إلى متغير يبدأ بـ `VITE_`.

بعد إضافة المتغيرات، أعد النشر.

## التحقق

```bash
pnpm verify:ai-speed
pnpm verify:guest-auth
pnpm verify:ai-route
pnpm typecheck
pnpm test
pnpm build
```

التحقق المحلي الذي تم في هذه النسخة: 16/16 فحص أداء AI، و7/7 فحوصات وضع الزائر والحساب، و19/19 فحصًا لمدخل Vercel، ونجاح فحوصات i18n وRTL والوصول إلى ملفات المصدر. لم يُشغّل Production Build أو Typecheck كامل بسبب عدم وجود `node_modules` في بيئة إعداد الحزمة؛ يجب تنفيذهما بعد `pnpm install`.


## إصلاح إنشاء الحساب بدون Email Rate Limit

إنشاء الحسابات باسم المستخدم يتم الآن عبر endpoint خادمي `/api/auth/signup` يستخدم Supabase Auth Admin REST API مع `email_confirm: true` للبريد الاصطناعي `@accounts.nexus.invalid`؛ لا يتم إرسال رسالة تأكيد. أضف `SUPABASE_SERVICE_ROLE_KEY` في Vercel كمتغير Server-only (بدون `VITE_`) وطبّق migration `015_username_signup_rate_limit.sql`. endpoint يحدد إنشاء الحسابات بخمسة حسابات لكل IP في الساعة. تسجيل الدخول العادي يظل عبر `signInWithPassword` باستخدام الاسم وكلمة المرور.
