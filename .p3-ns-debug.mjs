export default async function run(page) {
  await page.goto('http://127.0.0.1:5173/builder', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  return await page.evaluate(async () => {
    const mod = await import('/src/i18n/index.ts');
    const i18n = mod.default;
    const builderEn = i18n.getResourceBundle('en', 'builder');
    return {
      hasBuilderEn: Boolean(builderEn),
      builderTopKeys: builderEn ? Object.keys(builderEn).slice(0, 8) : null,
      titleDirect: i18n.t('builder:title'),
      titleViaOpts: i18n.t('title', { ns: 'builder' }),
      h1: document.querySelector('h1')?.textContent,
    };
  });
}
