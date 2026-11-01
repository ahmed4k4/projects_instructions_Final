export default async function run(page) {
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 300)}`));

  await page.goto('http://127.0.0.1:5173/ai-advisor', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Capture the raw stream request/response.
  const events = [];
  page.on('response', async (r) => {
    if (r.url().includes('/api/gemini')) {
      events.push({ url: r.url().slice(0, 140), status: r.status(), ct: r.headers()['content-type'] });
    }
  });

  const box = page.locator('textarea').first();
  await box.fill('Say exactly: STREAM_CHECK');
  await box.press('Enter');
  await page.waitForTimeout(25000);

  const body = await page.locator('body').innerText();
  return {
    geminiEvents: events,
    logs: logs.filter((l) => l.includes('Nexus AI') || l.includes('error')),
    tail: body.slice(-400),
  };
}
