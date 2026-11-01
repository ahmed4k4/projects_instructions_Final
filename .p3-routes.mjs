export default async function run(page, ui) {
  const routes = [
    '/',
    '/builder',
    '/builder/ai',
    '/ai-advisor',
    '/prebuilt',
    '/community',
    '/dashboard',
    '/auth',
    '/nope',
  ];
  const out = [];

  for (const route of routes) {
    await page.goto(`http://127.0.0.1:5173${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => ({
      len: document.body.innerText.length,
      h1: document.querySelector('h1')?.textContent?.slice(0, 40) ?? null,
    }));
    out.push(`${route} → len=${r.len} h1=${r.h1}`);
  }

  return out;
}
