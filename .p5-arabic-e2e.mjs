export default async function run(page) {
  await page.goto('http://127.0.0.1:5173/ai-advisor', { waitUntil: 'networkidle' });
  await page.waitForSelector('h1', { timeout: 15000 });
  await page.waitForTimeout(900);

  // Switch to Arabic first, then ask in Arabic.
  await page.getByRole('button', { name: 'ع', exact: true }).click();
  await page.waitForTimeout(900);

  const box = page.locator('textarea').first();
  await box.fill('بجملة واحدة بالعربية: ما وظيفة مزوّد الطاقة في الحاسوب؟');
  await box.press('Enter');

  for (let i = 0; i < 45; i += 1) {
    await page.waitForTimeout(1000);
    if ((await page.getByLabel(/إيقاف توليد|Stop generating/).count()) === 0) break;
  }
  await page.waitForTimeout(1200);

  const answers = await page.locator('div.prose-nexus').allInnerTexts();
  const answer = answers.at(-1) ?? '';

  return {
    dir: await page.evaluate(() => document.documentElement.dir),
    isArabic: /[\u0600-\u06FF]/.test(answer),
    answer: answer.slice(0, 300),
  };
}
