# إصلاح أخطاء إنشاء الحساب — Nexus PC Builder

## ما تم تعديله

1. إزالة أي اعتماد على `supabase.auth.admin.createUser`؛ مسار الخادم يستخدم Supabase Auth Admin REST endpoint مباشرةً مع `SUPABASE_SERVICE_ROLE_KEY` على الخادم فقط. لذلك لا يوجد استدعاء للخاصية `auth.admin` التي سببت خطأ TS2339 في النسخة السابقة.
2. إزالة HTML `pattern` من حقل اسم المستخدم؛ بعض المتصفحات الحديثة تفسر `pattern` باستخدام RegExp بوضع `v`، وكان النمط السابق يسبب `Invalid regular expression`. التحقق ما زال موجودًا في React hook والخادم.
3. إضافة معالج أخطاء عام لمسار `/api/auth/signup` حتى لا تتحول الاستثناءات غير المتوقعة إلى صفحة خطأ مبهمة؛ يرجع JSON برسالة واضحة ويسجل السبب في Vercel Function Logs.
4. تحسين تشخيص أخطاء Supabase Auth: الاسم المستخدم مسبقًا، كلمة المرور الضعيفة، مفتاح الخدمة غير الصحيح، رابط المشروع غير الصحيح، وحدود المعدل لها رسائل أوضح. تفاصيل الاستجابة تسجل في سجلات الخادم فقط.
5. إبقاء التسجيل باسم المستخدم وكلمة المرور، وتفعيل الحساب من الخادم دون إرسال بريد تأكيد، مع بقاء الموقع والذكاء الاصطناعي متاحين للزائر.

## إعدادات الإنتاج المطلوبة

في Vercel أضف المتغيرات التالية لنفس مشروع Supabase، ثم أعد النشر:

- `SUPABASE_URL` = رابط مشروع Supabase (يمكن أن يعتمد المسار على `VITE_SUPABASE_URL` كبديل).
- `SUPABASE_SERVICE_ROLE_KEY` = مفتاح `service_role`/المفتاح السري الحالي من إعدادات Supabase. لا تضعه في متغير يبدأ بـ `VITE_` ولا في Git.
- `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` = إعدادات المتصفح العامة المستخدمة بالفعل في التطبيق.

طبّق Migration `015_username_signup_rate_limit.sql` في SQL Editor قبل اختبار التسجيل. الدالة تمنح حتى 5 محاولات إنشاء حساب لكل بصمة IP خلال ساعة.

## نتائج الفحص

- `verify:guest-auth`: 13/13 ناجح.
- `verify:ai-speed`: 16/16 ناجح.
- `verify:ai-route` عبر Node Type Stripping: 19/19 ناجح.
- فحوص i18n وRTL وبنية الملفات: ناجحة.
- فحص TypeScript/build الكامل لم يكتمل في بيئة إعداد الإصدار لعدم وجود `node_modules` وعدم توفر `pnpm`، كما أن تعريفات `@types/node` غير موجودة. يجب تشغيل `pnpm install --frozen-lockfile` ثم `pnpm typecheck` و`pnpm build` محليًا أو في CI قبل اعتبار البناء النهائي مؤكدًا.

## إذا ظهر HTTP 500 بعد نشر هذه النسخة

افتح Vercel → Project → Logs → Functions، ثم اختر `api/auth/signup`. ابحث عن سجل يبدأ بـ `[auth signup]`. سيحدد إن كان الفشل من إعدادات المفاتيح، أو migration، أو Supabase Auth Admin. لا تشارك قيمة `SUPABASE_SERVICE_ROLE_KEY` أو أي أسرار في لقطات الشاشة.
