export default async function run(page) {
  await page.goto('http://127.0.0.1:5173/builder', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  return await page.evaluate(async () => {
    const mod = await import('/src/i18n/index.ts');
    const i18n = mod.default;
    const bundle = i18n.getResourceBundle('en', 'translation');
    return {
      topLevelKeys: Object.keys(bundle).sort(),
      builderKeys: bundle.builder ? Object.keys(bundle.builder).slice(0, 10) : null,
      title: i18n.t('builder.title'),
      budget: i18n.t('builder.budget'),
      navBuilder: i18n.t('nav.builder'),
    };
  });
}
