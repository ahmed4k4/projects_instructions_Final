export default async function run(page) {
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
  const failed = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  const bad = [];
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
  });

  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('http://127.0.0.1:5173/ai-advisor', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // Ask a real question.
  const box = page.locator('textarea').first();
  await box.fill('In two sentences: is 32GB of RAM enough for 4K gaming?');
  await box.press('Enter');

  // Wait for the streamed answer to finish (Stop button disappears).
  await page.waitForTimeout(1500);
  const during = await page.locator('body').innerText();

  for (let i = 0; i < 40; i += 1) {
    const stopVisible = await page.getByLabel('Stop generating').count();
    if (stopVisible === 0) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(800);

  const body = await page.locator('body').innerText();
  const paragraphs = await page.locator('div.prose-nexus').allInnerTexts();

  return {
    transportLog: consoleLines.filter((l) => l.includes('[Nexus AI]')),
    errors: consoleLines.filter((l) => l.startsWith('error')),
    failedRequests: failed.slice(0, 5),
    badResponses: bad.slice(0, 5),
    sawTyping: /Stop generating|typing/i.test(during),
    answer: paragraphs.slice(-1)[0]?.slice(0, 400) ?? null,
    bodyTail: body.slice(-600),
  };
}
