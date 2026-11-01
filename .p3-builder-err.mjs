export default async function run(page) {
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 400)}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${(e.stack || e.message).slice(0, 900)}`));

  await page.goto('http://127.0.0.1:5173/builder', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  return {
    logs: logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror')).slice(0, 6),
    mainHtml: (await page.locator('main').innerHTML()).slice(0, 400),
  };
}
