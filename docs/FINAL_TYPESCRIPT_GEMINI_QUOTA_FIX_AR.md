# إصلاح خطأ TypeScript وحصة Gemini 429

## ما تم إصلاحه

### 1. خطأ CompatibilityRule في Build Doctor

الخطأ كان ناتجًا عن قراءة `rule_key` و`category_a` و`category_b` و`rule_type` و`spec_path_a` و`spec_path_b` من كائن `CompatibilityRule` بعد أن كانت `getCompatibilityRules()` قد حولت صفوف Supabase بالفعل إلى صيغة camelCase.

أصبح `loadRules()` يعيد `getCompatibilityRules()` مباشرة. النوع الصحيح يحتوي على `ruleKey` و`categoryA` و`categoryB` و`ruleType` و`specPathA` و`specPathB`، ولا توجد قراءة لحقول snake_case من هذا النوع.

### 2. منع سلسلة 429 المتتالية

كان Gemini provider يعامل 429 مثل فشل موديل، فيجرّب موديلات أخرى فورًا. هذا كان يولّد طلبات أخرى بينما Google ترفض الطلبات بسبب الحصة.

أصبح fallback يواصل التجربة عند أخطاء الموديل/الخدمة المؤقتة 404 و503 فقط. عند 429 تتوقف المحاولة فورًا، ويحافظ النظام على رد Google بدل تدوير الموديلات.

أضيف تحليل لتفاصيل الخطأ، بما فيها:
- رسالة Google الأصلية و`RESOURCE_EXHAUSTED`.
- مهلة إعادة المحاولة من `RetryInfo` أو `Retry-After`.
- أبعاد الحصة من `QuotaFailure` مثل الموديل ونوع حد الاستهلاك.
- تمرير `Retry-After` من proxy إلى المتصفح.

ويوقف اختبار اتصال AI استكشاف موديلات أخرى بمجرد اكتشاف 429.

### 3. Smart Builder

تم تقليل دورة الأدوات إلى أربع جولات كحد أقصى. يبدأ البناء باختيار من Snapshot للكتالوج، ثم يستخدم مسار الأدوات المحدود عند الحاجة. لا يؤدي هذا إلى تجاوز حصة Google، لكنه يقلل عدد الطلبات غير الضرورية عند فشل الاختيار.

## ما تعنيه 429 في السجل المرفق

الطلب وصل إلى `/api/ai` عبر Vite على `localhost:5173`، والرد 429 من Google (`X-AI-Upstream: google`). هذا ليس خطأ TypeScript أو خطأ Vite. قد يكون السبب حد الطلبات في الدقيقة RPM، أو حد رموز الإدخال TPM، أو الحصة اليومية RPD، أو حد الإنفاق المرتبط بمستوى الاستخدام.

حدود Gemini تطبق على مستوى Google Cloud project، لا على مستوى API key. لذلك إنشاء مفتاح آخر في المشروع نفسه لا يرفع الحصة. يجب فتح Google AI Studio → Projects → اختيار المشروع المرتبط بالمفتاح → Rate limits / Usage، ثم مراجعة الحد الذي نفد.

- إذا كان RPM/TPM: انتظر نافذة الحد، وخفّض عدد الطلبات وحجم الإدخال/الإخراج.
- إذا كان RPD: انتظر إعادة الضبط أو اطلب زيادة الحصة.
- إذا كان حد الإنفاق أو الرصيد: راجع Billing وUsage tier وأضف/فعّل وسيلة الدفع عند الحاجة.
- ربط Billing مؤهل قد يرفع Usage tier، لكنه لا يضمن إزالة كل الحدود أو توافر السعة دائمًا.

## فحوصات تم تشغيلها

- Build Doctor / quota regression: 7/7.
- AI Performance contract: 27/27.
- Builder UI contract: 20/20.
- Smart Builder regression: 26/26.
- AI route: 20/20.
- Guest/Auth: 13/13.
- i18n: 1186 keys × 2 languages.
- RTL: passed.
- Source reachability: 181 source files, 0 orphaned files.
- `tsc -p tsconfig.app.json --noEmit`: لا يظهر TS2551، لكنه لا ينجح حاليًا لأن `node_modules` غير مثبتة (مثل `react`, `@tanstack/react-query` وملفات JSX runtime غير موجودة). لذلك لم يتم اعتماد نتيجة typecheck/build كاملة.

## بعد استخراج النسخة

```bash
pnpm install
pnpm verify:gemini-quota
pnpm verify:smart-builder
pnpm typecheck
pnpm build
```

لا توجد Migration أو متغيرات بيئة جديدة لهذا الإصلاح. استمر باستخدام `GEMINI_API_KEY` خادميًا كما هو.
