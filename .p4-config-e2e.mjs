export default async function run(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 180));
  });
  const failed = [];
  page.on('requestfailed', (r) => failed.push(r.url().slice(0, 100)));

  await page.goto('http://127.0.0.1:5173/ai-advisor', { waitUntil: 'networkidle' });
  await page.waitForSelector('h1', { timeout: 15000 });
  await page.waitForTimeout(1200);

  const config = await page.evaluate(async () => {
    const res = await fetch('/api/ai/config');
    return { status: res.status, body: await res.text() };
  });

  const statusText = await page.locator('body').innerText();

  return {
    configEndpoint: config,
    showsStatusPanel: /AI status|حالة الذكاء/.test(statusText),
    errors,
    failed,
  };
}
