export default async function run(page) {
  await page.goto('http://127.0.0.1:5173/builder', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Add a CPU through the UI, then read the summary numbers.
  const addBtn = page.getByRole('button', { name: /Add|إضافة/ }).first();
  await addBtn.click();
  await page.waitForTimeout(900);

  const text = await page.locator('body').innerText();
  const summary = text
    .split('\n')
    .filter((l) => /Total|الإجمالي|\$|US\$/.test(l))
    .slice(0, 8);

  return {
    summaryLines: summary,
    store: await page.evaluate(() => {
      const raw = localStorage.getItem('nexus-build');
      const s = raw ? JSON.parse(raw).state : null;
      return { budget: s?.budget, items: s ? Object.keys(s.items ?? {}) : null };
    }),
  };
}
