# RIGPILOT 1.2.1 — إصلاح TypeScript وBuild

## سبب الخطأ

كان `v7_startTransition` موضوعًا داخل خيارات `createBrowserRouter`:

```tsx
createBrowserRouter(routes, {
  future: { v7_startTransition: true },
});
```

في إصدار React Router المستخدم بالمشروع (`react-router-dom` 6.28.x)، هذا الخيار ليس ضمن نوع خيارات `createBrowserRouter`، لذلك TypeScript أظهر TS2353.

## الإصلاح

تم نقل خيار التوافق إلى المكان المدعوم: خاصية `future` في `RouterProvider`:

```tsx
const router = createBrowserRouter(routes);

export function AppRouter() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
}
```

هذا يبقي إعدادات إنشاء الراوتر منفصلة عن إعدادات تشغيل المزود، ويعالج الخطأ المحدد دون إسكات TypeScript أو استخدام `any` أو cast غير آمن.

## تغييرات الإصدار

- إصدار التطبيق: `1.2.1`.
- تحديث `/api/auth/health` ليعرض `release: 1.2.1`.
- تحديث اختبار التحقق من موضع إعداد React Router.

## نتائج الفحوص التي أمكن تشغيلها

- `verify-rigpilot-runtime`: 18/18.
- `verify-signup-resilience`: 15/15.
- `verify-guest-auth`: 13/13.
- `verify-ai-fallback`: 5/5.
- `verify-ai-performance`: 27/27.
- `verify-builder-ui`: 20/20.
- `check-i18n`: 1190 مفتاحًا × لغتين، و363 مفتاحًا مستخدمًا.
- `check-rtl`: ناجح.
- `verify-listing-coverage`: 2718 منتجًا، ونسبة صور 100% بحسب بيانات التغطية.

## حدود التحقق

لم يكتمل `pnpm build` أو `pnpm typecheck` في بيئة إعداد هذا الإصدار؛ لم تتوفر `node_modules`، وتعذر الوصول إلى `registry.npmjs.org` أثناء محاولة تثبيت الاعتماديات. لذلك لا أدّعي أن البناء الإنتاجي الكامل تم التحقق منه هنا.

بعض سكربتات التحقق الأخرى تحتاج ملف `dist` الناتج عن build أو متصفح Playwright أو تشغيل Node بخيارات TypeScript المناسبة أو مفاتيح Gemini حقيقية؛ عدم تشغيلها في هذه البيئة لا يعني بالضرورة وجود خلل في التطبيق.

## خطوات التحقق على جهاز التطوير

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
```

إذا ظهر خطأ جديد بعد ذلك، أرسل أول خطأ TypeScript كاملًا أو أول stack trace من build، وليس كل التحذيرات التابعة له.
