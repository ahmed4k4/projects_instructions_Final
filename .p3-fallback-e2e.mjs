export default async function run(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  });

  await page.goto('http://127.0.0.1:5173/ai-advisor', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const box = page.locator('textarea').first();
  await box.fill('Is 32GB enough for 4K gaming?');
  await box.press('Enter');
  await page.waitForTimeout(12000);

  const body = await page.locator('body').innerText();
  return {
    hasFriendlyPanel: /Quota temporarily exhausted|AI is not configured|could not answer/.test(body),
    rawQuotaLeak: /Rate limiter unavailable|supabase/i.test(body),
    panelText: body
      .split('\n')
      .filter((l) => /Quota|retry|Retry|configured|advisor could not/i.test(l))
      .slice(0, 6),
    consoleErrors: errors,
    bodyChars: body.length,
  };
}
