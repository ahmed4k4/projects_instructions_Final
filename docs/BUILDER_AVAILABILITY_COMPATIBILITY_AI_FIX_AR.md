# إصلاح صفحة بناء الجهاز والتوافق وSmart Builder

## السبب الجذري لرسالة AI fallback

كان Smart Builder يستخدم نموذج Gemini 3.8 Flash ضمن quality tier، لكن قائمة السماح في طبقة Gemini proxy التي تستدعيها دالة Vercel لم تكن تتضمن `gemini-3.8-flash`. لذلك كان الخادم يرفض الطلب محليًا برسالة `404 Unknown AI route or unsupported model` قبل إرساله إلى Google Gemini. تمت إضافة النموذج إلى قائمة السماح، كما أضيف اختبار يطلب مسار النموذج من دالة Vercel ويتأكد أن الرفض لم يعد 404.

تم الإبقاء على `generateContent`، مع المحافظة على أجزاء رد النموذج و`thoughtSignature` ومعرّفات `functionCall` وإرسال جميع `functionResponse` المطابقة في رسالة واحدة. عند انتهاء دورات الأدوات دون اعتماد نهائي، يحاول النظام استرداد آخر تجميعة اختارها Gemini واجتازت فحص التوافق. وإذا فشل ذلك، يعمل fallback القائم على القواعد مع تسجيل تشخيص أكثر فائدة (عدد الدورات، استدعاءات الأدوات الناجحة والفاشلة، والتجميعات التي اجتازت التحقق).

## التغييرات في صفحة بناء الجهاز

- كتالوج القطع معروض في صفحات مرقمة، 12 عنصرًا في الصفحة، ويتغير رقم الصفحة عند تغيير التصنيف أو البحث أو الفرز أو المكونات المختارة.
- أضيف خيار «عرض القطع المتوافقة فقط». يقيس كل مرشح مقابل المكونات المختارة في التجميعة الحالية، ويستبعد التعارضات المؤكدة والفحوص التي لا يمكن إثباتها.
- إذا كانت قواعد المقارنة أو مواصفات القطع غير كافية، تظهر الحالة «غير متحقق» بدل إظهار علامة توافق خضراء غير مستحقة.
- عند اختيار قطعة يوجد معها تعارض مؤكد، يمنع النظام إضافتها ويعرض سبب التعارض. عند نقص البيانات يسمح بالإضافة مع تنبيه واضح.

## دقة التوفر والأسعار

حالات المخزون المعتمدة:

- `in_stock`: المتجر أبلغ صراحة أن القطعة متوفرة.
- `limited`: المتجر أبلغ أن الكمية محدودة.
- `out_of_stock`: المتجر أبلغ صراحة أن القطعة غير متوفرة.
- `unknown`: لم يرسل المتجر حالة يمكن تأكيدها، أو أن آخر فحص أقدم من 48 ساعة.

لا يتم تحويل `unknown` إلى متوفر أو غير متوفر. ويحافظ كل متجر على حالته ووقت آخر تحديث الخاص به. أي حالة مخزون أقدم من 48 ساعة تصبح `unknown` تلقائيًا؛ لأن الحالة القديمة لا تثبت المخزون الحالي. كما أن القطع المحفوظة من كتالوج النظام القديم لا تملك سجل متجر حديثًا، ولذلك لا نعرضها على أنها متوفرة. وحساب فرق السعر/التوفير لا يعتمد إلا على عروض `in_stock` المؤكدة من متجرين مختلفين على الأقل. كما تم توحيد ترتيب العروض ليعطي الأولوية للتوفر المؤكد، ثم الكمية المحدودة، ثم غير المؤكد، ثم غير المتوفر، وبعدها السعر. لذلك لن يتصدر سعر متجر غير مؤكد على سعر متجر لديه توفر مؤكد.

**حدود الدقة:** الموقع يعرض آخر حالة جمعها الكتالوج من المتجر، وليس مخزونًا لحظيًا أو ضمانًا للبيع. قد يتغير المخزون أو السعر بعد آخر عملية جمع. يجب فتح صفحة المتجر للتحقق النهائي قبل الدفع. كما أن inferred specs تظل بيانات مستنتجة وليست بديلًا عن ورقة المواصفات الرسمية.

## حدود ميزانية Smart Builder

شريط الاختيار يبدأ من 10,000 حتى 1,000,000 جنيه، لكن حقل الكتابة اليدوية لا يفرض هذا الحد؛ يمكن إدخال رقم أقل أو أكبر. عند استخدام الشريط نفسه يرجع الاختيار إلى حدوده الظاهرة.

## الفحوص المنفذة

- `node --experimental-strip-types scripts/verify-build-agent-regressions.mjs` — 10/10
- `node scripts/verify-builder-ui.mjs` — 17/17
- `node --experimental-strip-types scripts/verify-retailer-stock-parser.mjs` — 14/14
- `node --experimental-strip-types scripts/verify-retailer-stock-freshness.mjs` — 10/10
- `node scripts/verify-ai-performance.mjs` — 20/20
- `node --experimental-strip-types scripts/verify-ai-function.mjs` — 20/20
- `node scripts/verify-guest-auth.mjs` — 13/13
- `node scripts/check-i18n.mjs`
- `node scripts/check-rtl.mjs`
- `node scripts/check-orphans.mjs`
- TypeScript/TSX syntax transpilation لعدد 166 ملفًا من `src` و`api` وملفات Edge Function؛ صفر syntax diagnostics أو exceptions.
- `node scripts/check-i18n.mjs` — 1,186 مفتاحًا × لغتين؛ `node scripts/check-rtl.mjs` — ناجح؛ `node scripts/check-orphans.mjs` — صفر ملفات معزولة.

لم يتم تشغيل Vitest أو `pnpm typecheck` أو `pnpm build` في هذه البيئة؛ لأن `node_modules` غير موجودة ومدير الحزم/الاعتماديات لم تكن متاحة. ولم يتم إجراء اتصال حي بمفتاح Gemini أو مشروع Supabase الإنتاجي. لذلك هذه النتائج تثبت فحوصات المصدر والمحاكاة المحلية، وليست اختبارًا حيًا على بيانات المتاجر أو مفاتيحك الحقيقية.

## خطوات النشر

1. فك ضغط المشروع واستبدل ملفات النسخة القديمة بالنسخة الجديدة.
2. نفّذ `pnpm install`.
3. نفّذ الفحوص المذكورة أعلاه، ثم `pnpm typecheck` و`pnpm test` و`pnpm build` في بيئتك.
4. ارفع التغييرات إلى GitHub ثم أعد النشر على Vercel.
5. انشر Edge Function الخاصة بتحديث المتاجر بعد تعديل قارئ Schema.org: `supabase functions deploy retailer-sync --no-verify-jwt`. ثم شغّل مزامنة كاملة يدويًا من طرفية آمنة، لا من المتصفح:
   ```bash
   curl -X POST "$SUPABASE_URL/functions/v1/retailer-sync" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"mode":"all"}'
   ```
   وإلا ستظل بعض سجلات قاعدة البيانات القديمة كما هي حتى موعد المزامنة التالية. لو كان الموقع يستخدم Snapshot بدل Supabase، احذف ملفات الزحف المؤقتة القديمة أولًا (`Remove-Item -Recurse -Force .qa/crawl -ErrorAction SilentlyContinue` في PowerShell)، ثم شغّل `pnpm crawl` وأعد نشر `public/data/retailer_snapshot.json` وملفات category shards و`bootstrap.json` مع الموقع؛ لأن السكربت يتجاوز ملفات الزحف المكتملة الموجودة مسبقًا.
6. تأكد من وجود `GEMINI_API_KEY` و`SUPABASE_URL` و`SUPABASE_ANON_KEY` ضمن Environment Variables الخاصة ببيئة النشر، وأن migrations 013 و014 مطبقة حسب إعدادات حماية استخدام AI الحالية.
7. اختبر Smart Builder بعد النشر، ثم افتح Vercel Function Logs عند حدوث fallback. سيظهر الآن سجل `[Smart Builder] AI finalisation incomplete` مع مؤشرات تساعد على تحديد إن كانت المشكلة في الأدوات أم عدم اكتمال الرد.
8. جرّب صفحة البناء بعد تحديث الصفحة وتفريغ Cache الموقع إن كان المتصفح يحتفظ بنسخة قديمة.
