export default async function run(page) {
  const results = [];

  for (let i = 0; i < 10; i += 1) {
    await page.goto('http://127.0.0.1:5173/ai-advisor', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    const box = page.locator('textarea').first();
    await box.fill(`Reply with exactly: RUN${i}`);
    await box.press('Enter');

    let answer = '';
    for (let t = 0; t < 45; t += 1) {
      await page.waitForTimeout(1000);
      const body = await page.locator('body').innerText();
      if (/The advisor is unavailable/.test(body)) {
        answer = 'ERROR: ' + (body.split('The advisor is unavailable').pop() ?? '').slice(0, 80);
        break;
      }
      const bubbles = await page.locator('div.prose-nexus').allInnerTexts();
      const last = bubbles.at(-1) ?? '';
      if (last.includes(`RUN${i}`)) {
        answer = 'OK: ' + last.slice(0, 60);
        break;
      }
    }
    results.push(`${i}: ${answer || 'TIMEOUT'}`);
  }

  return results;
}
