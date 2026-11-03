# إصلاح إنشاء الحساب باسم المستخدم — Nexus PC Builder

تم إصلاح مسار التسجيل ليستخدم endpoint خادميًا `POST /api/auth/signup` ينشئ الحساب عبر Supabase Auth Admin REST API مع `email_confirm: true`، بدل `auth.signUp()` أو استدعاء SDK غير المتوافق `auth.admin.createUser`. لا يتم إرسال رسالة تأكيد بريد.

كما تم إصلاح `pattern` الخاص باسم المستخدم ليتوافق مع RegExp `v` في المتصفحات الحديثة مع دعم الحروف الإنجليزية والأرقام والنقطة والشرطة والشرطة السفلية.

## إعداد Vercel وSupabase

- أضف `SUPABASE_SERVICE_ROLE_KEY` في Vercel كمتغير سري خادمي فقط، دون `VITE_`.
- تأكد من إعداد `SUPABASE_URL` (أو `VITE_SUPABASE_URL`) ومتغيرات Supabase العامة اللازمة للواجهة.
- نفّذ `supabase/migrations/015_username_signup_rate_limit.sql`.
- أعد النشر واختبر إنشاء حساب جديد ثم تسجيل الدخول به.

لا تشارك `service_role` ولا تضفه إلى كود المتصفح أو Git. الحسابات التي تستخدم اسم المستخدم لا يمكنها استعادة كلمة المرور عبر البريد لأن البريد الداخلي ينتهي بـ `.invalid`.
