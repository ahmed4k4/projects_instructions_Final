export default async function run(page) {
  await page.goto('http://127.0.0.1:5173/ai-advisor', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Reach into the i18next instance the app bootstrapped.
  return await page.evaluate(async () => {
    const mod = await import('/src/i18n/index.ts');
    const i18n = mod.default;
    return {
      lng: i18n.language,
      namespaces: i18n.options.ns,
      defaultNS: i18n.options.defaultNS,
      hasEn: Boolean(i18n.options.resources?.en),
      enKeys: i18n.options.resources?.en ? Object.keys(i18n.options.resources.en) : null,
      aiTitle: i18n.t('advisor.title', { ns: 'ai' }),
      commonFooter: i18n.t('footer.engine'),
      isInitialized: i18n.isInitialized,
    };
  });
}
