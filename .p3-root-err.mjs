export default async function run(page) {
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 500)}`));
  page.on('pageerror', (e) => logs.push(`PAGEERROR: ${(e.stack || e.message).slice(0, 1200)}`));
  page.on('requestfailed', (r) => logs.push(`REQFAIL: ${r.url().slice(0, 120)}`));

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  return {
    errors: logs.filter((l) => /error|PAGEERROR|REQFAIL|Warn/i.test(l)).slice(0, 8),
    rootHtml: (await page.locator('#root').innerHTML()).slice(0, 300),
  };
}
