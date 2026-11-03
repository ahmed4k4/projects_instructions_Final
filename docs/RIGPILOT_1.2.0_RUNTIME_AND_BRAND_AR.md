# RIGPILOT 1.2.0 — إصلاح API المحلي وتحديث الهوية

## ما الذي تم إصلاحه؟

### 1) خطأ `POST /api/auth/signup 404`

المشروع يعمل بواجهة Vite، بينما ملفات `api/auth/*` هي Web Standard Functions التي يشغّلها Vercel عند النشر. وجود الملفات داخل مجلد `api` وحده لا يجعل Vite يشغّلها محليًا.

أُضيف `authDevProxyPlugin` إلى `vite.config.ts` ليشغّل نفس دوال الخادم في التطوير المحلي على المسارات التالية:

- `GET /api/auth/health`
- `POST /api/auth/signup`
- `POST /api/auth/login`

تُحمّل أسرار Supabase في عملية Node الخاصة بخادم التطوير فقط، ولا تُضاف إلى كود المتصفح أو إلى `define` في Vite.

### 2) إعداد `.env.local`

انسخ `.env.example` إلى `.env.local` وضع بيانات مشروع Supabase نفسه:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY

SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

- `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` للمتصفح، والـ anon key مصمم ليكون عامًا مع تطبيق RLS الصحيح.
- `SUPABASE_URL` و`SUPABASE_ANON_KEY` و`SUPABASE_SERVICE_ROLE_KEY` لخادم API.
- **ممنوع** تسمية المفتاح السري `VITE_SUPABASE_SERVICE_ROLE_KEY` أو وضعه في أي ملف داخل `src`.
- لا تشارك `.env.local` ولا ترفعه إلى Git.

بعد تعديل `.env.local` أوقف `pnpm dev` وشغّله مجددًا؛ Vite يقرأ إعدادات الخادم عند بداية التشغيل.

### 3) فحص جاهزية الحسابات

افتح بعد تشغيل المشروع:

`http://localhost:5173/api/auth/health`

القيم المتوقعة:

- `release`: `1.2.0`
- `loginReady`: `true` إذا كان رابط Supabase ومفتاح anon متاحين للخادم.
- `signupReady`: `true` إذا توفرت أيضًا قيمة `SUPABASE_SERVICE_ROLE_KEY`.
- `projectRef`: يوضح معرّف مشروع Supabase فقط، دون كشف أي مفتاح.

إذا كانت `signupReady` تساوي `false`، أصلح متغيرات البيئة قبل اختبار نموذج التسجيل. هذا الفحص يتحقق من وجود الإعدادات ولا يثبت صلاحية المفاتيح أو إمكانية الوصول إلى Supabase؛ الاختبار الحقيقي يتم عند إرسال الطلب.

## رسائل Console التي ليست أخطاء في تطبيق RIGPILOT

- `Shortcut-*.js`, `ContentScript-*.js`, `contentScript.js` و`redirectionChainSiteScript.js`: مصدرها غالبًا إضافة متصفح أو أداة حقن خارجية. اختبر في نافذة Incognito مع تعطيل الإضافات لتحديد الإضافة المسؤولة.
- `ws://127.0.0.1:5500/ws`: محاولة اتصال من Live Server/Live Reload أو إضافة مرتبطة به. هذا المشروع يعمل على Vite، افتراضيًا على `localhost:5173`؛ أوقف Live Server أو عطّل إضافته بدل تشغيل خادمي تطوير للصفحة نفسها.
- تحذير React Router `v7_startTransition`: تم تفعيل خيار التوافق `v7_startTransition` في `createBrowserRouter`.
- رسائل i18next: تم ضبط `debug: false` في تهيئة التطبيق لتقليل رسائل التشخيص غير الضرورية.

## الهوية البصرية RIGPILOT

تم اعتماد الهوية المذكورة في طلب المشروع:

- Void `#0A0F1E` للخلفية الرئيسية.
- Midnight `#121E31` للأسطح والبطاقات.
- Signal Cyan `#42D9F5` للتفاعل والتركيز.
- Orbit Violet `#9A87FF` لخصائص الذكاء الاصطناعي والعناصر الثانوية.
- Volt Lime `#B8F36B` للحالات الإيجابية والتنبيهات الناجحة فقط.
- Inter للإنجليزية، IBM Plex Sans Arabic للعربية، وJetBrains Mono للأرقام والمواصفات.
- علامة شريحة إلكترونية ذات مسار إشارة أمامي، وخلفيات مسارات تقنية خافتة، مع الحفاظ على واجهة هادئة لا تعتمد على مؤثرات ألعاب صاخبة.

تم الحفاظ على وضع الإضاءة الفاتح، واللغتين، وRTL، ومكوّن Build Score الدائري، وفحوص التوافق الحالية.

## التحقق

شغّل:

```bash
node scripts/verify-rigpilot-runtime.mjs
node scripts/check-i18n.mjs
node scripts/check-rtl.mjs
node scripts/verify-signup-resilience.mjs
```

هذا التقرير لا يدّعي نجاح التسجيل على حساب Supabase حقيقي؛ ذلك يتطلب ملف `.env.local` صحيحًا واتصالًا فعليًا بالمشروع.

## تشخيص اتصال الذكاء الاصطناعي

افتح:

`http://localhost:5173/api/ai/config`

- إذا كانت `gemini` تساوي `false`، فتأكد من وجود `GEMINI_API_KEY` في `.env.local` ثم أعد تشغيل Vite.
- إذا كان الطلب يصل إلى Google ثم يعود `429`، فهذا يعني أن مشروع Google تجاوز حد الطلبات أو الرموز أو الاستخدام اليومي. الكود لا يستطيع رفع حصة Google.
- لتجربة التحويل الاحتياطي، أضف `GEMINI_API_KEY_FALLBACK` من مشروع Google AI Studio مختلف تمامًا عن المشروع الأساسي. المفتاح الثاني داخل نفس المشروع لا يعطي حصة منفصلة.
- راجع حدود المشروع في Google AI Studio قبل اعتبار الذكاء الاصطناعي جاهزًا للإنتاج.
