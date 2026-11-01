export default async function run(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 160));
  });
  const bad = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/')) bad.push(`${r.status()} ${r.url().slice(0, 90)}`);
  });

  await page.goto('http://127.0.0.1:5173/ai-advisor', { waitUntil: 'networkidle' });
  await page.waitForSelector('h1', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const config = await page.evaluate(async () => {
    const res = await fetch('/api/ai/config');
    return await res.text();
  });

  // Ask a real question about hardware.
  const box = page.locator('textarea').first();
  await box.fill('In one sentence: is 32GB of RAM enough for 4K gaming?');
  await box.press('Enter');

  for (let i = 0; i < 45; i += 1) {
    await page.waitForTimeout(1000);
    if ((await page.getByLabel(/Stop generating|إيقاف/).count()) === 0) break;
  }
  await page.waitForTimeout(1200);

  const body = await page.locator('body').innerText();
  const answers = await page.locator('div.prose-nexus').allInnerTexts();

  return {
    config,
    answer: (answers.at(-1) ?? '').slice(0, 320),
    hasError: /could not answer|quota|not configured|unavailable/i.test(body),
    consoleErrors: errors,
    badApiCalls: bad,
  };
}
