export default async function run(page) {
  await page.goto('http://127.0.0.1:5173/builder', { waitUntil: 'networkidle' });
  // Wait for the real page (the lazy route mounts after hydration).
  await page.waitForSelector('h1', { timeout: 15000 });
  await page.waitForTimeout(1200);

  const add = page.getByRole('button', { name: /^Add$|^إضافة$/ }).first();
  if (await add.count()) {
    await add.click();
    await page.waitForTimeout(1000);
  }

  const text = await page.locator('body').innerText();
  return {
    bannerLine: text.split('\n').find((l) => /compatible|متوافق/i.test(l)) ?? '(none)',
    summary: text
      .split('\n')
      .filter((l) => /Total|الإجمالي|Budget|الميزانية|Est|التقديري/i.test(l))
      .slice(0, 6),
    bodyLen: text.length,
  };
}
